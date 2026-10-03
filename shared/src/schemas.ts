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
}

export interface HealthResponse {
  status: "ok";
}
