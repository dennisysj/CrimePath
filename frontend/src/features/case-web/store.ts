import { create } from "zustand";
import { caseWebApi } from "./api";
import type { AiSuggestionStatus, CaseAnalysis, Evidence, Subject } from "./types";

const EMPTY_ANALYSIS: CaseAnalysis = {
  conflicts: [],
  gaps: [],
  corroborations: [],
  aiSuggestions: [],
};

export type Selection = { type: "evidence"; id: string } | { type: "subject"; id: string } | null;

interface CaseWebState {
  caseName: string;
  subjects: Subject[];
  evidence: Evidence[];
  analysis: CaseAnalysis;
  loading: boolean;
  selection: Selection;
  /** Evidence ids added during this session, so the timeline can fade them in once. */
  newEvidenceIds: Set<string>;
  load: () => Promise<void>;
  addEvidence: (input: Omit<Evidence, "id">) => Promise<void>;
  removeEvidence: (id: string) => Promise<void>;
  updateSuggestionStatus: (id: string, status: AiSuggestionStatus) => Promise<void>;
  selectEvidence: (id: string) => void;
  selectSubject: (id: string) => void;
  clearSelection: () => void;
}

const NEW_EVIDENCE_HIGHLIGHT_MS = 1000;

export const useCaseWebStore = create<CaseWebState>((set, get) => ({
  caseName: "",
  subjects: [],
  evidence: [],
  analysis: EMPTY_ANALYSIS,
  loading: true,
  selection: null,
  newEvidenceIds: new Set(),

  load: async () => {
    set({ loading: true });
    const [caseName, subjects, evidence, analysis] = await Promise.all([
      caseWebApi.getCaseName(),
      caseWebApi.getSubjects(),
      caseWebApi.getEvidence(),
      caseWebApi.getAnalysis(),
    ]);
    set({ caseName, subjects, evidence, analysis, loading: false });
  },

  addEvidence: async (input) => {
    const created = await caseWebApi.addEvidence(input);
    set((state) => ({
      evidence: [...state.evidence, created],
      newEvidenceIds: new Set(state.newEvidenceIds).add(created.id),
    }));
    setTimeout(() => {
      set((state) => {
        const next = new Set(state.newEvidenceIds);
        next.delete(created.id);
        return { newEvidenceIds: next };
      });
    }, NEW_EVIDENCE_HIGHLIGHT_MS);
  },

  removeEvidence: async (id) => {
    await caseWebApi.removeEvidence(id);
    set((state) => ({
      evidence: state.evidence.filter((e) => e.id !== id),
      selection: state.selection?.type === "evidence" && state.selection.id === id ? null : state.selection,
    }));
  },

  updateSuggestionStatus: async (id, status) => {
    await caseWebApi.updateSuggestionStatus(id, status);
    set({
      analysis: {
        ...get().analysis,
        aiSuggestions: get().analysis.aiSuggestions.map((s) =>
          s.id === id ? { ...s, status } : s
        ),
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
}));
