import type { Subject } from "../types";
import { CARD_HEIGHT } from "./cardLayout";
import { SubjectAvatar } from "./SubjectAvatar";

interface LaneLabelProps {
  subject: Subject;
  subjects: Subject[];
  y: number;
  /** Lane height — taller than one card when the lane stacks same-time items. */
  height?: number;
}

/** One subject's picture (or initial) above their name, in the fixed left column outside the horizontal scroll area — stays visible while the timeline scrolls. */
export function LaneLabel({ subject, subjects, y, height = CARD_HEIGHT }: LaneLabelProps) {
  return (
    <div
      className="absolute inset-x-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-xs font-semibold"
      style={{ top: y, height, color: "var(--text)" }}
    >
      <SubjectAvatar subject={subject} subjects={subjects} size={44} />
      <span className="line-clamp-2 break-words leading-tight">{subject.name}</span>
    </div>
  );
}
