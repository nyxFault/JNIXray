import Anser from "anser";
import type { ReactNode } from "react";

export function ansiToReact(text: string): ReactNode[] {
  const parts = Anser.ansiToJson(text, {
    json: true,
    remove_empty: true,
    use_classes: false,
  });
  return parts.map((p, i) => {
    const style: React.CSSProperties = {};
    if (p.fg) style.color = `rgb(${p.fg})`;
    if (p.bg) style.backgroundColor = `rgb(${p.bg})`;
    const deco = (p as any).decoration;
    if (deco === "bold") style.fontWeight = 700;
    if (deco === "dim") style.opacity = 0.7;
    if (deco === "italic") style.fontStyle = "italic";
    if (deco === "underline") style.textDecoration = "underline";
    return (
      <span key={i} style={style}>
        {p.content}
      </span>
    );
  });
}
