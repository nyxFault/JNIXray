#!/usr/bin/env python3
"""JNI Helper — static APK analyzer.

A pared-down port of https://github.com/evilpan/jni_helper tailored for
JNIXray: no console UI, no multiprocessing pool, no progress bars — just
androguard + pyelftools walking the APK and emitting a single JSON document:

    {
      "ok": true,
      "apk": "/abs/path/to/app.apk",
      "generatedAt": "2026-04-18T07:30:00Z",
      "stats": {
        "classesScanned": 512,
        "nativeClasses":   3,
        "nativeMethods":   7,
        "soFiles":         1,
        "jniSymbols":      8
      },
      "dexInfo": {
        "__COMMON__": [
          {"mangle": "JNI_OnLoad", "ret": "jint",
           "args": ["JavaVM * vm", "void * reserved"]}
        ],
        "com.example.Foo": [
          {"mangle": "Java_com_example_Foo_bar",
           "ret": "jstring",
           "args": ["JNIEnv * env", "jobject thiz", "jint a1"],
           "name": "bar",
           "sig":  "(I)Ljava/lang/String;",
           "static": false,
           "overload": false}
        ]
      },
      "soInfo": {
        "lib/arm64-v8a/libnative-lib.so": {
          "JNI_OnLoad":                 6928,
          "Java_com_example_Foo_bar": 27344
        }
      },
      "warnings": ["..."]
    }

Any fatal error is written into the output file instead of a stack trace so
the Node orchestrator can surface a clean message.

Run as:
    python3 jni_helper.py /path/to/app.apk -o /tmp/jni.json
"""

from __future__ import annotations

import argparse
import json
import sys
import os
import traceback
from collections import Counter
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, Iterator, List, Optional, Tuple
from zipfile import ZipFile

# androguard emits chatty loguru logs on import — quiet them first.
try:
    from loguru import logger as _logger
    _logger.remove()
    _logger.add(sys.stderr, level="ERROR")
except Exception:
    pass


JNI_COMMON = {
    "JNI_OnLoad": ("jint", ["JavaVM * vm", "void * reserved"]),
    "JNI_OnUnload": ("void", ["JavaVM * vm", "void * reserved"]),
}

__COMMON__ = [
    {"mangle": "JNI_OnLoad",
     "ret": "jint",
     "args": ["JavaVM * vm", "void * reserved"]},
    {"mangle": "JNI_OnUnload",
     "ret": "void",
     "args": ["JavaVM * vm", "void * reserved"]},
]


# ---------- JVM descriptor -> JNI C type ------------------------------------

_PRIMS = {
    "V": "void",
    "Z": "boolean",
    "B": "byte",
    "S": "short",
    "C": "char",
    "I": "int",
    "J": "long",
    "F": "float",
    "D": "double",
}


def _prim_to_jni(c: str) -> str:
    name = _PRIMS.get(c)
    if name is None:
        return "void"
    if name == "void":
        return name
    return "j" + name


def jvm_to_jni(atype: str) -> str:
    """Translate a single JVM descriptor (e.g. ``I``, ``Ljava/lang/String;``,
    ``[B``) into a C JNI type (``jint``, ``jstring``, ``jbyteArray`` …)."""
    if not atype:
        return "void"
    first = atype[0]
    if first in _PRIMS:
        return _prim_to_jni(first)
    if first == "L":
        if atype == "Ljava/lang/String;":
            return "jstring"
        if atype == "Ljava/lang/Class;":
            return "jclass"
        if atype == "Ljava/lang/Throwable;":
            return "jthrowable"
        return "jobject"
    if first == "[":
        inner = atype[1:]
        if len(inner) == 1 and inner in _PRIMS:
            return "j" + _PRIMS[inner] + "Array"
        return "jobjectArray"
    return "void"


def _split_params(params: str) -> List[str]:
    """Split the ``(...)`` chunk of a method descriptor into individual JVM
    types, e.g. ``"ILjava/lang/String;[B"`` -> ``["I", "Ljava/lang/String;", "[B"]``."""
    out: List[str] = []
    i, n = 0, len(params)
    while i < n:
        c = params[i]
        if c in _PRIMS:
            out.append(c)
            i += 1
        elif c == "L":
            end = params.index(";", i)
            out.append(params[i:end + 1])
            i = end + 1
        elif c == "[":
            j = i
            while j < n and params[j] == "[":
                j += 1
            if j < n and params[j] == "L":
                end = params.index(";", j)
                out.append(params[i:end + 1])
                i = end + 1
            else:
                out.append(params[i:j + 1])
                i = j + 1
        else:
            i += 1
    return out


# ---------- JNI symbol mangling ---------------------------------------------
# https://docs.oracle.com/en/java/javase/16/docs/specs/jni/design.html

def _mangle_unicode(s: str) -> str:
    out = []
    for ch in s:
        code = ord(ch)
        if 0 <= code < 128:
            out.append(ch)
        else:
            out.append("_%04x" % code)
    return "".join(out)


def _escape(name: str) -> str:
    name = name.replace("_", "_1")
    name = name.replace(";", "_2")
    name = name.replace("[", "_3")
    name = _mangle_unicode(name)
    name = name.replace("/", "_")
    return name


def mangle_jni(jclass: str, method: str, params: List[str], overload: bool) -> str:
    """Return the C symbol that the JVM will look for, e.g.
    ``Java_com_example_Foo_bar`` (or the overload-qualified ``..__I`` form)."""
    short = "Java_" + _escape(jclass + "." + method).replace(".", "_")
    if overload:
        sig = _escape("".join(params))
        return short + "__" + sig
    return short


# ---------- DEX walking -----------------------------------------------------

def _iter_dex_bytes(apk_path: str) -> Iterator[Tuple[str, bytes]]:
    with ZipFile(apk_path) as z:
        for info in z.infolist():
            if info.filename.endswith(".dex"):
                yield info.filename, z.read(info)


def _iter_so_bytes(apk_path: str) -> Iterator[Tuple[str, bytes]]:
    with ZipFile(apk_path) as z:
        for info in z.infolist():
            if not info.filename.endswith(".so"):
                continue
            yield info.filename, z.read(info)


def _elf_java_symbols(data: bytes, warnings: List[str], src: str) -> Dict[str, int]:
    """Return ``{symbol_name: st_value}`` for every dynamically-resolvable
    ``Java_...``/``JNI_On*`` export in the ELF ``data`` blob."""
    try:
        from elftools.elf.elffile import ELFFile
        from elftools.elf.sections import SymbolTableSection
    except Exception as ex:
        warnings.append(
            "pyelftools not installed (%s). Install with: pip install pyelftools" % ex
        )
        return {}
    try:
        elf = ELFFile(BytesIO(data))
    except Exception as ex:
        warnings.append("skip library %s: %s" % (src, ex))
        return {}
    out: Dict[str, int] = {}
    for section in elf.iter_sections():
        if not isinstance(section, SymbolTableSection):
            continue
        for sym in section.iter_symbols():
            e = sym.entry
            if e.st_info.type != "STT_FUNC":
                continue
            if e.st_shndx == "SHN_UNDEF":
                continue
            name = sym.name
            if not name:
                continue
            if name.startswith("Java_") or name in JNI_COMMON:
                out[name] = int(e["st_value"])
    return out


def _scan_dexes(
    apk_path: str,
    warnings: List[str],
) -> Tuple[Dict[str, List[Dict[str, Any]]], int, int, int]:
    """Return (dexInfo, classesScanned, nativeClasses, nativeMethods)."""
    try:
        from androguard.core import dex as dx
        from androguard.core.dex import EncodedMethod
    except Exception as ex:
        warnings.append(
            "androguard not importable (%s). "
            "Install with: pip install 'androguard>=4.1,<5'" % ex
        )
        return {}, 0, 0, 0

    dex_info: Dict[str, List[Dict[str, Any]]] = {}
    classes_scanned = 0
    native_classes = 0
    native_methods = 0

    for dex_name, data in _iter_dex_bytes(apk_path):
        try:
            d = dx.DEX(data)
        except Exception as ex:
            warnings.append("parse %s failed: %s" % (dex_name, ex))
            continue
        for cdef in d.get_classes():
            classes_scanned += 1
            methods = _collect_native_methods(cdef, EncodedMethod)
            if not methods:
                continue
            native_classes += 1
            native_methods += len(methods)
            jclass = str(cdef.get_name()[1:-1].replace("/", "."))
            dex_info.setdefault(jclass, []).extend(methods)

    return dex_info, classes_scanned, native_classes, native_methods


def _collect_native_methods(cdef: Any, EncodedMethodCls: Any) -> List[Dict[str, Any]]:
    raw: List[Tuple[Any, List[str], str, bool]] = []
    for em in cdef.get_methods():
        try:
            flags = em.get_access_flags_string().split()
        except Exception:
            continue
        if "native" not in flags:
            continue
        descriptor = str(em.get_descriptor())
        if not descriptor.startswith("("):
            continue
        try:
            params_str, ret_str = descriptor[1:].rsplit(")", 1)
        except ValueError:
            continue
        params = _split_params(params_str)
        static = "static" in flags
        raw.append((em, params, ret_str, static))

    names = Counter(str(em.name) for em, *_ in raw)
    out: List[Dict[str, Any]] = []
    for em, params, ret_str, static in raw:
        name = str(em.name)
        overload = names[name] > 1
        jclass = str(em.get_class_name()[1:-1].replace("/", "."))
        mangled = mangle_jni(jclass, name, params, overload)

        c_args: List[str] = ["JNIEnv * env"]
        c_args.append("jclass clazz" if static else "jobject thiz")
        for i, p in enumerate(params):
            c_args.append("%s a%d" % (jvm_to_jni(p), i + 1))

        out.append({
            "mangle": mangled,
            "ret": jvm_to_jni(ret_str),
            "args": c_args,
            "name": name,
            "sig": "(%s)%s" % ("".join(params), ret_str),
            "static": static,
            "overload": overload,
        })
    return out


# ---------- entry -----------------------------------------------------------

def build_report(apk_path: str) -> Dict[str, Any]:
    warnings: List[str] = []
    dex_info, classes_scanned, native_classes, native_methods = _scan_dexes(
        apk_path, warnings,
    )

    so_info: Dict[str, Dict[str, int]] = {}
    so_count = 0
    jni_syms = 0
    for so_name, so_bytes in _iter_so_bytes(apk_path):
        so_count += 1
        syms = _elf_java_symbols(so_bytes, warnings, so_name)
        if syms:
            so_info[so_name] = syms
            jni_syms += len(syms)

    dex_info_out: Dict[str, Any] = {"__COMMON__": __COMMON__}
    for cls_name in sorted(dex_info):
        dex_info_out[cls_name] = dex_info[cls_name]

    return {
        "ok": True,
        "apk": os.path.abspath(apk_path),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "classesScanned": classes_scanned,
            "nativeClasses": native_classes,
            "nativeMethods": native_methods,
            "soFiles": so_count,
            "jniSymbols": jni_syms,
        },
        "dexInfo": dex_info_out,
        "soInfo": so_info,
        "warnings": warnings,
    }


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description="Static JNI analyzer (androguard + pyelftools).",
    )
    ap.add_argument("apk", help="path to the APK")
    ap.add_argument("-o", dest="outfile", help="write JSON here (else stdout)")
    args = ap.parse_args(argv)

    try:
        report = build_report(args.apk)
    except Exception:
        report = {
            "ok": False,
            "apk": os.path.abspath(args.apk),
            "error": traceback.format_exc(),
        }

    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.outfile:
        with open(args.outfile, "w", encoding="utf-8") as fh:
            fh.write(payload)
    else:
        sys.stdout.write(payload)
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
