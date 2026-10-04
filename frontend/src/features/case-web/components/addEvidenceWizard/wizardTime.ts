import { formatDateTime } from "../../timeUtils";
import type { ClockValue, WizardDraft } from "./wizardTypes";

export function isClockComplete(clock: ClockValue, withSeconds: boolean): boolean {
  if (!clock.hour || !clock.minute) return false;
  if (withSeconds && !clock.second) return false;
  const h = Number(clock.hour);
  const m = Number(clock.minute);
  const s = Number(clock.second || "0");
  if (!Number.isInteger(h) || h < 1 || h > 12) return false;
  if (!Number.isInteger(m) || m < 0 || m > 59) return false;
  if (withSeconds && (!Number.isInteger(s) || s < 0 || s > 59)) return false;
  return true;
}

/**
 * Combines a yyyy-mm-dd date with a 12-hour ClockValue into a Date. Follows
 * this feature's convention (see timeUtils.ts) of treating the digits as
 * literal UTC rather than doing real timezone conversion.
 */
export function clockToDate(dateStr: string, clock: ClockValue): Date | null {
  if (!dateStr || !isClockComplete(clock, false)) return null;
  let h = Number(clock.hour) % 12;
  if (clock.period === "PM") h += 12;
  const m = Number(clock.minute);
  const s = Number(clock.second || "0");
  const iso = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDraftDateTime(dateStr: string, clock: ClockValue): string {
  const date = clockToDate(dateStr, clock);
  return date ? formatDateTime(date.toISOString()) : dateStr;
}

/** Live preview for the Approximate mode, e.g. "2026-10-03 09:45:00 to 2026-10-03 10:15:00". */
export function approximateWindowPreview(draft: WizardDraft): string | null {
  const center = clockToDate(draft.date, draft.approxTime);
  const margin = Number(draft.approxMarginMinutes);
  if (!center || !Number.isFinite(margin) || margin <= 0) return null;
  const earliest = new Date(center.getTime() - margin * 60_000);
  const latest = new Date(center.getTime() + margin * 60_000);
  return `${formatDateTime(earliest.toISOString())} to ${formatDateTime(latest.toISOString())}`;
}

/** One-line formatted time summary for the step 3 summary card, across all three When modes. */
export function summarizeWhen(draft: WizardDraft): string {
  if (!draft.date) return "";

  if (draft.certainty === "exact") {
    return formatDraftDateTime(draft.date, draft.exactTime);
  }
  if (draft.certainty === "approximate") {
    return approximateWindowPreview(draft) ?? formatDraftDateTime(draft.date, draft.approxTime);
  }
  if (draft.certainty === "range") {
    return `${formatDraftDateTime(draft.date, draft.rangeStart)} - ${formatDraftDateTime(draft.date, draft.rangeEnd)}`;
  }
  return draft.date;
}

export function isStep2Valid(draft: WizardDraft): boolean {
  if (!draft.subjectId) return false;
  if (!draft.locationName.trim()) return false;
  if (!draft.date) return false;

  if (draft.certainty === "exact") return isClockComplete(draft.exactTime, true);
  if (draft.certainty === "approximate") {
    return isClockComplete(draft.approxTime, false) && Number(draft.approxMarginMinutes) > 0;
  }
  if (draft.certainty === "range") {
    return isClockComplete(draft.rangeStart, false) && isClockComplete(draft.rangeEnd, false);
  }
  return false;
}
