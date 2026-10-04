import { create } from "zustand";
import { caseWebApi, type CaseUpdate, type CrimeInput, type SubjectInput } from "./api";
import type { AiSuggestionStatus, CaseAnalysis, CaseSummary, Crime, Evidence, Reliability, Subject } from "./types";

const EMPTY_ANALYSIS: CaseAnalysis = {
  conflicts: [],
  gaps: [],
  corroborations: [],
  aiSuggestions: [],
};

export type Selection = { type: "evidence"; id: string } | { type: "subject"; id: string } | null;

/** True if the evidence belongs to, or involves, any of the given subjects. Empty filter matches everything. */
export function matchesSubjectFilter(evidence: Evidence, subjectIds: string[]): boolean {
  if (subjectIds.length === 0) return true;
  return (
    subjectIds.includes(evidence.subjectId) ||
    (evidence.involvedParties ?? []).some((p) => subjectIds.includes(p.subjectId))
  );
}

type EvidenceInput = Omit<Evidence, "id">;

interface CaseWebState {
  cases: CaseSummary[];
  selectedCaseId: string;
  caseName: string;
  subjects: Subject[];
  evidence: Evidence[];
  /** When/where the crime itself happened — drawn as bands on the timeline. */
  crimes: Crime[];
  analysis: CaseAnalysis;
  loading: boolean;
  error: string | null;
  selection: Selection;
  /** Subjects the evidence list, timeline and event path are filtered to. Empty = all subjects. */
  subjectFilter: string[];
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
  addCrime: (input: CrimeInput) => Promise<void>;
  updateCrime: (id: string, input: CrimeInput) => Promise<void>;
  removeCrime: (id: string) => Promise<void>;
  selectEvidence: (id: string) => void;
  selectSubject: (id: string) => void;
  toggleSubjectFilter: (id: string) => void;
  clearSubjectFilter: () => void;
  clearSelection: () => void;
  clearError: () => void;
}

const NEW_EVIDENCE_HIGHLIGHT_MS = 1000;
const SEEDED_CASE_NUMBER = "CASE-001";
const SEEDED_CASE_NAME = "sample case";
const SEEDED_CASE_VERSION = "case-001-rich-2026-10-03-v1";
const SEEDED_CASE_VERSION_KEY = "crimepath:seededCase001Version";
const LAST_CASE_KEY = "crimepath:lastCaseId";

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

function rememberSeedVersion() {
  try {
    localStorage.setItem(SEEDED_CASE_VERSION_KEY, SEEDED_CASE_VERSION);
  } catch {
    // Storage unavailable; the backend case still exists.
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const useCaseWebStore = create<CaseWebState>((set, get) => {
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
    const [caseName, subjects, evidence, analysis, crimes] = await Promise.all([
      caseWebApi.getCaseName(caseId),
      caseWebApi.getSubjects(caseId),
      caseWebApi.getEvidence(caseId),
      caseWebApi.getAnalysis(caseId),
      caseWebApi.getCrimes(caseId),
    ]);
    rememberCase(caseId);
    set({ cases, selectedCaseId: caseId, caseName, subjects, evidence, crimes, analysis, selection: null, subjectFilter: [], loading: false });
  }

  return {
    cases: [],
    selectedCaseId: "",
    caseName: "",
    subjects: [],
    evidence: [],
    crimes: [],
    analysis: EMPTY_ANALYSIS,
    loading: true,
    error: null,
    selection: null,
    subjectFilter: [],
    newEvidenceIds: new Set(),

    load: async () => {
      set({ loading: true, error: null });
      try {
        let cases = await caseWebApi.getCases();
        let seededCase = cases.find((c) => c.caseNumber === SEEDED_CASE_NUMBER || c.name.toLowerCase() === SEEDED_CASE_NAME);
        // Seed the sample case only when it doesn't exist. Never re-seed an
        // existing one: seeding wipes the case, which would bring back
        // anything the investigator deleted and drop anything they added.
        if (!seededCase) {
          seededCase = await caseWebApi.seedSampleCase();
          rememberSeedVersion();
          cases = await caseWebApi.getCases();
        }
        const preferred = [get().selectedCaseId, rememberedCase()].find(
          (id) => id && cases.some((c) => c.id === id)
        );
        await loadCase(cases, preferred ?? seededCase.id);
      } catch (error) {
        set({
          cases: [],
          selectedCaseId: "",
          caseName: "",
          subjects: [],
          evidence: [],
          crimes: [],
          analysis: EMPTY_ANALYSIS,
          selection: null,
          loading: false,
          error: `Can't reach the database or create CASE-001. ${messageOf(
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
      await loadCase([created, ...get().cases], created.id);
    },

    updateCase: async (input) => {
      const updated = await persist("Couldn't update case", () => caseWebApi.updateCase(get().selectedCaseId, input));
      set((state) => ({
        caseName: updated.name,
        cases: state.cases.map((c) => (c.id === updated.id ? { ...c, ...updated, description: updated.description ?? undefined } : c)),
      }));
    },

    deleteCase: async (id) => {
      await persist("Couldn't delete case", () => caseWebApi.deleteCase(id));
      const remaining = get().cases.filter((c) => c.id !== id);
      if (remaining.length > 0) await loadCase(remaining, remaining[0].id);
      else await get().load();
    },

    addSubject: async (input) => {
      const created = await persist("Couldn't add subject", () => caseWebApi.addSubject(get().selectedCaseId, input));
      set((state) => ({ subjects: [...state.subjects, created] }));
      return created;
    },

    updateSubject: async (id, input) => {
      const current = get().subjects.find((s) => s.id === id);
      if (!current) return;
      const updated = await persist("Couldn't update subject", () =>
            caseWebApi.updateSubject(get().selectedCaseId, id, input)
          );
      set((state) => ({ subjects: state.subjects.map((s) => (s.id === id ? updated : s)) }));
    },

    removeSubject: async (id) => {
      await persist("Couldn't delete subject", () => caseWebApi.removeSubject(get().selectedCaseId, id));
      // The subject's evidence went with it, so drop those cards, unlink it elsewhere, and refresh the analysis.
      const analysis = await persist("Couldn't refresh analysis", () => caseWebApi.getAnalysis(get().selectedCaseId));
      set((state) => ({
        analysis,
        evidence: state.evidence
          .filter((e) => e.subjectId !== id)
          .map((e) => ({ ...e, involvedParties: (e.involvedParties ?? []).filter((p) => p.subjectId !== id) })),
        subjects: state.subjects.filter((s) => s.id !== id),
        subjectFilter: state.subjectFilter.filter((s) => s !== id),
        // Deselect the subject itself, or a card of theirs that was just deleted.
        selection:
          (state.selection?.type === "subject" && state.selection.id === id) ||
          (state.selection?.type === "evidence" &&
            state.evidence.some((e) => e.id === state.selection!.id && e.subjectId === id))
            ? null
            : state.selection,
      }));
    },

    addEvidence: async (input) => {
      const created = await persist("Couldn't save evidence", () => caseWebApi.addEvidence(get().selectedCaseId, input));
      const analysis = await persist("Couldn't refresh analysis", () => caseWebApi.getAnalysis(get().selectedCaseId));
      set((state) => ({ evidence: [...state.evidence, created], analysis }));
      flashNewEvidence(created.id);
    },

    updateEvidence: async (id, input) => {
      const current = get().evidence.find((e) => e.id === id);
      const updated = await persist("Couldn't update evidence", () =>
            caseWebApi.updateEvidence(get().selectedCaseId, id, input)
          );
      set((state) => ({ evidence: state.evidence.map((e) => (e.id === id ? updated : e)) }));
    },

    setReliability: async (id, reliability) => {
      const current = get().evidence.find((e) => e.id === id);
      if (!current) return;
      const updated = await persist("Couldn't update reliability", () =>
            caseWebApi.setReliability(get().selectedCaseId, id, reliability)
          );
      set((state) => ({ evidence: state.evidence.map((e) => (e.id === id ? updated : e)) }));
    },

    removeEvidence: async (id) => {
      await persist("Couldn't remove evidence", () => caseWebApi.removeEvidence(get().selectedCaseId, id));
      const analysis = await persist("Couldn't refresh analysis", () => caseWebApi.getAnalysis(get().selectedCaseId));
      set((state) => ({
        evidence: state.evidence.filter((e) => e.id !== id),
        analysis,
        selection: state.selection?.type === "evidence" && state.selection.id === id ? null : state.selection,
      }));
    },

    updateSuggestionStatus: async (id, status) => {
      await persist("Couldn't save suggestion decision", () =>
        caseWebApi.updateSuggestionStatus(id, status, get().selectedCaseId)
      );
      set({
        analysis: {
          ...get().analysis,
          aiSuggestions: get().analysis.aiSuggestions.map((s) => (s.id === id ? { ...s, status } : s)),
        },
      });
    },

    addCrime: async (input) => {
      const created = await persist("Couldn't save crime", () => caseWebApi.addCrime(get().selectedCaseId, input));
      set((state) => ({ crimes: [...state.crimes, created] }));
    },

    updateCrime: async (id, input) => {
      const updated = await persist("Couldn't update crime", () => caseWebApi.updateCrime(get().selectedCaseId, id, input));
      set((state) => ({ crimes: state.crimes.map((c) => (c.id === id ? updated : c)) }));
    },

    removeCrime: async (id) => {
      await persist("Couldn't remove crime", () => caseWebApi.removeCrime(get().selectedCaseId, id));
      set((state) => ({ crimes: state.crimes.filter((c) => c.id !== id) }));
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

    toggleSubjectFilter: (id) =>
      set((state) => {
        const subjectFilter = state.subjectFilter.includes(id)
          ? state.subjectFilter.filter((s) => s !== id)
          : [...state.subjectFilter, id];
        // A selected card that the new filter hides is deselected.
        const selected = state.selection?.type === "evidence" ? state.evidence.find((e) => e.id === state.selection!.id) : undefined;
        const selection = selected && !matchesSubjectFilter(selected, subjectFilter) ? null : state.selection;
        return { subjectFilter, selection };
      }),

    clearSubjectFilter: () => set({ subjectFilter: [] }),

    clearSelection: () => set({ selection: null }),
    clearError: () => set({ error: null }),
  };
});
