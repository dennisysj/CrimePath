import { randomUUID } from "node:crypto";
import * as demo from "./data/demoCase.js";
import type { AiSuggestionStatus, CaseAnalysis, Evidence } from "./data/demoCase.js";
import { computeConflicts, computeGaps } from "./services/conflictEngine.js";

// In-memory only - resets on restart. Stands in for the real Postgres-backed
// store. corroborations/aiSuggestions stay as the hardcoded demo values
// (no engine for those yet); conflicts/gaps are recomputed (Gemini-judged
// feasibility + plain-arithmetic gap detection) whenever evidence changes.
let evidence: Evidence[] = [...demo.evidence];
let conflicts: CaseAnalysis["conflicts"] = [...demo.conflicts];
let gaps: CaseAnalysis["gaps"] = [...demo.gaps];
const corroborations = [...demo.corroborations];
const aiSuggestions = demo.aiSuggestions.map((s) => ({ ...s }));

let recomputed = false;

async function recomputeConflictsAndGaps(): Promise<void> {
  const [newConflicts, newGaps] = await Promise.all([
    computeConflicts(evidence),
    Promise.resolve(computeGaps(evidence)),
  ]);
  conflicts = newConflicts;
  gaps = newGaps;
  recomputed = true;
}

export function getCaseName(): string {
  return demo.caseName;
}

export function getIncidentDate(): string {
  return demo.incidentDate;
}

export function getSubjects() {
  return demo.subjects;
}

export function getEvidence(): Evidence[] {
  return evidence;
}

export async function addEvidence(input: Omit<Evidence, "id">): Promise<Evidence> {
  const created: Evidence = { ...input, id: randomUUID() };
  evidence = [...evidence, created];
  await recomputeConflictsAndGaps();
  return created;
}

export async function removeEvidence(id: string): Promise<void> {
  evidence = evidence.filter((e) => e.id !== id);
  await recomputeConflictsAndGaps();
}

/**
 * Lazily recomputes conflicts/gaps from the live (Gemini-judged) engine on
 * first call instead of at import time, so server startup isn't blocked on
 * ~7 Gemini calls. Every call after that serves the cache, refreshed only
 * when evidence actually changes (see add/removeEvidence above).
 */
export async function getAnalysis(): Promise<CaseAnalysis> {
  if (!recomputed) {
    await recomputeConflictsAndGaps();
  }
  return { conflicts, gaps, corroborations, aiSuggestions };
}

export function updateSuggestionStatus(id: string, status: AiSuggestionStatus): void {
  const suggestion = aiSuggestions.find((s) => s.id === id);
  if (suggestion) suggestion.status = status;
}
