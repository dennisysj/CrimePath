import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { HealthResponse } from "@crimepath/shared";
import { assertDatabaseConfigured, pool } from "./db.js";
import { extractImageMetadataFromBuffer } from "./services/extractImageMetadata.js";

const app = express();
app.use(cors());
// Attachments travel as base64 data URLs (up to 8MB each on the client), so
// an evidence item with a few attachments needs well over the default limit.
app.use(express.json({ limit: "50mb" }));

const EvidenceTypeSchema = z.enum([
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

const TimeCertaintySchema = z.enum(["exact", "approximate", "range"]);

const AddEvidenceSchema = z.object({
  subjectId: z.string().min(1),
  evidenceType: EvidenceTypeSchema,
  eventTime: z.string().datetime(),
  earliestPossibleTime: z.string().datetime(),
  latestPossibleTime: z.string().datetime(),
  timeCertainty: TimeCertaintySchema,
  location: z.object({
    name: z.string().min(1),
    lat: z.number().finite(),
    lng: z.number().finite(),
  }),
  event: z.string().min(1),
  source: z.string().min(1),
  notes: z.string().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        size: z.number(),
        dataUrl: z.string(),
      })
    )
    .optional(),
});

const SubjectKindSchema = z.enum(["person", "vehicle", "phone", "other"]);
type SubjectKind = z.infer<typeof SubjectKindSchema>;

const CreateSubjectSchema = z.object({
  name: z.string().trim().min(1),
  kind: SubjectKindSchema,
});

const UpdateSubjectSchema = CreateSubjectSchema.partial();

const ROLE_BY_KIND: Record<SubjectKind, string> = {
  person: "Person",
  vehicle: "Vehicle",
  phone: "Device",
  other: "Other",
};

const CreateCaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const ExtractUploadedMetadataSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().optional(),
  dataUrl: z.string().min(1),
});

const FALLBACK_USER = {
  id: "local-investigator",
  name: "Local Investigator",
};

type EvidenceRow = {
  id: string;
  subject_id: string | null;
  subject_name: string | null;
  evidence_type: string;
  event_time: string;
  earliest_possible_time: string | null;
  latest_possible_time: string | null;
  time_certainty: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  event: string | null;
  source: string | null;
  notes: string | null;
  attachments: unknown;
  created_at: string;
};

const demoSubjects = [
  { id: "person-a", name: "Person A", role: "Person" },
  { id: "phone-a", name: "Phone A", role: "Device" },
  { id: "vehicle-a", name: "Vehicle A", role: "Vehicle" },
] as const;

const demoEvidence = [
  {
    subjectId: "person-a",
    evidenceType: "witness",
    eventTime: "2026-10-03T08:30:00Z",
    earliestPossibleTime: "2026-10-03T08:30:00Z",
    latestPossibleTime: "2026-10-03T08:30:00Z",
    timeCertainty: "exact",
    location: { name: "Royal Oak Station", lat: 49.2156, lng: -123.0089 },
    event: "Witness reports seeing Person A near Royal Oak Station.",
    source: "Witness statement: J. Lee",
  },
  {
    subjectId: "person-a",
    evidenceType: "gps",
    eventTime: "2026-10-03T08:45:00Z",
    earliestPossibleTime: "2026-10-03T08:35:00Z",
    latestPossibleTime: "2026-10-03T08:55:00Z",
    timeCertainty: "approximate",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033 },
    event: "GPS log places a vehicle associated with Person A near Metrotown.",
    source: "Vehicle GPS log",
    notes: "10 minute margin on the GPS ping interval.",
  },
  {
    subjectId: "person-a",
    evidenceType: "gps",
    eventTime: "2026-10-03T09:10:00Z",
    earliestPossibleTime: "2026-10-03T09:05:00Z",
    latestPossibleTime: "2026-10-03T09:15:00Z",
    timeCertainty: "approximate",
    location: { name: "Kingsway & Willingdon", lat: 49.223, lng: -123.018 },
    event: "GPS log places a vehicle associated with Person A near Kingsway & Willingdon.",
    source: "Vehicle GPS log",
    notes: "5 minute margin on the GPS ping interval.",
  },
  {
    subjectId: "person-a",
    evidenceType: "cctv",
    eventTime: "2026-10-03T10:00:04Z",
    earliestPossibleTime: "2026-10-03T10:00:04Z",
    latestPossibleTime: "2026-10-03T10:00:04Z",
    timeCertainty: "exact",
    location: { name: "Brentwood Town Centre", lat: 49.2694, lng: -123.0074 },
    event: "CCTV footage shows an individual matching Person A's description, wearing a blue hoodie.",
    source: "TransLink CCTV Camera 7",
  },
  {
    subjectId: "person-a",
    evidenceType: "witness",
    eventTime: "2026-10-03T10:12:00Z",
    earliestPossibleTime: "2026-10-03T10:07:00Z",
    latestPossibleTime: "2026-10-03T10:17:00Z",
    timeCertainty: "approximate",
    location: { name: "Commercial-Broadway Station", lat: 49.2626, lng: -123.0699 },
    event: "Witness reports seeing a person in a red jacket near the platform.",
    source: "Witness statement: R. Singh",
    notes: "Witness was uncertain of the exact time, 5 minute margin.",
  },
  {
    subjectId: "phone-a",
    evidenceType: "phone",
    eventTime: "2026-10-03T08:31:00Z",
    earliestPossibleTime: "2026-10-03T08:31:00Z",
    latestPossibleTime: "2026-10-03T08:31:00Z",
    timeCertainty: "exact",
    location: { name: "Royal Oak Station", lat: 49.2156, lng: -123.0089 },
    event: "Cell tower ping places Phone A near Royal Oak Station.",
    source: "Carrier cell tower records",
  },
  {
    subjectId: "phone-a",
    evidenceType: "phone",
    eventTime: "2026-10-03T10:00:30Z",
    earliestPossibleTime: "2026-10-03T10:00:30Z",
    latestPossibleTime: "2026-10-03T10:00:30Z",
    timeCertainty: "exact",
    location: { name: "Brentwood Town Centre", lat: 49.2694, lng: -123.0074 },
    event: "Cell tower ping places Phone A near Brentwood Town Centre.",
    source: "Carrier cell tower records",
  },
  {
    subjectId: "phone-a",
    evidenceType: "phone",
    eventTime: "2026-10-03T10:13:00Z",
    earliestPossibleTime: "2026-10-03T10:13:00Z",
    latestPossibleTime: "2026-10-03T10:13:00Z",
    timeCertainty: "exact",
    location: { name: "Commercial-Broadway Station", lat: 49.2626, lng: -123.0699 },
    event: "Cell tower ping places Phone A near Commercial-Broadway Station.",
    source: "Carrier cell tower records",
  },
  {
    subjectId: "vehicle-a",
    evidenceType: "gps",
    eventTime: "2026-10-03T10:00:10Z",
    earliestPossibleTime: "2026-10-03T10:00:10Z",
    latestPossibleTime: "2026-10-03T10:00:10Z",
    timeCertainty: "exact",
    location: { name: "Brentwood Town Centre", lat: 49.2694, lng: -123.0074 },
    event: "Vehicle A's GPS log places it near Brentwood Town Centre.",
    source: "Vehicle GPS log",
  },
  {
    subjectId: "vehicle-a",
    evidenceType: "gps",
    eventTime: "2026-10-03T09:00:00Z",
    earliestPossibleTime: "2026-10-03T09:00:00Z",
    latestPossibleTime: "2026-10-03T09:00:00Z",
    timeCertainty: "exact",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033 },
    event: "Vehicle A's GPS log shows it idling near Metrotown.",
    source: "Vehicle GPS log",
  },
] as const;

function toSubjectKind(role: string | null): SubjectKind {
  const normalized = role?.toLowerCase() ?? "";
  if (normalized.includes("vehicle")) return "vehicle";
  if (normalized.includes("phone") || normalized.includes("device")) return "phone";
  if (normalized.includes("other")) return "other";
  return "person";
}

/**
 * Subjects used to exist only as rows on event_subjects, so a subject with no
 * evidence couldn't be stored. case_subjects is the per-case roster; this
 * creates it if missing and backfills it from existing event_subjects rows.
 */
async function ensureSchema() {
  assertDatabaseConfigured();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS case_subjects (
      case_id bigint NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
      subject_id text NOT NULL,
      name text NOT NULL,
      kind text NOT NULL DEFAULT 'person',
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (case_id, subject_id)
    )
  `);
  const legacy = await pool.query<{ case_id: string; subject_id: string; subject_name: string | null; subject_role: string | null }>(`
    SELECT DISTINCT ON (ce.case_id, es.subject_id)
      ce.case_id::text AS case_id, es.subject_id, es.subject_name, es.subject_role
    FROM event_subjects es
    JOIN case_events ce ON ce.event_id = es.event_id
    ORDER BY ce.case_id, es.subject_id, es.created_at DESC
  `);
  for (const row of legacy.rows) {
    await pool.query(
      `INSERT INTO case_subjects (case_id, subject_id, name, kind) VALUES ($1, $2, $3, $4)
       ON CONFLICT (case_id, subject_id) DO NOTHING`,
      [row.case_id, row.subject_id, row.subject_name || row.subject_id, toSubjectKind(row.subject_role)]
    );
  }
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const EVIDENCE_SELECT = `
  SELECT
    e.evidence_id::text AS id,
    es.subject_id,
    es.subject_name,
    e.evidence_type,
    ce.start_datetime AS event_time,
    e.metadata->>'earliestPossibleTime' AS earliest_possible_time,
    e.metadata->>'latestPossibleTime' AS latest_possible_time,
    e.metadata->>'timeCertainty' AS time_certainty,
    ce.location,
    ce.latitude,
    ce.longitude,
    ce.description AS event,
    e.source,
    ce.investigator_notes AS notes,
    e.metadata->'attachments' AS attachments,
    e.created_at
  FROM evidence e
  LEFT JOIN event_evidence ee ON ee.evidence_id = e.evidence_id
  LEFT JOIN case_events ce ON ce.event_id = ee.event_id
  LEFT JOIN LATERAL (
    SELECT subject_id, subject_name
    FROM event_subjects
    WHERE event_id = ce.event_id
    ORDER BY created_at DESC
    LIMIT 1
  ) es ON TRUE
`;

async function loadSubject(client: PoolClient, caseId: string, subjectId: string) {
  const result = await client.query<{ name: string; kind: SubjectKind }>(
    "SELECT name, kind FROM case_subjects WHERE case_id = $1 AND subject_id = $2",
    [caseId, subjectId]
  );
  if (result.rowCount === 0) throw new HttpError(400, `Subject "${subjectId}" does not exist in this case`);
  return result.rows[0];
}

function evidenceMetadata(input: z.infer<typeof AddEvidenceSchema>) {
  return {
    timeCertainty: input.timeCertainty,
    earliestPossibleTime: input.earliestPossibleTime,
    latestPossibleTime: input.latestPossibleTime,
    attachments: input.attachments ?? [],
  };
}

function mapEvidenceRow(row: EvidenceRow) {
  const eventTime = new Date(row.event_time).toISOString();
  return {
    id: row.id,
    subjectId: row.subject_id ?? "unknown-subject",
    evidenceType: row.evidence_type,
    eventTime,
    earliestPossibleTime: row.earliest_possible_time
      ? new Date(row.earliest_possible_time).toISOString()
      : eventTime,
    latestPossibleTime: row.latest_possible_time
      ? new Date(row.latest_possible_time).toISOString()
      : eventTime,
    timeCertainty: row.time_certainty ?? "exact",
    location: {
      name: row.location ?? "Unknown location",
      lat: row.latitude ?? 0,
      lng: row.longitude ?? 0,
    },
    event: row.event ?? "No description provided.",
    source: row.source ?? "Unknown source",
    notes: row.notes ?? undefined,
    attachments: Array.isArray(row.attachments) ? row.attachments : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

app.get("/api/health", (_req, res) => {
  const body: HealthResponse = { status: "ok" };
  res.json(body);
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
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const safeFileName = path.basename(fileName).replace(/[^\w.\- ]+/g, "_") || "upload";

  try {
    // Parse in memory: no temp file means nothing to clean up (and no
    // Windows file-lock crash when sharp still holds the handle).
    // Non-image files (PDFs, docs) just come back with null image fields.
    const metadata = await extractImageMetadataFromBuffer(Buffer.from(base64, "base64"), safeFileName);
    res.json({ ...metadata, fileType: metadata.fileType ?? (fileType || null) });
  } catch (error) {
    console.error("Failed to extract uploaded metadata", error);
    res.status(500).json({ error: "Failed to extract metadata" });
  }
});

app.get("/api/cases", async (_req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query(
      `
        SELECT
          case_id::text AS id,
          case_name AS name,
          description,
          case_status AS status
        FROM cases
        ORDER BY created_at DESC
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to list cases", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list cases" });
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
    assertDatabaseConfigured();
    const result = await pool.query(
      `
        INSERT INTO cases (
          case_number,
          case_name,
          description,
          created_by_id,
          created_by_name
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          case_id::text AS id,
          case_name AS name,
          description,
          case_status AS status
      `,
      [
        `CP-${Date.now()}`,
        parsed.data.name,
        parsed.data.description ?? null,
        FALLBACK_USER.id,
        FALLBACK_USER.name,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to create case", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create case" });
  }
});

app.post("/api/dev/seed-demo-case", async (_req, res) => {
  const client = await pool.connect();

  try {
    assertDatabaseConfigured();
    await client.query("BEGIN");
    await client.query("DELETE FROM cases WHERE case_id = 1");
    await client.query(
      `
        INSERT INTO cases (
          case_id,
          case_number,
          case_name,
          description,
          created_by_id,
          created_by_name
        )
        VALUES (1, 'SAMPLE-1', 'sample case', 'Original fake test case data.', $1, $2)
      `,
      [FALLBACK_USER.id, FALLBACK_USER.name]
    );

    for (const subject of demoSubjects) {
      await client.query("INSERT INTO case_subjects (case_id, subject_id, name, kind) VALUES (1, $1, $2, $3)", [
        subject.id,
        subject.name,
        toSubjectKind(subject.role),
      ]);
    }

    for (const item of demoEvidence) {
      const subject = demoSubjects.find((s) => s.id === item.subjectId) ?? demoSubjects[0];
      const evidenceResult = await client.query<{ evidence_id: string }>(
        `
          INSERT INTO evidence (
            case_id,
            evidence_type,
            title,
            description,
            source,
            metadata,
            added_by_id,
            added_by_name
          )
          VALUES (1, $1, $2, $3, $4, $5, $6, $7)
          RETURNING evidence_id::text
        `,
        [
          item.evidenceType,
          item.event.slice(0, 120),
          item.event,
          item.source,
          {
            timeCertainty: item.timeCertainty,
            earliestPossibleTime: item.earliestPossibleTime,
            latestPossibleTime: item.latestPossibleTime,
            attachments: [],
          },
          FALLBACK_USER.id,
          FALLBACK_USER.name,
        ]
      );

      const eventResult = await client.query<{ event_id: string }>(
        `
          INSERT INTO case_events (
            case_id,
            start_datetime,
            end_datetime,
            event_type,
            title,
            description,
            location,
            latitude,
            longitude,
            reliability,
            investigator_notes,
            created_by_id,
            created_by_name
          )
          VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, 'unknown', $9, $10, $11)
          RETURNING event_id
        `,
        [
          item.eventTime,
          null,
          item.evidenceType,
          item.event.slice(0, 120),
          item.event,
          item.location.name,
          item.location.lat,
          item.location.lng,
          "notes" in item ? item.notes : null,
          FALLBACK_USER.id,
          FALLBACK_USER.name,
        ]
      );

      await client.query(
        "INSERT INTO event_evidence (event_id, evidence_id, relationship_type) VALUES ($1, $2, 'supports')",
        [eventResult.rows[0].event_id, evidenceResult.rows[0].evidence_id]
      );
      await client.query(
        "INSERT INTO event_subjects (event_id, subject_id, subject_name, subject_role) VALUES ($1, $2, $3, $4)",
        [eventResult.rows[0].event_id, subject.id, subject.name, subject.role]
      );
    }

    await client.query("SELECT setval(pg_get_serial_sequence('cases', 'case_id'), GREATEST((SELECT MAX(case_id) FROM cases), 1))");
    await client.query("COMMIT");
    res.status(201).json({
      id: "1",
      name: "sample case",
      description: "Original fake test case data.",
      status: "open",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to seed demo case", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to seed demo case" });
  } finally {
    client.release();
  }
});

app.get("/api/cases/:caseId", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query(
      `
        SELECT case_id::text AS id, case_name AS name, description, case_status
        FROM cases
        WHERE case_id = $1
      `,
      [req.params.caseId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Case not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to load case", error);
    res.status(500).json({ error: "Failed to load case" });
  }
});

app.delete("/api/cases/:caseId", async (req, res) => {
  try {
    await withTransaction(async (client) => {
      // event_subjects has no FK to case_events, so clear it explicitly;
      // everything else cascades from cases.
      await client.query(
        "DELETE FROM event_subjects WHERE event_id IN (SELECT event_id FROM case_events WHERE case_id = $1)",
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

app.get("/api/cases/:caseId/subjects", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query<{ id: string; name: string; kind: SubjectKind }>(
      `
        SELECT subject_id AS id, name, kind
        FROM case_subjects
        WHERE case_id = $1
        ORDER BY created_at ASC, subject_id ASC
      `,
      [req.params.caseId]
    );
    res.json(result.rows);
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
    assertDatabaseConfigured();
    const id = `${slugify(parsed.data.name) || "subject"}-${randomUUID().slice(0, 6)}`;
    const result = await pool.query<{ id: string; name: string; kind: SubjectKind }>(
      `
        INSERT INTO case_subjects (case_id, subject_id, name, kind)
        VALUES ($1, $2, $3, $4)
        RETURNING subject_id AS id, name, kind
      `,
      [req.params.caseId, id, parsed.data.name, parsed.data.kind]
    );
    res.status(201).json(result.rows[0]);
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

      await client.query("UPDATE case_subjects SET name = $3, kind = $4 WHERE case_id = $1 AND subject_id = $2", [
        caseId,
        subjectId,
        name,
        kind,
      ]);
      // Keep the denormalized copy on each event in sync.
      await client.query(
        `
          UPDATE event_subjects SET subject_name = $3, subject_role = $4
          WHERE subject_id = $2
            AND event_id IN (SELECT event_id FROM case_events WHERE case_id = $1)
        `,
        [caseId, subjectId, name, ROLE_BY_KIND[kind]]
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
    await withTransaction(async (client) => {
      const inUse = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM event_subjects es
          JOIN case_events ce ON ce.event_id = es.event_id
          WHERE ce.case_id = $1 AND es.subject_id = $2
        `,
        [caseId, subjectId]
      );
      const count = Number(inUse.rows[0].count);
      if (count > 0) {
        throw new HttpError(
          409,
          `This subject still has ${count} evidence item${count === 1 ? "" : "s"}. Reassign or remove them first.`
        );
      }
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

app.get("/api/cases/:caseId/evidence", async (req, res) => {
  try {
    assertDatabaseConfigured();
    const result = await pool.query<EvidenceRow>(
      `${EVIDENCE_SELECT}
        WHERE e.case_id = $1
        ORDER BY ce.start_datetime ASC NULLS LAST, e.created_at ASC`,
      [req.params.caseId]
    );
    res.json(result.rows.map(mapEvidenceRow));
  } catch (error) {
    sendError(res, error, "Failed to load evidence");
  }
});

app.post("/api/cases/:caseId/evidence", async (req, res) => {
  const parsed = AddEvidenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid evidence payload",
      issues: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const input = parsed.data;
  const { caseId } = req.params;

  try {
    const evidenceId = await withTransaction(async (client) => {
      const subject = await loadSubject(client, caseId, input.subjectId);

      const evidenceResult = await client.query<{ evidence_id: string }>(
        `
          INSERT INTO evidence (
            case_id, evidence_type, title, description, source,
            file_name, file_type, file_size, file_url,
            metadata, added_by_id, added_by_name
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING evidence_id::text
        `,
        [
          caseId,
          input.evidenceType,
          input.event.slice(0, 120),
          input.event,
          input.source,
          input.attachments?.[0]?.name ?? null,
          input.attachments?.[0]?.type ?? null,
          input.attachments?.[0]?.size ?? null,
          input.attachments?.[0]?.dataUrl ?? null,
          evidenceMetadata(input),
          FALLBACK_USER.id,
          FALLBACK_USER.name,
        ]
      );

      const eventResult = await client.query<{ event_id: string }>(
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
          input.evidenceType,
          input.event.slice(0, 120),
          input.event,
          input.location.name,
          input.location.lat,
          input.location.lng,
          "unknown",
          input.notes ?? null,
          FALLBACK_USER.id,
          FALLBACK_USER.name,
        ]
      );

      await client.query(
        "INSERT INTO event_evidence (event_id, evidence_id, relationship_type) VALUES ($1, $2, 'supports')",
        [eventResult.rows[0].event_id, evidenceResult.rows[0].evidence_id]
      );
      await client.query(
        "INSERT INTO event_subjects (event_id, subject_id, subject_name, subject_role) VALUES ($1, $2, $3, $4)",
        [eventResult.rows[0].event_id, input.subjectId, subject.name, ROLE_BY_KIND[subject.kind]]
      );

      return evidenceResult.rows[0].evidence_id;
    });

    const created = await pool.query<EvidenceRow>(`${EVIDENCE_SELECT} WHERE e.evidence_id = $1`, [evidenceId]);
    res.status(201).json(mapEvidenceRow(created.rows[0]));
  } catch (error) {
    sendError(res, error, "Failed to add evidence");
  }
});

app.put("/api/cases/:caseId/evidence/:evidenceId", async (req, res) => {
  const parsed = AddEvidenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid evidence payload",
      issues: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const input = parsed.data;
  const { caseId, evidenceId } = req.params;

  try {
    await withTransaction(async (client) => {
      const subject = await loadSubject(client, caseId, input.subjectId);

      const evidenceResult = await client.query(
        `
          UPDATE evidence SET
            evidence_type = $3, title = $4, description = $5, source = $6,
            file_name = $7, file_type = $8, file_size = $9, file_url = $10,
            metadata = $11, updated_at = now()
          WHERE case_id = $1 AND evidence_id = $2
        `,
        [
          caseId,
          evidenceId,
          input.evidenceType,
          input.event.slice(0, 120),
          input.event,
          input.source,
          input.attachments?.[0]?.name ?? null,
          input.attachments?.[0]?.type ?? null,
          input.attachments?.[0]?.size ?? null,
          input.attachments?.[0]?.dataUrl ?? null,
          evidenceMetadata(input),
        ]
      );
      if (evidenceResult.rowCount === 0) throw new HttpError(404, "Evidence not found");

      const events = await client.query<{ event_id: string }>(
        "SELECT event_id FROM event_evidence WHERE evidence_id = $1",
        [evidenceId]
      );
      for (const { event_id } of events.rows) {
        await client.query(
          `
            UPDATE case_events SET
              start_datetime = $2, end_datetime = $3, event_type = $4, title = $5, description = $6,
              location = $7, latitude = $8, longitude = $9, investigator_notes = $10, updated_at = now()
            WHERE event_id = $1
          `,
          [
            event_id,
            input.eventTime,
            input.timeCertainty === "range" ? input.latestPossibleTime : null,
            input.evidenceType,
            input.event.slice(0, 120),
            input.event,
            input.location.name,
            input.location.lat,
            input.location.lng,
            input.notes ?? null,
          ]
        );
        await client.query(
          "UPDATE event_subjects SET subject_id = $2, subject_name = $3, subject_role = $4 WHERE event_id = $1",
          [event_id, input.subjectId, subject.name, ROLE_BY_KIND[subject.kind]]
        );
      }
    });

    const updated = await pool.query<EvidenceRow>(`${EVIDENCE_SELECT} WHERE e.evidence_id = $1`, [evidenceId]);
    res.json(mapEvidenceRow(updated.rows[0]));
  } catch (error) {
    sendError(res, error, "Failed to update evidence");
  }
});

app.delete("/api/cases/:caseId/evidence/:evidenceId", async (req, res) => {
  const { caseId, evidenceId } = req.params;
  try {
    await withTransaction(async (client) => {
      const eventIds = await client.query<{ event_id: string }>(
        `
          SELECT ee.event_id
          FROM event_evidence ee
          JOIN evidence e ON e.evidence_id = ee.evidence_id
          WHERE e.case_id = $1 AND e.evidence_id = $2
        `,
        [caseId, evidenceId]
      );

      const result = await client.query("DELETE FROM evidence WHERE case_id = $1 AND evidence_id = $2", [
        caseId,
        evidenceId,
      ]);
      if (result.rowCount === 0) throw new HttpError(404, "Evidence not found");

      for (const row of eventIds.rows) {
        await client.query("DELETE FROM event_subjects WHERE event_id = $1", [row.event_id]);
        await client.query("DELETE FROM case_events WHERE event_id = $1", [row.event_id]);
      }
    });
    res.status(204).end();
  } catch (error) {
    sendError(res, error, "Failed to remove evidence");
  }
});

// TODO (Phase 3): conflict engine + travel/gemini services.

// Express 4 doesn't catch rejected async handlers; log instead of crashing.
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection", error);
});

const port = Number(process.env.PORT) || 4000;
ensureSchema()
  .catch((error) => console.error("Failed to prepare case_subjects table", error))
  .finally(() => {
    app.listen(port, () => {
      console.log(`CrimePath backend listening on http://localhost:${port}`);
    });
  });
