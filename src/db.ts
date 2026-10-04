import pg from "pg";
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = [
  path.resolve(srcDir, "../.env"),
  path.resolve(srcDir, "../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
].find((candidate) => fs.existsSync(candidate));

if (envPath) {
  config({ path: envPath, override: true });
}

function readLoosePasswordFromEnvFile() {
  if (!envPath) return undefined;

  const looseLines = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.includes("="));

  return looseLines.length === 1 ? looseLines[0] : undefined;
}

const { Pool } = pg;
const rawConnectionString = process.env.DATABASE_URL;
const separatePassword =
  process.env.TIGERDATA_PASSWORD ||
  process.env.DATABASE_PASSWORD ||
  process.env.PGPASSWORD ||
  readLoosePasswordFromEnvFile();
let connectionString = rawConnectionString;
let needsSsl = false;

if (rawConnectionString) {
  const parsed = new URL(rawConnectionString);
  if (!parsed.password && separatePassword) {
    parsed.password = separatePassword;
  }
  needsSsl = parsed.searchParams.get("sslmode") === "require";
  parsed.searchParams.delete("sslmode");
  connectionString = parsed.toString();
}

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

export function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to connect to TigerData");
  }

  const parsed = new URL(process.env.DATABASE_URL);
  if (!parsed.password && !separatePassword) {
    throw new Error(
      "DATABASE_URL in .env needs a password before @, or set TIGERDATA_PASSWORD. The :33230 part is the port."
    );
  }
}
