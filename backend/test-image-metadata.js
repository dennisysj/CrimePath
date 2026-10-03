import { extractImageMetadata } from "../src/services/extractImageMetadata.js";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node test-image-metadata.js path/to/image.jpg");
  process.exit(1);
}

try {
  const metadata = await extractImageMetadata(filePath);
  console.log(JSON.stringify(metadata, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : "Could not read image metadata.";
  console.error(message);
  process.exit(1);
}
