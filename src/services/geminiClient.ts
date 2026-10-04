import { GoogleGenAI } from "@google/genai";

// Lazily constructed so a missing key only breaks routes that actually need
// Gemini, not every route in the server (e.g. /api/health stays up).
let ai: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (ai) return ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy .env.example to .env and add your key from https://aistudio.google.com/apikey"
    );
  }
  ai = new GoogleGenAI({ apiKey });
  return ai;
}

// flash-lite has its own free-tier quota, separate from (and less likely to
// be exhausted than) the full flash model's.
export const MODEL = "gemini-flash-lite-latest";

const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_ATTEMPTS = 4;

function retryableStatus(err: unknown): number | undefined {
  const status = (err as { status?: number } | undefined)?.status;
  return status !== undefined && RETRYABLE_STATUS.has(status) ? status : undefined;
}

interface GenerateJsonParams {
  contents: string;
  systemInstruction: string;
  responseSchema: object;
}

/** Structured-JSON generateContent call, with retry on transient 429/503s. */
export async function generateJson(params: GenerateJsonParams): Promise<string> {
  const client = getClient();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: params.responseSchema,
        },
      });
      const text = response.text;
      if (!text) throw new Error("Gemini returned no text in the response.");
      return text;
    } catch (err) {
      lastErr = err;
      const status = retryableStatus(err);
      if (!status || attempt === MAX_ATTEMPTS) throw err;
      const delayMs = 1000 * 2 ** (attempt - 1);
      console.warn(
        `Gemini request failed with ${status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}
