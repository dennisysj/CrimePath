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

/** 12-hour display, e.g. "9:45 AM". */
export function formatClockDate(d: Date): string {
  let h = d.getUTCHours();
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m} ${period}`;
}

/** Live preview for the Approximate mode, e.g. "9:45 AM to 10:15 AM". */
export function approximateWindowPreview(draft: WizardDraft): string | null {
  const center = clockToDate(draft.date, draft.approxTime);
  const margin = Number(draft.approxMarginMinutes);
  if (!center || !Number.isFinite(margin) || margin <= 0) return null;
  const earliest = new Date(center.getTime() - margin * 60_000);
  const latest = new Date(center.getTime() + margin * 60_000);
  return `${formatClockDate(earliest)} to ${formatClockDate(latest)}`;
}

function formatClockValueDisplay(clock: ClockValue, withSeconds: boolean): string {
  if (!clock.hour || !clock.minute) return "";
  const sec = withSeconds ? `:${(clock.second || "00").padStart(2, "0")}` : "";
  return `${clock.hour}:${clock.minute.padStart(2, "0")}${sec} ${clock.period}`;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-10-03" -> "Oct 3, 2026", read as plain digits (no timezone parsing). */
export function formatDateLabel(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

/** One-line "formatted time" summary for the step 3 summary card, across all three When modes. */
export function summarizeWhen(draft: WizardDraft): string {
  const dateLabel = formatDateLabel(draft.date);
  if (!dateLabel) return "";

  if (draft.certainty === "exact") {
    return `${formatClockValueDisplay(draft.exactTime, true)} · ${dateLabel}`;
  }
  if (draft.certainty === "approximate") {
    const preview = approximateWindowPreview(draft);
    return preview ? `${preview} · ${dateLabel}` : `${formatClockValueDisplay(draft.approxTime, false)} · ${dateLabel}`;
  }
  if (draft.certainty === "range") {
    return `${formatClockValueDisplay(draft.rangeStart, false)} – ${formatClockValueDisplay(draft.rangeEnd, false)} · ${dateLabel}`;
  }
  return dateLabel;
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
