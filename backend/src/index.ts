import "dotenv/config";
import cors from "cors";
import express from "express";
import type { HealthResponse } from "@crimepath/shared";
import { ExtractEvidenceRequestSchema } from "@crimepath/shared";
import { extractEvidenceFromText } from "./services/gemini.js";
import * as store from "./store.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  const body: HealthResponse = { status: "ok" };
  res.json(body);
});

app.post("/api/extract", async (req, res) => {
  const parsed = ExtractEvidenceRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Field 'text' is required and must be a non-empty string." });
    return;
  }
  if (!parsed.data.text.trim()) {
    res.status(400).json({ error: "Field 'text' is required and must be a non-empty string." });
    return;
  }

  try {
    const result = await extractEvidenceFromText(parsed.data.text, store.getIncidentDate());
    res.json(result);
  } catch (err) {
    console.error("Gemini extraction failed:", err);
    res.status(502).json({ error: "Gemini extraction failed. Check server logs and GEMINI_API_KEY." });
  }
});

// Hardcoded single-case demo data (backend/src/data/demoCase.ts), held in an
// in-memory store (backend/src/store.ts) - stands in for the real DB-backed
// multi-case API until that exists. Routes match what CaseWebApi needs.

app.get("/api/case-name", (_req, res) => {
  res.json({ caseName: store.getCaseName() });
});

app.get("/api/subjects", (_req, res) => {
  res.json(store.getSubjects());
});

app.post("/api/subjects", (req, res) => {
  const { name, kind } = req.body ?? {};
  if (!name || !kind) {
    res.status(400).json({ error: "Missing required subject fields." });
    return;
  }
  res.status(201).json(store.addSubject({ name, kind }));
});

app.get("/api/evidence", (_req, res) => {
  res.json(store.getEvidence());
});

app.post("/api/evidence", async (req, res) => {
  const { subjectId, evidenceType, eventTime, earliestPossibleTime, latestPossibleTime, timeCertainty, location, event, source, notes } =
    req.body ?? {};

  if (!subjectId || !evidenceType || !eventTime || !location || !event || !source) {
    res.status(400).json({ error: "Missing required evidence fields." });
    return;
  }

  try {
    // Recomputes conflicts/gaps (Gemini-judged) before responding, so
    // GET /api/analysis is immediately consistent with what was just added.
    const created = await store.addEvidence({
      subjectId,
      evidenceType,
      eventTime,
      earliestPossibleTime,
      latestPossibleTime,
      timeCertainty,
      location,
      event,
      source,
      notes,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Failed to add evidence / recompute analysis:", err);
    res.status(502).json({ error: "Could not recompute conflicts/gaps. Check server logs and GEMINI_API_KEY." });
  }
});

app.delete("/api/evidence/:id", async (req, res) => {
  try {
    await store.removeEvidence(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error("Failed to remove evidence / recompute analysis:", err);
    res.status(502).json({ error: "Could not recompute conflicts/gaps. Check server logs and GEMINI_API_KEY." });
  }
});

app.get("/api/analysis", async (_req, res) => {
  try {
    res.json(await store.getAnalysis());
  } catch (err) {
    console.error("Failed to compute analysis:", err);
    res.status(502).json({ error: "Could not compute conflicts/gaps. Check server logs and GEMINI_API_KEY." });
  }
});

app.patch("/api/suggestions/:id/status", (req, res) => {
  const { status } = req.body ?? {};
  if (status !== "pending" && status !== "confirmed" && status !== "dismissed") {
    res.status(400).json({ error: "status must be 'pending', 'confirmed', or 'dismissed'." });
    return;
  }
  store.updateSuggestionStatus(req.params.id, status);
  res.status(204).end();
});

// TODO (Phase 2): multi-case + entities CRUD, db wiring (replaces the
// hardcoded single-case store above with real persistence).
// TODO: corroboration/AI-suggestion engine (still the static demo values).

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`CrimePath backend listening on http://localhost:${port}`);
});
