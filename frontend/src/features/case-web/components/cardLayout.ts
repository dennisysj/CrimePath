import type { CaseAnalysis, Evidence, InvolvedRole, Subject } from "../types";
import { ROLE_LABELS } from "../types";
import { formatEvidenceTimeLabel } from "../timeUtils";

export const CARD_WIDTH = 124;
export const CARD_HEIGHT = 90;
export const COLUMN_GAP = 20;
export const LANE_GAP = 60;
export const RULER_HEIGHT = 56; // UPDATED: was 48 — two clearly separated rows (32px hour headers + 24px tick labels) need more room
export const STRIP_WIDTH = 110; // UPDATED: was 88 — wide enough for a collapsed header ("8:00" + count pill) with no truncation
export const MARGIN = { top: RULER_HEIGHT + 12, left: 16, right: 16, bottom: 16 };
/** Minimum gap left between a connector segment and the collapsed block it stops short of. */
export const COLLAPSED_CLEARANCE = 8;

const COLUMN_STRIDE = CARD_WIDTH + COLUMN_GAP;
const LANE_STRIDE = CARD_HEIGHT + LANE_GAP;

export interface CardPosition {
  id: string;
  x: number;
  y: number;
  column: number;
  laneIndex: number;
}

export interface CollapsedChip {
  key: string;
  sectionKey: string;
  subjectId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  hasConflict: boolean;
  evidenceIds: string[];
}

export interface HourSection {
  key: string;
  label: string;
  startX: number;
  width: number;
  collapsed: boolean;
  evidenceCount: number;
  hasConflict: boolean;
}

export interface TimeTick {
  x: number;
  label: string;
}

export type ConnectorKind = "sequence" | "gap" | "conflict" | "link";

export interface ConnectorSpec {
  key: string;
  kind: ConnectorKind;
  /** Evidence ids — used for highlight/selection logic, not rendering. */
  fromId: string;
  toId: string;
  /** Resolved render points — a card's edge, a collapsed strip's edge, or a clearance point beside a collapsed block the line had to be split around. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Empty on every segment but the longest one, when a connector was split around a collapsed block in the middle. */
  label: string;
}

export interface CardLayoutResult {
  positions: Map<string, CardPosition>;
  chips: CollapsedChip[];
  connectors: ConnectorSpec[];
  sections: HourSection[];
  ticks: TimeTick[];
  canvasWidth: number;
  canvasHeight: number;
  /** Top y of each subject's lane row — shared by the fixed lane-label column and the scrollable canvas, so they stay vertically aligned. */
  laneY: Map<string, number>;
}

function minutesBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000;
}

/** Hour bucket key, read with the same UTC-as-wall-clock convention formatClock uses elsewhere in this feature. */
function hourKeyOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function hourLabel(key: string): string {
  const h = Number(key.slice(-2));
  const next = (h + 1) % 24;
  return `${h}:00–${next}:00`;
}

/** "with Person B", derived from whichever side's involvedParties names the other card's subject. Falls back to a generic label. */
function linkLabel(a: Evidence, b: Evidence, subjects: Subject[]): string {
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "subject";
  const roleWord = (role: InvolvedRole) => ROLE_LABELS[role].toLowerCase();

  const aParties = a.involvedParties ?? [];
  const bParties = b.involvedParties ?? [];
  const aInvolvesB = aParties.find((p) => p.subjectId === b.subjectId);
  if (aInvolvesB) return `${roleWord(aInvolvesB.role)} ${subjectName(b.subjectId)}`;

  const bInvolvesA = bParties.find((p) => p.subjectId === a.subjectId);
  if (bInvolvesA) return `${roleWord(bInvolvesA.role)} ${subjectName(a.subjectId)}`;

  return "linked";
}

/**
 * Splits a same-lane connector's span around any collapsed hour sections
 * that fall strictly between its two endpoints (even if neither endpoint
 * itself is inside one — a collapsed hour can sit between two expanded
 * cards). Each resulting segment stops/starts COLLAPSED_CLEARANCE px short
 * of the block; the real label goes on the longest segment only.
 */
function splitAroundCollapsed(
  from: { x: number; y: number },
  to: { x: number; y: number },
  label: string,
  collapsedSections: HourSection[]
): { from: { x: number; y: number }; to: { x: number; y: number }; label: string }[] {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const blocking = collapsedSections
    .filter((s) => s.startX + s.width > minX && s.startX < maxX)
    .sort((a, b) => a.startX - b.startX);

  if (blocking.length === 0) return [{ from, to, label }];

  const y = from.y;
  const segments: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  let cursor = minX;
  blocking.forEach((s) => {
    segments.push({ from: { x: cursor, y }, to: { x: s.startX - COLLAPSED_CLEARANCE, y } });
    cursor = s.startX + s.width + COLLAPSED_CLEARANCE;
  });
  segments.push({ from: { x: cursor, y }, to: { x: maxX, y } });

  let longestIndex = 0;
  let longestLen = -Infinity;
  segments.forEach((seg, i) => {
    const len = seg.to.x - seg.from.x;
    if (len > longestLen) {
      longestLen = len;
      longestIndex = i;
    }
  });

  return segments.map((seg, i) => ({ ...seg, label: i === longestIndex ? label : "" }));
}

/**
 * Pure (evidence, subjects, analysis, collapsedHours) -> layout function.
 * One shared chronological column order across all lanes groups into hour
 * sections; a collapsed section renders as one fixed-width strip per lane
 * instead of individual cards. Cards are evenly spaced by column/lane
 * index, not by actual elapsed time — connectors carry the real timing,
 * and never draw through a collapsed block.
 */
export function computeCardLayout(
  evidence: Evidence[],
  subjects: Subject[],
  analysis: CaseAnalysis,
  collapsedHours: ReadonlySet<string>
): CardLayoutResult {
  const sortedAll = [...evidence].sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  const byId = new Map(evidence.map((e) => [e.id, e]));

  const laneIndexBySubject = new Map<string, number>();
  subjects.forEach((s, i) => laneIndexBySubject.set(s.id, i));
  const laneY = new Map<string, number>();
  subjects.forEach((s, i) => laneY.set(s.id, MARGIN.top + i * LANE_STRIDE));

  const conflictEvidenceIds = new Set(analysis.conflicts.flatMap((c) => c.evidenceIds));

  // Group the globally-sorted list into contiguous hour buckets.
  const sectionOrder: string[] = [];
  const sectionItems = new Map<string, Evidence[]>();
  sortedAll.forEach((e) => {
    const key = hourKeyOf(e.eventTime);
    if (!sectionItems.has(key)) {
      sectionItems.set(key, []);
      sectionOrder.push(key);
    }
    sectionItems.get(key)!.push(e);
  });

  const sectionKeyById = new Map<string, string>();
  sectionItems.forEach((items, key) => items.forEach((e) => sectionKeyById.set(e.id, key)));

  // Walk sections left -> right, laying out expanded ones by local column index and collapsed ones as one fixed-width strip.
  const sections: HourSection[] = [];
  const positions = new Map<string, CardPosition>();
  const chips: CollapsedChip[] = [];
  const ticks: TimeTick[] = [];
  let cursorX = MARGIN.left;

  sectionOrder.forEach((key) => {
    const items = sectionItems.get(key)!;
    const collapsed = collapsedHours.has(key);
    const hasConflict = items.some((e) => conflictEvidenceIds.has(e.id));
    const startX = cursorX;
    const width = collapsed ? STRIP_WIDTH : items.length * CARD_WIDTH + (items.length - 1) * COLUMN_GAP;

    sections.push({ key, label: hourLabel(key), startX, width, collapsed, evidenceCount: items.length, hasConflict });

    if (collapsed) {
      const bySubject = new Map<string, Evidence[]>();
      items.forEach((e) => {
        if (!bySubject.has(e.subjectId)) bySubject.set(e.subjectId, []);
        bySubject.get(e.subjectId)!.push(e);
      });
      bySubject.forEach((subjectItems, subjectId) => {
        const y = laneY.get(subjectId);
        if (y === undefined) return;
        chips.push({
          key: `${key}:${subjectId}`,
          sectionKey: key,
          subjectId,
          x: startX,
          y,
          width: STRIP_WIDTH,
          height: CARD_HEIGHT,
          count: subjectItems.length,
          hasConflict: subjectItems.some((e) => conflictEvidenceIds.has(e.id)),
          evidenceIds: subjectItems.map((e) => e.id),
        });
      });
    } else {
      items.forEach((e, localIndex) => {
        const y = laneY.get(e.subjectId);
        if (y === undefined) return;
        const x = startX + localIndex * COLUMN_STRIDE;
        positions.set(e.id, { id: e.id, x, y, column: localIndex, laneIndex: laneIndexBySubject.get(e.subjectId) ?? 0 });
        ticks.push({ x, label: formatEvidenceTimeLabel(e) });
      });
    }

    cursorX += width + COLUMN_GAP;
  });

  const canvasWidth = Math.max(STRIP_WIDTH, cursorX - COLUMN_GAP + MARGIN.right);
  const canvasHeight = Math.max(LANE_STRIDE, MARGIN.top + subjects.length * LANE_STRIDE + MARGIN.bottom - LANE_GAP);
  const collapsedSections = sections.filter((s) => s.collapsed);

  /** The point a connector should touch for this evidence: its own card edge if expanded, or its lane's collapsed-strip edge if not. */
  function anchor(evidenceId: string, side: "left" | "right"): { x: number; y: number } | null {
    const pos = positions.get(evidenceId);
    if (pos) return { x: side === "left" ? pos.x : pos.x + CARD_WIDTH, y: pos.y + CARD_HEIGHT / 2 };

    const e = byId.get(evidenceId);
    const sectionKey = sectionKeyById.get(evidenceId);
    if (!e || !sectionKey) return null;
    const chip = chips.find((c) => c.sectionKey === sectionKey && c.subjectId === e.subjectId);
    if (!chip) return null;
    return { x: side === "left" ? chip.x : chip.x + chip.width, y: chip.y + chip.height / 2 };
  }

  function anchorTopOrBottom(evidenceId: string, edge: "top" | "bottom"): { x: number; y: number } | null {
    const pos = positions.get(evidenceId);
    if (pos) return { x: pos.x + CARD_WIDTH / 2, y: edge === "top" ? pos.y : pos.y + CARD_HEIGHT };
    return null; // cross-lane links are hidden entirely when either end is collapsed — see below.
  }

  const connectors: ConnectorSpec[] = [];

  // Same-lane consecutive pairs: conflict > gap > plain elapsed-time sequence.
  subjects.forEach((s) => {
    const laneEvidence = evidence
      .filter((e) => e.subjectId === s.id)
      .sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

    for (let i = 0; i < laneEvidence.length - 1; i++) {
      const a = laneEvidence[i];
      const b = laneEvidence[i + 1];

      // Both ends inside the same collapsed hour -> no line at all.
      if (sectionKeyById.get(a.id) === sectionKeyById.get(b.id) && !positions.has(a.id) && !positions.has(b.id)) {
        continue;
      }

      const from = anchor(a.id, "right");
      const to = anchor(b.id, "left");
      if (!from || !to) continue;

      const conflict = analysis.conflicts.find(
        (c) =>
          (c.evidenceIds[0] === a.id && c.evidenceIds[1] === b.id) ||
          (c.evidenceIds[0] === b.id && c.evidenceIds[1] === a.id)
      );

      let kind: ConnectorKind;
      let baseKey: string;
      let label: string;
      if (conflict) {
        kind = "conflict";
        baseKey = `conflict-${conflict.id}`;
        label = `needs ~${Math.round(conflict.requiredMinutes)} · has ~${Math.round(conflict.availableMinutes)}`;
      } else {
        const gap = analysis.gaps.find(
          (g) =>
            g.subjectId === s.id &&
            new Date(g.start).getTime() >= new Date(a.eventTime).getTime() &&
            new Date(g.end).getTime() <= new Date(b.eventTime).getTime()
        );
        if (gap) {
          kind = "gap";
          baseKey = `gap-${gap.id}`;
          label = `${Math.round(gap.durationMinutes)} min unaccounted`;
        } else {
          kind = "sequence";
          baseKey = `seq-${a.id}-${b.id}`;
          label = `${Math.round(minutesBetween(a.eventTime, b.eventTime))} min`;
        }
      }

      const segments = splitAroundCollapsed(from, to, label, collapsedSections);
      segments.forEach((seg, segIndex) => {
        connectors.push({
          key: segments.length > 1 ? `${baseKey}-seg${segIndex}` : baseKey,
          kind,
          fromId: a.id,
          toId: b.id,
          from: seg.from,
          to: seg.to,
          label: seg.label,
        });
      });
    }
  });

  // Cross-lane links: corroborations only, and only when both ends are expanded and no collapsed block lies between the two cards' columns.
  analysis.corroborations.forEach((c) => {
    const [aId, bId] = c.evidenceIds;
    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) return;
    if (!positions.has(aId) || !positions.has(bId)) return; // hidden when either end is collapsed

    const aPos = positions.get(aId)!;
    const bPos = positions.get(bId)!;
    const minX = Math.min(aPos.x, bPos.x) + CARD_WIDTH;
    const maxX = Math.max(aPos.x, bPos.x);
    const blocked = collapsedSections.some((sec) => sec.startX + sec.width > minX && sec.startX < maxX);
    if (blocked) return; // the curve would pass through a collapsed block

    const targetBelow = bPos.y > aPos.y;
    const from = anchorTopOrBottom(aId, targetBelow ? "bottom" : "top");
    const to = anchorTopOrBottom(bId, targetBelow ? "top" : "bottom");
    if (!from || !to) return;

    connectors.push({
      key: `link-${c.id}`,
      kind: "link",
      fromId: aId,
      toId: bId,
      from,
      to,
      label: linkLabel(a, b, subjects),
    });
  });

  return { positions, chips, connectors, sections, ticks, canvasWidth, canvasHeight, laneY };
}

/** Which hour section a piece of evidence falls in — exported so the sidebar can expand the right hour before scrolling to it. */
export function hourKeyForEvidence(e: Evidence): string {
  return hourKeyOf(e.eventTime);
}
