const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function hasCoordinates<T extends { lat?: number; lng?: number }>(
  loc: T
): loc is T & { lat: number; lng: number } {
  const { lat, lng } = loc;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Great-circle (haversine) distance between two lat/lng points, in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
