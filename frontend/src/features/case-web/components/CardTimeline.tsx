import { useMemo } from "react";
import type { CaseAnalysis, Evidence, Subject } from "../types";
import type { Selection } from "../store";
import { computeCardLayout, type ConnectorSpec } from "./cardLayout";
import { LaneLabel } from "./LaneLabel";
import { ConnectorLayer } from "./ConnectorLayer";
import { EvidenceCard } from "./EvidenceCard";
import { EvidenceDetailPanel } from "./EvidenceDetailPanel";

interface CardTimelineProps {
  subjects: Subject[];
  evidence: Evidence[];
  analysis: CaseAnalysis;
  selection: Selection;
  newEvidenceIds: Set<string>;
  onSelectEvidence: (id: string) => void;
  onClearSelection: () => void;
  onEditEvidence: (evidence: Evidence) => void;
  onRemoveEvidence: (id: string) => void;
  onConfirmSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
}

interface Highlight {
  cardIds: Set<string>;
  connectorKeys: Set<string>;
}

/** Any connector touching the selected card highlights, and pulls its other endpoint's card along with it — one hop, matching "its connected cards and connectors highlight". */
function computeHighlight(selectedId: string | null, connectors: ConnectorSpec[]): Highlight | null {
  if (!selectedId) return null;
  const cardIds = new Set<string>([selectedId]);
  const connectorKeys = new Set<string>();
  connectors.forEach((c) => {
    if (c.fromId === selectedId || c.toId === selectedId) {
      connectorKeys.add(c.key);
      cardIds.add(c.fromId);
      cardIds.add(c.toId);
    }
  });
  return { cardIds, connectorKeys };
}

/**
 * Card-based evidence timeline: one horizontal lane per subject, cards
 * placed in shared chronological columns, connectors drawn in an SVG layer
 * behind them. Replaces the old vertical SVG-node timeline (CaseWeb.tsx).
 */
export function CardTimeline({
  subjects,
  evidence,
  analysis,
  selection,
  newEvidenceIds,
  onSelectEvidence,
  onClearSelection,
  onEditEvidence,
  onRemoveEvidence,
  onConfirmSuggestion,
  onDismissSuggestion,
}: CardTimelineProps) {
  const layout = useMemo(() => computeCardLayout(evidence, subjects, analysis), [evidence, subjects, analysis]);

  const selectedId = selection?.type === "evidence" ? selection.id : null;
  const highlight = useMemo(() => computeHighlight(selectedId, layout.connectors), [selectedId, layout.connectors]);
  const selectedEvidence = selectedId ? evidence.find((e) => e.id === selectedId) : undefined;

  return (
    <div className="space-y-4">
      <div className="thin-scrollbar overflow-x-auto overflow-y-hidden rounded-md border border-neutral-800 bg-neutral-950/40 p-4">
        <div
          className="relative"
          style={{ width: layout.canvasWidth, height: layout.canvasHeight }}
          onClick={onClearSelection}
        >
          {subjects.map((s) => (
            <LaneLabel key={s.id} subject={s} y={layout.laneLabelY.get(s.id) ?? 0} />
          ))}

          <ConnectorLayer
            width={layout.canvasWidth}
            height={layout.canvasHeight}
            connectors={layout.connectors}
            positions={layout.positions}
            highlightedKeys={highlight?.connectorKeys ?? null}
            hasSelection={!!highlight}
          />

          {evidence.map((e) => {
            const pos = layout.positions.get(e.id);
            if (!pos) return null;
            return (
              <EvidenceCard
                key={e.id}
                evidence={e}
                subjects={subjects}
                position={pos}
                analysis={analysis}
                isSelected={selectedId === e.id}
                isDimmed={!!highlight && !highlight.cardIds.has(e.id)}
                isNew={newEvidenceIds.has(e.id)}
                onClick={() => onSelectEvidence(e.id)}
              />
            );
          })}
        </div>
      </div>

      <EvidenceDetailPanel
        evidence={selectedEvidence}
        subjects={subjects}
        analysis={analysis}
        onEdit={onEditEvidence}
        onRemove={onRemoveEvidence}
        onConfirmSuggestion={onConfirmSuggestion}
        onDismissSuggestion={onDismissSuggestion}
      />
    </div>
  );
}
