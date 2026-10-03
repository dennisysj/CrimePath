interface GapSegmentProps {
  x: number;
  y1: number;
  y2: number;
  durationMinutes: number;
  dimmed: boolean;
}

/** Hatched vertical segment on a subject's thread marking unaccounted-for time. */
export function GapSegment({ x, y1, y2, durationMinutes, dimmed }: GapSegmentProps) {
  const height = Math.max(2, y2 - y1);

  return (
    <g opacity={dimmed ? 0.2 : 1} className="transition-opacity">
      <rect x={x - 6} y={y1} width={12} height={height} rx={4} fill="url(#gap-hatch)" opacity={0.85} />
      <text
        x={x + 20}
        y={(y1 + y2) / 2}
        dy="0.32em"
        textAnchor="start"
        fontSize={10}
        fill="#737373"
        className="select-none font-mono"
      >
        {Math.round(durationMinutes)} min unaccounted
      </text>
    </g>
  );
}
