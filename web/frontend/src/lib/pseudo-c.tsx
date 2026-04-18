import clsx from "clsx";

// Small, dependency-free C / HLIL pseudo-code highlighter. Designed for the
// output we get from Ghidra / IDA Hex-Rays / Binary Ninja's HLIL. Picks up on
// JNI-specific types (jobject, _JNIEnv, jbyteArray, …) so the output feels
// at-home next to the rest of JNIXray.

const TYPES = new Set([
  // C / C++
  "void","bool","char","short","int","long","float","double","signed","unsigned",
  "auto","size_t","ssize_t","ptrdiff_t","intptr_t","uintptr_t",
  "int8_t","int16_t","int32_t","int64_t",
  "uint8_t","uint16_t","uint32_t","uint64_t",
  "wchar_t","FILE",
  // JNI
  "jboolean","jbyte","jchar","jshort","jint","jlong","jfloat","jdouble",
  "jobject","jclass","jstring","jarray","jthrowable","jweak","jsize",
  "jbooleanArray","jbyteArray","jcharArray","jshortArray",
  "jintArray","jlongArray","jfloatArray","jdoubleArray","jobjectArray",
  "JNIEnv","JavaVM","jfieldID","jmethodID","jvalue",
  "_JNIEnv","_JavaVM","_jobject","_jclass","_jstring","_jarray",
  "_jbooleanArray","_jbyteArray","_jcharArray","_jshortArray",
  "_jintArray","_jlongArray","_jfloatArray","_jdoubleArray","_jobjectArray",
  "_jthrowable","_jweak",
]);

const KEYWORDS = new Set([
  "if","else","return","while","for","do","break","continue","switch","case","default","goto",
  "static","const","volatile","extern","register","inline","restrict",
  "typedef","sizeof","alignof","_Alignof","_Alignas",
  "struct","union","enum",
  "true","false","null","nullptr","NULL","this",
  "new","delete","throw","try","catch","operator","template","typename","namespace","public","private","protected",
]);

type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "type"
  | "keyword"
  | "fn"
  | "punct"
  | "id"
  | "ws";

interface Tok {
  t: TokenKind;
  v: string;
}

function isIdStart(c: string) {
  return /[A-Za-z_]/.test(c);
}
function isIdCont(c: string) {
  return /[A-Za-z_0-9]/.test(c);
}

function tokenizeLine(line: string): Tok[] {
  const out: Tok[] = [];
  const n = line.length;
  let i = 0;
  while (i < n) {
    const c = line[i];

    // whitespace
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < n && /\s/.test(line[j])) j++;
      out.push({ t: "ws", v: line.slice(i, j) });
      i = j;
      continue;
    }

    // line comment — consume to EOL
    if (c === "/" && line[i + 1] === "/") {
      out.push({ t: "comment", v: line.slice(i) });
      break;
    }

    // block comment — end on */ on the same line, else to EOL
    if (c === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      if (end === -1) {
        out.push({ t: "comment", v: line.slice(i) });
        break;
      }
      out.push({ t: "comment", v: line.slice(i, end + 2) });
      i = end + 2;
      continue;
    }

    // string / char
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (line[j] === "\\" && j + 1 < n) {
          j += 2;
          continue;
        }
        if (line[j] === c) {
          j++;
          break;
        }
        j++;
      }
      out.push({ t: "string", v: line.slice(i, j) });
      i = j;
      continue;
    }

    // numbers (hex, dec, floats, with type suffixes)
    if (/[0-9]/.test(c)) {
      let j = i;
      if (c === "0" && (line[i + 1] === "x" || line[i + 1] === "X")) {
        j = i + 2;
        while (j < n && /[0-9a-fA-F_]/.test(line[j])) j++;
      } else {
        while (j < n && /[0-9_]/.test(line[j])) j++;
        if (line[j] === ".") {
          j++;
          while (j < n && /[0-9_]/.test(line[j])) j++;
        }
        if (j < n && /[eE]/.test(line[j])) {
          j++;
          if (line[j] === "+" || line[j] === "-") j++;
          while (j < n && /[0-9]/.test(line[j])) j++;
        }
      }
      while (j < n && /[uUlLfF]/.test(line[j])) j++;
      out.push({ t: "number", v: line.slice(i, j) });
      i = j;
      continue;
    }

    // identifier / keyword / type / function call
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdCont(line[j])) j++;
      const word = line.slice(i, j);

      let kind: TokenKind;
      if (TYPES.has(word)) {
        kind = "type";
      } else if (KEYWORDS.has(word)) {
        kind = "keyword";
      } else {
        let k = j;
        while (k < n && line[k] === " ") k++;
        kind = line[k] === "(" ? "fn" : "id";
      }

      // Highlight Java_... JNI export symbols as function too, even when
      // they appear on their own line without an immediate '('.
      if (kind === "id" && /^Java_[A-Za-z0-9_]+$/.test(word)) {
        kind = "fn";
      }

      out.push({ t: kind, v: word });
      i = j;
      continue;
    }

    // punctuation / operators — try to eat some common multi-char operators
    // so they stay visually joined.
    const two = line.slice(i, i + 2);
    const three = line.slice(i, i + 3);
    if (three === ">>=" || three === "<<=" || three === "..." || three === "->*") {
      out.push({ t: "punct", v: three });
      i += 3;
      continue;
    }
    if (
      two === "::" || two === "->" || two === "==" || two === "!=" ||
      two === "<=" || two === ">=" || two === "&&" || two === "||" ||
      two === "<<" || two === ">>" || two === "++" || two === "--" ||
      two === "+=" || two === "-=" || two === "*=" || two === "/=" ||
      two === "%=" || two === "&=" || two === "|=" || two === "^="
    ) {
      out.push({ t: "punct", v: two });
      i += 2;
      continue;
    }

    out.push({ t: "punct", v: c });
    i++;
  }
  return out;
}

const CLASSES: Record<TokenKind, string> = {
  comment: "text-slate-500 italic",
  string: "text-emerald-300",
  number: "text-fuchsia-300",
  type: "text-amber-300",
  keyword: "text-violet-300",
  fn: "text-sky-300",
  punct: "text-slate-400",
  id: "text-slate-200",
  ws: "",
};

interface PseudoCProps {
  text: string;
  maxHeightClass?: string;
  className?: string;
}

export function PseudoC({
  text,
  maxHeightClass = "max-h-[460px]",
  className,
}: PseudoCProps) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const gutterWidth = String(lines.length).length;
  return (
    <pre
      className={clsx(
        "font-mono text-[11.5px] leading-[1.55] whitespace-pre overflow-x-auto overflow-y-auto",
        // Deep editor-style backdrop with a subtle brand glow.
        "bg-[#0a0d14] text-slate-200",
        "shadow-[inset_0_0_0_1px_rgba(99,102,241,0.08),inset_0_60px_120px_-60px_rgba(56,189,248,0.08)]",
        maxHeightClass,
        className,
      )}
    >
      <code>
        {lines.map((line, li) => (
          <div key={li} className="flex hover:bg-white/[0.015]">
            <span
              className="select-none text-slate-600 text-right pr-3 pl-2 border-r border-white/[0.04] shrink-0"
              style={{ minWidth: `${gutterWidth + 2}ch` }}
            >
              {li + 1}
            </span>
            <span className="pl-3 pr-3 flex-1 min-w-0">
              {line.length === 0 ? (
                <span>&nbsp;</span>
              ) : (
                tokenizeLine(line).map((tok, ti) => (
                  <span key={ti} className={CLASSES[tok.t]}>
                    {tok.v}
                  </span>
                ))
              )}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
}
