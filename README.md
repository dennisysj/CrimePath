# CrimePath
https://www.crimepath.tech/
Investigative timeline reconstruction tool, built for StormHacks 2026.

CrimePath turns scattered evidence (witness statements, CCTV, GPS pings, phone
records, transactions, photos) into one chronological timeline per subject, and
points out where the accounts don't add up: people in two places at once,
trips that can't be made in the time available, contradictory statements, and
stretches of time nobody can account for.

**Core principle:** the backend does the maths (distances, travel times, time
windows), Gemini only reads and explains, and the investigator makes the call.
CrimePath never says a source is lying. Conflicts are always framed neutrally,
e.g. "these accounts may be inconsistent if their reported times and locations
are accurate."

## Features

- **Timeline per subject.** Each person, vehicle or device gets its own lane.
  Horizontal position is time; evidence at the same moment lines up across
  lanes, and several items for one subject at the same moment stack vertically.
  Hours can be collapsed, and the timeline zooms.
- **Automatic conflict detection** for every case, with no case-specific code:
  - *Same time, different place*: one subject reported at two places at once.
  - *Impossible travel time*: not enough time between two items to make the
    trip. Flagged as "compatible within uncertainty window" when the items'
    stated time ranges would allow it.
  - *Conflicting statements*: Gemini compares the accounts and flags
    contradictions the distance check can't see.
  - A conflict always needs at least two pieces of evidence. People listed as
    "with" a subject, or as their vehicle/device, count as being there too.
- **Travel-aware gaps.** The lines between cards show elapsed time and the
  estimated travel time (e.g. `1h · ~40 min travel`). A gap is only flagged when
  time is still unexplained after travel.
- **Adding evidence.** A step-by-step wizard with time certainty (exact,
  approximate, range), places geocoded to map coordinates, photo uploads with
  EXIF time/GPS extraction, and "Extract with Gemini" to draft an item from a
  written statement.
- **Maps.** Per-evidence location maps and a "Show Event Path" route for a
  subject, with numbered stops in time order.
- **Subjects.** Manage subjects and their profile pictures. Pictures are stored
  in `src/profile_pictures`; a subject without one shows their initial.
- **Evidence dashboard and AI summary.** A case overview and Gemini-generated
  case insights.
- **Crimes** drawn as bands across the timeline, plus per-item and per-case
  change history.

## Repo structure

```
/
├── src/            # Live backend: Express API (index.ts), Postgres access (db.ts)
│   ├── services/   #   conflict engine, geo, Gemini, image metadata
│   ├── images/     #   uploaded evidence files
│   └── profile_pictures/  # subject profile pictures
├── backend/        # Workspace that runs/builds src/ (package.json, tsconfig, test scripts)
├── frontend/       # React + Vite + TypeScript + Tailwind, Leaflet maps
├── shared/         # Shared TypeScript types and zod schemas (@crimepath/shared)
└── db/             # schema.sql (applied automatically at startup), reset.sql
```

## Setup

Requires Node.js 20+ and a Postgres database (we use TigerData / TimescaleDB).

```bash
npm install
```

Create a `.env` file in the repo root:

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | backend | Postgres connection string. Required. |
| `TIGERDATA_PASSWORD` | backend | Optional. Database password, if it isn't in `DATABASE_URL` (`DATABASE_PASSWORD` / `PGPASSWORD` also work). |
| `GEMINI_API_KEY` | backend | Optional. Needed for "Extract with Gemini", statement conflicts and the AI summary. Get one at https://aistudio.google.com/apikey |
| `GOOGLE_MAPS_API_KEY` | backend | Optional. Geocoding; falls back to OpenStreetMap (Nominatim) if unset. |
| `PORT` | backend | Default `4000`. |
| `VITE_API_URL` | frontend | Backend base URL, **including `/api`**, e.g. `http://localhost:4000/api`. |
| `VITE_USE_MOCK` | frontend | `true` to use an in-memory mock API (no backend or database needed). |

Optional conflict-engine settings (defaults shown):

| Variable | Default | Meaning |
|---|---|---|
| `CONFLICT_TRAVEL_SPEED_KMH` | `30` | Assumed travel speed between places. |
| `CONFLICT_TRAVEL_BUFFER_MINUTES` | `15` | Extra time added to every trip (parking, walking, etc.). |
| `CONFLICT_SAME_PLACE_KM` | `0.2` | Places closer than this count as the same place. |
| `GAP_THRESHOLD_MINUTES` | `45` | Unexplained time (after travel) longer than this is flagged as a gap. |
| `CONFLICT_AI_TIMEOUT_MS` | `20000` | How long to wait for Gemini's statement check before returning without it. |

## Running

```bash
npm run dev    # builds shared/, then runs backend (:4000) and frontend (:5173)
```

The backend applies `db/schema.sql` on startup. On first load the frontend
creates the sample case (CASE-001) if the database has none.

Other scripts:

```bash
npm run build           # builds shared, backend and frontend
npm run test:data-flow  # checks saved data against the running backend; cleans up its temporary cases
```

Frontend-only development: set `VITE_USE_MOCK=true` and run
`npm run dev -w frontend`. Mock data lives in memory and disappears on reload.

### Image metadata retrieval

You pass a file path in, and the function reads that image and returns one JSON
object (capture time, GPS, camera, dimensions). It never writes back to the
file. Run it from the `backend` folder:

```bash
node test-image-metadata.js path/to/image.jpg
```

## Deployment

- **Backend (Render):** root directory = repo root.
  - Build: `npm install && npm run build -w shared && npm run build -w backend`
  - Start: `npm start -w backend`
  - Set `DATABASE_URL` (plus password/Gemini variables as needed).
- **Frontend (Vercel):** root directory = `frontend`. Its build compiles
  `shared/` first automatically. Set `VITE_API_URL` to the backend URL **ending
  in `/api`** (e.g. `https://crimepath.onrender.com/api`), then redeploy. Vite
  bakes the value in at build time.

Files uploaded on a host without persistent storage (e.g. Render's free tier)
are lost on redeploy. Committed files in `src/images` and `src/profile_pictures`
are always available.

## API reference

All routes are prefixed with `/api`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness check |
| GET, POST | `/cases` | List / create cases |
| GET, PATCH, DELETE | `/cases/:caseId` | Read / update / delete a case |
| GET, POST | `/cases/:caseId/subjects` | List / add subjects |
| PATCH, DELETE | `/cases/:caseId/subjects/:subjectId` | Update / delete a subject (deletes its evidence) |
| PUT, DELETE | `/cases/:caseId/subjects/:subjectId/profile-picture` | Set / remove a profile picture (`{ fileName, dataUrl }`) |
| GET, POST | `/cases/:caseId/evidence` | List / add evidence |
| PUT, PATCH, DELETE | `/cases/:caseId/evidence/:eventId` | Replace / update reliability / delete evidence |
| GET, POST | `/cases/:caseId/crimes` | List / add crimes |
| PUT, DELETE | `/cases/:caseId/crimes/:crimeId` | Update / delete a crime |
| GET | `/cases/:caseId/analysis` | Conflicts, gaps, travel legs, corroborations, AI suggestions |
| GET | `/cases/:caseId/summary` | Gemini case summary |
| GET | `/cases/:caseId/attachments/:attachmentId` | Download an evidence attachment |
| GET | `/cases/:caseId/history`, `/cases/:caseId/evidence/:eventId/history` | Change history |
| POST | `/uploads`, `/uploads/:storedFileName/metadata` | Save an uploaded file / read its metadata |
| POST | `/extract`, `/extract-crime` | Gemini: statement text → draft evidence / crime |
| POST | `/extract-image-metadata` | Read EXIF metadata from an uploaded image |
| GET | `/geocode?q=` | Place name → coordinates |
| POST | `/dev/seed-sample-case` | Reset the sample case (CASE-001) |

Static files: `/images/<file>` (evidence uploads) and
`/profile-pictures/<file>` (subject pictures).
