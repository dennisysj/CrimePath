export interface ImageMetadata {
  fileName: string;
  fileType: string | null;
  fileSize: number;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  software: string | null;
}

/** Read metadata from an image on disk. Missing values are null. */
export function extractImageMetadata(filePath: string): Promise<ImageMetadata>;

/** Read metadata from in-memory image bytes (e.g. an upload). Missing values are null. */
export function extractImageMetadataFromBuffer(buffer: Buffer, fileName: string): Promise<ImageMetadata>;
