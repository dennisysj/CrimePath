import type { Subject } from "../types";
import { MARGIN } from "./cardLayout";

interface LaneLabelProps {
  subject: Subject;
  y: number;
}

/** Subject name, pinned to the top-left of its lane. */
export function LaneLabel({ subject, y }: LaneLabelProps) {
  return (
    <div
      className="absolute whitespace-nowrap text-xs font-semibold text-neutral-300"
      style={{ left: MARGIN.left, top: y, transform: "translateY(-50%)" }}
    >
      {subject.name}
    </div>
  );
}
