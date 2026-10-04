// All ISO strings in this feature are authored/displayed as if the "Z"
// suffix were the investigator's local wall-clock time (see mockData.ts).
// We keep that convention here too: a datetime-local input's digits are
// taken literally as the ISO value, with no real timezone conversion.

export interface DerivedTimes {
  eventTime: string;
  earliestPossibleTime: string;
  latestPossibleTime: string;
}

/** "2026-10-03T14:00" or "2026-10-03T14:00:05" -> same digits with a Z suffix. */
function datetimeLocalToIso(value: string): string {
  const hasSeconds = value.length > 16; // "YYYY-MM-DDTHH:mm" is 16 chars
  return hasSeconds ? `${value}Z` : `${value}:00Z`;
}

export function deriveExact(value: string): DerivedTimes {
  const iso = datetimeLocalToIso(value);
  return { eventTime: iso, earliestPossibleTime: iso, latestPossibleTime: iso };
}

export function deriveApproximate(value: string, marginMinutes: number): DerivedTimes {
  const iso = datetimeLocalToIso(value);
  const center = new Date(iso).getTime();
  const margin = Math.max(0, marginMinutes) * 60_000;
  return {
    eventTime: iso,
    earliestPossibleTime: new Date(center - margin).toISOString(),
    latestPossibleTime: new Date(center + margin).toISOString(),
  };
}

export function deriveRange(startValue: string, endValue: string): DerivedTimes {
  const startIso = datetimeLocalToIso(startValue);
  const endIso = datetimeLocalToIso(endValue);
  const midpoint = (new Date(startIso).getTime() + new Date(endIso).getTime()) / 2;
  return {
    eventTime: new Date(midpoint).toISOString(),
    earliestPossibleTime: startIso,
    latestPossibleTime: endIso,
  };
}

/** A span of minutes for labels: "45 min" under an hour, else "1h", "2h 30min". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/** HH:MM, reading the ISO string's own digits (see note above). */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** HH:MM:SS, for exact timestamps where seconds matter. */
export function formatClockWithSeconds(iso: string): string {
  const d = new Date(iso);
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${formatClock(iso)}:${ss}`;
}

/** YYYY-MM-DD, reading the ISO string's own digits. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** YYYY-MM-DD HH:MM or YYYY-MM-DD HH:MM:SS. */
export function formatDateTime(iso: string, includeSeconds = true): string {
  return `${formatDate(iso)} ${includeSeconds ? formatClockWithSeconds(iso) : formatClock(iso)}`;
}

// ADDED: shared with the time ruler, so tick labels always read exactly like the card's own time (seconds for exact, "~" for approximate) instead of a separately-rounded label.
export interface TimedEvidenceLike {
  timeCertainty: "exact" | "approximate" | "range";
  eventTime: string;
  earliestPossibleTime: string;
  latestPossibleTime: string;
}

export function formatEvidenceTimeLabel(e: TimedEvidenceLike): string {
  if (e.timeCertainty === "exact") return formatDateTime(e.eventTime, true);
  if (e.timeCertainty === "range") return `${formatDateTime(e.earliestPossibleTime)} - ${formatDateTime(e.latestPossibleTime)}`;
  return `~${formatDateTime(e.eventTime)}`;
}
