import { Type } from "@google/genai";
import { generateJson } from "./geminiClient.js";
import { distanceKm } from "./geo.js";
import type { Conflict, Evidence, Gap } from "../data/demoCase.js";

const GAP_THRESHOLD_MINUTES = 45;

function minutesBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000;
}

/** Array.sort comparator for ascending event time (earliest first). */
function byEventTime(a: Evidence, b: Evidence): number {
  return new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime();
}

/**
 * Pure arithmetic, no judgment involved - just "was there a span with no
 * evidence for this subject longer than the threshold". No Gemini needed.
 */
export function computeGaps(evidence: Evidence[]): Gap[] {
  const gaps: Gap[] = [];
  const bySubject = new Map<string, Evidence[]>();
  for (const e of evidence) {
    const list = bySubject.get(e.subjectId) ?? [];
    list.push(e);
    bySubject.set(e.subjectId, list);
  }

  for (const [subjectId, items] of bySubject) {
    const sorted = [...items].sort(byEventTime);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const duration = minutesBetween(a.eventTime, b.eventTime);
      if (duration > GAP_THRESHOLD_MINUTES) {
        gaps.push({
          id: `gap-${subjectId}-${i}`,
          subjectId,
          start: a.eventTime,
          end: b.eventTime,
          durationMinutes: Math.round(duration),
        });
      }
    }
  }
  return gaps;
}

const feasibilitySchema = {
  type: Type.OBJECT,
  properties: {
    requiredMinutesEstimate: {
      type: Type.NUMBER,
      description:
        "Your best estimate of how many minutes this specific trip realistically takes, given the distance and " +
        "what's plausible there (on foot, transit, driving - infer from the location names and distance).",
    },
    conflictAtReportedTimes: {
      type: Type.BOOLEAN,
      description: "True if, taking both reported times at face value, there isn't enough time to make this trip.",
    },
    conflictAtBestCase: {
      type: Type.BOOLEAN,
      description:
        "True if, even under the most generous reading of each item's stated time uncertainty, there still " +
        "isn't enough time. False if the uncertainty window could plausibly explain it away.",
    },
    explanation: {
      type: Type.STRING,
      description:
        "One neutral sentence for an investigator. Never say a source is lying or wrong - frame it as 'these " +
        "two accounts may be inconsistent if their reported times and locations are accurate', or, if there's " +
        "no real issue, briefly say why it's compatible.",
    },
  },
  required: ["requiredMinutesEstimate", "conflictAtReportedTimes", "conflictAtBestCase", "explanation"],
};

const SYSTEM_INSTRUCTION = `You judge whether it's physically plausible for the same person/vehicle/phone to have
gone from one piece of evidence to the next, given the real distance and the reported time gap.

You are given the real straight-line distance in km (already computed, trust it) between the two
locations, by name, plus each evidence item's reported time and its stated earliest/latest possible
time (its uncertainty window). Use the location names and context to judge realistic travel mode and
time (walking vs transit vs driving - e.g. two SkyTrain stations suggests transit is available; a
short distance suggests walking is plausible) - straight-line distance alone understates real travel
time, so don't just divide by a single flat speed.

Never claim a source is lying or that an event didn't happen - you're only assessing whether two
claims are consistent with each other given physics, not judging truthfulness.`;

interface FeasibilityResult {
  requiredMinutesEstimate: number;
  conflictAtReportedTimes: boolean;
  conflictAtBestCase: boolean;
  explanation: string;
}

async function judgeFeasibility(a: Evidence, b: Evidence): Promise<FeasibilityResult> {
  const km = distanceKm(a.location, b.location);
  const reportedGapMin = minutesBetween(a.eventTime, b.eventTime);
  const bestCaseGapMin = minutesBetween(a.earliestPossibleTime, b.latestPossibleTime);

  const prompt = `Distance between the two locations: ${km.toFixed(2)} km

Evidence A: "${a.event}" at "${a.location.name}"
  reported time: ${a.eventTime}, stated window: ${a.earliestPossibleTime} to ${a.latestPossibleTime} (${a.timeCertainty})

Evidence B: "${b.event}" at "${b.location.name}"
  reported time: ${b.eventTime}, stated window: ${b.earliestPossibleTime} to ${b.latestPossibleTime} (${b.timeCertainty})

Gap at reported times: ${reportedGapMin.toFixed(1)} minutes.
Gap under the most generous reading of both uncertainty windows: ${bestCaseGapMin.toFixed(1)} minutes.`;

  const raw = await generateJson({
    contents: prompt,
    systemInstruction: SYSTEM_INSTRUCTION,
    responseSchema: feasibilitySchema,
  });
  return JSON.parse(raw) as FeasibilityResult;
}

/**
 * For each subject, checks every consecutive (by reported time) pair of
 * evidence for travel feasibility. Gemini judges plausibility and writes
 * the explanation; the distance and time gaps it's given are real,
 * computed values, not guesses.
 */
export async function computeConflicts(evidence: Evidence[]): Promise<Conflict[]> {
  const bySubject = new Map<string, Evidence[]>();
  for (const e of evidence) {
    const list = bySubject.get(e.subjectId) ?? [];
    list.push(e);
    bySubject.set(e.subjectId, list);
  }

  const pairs: [Evidence, Evidence][] = [];
  for (const items of bySubject.values()) {
    const sorted = [...items].sort(byEventTime);
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push([sorted[i], sorted[i + 1]]);
    }
  }

  const results = await Promise.all(
    pairs.map(async ([a, b]) => {
      try {
        return { a, b, result: await judgeFeasibility(a, b) };
      } catch (err) {
        console.error(`Feasibility check failed for ${a.id} -> ${b.id}:`, err);
        return null;
      }
    })
  );

  const conflicts: Conflict[] = [];
  for (const entry of results) {
    if (!entry || !entry.result.conflictAtReportedTimes) continue;
    const { a, b, result } = entry;
    conflicts.push({
      id: `conflict-${a.id}-${b.id}`,
      evidenceIds: [a.id, b.id],
      requiredMinutes: Math.round(result.requiredMinutesEstimate * 10) / 10,
      availableMinutes: Math.round(minutesBetween(a.eventTime, b.eventTime) * 10) / 10,
      resolvedByUncertainty: !result.conflictAtBestCase,
      explanation: result.explanation,
    });
  }
  return conflicts;
}
