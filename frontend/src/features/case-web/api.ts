import type { AiSuggestionStatus, CaseAnalysis, Evidence, Subject } from "./types";
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
  getCaseName(): Promise<string>;
  getSubjects(): Promise<Subject[]>;
  addSubject(input: Omit<Subject, "id">): Promise<Subject>; // ADDED line 15: new-subject support for the Add Evidence wizard (step 2)
  getEvidence(): Promise<Evidence[]>;
  addEvidence(input: Omit<Evidence, "id">): Promise<Evidence>;
  removeEvidence(id: string): Promise<void>;
  getAnalysis(): Promise<CaseAnalysis>;
  updateSuggestionStatus(id: string, status: AiSuggestionStatus): Promise<void>;
}

const MOCK_DELAY_MS = 300;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS));
}

let nextEvidenceSeq = 1;
let nextSubjectSeq = 1; // ADDED: id counter for subjects created via the wizard's "+ New subject" form

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
  private subjects: Subject[] = [...mockSubjects];
  private evidence: Evidence[] = [...mockEvidence];
  private analysis: CaseAnalysis = {
    conflicts: [...mockConflicts],
    gaps: [...mockGaps],
    corroborations: [...mockCorroborations],
    aiSuggestions: mockAiSuggestions.map((s) => ({ ...s })),
  };

  getCaseName(): Promise<string> {
    return delay(mockCaseName);
  }

  getSubjects(): Promise<Subject[]> {
    return delay([...this.subjects]);
  }

  // ADDED lines 59-63: addSubject, mirrors addEvidence's pattern
  addSubject(input: Omit<Subject, "id">): Promise<Subject> {
    const created: Subject = { ...input, id: `subject-new-${nextSubjectSeq++}` };
    this.subjects.push(created);
    return delay(created);
  }

  getEvidence(): Promise<Evidence[]> {
    return delay([...this.evidence]);
  }

  addEvidence(input: Omit<Evidence, "id">): Promise<Evidence> {
    const created: Evidence = { ...input, id: `ev-new-${nextEvidenceSeq++}` };
    this.evidence.push(created);
    return delay(created);
  }

  removeEvidence(id: string): Promise<void> {
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

// TODO: swap this for an HttpCaseWebApi implementing the same CaseWebApi
// interface (fetch against import.meta.env.VITE_API_URL) once the backend
// endpoints exist. Everything in this feature consumes `caseWebApi`
// through the interface above, so that swap should only touch this file.
export const caseWebApi: CaseWebApi = new MockCaseWebApi();
