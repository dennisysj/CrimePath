import "dotenv/config";
import cors from "cors";
import express from "express";
import type { HealthResponse } from "@crimepath/shared";
import { ExtractEvidenceRequestSchema } from "@crimepath/shared";
import { extractEvidenceFromText } from "./services/gemini.js";

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
    const result = await extractEvidenceFromText(parsed.data.text);
    res.json(result);
  } catch (err) {
    console.error("Gemini extraction failed:", err);
    res.status(502).json({ error: "Gemini extraction failed. Check server logs and GEMINI_API_KEY." });
  }
});

// TODO (Phase 2): cases/entities/evidence CRUD routes, db wiring.
// TODO (Phase 3): conflict engine + travel services.

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`CrimePath backend listening on http://localhost:${port}`);
});
