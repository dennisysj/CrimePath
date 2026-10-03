// Local types for the case-web feature. These intentionally mirror the
// shape of the backend's eventual API but are NOT imported from
// @crimepath/shared — we'll align the two once the real engine is wired up.

export type SubjectKind = "person" | "vehicle" | "phone" | "other";

export interface Subject {
  id: string;
  name: string;
  kind: SubjectKind;
}

export type EvidenceType =
  | "witness"
  | "cctv"
  | "gps"
  | "phone"
  | "transaction"
  | "transit"
  | "police"
  | "digital"
  | "other";

export type TimeCertainty = "exact" | "approximate" | "range";

export interface EvidenceLocation {
  name: string;
  lat: number;
  lng: number;
}

/**
 * A document or image attached to a piece of evidence (e.g. a photo of a
 * receipt, a scanned statement, a screenshot of a text thread). Held as a
 * data URL for this mock UI — swap for an uploaded-file reference once the
 * real backend has storage.
 */
export interface EvidenceAttachment {
  id: string;
  name: string;
  /** MIME type, e.g. "image/jpeg" or "application/pdf". */
  type: string;
  size: number;
  dataUrl: string;
}

export interface Evidence {
  id: string;
  subjectId: string;
  evidenceType: EvidenceType;
  /** ISO string. Best single-point estimate of when the event occurred. */
  eventTime: string;
  /** ISO string. Earliest the event could have occurred, given stated uncertainty. */
  earliestPossibleTime: string;
  /** ISO string. Latest the event could have occurred, given stated uncertainty. */
  latestPossibleTime: string;
  timeCertainty: TimeCertainty;
  location: EvidenceLocation;
  event: string;
  source: string;
  notes?: string;
  attachments?: EvidenceAttachment[];
}

/**
 * A travel/time feasibility conflict between two pieces of evidence for the
 * same subject, as computed by the (future) deterministic engine.
 *
 * Framing is always neutral: a conflict never implies a source is lying,
 * only that the two accounts may be inconsistent if their reported times
 * and locations are accurate.
 */
export interface Conflict {
  id: string;
  evidenceIds: [string, string];
  requiredMinutes: number;
  availableMinutes: number;
  /**
   * true if the conflict only appears when evidence is read at face value
   * (reported times), but disappears under the most generous reading of
   * each item's stated uncertainty window.
   */
  resolvedByUncertainty: boolean;
  explanation: string;
}

/** An unaccounted-for span of time in a subject's timeline. */
export interface Gap {
  id: string;
  subjectId: string;
  /** ISO string */
  start: string;
  /** ISO string */
  end: string;
  durationMinutes: number;
}

/**
 * Two pieces of evidence (typically from different subjects) agreeing in
 * place and time — e.g. a person and their phone both placed at the same
 * location within moments of each other.
 */
export interface Corroboration {
  id: string;
  evidenceIds: [string, string];
  explanation: string;
}

export type AiSuggestionStatus = "pending" | "confirmed" | "dismissed";

/**
 * A connection Gemini proposed between pieces of evidence (e.g. a
 * description mismatch), with its reasoning and a suggested follow-up
 * question for the investigator. Never computed by the deterministic
 * engine, and never a claim of fact until an investigator confirms it.
 */
export interface AiSuggestion {
  id: string;
  evidenceIds: string[];
  reasoning: string;
  suggestedQuestion: string;
  status: AiSuggestionStatus;
}

export interface CaseAnalysis {
  conflicts: Conflict[];
  gaps: Gap[];
  corroborations: Corroboration[];
  aiSuggestions: AiSuggestion[];
}
