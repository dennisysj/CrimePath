# CrimePath

Investigative timeline reconstruction tool (StormHacks). Organizes fragmented
evidence (witness statements, CCTV, GPS, transactions, etc.) into a
chronological timeline per entity, and surfaces potential temporal/spatial
conflicts, gaps, and uncertainty.

**Core principle:** a deterministic backend engine decides feasibility
(math); Gemini only explains in neutral language; the investigator judges.
The app never implies guilt or that a source is lying — conflict language is
always framed as "Evidence #1 and #3 may be inconsistent if their reported
times and locations are accurate."

## Repo structure

```
/
├── shared/     # TypeScript types + zod schemas + demo seed data (single source of truth)
├── backend/    # Express + TypeScript API, Postgres/TimescaleDB, conflict engine
└── frontend/   # React + Vite + TypeScript + Tailwind, SVG timeline
```

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL at minimum for backend work
```

### Env vars (`.env` at repo root)

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | backend | Postgres/TimescaleDB (Tiger Data) connection string |
| `GEMINI_API_KEY` | backend | optional — falls back to template-string explanations if unset |
| `GOOGLE_MAPS_API_KEY` | backend | optional — falls back to haversine-based travel estimate if unset |
| `PORT` | backend | default `4000` |
| `VITE_API_URL` | frontend | backend base URL, e.g. `http://localhost:4000/api` |
| `VITE_USE_MOCK` | frontend | `true` to use the in-memory mock API (no backend needed) |

## Running

```bash
npm run dev          # runs backend + frontend concurrently
npm run test:data-flow # checks saved data against the running backend; cleans up its temporary cases
```

Frontend-only development (no backend/DB needed): set `VITE_USE_MOCK=true`
in `.env` and run `npm run dev -w frontend`. The mock API client is seeded
from the same `shared/` demo data the backend uses, so both sides match.

For saved investigations, set `VITE_USE_MOCK=false` and a valid `DATABASE_URL`
in the root `.env`, then restart the frontend. The backend prepares
`db/schema.sql` automatically at startup. New cases start empty and are stored
in the database, along with subjects, evidence, and attachments. History starts
with the first edit; unchanged saves do not add entries.

Mock mode is temporary: its cases and histories disappear on reload. The
built-in case labeled “demo, not saved” is also temporary in database mode.
Conflict analysis and AI suggestions for saved cases are not implemented yet.

## API reference

All routes are prefixed `/api`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | liveness check |
| GET | `/cases` | list cases |
| POST | `/cases` | create case |
| GET | `/cases/:id` | get one case |
| GET | `/cases/:id/entities` | list entities for a case |
| POST | `/cases/:id/entities` | create entity |
| GET | `/cases/:id/evidence` | list evidence; query: `entityId`, `from`, `to` |
| POST | `/cases/:id/evidence` | create evidence (recomputes conflicts/gaps for affected entities) |
| GET | `/cases/:id/evidence/near` | events within `±windowMinutes` of `time` |
| GET | `/cases/:id/conflicts` | computed conflicts |
| GET | `/cases/:id/gaps` | computed timeline gaps |
| POST | `/extract` | stretch — raw statement text → draft Evidence via Gemini. Returns `501` for now. |

See `shared/src/schemas.ts` for the exact request/response shapes.

## Demo seed

Case **"Metrotown Incident – Oct 3"** with entities Person A, Person B, and
Phone A. Person A's 7 evidence items are deliberately timed/located
(real Burnaby/Vancouver SkyTrain-corridor coordinates) so the conflict
engine produces exactly:

1. One clear travel conflict (fails even in the best-case reading).
2. One conflict that only appears when evidence is read at face value —
   compatible once uncertainty windows are considered
   (`resolvedByUncertainty: true`).
3. One 51-minute gap in Person A's timeline.

See `shared/src/seed.ts` for the full dataset and the reasoning behind each
timestamp.

## Status

Scaffolded in phases; see commit history / project board for progress:

1. ✅ Monorepo setup + shared types/schemas + seed data
2. ⬜ Backend: DB migrations + seed + CRUD routes
3. ⬜ Backend: conflict engine + tests + travel service + Gemini service
4. ⬜ Frontend: API client (mock + http) + routing + cases list
5. ⬜ Frontend: timeline component
6. ⬜ Frontend: detail/conflicts panel + add-evidence drawer
