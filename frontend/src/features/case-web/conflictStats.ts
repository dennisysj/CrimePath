import type { CaseAnalysis, Evidence } from "./types";

/**
 * Genuine (not resolved-by-uncertainty) conflicts per subject, counted once
 * per conflict per distinct subject it touches.
 *
 * Not once per evidence id: a conflict's two evidence ids usually belong to
 * the SAME person (their own timeline is internally inconsistent), so
 * naively looping both ids double-counts the common case. A conflict only
 * counts if both sides resolve to a subject within the given evidence list
 * (so callers can scope this to a filtered subset), and credits every
 * distinct subject it touches - one for a same-subject conflict, both for
 * a genuinely cross-subject one.
 */
export function countConflictsBySubject(
  conflicts: CaseAnalysis["conflicts"],
  evidence: Evidence[]
): Map<string, number> {
  const evidenceSubject = new Map(evidence.map((e) => [e.id, e.subjectId]));
  const counts = new Map<string, number>();

  for (const c of conflicts) {
    if (c.resolvedByUncertainty) continue;
    const [aId, bId] = c.evidenceIds;
    const aSubject = evidenceSubject.get(aId);
    const bSubject = evidenceSubject.get(bId);
    if (!aSubject || !bSubject) continue;

    for (const subjectId of new Set([aSubject, bSubject])) {
      counts.set(subjectId, (counts.get(subjectId) ?? 0) + 1);
    }
  }

  return counts;
}
