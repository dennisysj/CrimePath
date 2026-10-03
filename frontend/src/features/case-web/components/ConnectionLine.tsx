interface Pos {
  x: number;
  y: number;
}

export type ConnectionKind =
  | "conflict"
  | "conflict-resolved"
  | "corroboration"
  | "ai-pending"
  | "ai-confirmed";

interface ConnectionLineProps {
  a: Pos;
  b: Pos;
  kind: ConnectionKind;
  highlighted: boolean;
  dimmed: boolean;
}

const STYLE: Record<
  ConnectionKind,
  { stroke: string; dash?: string; width: number; opacity: number }
> = {
  conflict: { stroke: "#ef4444", width: 2.5, opacity: 0.9 },
  "conflict-resolved": { stroke: "#a3a3a3", dash: "6 4", width: 2, opacity: 0.85 },
  corroboration: { stroke: "#a3a3a3", dash: "2 4", width: 1.5, opacity: 0.6 },
  "ai-pending": { stroke: "#c084fc", dash: "5 5", width: 2, opacity: 0.85 },
  "ai-confirmed": { stroke: "#c084fc", width: 2.5, opacity: 0.9 },
};

const SELECTION_GREEN = "#22c55e";

/**
 * Curved connector between two evidence nodes. Styling always stays
 * neutral — red/dashed/etc. communicate "may be inconsistent" or
 * "AI-suggested," never a claim that anyone is lying.
 */
export function ConnectionLine({ a, b, kind, highlighted, dimmed }: ConnectionLineProps) {
  const style = STYLE[kind];
  const stroke = highlighted ? SELECTION_GREEN : style.stroke;
  const midY = (a.y + b.y) / 2;
  const bow = Math.min(60, Math.abs(b.y - a.y) * 0.25 + 20);
  const midX = Math.max(a.x, b.x) + bow;
  const d = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;

  return (
    <g opacity={dimmed ? 0.15 : 1} className="transition-opacity">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={highlighted ? style.width + 1 : style.width}
        strokeOpacity={highlighted ? 1 : style.opacity}
        strokeDasharray={style.dash}
      />
      {kind === "conflict-resolved" && (
        <text
          x={midX + 6}
          y={midY}
          dy="0.32em"
          fontSize={9}
          textAnchor="start"
          fill={highlighted ? SELECTION_GREEN : "#a3a3a3"}
          className="select-none font-mono"
        >
          compatible within uncertainty window
        </text>
      )}
    </g>
  );
}
