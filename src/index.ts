import "dotenv/config";
import cors from "cors";
import express from "express";
import type { HealthResponse } from "@crimepath/shared";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  const body: HealthResponse = { status: "ok" };
  res.json(body);
});

// TODO (Phase 2): cases/entities/evidence CRUD routes, db wiring.
// TODO (Phase 3): conflict engine + travel/gemini services.

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`CrimePath backend listening on http://localhost:${port}`);
});
