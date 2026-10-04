import { Siren } from "lucide-react";
import type { Crime } from "../types";
import { formatClock, formatDate } from "../timeUtils";
import { RULER_HEIGHT, type CrimeBand } from "./cardLayout";

interface CrimeBandLayerProps {
  bands: CrimeBand[];
  canvasHeight: number;
  onSelectCrime: (crime: Crime) => void;
}

/** "2026-10-03 09:40–10:05", or with both dates when the window crosses midnight. */
export function crimeWindowLabel(crime: Crime): string {
  const start = `${formatDate(crime.start)} ${formatClock(crime.start)}`;
  if (!crime.end || crime.end === crime.start) return start;
  const sameDay = formatDate(crime.end) === formatDate(crime.start);
  return `${start}–${sameDay ? "" : `${formatDate(crime.end)} `}${formatClock(crime.end)}`;
}

/**
 * The crime window across every lane: a faint amber band between dashed
 * start/end lines, with a clickable label (opens the crime for editing).
 * Evidence cards that sit inside the band fall within the crime window.
 * Drawn under the cards; only the label takes clicks.
 */
export function CrimeBandLayer({ bands, canvasHeight, onSelectCrime }: CrimeBandLayerProps) {
  const lineTop = RULER_HEIGHT;
  const lineHeight = canvasHeight - RULER_HEIGHT;

  return (
    <>
      {bands.map(({ crime, startX, endX }) => (
        <div key={crime.id}>
          {endX !== null && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: startX,
                top: lineTop,
                width: endX - startX,
                height: lineHeight,
                background: "color-mix(in srgb, var(--crime) 9%, transparent)",
              }}
            />
          )}
          {[startX, endX].map((x, i) =>
            x === null ? null : (
              <div
                key={i}
                className="pointer-events-none absolute border-l-2 border-dashed"
                style={{ left: x - 1, top: lineTop, height: lineHeight, borderColor: "var(--crime)", opacity: 0.85 }}
              />
            )
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectCrime(crime);
            }}
            title={`${crime.title} · ${crimeWindowLabel(crime)} · ${crime.location.name}\nClick to edit`}
            className="absolute z-10 flex max-w-[320px] items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold shadow hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
            style={{ left: startX, top: lineTop + 4, background: "var(--crime)", color: "#1a1400" }}
          >
            <Siren size={11} className="flex-shrink-0" />
            <span className="truncate">
              {crime.title} · {formatClock(crime.start)}
              {crime.end && crime.end !== crime.start ? `–${formatClock(crime.end)}` : ""}
            </span>
          </button>
        </div>
      ))}
    </>
  );
}
