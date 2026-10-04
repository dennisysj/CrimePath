import type { AiSuggestion, Conflict, Corroboration, Evidence, Gap, Subject } from "./types";

/**
 * Demo case: "Metrotown Incident – Oct 3". Two lanes — Person A and Person
 * B — with evidence chosen to exercise every card-timeline feature:
 *   1. ev-a3 -> ev-a4: a ~40 min gap for Person A (9:20 -> 10:00).
 *   2. ev-a4 -> ev-a5: a travel conflict (CCTV at Brentwood -> witness near
 *      Commercial–Broadway), required ~24 min vs. available ~12.
 *   3. ev-a2 + ev-a4: an AI suggestion (red jacket vs. blue hoodie).
 *   4. ev-a3 + ev-b1: a cross-subject corroboration between Person B's
 *      phone record and the transaction that names Person B as present.
 * Travel assumptions: 30 km/h urban speed + a fixed 15 minute buffer (see
 * check-caseweb-math.ts pattern from earlier rounds for the arithmetic).
 */

export const caseName = "sample case";

export const KNOWN_LOCATIONS: { name: string; lat: number; lng: number }[] = [
  { name: "Royal Oak Station", lat: 49.2156, lng: -123.0089 },
  { name: "Metrotown", lat: 49.2267, lng: -123.0033 },
  { name: "Kingsway & Willingdon", lat: 49.223, lng: -123.018 },
  { name: "Brentwood Town Centre", lat: 49.2694, lng: -123.0074 },
  { name: "Commercial–Broadway Station", lat: 49.2626, lng: -123.0699 },
  { name: "Waterfront Station", lat: 49.2856, lng: -123.1118 },
  { name: "Yaletown–Roundhouse Station", lat: 49.2745, lng: -123.1216 },
  { name: "New Westminster Station", lat: 49.2041, lng: -122.91 },
  { name: "Edmonds Station", lat: 49.2017, lng: -122.9607 }, // ADDED: Person B's lane needed a Burnaby-corridor location not already on the list
];

export const subjects: Subject[] = [
  { id: "person-a", name: "Person A", kind: "person" },
  { id: "person-b", name: "Person B", kind: "person" },
  { id: "vehicle-a", name: "Vehicle A", kind: "vehicle" },
  { id: "phone-a", name: "Phone A", kind: "phone" },
];

/** Tiny 1x1 transparent PNG — a safe stand-in so mock image attachments render a real thumbnail instead of a broken-image icon. */
const PLACEHOLDER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export const evidence: Evidence[] = [
  // --- Location demo (temporary) ---
  // Deliberately listed out of chronological order: the event path sorts by eventTime.
  {
    id: "ev-a6",
    subjectId: "person-a",
    evidenceType: "image",
    eventTime: "2026-10-03T10:31:22Z",
    earliestPossibleTime: "2026-10-03T10:31:22Z",
    latestPossibleTime: "2026-10-03T10:31:22Z",
    timeCertainty: "exact",
    location: {
      name: "Burnaby Mountain (SFU)",
      lat: 49.27880833333333,
      lng: -122.91800555555557,
      source: "Image EXIF",
    },
    event: "Photo uploaded as evidence; EXIF GPS places the camera near SFU Burnaby campus.",
    source: "Uploaded photo",
    involvedParties: [],
    attachments: [
      { id: "att-ev-a6-1", name: "IMG_2660.jpg", mimeType: "image/jpeg", size: 2310455, previewUrl: PLACEHOLDER_IMAGE },
    ],
  },
  {
    id: "ev-a0",
    subjectId: "person-a",
    evidenceType: "document",
    eventTime: "2026-10-03T08:10:00Z",
    earliestPossibleTime: "2026-10-03T08:00:00Z",
    latestPossibleTime: "2026-10-03T08:20:00Z",
    timeCertainty: "approximate",
    location: { name: "Somewhere downtown" },
    event: "Interview notes: Person A said they were 'driving around downtown' before heading to Burnaby.",
    source: "Interview notes",
    involvedParties: [],
  },
  {
    id: "ev-v1",
    subjectId: "vehicle-a",
    evidenceType: "other",
    eventTime: "2026-10-03T08:35:10Z",
    earliestPossibleTime: "2026-10-03T08:35:10Z",
    latestPossibleTime: "2026-10-03T08:35:10Z",
    timeCertainty: "exact",
    location: { name: "Kingsway near Royal Oak", lat: 49.2195, lng: -123.0062, source: "Vehicle GPS" },
    event: "Fleet tracker ping for Vehicle A; rental record shows Person A as the driver.",
    source: "Vehicle GPS tracker",
    involvedParties: [{ subjectId: "person-a", role: "with" }],
  },
  {
    id: "ev-v2",
    subjectId: "vehicle-a",
    evidenceType: "other",
    eventTime: "2026-10-03T10:40:00Z",
    earliestPossibleTime: "2026-10-03T10:40:00Z",
    latestPossibleTime: "2026-10-03T10:40:00Z",
    timeCertainty: "exact",
    location: { name: "Metrotown parkade", lat: 49.2275, lng: -123.0005, source: "Vehicle GPS" },
    event: "Fleet tracker ping for Vehicle A parked at Metrotown; no driver identified.",
    source: "Vehicle GPS tracker",
    involvedParties: [],
  },
  {
    id: "ev-p1",
    subjectId: "phone-a",
    evidenceType: "other",
    eventTime: "2026-10-03T09:05:00Z",
    earliestPossibleTime: "2026-10-03T09:04:00Z",
    latestPossibleTime: "2026-10-03T09:06:00Z",
    timeCertainty: "approximate",
    location: { name: "Bonsor Park", lat: 49.2246, lng: -122.9958, source: "Phone GPS" },
    event: "Single location-services fix recovered from an unattributed phone found at the scene.",
    source: "Phone GPS",
    involvedParties: [],
  },
  {
    id: "ev-b3",
    subjectId: "person-b",
    evidenceType: "witness",
    eventTime: "2026-10-03T10:05:00Z",
    earliestPossibleTime: "2026-10-03T09:55:00Z",
    latestPossibleTime: "2026-10-03T10:15:00Z",
    timeCertainty: "approximate",
    // Only a latitude survived transcription — not a usable coordinate pair.
    location: { name: "Near Edmonds", lat: 49.2 },
    event: "A neighbour reported seeing Person B walking near Edmonds.",
    source: "Witness #4",
    involvedParties: [],
  },

  // --- Person A ---
  {
    id: "ev-a1",
    subjectId: "person-a",
    evidenceType: "witness",
    eventTime: "2026-10-03T08:42:00Z",
    earliestPossibleTime: "2026-10-03T08:32:00Z",
    latestPossibleTime: "2026-10-03T08:52:00Z",
    timeCertainty: "approximate",
    location: { name: "Royal Oak Station", lat: 49.2156, lng: -123.0089, source: "Witness" },
    event: "I think I saw Person A near Royal Oak Station, though I wasn't watching the clock.",
    source: "Witness #3",
    involvedParties: [],
  },
  {
    id: "ev-a2",
    subjectId: "person-a",
    evidenceType: "witness",
    eventTime: "2026-10-03T09:00:00Z",
    earliestPossibleTime: "2026-10-03T08:45:00Z",
    latestPossibleTime: "2026-10-03T09:15:00Z",
    timeCertainty: "approximate",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033, source: "Witness" },
    event: "A witness reported seeing Person A wearing a red jacket near Metrotown.",
    source: "Witness #1",
    involvedParties: [],
  },
  {
    id: "ev-a3",
    subjectId: "person-a",
    evidenceType: "transaction",
    eventTime: "2026-10-03T09:20:31Z",
    earliestPossibleTime: "2026-10-03T09:20:31Z",
    latestPossibleTime: "2026-10-03T09:20:31Z",
    timeCertainty: "exact",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033, source: "Card terminal" },
    event: "Card transaction recorded at a shop in Metrotown; the register log also notes a second person present.",
    source: "Transaction",
    involvedParties: [{ subjectId: "person-b", role: "with" }],
    attachments: [
      { id: "att-ev-a3-1", name: "receipt.jpg", mimeType: "image/jpeg", size: 84213, previewUrl: PLACEHOLDER_IMAGE },
    ],
  },
  {
    id: "ev-a4",
    subjectId: "person-a",
    evidenceType: "cctv",
    eventTime: "2026-10-03T10:00:04Z",
    earliestPossibleTime: "2026-10-03T10:00:04Z",
    latestPossibleTime: "2026-10-03T10:00:04Z",
    timeCertainty: "exact",
    location: { name: "Brentwood Town Centre", lat: 49.2694, lng: -123.0074, source: "CCTV" },
    event: "Camera 12 footage shows an individual matching Person A's description, wearing a blue hoodie, near Brentwood Town Centre.",
    source: "CCTV cam 12",
    involvedParties: [],
    attachments: [
      { id: "att-ev-a4-1", name: "cctv_frame_1.jpg", mimeType: "image/jpeg", size: 152004, previewUrl: PLACEHOLDER_IMAGE },
      { id: "att-ev-a4-2", name: "cctv_frame_2.jpg", mimeType: "image/jpeg", size: 148820, previewUrl: PLACEHOLDER_IMAGE },
    ],
  },
  {
    id: "ev-a5",
    subjectId: "person-a",
    evidenceType: "witness",
    eventTime: "2026-10-03T10:12:00Z",
    earliestPossibleTime: "2026-10-03T10:07:00Z",
    latestPossibleTime: "2026-10-03T10:17:00Z",
    timeCertainty: "approximate",
    location: { name: "Commercial–Broadway Station", lat: 49.2626, lng: -123.0699, source: "Witness" },
    event: "A witness reported seeing someone matching Person A's description near the Commercial–Broadway platform.",
    source: "Witness #2",
    involvedParties: [],
  },

  // --- Person B ---
  {
    id: "ev-b1",
    subjectId: "person-b",
    evidenceType: "document",
    eventTime: "2026-10-03T08:55:12Z",
    earliestPossibleTime: "2026-10-03T08:55:12Z",
    latestPossibleTime: "2026-10-03T08:55:12Z",
    timeCertainty: "exact",
    location: { name: "Edmonds Station", lat: 49.2017, lng: -122.9607, source: "Cell tower" },
    event: "Carrier records show Person B's phone connecting to a tower near Edmonds Station.",
    source: "Phone record",
    involvedParties: [],
  },
  {
    id: "ev-b2",
    subjectId: "person-b",
    evidenceType: "transaction",
    eventTime: "2026-10-03T09:45:02Z",
    earliestPossibleTime: "2026-10-03T09:45:02Z",
    latestPossibleTime: "2026-10-03T09:45:02Z",
    timeCertainty: "exact",
    location: { name: "Kingsway & Willingdon", lat: 49.223, lng: -123.018, source: "Transit tap" },
    event: "Compass Card tap recorded for Person B near Kingsway & Willingdon.",
    source: "Transit tap",
    involvedParties: [],
  },
];

export const conflicts: Conflict[] = [
  {
    id: "conflict-1",
    kind: "travel_time",
    evidenceIds: ["ev-a4", "ev-a5"],
    requiredMinutes: 24.2,
    availableMinutes: 11.9,
    resolvedByUncertainty: false,
    explanation:
      "Evidence places Person A at Brentwood Town Centre at 10:00 AM and near Commercial–Broadway about 12 minutes later. The estimated travel time between these locations is about 24 minutes, so these two accounts may be inconsistent if their reported times and locations are accurate.",
  },
];

export const gaps: Gap[] = [
  {
    id: "gap-1",
    subjectId: "person-a",
    start: "2026-10-03T09:20:31Z",
    end: "2026-10-03T10:00:04Z",
    durationMinutes: 39.55,
  },
];

export const corroborations: Corroboration[] = [
  {
    id: "corroboration-1",
    evidenceIds: ["ev-a3", "ev-b1"],
    explanation:
      "Person B's phone record near Edmonds Station and the transaction naming Person B as present in Metrotown fall within the same general timeframe, consistent with Person B being present as reported.",
  },
];

export const aiSuggestions: AiSuggestion[] = [
  {
    id: "ai-1",
    evidenceIds: ["ev-a2", "ev-a4"],
    reasoning:
      "Witness #1 described Person A wearing a red jacket near Metrotown, while CCTV camera 12 shows an individual in a blue hoodie near Brentwood. If both accounts are accurate, they may describe different appearances, or one description may be mistaken.",
    suggestedQuestion: "Can anyone confirm what Person A was wearing between the Metrotown sighting and the Brentwood camera footage?",
    status: "pending",
  },
];
