import type { AiSuggestionStatus, CaseAnalysis, CaseSummary, Evidence, Reliability, Subject } from "./types";

export type SubjectInput = Omit<Subject, "id">;

export interface CaseUpdate {
  name?: string;
  /** null clears it. */
  description?: string | null;
  status?: string;
}
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
  getEvidenceHistory(caseId: string, evidenceId: string): Promise<HistoryEntry[]>;
  getCaseHistory(caseId: string): Promise<HistoryEntry[]>;
  getCases(): Promise<CaseSummary[]>;
  createCase(input: { name: string; description?: string }): Promise<CaseSummary>;
  updateCase(caseId: string, input: CaseUpdate): Promise<CaseSummary>;
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
  setReliability(caseId: string, id: string, reliability: Reliability): Promise<Evidence>;
  removeEvidence(caseId: string, id: string): Promise<void>;
  getAnalysis(caseId: string): Promise<CaseAnalysis>;
  updateSuggestionStatus(id: string, status: AiSuggestionStatus, caseId: string): Promise<void>;
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
  private evidenceHistory = new Map<string, Map<string, HistoryEntry[]>>();

  getEvidenceHistory(caseId: string, evidenceId: string): Promise<HistoryEntry[]> {
    if (!this.data(caseId).evidence.some((e) => e.id === evidenceId)) {
      return Promise.reject(new Error("Evidence not found"));
    }
    return delay([...(this.evidenceHistory.get(caseId)?.get(evidenceId) ?? [])]);
  }

  private recordEvidenceChanges(caseId: string, before: Evidence, after: Evidence) {
    const properties: Partial<Record<keyof Evidence, string>> = {
      event: "description", source: "source", evidenceType: "evidence_type",
      eventTime: "start_datetime", earliestPossibleTime: "earliestPossibleTime",
      latestPossibleTime: "latestPossibleTime", timeCertainty: "timeCertainty",
      location: "location", notes: "investigator_notes", subjectId: "subject",
      involvedParties: "involvedParties", reliability: "reliability",
    };
    const entries: HistoryEntry[] = [];
    for (const field of Object.keys(properties) as (keyof Evidence)[]) {
      const oldValue = before[field] ?? (field === "reliability" ? "unknown" : null);
      const newValue = after[field] ?? (field === "reliability" ? "unknown" : null);
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        entries.push({ source: "event", property: properties[field]!, oldValue, newValue,
          changedAt: new Date().toISOString(), changedBy: "Local Investigator" });
      }
    }
    const histories = this.evidenceHistory.get(caseId) ?? new Map<string, HistoryEntry[]>();
    histories.set(before.id, [...entries, ...(histories.get(before.id) ?? [])]);
    this.evidenceHistory.set(caseId, histories);
  }
  private caseHistory = new Map<string, HistoryEntry[]>();

  getCaseHistory(caseId: string): Promise<HistoryEntry[]> {
    this.data(caseId);
    return delay([...(this.caseHistory.get(caseId) ?? [])]);
  }
  private cases: CaseSummary[] = [{ id: "1", name: mockCaseName, description: "Demo case" }];
  private nextCaseSeq = 2;
  private caseData = new Map<string, { subjects: Subject[]; evidence: Evidence[]; analysis: CaseAnalysis }>([
    ["1", {
      subjects: [...mockSubjects],
      evidence: [...mockEvidence],
      analysis: {
        conflicts: [...mockConflicts],
        gaps: [...mockGaps],
        corroborations: [...mockCorroborations],
        aiSuggestions: mockAiSuggestions.map((s) => ({ ...s })),
      },
    }],
  ]);

  private data(caseId: string) {
    const data = this.caseData.get(caseId);
    if (!data) throw new Error("Case not found");
    return data;
  }

  getCases(): Promise<CaseSummary[]> {
    return delay([...this.cases]);
  }

  createCase(input: { name: string; description?: string }): Promise<CaseSummary> {
    const created = { id: String(this.nextCaseSeq++), name: input.name, description: input.description };
    this.cases.push(created);
    this.caseData.set(created.id, {
      subjects: [],
      evidence: [],
      analysis: { conflicts: [], gaps: [], corroborations: [], aiSuggestions: [] },
    });
    return delay(created);
  }

  updateCase(caseId: string, input: CaseUpdate): Promise<CaseSummary> {
    const index = this.cases.findIndex((c) => c.id === caseId);
    if (index < 0) return Promise.reject(new Error("Case not found"));
    const current = this.cases[index];
    this.cases[index] = {
      ...current,
      name: input.name ?? current.name,
      description: input.description === undefined ? current.description : input.description ?? undefined,
      status: input.status ?? current.status,
    };
    const updated = this.cases[index];
    const changedAt = new Date().toISOString();
    const entries: HistoryEntry[] = [];
    for (const [field, property] of [["name", "case_name"], ["description", "description"], ["status", "case_status"]] as const) {
      const oldValue = field === "status" ? current[field] ?? "open" : current[field] ?? null;
      const newValue = field === "status" ? updated[field] ?? "open" : updated[field] ?? null;
      if (oldValue !== newValue) {
        entries.push({ source: "case", property, oldValue, newValue, changedAt, changedBy: "Local Investigator" });
      }
    }
    this.caseHistory.set(caseId, [...entries, ...(this.caseHistory.get(caseId) ?? [])]);
    return delay(updated);
  }

  deleteCase(caseId: string): Promise<void> {
    this.cases = this.cases.filter((c) => c.id !== caseId);
    this.caseData.delete(caseId);
    this.caseHistory.delete(caseId);
    this.evidenceHistory.delete(caseId);
    return delay(undefined);
  }

  seedDemoCase(): Promise<CaseSummary> {
    return delay(this.cases[0]);
  }

  getCaseName(caseId: string): Promise<string> {
    return delay(this.cases.find((c) => c.id === caseId)?.name ?? "");
  }

  getSubjects(caseId: string): Promise<Subject[]> {
    return delay([...this.data(caseId).subjects]);
  }

  addSubject(caseId: string, input: SubjectInput): Promise<Subject> {
    const created: Subject = { ...input, id: `subject-new-${nextEvidenceSeq++}` };
    this.data(caseId).subjects.push(created);
    return delay(created);
  }

  updateSubject(caseId: string, id: string, input: Partial<SubjectInput>): Promise<Subject> {
    const index = this.data(caseId).subjects.findIndex((s) => s.id === id);
    if (index < 0) return Promise.reject(new Error("Subject not found"));
    this.data(caseId).subjects[index] = { ...this.data(caseId).subjects[index], ...input };
    return delay(this.data(caseId).subjects[index]);
  }

  removeSubject(caseId: string, id: string): Promise<void> {
    if (this.data(caseId).evidence.some((e) => e.subjectId === id)) {
      return Promise.reject(new Error("This subject still has evidence. Reassign or remove it first."));
    }
    this.data(caseId).subjects = this.data(caseId).subjects.filter((s) => s.id !== id);
    return delay(undefined);
  }

  getEvidence(caseId: string): Promise<Evidence[]> {
    return delay([...this.data(caseId).evidence]);
  }

  addEvidence(caseId: string, input: Omit<Evidence, "id">): Promise<Evidence> {
    const created: Evidence = { ...input, id: `ev-new-${nextEvidenceSeq++}` };
    this.data(caseId).evidence.push(created);
    return delay(created);
  }

  updateEvidence(caseId: string, id: string, input: Omit<Evidence, "id">): Promise<Evidence> {
    const current = this.data(caseId).evidence.find((e) => e.id === id);
    if (!current) return Promise.reject(new Error("Evidence not found"));
    const updated: Evidence = { ...current, ...input, id };
    this.recordEvidenceChanges(caseId, current, updated);
    this.data(caseId).evidence = this.data(caseId).evidence.map((e) => (e.id === id ? updated : e));
    return delay(updated);
  }

  setReliability(caseId: string, id: string, reliability: Reliability): Promise<Evidence> {
    const current = this.data(caseId).evidence.find((e) => e.id === id);
    if (!current) return Promise.reject(new Error("Evidence not found"));
    const updated: Evidence = { ...current, reliability };
    this.recordEvidenceChanges(caseId, current, updated);
    this.data(caseId).evidence = this.data(caseId).evidence.map((e) => (e.id === id ? updated : e));
    return delay(updated);
  }

  removeEvidence(caseId: string, id: string): Promise<void> {
    this.data(caseId).evidence = this.data(caseId).evidence.filter((e) => e.id !== id);
    return delay(undefined);
  }

  getAnalysis(caseId: string): Promise<CaseAnalysis> {
    return delay({
      conflicts: [...this.data(caseId).analysis.conflicts],
      gaps: [...this.data(caseId).analysis.gaps],
      corroborations: [...this.data(caseId).analysis.corroborations],
      aiSuggestions: this.data(caseId).analysis.aiSuggestions.map((s) => ({ ...s })),
    });
  }

  updateSuggestionStatus(id: string, status: AiSuggestionStatus, caseId: string): Promise<void> {
    const suggestion = this.data(caseId).analysis.aiSuggestions.find((s) => s.id === id);
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

/** One recorded change from the database's property-history tables. */
export interface HistoryEntry {
  source: "evidence" | "event" | "case";
  property: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: string;
  changedBy: string | null;
}

export function getEvidenceHistory(caseId: string, evidenceId: string): Promise<HistoryEntry[]> {
  return caseWebApi.getEvidenceHistory(caseId, evidenceId);
}

export function getCaseHistory(caseId: string): Promise<HistoryEntry[]> {
  return caseWebApi.getCaseHistory(caseId);
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
  getEvidenceHistory(caseId: string, evidenceId: string): Promise<HistoryEntry[]> {
    return request<HistoryEntry[]>(`/cases/${caseId}/evidence/${evidenceId}/history`);
  }

  getCaseHistory(caseId: string): Promise<HistoryEntry[]> {
    return request<HistoryEntry[]>(`/cases/${caseId}/history`);
  }

  getCases(): Promise<CaseSummary[]> {
    return request<CaseSummary[]>("/cases");
  }

  createCase(input: { name: string; description?: string }): Promise<CaseSummary> {
    return request<CaseSummary>("/cases", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateCase(caseId: string, input: CaseUpdate): Promise<CaseSummary> {
    return request<CaseSummary>(`/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(input) });
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
    const c = await request<{ name: string }>(`/cases/${caseId}`);
    return c.name;
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

  setReliability(caseId: string, id: string, reliability: Reliability): Promise<Evidence> {
    return request<Evidence>(`/cases/${caseId}/evidence/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ reliability }),
    });
  }

  removeEvidence(caseId: string, id: string): Promise<void> {
    return request<void>(`/cases/${caseId}/evidence/${id}`, {
      method: "DELETE",
    });
  }

  getAnalysis(_caseId: string): Promise<CaseAnalysis> {
    return Promise.resolve({
      conflicts: [],
      gaps: [],
      corroborations: [],
      aiSuggestions: [],
    });
  }

  updateSuggestionStatus(_id: string, _status: AiSuggestionStatus, _caseId: string): Promise<void> {
    return Promise.reject(new Error("Saving AI suggestion decisions is not implemented yet"));
  }
}

export const isMockMode = import.meta.env.VITE_USE_MOCK === "true";
export const caseWebApi: CaseWebApi = isMockMode ? new MockCaseWebApi() : new HttpCaseWebApi();
