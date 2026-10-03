import type { ScaleTime } from "d3-scale";
import { formatClock } from "../timeUtils";

interface TimeAxisProps {
  /** Time scale, mapped to the vertical axis — earliest at top, latest at bottom. */
  y: ScaleTime<number, number>;
  /** Horizontal position of the axis line; tick labels sit to its left. */
  x: number;
}

export function TimeAxis({ y, x }: TimeAxisProps) {
  const [rangeStart, rangeEnd] = y.range();
  const ticks = y.ticks(10);

  return (
    <g>
      <line x1={x} y1={rangeStart} x2={x} y2={rangeEnd} stroke="#404040" strokeWidth={1} />
      {ticks.map((tick, i) => (
        <g key={i} transform={`translate(${x}, ${y(tick)})`}>
          <line x2={-6} stroke="#404040" strokeWidth={1} />
          <text
            x={-12}
            dy="0.32em"
            textAnchor="end"
            fontSize={10}
            fill="#a3a3a3"
            className="select-none font-mono"
          >
            {formatClock(tick.toISOString())}
          </text>
        </g>
      ))}
    </g>
  );
}
