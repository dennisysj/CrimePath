import type { AiSuggestion, Conflict, Corroboration, Evidence, Gap, Subject } from "./types";

/**
 * Demo case: "Metrotown Incident – Oct 3".
 *
 * Person A's 5 evidence items are deliberately timed/located (real
 * Burnaby SkyTrain-corridor coordinates) so the analysis below contains
 * exactly the three scenarios called for in the spec:
 *   1. pa-1 -> pa-2: a conflict that only appears at reported times
 *      (resolvedByUncertainty: true).
 *   2. pa-3 -> pa-4: a clean 45-minute gap.
 *   3. pa-4 -> pa-5: a clear travel conflict (fails even in the best case) —
 *      CCTV at Brentwood (10:00:04) -> witness at Commercial–Broadway (~10:12).
 * Travel assumptions: 30 km/h urban speed + a fixed 15 minute buffer.
 * See check-caseweb-math.ts (scratch, not checked in) for the arithmetic.
 */

export const caseName = "sample case";

export const subjects: Subject[] = [
  { id: "person-a", name: "Person A", kind: "person" },
  { id: "phone-a", name: "Phone A", kind: "phone" },
  { id: "vehicle-a", name: "Vehicle A", kind: "vehicle" },
];

export const evidence: Evidence[] = [
  // --- Person A: the 5 items that drive the analysis ---
  {
    id: "pa-1",
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
    id: "pa-2",
    subjectId: "person-a",
    evidenceType: "gps",
    eventTime: "2026-10-03T08:45:00Z",
    earliestPossibleTime: "2026-10-03T08:35:00Z",
    latestPossibleTime: "2026-10-03T08:55:00Z",
    timeCertainty: "approximate",
    location: { name: "Metrotown", lat: 49.2267, lng: -123.0033 },
    event: "GPS log places a vehicle associated with Person A near Metrotown.",
    source: "Vehicle GPS log",
    notes: "±10 minute margin on the GPS ping interval.",
  },
  {
    id: "pa-3",
    subjectId: "person-a",
    evidenceType: "gps",
    eventTime: "2026-10-03T09:10:00Z",
    earliestPossibleTime: "2026-10-03T09:05:00Z",
    latestPossibleTime: "2026-10-03T09:15:00Z",
    timeCertainty: "approximate",
    location: { name: "Kingsway & Willingdon", lat: 49.223, lng: -123.018 },
    event: "GPS log places a vehicle associated with Person A near Kingsway & Willingdon.",
    source: "Vehicle GPS log",
    notes: "±5 minute margin on the GPS ping interval.",
  },
  {
    id: "pa-4",
    subjectId: "person-a",
    evidenceType: "cctv",
    eventTime: "2026-10-03T10:00:04Z",
    earliestPossibleTime: "2026-10-03T10:00:04Z",
    latestPossibleTime: "2026-10-03T10:00:04Z",
    timeCertainty: "exact",
    location: { name: "Brentwood Town Centre", lat: 49.2694, lng: -123.0074 },
    event:
      "CCTV footage shows an individual matching Person A's description, wearing a blue hoodie.",
    source: "TransLink CCTV Camera 7",
  },
  {
    id: "pa-5",
    subjectId: "person-a",
    evidenceType: "witness",
    eventTime: "2026-10-03T10:12:00Z",
    earliestPossibleTime: "2026-10-03T10:07:00Z",
    latestPossibleTime: "2026-10-03T10:17:00Z",
    timeCertainty: "approximate",
    location: { name: "Commercial–Broadway Station", lat: 49.2626, lng: -123.0699 },
    event: "Witness reports seeing a person in a red jacket near the platform.",
    source: "Witness statement: R. Singh",
    notes: "Witness was uncertain of the exact time, ±5 minutes.",
  },

  // --- Phone A: corroborates Person A at two points, plus one filler ping ---
  {
    id: "ph-1",
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
    id: "ph-2",
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
    id: "ph-3",
    subjectId: "phone-a",
    evidenceType: "phone",
    eventTime: "2026-10-03T10:13:00Z",
    earliestPossibleTime: "2026-10-03T10:13:00Z",
    latestPossibleTime: "2026-10-03T10:13:00Z",
    timeCertainty: "exact",
    location: { name: "Commercial–Broadway Station", lat: 49.2626, lng: -123.0699 },
    event: "Cell tower ping places Phone A near Commercial–Broadway Station.",
    source: "Carrier cell tower records",
  },

  // --- Vehicle A: one corroboration, plus one filler sighting ---
  {
    id: "va-1",
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
    id: "va-2",
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
];

export const conflicts: Conflict[] = [
  {
    id: "conflict-1",
    evidenceIds: ["pa-1", "pa-2"],
    requiredMinutes: 17.6,
    availableMinutes: 15,
    resolvedByUncertainty: true,
    explanation:
      "Evidence #pa-1 and #pa-2 report about 15 minutes between sightings at Royal Oak and Metrotown, while the estimated travel time is about 18 minutes. Within the stated time-uncertainty window, these accounts remain compatible.",
  },
  {
    id: "conflict-2",
    evidenceIds: ["pa-4", "pa-5"],
    requiredMinutes: 24.2,
    availableMinutes: 12,
    resolvedByUncertainty: false,
    explanation:
      "Evidence #pa-4 places Person A at Brentwood Town Centre at 10:00 AM and Evidence #pa-5 places Person A near Commercial–Broadway about 12 minutes later. The estimated travel time between these locations is about 24 minutes, so these two accounts may be inconsistent if their reported times and locations are accurate.",
  },
];

export const gaps: Gap[] = [
  {
    id: "gap-1",
    subjectId: "person-a",
    start: "2026-10-03T09:15:00Z",
    end: "2026-10-03T10:00:04Z",
    durationMinutes: 45,
  },
];

export const corroborations: Corroboration[] = [
  {
    id: "corroboration-1",
    evidenceIds: ["pa-1", "ph-1"],
    explanation:
      "Person A and Phone A were both placed near Royal Oak Station within a minute of each other, consistent with Phone A being in Person A's possession at this time.",
  },
  {
    id: "corroboration-2",
    evidenceIds: ["pa-4", "ph-2"],
    explanation:
      "Person A and Phone A were both placed near Brentwood Town Centre within seconds of each other, consistent with Phone A being in Person A's possession at this time.",
  },
  {
    id: "corroboration-3",
    evidenceIds: ["pa-4", "va-1"],
    explanation:
      "Person A and Vehicle A were both placed near Brentwood Town Centre within seconds of each other, consistent with Vehicle A being used by Person A around this time.",
  },
];

export const aiSuggestions: AiSuggestion[] = [
  {
    id: "ai-1",
    evidenceIds: ["pa-4", "pa-5"],
    reasoning:
      "Evidence #pa-4 describes the individual as wearing a blue hoodie, while Evidence #pa-5 describes a red jacket. If both descriptions are accurate, they may refer to different people, or one description may be mistaken.",
    suggestedQuestion:
      "Can the witness confirm the color and style of clothing worn by the person they saw near Commercial–Broadway?",
    status: "pending",
  },
  {
    id: "ai-2",
    evidenceIds: ["pa-3", "pa-4"],
    reasoning:
      "Phone A has no recorded activity between its last ping near Kingsway & Willingdon (~9:15 AM) and Person A's sighting at Brentwood (10:00 AM). If Phone A was with Person A throughout, its silence may simply reflect a lack of signal or app activity rather than Person A's absence.",
    suggestedQuestion:
      "Was Phone A powered on and in Person A's possession between approximately 9:15 and 10:00 AM?",
    status: "pending",
  },
];
