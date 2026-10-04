import { motion, useReducedMotion } from "motion/react";
import type { Subject } from "../types";
import type { CollapsedChip } from "./cardLayout";
import { subjectColorFor } from "./subjectColors";
import { STATUS_COLORS } from "./statusColors";

interface CollapsedHourChipProps {
  chip: CollapsedChip;
  subjects: Subject[];
  isDimmed: boolean;
  onClick: () => void;
}

/** One lane's worth of evidence inside a collapsed hour, shown as a "+N" strip with its subject's color dot. Clicking it expands the hour again. */
export function CollapsedHourChip({ chip, subjects, isDimmed, onClick }: CollapsedHourChipProps) {
  const reduceMotion = useReducedMotion();
  const color = subjectColorFor(subjects, chip.subjectId);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ x: chip.x, y: chip.y, opacity: isDimmed ? 0.25 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 35 }}
      whileTap={{ scale: 0.95 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
      style={{ left: 0, top: 0, width: chip.width, height: chip.height, background: "var(--surface-2)", borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
      title={`${chip.count} evidence this hour — click to expand`}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color.bg }} />
        +{chip.count}
      </span>
      {chip.hasConflict && <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLORS.conflictRing }} />}
    </motion.button>
  );
}
