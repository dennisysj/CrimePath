import { Type } from "@google/genai";
import { generateJson } from "./geminiClient.js";
import { distanceKm, hasCoordinates } from "./geo.js";

/**
 * Case-agnostic conflict + gap detection for GET /api/cases/:caseId/analysis.
 *
 * Two passes, both run on every case:
 *   1. Deterministic: for every subject, every pair of evidence that places
 *      them somewhere is checked against real distance and reported times.
 *      Catches "same time, different place" and "not enough time to travel".
 *   2. Gemini: reads the statements themselves for contradictions the numbers
 *      can't see (text-only places, alibis, witnesses disagreeing on what
 *      happened). Skipped silently if Gemini is unavailable.
 * A conflict always involves two distinct pieces of evidence.
 */

export type ConflictKind = "same_time_different_place" | "travel_time" | "statement";

export interface AnalysisEvidence {
  id: string;
  subjectId: string;
  evidenceType: string;
  eventTime: string;
  earliestPossibleTime: string;
  latestPossibleTime: string;
  timeCertainty: string;
  location: { name: string; lat?: number | null; lng?: number | null };
  event: string;
  source: string;
  notes?: string;
  involvedParties: { subjectId: string; role: string }[];
}

export interface AnalysisSubject {
  id: string;
  name: string;
}

export interface Conflict {
  id: string;
  kind: ConflictKind;
  evidenceIds: [string, string];
  /** Estimated minutes needed to get between the two places; null when not a travel question. */
  requiredMinutes: number | null;
  /** Minutes between the reported times; null when not a travel question. */
  availableMinutes: number | null;
  /** True if the most generous reading of both time windows leaves enough time. */
  resolvedByUncertainty: boolean;
  explanation: string;
}

export interface Gap {
  id: string;
  subjectId: string;
  start: string;
  end: string;
  /** Time not explained by evidence or by travelling between the two places (elapsed − travel). */
  durationMinutes: number;
  elapsedMinutes: number;
  /** Estimated travel between the two places; null when either has no coordinates. */
  travelMinutes: number | null;
}

/** Estimated travel between a subject's consecutive pieces of evidence at different places. */
export interface TravelLeg {
  id: string;
  subjectId: string;
  evidenceIds: [string, string];
  distanceKm: number;
  travelMinutes: number;
}

/** Involved-party roles that physically place that subject at the evidence's time and place. */
const CO_PRESENT_ROLES = new Set(["with", "vehicle_device"]);

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Travel assumptions. Defaults match the ones documented with the demo data; override in .env. */
function analysisConfig() {
  return {
    travelSpeedKmh: envNumber("CONFLICT_TRAVEL_SPEED_KMH", 30),
    travelBufferMinutes: envNumber("CONFLICT_TRAVEL_BUFFER_MINUTES", 15),
    /** Points closer than this are treated as the same place (geocoding noise). */
    samePlaceKm: envNumber("CONFLICT_SAME_PLACE_KM", 0.2),
    gapThresholdMinutes: envNumber("GAP_THRESHOLD_MINUTES", 45),
    /** How long the analysis route waits for Gemini before answering with the deterministic results. */
    aiTimeoutMs: envNumber("CONFLICT_AI_TIMEOUT_MS", 20_000),
  };
}

type AnalysisConfig = ReturnType<typeof analysisConfig>;

const ms = (iso: string) => new Date(iso).getTime();
const minutes = (fromIso: string, toIso: string) => (ms(toIso) - ms(fromIso)) / 60_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Same format as the frontend's formatDuration: "45 min", "1h", "2h 30min". */
function formatDuration(totalMinutes: number): string {
  const total = Math.max(0, Math.round(totalMinutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/** Wall-clock label in the app's UTC-as-local convention, "~" for approximate times. */
function timeLabel(e: AnalysisEvidence): string {
  const clock = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");
  if (e.timeCertainty === "range") return `${clock(e.earliestPossibleTime)}–${clock(e.latestPossibleTime).slice(11)}`;
  return `${e.timeCertainty === "approximate" ? "~" : ""}${clock(e.eventTime)}`;
}

/** Every subject this evidence places at its time and location. */
function placedSubjectIds(e: AnalysisEvidence): string[] {
  const involved = (e.involvedParties ?? []).filter((p) => CO_PRESENT_ROLES.has(p.role)).map((p) => p.subjectId);
  return [...new Set([e.subjectId, ...involved])];
}

function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

function sameReportedMinute(a: AnalysisEvidence, b: AnalysisEvidence): boolean {
  return Math.floor(ms(a.eventTime) / 60_000) === Math.floor(ms(b.eventTime) / 60_000);
}

/**
 * Distance and estimated travel time between two pieces of evidence: null if
 * either place has no coordinates, 0 min if they're effectively the same place.
 */
function estimateTravel(
  a: AnalysisEvidence,
  b: AnalysisEvidence,
  config: AnalysisConfig
): { km: number; minutes: number } | null {
  if (!hasCoordinates(a.location) || !hasCoordinates(b.location)) return null;
  const km = distanceKm(a.location, b.location);
  if (km <= config.samePlaceKm) return { km, minutes: 0 };
  return { km, minutes: (km / config.travelSpeedKmh) * 60 + config.travelBufferMinutes };
}

function travelConflict(
  a: AnalysisEvidence,
  b: AnalysisEvidence,
  subjectName: string,
  config: AnalysisConfig
): Conflict | null {
  const travel = estimateTravel(a, b, config);
  if (!travel || travel.minutes === 0) return null;
  const { km, minutes: required } = travel;

  const [first, second] = ms(a.eventTime) <= ms(b.eventTime) ? [a, b] : [b, a];
  const available = minutes(first.eventTime, second.eventTime);
  if (available >= required) return null;

  const bestCase = minutes(first.earliestPossibleTime, second.latestPossibleTime);
  const resolvedByUncertainty = bestCase >= required;
  const sameTime = sameReportedMinute(first, second);

  const placed =
    `Evidence places ${subjectName} at ${first.location.name} (${timeLabel(first)}) and at ` +
    `${second.location.name} (${timeLabel(second)}), about ${km.toFixed(1)} km apart.`;
  const timing = sameTime
    ? ` They are reported at the same time, but getting between these places takes an estimated ${formatDuration(required)}.`
    : ` They are ${formatDuration(available)} apart, but getting between these places takes an estimated ${formatDuration(required)}.`;
  const verdict = resolvedByUncertainty
    ? ` Allowing for each item's stated time uncertainty (up to ${formatDuration(bestCase)} apart), the two accounts could still be compatible.`
    : ` Even allowing for each item's stated time uncertainty (at most ${formatDuration(bestCase)} apart), these accounts may be inconsistent if their reported times and locations are accurate.`;

  const [idA, idB] = [first.id, second.id];
  return {
    id: `conflict-${pairKey(idA, idB).replace("|", "-")}`,
    kind: sameTime ? "same_time_different_place" : "travel_time",
    evidenceIds: [idA, idB],
    requiredMinutes: round1(required),
    availableMinutes: round1(available),
    resolvedByUncertainty,
    explanation: placed + timing + verdict,
  };
}

/** Deterministic pass: every pair of evidence that places the same subject somewhere. */
export function computeTravelConflicts(evidence: AnalysisEvidence[], subjects: AnalysisSubject[]): Conflict[] {
  const config = analysisConfig();
  const nameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? "the subject";

  const bySubject = new Map<string, AnalysisEvidence[]>();
  for (const e of evidence) {
    for (const subjectId of placedSubjectIds(e)) {
      bySubject.set(subjectId, [...(bySubject.get(subjectId) ?? []), e]);
    }
  }

  const found = new Map<string, Conflict>();
  for (const [subjectId, items] of bySubject) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const key = pairKey(items[i].id, items[j].id);
        if (found.has(key)) continue;
        const conflict = travelConflict(items[i], items[j], nameOf(subjectId), config);
        if (conflict) found.set(key, conflict);
      }
    }
  }
  return [...found.values()];
}

/** Each subject's own evidence (their timeline lane), in time order. */
function consecutivePairs(evidence: AnalysisEvidence[]): { subjectId: string; a: AnalysisEvidence; b: AnalysisEvidence }[] {
  const bySubject = new Map<string, AnalysisEvidence[]>();
  for (const e of evidence) bySubject.set(e.subjectId, [...(bySubject.get(e.subjectId) ?? []), e]);
  return [...bySubject].flatMap(([subjectId, items]) => {
    const sorted = [...items].sort((x, y) => ms(x.eventTime) - ms(y.eventTime));
    return sorted.slice(0, -1).map((a, i) => ({ subjectId, a, b: sorted[i + 1] }));
  });
}

/** Estimated travel for each consecutive pair at different places (both with coordinates). */
export function computeTravelLegs(evidence: AnalysisEvidence[]): TravelLeg[] {
  const config = analysisConfig();
  return consecutivePairs(evidence).flatMap(({ subjectId, a, b }) => {
    const travel = estimateTravel(a, b, config);
    if (!travel || travel.minutes === 0) return [];
    return [
      {
        id: `leg-${a.id}-${b.id}`,
        subjectId,
        evidenceIds: [a.id, b.id] as [string, string],
        distanceKm: round1(travel.km),
        travelMinutes: round1(travel.minutes),
      },
    ];
  });
}

/**
 * Time a subject's evidence leaves unexplained: the span between consecutive
 * items minus the estimated travel between their places, when longer than the
 * configured threshold. Travel longer than the span is a conflict, not a gap.
 */
export function computeGaps(evidence: AnalysisEvidence[]): Gap[] {
  const config = analysisConfig();
  return consecutivePairs(evidence).flatMap(({ subjectId, a, b }) => {
    const elapsed = minutes(a.eventTime, b.eventTime);
    const travel = estimateTravel(a, b, config);
    const unaccounted = elapsed - (travel?.minutes ?? 0);
    if (unaccounted <= config.gapThresholdMinutes) return [];
    return [
      {
        id: `gap-${a.id}-${b.id}`,
        subjectId,
        start: a.eventTime,
        end: b.eventTime,
        durationMinutes: round1(unaccounted),
        elapsedMinutes: round1(elapsed),
        travelMinutes: travel ? round1(travel.minutes) : null,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Gemini pass: contradictions in what the statements say
// ---------------------------------------------------------------------------

const statementSchema = {
  type: Type.OBJECT,
  properties: {
    conflicts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          evidenceA: { type: Type.STRING, description: "Ref of the first item, e.g. 'E1'." },
          evidenceB: { type: Type.STRING, description: "Ref of the second, different item." },
          explanation: {
            type: Type.STRING,
            description:
              "One or two neutral sentences for an investigator naming what the two items disagree on. " +
              "Never say a source is lying - frame it as the accounts possibly being inconsistent.",
          },
        },
        required: ["evidenceA", "evidenceB", "explanation"],
      },
    },
  },
  required: ["conflicts"],
};

const STATEMENT_SYSTEM_INSTRUCTION = `You review evidence in an investigation timeline and flag pairs of items whose
claims contradict each other. You only compare what the sources claim; never decide guilt or truthfulness.

Flag a pair when, if both items were accurate, they could not both be true. For example:
- they place the same subject in different places at overlapping times, including places that are only
  described in text or have no coordinates (judge whether two place names are actually the same place);
- one item says a subject was somewhere else, or somewhere for a period, that another item contradicts;
- witness accounts disagree about when or where something happened, what happened, or who was there.

Do not flag: accounts that are compatible, one being vaguer than the other, differences in appearance
or clothing, or anything listed under "Already flagged". Every pair must be two different refs from the
list. Return an empty list when nothing genuinely conflicts.`;

interface RawStatementConflict {
  evidenceA: string;
  evidenceB: string;
  explanation: string;
}

function describeForPrompt(e: AnalysisEvidence, ref: string, nameOf: (id: string) => string): string {
  const placed = placedSubjectIds(e).map(nameOf).join(", ");
  const coords = hasCoordinates(e.location) ? ` (${e.location.lat.toFixed(5)}, ${e.location.lng.toFixed(5)})` : " (no coordinates)";
  return [
    `${ref}: ${e.evidenceType} from "${e.source}", about ${nameOf(e.subjectId)}; places: ${placed}`,
    `  time: ${e.eventTime} (${e.timeCertainty}, window ${e.earliestPossibleTime} to ${e.latestPossibleTime})`,
    `  place: ${e.location.name}${coords}`,
    `  says: "${e.event}"`,
    e.notes ? `  notes: "${e.notes}"` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function computeStatementConflicts(
  evidence: AnalysisEvidence[],
  subjects: AnalysisSubject[],
  alreadyFlagged: Conflict[]
): Promise<Conflict[]> {
  if (evidence.length < 2) return [];
  const nameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;
  const refs = evidence.map((_, i) => `E${i + 1}`);
  const idByRef = new Map(refs.map((ref, i) => [ref, evidence[i].id]));
  const refById = new Map(evidence.map((e, i) => [e.id, refs[i]]));

  const flaggedLines = alreadyFlagged.map((c) => `${refById.get(c.evidenceIds[0])} & ${refById.get(c.evidenceIds[1])}`);
  const prompt = [
    "Evidence:",
    ...evidence.map((e, i) => describeForPrompt(e, refs[i], nameOf)),
    "",
    `Already flagged: ${flaggedLines.length > 0 ? flaggedLines.join("; ") : "none"}`,
  ].join("\n");

  const raw = await generateJson({ contents: prompt, systemInstruction: STATEMENT_SYSTEM_INSTRUCTION, responseSchema: statementSchema });
  const parsed = JSON.parse(raw) as { conflicts?: RawStatementConflict[] };
  const flagged = new Set(alreadyFlagged.map((c) => pairKey(...c.evidenceIds)));

  const results = new Map<string, Conflict>();
  for (const item of parsed.conflicts ?? []) {
    const aId = idByRef.get(item.evidenceA?.trim());
    const bId = idByRef.get(item.evidenceB?.trim());
    if (!aId || !bId || aId === bId) continue;
    const key = pairKey(aId, bId);
    if (flagged.has(key) || results.has(key)) continue;
    const [first, second] = [aId, bId].sort((x, y) => ms(evidence.find((e) => e.id === x)!.eventTime) - ms(evidence.find((e) => e.id === y)!.eventTime));
    results.set(key, {
      id: `conflict-statement-${key.replace("|", "-")}`,
      kind: "statement",
      evidenceIds: [first, second],
      requiredMinutes: null,
      availableMinutes: null,
      resolvedByUncertainty: false,
      explanation: item.explanation,
    });
  }
  return [...results.values()];
}

/** Gemini results per case, reused until the evidence they were computed from changes. */
const statementCache = new Map<string, { signature: string; result: Promise<Conflict[]> }>();

function statementConflictsCached(
  caseId: string,
  evidence: AnalysisEvidence[],
  subjects: AnalysisSubject[],
  alreadyFlagged: Conflict[]
): Promise<Conflict[]> {
  const signature = JSON.stringify([evidence, subjects.map((s) => [s.id, s.name]), alreadyFlagged.map((c) => c.id)]);
  const cached = statementCache.get(caseId);
  if (cached?.signature === signature) return cached.result;

  const result = computeStatementConflicts(evidence, subjects, alreadyFlagged).catch((error) => {
    console.warn("AI statement-conflict check skipped:", error instanceof Error ? error.message : error);
    statementCache.delete(caseId);
    return [] as Conflict[];
  });
  statementCache.set(caseId, { signature, result });
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]);
}

export async function computeCaseAnalysis(
  caseId: string,
  evidence: AnalysisEvidence[],
  subjects: AnalysisSubject[]
): Promise<{ conflicts: Conflict[]; gaps: Gap[]; travelLegs: TravelLeg[] }> {
  const travel = computeTravelConflicts(evidence, subjects);
  const statements = await withTimeout(
    statementConflictsCached(caseId, evidence, subjects, travel),
    analysisConfig().aiTimeoutMs,
    [] as Conflict[]
  );
  return {
    conflicts: [...travel, ...statements],
    gaps: computeGaps(evidence),
    travelLegs: computeTravelLegs(evidence),
  };
}
