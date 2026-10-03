import { curveMonotoneY, line } from "d3-shape";
import type { Evidence, Subject } from "../types";

export interface ThreadItem {
  evidence: Evidence;
  pos: { x: number; y: number };
}

interface ThreadProps {
  subject: Subject;
  items: ThreadItem[];
  color: string;
  highlighted: boolean;
  dimmed: boolean;
  onSelect: () => void;
}

const SELECTION_GREEN = "#22c55e";

/**
 * A smooth vertical line (time flows top -> bottom) through one subject's
 * evidence. Points are pre-computed by CaseWeb (shared with
 * EvidenceNode/ConnectionLine) so the thread and its nodes always agree on
 * position. A wide invisible path sits on top for an easy click target.
 */
export function Thread({ subject, items, color, highlighted, dimmed, onSelect }: ThreadProps) {
  if (items.length === 0) return null;

  const points: [number, number][] = items.map((item) => [item.pos.x, item.pos.y]);
  const path =
    points.length > 1
      ? line<[number, number]>()
          .x((d) => d[0])
          .y((d) => d[1])
          .curve(curveMonotoneY)(points)
      : null;
  const strokeColor = highlighted ? SELECTION_GREEN : color;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect();
  }

  return (
    <g opacity={dimmed ? 0.2 : 1} className="transition-opacity">
      {path && (
        <>
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={22}
            className="cursor-pointer"
            onClick={handleClick}
          />
          <path
            d={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth={highlighted ? 3 : 2}
            strokeOpacity={highlighted ? 0.95 : 0.55}
            pointerEvents="none"
            style={{ transition: "d 400ms ease, stroke 300ms ease" }}
          />
        </>
      )}
      <text
        x={points[0][0]}
        y={points[0][1] - 18}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill={strokeColor}
        onClick={handleClick}
        className="cursor-pointer select-none font-mono"
      >
        {subject.name}
      </text>
    </g>
  );
}
