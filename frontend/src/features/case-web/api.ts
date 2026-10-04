import type { AiSuggestionStatus, CaseAnalysis, CaseSummary, Evidence, Subject } from "./types";

export type SubjectInput = Omit<Subject, "id">;
import {
  aiSuggestions as mockAiSuggestions,
  caseName as mockCaseName,
  conflicts as mockConflicts,
  corroborations as mockCorroborations,
  evidence as mockEvidence,
  gaps as mockGaps,
  subjects as mockSubjects,
} from "./mockData";

export interface CaseWebApi {
  getCases(): Promise<CaseSummary[]>;
  createCase(input: { name: string; description?: string }): Promise<CaseSummary>;
  deleteCase(caseId: string): Promise<void>;
  seedDemoCase(): Promise<CaseSummary>;
  getCaseName(caseId: string): Promise<string>;
  getSubjects(caseId: string): Promise<Subject[]>;
  addSubject(caseId: string, input: SubjectInput): Promise<Subject>;
  updateSubject(caseId: string, id: string, input: Partial<SubjectInput>): Promise<Subject>;
  removeSubject(caseId: string, id: string): Promise<void>;
  getEvidence(caseId: string): Promise<Evidence[]>;
  addEvidence(caseId: string, input: Omit<Evidence, "id">): Promise<Evidence>;
  updateEvidence(caseId: string, id: string, input: Omit<Evidence, "id">): Promise<Evidence>;
  removeEvidence(caseId: string, id: string): Promise<void>;
  getAnalysis(): Promise<CaseAnalysis>;
  updateSuggestionStatus(id: string, status: AiSuggestionStatus): Promise<void>;
}

const MOCK_DELAY_MS = 300;
const DEFAULT_CASE_ID = import.meta.env.VITE_CASE_ID ?? "1";
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export interface UploadedImageMetadata {
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

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS));
}

let nextEvidenceSeq = 1;

/**
 * In-memory mock backend. Seeded from mockData.ts and mutated in place so
 * added evidence persists for the lifetime of the page.
 *
 * Note: the precomputed conflicts/gaps/corroborations in mockData.ts do NOT
 * get recalculated when evidence is added or removed — that math belongs to
 * the real backend engine, not this UI. Removing evidence that's referenced
 * by a precomputed conflict/corroboration/suggestion just makes that
 * connection disappear from the timeline (its other endpoint vanishes);
 * the Insights list entry itself stays until we're wired up to the real API.
 */
class MockCaseWebApi implements CaseWebApi {
  private cases: CaseSummary[] = [{ id: "1", name: mockCaseName, description: "Demo case" }];
  private subjects: Subject[] = [...mockSubjects];
  private evidence: Evidence[] = [...mockEvidence];
  private analysis: CaseAnalysis = {
    conflicts: [...mockConflicts],
    gaps: [...mockGaps],
    corroborations: [...mockCorroborations],
    aiSuggestions: mockAiSuggestions.map((s) => ({ ...s })),
  };

  getCases(): Promise<CaseSummary[]> {
    return delay([...this.cases]);
  }

  createCase(input: { name: string; description?: string }): Promise<CaseSummary> {
    const created = { id: String(this.cases.length + 1), name: input.name, description: input.description };
    this.cases.push(created);
    return delay(created);
  }

  deleteCase(caseId: string): Promise<void> {
    this.cases = this.cases.filter((c) => c.id !== caseId);
    return delay(undefined);
  }

  seedDemoCase(): Promise<CaseSummary> {
    return delay(this.cases[0]);
  }

  getCaseName(_caseId: string): Promise<string> {
    return delay(mockCaseName);
  }

  getSubjects(_caseId: string): Promise<Subject[]> {
    return delay([...this.subjects]);
  }

  addSubject(_caseId: string, input: SubjectInput): Promise<Subject> {
    const created: Subject = { ...input, id: `subject-new-${nextEvidenceSeq++}` };
    this.subjects.push(created);
    return delay(created);
  }

  updateSubject(_caseId: string, id: string, input: Partial<SubjectInput>): Promise<Subject> {
    const index = this.subjects.findIndex((s) => s.id === id);
    if (index < 0) return Promise.reject(new Error("Subject not found"));
    this.subjects[index] = { ...this.subjects[index], ...input };
    return delay(this.subjects[index]);
  }

  removeSubject(_caseId: string, id: string): Promise<void> {
    if (this.evidence.some((e) => e.subjectId === id)) {
      return Promise.reject(new Error("This subject still has evidence. Reassign or remove it first."));
    }
    this.subjects = this.subjects.filter((s) => s.id !== id);
    return delay(undefined);
  }

  getEvidence(_caseId: string): Promise<Evidence[]> {
    return delay([...this.evidence]);
  }

  addEvidence(_caseId: string, input: Omit<Evidence, "id">): Promise<Evidence> {
    const created: Evidence = { ...input, id: `ev-new-${nextEvidenceSeq++}` };
    this.evidence.push(created);
    return delay(created);
  }

  updateEvidence(_caseId: string, id: string, input: Omit<Evidence, "id">): Promise<Evidence> {
    const updated: Evidence = { ...input, id };
    this.evidence = this.evidence.map((e) => (e.id === id ? updated : e));
    return delay(updated);
  }

  removeEvidence(_caseId: string, id: string): Promise<void> {
    this.evidence = this.evidence.filter((e) => e.id !== id);
    return delay(undefined);
  }

  getAnalysis(): Promise<CaseAnalysis> {
    return delay({
      conflicts: [...this.analysis.conflicts],
      gaps: [...this.analysis.gaps],
      corroborations: [...this.analysis.corroborations],
      aiSuggestions: this.analysis.aiSuggestions.map((s) => ({ ...s })),
    });
  }

  updateSuggestionStatus(id: string, status: AiSuggestionStatus): Promise<void> {
    const suggestion = this.analysis.aiSuggestions.find((s) => s.id === id);
    if (suggestion) suggestion.status = status;
    return delay(undefined);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    // fetch only rejects when the server can't be reached at all.
    throw new Error(`Can't reach the backend at ${API_BASE_URL}. Is it running? (npm run dev from the repo root)`);
  }

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // Keep the status-based message when the backend returns non-JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function extractUploadedImageMetadata(input: {
  fileName: string;
  fileType: string;
  dataUrl: string;
}): Promise<UploadedImageMetadata> {
  return request<UploadedImageMetadata>("/extract-image-metadata", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

class HttpCaseWebApi implements CaseWebApi {
  getCases(): Promise<CaseSummary[]> {
    return request<CaseSummary[]>("/cases");
  }

  createCase(input: { name: string; description?: string }): Promise<CaseSummary> {
    return request<CaseSummary>("/cases", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  deleteCase(caseId: string): Promise<void> {
    return request<void>(`/cases/${caseId}`, { method: "DELETE" });
  }

  seedDemoCase(): Promise<CaseSummary> {
    return request<CaseSummary>("/dev/seed-demo-case", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async getCaseName(caseId: string): Promise<string> {
    try {
      const c = await request<{ name: string }>(`/cases/${caseId}`);
      return c.name;
    } catch {
      return `Case #${caseId}`;
    }
  }

  getSubjects(caseId: string): Promise<Subject[]> {
    return request<Subject[]>(`/cases/${caseId}/subjects`);
  }

  addSubject(caseId: string, input: SubjectInput): Promise<Subject> {
    return request<Subject>(`/cases/${caseId}/subjects`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateSubject(caseId: string, id: string, input: Partial<SubjectInput>): Promise<Subject> {
    return request<Subject>(`/cases/${caseId}/subjects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  removeSubject(caseId: string, id: string): Promise<void> {
    return request<void>(`/cases/${caseId}/subjects/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  getEvidence(caseId: string): Promise<Evidence[]> {
    return request<Evidence[]>(`/cases/${caseId}/evidence`);
  }

  addEvidence(caseId: string, input: Omit<Evidence, "id">): Promise<Evidence> {
    return request<Evidence>(`/cases/${caseId}/evidence`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateEvidence(caseId: string, id: string, input: Omit<Evidence, "id">): Promise<Evidence> {
    return request<Evidence>(`/cases/${caseId}/evidence/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  removeEvidence(caseId: string, id: string): Promise<void> {
    return request<void>(`/cases/${caseId}/evidence/${id}`, {
      method: "DELETE",
    });
  }

  getAnalysis(): Promise<CaseAnalysis> {
    return Promise.resolve({
      conflicts: [],
      gaps: [],
      corroborations: [],
      aiSuggestions: [],
    });
  }

  updateSuggestionStatus(_id: string, _status: AiSuggestionStatus): Promise<void> {
    return Promise.resolve();
  }
}

export const caseWebApi: CaseWebApi =
  import.meta.env.VITE_USE_MOCK === "true" ? new MockCaseWebApi() : new HttpCaseWebApi();
