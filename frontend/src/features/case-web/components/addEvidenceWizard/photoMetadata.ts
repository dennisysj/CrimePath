import type { Evidence, EvidenceAttachment } from "../../types";
import type { UploadedImageMetadata } from "../../api";
import { EMPTY_CLOCK, type ClockValue, type WizardDraft } from "./wizardTypes";
import { isClockComplete } from "./wizardTime";

/** Uploads travel to the backend as base64 JSON, so cap their size. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

let attachmentSeq = 1;

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Read a picked file as a data URL. It is shown as the preview until the
 * backend has saved it to src/images (see AddEvidenceModal.handleAddFiles),
 * after which previewUrl points at the saved file.
 */
export function fileToAttachment(file: File): Promise<EvidenceAttachment> {
  return readFileAsDataUrl(file).then((previewUrl) => ({
    id: `att-${Date.now()}-${attachmentSeq++}`,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    previewUrl,
  }));
}

/** 24-hour digits -> the wizard's 12-hour clock. */
function toClock(hour24: number, minute: number, second: number): ClockValue {
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    hour: String(hour),
    minute: String(minute).padStart(2, "0"),
    second: String(second).padStart(2, "0"),
    period,
  };
}

/** ISO string -> date + clock, reading its digits literally (see timeUtils.ts). */
function isoToDateAndClock(iso: string): { date: string; clock: ClockValue } {
  const d = new Date(iso);
  return {
    date: d.toISOString().slice(0, 10),
    clock: toClock(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()),
  };
}

function draftHasTime(draft: WizardDraft): boolean {
  if (draft.certainty === "exact") return isClockComplete(draft.exactTime, false);
  if (draft.certainty === "approximate") return isClockComplete(draft.approxTime, false);
  if (draft.certainty === "range") return isClockComplete(draft.rangeStart, false);
  return false;
}

/** Time and location fields a photo's metadata provides. */
export function metadataToDraftPatch(metadata: UploadedImageMetadata): Partial<WizardDraft> {
  const patch: Partial<WizardDraft> = {};
  // capturedAt is the camera's local clock, "YYYY-MM-DDTHH:mm:ss" — take the digits as-is.
  const match = metadata.capturedAt && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(metadata.capturedAt);
  if (match) {
    patch.certainty = "exact";
    patch.date = match[1];
    patch.exactTime = toClock(Number(match[2]), Number(match[3]), Number(match[4]));
  }
  if (metadata.latitude !== null && metadata.longitude !== null) {
    patch.locationName = "Photo GPS location";
    patch.locationLat = metadata.latitude;
    patch.locationLng = metadata.longitude;
  }
  return patch;
}

/** Same as metadataToDraftPatch, but only for fields the investigator hasn't filled in yet. */
export function metadataPatchForEmptyFields(draft: WizardDraft, metadata: UploadedImageMetadata): Partial<WizardDraft> {
  const full = metadataToDraftPatch(metadata);
  const patch: Partial<WizardDraft> = {};
  if (full.date && !draftHasTime(draft)) {
    patch.certainty = full.certainty;
    patch.date = draft.date || full.date;
    patch.exactTime = full.exactTime;
  }
  if (full.locationName && !draft.locationName.trim()) {
    patch.locationName = full.locationName;
    patch.locationLat = full.locationLat;
    patch.locationLng = full.locationLng;
  }
  return patch;
}

export function hasTimeOrLocation(metadata: UploadedImageMetadata): boolean {
  return Boolean(metadata.capturedAt) || (metadata.latitude !== null && metadata.longitude !== null);
}

export function metadataSummary(metadata: UploadedImageMetadata): string {
  const parts = [
    metadata.capturedAt ? metadata.capturedAt.replace("T", " ") : null,
    metadata.latitude !== null && metadata.longitude !== null
      ? `${metadata.latitude.toFixed(4)}, ${metadata.longitude.toFixed(4)}`
      : null,
    [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(" ") || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No time, GPS, or camera data in this file";
}

/** Rebuild a wizard draft from saved evidence, for editing. */
export function evidenceToDraft(e: Evidence): WizardDraft {
  const event = isoToDateAndClock(e.eventTime);
  const earliest = isoToDateAndClock(e.earliestPossibleTime);
  const latest = isoToDateAndClock(e.latestPossibleTime);
  const marginMinutes = Math.round(
    (new Date(e.latestPossibleTime).getTime() - new Date(e.eventTime).getTime()) / 60_000
  );

  return {
    evidenceType: e.evidenceType,
    subjectId: e.subjectId,
    involvedParties: e.involvedParties.map((p) => ({ ...p })),
    certainty: e.timeCertainty,
    date: e.timeCertainty === "range" ? earliest.date : event.date,
    exactTime: e.timeCertainty === "exact" ? event.clock : { ...EMPTY_CLOCK },
    approxTime: e.timeCertainty === "approximate" ? event.clock : { ...EMPTY_CLOCK },
    approxMarginMinutes: e.timeCertainty === "approximate" && marginMinutes > 0 ? String(marginMinutes) : "15",
    rangeStart: e.timeCertainty === "range" ? earliest.clock : { ...EMPTY_CLOCK },
    rangeEnd: e.timeCertainty === "range" ? latest.clock : { ...EMPTY_CLOCK },
    locationName: e.location.name,
    locationLat: e.location.lat ?? null,
    locationLng: e.location.lng ?? null,
    attachments: e.attachments ?? [],
    notes: e.notes ?? "",
  };
}
