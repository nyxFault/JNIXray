#!/usr/bin/env python3
"""Binary Ninja headless pseudo-C decompiler.

Usage:  decomp_binja.py <so_path> <symbol> <out_file>

Environment:
    PYTHONPATH  must include <binja-install>/python so ``import binaryninja``
                resolves. The Node orchestrator takes care of this.
    BN_LICENSE  optional — a JSON license blob. If present we install it via
                ``binaryninja.core_set_license`` before loading anything.
"""
import os
import sys
import traceback


def _write(path, text):
    fh = open(path, "w")
    try:
        fh.write(text)
    finally:
        fh.close()


def _render_pseudo_c(fn):
    """Return a best-effort pseudo-C rendering for ``fn``.

    Binary Ninja doesn't expose a single "pseudo_c" attribute across all
    versions, so we walk HLIL and print each instruction. The HLIL string
    form is already very close to C.
    """
    try:
        params = ", ".join("%s %s" % (p.type, p.name) for p in fn.parameter_vars)
    except Exception:
        params = ""
    ret = getattr(fn, "return_type", None) or "void"
    lines = [u"%s %s(%s) {" % (ret, fn.name, params)]
    try:
        hlil = fn.hlil
        if hlil is not None:
            for block in hlil.basic_blocks:
                for insn in block:
                    lines.append(u"  %s" % str(insn))
    except Exception as ex:
        lines.append(u"  // HLIL unavailable: %s" % ex)
    lines.append(u"}")
    return u"\n".join(lines)


def main():
    if len(sys.argv) != 4:
        sys.stderr.write(__doc__)
        return 2
    so, symbol, out = sys.argv[1], sys.argv[2], sys.argv[3]

    try:
        import binaryninja
    except Exception as ex:
        _write(out, "// binaryninja module not importable: %s" % ex)
        return 1

    lic = os.environ.get("BN_LICENSE")
    if lic:
        try:
            binaryninja.core_set_license(lic)
        except Exception as ex:
            sys.stderr.write("BN_LICENSE ignored: %s\n" % ex)

    try:
        bv = binaryninja.load(so, update_analysis=True)
    except Exception as ex:
        _write(out, "// binja load failed: %s\n// %s" % (ex, traceback.format_exc()))
        return 1
    if bv is None:
        _write(out, "// binja couldn't load %s" % so)
        return 1

    try:
        found = None
        for f in bv.functions:
            if f.name == symbol:
                found = f
                break
        if found is None:
            try:
                syms = bv.get_symbols_by_name(symbol)
            except Exception:
                syms = []
            if syms:
                addr = getattr(syms[0], "address", None)
                if addr is not None:
                    found = bv.get_function_at(addr)
        if found is None:
            _write(out, "// symbol not found: %s" % symbol)
            return 0

        _write(out, _render_pseudo_c(found))
        return 0
    finally:
        try:
            bv.file.close()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
