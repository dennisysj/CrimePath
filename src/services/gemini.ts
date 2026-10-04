import { Type } from "@google/genai";
import type { ExtractEvidenceResponse, EvidenceType, TimeCertainty } from "@crimepath/shared";
import { generateJson } from "./geminiClient.js";

const EVIDENCE_TYPES = [
  "witness",
  "cctv",
  "gps",
  "phone",
  "transaction",
  "transit",
  "police",
  "digital",
  "other",
] as const satisfies readonly EvidenceType[];

const TIME_CERTAINTIES = ["exact", "approximate", "range"] as const satisfies readonly TimeCertainty[];

const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    subjectName: {
      type: Type.STRING,
      description:
        "The person/vehicle/phone/entity whose whereabouts this evidence places, as named in the text - the one being seen or tracked, NOT the witness or source reporting it. In 'C saw A at the park', this is A.",
    },
    evidenceType: { type: Type.STRING, enum: [...EVIDENCE_TYPES] },
    event: {
      type: Type.STRING,
      description: "One sentence describing what was observed, close to the source wording.",
    },
    locationName: {
      type: Type.STRING,
      description: "The place mentioned in the text, as named (not geocoded).",
    },
    source: {
      type: Type.STRING,
      description: "Short citation for where this evidence comes from, e.g. 'Witness statement' or 'CCTV camera log'.",
    },
    notes: {
      type: Type.STRING,
      nullable: true,
      description: "Any genuine ambiguity worth flagging to an investigator, else null.",
    },
    timeCertainty: { type: Type.STRING, enum: [...TIME_CERTAINTIES] },
    eventTime: {
      type: Type.STRING,
      description: "Best single-point ISO 8601 datetime estimate (no timezone suffix), midpoint of the range below.",
    },
    earliestPossibleTime: { type: Type.STRING, description: "Earliest plausible ISO 8601 datetime (no timezone suffix)." },
    latestPossibleTime: { type: Type.STRING, description: "Latest plausible ISO 8601 datetime (no timezone suffix)." },
  },
  required: [
    "subjectName",
    "evidenceType",
    "event",
    "locationName",
    "source",
    "notes",
    "timeCertainty",
    "eventTime",
    "earliestPossibleTime",
    "latestPossibleTime",
  ],
};

const SYSTEM_INSTRUCTION = `You are an evidence-extraction assistant for an investigative timeline tool.
Given one raw piece of evidence (a witness statement, CCTV log line, transaction record, etc.),
extract who/where/when it describes. Never decide guilt or claim an event definitely happened -
you are structuring what the source claims, nothing more.

Timing rules - always produce a real, usable window, never leave it vague:
- The user message gives a "Reference date" - anchor any time-of-day with no explicit date to it.
- An exact clock time/timestamp ("09:30", "14:02:11") -> timeCertainty "exact", eventTime =
  earliestPossibleTime = latestPossibleTime = that instant.
- A qualified time ("around 9am", "about noon") -> timeCertainty "approximate", a window of about
  +/-15-30 minutes, with eventTime as the exact midpoint of earliest/latest (so the margin is
  symmetric).
- A vague part of day ("this morning", "late at night") or no time at all -> timeCertainty "range",
  a window spanning that whole period (e.g. morning = 06:00-12:00 on the reference date; if truly
  no time information exists, use the full reference date 00:00-23:59 and say so in notes).
- All three ISO datetimes must have no "Z" or timezone offset suffix - plain "YYYY-MM-DDTHH:mm:ss".

The subject is whoever the evidence places at a time and location - never the witness who reports it.
If a witness is named, mention them in "source" (e.g. "Witness statement from Subject C").

"source" is a short citation phrase (how this evidence reached the investigator), not the
evidenceType category - e.g. evidenceType "cctv" pairs with source like "CCTV camera, north
entrance log". Keep "notes" null unless there's a genuine ambiguity worth flagging.`;

/**
 * Gemini returns wall-clock times with no offset. The rest of the app stores
 * wall-clock times as UTC ("...Z") and displays them with getUTC*, so tag
 * them the same way instead of letting each client guess a timezone.
 */
function asWallClockUtc(value: string): string {
  if (!value || /(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return value;
  return `${value}Z`;
}

interface RawExtraction {
  subjectName: string;
  evidenceType: EvidenceType;
  event: string;
  locationName: string;
  source: string;
  notes: string | null;
  timeCertainty: TimeCertainty;
  eventTime: string;
  earliestPossibleTime: string;
  latestPossibleTime: string;
}

export async function extractEvidenceFromText(
  text: string,
  referenceDate: string = new Date().toISOString().slice(0, 10)
): Promise<ExtractEvidenceResponse> {
  const prompt = `Reference date: ${referenceDate}\nRaw evidence text:\n"""${text}"""`;

  const raw = await generateJson({
    contents: prompt,
    systemInstruction: SYSTEM_INSTRUCTION,
    responseSchema: extractionSchema,
  });
  const parsed = JSON.parse(raw) as RawExtraction;

  return {
    evidence: {
      evidenceType: parsed.evidenceType,
      event: parsed.event,
      source: parsed.source,
      notes: parsed.notes ?? undefined,
      timeCertainty: parsed.timeCertainty,
      eventTime: asWallClockUtc(parsed.eventTime),
      earliestPossibleTime: asWallClockUtc(parsed.earliestPossibleTime),
      latestPossibleTime: asWallClockUtc(parsed.latestPossibleTime),
    },
    extractedSubjectName: parsed.subjectName,
    extractedLocationName: parsed.locationName,
  };
}

// ---------------------------------------------------------------------------
// Crime extraction: the offence itself (what / when / where), not evidence.
// ---------------------------------------------------------------------------

const crimeSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Short name for the offence, e.g. 'Armed robbery at jewellery store'. No suspect names.",
    },
    description: {
      type: Type.STRING,
      description: "One or two sentences of what the report says happened, close to the source wording.",
    },
    locationName: { type: Type.STRING, description: "Where the crime happened, as named in the text (not geocoded)." },
    start: {
      type: Type.STRING,
      description: "When the crime started (or the single moment it happened), ISO 8601 with no timezone suffix.",
    },
    end: {
      type: Type.STRING,
      nullable: true,
      description: "When the crime ended, ISO 8601 with no timezone suffix, or null if the text gives a single moment.",
    },
  },
  required: ["title", "description", "locationName", "start", "end"],
};

const CRIME_SYSTEM_INSTRUCTION = `You are an assistant for an investigative timeline tool.
Given an incident or police report, extract the crime itself: what offence occurred, when, and where.
Never name or imply a culprit and never decide guilt - describe only the offence as reported.

Timing rules:
- The user message gives a "Reference date" - anchor any time-of-day with no explicit date to it.
- Exact times ("09:40", "9:40:15 pm") are used as given, keeping seconds when stated.
- A stated window ("between 9:40 and 10:05", "sometime after closing at 9pm until 6am") -> start and end
  (an end earlier in the day than the start means it crossed midnight - put it on the next day).
- A single moment ("at 10am", "around 10am") -> that start, and end null.
- No time at all -> the whole reference date: start 00:00:00, end 23:59:59.
- All datetimes are plain "YYYY-MM-DDTHH:mm:ss" with no "Z" or offset.`;

interface RawCrime {
  title: string;
  description: string;
  locationName: string;
  start: string;
  end: string | null;
}

export interface CrimeExtraction {
  title: string;
  description: string;
  locationName: string;
  start: string;
  end: string | null;
}

export async function extractCrimeFromText(
  text: string,
  referenceDate: string = new Date().toISOString().slice(0, 10)
): Promise<CrimeExtraction> {
  const raw = await generateJson({
    contents: `Reference date: ${referenceDate}\nIncident report:\n"""${text}"""`,
    systemInstruction: CRIME_SYSTEM_INSTRUCTION,
    responseSchema: crimeSchema,
  });
  const parsed = JSON.parse(raw) as RawCrime;
  return {
    title: parsed.title,
    description: parsed.description,
    locationName: parsed.locationName,
    start: asWallClockUtc(parsed.start),
    end: parsed.end ? asWallClockUtc(parsed.end) : null,
  };
}

const summarySchema = {
  type: Type.OBJECT,
  properties: {
    bullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-6 short, specific insight bullets for an investigator, each one sentence.",
    },
  },
  required: ["bullets"],
};

const SUMMARY_SYSTEM_INSTRUCTION = `You summarize an investigative case's evidence for a human investigator.
Write 3-6 short bullet-point insights, each one sentence, in neutral language - never claim guilt or
that a source is lying, only describe what the evidence shows and where it's inconsistent or thin.
Call out, where relevant: where a subject was seen (places and roughly when), any flagged conflicts
(name the subject and what's inconsistent, without saying who's wrong), unverified witness
statements worth corroborating, and any genuinely notable pattern (e.g. two subjects placed at the
same spot around the same time, several items missing a location). Be specific - name subjects,
places and approximate times rather than speaking in generalities. If there's truly nothing notable
in a category, just omit it rather than inventing a bullet for it.`;

interface SummaryEvidenceInput {
  subjectId: string;
  evidenceType: string;
  event: string;
  location: { name: string };
  eventTime: string;
  reliability?: string;
}

interface SummaryConflictInput {
  evidenceIds: [string, string];
  explanation: string;
  resolvedByUncertainty: boolean;
}

interface SummaryGapInput {
  subjectId: string;
  durationMinutes: number;
}

export async function generateCaseSummary(
  items: SummaryEvidenceInput[],
  subjects: { id: string; name: string }[],
  conflicts: SummaryConflictInput[],
  gaps: SummaryGapInput[]
): Promise<string[]> {
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  const evidenceLines =
    items
      .map((e) => {
        const unverified = e.reliability && e.reliability !== "verified" && e.reliability !== "corroborated";
        return `- [${e.evidenceType}] ${subjectName(e.subjectId)} - ${e.event} (${e.location.name}, ${e.eventTime})${unverified ? " [unverified]" : ""}`;
      })
      .join("\n") || "(no evidence yet)";

  const conflictLines =
    conflicts
      .filter((c) => !c.resolvedByUncertainty)
      .map((c) => `- ${c.explanation}`)
      .join("\n") || "(none)";

  const gapLines =
    gaps.map((g) => `- ${subjectName(g.subjectId)}: ${g.durationMinutes} min unaccounted`).join("\n") || "(none)";

  const prompt = `Evidence:\n${evidenceLines}\n\nUnresolved conflicts:\n${conflictLines}\n\nGaps:\n${gapLines}`;

  const raw = await generateJson({
    contents: prompt,
    systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
    responseSchema: summarySchema,
  });
  const parsed = JSON.parse(raw) as { bullets: string[] };
  return parsed.bullets;
}
