import type { Case, Entity, Evidence, Conflict, Gap } from "./schemas.js";

/**
 * Demo case: "Metrotown Incident – Oct 3".
 *
 * Person A's 7 evidence items are deliberately timed/located so the conflict
 * engine (backend/src/engine) produces exactly three findings:
 *   1. ev-1 -> ev-2: a clear travel conflict (fails even in the best case).
 *   2. ev-3 -> ev-4: a conflict only when evidence is read at face value
 *      (resolvedByUncertainty = true).
 *   3. ev-4 -> ev-5: a 51-minute gap (> the 45-minute default threshold).
 * The remaining adjacent pairs (ev-5->ev-6, ev-6->ev-7) are intentionally
 * clean so those two scenarios stand out. The precomputed `demoConflicts`
 * and `demoGaps` below match what the engine computes for this data using
 * the default travel assumptions (30 km/h + 15 min fixed buffer).
 */

export const demoCase: Case = {
  id: "case-metrotown",
  name: "Metrotown Incident – Oct 3",
  incidentDate: "2026-10-03",
  description:
    "Reconstructing the movements of persons of interest around the Metrotown / Commercial-Broadway corridor on the afternoon of October 3.",
  createdAt: "2026-10-03T09:00:00Z",
};

export const demoEntities: Entity[] = [
  { id: "entity-person-a", caseId: demoCase.id, name: "Person A", kind: "person" },
  { id: "entity-person-b", caseId: demoCase.id, name: "Person B", kind: "person" },
  { id: "entity-phone-a", caseId: demoCase.id, name: "Phone A (secondary device)", kind: "phone" },
];

const [personA, personB, phoneA] = demoEntities;

export const demoEvidence: Evidence[] = [
  // --- Person A: 7 items designed to produce the three demo scenarios ---
  {
    id: "ev-1",
    caseId: demoCase.id,
    entityIds: [personA.id],
    evidenceType: "witness",
    eventTime: "2026-10-03T10:00:00Z",
    earliestPossibleTime: "2026-10-03T10:00:00Z",
    latestPossibleTime: "2026-10-03T10:00:00Z",
    timeCertainty: "exact",
    location: { name: "Metrotown (Metropolis food court)", lat: 49.2267, lng: -123.0033 },
    event: "Witness reports seeing Person A at the Metrotown food court.",
    source: "Witness statement: J. Lee",
    createdAt: "2026-10-03T15:00:00Z",
  },
  {
    id: "ev-2",
    caseId: demoCase.id,
    entityIds: [personA.id],
    evidenceType: "cctv",
    eventTime: "2026-10-03T10:04:00Z",
    earliestPossibleTime: "2026-10-03T10:04:00Z",
    latestPossibleTime: "2026-10-03T10:04:00Z",
    timeCertainty: "exact",
    location: { name: "Commercial–Broadway Station platform", lat: 49.2626, lng: -123.0699 },
    event: "CCTV footage shows an individual matching Person A's description on the SkyTrain platform.",
    source: "TransLink CCTV Camera 14",
    createdAt: "2026-10-03T15:05:00Z",
  },
  {
    id: "ev-3",
    caseId: demoCase.id,
    entityIds: [personA.id],
    evidenceType: "gps",
    eventTime: "2026-10-03T10:32:00Z",
    earliestPossibleTime: "2026-10-03T10:17:00Z",
    latestPossibleTime: "2026-10-03T10:47:00Z",
    timeCertainty: "approximate",
    location: { name: "Brentwood Town Centre", lat: 49.2694, lng: -123.0074 },
    event: "GPS log places a vehicle associated with Person A near Brentwood Town Centre.",
    source: "Vehicle GPS log",
    notes: "Timestamp rounded to the nearest 15-minute GPS ping interval.",
    createdAt: "2026-10-03T16:00:00Z",
  },
  {
    id: "ev-4",
    caseId: demoCase.id,
    entityIds: [personA.id],
    evidenceType: "phone",
    eventTime: "2026-10-03T10:54:00Z",
    earliestPossibleTime: "2026-10-03T10:39:00Z",
    latestPossibleTime: "2026-10-03T11:09:00Z",
    timeCertainty: "approximate",
    location: { name: "Commercial–Broadway Station", lat: 49.2626, lng: -123.0699 },
    event: "Cell tower data places Person A's phone near Commercial–Broadway.",
    source: "Carrier cell tower records",
    notes: "Cell tower triangulation has an estimated ±15 minute margin.",
    createdAt: "2026-10-03T16:10:00Z",
  },
  {
    id: "ev-5",
    caseId: demoCase.id,
    entityIds: [personA.id],
    evidenceType: "transit",
    eventTime: "2026-10-03T12:00:00Z",
    earliestPossibleTime: "2026-10-03T12:00:00Z",
    latestPossibleTime: "2026-10-03T12:00:00Z",
    timeCertainty: "exact",
    location: { name: "Waterfront Station", lat: 49.2856, lng: -123.1118 },
    event: "Compass Card tap-in recorded at Waterfront Station.",
    source: "TransLink Compass Card system",
    createdAt: "2026-10-03T16:30:00Z",
  },
  {
    id: "ev-6",
    caseId: demoCase.id,
    entityIds: [personA.id],
    evidenceType: "transaction",
    eventTime: "2026-10-03T12:25:00Z",
    earliestPossibleTime: "2026-10-03T12:25:00Z",
    latestPossibleTime: "2026-10-03T12:25:00Z",
    timeCertainty: "exact",
    location: { name: "Yaletown–Roundhouse Station area", lat: 49.2745, lng: -123.1216 },
    event: "Debit card transaction recorded at a coffee shop near Yaletown–Roundhouse.",
    source: "Bank transaction log",
    createdAt: "2026-10-03T17:00:00Z",
  },
  {
    id: "ev-7",
    caseId: demoCase.id,
    entityIds: [personA.id],
    evidenceType: "digital",
    eventTime: "2026-10-03T13:10:00Z",
    earliestPossibleTime: "2026-10-03T13:10:00Z",
    latestPossibleTime: "2026-10-03T13:10:00Z",
    timeCertainty: "exact",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033 },
    event: "Device metadata shows a photo taken on Person A's phone near Metrotown.",
    source: "Device metadata extraction",
    createdAt: "2026-10-03T17:30:00Z",
  },

  // --- Person B: unrelated supporting evidence, no conflicts by design ---
  {
    id: "ev-8",
    caseId: demoCase.id,
    entityIds: [personB.id],
    evidenceType: "witness",
    eventTime: "2026-10-03T10:10:00Z",
    earliestPossibleTime: "2026-10-03T10:10:00Z",
    latestPossibleTime: "2026-10-03T10:10:00Z",
    timeCertainty: "exact",
    location: { name: "Commercial–Broadway Station platform", lat: 49.2626, lng: -123.0699 },
    event: "A separate witness reports seeing a person matching a general description near the platform.",
    source: "Witness statement: R. Singh",
    createdAt: "2026-10-03T15:20:00Z",
  },
  {
    id: "ev-9",
    caseId: demoCase.id,
    entityIds: [personB.id],
    evidenceType: "police",
    eventTime: "2026-10-03T14:00:00Z",
    earliestPossibleTime: "2026-10-03T14:00:00Z",
    latestPossibleTime: "2026-10-03T14:00:00Z",
    timeCertainty: "exact",
    location: { name: "New Westminster Station", lat: 49.2041, lng: -122.91 },
    event: "Person B voluntarily gave a statement at the New Westminster detachment.",
    source: "Police incident report #2026-10882",
    createdAt: "2026-10-03T18:00:00Z",
  },

  // --- Phone A: secondary device, tracked as its own entity ---
  {
    id: "ev-10",
    caseId: demoCase.id,
    entityIds: [phoneA.id],
    evidenceType: "phone",
    eventTime: "2026-10-03T10:02:00Z",
    earliestPossibleTime: "2026-10-03T10:02:00Z",
    latestPossibleTime: "2026-10-03T10:02:00Z",
    timeCertainty: "exact",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033 },
    event: "Secondary device cell tower ping near Metrotown.",
    source: "Carrier cell tower records",
    createdAt: "2026-10-03T15:02:00Z",
  },
  {
    id: "ev-11",
    caseId: demoCase.id,
    entityIds: [phoneA.id],
    evidenceType: "phone",
    eventTime: "2026-10-03T10:06:00Z",
    earliestPossibleTime: "2026-10-03T10:06:00Z",
    latestPossibleTime: "2026-10-03T10:06:00Z",
    timeCertainty: "exact",
    location: { name: "Commercial–Broadway Station", lat: 49.2626, lng: -123.0699 },
    event: "Secondary device cell tower ping near Commercial–Broadway.",
    source: "Carrier cell tower records",
    createdAt: "2026-10-03T15:06:00Z",
  },
];

/**
 * Precomputed to match what backend/src/engine produces for the evidence
 * above with the default travel assumptions (30 km/h urban speed + a fixed
 * 15 minute buffer). Used by the frontend mock API so the UI can be built
 * before the backend engine exists.
 */
export const demoConflicts: Conflict[] = [
  {
    id: "conflict-1",
    caseId: demoCase.id,
    entityId: personA.id,
    evidenceIds: ["ev-1", "ev-2"],
    kind: "travel",
    availableMinutesBestCase: 4,
    availableMinutesAtReportedTimes: 4,
    requiredMinutes: 27.5,
    shortfallMinutes: 23.5,
    resolvedByUncertainty: false,
    explanation:
      "Evidence #1 places Person A at Metrotown at 10:00 AM and Evidence #2 places Person A at Commercial–Broadway Station only 4 minutes later. The estimated travel time between these locations is about 28 minutes, so these two accounts may be inconsistent if their reported times and locations are accurate.",
  },
  {
    id: "conflict-2",
    caseId: demoCase.id,
    entityId: personA.id,
    evidenceIds: ["ev-3", "ev-4"],
    kind: "travel",
    availableMinutesBestCase: 52,
    availableMinutesAtReportedTimes: 22,
    requiredMinutes: 24.2,
    shortfallMinutes: 2.2,
    resolvedByUncertainty: true,
    explanation:
      "Evidence #3 and Evidence #4 report about 22 minutes between sightings near Brentwood and Commercial–Broadway, while the estimated travel time is about 24 minutes. Within the stated time-uncertainty windows, these accounts remain compatible.",
  },
];

export const demoGaps: Gap[] = [
  {
    id: "gap-1",
    caseId: demoCase.id,
    entityId: personA.id,
    start: "2026-10-03T11:09:00Z",
    end: "2026-10-03T12:00:00Z",
    durationMinutes: 51,
  },
];
