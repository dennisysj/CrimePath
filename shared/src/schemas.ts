import { z } from "zod";

export const EntityKind = z.enum(["person", "vehicle", "phone", "location", "other"]);
export type EntityKind = z.infer<typeof EntityKind>;

export const EvidenceType = z.enum([
  "witness",
  "cctv",
  "gps",
  "phone",
  "transaction",
  "transit",
  "police",
  "digital",
  "other",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const TimeCertainty = z.enum(["exact", "approximate", "range"]);
export type TimeCertainty = z.infer<typeof TimeCertainty>;

export const ConflictKind = z.enum(["travel", "temporal"]);
export type ConflictKind = z.infer<typeof ConflictKind>;

export const LocationSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type Location = z.infer<typeof LocationSchema>;

export const CaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  incidentDate: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
});
export type Case = z.infer<typeof CaseSchema>;

export const EntitySchema = z.object({
  id: z.string(),
  caseId: z.string(),
  name: z.string(),
  kind: EntityKind,
});
export type Entity = z.infer<typeof EntitySchema>;

export const EvidenceSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  entityIds: z.array(z.string()),
  evidenceType: EvidenceType,
  eventTime: z.string(),
  earliestPossibleTime: z.string(),
  latestPossibleTime: z.string(),
  timeCertainty: TimeCertainty,
  location: LocationSchema,
  event: z.string(),
  source: z.string(),
  notes: z.string().optional(),
  createdAt: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ConflictSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  entityId: z.string(),
  evidenceIds: z.tuple([z.string(), z.string()]),
  kind: ConflictKind,
  availableMinutesBestCase: z.number(),
  availableMinutesAtReportedTimes: z.number(),
  requiredMinutes: z.number(),
  shortfallMinutes: z.number(),
  resolvedByUncertainty: z.boolean(),
  explanation: z.string(),
});
export type Conflict = z.infer<typeof ConflictSchema>;

export const GapSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  entityId: z.string(),
  start: z.string(),
  end: z.string(),
  durationMinutes: z.number(),
});
export type Gap = z.infer<typeof GapSchema>;

// ---- Request / response schemas ----

export const CreateCaseRequestSchema = z.object({
  name: z.string(),
  incidentDate: z.string(),
  description: z.string().optional(),
});
export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;
export type CreateCaseResponse = Case;
export type ListCasesResponse = Case[];
export type GetCaseResponse = Case;

export const CreateEntityRequestSchema = z.object({
  name: z.string(),
  kind: EntityKind,
});
export type CreateEntityRequest = z.infer<typeof CreateEntityRequestSchema>;
export type CreateEntityResponse = Entity;
export type ListEntitiesResponse = Entity[];

export const CreateEvidenceRequestSchema = z.object({
  entityIds: z.array(z.string()),
  evidenceType: EvidenceType,
  eventTime: z.string(),
  earliestPossibleTime: z.string(),
  latestPossibleTime: z.string(),
  timeCertainty: TimeCertainty,
  location: LocationSchema,
  event: z.string(),
  source: z.string(),
  notes: z.string().optional(),
});
export type CreateEvidenceRequest = z.infer<typeof CreateEvidenceRequestSchema>;
export type CreateEvidenceResponse = Evidence;
export type ListEvidenceResponse = Evidence[];

export const Reliability = z.enum(["unknown", "low", "medium", "high"]);
export type Reliability = z.infer<typeof Reliability>;

export const CaseEventSchema = z.object({
  evidence_id: z.string(),
  case_id: z.string(),
  investigator_id: z.string(),
  investigator_name: z.string(),
  evidence_type: z.string(),
  start_datetime: z.string(),
  end_datetime: z.string().nullable(),
  location: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  description: z.string().nullable(),
  source: z.string().nullable(),
  evidence_file_url: z.string().nullable(),
  investigator_notes: z.string().nullable(),
  reliability: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  created_at: z.string(),
});
export type CaseEvent = z.infer<typeof CaseEventSchema>;

export const CreateCaseEventRequestSchema = z.object({
  case_id: z.string().min(1, "Case ID is required"),
  investigator_id: z.string().min(1, "Investigator ID is required"),
  investigator_name: z.string().min(1, "Investigator name is required"),
  evidence_type: z.string().min(1, "Evidence type is required"),
  start_datetime: z.string().datetime("Start date/time must be valid"),
  end_datetime: z.string().datetime("End date/time must be valid").optional(),
  location: z.string().optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  evidence_file_url: z.string().url("Evidence file URL must be valid").optional().or(z.literal("")),
  investigator_notes: z.string().optional(),
  reliability: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateCaseEventRequest = z.infer<typeof CreateCaseEventRequestSchema>;
export type CreateCaseEventResponse = CaseEvent;
export type ListCaseEventsResponse = CaseEvent[];

export interface ListEvidenceQuery {
  entityId?: string;
  from?: string;
  to?: string;
}

export interface NearEvidenceQuery {
  time: string;
  windowMinutes?: number;
}
export type NearEvidenceResponse = Evidence[];

export type ListConflictsResponse = Conflict[];
export type ListGapsResponse = Gap[];

export const ExtractEvidenceRequestSchema = z.object({
  text: z.string(),
});
export type ExtractEvidenceRequest = z.infer<typeof ExtractEvidenceRequestSchema>;

export interface ExtractEvidenceResponse {
  evidence: Partial<Evidence>;
  /**
   * Gemini has no DB access, so it can't resolve a person's name to a real
   * Entity id or a place name to real coordinates - those stay out of
   * `evidence` (entityIds/location are intentionally omitted). These two
   * carry the raw extracted names through so the caller can resolve them
   * (match/create an entity, geocode the place) and let the investigator
   * confirm before anything is persisted.
   */
  extractedSubjectName?: string;
  extractedLocationName?: string;
}

export interface HealthResponse {
  status: "ok";
}
