import { useEffect, useState } from "react";
import type { Evidence } from "../types";
import { formatClock } from "../timeUtils";

interface EvidenceNodeProps {
  evidence: Evidence;
  pos: { x: number; y: number };
  yEarliest: number;
  yLatest: number;
  color: string;
  highlighted: boolean;
  dimmed: boolean;
  /** True for a short window after this evidence was added, so it pops in instead of appearing instantly. */
  justAdded?: boolean;
  onSelect: () => void;
}

const EVIDENCE_TYPE_LABEL: Record<Evidence["evidenceType"], string> = {
  witness: "Witness",
  cctv: "CCTV",
  gps: "GPS",
  phone: "Phone",
  transaction: "Transaction",
  transit: "Transit",
  police: "Police",
  digital: "Digital",
  other: "Other",
};

const SELECTION_GREEN = "#22c55e";

/**
 * Exact evidence renders as a dot. Approximate/range evidence also gets a
 * translucent vertical bar from earliest -> latest (time runs top to
 * bottom), with the dot still marking the best-estimate eventTime within it.
 */
export function EvidenceNode({
  evidence,
  pos,
  yEarliest,
  yLatest,
  color,
  highlighted,
  dimmed,
  justAdded,
  onSelect,
}: EvidenceNodeProps) {
  // A just-added node starts scaled to 0 (invisible) and pops up to full
  // size on the next frame, with an overshoot so it visibly "pops" rather
  // than just fading or growing linearly into place.
  const [entered, setEntered] = useState(!justAdded);

  useEffect(() => {
    if (!justAdded) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [justAdded]);

  const showUncertaintyBar = evidence.timeCertainty !== "exact" && yLatest - yEarliest > 2;
  const fillColor = highlighted ? SELECTION_GREEN : color;
  const radius = highlighted ? 14 : 11;
  const tooltip = [
    `${EVIDENCE_TYPE_LABEL[evidence.evidenceType]} · ${formatClock(evidence.eventTime)}`,
    evidence.location.name,
    evidence.source,
  ].join("\n");

  return (
    <g
      opacity={dimmed ? 0.2 : 1}
      className="cursor-pointer transition-opacity duration-500"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <g
        style={{
          transform: entered ? "scale(1)" : "scale(0)",
          transformOrigin: `${pos.x}px ${pos.y}px`,
          transition: justAdded
            ? "transform 550ms cubic-bezier(0.34, 1.56, 0.64, 1)"
            : undefined,
        }}
      >
        {showUncertaintyBar && (
          <rect
            x={pos.x - 7}
            y={yEarliest}
            width={14}
            height={Math.max(2, yLatest - yEarliest)}
            rx={7}
            fill={fillColor}
            opacity={0.22}
          />
        )}
        <circle cx={pos.x} cy={pos.y} r={radius} fill={fillColor} stroke="#0a0a0a" strokeWidth={2}>
          <title>{tooltip}</title>
        </circle>
      </g>
    </g>
  );
}
