type Coordinate = number | null | undefined;

type TimedLocation = {
  id?: number | string;
  capturedAt: string;
  latitude: Coordinate;
  longitude: Coordinate;
};

export function isValidCoordinate(latitude: Coordinate, longitude: Coordinate): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isValidLocation<T extends { latitude: Coordinate; longitude: Coordinate }>(
  event: T,
): event is T & { latitude: number; longitude: number } {
  return isValidCoordinate(event.latitude, event.longitude);
}

function compareIds(a: number | string | undefined, b: number | string | undefined): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export function sortEventsByTime<T extends { id?: number | string; capturedAt: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const aTime = Date.parse(a.capturedAt);
    const bTime = Date.parse(b.capturedAt);
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return compareIds(a.id, b.id);
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    if (aTime === bTime) return compareIds(a.id, b.id);
    return aTime - bTime;
  });
}

export function eventsWithLocations<T extends TimedLocation>(
  events: T[],
): Array<T & { latitude: number; longitude: number }> {
  return sortEventsByTime(events.filter(isValidLocation));
}

function coordinatePair(latitude: number, longitude: number): string {
  return `${latitude},${longitude}`;
}

export function buildGoogleMapsLocationUrl(event: {
  latitude: Coordinate;
  longitude: Coordinate;
}): string | null {
  if (!isValidLocation(event)) return null;
  const params = new URLSearchParams({
    q: coordinatePair(event.latitude, event.longitude),
  });
  return `https://www.google.com/maps?${params.toString()}`;
}

export function buildGoogleMapsRouteUrl(events: TimedLocation[]): string | null {
  const located = eventsWithLocations(events);
  if (located.length < 2) return null;

  const origin = located[0];
  const destination = located[located.length - 1];
  const waypoints = located.slice(1, -1);
  const params = new URLSearchParams({
    api: "1",
    origin: coordinatePair(origin.latitude, origin.longitude),
    destination: coordinatePair(destination.latitude, destination.longitude),
  });

  if (waypoints.length > 0) {
    params.set(
      "waypoints",
      waypoints.map((event) => coordinatePair(event.latitude, event.longitude)).join("|"),
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
