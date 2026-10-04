import type { Subject } from "../types";
import { CARD_HEIGHT } from "./cardLayout";
import { subjectColorFor } from "./subjectColors";

interface LaneLabelProps {
  subject: Subject;
  subjects: Subject[];
  y: number;
}

/** One subject's name + color dot, in the fixed left column outside the horizontal scroll area — stays visible while the timeline scrolls. */
export function LaneLabel({ subject, subjects, y }: LaneLabelProps) {
  const color = subjectColorFor(subjects, subject.id);

  return (
    <div className="absolute left-0 flex items-center gap-1.5 px-3 text-xs font-semibold" style={{ top: y, height: CARD_HEIGHT, color: "var(--text)" }}>
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color.bg }} />
      {subject.name}
    </div>
  );
}
