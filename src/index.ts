import cors from "cors";
import express from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { HealthResponse } from "@crimepath/shared";
import { ExtractEvidenceRequestSchema } from "@crimepath/shared";
import { assertDatabaseConfigured, pool } from "./db.js";
import { extractImageMetadata, extractImageMetadataFromBuffer } from "./services/extractImageMetadata.js";
import { extractCrimeFromText, extractEvidenceFromText } from "./services/gemini.js";

const app = express();
app.use(cors());
// Attachments travel as base64 data URLs (up to 8MB each on the client), so
// an evidence item with a few attachments needs well over the default limit.
app.use(express.json({ limit: "50mb" }));

/*
 * Data model (see db/schema.sql)
 *
 * What the UI calls one "evidence item" (a card on the timeline) is one
 * case_events row — what reportedly happened — plus:
 *   - one evidence row: the logical source ("Witness A Interview"), linked
 *     through event_evidence
 *   - one evidence_attachments row per uploaded file of that evidence
 *   - one event_subjects row per case subject involved; the first is the
 *     primary subject the card belongs to
 * The item's API id is the event_id.
 */

// ---------------------------------------------------------------------------
// Vocabulary: UI codes <-> data-dictionary values
// ---------------------------------------------------------------------------

const EvidenceTypeSchema = z.enum(["witness", "cctv", "image", "video", "document", "gps", "transaction", "other"]);
type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

/** evidence.evidence_type values from the data dictionary. */
const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  image: "Photo",
  video: "Video",
  cctv: "CCTV",
  document: "Document",
  witness: "Witness Statement",
  gps: "GPS",
  transaction: "Transaction",
  other: "Other",
};

const EVIDENCE_TYPE_BY_LABEL: Record<string, EvidenceType> = {
  ...Object.fromEntries(Object.entries(EVIDENCE_TYPE_LABEL).map(([code, label]) => [label, code as EvidenceType])),
  // Codes stored before the data dictionary.
  witness: "witness",
  cctv: "cctv",
  image: "image",
  video: "video",
  document: "document",
  gps: "gps",
  transaction: "transaction",
  other: "other",
  phone: "other",
  transit: "other",
  police: "document",
  digital: "document",
};

function evidenceTypeFromDb(value: string | null | undefined): EvidenceType {
  return (value && EVIDENCE_TYPE_BY_LABEL[value]) || "other";
}

/** case_events.event_type for each kind of source. */
const EVENT_TYPE_BY_EVIDENCE: Record<EvidenceType, string> = {
  witness: "Statement",
  cctv: "Observation",
  image: "Observation",
  video: "Observation",
  gps: "Movement",
  transaction: "Transaction",
  document: "Other",
  other: "Other",
};

/**
 * case_events.event_type of the crime itself (when/where the offence
 * happened). Stored with no subjects or evidence; the timeline draws it as
 * a band across every lane.
 */
const CRIME_EVENT_TYPE = "Crime";

const ReliabilitySchema = z.enum(["unknown", "uncertain", "verified", "corroborated", "disputed"]);

const SubjectKindSchema = z.enum(["person", "vehicle", "phone", "other"]);
type SubjectKind = z.infer<typeof SubjectKindSchema>;

const InvolvedRoleSchema = z.enum(["with", "vehicle_device", "reported_by", "mentioned"]);
type InvolvedRole = z.infer<typeof InvolvedRoleSchema>;

/** event_subjects.subject_role for a subject that is simply part of the event. */
const ROLE_BY_KIND: Record<SubjectKind, string> = {
  person: "Person of Interest",
  vehicle: "Vehicle",
  phone: "Device",
  other: "Other",
};
const KIND_ROLES = new Set([...Object.values(ROLE_BY_KIND), "Person"]);

function roleForInvolved(role: InvolvedRole, kind: SubjectKind): string {
  if (role === "reported_by") return "Witness";
  if (role === "mentioned") return "Unknown";
  if (role === "vehicle_device") return kind === "vehicle" ? "Vehicle" : "Device";
  return ROLE_BY_KIND[kind];
}

function involvedRoleFromDb(subjectRole: string): InvolvedRole {
  if (subjectRole === "Witness") return "reported_by";
  if (subjectRole === "Unknown") return "mentioned";
  if (subjectRole === "Vehicle" || subjectRole === "Device") return "vehicle_device";
  return "with";
}

/** subject_id prefixes: PER-001, VEH-001, DEV-001, OTH-001. */
const SUBJECT_ID_PREFIX: Record<SubjectKind, string> = {
  person: "PER",
  vehicle: "VEH",
  phone: "DEV",
  other: "OTH",
};

/** case_subjects.subject_type (WHAT the subject is) for each UI kind. */
const SUBJECT_TYPE_BY_KIND: Record<SubjectKind, string> = {
  person: "Person",
  vehicle: "Vehicle",
  phone: "Device",
  other: "Other",
};

function kindFromSubjectType(type: string | null): SubjectKind {
  if (type === "Person") return "person";
  if (type === "Vehicle") return "vehicle";
  if (type === "Device") return "phone";
  return "other"; // Organization, Location, Other
}

/** evidence_attachments.attachment_type from a MIME type. */
function attachmentTypeFor(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/zip|tar|rar|7z|gzip|compressed/.test(mime)) return "archive";
  if (mime.startsWith("text/") || /pdf|msword|officedocument|rtf|opendocument/.test(mime)) return "document";
  return "other";
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const TimeCertaintySchema = z.enum(["exact", "approximate", "range"]);

const AttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  previewUrl: z.string(),
});
type AttachmentInput = z.infer<typeof AttachmentSchema>;

const EvidenceItemSchema = z.object({
  subjectId: z.string().min(1),
  evidenceType: EvidenceTypeSchema,
  eventTime: z.string().datetime(),
  earliestPossibleTime: z.string().datetime(),
  latestPossibleTime: z.string().datetime(),
  timeCertainty: TimeCertaintySchema,
  /** Coordinates are optional: a typed-in or AI-extracted place is geocoded from its name when possible. */
  location: z.object({
    name: z.string().min(1),
    lat: z.number().finite().nullish(),
    lng: z.number().finite().nullish(),
  }),
  event: z.string().min(1),
  source: z.string().min(1),
  notes: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  involvedParties: z.array(z.object({ subjectId: z.string().min(1), role: InvolvedRoleSchema })).default([]),
  /** Omitted on edits from the wizard, which doesn't show it: keeps the stored value. */
  reliability: ReliabilitySchema.optional(),
});
type EvidenceItemInput = z.infer<typeof EvidenceItemSchema>;

const CreateSubjectSchema = z.object({
  name: z.string().trim().min(1),
  kind: SubjectKindSchema,
});

const UpdateSubjectSchema = CreateSubjectSchema.partial();

const CreateCaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const UpdateCaseSchema = z.object({
  name: z.string().trim().min(1).optional(),
  /** null clears the description. */
  description: z.string().nullable().optional(),
  status: z.enum(["open", "closed", "archived"]).optional(),
});

const ExtractUploadedMetadataSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().optional(),
  dataUrl: z.string().min(1),
});

const UuidSchema = z.string().uuid();

const FALLBACK_USER = {
  id: "local-investigator",
  name: "Local Investigator",
};

// ---------------------------------------------------------------------------
// Seed data (POST /api/dev/seed-sample-case)
// ---------------------------------------------------------------------------

const PLACEHOLDER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const sampleCaseSubjects = [
  { id: "PER-001", name: "Person A", kind: "person" },
  { id: "PER-002", name: "Person B", kind: "person" },
  { id: "VEH-001", name: "Vehicle A", kind: "vehicle" },
  { id: "DEV-001", name: "Phone A", kind: "phone" },
] as const;

const sampleCaseEvidence: EvidenceItemInput[] = [
  {
    subjectId: "PER-001",
    evidenceType: "document",
    eventTime: "2026-10-03T08:10:00Z",
    earliestPossibleTime: "2026-10-03T08:00:00Z",
    latestPossibleTime: "2026-10-03T08:20:00Z",
    timeCertainty: "approximate",
    location: { name: "Downtown Vancouver", lat: 49.2827, lng: -123.1207 },
    event: "Interview notes: Person A said they were driving around downtown before heading to Burnaby.",
    source: "Interview notes",
    involvedParties: [],
  },
  {
    subjectId: "VEH-001",
    evidenceType: "gps",
    eventTime: "2026-10-03T08:35:10Z",
    earliestPossibleTime: "2026-10-03T08:35:10Z",
    latestPossibleTime: "2026-10-03T08:35:10Z",
    timeCertainty: "exact",
    location: { name: "Kingsway near Royal Oak", lat: 49.2195, lng: -123.0062 },
    event: "Fleet tracker ping for Vehicle A; rental record shows Person A as the driver.",
    source: "Vehicle GPS tracker",
    involvedParties: [{ subjectId: "PER-001", role: "with" }],
  },
  {
    subjectId: "PER-001",
    evidenceType: "witness",
    eventTime: "2026-10-03T08:42:00Z",
    earliestPossibleTime: "2026-10-03T08:32:00Z",
    latestPossibleTime: "2026-10-03T08:52:00Z",
    timeCertainty: "approximate",
    location: { name: "Royal Oak Station", lat: 49.2156, lng: -123.0089 },
    event: "I think I saw Person A near Royal Oak Station, though I wasn't watching the clock.",
    source: "Witness #3",
    involvedParties: [],
  },
  {
    subjectId: "PER-002",
    evidenceType: "document",
    eventTime: "2026-10-03T08:55:12Z",
    earliestPossibleTime: "2026-10-03T08:55:12Z",
    latestPossibleTime: "2026-10-03T08:55:12Z",
    timeCertainty: "exact",
    location: { name: "Edmonds Station", lat: 49.2017, lng: -122.9607 },
    event: "Carrier records show Person B's phone connecting to a tower near Edmonds Station.",
    source: "Phone record",
    involvedParties: [],
  },
  {
    subjectId: "PER-001",
    evidenceType: "witness",
    eventTime: "2026-10-03T09:00:00Z",
    earliestPossibleTime: "2026-10-03T08:45:00Z",
    latestPossibleTime: "2026-10-03T09:15:00Z",
    timeCertainty: "approximate",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033 },
    event: "A witness reported seeing Person A wearing a red jacket near Metrotown.",
    source: "Witness #1",
    involvedParties: [],
  },
  {
    subjectId: "DEV-001",
    evidenceType: "gps",
    eventTime: "2026-10-03T09:05:00Z",
    earliestPossibleTime: "2026-10-03T09:04:00Z",
    latestPossibleTime: "2026-10-03T09:06:00Z",
    timeCertainty: "approximate",
    location: { name: "Bonsor Park", lat: 49.2246, lng: -122.9958 },
    event: "Single location-services fix recovered from an unattributed phone found at the scene.",
    source: "Phone GPS",
    involvedParties: [],
  },
  {
    subjectId: "PER-001",
    evidenceType: "transaction",
    eventTime: "2026-10-03T09:20:31Z",
    earliestPossibleTime: "2026-10-03T09:20:31Z",
    latestPossibleTime: "2026-10-03T09:20:31Z",
    timeCertainty: "exact",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033 },
    event: "Card transaction recorded at a shop in Metrotown; the register log also notes a second person present.",
    source: "Transaction",
    involvedParties: [{ subjectId: "PER-002", role: "with" }],
    attachments: [{ id: "seed-receipt", name: "receipt.jpg", mimeType: "image/png", size: 84213, previewUrl: PLACEHOLDER_IMAGE }],
  },
  {
    subjectId: "PER-002",
    evidenceType: "transaction",
    eventTime: "2026-10-03T09:45:02Z",
    earliestPossibleTime: "2026-10-03T09:45:02Z",
    latestPossibleTime: "2026-10-03T09:45:02Z",
    timeCertainty: "exact",
    location: { name: "Kingsway & Willingdon", lat: 49.223, lng: -123.018 },
    event: "Compass Card tap recorded for Person B near Kingsway & Willingdon.",
    source: "Transit tap",
    involvedParties: [],
  },
  {
    subjectId: "PER-001",
    evidenceType: "cctv",
    eventTime: "2026-10-03T10:00:04Z",
    earliestPossibleTime: "2026-10-03T10:00:04Z",
    latestPossibleTime: "2026-10-03T10:00:04Z",
    timeCertainty: "exact",
    location: { name: "Brentwood Town Centre", lat: 49.2694, lng: -123.0074 },
    event: "Camera 12 footage shows an individual matching Person A's description, wearing a blue hoodie, near Brentwood Town Centre.",
    source: "CCTV cam 12",
    involvedParties: [],
    attachments: [
      { id: "seed-cctv-1", name: "cctv_frame_1.jpg", mimeType: "image/png", size: 152004, previewUrl: PLACEHOLDER_IMAGE },
      { id: "seed-cctv-2", name: "cctv_frame_2.jpg", mimeType: "image/png", size: 148820, previewUrl: PLACEHOLDER_IMAGE },
    ],
  },
  {
    subjectId: "PER-002",
    evidenceType: "witness",
    eventTime: "2026-10-03T10:05:00Z",
    earliestPossibleTime: "2026-10-03T09:55:00Z",
    latestPossibleTime: "2026-10-03T10:15:00Z",
    timeCertainty: "approximate",
    location: { name: "Near Edmonds", lat: 49.2, lng: -122.95 },
    event: "A neighbour reported seeing Person B walking near Edmonds.",
    source: "Witness #4",
    involvedParties: [],
  },
  {
    subjectId: "PER-001",
    evidenceType: "witness",
    eventTime: "2026-10-03T10:12:00Z",
    earliestPossibleTime: "2026-10-03T10:07:00Z",
    latestPossibleTime: "2026-10-03T10:17:00Z",
    timeCertainty: "approximate",
    location: { name: "Commercial-Broadway Station", lat: 49.2626, lng: -123.0699 },
    event: "A witness reported seeing someone matching Person A's description near the Commercial-Broadway platform.",
    source: "Witness #2",
    involvedParties: [],
  },
  {
    subjectId: "PER-001",
    evidenceType: "image",
    eventTime: "2026-10-03T10:31:22Z",
    earliestPossibleTime: "2026-10-03T10:31:22Z",
    latestPossibleTime: "2026-10-03T10:31:22Z",
    timeCertainty: "exact",
    location: { name: "Burnaby Mountain (SFU)", lat: 49.27880833333333, lng: -122.91800555555557 },
    event: "Photo uploaded as evidence; EXIF GPS places the camera near SFU Burnaby campus.",
    source: "Uploaded photo",
    involvedParties: [],
    attachments: [{ id: "seed-photo-1", name: "IMG_2660.jpg", mimeType: "image/png", size: 2310455, previewUrl: PLACEHOLDER_IMAGE }],
  },
  {
    subjectId: "VEH-001",
    evidenceType: "gps",
    eventTime: "2026-10-03T10:40:00Z",
    earliestPossibleTime: "2026-10-03T10:40:00Z",
    latestPossibleTime: "2026-10-03T10:40:00Z",
    timeCertainty: "exact",
    location: { name: "Metrotown parkade", lat: 49.2275, lng: -123.0005 },
    event: "Fleet tracker ping for Vehicle A parked at Metrotown; no driver identified.",
    source: "Vehicle GPS tracker",
    involvedParties: [],
  },
];

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = [
  path.resolve(serverDir, "../db/schema.sql"),
  path.resolve(serverDir, "../../db/schema.sql"),
].find((candidate) => existsSync(candidate));

/**
 * Uploaded media is saved here, next to the existing sample images
 * (CrimePath/src/images), and its metadata is read from the saved file.
 * evidence_attachments.file_url stores "src/images/<file name>".
 */
const IMAGES_DIR =
  [path.resolve(serverDir, "images"), path.resolve(serverDir, "../../src/images")].find((candidate) =>
    existsSync(candidate)
  ) ?? path.resolve(serverDir, "images");
const IMAGES_URL_PREFIX = "src/images/";

/** A safe, unused file name in IMAGES_DIR for an upload called `original`. */
function availableFileName(original: string): string {
  const parsed = path.parse(path.basename(original));
  const base = parsed.name.replace(/[^\w.\- ]+/g, "_").trim() || "upload";
  const ext = parsed.ext.replace(/[^\w.]+/g, "");
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? `${base}${ext}` : `${base}-${n}${ext}`;
    if (!existsSync(path.join(IMAGES_DIR, candidate))) return candidate;
  }
}

/** Write an uploaded data: URL into IMAGES_DIR; returns the stored file name. */
async function saveUpload(originalName: string, dataUrl: string): Promise<string> {
  await mkdir(IMAGES_DIR, { recursive: true });
  const stored = availableFileName(originalName);
  await writeFile(path.join(IMAGES_DIR, stored), dataUrlToBuffer(dataUrl));
  return stored;
}

/** "…/api/images/<name>" or "src/images/<name>" -> "<name>" if that file exists in IMAGES_DIR. */
function storedFileName(reference: string): string | null {
  const match = /(?:\/api\/images\/|^src\/images\/)([^/?#]+)$/.exec(reference);
  if (!match) return null;
  const name = path.basename(decodeURIComponent(match[1]));
  return existsSync(path.join(IMAGES_DIR, name)) ? name : null;
}

/** Every write runs as this user; the history triggers read it into changed_by_*. */
async function setActor(client: PoolClient, actor = FALLBACK_USER) {
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.user_name', $2, true)", [
    actor.id,
    actor.name,
  ]);
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setActor(client);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Thrown inside a route to send a specific status + message. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sendError(res: express.Response, error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: error instanceof Error ? `${fallback}: ${error.message}` : fallback });
}

/** case_events.title: the first sentence of the description, as a short timeline label. */
function eventTitle(description: string): string {
  const first = description.trim().split(/(?<=[.!?])\s+/)[0];
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

/**
 * File properties for evidence_attachments: metadata (image width/height,
 * camera, GPS, ...) and captured_at, read from the file's EXIF. captured_at
 * keeps the camera clock's digits as UTC, the convention used for all times
 * in this app (see frontend timeUtils.ts).
 */
async function fileMetadata(file: { name: string; mimeType: string; dataUrl: string }) {
  if (!file.mimeType.startsWith("image/")) return { metadata: {}, capturedAt: null as string | null };
  try {
    const m = await extractImageMetadataFromBuffer(dataUrlToBuffer(file.dataUrl), file.name);
    return {
      metadata: {
        width: m.width,
        height: m.height,
        cameraMake: m.cameraMake,
        cameraModel: m.cameraModel,
        software: m.software,
        latitude: m.latitude,
        longitude: m.longitude,
      },
      capturedAt: m.capturedAt ? `${m.capturedAt}Z` : null,
    };
  } catch {
    return { metadata: {}, capturedAt: null };
  }
}

/** Same as fileMetadata, but read from a file saved in IMAGES_DIR. */
async function storedFileMetadata(storedName: string, mimeType: string) {
  if (!mimeType.startsWith("image/")) return { metadata: {}, capturedAt: null as string | null };
  try {
    const m = await extractImageMetadata(path.join(IMAGES_DIR, storedName));
    return {
      metadata: {
        width: m.width,
        height: m.height,
        cameraMake: m.cameraMake,
        cameraModel: m.cameraModel,
        software: m.software,
        latitude: m.latitude,
        longitude: m.longitude,
      },
      capturedAt: m.capturedAt ? `${m.capturedAt}Z` : null,
    };
  } catch {
    return { metadata: {}, capturedAt: null };
  }
}

/** The reported time's uncertainty is a property of the source's account, so it lives on each evidence row. */
function timeMetadata(input: EvidenceItemInput) {
  return {
    timeCertainty: input.timeCertainty,
    earliestPossibleTime: input.earliestPossibleTime,
    latestPossibleTime: input.latestPossibleTime,
  };
}

async function loadSubject(client: PoolClient, caseId: string, subjectId: string) {
  const result = await client.query<{ subject_name: string | null; subject_type: string | null }>(
    "SELECT subject_name, subject_type FROM case_subjects WHERE case_id = $1 AND subject_id = $2",
    [caseId, subjectId]
  );
  if (result.rowCount === 0) throw new HttpError(400, `Subject "${subjectId}" does not exist in this case`);
  const row = result.rows[0];
  return { name: row.subject_name ?? subjectId, kind: kindFromSubjectType(row.subject_type) };
}

async function assertEventInCase(client: PoolClient, caseId: string, eventId: string) {
  if (!UuidSchema.safeParse(eventId).success) throw new HttpError(404, "Evidence not found");
  const result = await client.query("SELECT 1 FROM case_events WHERE case_id = $1 AND event_id = $2", [caseId, eventId]);
  if (result.rowCount === 0) throw new HttpError(404, "Evidence not found");
}

/** The event_subjects rows an item should have: primary subject first, then involved parties. */
async function desiredEventSubjects(client: PoolClient, caseId: string, input: EvidenceItemInput) {
  const primary = await loadSubject(client, caseId, input.subjectId);
  const rows = [{ subjectId: input.subjectId, name: primary.name, role: ROLE_BY_KIND[primary.kind] }];
  for (const party of input.involvedParties) {
    if (party.subjectId === input.subjectId || rows.some((r) => r.subjectId === party.subjectId)) continue;
    const subject = await loadSubject(client, caseId, party.subjectId);
    rows.push({ subjectId: party.subjectId, name: subject.name, role: roleForInvolved(party.role, subject.kind) });
  }
  return rows;
}

/**
 * Make an event's event_subjects match the item. The primary row is updated
 * in place, so moving an event to another subject is recorded as a "subject"
 * change by trg_event_subject_history.
 */
async function syncEventSubjects(client: PoolClient, caseId: string, eventId: string, input: EvidenceItemInput) {
  const desired = await desiredEventSubjects(client, caseId, input);
  const existing = await client.query<{ event_subject_id: string; subject_id: string }>(
    "SELECT event_subject_id::text, subject_id FROM event_subjects WHERE event_id = $1 ORDER BY event_subject_id",
    [eventId]
  );
  const [primaryRow, ...otherRows] = existing.rows;
  const [primary, ...others] = desired;

  if (primaryRow) {
    await client.query(
      `UPDATE event_subjects SET subject_id = $2, subject_name = $3, subject_role = $4
       WHERE event_subject_id = $1 AND (subject_id, subject_name, subject_role) IS DISTINCT FROM ($2, $3, $4)`,
      [primaryRow.event_subject_id, primary.subjectId, primary.name, primary.role]
    );
  } else {
    await client.query(
      "INSERT INTO event_subjects (event_id, subject_id, subject_name, subject_role) VALUES ($1, $2, $3, $4)",
      [eventId, primary.subjectId, primary.name, primary.role]
    );
  }

  const wanted = new Map(others.map((o) => [o.subjectId, o]));
  for (const row of otherRows) {
    const match = wanted.get(row.subject_id);
    if (!match) {
      await client.query("DELETE FROM event_subjects WHERE event_subject_id = $1", [row.event_subject_id]);
      continue;
    }
    await client.query(
      `UPDATE event_subjects SET subject_name = $2, subject_role = $3
       WHERE event_subject_id = $1 AND (subject_name, subject_role) IS DISTINCT FROM ($2, $3)`,
      [row.event_subject_id, match.name, match.role]
    );
    wanted.delete(row.subject_id);
  }
  for (const party of wanted.values()) {
    await client.query(
      "INSERT INTO event_subjects (event_id, subject_id, subject_name, subject_role) VALUES ($1, $2, $3, $4)",
      [eventId, party.subjectId, party.name, party.role]
    );
  }
}

/** Insert the item's logical evidence row and link it to the event. */
async function insertEvidence(client: PoolClient, caseId: string, eventId: string, input: EvidenceItemInput) {
  const result = await client.query<{ evidence_id: string }>(
    `
      INSERT INTO evidence (case_id, evidence_type, title, description, source, metadata, added_by_id, added_by_name)
      VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)
      RETURNING evidence_id::text
    `,
    [
      caseId,
      EVIDENCE_TYPE_LABEL[input.evidenceType],
      input.source,
      input.source,
      timeMetadata(input),
      FALLBACK_USER.id,
      FALLBACK_USER.name,
    ]
  );
  const evidenceId = result.rows[0].evidence_id;
  await client.query(
    "INSERT INTO event_evidence (event_id, evidence_id, relationship_type) VALUES ($1, $2, 'supports')",
    [eventId, evidenceId]
  );
  return evidenceId;
}

/** One uploaded file -> one evidence_attachments row. */
async function insertAttachment(client: PoolClient, evidenceId: string, file: AttachmentInput) {
  // Files are normally already in src/images (uploaded via POST /api/uploads);
  // a data: URL is saved there now. Either way the metadata is read from disk.
  const stored = file.previewUrl.startsWith("data:")
    ? await saveUpload(file.name, file.previewUrl)
    : storedFileName(file.previewUrl);
  if (!stored) {
    throw new HttpError(400, `Attachment "${file.name}" has no uploaded file.`);
  }
  const { metadata, capturedAt } = await storedFileMetadata(stored, file.mimeType);
  await client.query(
    `
      INSERT INTO evidence_attachments (
        evidence_id, attachment_type, file_name, file_type, file_size, file_url, metadata, captured_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [evidenceId, attachmentTypeFor(file.mimeType), file.name, file.mimeType, file.size, `${IMAGES_URL_PREFIX}${stored}`, metadata, capturedAt]
  );
}

/** Create the event, its subjects, its evidence row, and one attachment per file. */
async function insertItem(client: PoolClient, caseId: string, input: EvidenceItemInput): Promise<string> {
  const event = await client.query<{ event_id: string }>(
    `
      INSERT INTO case_events (
        case_id, start_datetime, end_datetime, event_type, title, description,
        location, latitude, longitude, reliability, investigator_notes,
        created_by_id, created_by_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING event_id
    `,
    [
      caseId,
      input.eventTime,
      input.timeCertainty === "range" ? input.latestPossibleTime : null,
      EVENT_TYPE_BY_EVIDENCE[input.evidenceType],
      eventTitle(input.event),
      input.event,
      input.location.name,
      input.location.lat,
      input.location.lng,
      input.reliability ?? "unknown",
      input.notes ?? null,
      FALLBACK_USER.id,
      FALLBACK_USER.name,
    ]
  );
  const eventId = event.rows[0].event_id;

  await syncEventSubjects(client, caseId, eventId, input);

  const evidenceId = await insertEvidence(client, caseId, eventId, input);
  for (const file of input.attachments ?? []) await insertAttachment(client, evidenceId, file);
  return eventId;
}

/** Attachment ids the API hands out for stored files: "file-<attachment_id>". */
function attachmentId(id: string) {
  return `file-${id}`;
}

/**
 * Update an item in place. Each table is only written where a value actually
 * changes, so the history triggers record exactly what the investigator edited.
 */
async function updateItem(client: PoolClient, caseId: string, eventId: string, input: EvidenceItemInput) {
  await assertEventInCase(client, caseId, eventId);

  await client.query(
    `
      UPDATE case_events SET
        start_datetime = $2, end_datetime = $3, event_type = $4, title = $5, description = $6,
        location = $7, latitude = $8, longitude = $9, investigator_notes = $10,
        reliability = COALESCE($11, reliability)
      WHERE event_id = $1
        AND (start_datetime, end_datetime, event_type, title, description, location, latitude, longitude,
             investigator_notes, reliability)
            IS DISTINCT FROM ($2::timestamptz, $3::timestamptz, $4, $5, $6, $7, $8::float8, $9::float8, $10,
                              COALESCE($11, reliability))
    `,
    [
      eventId,
      input.eventTime,
      input.timeCertainty === "range" ? input.latestPossibleTime : null,
      EVENT_TYPE_BY_EVIDENCE[input.evidenceType],
      eventTitle(input.event),
      input.event,
      input.location.name,
      input.location.lat,
      input.location.lng,
      input.notes ?? null,
      input.reliability ?? null,
    ]
  );

  await syncEventSubjects(client, caseId, eventId, input);

  // The item's evidence row (created if an older item somehow has none).
  const linked = await client.query<{ evidence_id: string }>(
    "SELECT evidence_id::text FROM event_evidence WHERE event_id = $1 ORDER BY evidence_id LIMIT 1",
    [eventId]
  );
  const evidenceId = linked.rows[0]?.evidence_id ?? (await insertEvidence(client, caseId, eventId, input));

  await client.query(
    `
      UPDATE evidence SET evidence_type = $2, title = $3, source = $3, metadata = metadata || $4::jsonb
      WHERE evidence_id = $1
        AND (evidence_type, title, source, metadata) IS DISTINCT FROM ($2, $3, $3, metadata || $4::jsonb)
    `,
    [evidenceId, EVIDENCE_TYPE_LABEL[input.evidenceType], input.source, timeMetadata(input)]
  );

  // Attachments: keep files still listed, remove the rest, add new uploads.
  const files = input.attachments ?? [];
  const existing = await client.query<{ attachment_id: string }>(
    "SELECT attachment_id::text FROM evidence_attachments WHERE evidence_id = $1",
    [evidenceId]
  );
  const existingIds = new Set(existing.rows.map((r) => attachmentId(r.attachment_id)));
  const keep = new Set(files.map((f) => f.id));
  for (const row of existing.rows) {
    if (!keep.has(attachmentId(row.attachment_id))) {
      await client.query("DELETE FROM evidence_attachments WHERE attachment_id = $1", [row.attachment_id]);
    }
  }
  for (const file of files) {
    if (!existingIds.has(file.id)) await insertAttachment(client, evidenceId, file);
  }
}

/** Delete an item: its event, subjects, links, and evidence rows no other event uses. */
async function deleteItem(client: PoolClient, caseId: string, eventId: string) {
  await assertEventInCase(client, caseId, eventId);
  const linked = await client.query<{ evidence_id: string }>(
    "SELECT evidence_id::text FROM event_evidence WHERE event_id = $1",
    [eventId]
  );
  await client.query("DELETE FROM event_evidence WHERE event_id = $1", [eventId]);
  await client.query(
    `DELETE FROM evidence e
     WHERE e.evidence_id = ANY($1::bigint[])
       AND NOT EXISTS (SELECT 1 FROM event_evidence ee WHERE ee.evidence_id = e.evidence_id)`,
    [linked.rows.map((r) => r.evidence_id)]
  );
  await client.query("DELETE FROM event_subjects WHERE event_id = $1", [eventId]);
  await client.query("DELETE FROM case_events WHERE event_id = $1", [eventId]);
}

// ---------------------------------------------------------------------------
// Reading items
// ---------------------------------------------------------------------------

const ITEM_SELECT = `
  SELECT
    ce.event_id::text AS id,
    ce.case_id::text AS case_id,
    ce.start_datetime,
    ce.end_datetime,
    ce.location,
    ce.latitude,
    ce.longitude,
    ce.description,
    ce.investigator_notes,
    ce.reliability,
    ce.created_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('subjectId', es.subject_id, 'role', es.subject_role) ORDER BY es.event_subject_id)
      FROM event_subjects es
      WHERE es.event_id = ce.event_id
    ), '[]'::jsonb) AS subjects,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.evidence_id::text,
        'type', e.evidence_type,
        'source', e.source,
        'metadata', e.metadata,
        'attachments', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', a.attachment_id::text,
            'fileName', a.file_name,
            'fileType', a.file_type,
            'fileSize', a.file_size
          ) ORDER BY a.attachment_id)
          FROM evidence_attachments a
          WHERE a.evidence_id = e.evidence_id
        ), '[]'::jsonb)
      ) ORDER BY e.evidence_id)
      FROM event_evidence ee
      JOIN evidence e ON e.evidence_id = ee.evidence_id
      WHERE ee.event_id = ce.event_id
    ), '[]'::jsonb) AS evidence
  FROM case_events ce
`;

type ItemRow = {
  id: string;
  case_id: string;
  start_datetime: string;
  end_datetime: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string;
  investigator_notes: string | null;
  reliability: string;
  created_at: string;
  subjects: { subjectId: string; role: string }[];
  evidence: {
    id: string;
    type: string;
    source: string | null;
    metadata: Record<string, unknown>;
    attachments: { id: string; fileName: string; fileType: string | null; fileSize: number | null }[];
  }[];
};

/** Absolute origin of this backend as the browser sees it, for file links. */
function originOf(req: express.Request) {
  return `${req.protocol}://${req.get("host")}`;
}

function attachmentPath(caseId: string, id: string) {
  return `/api/cases/${caseId}/attachments/${id}`;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapItem(row: ItemRow, origin: string) {
  const first = row.evidence[0];
  const meta = first?.metadata ?? {};
  const eventTime = new Date(row.start_datetime).toISOString();
  const [primary, ...others] = row.subjects;

  return {
    id: row.id,
    subjectId: primary?.subjectId ?? "unknown-subject",
    evidenceType: evidenceTypeFromDb(first?.type),
    eventTime,
    earliestPossibleTime: isoOrNull(meta.earliestPossibleTime) ?? eventTime,
    latestPossibleTime: isoOrNull(meta.latestPossibleTime) ?? isoOrNull(row.end_datetime) ?? eventTime,
    timeCertainty: typeof meta.timeCertainty === "string" ? meta.timeCertainty : "exact",
    location: {
      name: row.location ?? "Unknown location",
      lat: row.latitude ?? undefined,
      lng: row.longitude ?? undefined,
    },
    event: row.description,
    source: first?.source ?? "Unknown source",
    notes: row.investigator_notes ?? undefined,
    reliability: row.reliability,
    attachments: row.evidence.flatMap((e) =>
      e.attachments.map((a) => ({
        id: attachmentId(a.id),
        name: a.fileName,
        mimeType: a.fileType ?? "application/octet-stream",
        size: Number(a.fileSize ?? 0),
        previewUrl: `${origin}${attachmentPath(row.case_id, a.id)}`,
      }))
    ),
    involvedParties: others.map((s) => ({ subjectId: s.subjectId, role: involvedRoleFromDb(s.role) })),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function loadItem(eventId: string, origin: string) {
  const result = await pool.query<ItemRow>(`${ITEM_SELECT} WHERE ce.event_id = $1`, [eventId]);
  return mapItem(result.rows[0], origin);
}

type ApiEvidenceItem = ReturnType<typeof mapItem>;

async function loadCaseItems(caseId: string, origin: string) {
  const result = await pool.query<ItemRow>(
    `${ITEM_SELECT} WHERE ce.case_id = $1 AND ce.event_type IS DISTINCT FROM '${CRIME_EVENT_TYPE}' ORDER BY ce.start_datetime ASC, ce.created_at ASC`,
    [caseId]
  );
  return result.rows.map((row) => mapItem(row, origin));
}

function sameMinute(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000;
}

function findSeededEvidence(items: ApiEvidenceItem[], subjectId: string, source: string, locationName: string, eventTime: string) {
  return items.find(
    (item) =>
      item.subjectId === subjectId &&
      item.source === source &&
      item.location.name === locationName &&
      sameMinute(item.eventTime, eventTime)
  );
}

function buildSeededCaseAnalysis(items: ApiEvidenceItem[]) {
  const metrotownTransaction = findSeededEvidence(items, "PER-001", "Transaction", "Metrotown", "2026-10-03T09:20:31Z");
  const brentwoodCctv = findSeededEvidence(items, "PER-001", "CCTV cam 12", "Brentwood Town Centre", "2026-10-03T10:00:04Z");
  const commercialWitness = findSeededEvidence(items, "PER-001", "Witness #2", "Commercial-Broadway Station", "2026-10-03T10:12:00Z");
  const metrotownWitness = findSeededEvidence(items, "PER-001", "Witness #1", "Metrotown", "2026-10-03T09:00:00Z");
  const personBPhone = findSeededEvidence(items, "PER-002", "Phone record", "Edmonds Station", "2026-10-03T08:55:12Z");

  return {
    conflicts:
      brentwoodCctv && commercialWitness
        ? [
            {
              id: "conflict-brentwood-commercial",
              evidenceIds: [brentwoodCctv.id, commercialWitness.id] as [string, string],
              requiredMinutes: 24.2,
              availableMinutes: 11.9,
              resolvedByUncertainty: false,
              explanation:
                "Evidence places Person A at Brentwood Town Centre at 2026-10-03 10:00:04 and near Commercial-Broadway Station about 12 minutes later. The estimated travel time between these locations is about 24 minutes, so these two accounts may be inconsistent if their reported times and locations are accurate.",
            },
          ]
        : [],
    gaps:
      metrotownTransaction && brentwoodCctv
        ? [
            {
              id: "gap-person-a-metrotown-brentwood",
              subjectId: "PER-001",
              start: metrotownTransaction.eventTime,
              end: brentwoodCctv.eventTime,
              durationMinutes: 39.55,
            },
          ]
        : [],
    corroborations:
      metrotownTransaction && personBPhone
        ? [
            {
              id: "corroboration-person-b-transaction",
              evidenceIds: [metrotownTransaction.id, personBPhone.id] as [string, string],
              explanation:
                "Person B's phone record near Edmonds Station and the transaction naming Person B as present in Metrotown fall within the same general timeframe, consistent with Person B being present as reported.",
            },
          ]
        : [],
    aiSuggestions:
      metrotownWitness && brentwoodCctv
        ? [
            {
              id: "ai-clothing-description",
              evidenceIds: [metrotownWitness.id, brentwoodCctv.id],
              reasoning:
                "Witness #1 described Person A wearing a red jacket near Metrotown, while CCTV camera 12 shows an individual in a blue hoodie near Brentwood. If both accounts are accurate, they may describe different appearances, or one description may be mistaken.",
              suggestedQuestion:
                "Can anyone confirm what Person A was wearing between the Metrotown sighting and the Brentwood camera footage?",
              status: "pending" as const,
            },
          ]
        : [],
  };
}

// ---------------------------------------------------------------------------
// Schema bootstrap + one-off data migrations
// ---------------------------------------------------------------------------

/**
 * Bring the database up to date on every start: apply db/schema.sql
 * (idempotent), then convert any data stored in an older shape. Each step is
 * a no-op once it has run. History logging is switched off for the
 * migration, since it reshapes data rather than editing it.
 */
/**
 * Renames that must happen before schema.sql runs, because schema.sql's
 * triggers and indexes refer to the new names.
 */
const PRE_SCHEMA_SQL = `
  DO $$
  BEGIN
    -- case_subjects(name, kind) -> case_subjects(subject_name, subject_type, ...)
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'case_subjects' AND column_name = 'name') THEN
      ALTER TABLE case_subjects RENAME COLUMN name TO subject_name;
      ALTER TABLE case_subjects ALTER COLUMN subject_name DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'case_subjects' AND column_name = 'kind') THEN
      ALTER TABLE case_subjects RENAME COLUMN kind TO subject_type;
      ALTER TABLE case_subjects ALTER COLUMN subject_type DROP NOT NULL;
      ALTER TABLE case_subjects ALTER COLUMN subject_type DROP DEFAULT;
      UPDATE case_subjects SET subject_type = CASE subject_type
        WHEN 'person' THEN 'Person' WHEN 'vehicle' THEN 'Vehicle' WHEN 'phone' THEN 'Device' ELSE 'Other' END;
    END IF;
    IF to_regclass('public.case_subjects') IS NOT NULL THEN
      ALTER TABLE case_subjects ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE case_subjects ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE case_subjects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;

    -- An evidence_attachments table from an earlier CrimePath version
    -- (attachment_id text, data_url, ...) is moved aside and migrated below.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'evidence_attachments' AND column_name = 'data_url') THEN
      ALTER TABLE evidence_attachments RENAME TO evidence_attachments_legacy;
    END IF;
  END $$;
`;

async function ensureSchema() {
  assertDatabaseConfigured();
  if (!SCHEMA_PATH) throw new Error("Database schema file db/schema.sql was not found");
  await pool.query(PRE_SCHEMA_SQL);
  await pool.query(await readFile(SCHEMA_PATH, "utf8"));

  await withTransaction(async (client) => {
    await setActor(client, { id: "system", name: "Schema migration" });
    await client.query("SELECT set_config('app.skip_history', 'on', true)");

    // Subjects that only existed on events join the case's subject registry.
    await client.query(`
      INSERT INTO case_subjects (case_id, subject_id, subject_name, subject_type)
      SELECT DISTINCT ON (ce.case_id, es.subject_id)
        ce.case_id,
        es.subject_id,
        COALESCE(NULLIF(es.subject_name, ''), es.subject_id),
        CASE
          WHEN es.subject_role ILIKE '%vehicle%' THEN 'Vehicle'
          WHEN es.subject_role ILIKE '%phone%' OR es.subject_role ILIKE '%device%' THEN 'Device'
          WHEN es.subject_role ILIKE '%organization%' THEN 'Organization'
          ELSE 'Person'
        END
      FROM event_subjects es
      JOIN case_events ce ON ce.event_id = es.event_id
      ORDER BY ce.case_id, es.subject_id, es.event_subject_id
      ON CONFLICT (case_id, subject_id) DO NOTHING
    `);

    // Files: evidence.file_* columns (one evidence row per file, from the
    // previous schema) become evidence_attachments rows. When an event had
    // several file rows, they are merged into its first evidence row.
    const hasFileColumns = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'evidence' AND column_name = 'file_url') AS exists
    `);
    if (hasFileColumns.rows[0].exists) {
      const fileRows = await client.query<{
        evidence_id: string;
        owner_id: string;
        file_name: string | null;
        file_type: string | null;
        file_size: string | null;
        file_url: string;
      }>(`
        SELECT e.evidence_id::text,
               COALESCE((SELECT MIN(e2.evidence_id) FROM event_evidence ee1
                         JOIN event_evidence ee2 ON ee2.event_id = ee1.event_id
                         JOIN evidence e2 ON e2.evidence_id = ee2.evidence_id
                         WHERE ee1.evidence_id = e.evidence_id), e.evidence_id)::text AS owner_id,
               e.file_name, e.file_type, e.file_size::text, e.file_url
        FROM evidence e
        WHERE e.file_url LIKE 'data:%'
        ORDER BY e.evidence_id
      `);
      for (const f of fileRows.rows) {
        const mime = f.file_type ?? "application/octet-stream";
        const name = f.file_name ?? "file";
        const { metadata, capturedAt } = await fileMetadata({ name, mimeType: mime, dataUrl: f.file_url });
        await client.query(
          `INSERT INTO evidence_attachments (evidence_id, attachment_type, file_name, file_type, file_size, file_url, metadata, captured_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [f.owner_id, attachmentTypeFor(mime), name, mime, f.file_size, f.file_url, metadata, capturedAt]
        );
        if (f.owner_id !== f.evidence_id) {
          await client.query("DELETE FROM evidence WHERE evidence_id = $1", [f.evidence_id]);
        }
      }
      // Photo EXIF that was stored on evidence now lives on the attachment.
      await client.query(`
        UPDATE evidence SET
          metadata = metadata - 'width' - 'height' - 'capturedAt' - 'latitude' - 'longitude'
                              - 'cameraMake' - 'cameraModel' - 'software',
          title = COALESCE(source, title)
        WHERE file_url IS NOT NULL
      `);
      await client.query(`
        ALTER TABLE evidence
          DROP COLUMN file_name, DROP COLUMN file_type, DROP COLUMN file_size, DROP COLUMN file_url
      `);
    }

    // evidence_attachments from an earlier version (moved aside before schema.sql ran).
    const legacy = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.evidence_attachments_legacy') IS NOT NULL AS exists"
    );
    if (legacy.rows[0].exists) {
      const rows = await client.query<{ evidence_id: string; name: string; mime_type: string; size_bytes: string; data_url: string }>(
        `SELECT evidence_id::text, name, mime_type, size_bytes::text, data_url
         FROM evidence_attachments_legacy ORDER BY evidence_id, position, created_at`
      );
      for (const a of rows.rows) {
        const { metadata, capturedAt } = await fileMetadata({ name: a.name, mimeType: a.mime_type, dataUrl: a.data_url });
        await client.query(
          `INSERT INTO evidence_attachments (evidence_id, attachment_type, file_name, file_type, file_size, file_url, metadata, captured_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [a.evidence_id, attachmentTypeFor(a.mime_type), a.name, a.mime_type, a.size_bytes, a.data_url, metadata, capturedAt]
        );
      }
      await client.query("DROP TABLE evidence_attachments_legacy");
    }

    // Involved parties: from evidence.metadata into event_subjects rows.
    const involved = await client.query<{ evidence_id: string; case_id: string; parties: { subjectId: string; role: InvolvedRole }[] }>(`
      SELECT evidence_id::text, case_id::text, metadata->'involvedParties' AS parties
      FROM evidence WHERE metadata ? 'involvedParties'
    `);
    for (const row of involved.rows) {
      const events = await client.query<{ event_id: string }>(
        "SELECT event_id FROM event_evidence WHERE evidence_id = $1",
        [row.evidence_id]
      );
      for (const party of Array.isArray(row.parties) ? row.parties : []) {
        const subject = await client.query<{ name: string; type: string | null }>(
          "SELECT subject_name AS name, subject_type AS type FROM case_subjects WHERE case_id = $1 AND subject_id = $2",
          [row.case_id, party.subjectId]
        );
        if (!subject.rows[0]) continue;
        for (const { event_id } of events.rows) {
          await client.query(
            `INSERT INTO event_subjects (event_id, subject_id, subject_name, subject_role)
             SELECT $1, $2, $3, $4
             WHERE NOT EXISTS (SELECT 1 FROM event_subjects WHERE event_id = $1 AND subject_id = $2)`,
            [event_id, party.subjectId, subject.rows[0].name, roleForInvolved(party.role, kindFromSubjectType(subject.rows[0].type))]
          );
        }
      }
      await client.query("UPDATE evidence SET metadata = metadata - 'involvedParties' WHERE evidence_id = $1", [
        row.evidence_id,
      ]);
    }

    // Vocabulary: evidence_type, event_type, subject_role, case_number.
    for (const [code, type] of Object.entries(EVIDENCE_TYPE_BY_LABEL)) {
      const label = EVIDENCE_TYPE_LABEL[type];
      if (code !== label) {
        await client.query("UPDATE evidence SET evidence_type = $2 WHERE evidence_type = $1", [code, label]);
      }
    }
    for (const [type, label] of Object.entries(EVIDENCE_TYPE_LABEL)) {
      await client.query(
        `UPDATE case_events ce SET event_type = $2
         WHERE ce.event_type IS DISTINCT FROM $2
           AND ce.event_type NOT IN ('Observation', 'Movement', 'Transaction', 'Communication', 'Statement', 'Other', '${CRIME_EVENT_TYPE}')
           AND (SELECT e.evidence_type FROM event_evidence ee JOIN evidence e ON e.evidence_id = ee.evidence_id
                WHERE ee.event_id = ce.event_id ORDER BY e.evidence_id LIMIT 1) = $1`,
        [label, EVENT_TYPE_BY_EVIDENCE[type as EvidenceType]]
      );
    }
    await client.query("UPDATE event_subjects SET subject_role = 'Person of Interest' WHERE subject_role = 'Person'");
    await client.query(`
      UPDATE cases SET case_number = 'CASE-' || lpad(case_id::text, 3, '0')
      WHERE case_number IS NULL OR case_number NOT LIKE 'CASE-%'
    `);

    // Evidence describes the source; the "what happened" text belongs to the event.
    await client.query(`
      UPDATE evidence e SET title = COALESCE(e.source, e.title), description = NULL
      FROM event_evidence ee
      JOIN case_events ce ON ce.event_id = ee.event_id
      WHERE ee.evidence_id = e.evidence_id AND e.description = ce.description
    `);
    const longTitles = await client.query<{ event_id: string; description: string }>(`
      SELECT event_id::text, description FROM case_events
      WHERE title = left(description, 120) AND length(description) > 80
    `);
    for (const row of longTitles.rows) {
      await client.query("UPDATE case_events SET title = $2 WHERE event_id = $1", [
        row.event_id,
        eventTitle(row.description),
      ]);
    }

    // History is written only by the UPDATE triggers in schema.sql. Remove
    // the extra triggers and rows earlier versions added.
    await client.query("DROP TRIGGER IF EXISTS trg_case_created_history ON cases");
    await client.query("DROP FUNCTION IF EXISTS track_case_created()");
    await client.query("DROP TRIGGER IF EXISTS trg_case_subject_history ON case_subjects");
    await client.query("DROP FUNCTION IF EXISTS track_case_subject_changes()");
    await client.query(`
      DELETE FROM case_property_history
      WHERE property_name IN ('case_created', 'subject_added', 'subject_updated', 'subject_removed')
    `);
    await client.query(`
      DELETE FROM evidence_property_history WHERE property_name IN ('attachment_added', 'attachment_removed')
    `);
  });
}

// ---------------------------------------------------------------------------
// Routes: health + photo metadata
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  const body: HealthResponse = { status: "ok" };
  res.json(body);
});

/** Files saved in src/images, for previews before the evidence is saved. */
app.use("/api/images", express.static(IMAGES_DIR, { index: false, dotfiles: "deny" }));

/**
 * Step 1 of an upload: save the file into src/images. Its metadata is read
 * afterwards by POST /api/uploads/:storedFileName/metadata. The wizard uses
 * the returned previewUrl as the attachment's reference when the evidence is
 * submitted.
 */
app.post("/api/uploads", async (req, res) => {
  const parsed = ExtractUploadedMetadataSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid upload payload", issues: parsed.error.flatten().fieldErrors });
    return;
  }
  const { fileName, dataUrl } = parsed.data;
  try {
    const stored = await saveUpload(fileName, dataUrl);
    res.status(201).json({
      storedFileName: stored,
      fileUrl: `${IMAGES_URL_PREFIX}${stored}`,
      previewUrl: `${originOf(req)}/api/images/${encodeURIComponent(stored)}`,
    });
  } catch (error) {
    sendError(res, error, "Failed to upload file");
  }
});

/** Step 2 of an upload: read metadata from a file already saved in src/images. */
app.post("/api/uploads/:storedFileName/metadata", async (req, res) => {
  const stored = path.basename(req.params.storedFileName);
  const filePath = path.join(IMAGES_DIR, stored);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: `File ${stored} is not in src/images` });
    return;
  }
  const originalName = typeof req.body?.fileName === "string" ? req.body.fileName : stored;
  const fileType = typeof req.body?.fileType === "string" ? req.body.fileType : "";
  try {
    const metadata = await extractImageMetadata(filePath);
    res.json({ ...metadata, fileName: originalName, fileType: metadata.fileType ?? (fileType || null) });
  } catch (error) {
    sendError(res, error, "Failed to read file metadata");
  }
});

/** Look up a place name's coordinates for the Add Evidence location picker. */
app.get("/api/geocode", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.status(400).json({ error: "Query parameter 'q' is required." });
    return;
  }
  const result = await geocodePlace(q);
  if (!result) {
    res.status(404).json({ error: `No coordinates found for "${q}".` });
    return;
  }
  res.json(result);
});

/** "Paste statement (AI draft)": structure a free-text statement into evidence fields with Gemini. */
app.post("/api/extract", async (req, res) => {
  const parsed = ExtractEvidenceRequestSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.text.trim()) {
    res.status(400).json({ error: "Field 'text' is required and must be a non-empty string." });
    return;
  }
  try {
    res.json(await extractEvidenceFromText(parsed.data.text));
  } catch (error) {
    console.error("Gemini extraction failed:", error);
    res.status(502).json({ error: "Gemini extraction failed. Check server logs and GEMINI_API_KEY." });
  }
});

/** Crime form "Paste report (AI draft)": what/when/where of the offence itself, with Gemini. */
app.post("/api/extract-crime", async (req, res) => {
  const parsed = ExtractEvidenceRequestSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.text.trim()) {
    res.status(400).json({ error: "Field 'text' is required and must be a non-empty string." });
    return;
  }
  try {
    res.json(await extractCrimeFromText(parsed.data.text));
  } catch (error) {
    console.error("Gemini crime extraction failed:", error);
    res.status(502).json({ error: "Gemini extraction failed. Check server logs and GEMINI_API_KEY." });
  }
});

app.post("/api/extract-image-metadata", async (req, res) => {
  const parsed = ExtractUploadedMetadataSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid upload payload",
      issues: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { fileName, fileType, dataUrl } = parsed.data;
  const safeFileName = path.basename(fileName).replace(/[^\w.\- ]+/g, "_") || "upload";

  try {
    // Parse in memory: no temp file means nothing to clean up (and no
    // Windows file-lock crash when sharp still holds the handle).
    // Non-image files (PDFs, docs) just come back with null image fields.
    const metadata = await extractImageMetadataFromBuffer(dataUrlToBuffer(dataUrl), safeFileName);
    res.json({ ...metadata, fileType: metadata.fileType ?? (fileType || null) });
  } catch (error) {
    console.error("Failed to extract uploaded metadata", error);
    res.status(500).json({ error: "Failed to extract metadata" });
  }
});

// ---------------------------------------------------------------------------
// Routes: cases
// ---------------------------------------------------------------------------

const CASE_COLUMNS = `
  case_id::text AS id,
  case_number AS "caseNumber",
  case_name AS name,
  description,
  case_status AS status
`;

app.get("/api/cases", async (_req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query(`SELECT ${CASE_COLUMNS} FROM cases ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (error) {
    sendError(res, error, "Failed to list cases");
  }
});

app.post("/api/cases", async (req, res) => {
  const parsed = CreateCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid case payload",
      issues: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await withTransaction((client) =>
      client.query(
        `
          WITH next AS (SELECT nextval(pg_get_serial_sequence('cases', 'case_id')) AS id)
          INSERT INTO cases (case_id, case_number, case_name, description, created_by_id, created_by_name)
          SELECT id, 'CASE-' || lpad(id::text, 3, '0'), $1, $2, $3, $4 FROM next
          RETURNING ${CASE_COLUMNS}
        `,
        [parsed.data.name, parsed.data.description ?? null, FALLBACK_USER.id, FALLBACK_USER.name]
      )
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    sendError(res, error, "Failed to create case");
  }
});

async function seedSampleCase(res: express.Response) {
  try {
    await withTransaction(async (client) => {
      await client.query(
        "DELETE FROM event_subjects WHERE event_id IN (SELECT event_id FROM case_events WHERE case_id = 1)"
      );
      await client.query("DELETE FROM cases WHERE case_id = 1");
      await client.query(
        `
          INSERT INTO cases (case_id, case_number, case_name, description, created_by_id, created_by_name)
          VALUES (1, 'CASE-001', 'sample case', 'Seeded investigation case data.', $1, $2)
        `,
        [FALLBACK_USER.id, FALLBACK_USER.name]
      );
      for (const subject of sampleCaseSubjects) {
        await client.query(
          "INSERT INTO case_subjects (case_id, subject_id, subject_name, subject_type) VALUES (1, $1, $2, $3)",
          [subject.id, subject.name, SUBJECT_TYPE_BY_KIND[subject.kind]]
        );
      }
      for (const item of sampleCaseEvidence) {
        await insertItem(client, "1", item);
      }
      await client.query(
        "SELECT setval(pg_get_serial_sequence('cases', 'case_id'), GREATEST((SELECT MAX(case_id) FROM cases), 1))"
      );
    });
    res.status(201).json({
      id: "1",
      caseNumber: "CASE-001",
      name: "sample case",
      description: "Seeded investigation case data.",
      status: "open",
    });
  } catch (error) {
    sendError(res, error, "Failed to seed sample case");
  }
}

app.post("/api/dev/seed-sample-case", async (_req, res) => {
  await seedSampleCase(res);
});

app.post("/api/dev/seed-demo-case", async (_req, res) => {
  await seedSampleCase(res);
});

app.get("/api/cases/:caseId", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query(`SELECT ${CASE_COLUMNS} FROM cases WHERE case_id = $1`, [req.params.caseId]);
    if (result.rowCount === 0) throw new HttpError(404, "Case not found");
    res.json(result.rows[0]);
  } catch (error) {
    sendError(res, error, "Failed to load case");
  }
});

app.patch("/api/cases/:caseId", async (req, res) => {
  const parsed = UpdateCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid case payload", issues: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const updated = await withTransaction(async (client) => {
      // COALESCE keeps fields that weren't sent; the history trigger only
      // logs columns whose value actually changed.
      const result = await client.query(
        `
          UPDATE cases SET
            case_name = COALESCE($2, case_name),
            description = CASE WHEN $3::boolean THEN $4 ELSE description END,
            case_status = COALESCE($5, case_status)
          WHERE case_id = $1
          RETURNING ${CASE_COLUMNS}
        `,
        [
          req.params.caseId,
          parsed.data.name ?? null,
          parsed.data.description !== undefined,
          parsed.data.description ?? null,
          parsed.data.status ?? null,
        ]
      );
      if (result.rowCount === 0) throw new HttpError(404, "Case not found");
      return result.rows[0];
    });
    res.json(updated);
  } catch (error) {
    sendError(res, error, "Failed to update case");
  }
});

app.delete("/api/cases/:caseId", async (req, res) => {
  try {
    await withTransaction(async (client) => {
      // event_evidence and event_subjects have no FK to case_events, so
      // clear them explicitly; everything else cascades from cases.
      await client.query(
        "DELETE FROM event_subjects WHERE event_id IN (SELECT event_id FROM case_events WHERE case_id = $1)",
        [req.params.caseId]
      );
      await client.query(
        "DELETE FROM event_evidence WHERE event_id IN (SELECT event_id FROM case_events WHERE case_id = $1)",
        [req.params.caseId]
      );
      const result = await client.query("DELETE FROM cases WHERE case_id = $1", [req.params.caseId]);
      if (result.rowCount === 0) throw new HttpError(404, "Case not found");
    });
    res.status(204).end();
  } catch (error) {
    sendError(res, error, "Failed to delete case");
  }
});

// ---------------------------------------------------------------------------
// Routes: subjects
// ---------------------------------------------------------------------------

app.get("/api/cases/:caseId/subjects", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query<{ id: string; name: string | null; type: string | null }>(
      `
        SELECT subject_id AS id, subject_name AS name, subject_type AS type
        FROM case_subjects
        WHERE case_id = $1
        ORDER BY created_at ASC, subject_id ASC
      `,
      [req.params.caseId]
    );
    res.json(result.rows.map((r) => ({ id: r.id, name: r.name ?? r.id, kind: kindFromSubjectType(r.type) })));
  } catch (error) {
    sendError(res, error, "Failed to load subjects");
  }
});

app.post("/api/cases/:caseId/subjects", async (req, res) => {
  const parsed = CreateSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subject payload", issues: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const created = await withTransaction(async (client) => {
      // Next PER-/VEH-/DEV-/OTH- number in this case.
      const prefix = SUBJECT_ID_PREFIX[parsed.data.kind];
      const next = await client.query<{ n: number }>(
        `
          SELECT COALESCE(MAX(substring(subject_id FROM '^' || $2 || '-(\\d+)$')::int), 0) + 1 AS n
          FROM case_subjects
          WHERE case_id = $1 AND subject_id ~ ('^' || $2 || '-\\d+$')
        `,
        [req.params.caseId, prefix]
      );
      const id = `${prefix}-${String(next.rows[0].n).padStart(3, "0")}`;
      await client.query(
        "INSERT INTO case_subjects (case_id, subject_id, subject_name, subject_type) VALUES ($1, $2, $3, $4)",
        [req.params.caseId, id, parsed.data.name, SUBJECT_TYPE_BY_KIND[parsed.data.kind]]
      );
      return { id, name: parsed.data.name, kind: parsed.data.kind };
    });
    res.status(201).json(created);
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      sendError(res, new HttpError(404, "Case not found"), "Failed to add subject");
      return;
    }
    sendError(res, error, "Failed to add subject");
  }
});

app.patch("/api/cases/:caseId/subjects/:subjectId", async (req, res) => {
  const parsed = UpdateSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subject payload", issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { caseId, subjectId } = req.params;
  try {
    const updated = await withTransaction(async (client) => {
      const current = await loadSubject(client, caseId, subjectId).catch(() => {
        throw new HttpError(404, "Subject not found");
      });
      const name = parsed.data.name ?? current.name;
      const kind = parsed.data.kind ?? current.kind;

      await client.query(
        `UPDATE case_subjects SET subject_name = $3, subject_type = $4
         WHERE case_id = $1 AND subject_id = $2 AND (subject_name, subject_type) IS DISTINCT FROM ($3, $4)`,
        [caseId, subjectId, name, SUBJECT_TYPE_BY_KIND[kind]]
      );
      // Keep each event's copy in sync (logged per event as a "subject" change).
      // Roles that just reflect the kind (Person of Interest/Vehicle/Device/Other)
      // follow it; explicit roles like Witness are kept.
      await client.query(
        `
          UPDATE event_subjects SET
            subject_name = $3,
            subject_role = CASE WHEN subject_role = ANY($5::text[]) THEN $4 ELSE subject_role END
          WHERE subject_id = $2
            AND event_id IN (SELECT event_id FROM case_events WHERE case_id = $1)
            AND (subject_name, subject_role) IS DISTINCT FROM
                ($3, CASE WHEN subject_role = ANY($5::text[]) THEN $4 ELSE subject_role END)
        `,
        [caseId, subjectId, name, ROLE_BY_KIND[kind], [...KIND_ROLES]]
      );
      return { id: subjectId, name, kind };
    });
    res.json(updated);
  } catch (error) {
    sendError(res, error, "Failed to update subject");
  }
});

app.delete("/api/cases/:caseId/subjects/:subjectId", async (req, res) => {
  const { caseId, subjectId } = req.params;
  try {
    // Deleting a subject takes its evidence with it: items it is the primary
    // subject of (the card in its lane) are deleted, and it is unlinked from
    // items where it was only an involved party.
    await withTransaction(async (client) => {
      const owned = await client.query<{ event_id: string }>(
        `
          SELECT es.event_id::text AS event_id
          FROM event_subjects es
          JOIN case_events ce ON ce.event_id = es.event_id
          WHERE ce.case_id = $1 AND es.subject_id = $2
            AND es.event_subject_id = (SELECT MIN(x.event_subject_id) FROM event_subjects x WHERE x.event_id = es.event_id)
        `,
        [caseId, subjectId]
      );
      for (const { event_id } of owned.rows) await deleteItem(client, caseId, event_id);
      await client.query(
        `
          DELETE FROM event_subjects es
          USING case_events ce
          WHERE ce.event_id = es.event_id AND ce.case_id = $1 AND es.subject_id = $2
        `,
        [caseId, subjectId]
      );
      const result = await client.query("DELETE FROM case_subjects WHERE case_id = $1 AND subject_id = $2", [
        caseId,
        subjectId,
      ]);
      if (result.rowCount === 0) throw new HttpError(404, "Subject not found");
    });
    res.status(204).end();
  } catch (error) {
    sendError(res, error, "Failed to delete subject");
  }
});

// ---------------------------------------------------------------------------
// Routes: evidence items (case_events + evidence + links)
// ---------------------------------------------------------------------------

app.get("/api/cases/:caseId/evidence", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query<ItemRow>(
      `${ITEM_SELECT} WHERE ce.case_id = $1 AND ce.event_type IS DISTINCT FROM '${CRIME_EVENT_TYPE}' ORDER BY ce.start_datetime ASC, ce.created_at ASC`,
      [req.params.caseId]
    );
    res.json(result.rows.map((row) => mapItem(row, originOf(req))));
  } catch (error) {
    sendError(res, error, "Failed to load evidence");
  }
});

type GeocodeResult = { lat: number; lng: number; label: string };

/**
 * Best-effort place name -> coordinates: the Google Geocoding API when
 * GOOGLE_MAPS_API_KEY is set, otherwise OpenStreetMap's Nominatim. Returns
 * null (the item is saved as a text-only location) if nothing matches or
 * the request fails.
 */
async function geocodePlace(name: string): Promise<GeocodeResult | null> {
  return process.env.GOOGLE_MAPS_API_KEY ? geocodeWithGoogle(name, process.env.GOOGLE_MAPS_API_KEY) : geocodeWithNominatim(name);
}

/** Nominatim, biased toward Greater Vancouver (where the case data is) but not limited to it. */
async function geocodeWithNominatim(name: string): Promise<GeocodeResult | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", name);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("viewbox", "-123.35,49.40,-122.50,49.00");
    const response = await fetch(url, {
      headers: { "User-Agent": "CrimePath/0.1 (investigation timeline prototype)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(`Geocoding "${name}" failed: HTTP ${response.status}`);
      return null;
    }
    const [first] = (await response.json()) as { lat: string; lon: string; display_name: string }[];
    return first ? { lat: Number(first.lat), lng: Number(first.lon), label: first.display_name } : null;
  } catch (error) {
    console.warn(`Geocoding "${name}" failed:`, error);
    return null;
  }
}

async function geocodeWithGoogle(name: string, key: string): Promise<GeocodeResult | null> {
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", name);
    url.searchParams.set("region", "ca");
    url.searchParams.set("key", key);
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const body = (await response.json()) as {
      status: string;
      error_message?: string;
      results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
    };
    const first = body.results?.[0];
    if (body.status !== "OK" || !first) {
      if (body.status !== "ZERO_RESULTS") console.warn(`Geocoding "${name}" failed: ${body.status} ${body.error_message ?? ""}`);
      return null;
    }
    return { ...first.geometry.location, label: first.formatted_address };
  } catch (error) {
    console.warn(`Geocoding "${name}" failed:`, error);
    return null;
  }
}

async function parseItem(req: express.Request, res: express.Response): Promise<EvidenceItemInput | null> {
  const parsed = EvidenceItemSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    res.status(400).json({ error: `Invalid evidence payload (${Object.keys(issues).join(", ")})`, issues });
    return null;
  }
  const item = parsed.data;
  if (item.location.lat == null || item.location.lng == null) {
    const coords = await geocodePlace(item.location.name);
    item.location = { name: item.location.name, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
  }
  return item;
}

app.post("/api/cases/:caseId/evidence", async (req, res) => {
  const input = await parseItem(req, res);
  if (!input) return;
  try {
    const eventId = await withTransaction((client) => insertItem(client, req.params.caseId, input));
    res.status(201).json(await loadItem(eventId, originOf(req)));
  } catch (error) {
    sendError(res, error, "Failed to add evidence");
  }
});

app.put("/api/cases/:caseId/evidence/:eventId", async (req, res) => {
  const input = await parseItem(req, res);
  if (!input) return;
  try {
    await withTransaction((client) => updateItem(client, req.params.caseId, req.params.eventId, input));
    res.json(await loadItem(req.params.eventId, originOf(req)));
  } catch (error) {
    sendError(res, error, "Failed to update evidence");
  }
});

app.patch("/api/cases/:caseId/evidence/:eventId", async (req, res) => {
  const parsed = z.object({ reliability: ReliabilitySchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reliability", issues: parsed.error.flatten().fieldErrors });
    return;
  }
  const { caseId, eventId } = req.params;
  try {
    await withTransaction(async (client) => {
      await assertEventInCase(client, caseId, eventId);
      await client.query(
        "UPDATE case_events SET reliability = $2 WHERE event_id = $1 AND reliability IS DISTINCT FROM $2",
        [eventId, parsed.data.reliability]
      );
    });
    res.json(await loadItem(eventId, originOf(req)));
  } catch (error) {
    sendError(res, error, "Failed to update reliability");
  }
});

app.delete("/api/cases/:caseId/evidence/:eventId", async (req, res) => {
  try {
    await withTransaction((client) => deleteItem(client, req.params.caseId, req.params.eventId));
    res.status(204).end();
  } catch (error) {
    sendError(res, error, "Failed to remove evidence");
  }
});

// ---------------------------------------------------------------------------
// Routes: crimes (case_events with event_type 'Crime')
// ---------------------------------------------------------------------------

const CrimeSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().optional(),
    start: z.string().datetime(),
    /** null = a single point in time (or end unknown). */
    end: z.string().datetime().nullish(),
    location: z.object({
      name: z.string().trim().min(1),
      lat: z.number().finite().nullish(),
      lng: z.number().finite().nullish(),
    }),
  })
  .refine((c) => !c.end || new Date(c.end) >= new Date(c.start), { message: "End must be after start", path: ["end"] });
type CrimeInput = z.infer<typeof CrimeSchema>;

type CrimeRow = {
  id: string;
  title: string;
  description: string;
  start_datetime: string;
  end_datetime: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
};

const CRIME_SELECT = `
  SELECT event_id::text AS id, title, description, start_datetime, end_datetime, location, latitude, longitude
  FROM case_events
  WHERE event_type = '${CRIME_EVENT_TYPE}'
`;

function mapCrime(row: CrimeRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description === row.title ? "" : row.description,
    start: new Date(row.start_datetime).toISOString(),
    end: row.end_datetime ? new Date(row.end_datetime).toISOString() : null,
    location: {
      name: row.location ?? "Unknown location",
      lat: row.latitude ?? undefined,
      lng: row.longitude ?? undefined,
    },
  };
}

async function parseCrime(req: express.Request, res: express.Response): Promise<CrimeInput | null> {
  const parsed = CrimeSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    res.status(400).json({ error: `Invalid crime (${Object.keys(issues).join(", ")})`, issues });
    return null;
  }
  const crime = parsed.data;
  if (crime.location.lat == null || crime.location.lng == null) {
    const coords = await geocodePlace(crime.location.name);
    crime.location = { name: crime.location.name, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
  }
  return crime;
}

function crimeParams(crime: CrimeInput) {
  return [
    crime.start,
    crime.end ?? null,
    crime.title,
    crime.description?.trim() || crime.title,
    crime.location.name,
    crime.location.lat ?? null,
    crime.location.lng ?? null,
  ];
}

app.get("/api/cases/:caseId/crimes", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query<CrimeRow>(`${CRIME_SELECT} AND case_id = $1 ORDER BY start_datetime`, [req.params.caseId]);
    res.json(result.rows.map(mapCrime));
  } catch (error) {
    sendError(res, error, "Failed to load crimes");
  }
});

app.post("/api/cases/:caseId/crimes", async (req, res) => {
  const crime = await parseCrime(req, res);
  if (!crime) return;
  try {
    const row = await withTransaction(async (client) => {
      const inserted = await client.query<{ event_id: string }>(
        `
          INSERT INTO case_events (
            case_id, start_datetime, end_datetime, title, description, location, latitude, longitude,
            event_type, created_by_id, created_by_name
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '${CRIME_EVENT_TYPE}', $9, $10)
          RETURNING event_id
        `,
        [req.params.caseId, ...crimeParams(crime), FALLBACK_USER.id, FALLBACK_USER.name]
      );
      const loaded = await client.query<CrimeRow>(`${CRIME_SELECT} AND event_id = $1`, [inserted.rows[0].event_id]);
      return loaded.rows[0];
    });
    res.status(201).json(mapCrime(row));
  } catch (error) {
    sendError(res, error, "Failed to add crime");
  }
});

app.put("/api/cases/:caseId/crimes/:crimeId", async (req, res) => {
  if (!UuidSchema.safeParse(req.params.crimeId).success) {
    res.status(404).json({ error: "Crime not found" });
    return;
  }
  const crime = await parseCrime(req, res);
  if (!crime) return;
  try {
    const row = await withTransaction(async (client) => {
      const updated = await client.query(
        `
          UPDATE case_events SET
            start_datetime = $3, end_datetime = $4, title = $5, description = $6,
            location = $7, latitude = $8, longitude = $9
          WHERE case_id = $1 AND event_id = $2 AND event_type = '${CRIME_EVENT_TYPE}'
        `,
        [req.params.caseId, req.params.crimeId, ...crimeParams(crime)]
      );
      if (updated.rowCount === 0) throw new HttpError(404, "Crime not found");
      const loaded = await client.query<CrimeRow>(`${CRIME_SELECT} AND event_id = $1`, [req.params.crimeId]);
      return loaded.rows[0];
    });
    res.json(mapCrime(row));
  } catch (error) {
    sendError(res, error, "Failed to update crime");
  }
});

app.delete("/api/cases/:caseId/crimes/:crimeId", async (req, res) => {
  if (!UuidSchema.safeParse(req.params.crimeId).success) {
    res.status(404).json({ error: "Crime not found" });
    return;
  }
  try {
    await withTransaction(async (client) => {
      const deleted = await client.query(
        `DELETE FROM case_events WHERE case_id = $1 AND event_id = $2 AND event_type = '${CRIME_EVENT_TYPE}'`,
        [req.params.caseId, req.params.crimeId]
      );
      if (deleted.rowCount === 0) throw new HttpError(404, "Crime not found");
    });
    res.status(204).end();
  } catch (error) {
    sendError(res, error, "Failed to remove crime");
  }
});

app.get("/api/cases/:caseId/analysis", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const items = await loadCaseItems(req.params.caseId, originOf(req));
    if (req.params.caseId === "1") {
      res.json(buildSeededCaseAnalysis(items));
      return;
    }
    res.json({ conflicts: [], gaps: [], corroborations: [], aiSuggestions: [] });
  } catch (error) {
    sendError(res, error, "Failed to load analysis");
  }
});

/** Serves an attachment's file (file_url), so lists never carry file contents. */
app.get("/api/cases/:caseId/attachments/:attachmentId", async (req, res) => {
  try {
    assertDatabaseConfigured();
    if (!/^\d+$/.test(req.params.attachmentId)) throw new HttpError(404, "File not found");
    const result = await pool.query<{ file_name: string; file_type: string | null; file_url: string }>(
      `
        SELECT a.file_name, a.file_type, a.file_url
        FROM evidence_attachments a
        JOIN evidence e ON e.evidence_id = a.evidence_id
        WHERE e.case_id = $1 AND a.attachment_id = $2
      `,
      [req.params.caseId, req.params.attachmentId]
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "File not found");
    if (row.file_url.startsWith(IMAGES_URL_PREFIX)) {
      const stored = storedFileName(row.file_url);
      if (!stored) throw new HttpError(404, `File ${row.file_url} is not in this machine's src/images folder`);
      res.setHeader("Content-Disposition", `inline; filename="${row.file_name.replace(/[^\w.\- ]+/g, "_")}"`);
      res.sendFile(path.join(IMAGES_DIR, stored), { headers: { "Content-Type": row.file_type ?? "application/octet-stream" } });
      return;
    }
    if (!row.file_url.startsWith("data:")) {
      res.redirect(row.file_url);
      return;
    }
    res.setHeader("Content-Type", row.file_type ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${row.file_name.replace(/[^\w.\- ]+/g, "_")}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(dataUrlToBuffer(row.file_url));
  } catch (error) {
    sendError(res, error, "Failed to load file");
  }
});

// ---------------------------------------------------------------------------
// Routes: property history
// ---------------------------------------------------------------------------

type HistoryRow = {
  source: "evidence" | "event" | "case";
  property_name: string;
  old_value: unknown;
  new_value: unknown;
  changed_at: string;
  changed_by_name: string | null;
};

// Columns that mirror another tracked value: event title <- description,
// evidence title <- source, event_type <- evidence_type.
const HIDDEN_HISTORY_PROPERTIES = new Set(["title", "event_type"]);

/**
 * Shape history rows for display: a JSONB metadata change becomes one entry
 * per changed key, and identical changes made to several evidence rows of
 * the same item in one save are shown once.
 */
function expandHistory(rows: HistoryRow[]) {
  const seen = new Set<string>();
  return rows
    .flatMap((row) => {
      const base = { source: row.source, changedAt: new Date(row.changed_at).toISOString(), changedBy: row.changed_by_name };
      if (row.property_name === "metadata") {
        const before = (row.old_value ?? {}) as Record<string, unknown>;
        const after = (row.new_value ?? {}) as Record<string, unknown>;
        return [...new Set([...Object.keys(before), ...Object.keys(after)])]
          .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
          .map((key) => ({ ...base, property: key, oldValue: before[key] ?? null, newValue: after[key] ?? null }));
      }
      if (HIDDEN_HISTORY_PROPERTIES.has(row.property_name)) return [];
      return [{ ...base, property: row.property_name, oldValue: row.old_value, newValue: row.new_value }];
    })
    .filter((entry) => {
      const key = JSON.stringify([entry.changedAt, entry.property, entry.oldValue, entry.newValue]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

app.get("/api/cases/:caseId/evidence/:eventId/history", async (req, res) => {
  try {
    assertDatabaseConfigured();
    if (!UuidSchema.safeParse(req.params.eventId).success) throw new HttpError(404, "Evidence not found");
    const exists = await pool.query("SELECT 1 FROM case_events WHERE case_id = $1 AND event_id = $2", [
      req.params.caseId, req.params.eventId,
    ]);
    if (exists.rowCount === 0) throw new HttpError(404, "Evidence not found");
    const result = await pool.query<HistoryRow>(
      `
        SELECT 'event' AS source, h.property_name, h.old_value, h.new_value, h.changed_at, h.changed_by_name
        FROM case_event_property_history h
        WHERE h.event_id = $2
          AND EXISTS (SELECT 1 FROM case_events WHERE event_id = $2 AND case_id = $1)
        UNION ALL
        SELECT 'evidence' AS source, h.property_name, h.old_value, h.new_value, h.changed_at, h.changed_by_name
        FROM evidence_property_history h
        JOIN event_evidence ee ON ee.evidence_id = h.evidence_id
        JOIN evidence e ON e.evidence_id = h.evidence_id
        WHERE ee.event_id = $2 AND e.case_id = $1
        ORDER BY changed_at DESC
        LIMIT 200
      `,
      [req.params.caseId, req.params.eventId]
    );
    res.json(expandHistory(result.rows));
  } catch (error) {
    sendError(res, error, "Failed to load history");
  }
});

app.get("/api/cases/:caseId/history", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query<HistoryRow>(
      `
        SELECT 'case' AS source, property_name, old_value, new_value, changed_at, changed_by_name
        FROM case_property_history
        WHERE case_id = $1
        ORDER BY changed_at DESC
        LIMIT 200
      `,
      [req.params.caseId]
    );
    res.json(expandHistory(result.rows));
  } catch (error) {
    sendError(res, error, "Failed to load history");
  }
});

// TODO (Phase 3): conflict engine + travel/gemini services.

// Express 4 doesn't catch rejected async handlers; log instead of crashing.
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection", error);
});

const port = Number(process.env.PORT) || 4000;
ensureSchema()
  .catch((error) => console.error("Failed to prepare the database schema", error))
  .finally(() => {
    app.listen(port, () => {
      console.log(`CrimePath backend listening on http://localhost:${port}`);
    });
  });
