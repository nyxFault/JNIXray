// Brand marks for the three supported decompilers. These are served from
// `public/engines/` (Ghidra's kali icon, IDA's appico.png, Binary Ninja's
// official logo.png) and rendered as <img> so browsers cache them cheaply
// and users see the real product artwork.

import type { DecompEngine } from "../lib/api";

interface IconProps {
  size?: number;
  className?: string;
  title?: string;
}

const SOURCES: Record<DecompEngine, { src: string; label: string }> = {
  ghidra: { src: "/engines/ghidra.svg", label: "Ghidra" },
  ida: { src: "/engines/ida.png", label: "IDA Pro" },
  binja: { src: "/engines/binja.png", label: "Binary Ninja" },
};

function BrandImg({
  engine,
  size = 24,
  className,
  title,
}: IconProps & { engine: DecompEngine }) {
  const meta = SOURCES[engine];
  return (
    <img
      src={meta.src}
      width={size}
      height={size}
      alt={title || meta.label}
      title={title || meta.label}
      draggable={false}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "inline-block",
        userSelect: "none",
      }}
    />
  );
}

export function GhidraIcon(props: IconProps) {
  return <BrandImg engine="ghidra" {...props} />;
}

export function IdaIcon(props: IconProps) {
  return <BrandImg engine="ida" {...props} />;
}

export function BinjaIcon(props: IconProps) {
  return <BrandImg engine="binja" {...props} />;
}

export function EngineIcon({
  engine,
  size = 24,
  className,
  title,
}: IconProps & { engine: DecompEngine }) {
  return (
    <BrandImg engine={engine} size={size} className={className} title={title} />
  );
}
