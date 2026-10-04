import type { ExtractEvidenceResponse } from "@crimepath/shared";

// Not part of CaseWebApi (api.ts) because it's a stateless Gemini utility,
// not case data - and unlike the rest of this feature, there's no mock
// backend for it to fall back to, so it always hits the real server.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export async function extractEvidenceDraft(text: string): Promise<ExtractEvidenceResponse> {
  const res = await fetch(`${API_URL}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Extraction failed (${res.status})`);
  }
  return res.json();
}
