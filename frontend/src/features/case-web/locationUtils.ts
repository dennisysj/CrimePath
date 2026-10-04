import type { LocationEvent } from "../../components/EventPathMap";
import { eventsWithLocations, isValidCoordinate } from "../../utils/googleMaps";
import type { Evidence, EvidenceType, InvolvedRole } from "./types";

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  witness: "Witness",
  cctv: "CCTV",
  image: "Image",
  video: "Video",
  document: "Document",
  transaction: "Transaction",
  other: "Other",
};

/** A route needs at least this many located events; one point is only shown on the evidence's own map. */
export const MIN_ROUTE_POINTS = 2;

/**
 * Roles that physically place the involved subject at the evidence's
 * location and time. "reported_by" / "mentioned" don't, so that evidence
 * never lands on the involved subject's route.
 */
const CO_PRESENT_ROLES: ReadonlySet<InvolvedRole> = new Set<InvolvedRole>(["with", "vehicle_device"]);

/** Returns the evidence's coordinates only if both are present and in range. */
export function getEvidenceCoordinates(evidence: Evidence): { lat: number; lng: number } | null {
  const { lat, lng } = evidence.location ?? {};
  return isValidCoordinate(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

export function hasLocation(evidence: Evidence): boolean {
  return getEvidenceCoordinates(evidence) !== null;
}

export function formatLocationLabel(evidence: Evidence): string {
  const coords = getEvidenceCoordinates(evidence);
  const name = evidence.location?.name || "Unknown location";
  return coords ? `${name} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : name;
}

/** e.g. "Image EXIF", falling back to the evidence type when the coordinate source isn't recorded. */
export function locationSourceLabel(evidence: Evidence): string {
  return evidence.location?.source ?? EVIDENCE_TYPE_LABEL[evidence.evidenceType] ?? evidence.source;
}

/**
 * Whether this evidence belongs on `subjectId`'s route: either it's the
 * primary subject, or the evidence explicitly lists it as physically
 * present. This is the one place to swap in backend-provided associations.
 */
export function isEvidenceForSubject(evidence: Evidence, subjectId: string): boolean {
  if (evidence.subjectId === subjectId) return true;
  return (evidence.involvedParties ?? []).some((p) => p.subjectId === subjectId && CO_PRESENT_ROLES.has(p.role));
}

export interface RoutePoint extends LocationEvent {
  id: string;
  latitude: number;
  longitude: number;
  locationName: string;
  evidence: Evidence;
}

type RouteCandidate = Omit<RoutePoint, "latitude" | "longitude"> & { latitude: number | null; longitude: number | null };

function toRouteCandidate(evidence: Evidence): RouteCandidate {
  return {
    id: evidence.id,
    name: evidence.location?.name || EVIDENCE_TYPE_LABEL[evidence.evidenceType] || "Event",
    capturedAt: evidence.eventTime,
    latitude: evidence.location?.lat ?? null,
    longitude: evidence.location?.lng ?? null,
    source: locationSourceLabel(evidence),
    locationName: evidence.location?.name ?? "",
    evidence,
  };
}

/**
 * The subject's located evidence in chronological order (by eventTime).
 * Text-only locations and invalid coordinates are dropped; repeat visits to
 * the same coordinates are kept as separate points.
 */
export function getRoutePoints(evidence: Evidence[], subjectId: string): RoutePoint[] {
  return eventsWithLocations(evidence.filter((e) => isEvidenceForSubject(e, subjectId)).map(toRouteCandidate));
}
