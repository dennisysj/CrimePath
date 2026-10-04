import { create } from "zustand";
import { caseWebApi, type CaseUpdate, type SubjectInput } from "./api";
import {
  aiSuggestions as mockAiSuggestions,
  caseName as mockCaseName,
  conflicts as mockConflicts,
  corroborations as mockCorroborations,
  evidence as mockEvidence,
  gaps as mockGaps,
  subjects as mockSubjects,
} from "./mockData";
import type { AiSuggestionStatus, CaseAnalysis, CaseSummary, Evidence, Reliability, Subject } from "./types";

const EMPTY_ANALYSIS: CaseAnalysis = {
  conflicts: [],
  gaps: [],
  corroborations: [],
  aiSuggestions: [],
};

export type Selection = { type: "evidence"; id: string } | { type: "subject"; id: string } | null;

type EvidenceInput = Omit<Evidence, "id">;

interface CaseWebState {
  cases: CaseSummary[];
  selectedCaseId: string;
  caseName: string;
  subjects: Subject[];
  evidence: Evidence[];
  analysis: CaseAnalysis;
  loading: boolean;
  error: string | null;
  selection: Selection;
  /** Evidence ids added during this session, so the timeline can fade them in once. */
  newEvidenceIds: Set<string>;
  load: () => Promise<void>;
  selectCase: (id: string) => Promise<void>;
  createCase: (input: { name: string; description?: string }) => Promise<void>;
  updateCase: (input: CaseUpdate) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  addSubject: (input: SubjectInput) => Promise<Subject>;
  updateSubject: (id: string, input: Partial<SubjectInput>) => Promise<void>;
  removeSubject: (id: string) => Promise<void>;
  addEvidence: (input: EvidenceInput) => Promise<void>;
  updateEvidence: (id: string, input: EvidenceInput) => Promise<void>;
  setReliability: (id: string, reliability: Reliability) => Promise<void>;
  removeEvidence: (id: string) => Promise<void>;
  updateSuggestionStatus: (id: string, status: AiSuggestionStatus) => Promise<void>;
  selectEvidence: (id: string) => void;
  selectSubject: (id: string) => void;
  clearSelection: () => void;
  clearError: () => void;
}

const NEW_EVIDENCE_HIGHLIGHT_MS = 1000;
/** The built-in demo case lives only in the browser; every other case is stored in TigerData. */
export const SAMPLE_CASE_ID = "sample-case";
const DEMO_CASE: CaseSummary = { id: SAMPLE_CASE_ID, name: `${mockCaseName} (demo, not saved)`, description: "Original fake test case" };
const DEMO_ANALYSIS: CaseAnalysis = {
  conflicts: [...mockConflicts],
  gaps: [...mockGaps],
  corroborations: [...mockCorroborations],
  aiSuggestions: mockAiSuggestions.map((s) => ({ ...s })),
};
const LAST_CASE_KEY = "crimepath:lastCaseId";

let nextLocalSeq = 1;

function withSampleCase(cases: CaseSummary[]): CaseSummary[] {
  return [...cases.filter((c) => c.id !== DEMO_CASE.id), DEMO_CASE];
}

function sampleCaseState(): Partial<CaseWebState> {
  return {
    selectedCaseId: SAMPLE_CASE_ID,
    caseName: mockCaseName,
    subjects: [...mockSubjects],
    evidence: [...mockEvidence],
    analysis: DEMO_ANALYSIS,
    selection: null,
  };
}

function rememberCase(id: string) {
  try {
    localStorage.setItem(LAST_CASE_KEY, id);
  } catch {
    // Storage unavailable; just don't remember.
  }
}

function rememberedCase(): string | null {
  try {
    return localStorage.getItem(LAST_CASE_KEY);
  } catch {
    return null;
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const useCaseWebStore = create<CaseWebState>((set, get) => {
  const isDemo = () => get().selectedCaseId === SAMPLE_CASE_ID;

  /**
   * Run a database write. On failure, surface the error in the banner and
   * rethrow so the calling form can stay open; local state is only changed
   * by the caller after this resolves, so the UI never shows unsaved data.
   */
  async function persist<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      set({ error: null });
      return result;
    } catch (error) {
      set({ error: `${label}: ${messageOf(error, "backend unavailable")}` });
      throw error;
    }
  }

  function flashNewEvidence(id: string) {
    set((state) => ({ newEvidenceIds: new Set(state.newEvidenceIds).add(id) }));
    setTimeout(() => {
      set((state) => {
        const next = new Set(state.newEvidenceIds);
        next.delete(id);
        return { newEvidenceIds: next };
      });
    }, NEW_EVIDENCE_HIGHLIGHT_MS);
  }

  async function loadCase(cases: CaseSummary[], caseId: string) {
    if (caseId === SAMPLE_CASE_ID) {
      set({ cases, ...sampleCaseState(), loading: false });
      return;
    }
    const [caseName, subjects, evidence, analysis] = await Promise.all([
      caseWebApi.getCaseName(caseId),
      caseWebApi.getSubjects(caseId),
      caseWebApi.getEvidence(caseId),
      caseWebApi.getAnalysis(caseId),
    ]);
    rememberCase(caseId);
    set({ cases, selectedCaseId: caseId, caseName, subjects, evidence, analysis, selection: null, loading: false });
  }

  return {
    cases: [],
    selectedCaseId: "",
    caseName: "",
    subjects: [],
    evidence: [],
    analysis: EMPTY_ANALYSIS,
    loading: true,
    error: null,
    selection: null,
    newEvidenceIds: new Set(),

    load: async () => {
      set({ loading: true, error: null });
      try {
        const cases = withSampleCase(await caseWebApi.getCases());
        const preferred = [get().selectedCaseId, rememberedCase()].find(
          (id) => id && cases.some((c) => c.id === id)
        );
        await loadCase(cases, preferred ?? cases[0].id);
      } catch (error) {
        set({
          cases: [DEMO_CASE],
          ...sampleCaseState(),
          loading: false,
          error: `Can't reach the database, showing the demo case (changes won't be saved). ${messageOf(
            error,
            "Failed to load case data"
          )}`,
        });
      }
    },

    selectCase: async (id) => {
      set({ error: null });
      try {
        await loadCase(get().cases, id);
      } catch (error) {
        set({ error: `Failed to load case: ${messageOf(error, "backend unavailable")}` });
      }
    },

    createCase: async (input) => {
      const created = await persist("Couldn't create case", () => caseWebApi.createCase(input));
      await loadCase(withSampleCase([created, ...get().cases]), created.id);
    },

    updateCase: async (input) => {
      if (isDemo()) return;
      const updated = await persist("Couldn't update case", () => caseWebApi.updateCase(get().selectedCaseId, input));
      set((state) => ({
        caseName: updated.name,
        cases: state.cases.map((c) => (c.id === updated.id ? { ...c, ...updated, description: updated.description ?? undefined } : c)),
      }));
    },

    deleteCase: async (id) => {
      if (id === SAMPLE_CASE_ID) return;
      await persist("Couldn't delete case", () => caseWebApi.deleteCase(id));
      const remaining = get().cases.filter((c) => c.id !== id);
      await loadCase(remaining, remaining[0].id);
    },

    addSubject: async (input) => {
      const created = isDemo()
        ? { ...input, id: `local-subject-${nextLocalSeq++}` }
        : await persist("Couldn't add subject", () => caseWebApi.addSubject(get().selectedCaseId, input));
      set((state) => ({ subjects: [...state.subjects, created] }));
      return created;
    },

    updateSubject: async (id, input) => {
      const current = get().subjects.find((s) => s.id === id);
      if (!current) return;
      const updated = isDemo()
        ? { ...current, ...input }
        : await persist("Couldn't update subject", () =>
            caseWebApi.updateSubject(get().selectedCaseId, id, input)
          );
      set((state) => ({ subjects: state.subjects.map((s) => (s.id === id ? updated : s)) }));
    },

    removeSubject: async (id) => {
      if (isDemo()) {
        const count = get().evidence.filter((e) => e.subjectId === id).length;
        if (count > 0) {
          const message = `This subject still has ${count} evidence item${count === 1 ? "" : "s"}. Reassign or remove them first.`;
          set({ error: `Couldn't delete subject: ${message}` });
          throw new Error(message);
        }
      } else {
        await persist("Couldn't delete subject", () => caseWebApi.removeSubject(get().selectedCaseId, id));
      }
      set((state) => ({
        subjects: state.subjects.filter((s) => s.id !== id),
        selection: state.selection?.type === "subject" && state.selection.id === id ? null : state.selection,
      }));
    },

    addEvidence: async (input) => {
      const created = isDemo()
        ? { ...input, id: `local-${nextLocalSeq++}` }
        : await persist("Couldn't save evidence", () => caseWebApi.addEvidence(get().selectedCaseId, input));
      const analysis = isDemo() ? get().analysis : await persist("Couldn't refresh analysis", () => caseWebApi.getAnalysis(get().selectedCaseId));
      set((state) => ({ evidence: [...state.evidence, created], analysis }));
      flashNewEvidence(created.id);
    },

    updateEvidence: async (id, input) => {
      const current = get().evidence.find((e) => e.id === id);
      const updated = isDemo()
        ? { ...current, ...input, id }
        : await persist("Couldn't update evidence", () =>
            caseWebApi.updateEvidence(get().selectedCaseId, id, input)
          );
      set((state) => ({ evidence: state.evidence.map((e) => (e.id === id ? updated : e)) }));
    },

    setReliability: async (id, reliability) => {
      const current = get().evidence.find((e) => e.id === id);
      if (!current) return;
      const updated = isDemo()
        ? { ...current, reliability }
        : await persist("Couldn't update reliability", () =>
            caseWebApi.setReliability(get().selectedCaseId, id, reliability)
          );
      set((state) => ({ evidence: state.evidence.map((e) => (e.id === id ? updated : e)) }));
    },

    removeEvidence: async (id) => {
      if (!isDemo()) {
        await persist("Couldn't remove evidence", () => caseWebApi.removeEvidence(get().selectedCaseId, id));
      }
      const analysis = isDemo() ? get().analysis : await persist("Couldn't refresh analysis", () => caseWebApi.getAnalysis(get().selectedCaseId));
      set((state) => ({
        evidence: state.evidence.filter((e) => e.id !== id),
        analysis,
        selection: state.selection?.type === "evidence" && state.selection.id === id ? null : state.selection,
      }));
    },

    updateSuggestionStatus: async (id, status) => {
      if (!isDemo()) {
        await persist("Couldn't save suggestion decision", () =>
          caseWebApi.updateSuggestionStatus(id, status, get().selectedCaseId)
        );
      }
      set({
        analysis: {
          ...get().analysis,
          aiSuggestions: get().analysis.aiSuggestions.map((s) => (s.id === id ? { ...s, status } : s)),
        },
      });
    },

    selectEvidence: (id) =>
      set((state) =>
        state.selection?.type === "evidence" && state.selection.id === id
          ? { selection: null }
          : { selection: { type: "evidence", id } }
      ),

    selectSubject: (id) =>
      set((state) =>
        state.selection?.type === "subject" && state.selection.id === id
          ? { selection: null }
          : { selection: { type: "subject", id } }
      ),

    clearSelection: () => set({ selection: null }),
    clearError: () => set({ error: null }),
  };
});
