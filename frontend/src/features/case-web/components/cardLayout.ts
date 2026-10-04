import type { CaseAnalysis, Evidence, InvolvedRole, Subject } from "../types";
import { ROLE_LABELS } from "../types";

export const CARD_WIDTH = 112;
export const CARD_HEIGHT = 100;
export const COLUMN_GAP = 20;
export const LANE_GAP = 60;
export const LANE_LABEL_HEIGHT = 28;
export const MARGIN = { top: 16, left: 16, right: 16, bottom: 16 };

const COLUMN_STRIDE = CARD_WIDTH + COLUMN_GAP;
const LANE_STRIDE = CARD_HEIGHT + LANE_GAP;

export interface CardPosition {
  id: string;
  x: number;
  y: number;
  column: number;
  laneIndex: number;
}

export type ConnectorKind = "sequence" | "gap" | "conflict" | "link";

export interface ConnectorSpec {
  key: string;
  kind: ConnectorKind;
  fromId: string;
  toId: string;
  label: string;
  /** Same-lane connectors draw a straight line; cross-lane ones draw a bezier to the nearer top/bottom edge. */
  sameLane: boolean;
}

export interface CardLayoutResult {
  positions: Map<string, CardPosition>;
  connectors: ConnectorSpec[];
  canvasWidth: number;
  canvasHeight: number;
  /** Vertical center of each subject's lane label, for LaneLabel placement. */
  laneLabelY: Map<string, number>;
}

function minutesBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000;
}

/** "with Person B", derived from whichever side's involvedParties names the other card's subject. Falls back to a generic label. */
function linkLabel(a: Evidence, b: Evidence, subjects: Subject[]): string {
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "subject";
  const roleWord = (role: InvolvedRole) => ROLE_LABELS[role].toLowerCase();

  const aInvolvesB = a.involvedParties.find((p) => p.subjectId === b.subjectId);
  if (aInvolvesB) return `${roleWord(aInvolvesB.role)} ${subjectName(b.subjectId)}`;

  const bInvolvesA = b.involvedParties.find((p) => p.subjectId === a.subjectId);
  if (bInvolvesA) return `${roleWord(bInvolvesA.role)} ${subjectName(a.subjectId)}`;

  return "linked";
}

/**
 * Pure (evidence, subjects, analysis) -> layout function. One shared
 * chronological column order across all lanes (so similar-time events line
 * up vertically); cards are evenly spaced by column/lane index, not by
 * actual elapsed time — connectors carry the real timing.
 */
export function computeCardLayout(evidence: Evidence[], subjects: Subject[], analysis: CaseAnalysis): CardLayoutResult {
  const sortedAll = [...evidence].sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  const columnById = new Map<string, number>();
  sortedAll.forEach((e, i) => columnById.set(e.id, i));

  const laneIndexBySubject = new Map<string, number>();
  subjects.forEach((s, i) => laneIndexBySubject.set(s.id, i));

  const positions = new Map<string, CardPosition>();
  evidence.forEach((e) => {
    const column = columnById.get(e.id) ?? 0;
    const laneIndex = laneIndexBySubject.get(e.subjectId) ?? 0;
    positions.set(e.id, {
      id: e.id,
      x: MARGIN.left + column * COLUMN_STRIDE,
      y: MARGIN.top + laneIndex * LANE_STRIDE + LANE_LABEL_HEIGHT,
      column,
      laneIndex,
    });
  });

  const laneLabelY = new Map<string, number>();
  subjects.forEach((s, laneIndex) => {
    laneLabelY.set(s.id, MARGIN.top + laneIndex * LANE_STRIDE + LANE_LABEL_HEIGHT / 2);
  });

  const maxColumn = sortedAll.length > 0 ? sortedAll.length - 1 : 0;
  const canvasWidth = MARGIN.left + (maxColumn + 1) * COLUMN_STRIDE + MARGIN.right - COLUMN_GAP;
  const canvasHeight = Math.max(
    LANE_STRIDE,
    MARGIN.top + subjects.length * LANE_STRIDE + MARGIN.bottom - LANE_GAP
  );

  const byId = new Map(evidence.map((e) => [e.id, e]));
  const connectors: ConnectorSpec[] = [];

  // Same-lane consecutive pairs: conflict > gap > plain elapsed-time sequence.
  subjects.forEach((s) => {
    const laneEvidence = evidence
      .filter((e) => e.subjectId === s.id)
      .sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

    for (let i = 0; i < laneEvidence.length - 1; i++) {
      const a = laneEvidence[i];
      const b = laneEvidence[i + 1];

      const conflict = analysis.conflicts.find(
        (c) =>
          (c.evidenceIds[0] === a.id && c.evidenceIds[1] === b.id) ||
          (c.evidenceIds[0] === b.id && c.evidenceIds[1] === a.id)
      );
      if (conflict) {
        connectors.push({
          key: `conflict-${conflict.id}`,
          kind: "conflict",
          fromId: a.id,
          toId: b.id,
          label: `needs ~${Math.round(conflict.requiredMinutes)} · has ~${Math.round(conflict.availableMinutes)}`,
          sameLane: true,
        });
        continue;
      }

      const gap = analysis.gaps.find(
        (g) =>
          g.subjectId === s.id &&
          new Date(g.start).getTime() >= new Date(a.eventTime).getTime() &&
          new Date(g.end).getTime() <= new Date(b.eventTime).getTime()
      );
      if (gap) {
        connectors.push({
          key: `gap-${gap.id}`,
          kind: "gap",
          fromId: a.id,
          toId: b.id,
          label: `${Math.round(gap.durationMinutes)} min unaccounted`,
          sameLane: true,
        });
        continue;
      }

      connectors.push({
        key: `seq-${a.id}-${b.id}`,
        kind: "sequence",
        fromId: a.id,
        toId: b.id,
        label: `${Math.round(minutesBetween(a.eventTime, b.eventTime))} min`,
        sameLane: true,
      });
    }
  });

  // Cross-lane links: corroborations only (an involvedParty entry alone has
  // no specific other-evidence id to point a line at — see cardLayout notes
  // in the summary for this round).
  analysis.corroborations.forEach((c) => {
    const [aId, bId] = c.evidenceIds;
    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) return;
    connectors.push({
      key: `link-${c.id}`,
      kind: "link",
      fromId: aId,
      toId: bId,
      label: linkLabel(a, b, subjects),
      sameLane: a.subjectId === b.subjectId,
    });
  });

  return { positions, connectors, canvasWidth, canvasHeight, laneLabelY };
}
