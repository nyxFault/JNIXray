// Decompiler-output enricher.
//
// Every Ghidra / IDA / Binja decompiler emits the JNI entry point with
// opaque parameter types because `Java_…` symbols are plain C functions:
//
//   __int64 __fastcall Java_com_example_Foo_bar(__int64 a1, __int64 a2,
//                                               __int64 a3, int a4)
//
// We *do* know what those types should be — `jni_helper.py` already
// rebuilt them from the DEX (`JNIEnv *env`, `jobject thiz`, then the
// Java-declared args translated to JNI C types). This module rewrites
// the function's signature line in the decompiled text using that info
// and propagates the new parameter names through the function body so
// the pseudo-C reads like hand-written JNI glue.
//
// No other lines are touched, so the output stays 1-to-1 with whatever
// the engine produced.

import type { JniHelperMethod } from "./api";

// ---- helpers -------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pulls "a1" out of "__int64 a1", "param_1" out of "long param_1", etc.
function lastIdent(decl: string): string {
  const m = decl.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  return m ? m[1] : "";
}

// Top-level comma splitter — decompilers rarely put function pointers in
// signatures but we handle depth anyway so we don't split inside `<...>`
// or nested `(...)` argument groups.
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") depth++;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") depth--;
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.length) out.push(buf);
  return out;
}

// Find the first balanced `(...)` after `symbol` occurs in `line`.
// Returns character ranges so we can splice the signature without losing
// the prefix (return type, attrs) or the tail (` {`, trailing comments).
function findSigParens(
  line: string,
  symbol: string,
): { parenStart: number; parenEnd: number } | null {
  const symIdx = line.indexOf(symbol);
  if (symIdx < 0) return null;
  const parenStart = line.indexOf("(", symIdx);
  if (parenStart < 0) return null;
  let depth = 0;
  for (let i = parenStart; i < line.length; i++) {
    const ch = line[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return { parenStart, parenEnd: i };
    }
  }
  return null;
}

// ---- main ----------------------------------------------------------------

export function enrichDecomp(
  text: string,
  method: JniHelperMethod | null | undefined,
): string {
  if (!text || !method || !method.mangle || !method.args?.length) return text;

  const lines = text.split(/\r?\n/);

  // Locate the signature. It starts on the first line that mentions the
  // mangled symbol; the argument list may be on that line or wrapped
  // onto one or more following lines (Ghidra does this when the name
  // is long, e.g.:
  //     void Java_com_fuzzme_app_MainActivity_copyToVulnerableBuffer
  //                    (long *param_1, ...)
  // ). We stitch lines together until the paren depth balances.
  let sigIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(method.mangle)) {
      sigIdx = i;
      break;
    }
  }
  if (sigIdx < 0) return text;

  let combined = lines[sigIdx];
  let endIdx = sigIdx;
  // Keep appending until we've seen at least one '(' AND parens balance.
  while (
    endIdx + 1 < lines.length &&
    (!combined.includes("(") ||
      (combined.match(/\(/g) || []).length >
        (combined.match(/\)/g) || []).length)
  ) {
    endIdx++;
    combined += "\n" + lines[endIdx];
  }

  const span = findSigParens(combined, method.mangle);
  if (!span) return text;

  const prefix = combined.slice(0, span.parenStart);
  const argsRaw = combined.slice(span.parenStart + 1, span.parenEnd);
  const tail = combined.slice(span.parenEnd + 1);

  // Old parameter names, in order, as the decompiler produced them.
  const oldNames = splitTopLevel(argsRaw, ",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(lastIdent);

  // Our enriched decls (already "JNIEnv * env", "jobject thiz", etc.)
  const enriched = method.args.map((a) => a.trim());
  const newNames = enriched.map(lastIdent);

  // Rebuild the signature as a single clean line — we drop calling-
  // convention hints (IDA's `__fastcall`) and any Ghidra line wrapping
  // between the symbol and `(` since the new arg list has real types
  // anyway.
  void prefix;
  const newSig = `${method.ret} ${method.mangle}(${enriched.join(", ")})${tail.trimStart()}`;

  // Build a one-shot rename map so "a1 → env, a3 → a1" doesn't
  // double-apply when old and new names overlap (which is common: the
  // decompiler names the 3rd param `a3`, we want to call it `a1`, and
  // the original `a1` becomes `env`).
  const rename = new Map<string, string>();
  const n = Math.min(oldNames.length, newNames.length);
  for (let i = 0; i < n; i++) {
    if (oldNames[i] && newNames[i] && oldNames[i] !== newNames[i]) {
      rename.set(oldNames[i], newNames[i]);
    }
  }

  const rebuilt = [
    ...lines.slice(0, sigIdx),
    ...newSig.split("\n"),
    ...lines.slice(endIdx + 1),
  ];

  if (rename.size > 0) {
    const pattern = new RegExp(
      `\\b(${Array.from(rename.keys()).map(escapeRegex).join("|")})\\b`,
      "g",
    );
    // Only rename inside the function body, not on the signature lines
    // we just rewrote (otherwise doubles up on `JNIEnv`, etc.).
    const bodyStart = sigIdx + newSig.split("\n").length;
    for (let i = bodyStart; i < rebuilt.length; i++) {
      rebuilt[i] = rebuilt[i].replace(
        pattern,
        (m) => rename.get(m) || m,
      );
    }
  }

  return rebuilt.join("\n");
}
