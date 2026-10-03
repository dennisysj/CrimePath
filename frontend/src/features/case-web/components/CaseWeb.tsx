import { useMemo } from "react";
import { scaleTime } from "d3-scale";
import type { CaseAnalysis, Evidence, Subject } from "../types";
import type { Selection } from "../store";
import { TimeAxis } from "./TimeAxis";
import { Thread } from "./Thread";
import { EvidenceNode } from "./EvidenceNode";
import { ConnectionLine, type ConnectionKind } from "./ConnectionLine";
import { GapSegment } from "./GapSegment";

interface CaseWebProps {
  subjects: Subject[];
  evidence: Evidence[];
  analysis: CaseAnalysis;
  selection: Selection;
  /** Evidence ids to pop in rather than render at full size immediately. */
  newEvidenceIds: Set<string>;
  onSelectSubject: (id: string) => void;
  onSelectEvidence: (id: string) => void;
  onClearSelection: () => void;
}

// Vertical timeline: time runs top -> bottom, subjects are side-by-side columns.
const MARGIN = { top: 40, right: 50, bottom: 40, left: 90 };
const AXIS_X = 50;
const LANE_WIDTH = 200;
const MIN_CONTENT_HEIGHT = 400;
const PIXELS_PER_MINUTE = 3.5;
const PAD_MS = 10 * 60_000;

const SUBJECT_COLOR: Record<Subject["kind"], string> = {
  person: "#38bdf8", // sky-400
  phone: "#a78bfa", // violet-400
  vehicle: "#fbbf24", // amber-400
  other: "#94a3b8", // slate-400
};

/** Deterministic small horizontal offset so a thread reads as a "web" rather than a straight line. */
function jitterFor(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 10_000;
  return (hash % 53) - 26; // roughly -26..26
}

interface HighlightSets {
  evidenceIds: Set<string>;
  subjectIds: Set<string>;
  connectionKeys: Set<string>;
}

/**
 * Selecting a subject highlights its thread + all its evidence. Selecting
 * one piece of evidence highlights it, its subject's thread, and expands
 * outward along every conflict/corroboration/AI-suggestion connection that
 * touches an already-highlighted item (so a chain of related evidence
 * lights up together, even across subjects).
 */
function computeHighlight(selection: Selection, evidence: Evidence[], analysis: CaseAnalysis): HighlightSets | null {
  if (!selection) return null;

  const evidenceIds = new Set<string>();
  const subjectIds = new Set<string>();
  const connectionKeys = new Set<string>();

  if (selection.type === "subject") {
    subjectIds.add(selection.id);
    evidence.forEach((e) => {
      if (e.subjectId === selection.id) evidenceIds.add(e.id);
    });
  } else {
    evidenceIds.add(selection.id);
    const clicked = evidence.find((e) => e.id === selection.id);
    if (clicked) subjectIds.add(clicked.subjectId);
  }

  const touches = (ids: string[]) => ids.some((id) => evidenceIds.has(id));

  analysis.conflicts.forEach((c) => {
    if (touches(c.evidenceIds)) {
      connectionKeys.add(c.id);
      c.evidenceIds.forEach((id) => evidenceIds.add(id));
    }
  });
  analysis.corroborations.forEach((c) => {
    if (touches(c.evidenceIds)) {
      connectionKeys.add(c.id);
      c.evidenceIds.forEach((id) => evidenceIds.add(id));
    }
  });
  analysis.aiSuggestions.forEach((s) => {
    if (s.status === "dismissed") return;
    for (let i = 0; i < s.evidenceIds.length - 1; i++) {
      const pair = [s.evidenceIds[i], s.evidenceIds[i + 1]];
      if (touches(pair)) {
        connectionKeys.add(`${s.id}-${i}`);
        pair.forEach((id) => evidenceIds.add(id));
      }
    }
  });

  return { evidenceIds, subjectIds, connectionKeys };
}

export function CaseWeb({
  subjects,
  evidence,
  analysis,
  selection,
  newEvidenceIds,
  onSelectSubject,
  onSelectEvidence,
  onClearSelection,
}: CaseWebProps) {
  const width = MARGIN.left + subjects.length * LANE_WIDTH + MARGIN.right;

  const { y, laneX, positions, height } = useMemo(() => {
    const laneX = new Map<string, number>();
    subjects.forEach((s, i) => laneX.set(s.id, MARGIN.left + i * LANE_WIDTH + LANE_WIDTH / 2));

    const allTimes = evidence.flatMap((e) => [
      new Date(e.earliestPossibleTime).getTime(),
      new Date(e.latestPossibleTime).getTime(),
    ]);
    const minT = allTimes.length ? Math.min(...allTimes) : Date.now();
    const maxT = allTimes.length ? Math.max(...allTimes) : Date.now();
    const domain: [Date, Date] = [new Date(minT - PAD_MS), new Date(maxT + PAD_MS)];
    const totalMinutes = (domain[1].getTime() - domain[0].getTime()) / 60_000;
    const contentHeight = Math.max(MIN_CONTENT_HEIGHT, totalMinutes * PIXELS_PER_MINUTE);

    const y = scaleTime()
      .domain(domain)
      .range([MARGIN.top, MARGIN.top + contentHeight]);

    const positions = new Map<string, { x: number; y: number }>();
    evidence.forEach((e) => {
      const baseX = laneX.get(e.subjectId) ?? MARGIN.left;
      positions.set(e.id, { x: baseX + jitterFor(e.id), y: y(new Date(e.eventTime)) });
    });

    return { y, laneX, positions, height: MARGIN.top + contentHeight + MARGIN.bottom };
  }, [subjects, evidence]);

  const highlight = useMemo(() => computeHighlight(selection, evidence, analysis), [selection, evidence, analysis]);

  function subjectColor(subjectId: string): string {
    const subject = subjects.find((s) => s.id === subjectId);
    return subject ? SUBJECT_COLOR[subject.kind] : SUBJECT_COLOR.other;
  }

  const connections: {
    key: string;
    a: { x: number; y: number };
    b: { x: number; y: number };
    kind: ConnectionKind;
  }[] = [];

  for (const c of analysis.corroborations) {
    const [aId, bId] = c.evidenceIds;
    const a = positions.get(aId);
    const b = positions.get(bId);
    if (a && b) connections.push({ key: c.id, a, b, kind: "corroboration" });
  }
  for (const c of analysis.conflicts) {
    const [aId, bId] = c.evidenceIds;
    const a = positions.get(aId);
    const b = positions.get(bId);
    if (a && b)
      connections.push({ key: c.id, a, b, kind: c.resolvedByUncertainty ? "conflict-resolved" : "conflict" });
  }
  for (const s of analysis.aiSuggestions) {
    if (s.status === "dismissed") continue;
    for (let i = 0; i < s.evidenceIds.length - 1; i++) {
      const a = positions.get(s.evidenceIds[i]);
      const b = positions.get(s.evidenceIds[i + 1]);
      if (a && b)
        connections.push({
          key: `${s.id}-${i}`,
          a,
          b,
          kind: s.status === "confirmed" ? "ai-confirmed" : "ai-pending",
        });
    }
  }

  return (
    <div className="thin-scrollbar w-full overflow-x-auto">
      <svg width={width} height={height} className="block">
        <defs>
          <pattern id="gap-hatch" width={8} height={8} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={8} height={8} fill="transparent" />
            <line x1={0} y1={0} x2={0} y2={8} stroke="#525252" strokeWidth={2} />
          </pattern>
        </defs>

        <rect x={0} y={0} width={width} height={height} fill="transparent" onClick={onClearSelection} />

        {subjects.map((s) => {
          const items = evidence
            .filter((e) => e.subjectId === s.id)
            .sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime())
            .map((e) => ({ evidence: e, pos: positions.get(e.id)! }));
          const highlighted = highlight?.subjectIds.has(s.id) ?? false;
          const dimmed = !!highlight && !highlighted;
          return (
            <Thread
              key={s.id}
              subject={s}
              items={items}
              color={SUBJECT_COLOR[s.kind]}
              highlighted={highlighted}
              dimmed={dimmed}
              onSelect={() => onSelectSubject(s.id)}
            />
          );
        })}

        {analysis.gaps.map((g) => {
          const laneXPos = laneX.get(g.subjectId);
          if (laneXPos === undefined) return null;
          const dimmed = !!highlight && !highlight.subjectIds.has(g.subjectId);
          return (
            <GapSegment
              key={g.id}
              x={laneXPos}
              y1={y(new Date(g.start))}
              y2={y(new Date(g.end))}
              durationMinutes={g.durationMinutes}
              dimmed={dimmed}
            />
          );
        })}

        {connections.map((c) => {
          const highlighted = highlight?.connectionKeys.has(c.key) ?? false;
          const dimmed = !!highlight && !highlighted;
          return <ConnectionLine key={c.key} a={c.a} b={c.b} kind={c.kind} highlighted={highlighted} dimmed={dimmed} />;
        })}

        {evidence.map((e) => {
          const pos = positions.get(e.id);
          if (!pos) return null;
          const highlighted = highlight?.evidenceIds.has(e.id) ?? false;
          const dimmed = !!highlight && !highlighted;
          return (
            <EvidenceNode
              key={e.id}
              evidence={e}
              pos={pos}
              yEarliest={y(new Date(e.earliestPossibleTime))}
              yLatest={y(new Date(e.latestPossibleTime))}
              color={subjectColor(e.subjectId)}
              highlighted={highlighted}
              dimmed={dimmed}
              justAdded={newEvidenceIds.has(e.id)}
              onSelect={() => onSelectEvidence(e.id)}
            />
          );
        })}

        <TimeAxis y={y} x={AXIS_X} />
      </svg>
    </div>
  );
}
