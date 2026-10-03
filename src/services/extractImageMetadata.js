import { stat } from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";

const MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tiff: "image/tiff",
  heif: "image/heif",
  avif: "image/avif",
};

// EXIF stores local camera time as "2026:10:03 14:31:22".
// Keep those clock values. Do not convert them to UTC.
function formatCapturedAt(value) {
  if (typeof value !== "string") return null;

  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);

  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > 31 ||
    hourNumber > 23 ||
    minuteNumber > 59 ||
    secondNumber > 60
  ) {
    return null;
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.replaceAll("\u0000", "").trim();
  return trimmed === "" ? null : trimmed;
}

function cleanCoordinate(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function positiveInteger(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

/**
 * Read metadata from an image on disk. The file is not modified.
 * Any field that is missing, unreadable, or invalid is null.
 *
 * @param {string} filePath
 * @returns {Promise<{
 *   fileName: string,
 *   fileType: string | null,
 *   fileSize: number,
 *   width: number | null,
 *   height: number | null,
 *   capturedAt: string | null,
 *   latitude: number | null,
 *   longitude: number | null,
 *   cameraMake: string | null,
 *   cameraModel: string | null,
 *   software: string | null
 * }>}
 */
export async function extractImageMetadata(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new Error("extractImageMetadata requires a file path.");
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`File not found: ${filePath}`);
    }
    throw new Error(`Could not read file: ${filePath}`);
  }

  if (!fileStats.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  const metadata = {
    fileName: path.basename(filePath),
    fileType: null,
    fileSize: fileStats.size,
    width: null,
    height: null,
    capturedAt: null,
    latitude: null,
    longitude: null,
    cameraMake: null,
    cameraModel: null,
    software: null,
  };

  try {
    const image = await sharp(filePath, { failOn: "none" }).metadata();
    metadata.fileType = MIME_BY_FORMAT[image.format] ?? null;
    metadata.width = positiveInteger(image.width);
    metadata.height = positiveInteger(image.height);
  } catch {
    // Unsupported or corrupt image. Keep going and return nulls.
  }

  try {
    // reviveValues stays off so dates remain the original EXIF strings.
    const exif = await exifr.parse(filePath, {
      pick: ["DateTimeOriginal", "Make", "Model", "Software"],
      reviveValues: false,
    });

    if (exif) {
      metadata.capturedAt = formatCapturedAt(exif.DateTimeOriginal);
      metadata.cameraMake = cleanString(exif.Make);
      metadata.cameraModel = cleanString(exif.Model);
      metadata.software = cleanString(exif.Software);
    }
  } catch {
    // No readable EXIF. Leave those fields null.
  }

  try {
    const gps = await exifr.gps(filePath);
    if (gps) {
      metadata.latitude = cleanCoordinate(gps.latitude, -90, 90);
      metadata.longitude = cleanCoordinate(gps.longitude, -180, 180);
    }
  } catch {
    // No readable GPS. Leave coordinates null.
  }

  return metadata;
}
