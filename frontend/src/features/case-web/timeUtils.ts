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
