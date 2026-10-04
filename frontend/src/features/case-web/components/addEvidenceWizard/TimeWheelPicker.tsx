import { useEffect, useRef } from "react";
import type { ClockPeriod, ClockValue } from "./wizardTypes";

interface TimeWheelPickerProps {
  value: ClockValue;
  onChange: (next: ClockValue) => void;
  withSeconds: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES_OR_SECONDS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const PERIODS: ClockPeriod[] = ["AM", "PM"];

/**
 * Hour / minute / [second] / AM-PM scroll-wheel columns. Each column is
 * just a controlled view of the same ClockValue that ClockFields (the
 * typed inputs) reads and writes — so placing both side by side gets
 * two-way sync for free, with no extra wiring.
 */
export function TimeWheelPicker({ value, onChange, withSeconds }: TimeWheelPickerProps) {
  return (
    <div className="relative flex items-center gap-1.5 rounded-md border p-1.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      {/* UPDATED line 23: rgba was (47,91,234) — matches new --accent #3D6AF2 */}
      <div className="pointer-events-none absolute inset-x-1.5 top-1/2 h-7 -translate-y-1/2 rounded border" style={{ borderColor: "var(--accent)", background: "rgba(61,106,242,0.06)" }} />
      <WheelColumn options={HOURS} value={value.hour || HOURS[0]} onChange={(h) => onChange({ ...value, hour: h })} />
      <span style={{ color: "var(--text-muted)" }}>:</span>
      <WheelColumn
        options={MINUTES_OR_SECONDS}
        value={value.minute || "00"}
        onChange={(m) => onChange({ ...value, minute: m })}
      />
      {withSeconds && (
        <>
          <span style={{ color: "var(--text-muted)" }}>:</span>
          <WheelColumn
            options={MINUTES_OR_SECONDS}
            value={value.second || "00"}
            onChange={(s) => onChange({ ...value, second: s })}
          />
        </>
      )}
      <WheelColumn
        options={PERIODS}
        value={value.period}
        onChange={(p) => onChange({ ...value, period: p as ClockPeriod })}
      />
    </div>
  );
}

interface WheelColumnProps {
  options: string[];
  value: string;
  onChange: (next: string) => void;
}

const ITEM_HEIGHT = 28;
const VISIBLE_ITEMS = 3;
const VIEWPORT_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const SCROLL_END_DEBOUNCE_MS = 100;

function WheelColumn({ options, value, onChange }: WheelColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMounted = useRef(false);

  const selectedIndex = Math.max(0, options.indexOf(value));

  // Keep the wheel's scroll position in sync whenever `value` changes from
  // outside (typed input, or a parent default) — instantly on first mount,
  // smoothly after that. If the wheel itself just caused the change, it's
  // already sitting at this position, so this is a no-op.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const targetTop = selectedIndex * ITEM_HEIGHT;
    if (!hasMounted.current) {
      el.scrollTop = targetTop;
      hasMounted.current = true;
      return;
    }
    if (Math.abs(el.scrollTop - targetTop) > 1) {
      el.scrollTo({ top: targetTop, behavior: "smooth" });
    }
  }, [selectedIndex]);

  function handleScroll() {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const index = Math.min(Math.max(Math.round(el.scrollTop / ITEM_HEIGHT), 0), options.length - 1);
      const next = options[index];
      if (next !== value) onChange(next);
    }, SCROLL_END_DEBOUNCE_MS);
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ height: VIEWPORT_HEIGHT, scrollSnapType: "y mandatory", scrollbarWidth: "none", borderColor: "var(--border)", background: "var(--bg)" }}
      className="w-11 overflow-y-scroll rounded border [&::-webkit-scrollbar]:hidden"
    >
      <div style={{ height: ITEM_HEIGHT }} />
      {options.map((opt) => (
        <div
          key={opt}
          onClick={() => onChange(opt)}
          style={{ height: ITEM_HEIGHT, scrollSnapAlign: "center", color: opt === value ? "var(--accent)" : "var(--text-muted)", fontWeight: opt === value ? 600 : 400 }}
          className="flex cursor-pointer items-center justify-center font-mono text-sm transition-colors hover:brightness-110"
        >
          {opt}
        </div>
      ))}
      <div style={{ height: ITEM_HEIGHT }} />
    </div>
  );
}
