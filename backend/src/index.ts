import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  CreateCaseEventRequestSchema,
  type CaseEvent,
  type CreateCaseEventResponse,
  type HealthResponse,
  type ListCaseEventsResponse,
} from "@crimepath/shared";
import { assertDatabaseConfigured, pool } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  const body: HealthResponse = { status: "ok" };
  res.json(body);
});

app.get("/api/cases/:caseId/evidence", async (req, res) => {
  try {
    assertDatabaseConfigured();

    const result = await pool.query<CaseEvent>(
      `
        SELECT
          event_id::text,
          case_id,
          investigator_id,
          investigator_name,
          evidence_type,
          entity,
          start_datetime,
          end_datetime,
          location,
          latitude,
          longitude,
          description,
          source,
          evidence_file_url,
          investigator_notes,
          reliability,
          metadata,
          created_at
        FROM case_events
        WHERE case_id = $1
        ORDER BY start_datetime ASC
      `,
      [req.params.caseId]
    );

    const body: ListCaseEventsResponse = result.rows;
    res.json(body);
  } catch (error) {
    console.error("Failed to list case events", error);
    res.status(500).json({ error: "Failed to load case timeline" });
  }
});

app.post("/api/cases/:caseId/evidence", async (req, res) => {
  const parsed = CreateCaseEventRequestSchema.safeParse({
    ...req.body,
    case_id: req.params.caseId,
  });

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid evidence payload",
      issues: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    assertDatabaseConfigured();

    const event = parsed.data;
    const result = await pool.query<CaseEvent>(
      `
        INSERT INTO case_events (
          case_id,
          investigator_id,
          investigator_name,
          evidence_type,
          entity,
          start_datetime,
          end_datetime,
          location,
          latitude,
          longitude,
          description,
          source,
          evidence_file_url,
          investigator_notes,
          reliability,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16
        )
        RETURNING
          event_id::text,
          case_id,
          investigator_id,
          investigator_name,
          evidence_type,
          entity,
          start_datetime,
          end_datetime,
          location,
          latitude,
          longitude,
          description,
          source,
          evidence_file_url,
          investigator_notes,
          reliability,
          metadata,
          created_at
      `,
      [
        event.case_id,
        event.investigator_id,
        event.investigator_name,
        event.evidence_type,
        event.entity || null,
        event.start_datetime,
        event.end_datetime || null,
        event.location || null,
        event.latitude ?? null,
        event.longitude ?? null,
        event.description || null,
        event.source || null,
        event.evidence_file_url || null,
        event.investigator_notes || null,
        event.reliability || "unknown",
        event.metadata ?? {},
      ]
    );

    const body: CreateCaseEventResponse = result.rows[0];
    res.status(201).json(body);
  } catch (error) {
    console.error("Failed to create case event", error);
    res.status(500).json({ error: "Failed to add evidence" });
  }
});

// TODO (Phase 3): conflict engine + travel/gemini services.
// TODO (Phase 3): conflict engine + travel/gemini services.

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`CrimePath backend listening on http://localhost:${port}`);
});
