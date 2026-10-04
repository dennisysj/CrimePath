import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import type { HourSection, TimeTick } from "./cardLayout";
import { RULER_HEIGHT } from "./cardLayout";

interface TimeRulerProps {
  width: number;
  sections: HourSection[];
  ticks: TimeTick[];
  onToggleSection: (key: string) => void;
}

const HEADER_ROW_HEIGHT = 32;
const TICK_ROW_TOP = HEADER_ROW_HEIGHT + 2;
const CHAR_WIDTH_PX = 5.6; // rough JetBrains Mono width at the tick label's 9px size
const TICK_GAP_PX = 6;

/** Hides a tick if it would visually overlap the previous *visible* one — ticks arrive already sorted left-to-right (column order follows time). */
function dedupeTicks(ticks: TimeTick[]): TimeTick[] {
  const visible: TimeTick[] = [];
  let lastRight = -Infinity;
  for (const t of ticks) {
    if (t.x < lastRight) continue;
    visible.push(t);
    lastRight = t.x + t.label.length * CHAR_WIDTH_PX + TICK_GAP_PX;
  }
  return visible;
}

/** Hour-section headers (click to collapse/expand) + a tick and timestamp above every visible column. Two clearly separated rows; scrolls with the cards since it's rendered inside the horizontal scroll area. */
export function TimeRuler({ width, sections, ticks, onToggleSection }: TimeRulerProps) {
  const reduceMotion = useReducedMotion();
  const visibleTicks = useMemo(() => dedupeTicks(ticks), [ticks]);

  return (
    <div className="relative" style={{ width, height: RULER_HEIGHT, background: "var(--surface-2)" }}>
      {sections.map((s) => {
        // UPDATED lines 39-68: collapsed headers used to show only the abbreviated start time ("9:00"),
        // and the whole button could end up visually empty once the collapsed block (in CardTimeline)
        // was drawn on top of it — see CardTimeline.tsx's fix (block now starts below RULER_HEIGHT).
        // Collapsed headers now always show the FULL range, stacked on two lines when collapsed so the
        // narrow strip never truncates it.
        const [startLabel, endLabel] = s.label.split("–");
        const action = s.collapsed ? "Expand" : "Collapse";
        return (
          <motion.button
            key={s.key}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => onToggleSection(s.key)}
            className="absolute top-0 flex items-center gap-1 rounded px-1.5 text-xs hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
            style={{ left: s.startX, width: s.width, height: HEADER_ROW_HEIGHT, color: "var(--text)" }}
            title={`${action} ${s.label}`}
            aria-label={`${action} ${s.label}`}
          >
            <motion.span
              className="flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
              animate={{ rotate: s.collapsed ? 0 : 180 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              <ChevronRight size={12} />
            </motion.span>
            {s.collapsed ? (
              <span className="flex min-w-0 flex-col justify-center text-[10px] font-medium leading-tight">
                <span>{startLabel}–</span>
                <span>{endLabel}</span>
              </span>
            ) : (
              <span className="whitespace-nowrap font-medium">{s.label}</span>
            )}
            <span
              className="flex-shrink-0 rounded-full px-1 font-mono text-[10px]"
              style={{ background: "var(--surface)", color: "var(--text-muted)" }}
            >
              {s.evidenceCount}
            </span>
            {s.hasConflict && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: "var(--conflict-ring)" }} />}
          </motion.button>
        );
      })}

      {/* ADDED: row 2 for a collapsed hour is otherwise empty (no ticks are generated for collapsed sections) — a centered muted label fills it instead of leaving blank space. */}
      {sections
        .filter((s) => s.collapsed)
        .map((s) => (
          <div
            key={`collapsed-row2-${s.key}`}
            className="absolute flex items-center justify-center font-mono text-[9px]"
            style={{ left: s.startX, width: s.width, top: TICK_ROW_TOP, color: "var(--text-muted)" }}
          >
            collapsed
          </div>
        ))}

      {visibleTicks.map((t, i) => (
        <div key={i} className="absolute flex flex-col items-start" style={{ left: t.x, top: TICK_ROW_TOP }}>
          <div className="h-1.5 w-px" style={{ background: "var(--border-strong)" }} />
          <span className="mt-0.5 whitespace-nowrap font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>
            {t.label}
          </span>
        </div>
      ))}
    </div>
  );
}
