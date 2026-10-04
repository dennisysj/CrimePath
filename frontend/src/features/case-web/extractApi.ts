import type { ExtractEvidenceResponse } from "@crimepath/shared";
import { API_BASE_URL, API_FALLBACK_URL } from "./apiConfig";

// Not part of CaseWebApi (api.ts) because it's a stateless Gemini utility,
// not case data - and unlike the rest of this feature, there's no mock
// backend for it to fall back to, so it always hits the real server.

export async function extractEvidenceDraft(text: string): Promise<ExtractEvidenceResponse> {
  const res = await apiFetch("/extract", {
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

export interface ExtractCrimeResponse {
  title: string;
  description: string;
  locationName: string;
  /** Wall-clock ISO ("…Z"), like the rest of the timeline. */
  start: string;
  end: string | null;
}

export async function extractCrimeDraft(text: string): Promise<ExtractCrimeResponse> {
  const res = await apiFetch("/extract-crime", {
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

/** Gemini-generated bullet insights over the case's current evidence/conflicts/gaps. Regenerated on request, not cached server-side. */
export async function getCaseSummary(caseId: string): Promise<string[]> {
  const res = await apiFetch(`/cases/${caseId}/summary`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Summary failed (${res.status})`);
  }
  const data = (await res.json()) as { bullets: string[] };
  return data.bullets;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    try {
      return await fetch(`${API_FALLBACK_URL}${path}`, init);
    } catch {
      throw new Error(`Can't reach the backend at ${API_BASE_URL} or fallback ${API_FALLBACK_URL}. Is the Render service awake?`);
    }
  }
}
