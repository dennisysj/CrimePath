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
      description: "The person/vehicle/phone/entity this evidence is about, as named in the text.",
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

"source" is a short citation phrase (how this evidence reached the investigator), not the
evidenceType category - e.g. evidenceType "cctv" pairs with source like "CCTV camera, north
entrance log". Keep "notes" null unless there's a genuine ambiguity worth flagging.`;

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
      eventTime: parsed.eventTime,
      earliestPossibleTime: parsed.earliestPossibleTime,
      latestPossibleTime: parsed.latestPossibleTime,
    },
    extractedSubjectName: parsed.subjectName,
    extractedLocationName: parsed.locationName,
  };
}
