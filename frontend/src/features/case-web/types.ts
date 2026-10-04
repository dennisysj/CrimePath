// Local types for the case-web feature. These intentionally mirror the
// shape of the backend's eventual API but are NOT imported from
// @crimepath/shared — we'll align the two once the real engine is wired up.

import { formatDuration } from "./timeUtils";

export type SubjectKind = "person" | "vehicle" | "phone" | "other";

export interface Subject {
  id: string;
  name: string;
  kind: SubjectKind;
  /** Profile picture (case_subjects.profile_file_url); null/absent shows the name's initial. */
  photoUrl?: string | null;
}

export interface CaseSummary {
  id: string;
  /** Human-facing reference, e.g. CASE-001. */
  caseNumber?: string;
  name: string;
  description?: string;
  status?: string;
}

export type EvidenceType =
  | "witness" // UPDATED line 13-22: enum replaced (was witness/cctv/gps/phone/transaction/transit/police/digital/other)
  | "cctv"
  | "image"
  | "video"
  | "document"
  | "gps"
  | "transaction"
  | "other";

export type TimeCertainty = "exact" | "approximate" | "range";

/**
 * lat/lng are optional: plenty of evidence only has a text location
 * ("somewhere downtown"). Only evidence with a valid pair is mapped — see
 * locationUtils.ts.
 */
export interface EvidenceLocation {
  name: string;
  lat?: number;
  lng?: number;
  /** Where the coordinates came from, e.g. "Image EXIF", "Vehicle GPS". */
  source?: string;
}

/**
 * A document or image attached to a piece of evidence (e.g. a photo of a
 * receipt, a scanned statement, a screenshot of a text thread). previewUrl
 * is an object URL (URL.createObjectURL) for this mock UI — swap for an
 * uploaded-file reference once the real backend has storage.
 */
export interface EvidenceAttachment {
  id: string;
  name: string;
  /** MIME type, e.g. "image/jpeg" or "application/pdf". */
  mimeType: string; // UPDATED line 40: was `type`
  size: number;
  previewUrl: string; // UPDATED line 42: was `dataUrl`
}

// ADDED lines 64-77: involved-party role model, for evidence that names more
// than just its primary subject (e.g. a transaction with a second person
// present, or a CCTV frame mentioning a vehicle).
export type InvolvedRole = "with" | "vehicle_device" | "reported_by" | "mentioned";

export interface InvolvedParty {
  subjectId: string;
  role: InvolvedRole;
}

export const ROLE_LABELS: Record<InvolvedRole, string> = {
  with: "With",
  vehicle_device: "Vehicle / device",
  reported_by: "Reported by",
  mentioned: "Mentioned",
};

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
  involvedParties: InvolvedParty[]; // ADDED line 76: subjects beyond the primary one, each with a role
  /** Investigator-set standing of the event (case_events.reliability). Never an AI score. */
  reliability?: Reliability;
}

/**
 * The offence itself: when and where the crime happened. Not evidence and
 * not tied to a subject — the timeline draws it as a band across every lane
 * so investigators can see which evidence falls inside the crime window.
 */
export interface Crime {
  id: string;
  title: string;
  description: string;
  /** ISO string. When the crime started (or the single moment it happened). */
  start: string;
  /** ISO string, or null for a single point in time / unknown end. */
  end: string | null;
  location: EvidenceLocation;
}

/**
 * How a conflict was detected:
 *  - same_time_different_place / travel_time: deterministic distance vs time check
 *  - statement: AI reading of the accounts (e.g. contradictory witness claims)
 */
export type ConflictKind = "same_time_different_place" | "travel_time" | "statement";

export const CONFLICT_KIND_LABELS: Record<ConflictKind, string> = {
  same_time_different_place: "Same time, different place",
  travel_time: "Impossible travel time",
  statement: "Conflicting statements",
};

/** Short connector/tooltip text: travel numbers when the engine measured them, else the kind label. */
export function conflictShortLabel(c: Pick<Conflict, "kind" | "requiredMinutes" | "availableMinutes">): string {
  if (c.requiredMinutes === null || c.availableMinutes === null) return CONFLICT_KIND_LABELS[c.kind];
  return `needs ~${formatDuration(c.requiredMinutes)} · has ~${formatDuration(c.availableMinutes)}`;
}

/** Badge text for conflict notes, e.g. "Possible conflict · Same time, different place". */
export function conflictBadgeLabel(c: Pick<Conflict, "kind" | "resolvedByUncertainty">): string {
  return c.resolvedByUncertainty
    ? "Compatible within uncertainty window"
    : `Possible conflict · ${CONFLICT_KIND_LABELS[c.kind]}`;
}

/**
 * A conflict between two pieces of evidence for the same subject, as computed
 * by the backend analysis engine.
 *
 * Framing is always neutral: a conflict never implies a source is lying,
 * only that the two accounts may be inconsistent if their reported times
 * and locations are accurate.
 */
export interface Conflict {
  id: string;
  kind: ConflictKind;
  evidenceIds: [string, string];
  /** null for statement conflicts, which have no travel calculation. */
  requiredMinutes: number | null;
  availableMinutes: number | null;
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
  /** Time left unexplained after the estimated travel between the two places. */
  durationMinutes: number;
  elapsedMinutes?: number;
  /** Estimated travel between the two places; null/absent when unknown (no coordinates). */
  travelMinutes?: number | null;
}

/** Estimated travel between a subject's consecutive pieces of evidence at different places. */
export interface TravelLeg {
  id: string;
  subjectId: string;
  evidenceIds: [string, string];
  distanceKm: number;
  travelMinutes: number;
}

/** "1h unaccounted", or "~40 min travel · 20 min unaccounted" when part of the span was travel. */
export function gapShortLabel(g: Pick<Gap, "durationMinutes" | "travelMinutes">): string {
  const unaccounted = `${formatDuration(g.durationMinutes)} unaccounted`;
  return g.travelMinutes ? `~${formatDuration(g.travelMinutes)} travel · ${unaccounted}` : unaccounted;
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
  /** Absent from backends/mock data that don't estimate travel. */
  travelLegs?: TravelLeg[];
  corroborations: Corroboration[];
  aiSuggestions: AiSuggestion[];
}

export type Reliability = "unknown" | "uncertain" | "verified" | "corroborated" | "disputed";

export const RELIABILITY_OPTIONS: Reliability[] = ["unknown", "uncertain", "verified", "corroborated", "disputed"];
