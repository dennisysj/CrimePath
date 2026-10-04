import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import type { CaseAnalysis, Crime, Evidence, Reliability, Subject } from "../types";
import type { HistoryEntry } from "../api";
import type { Selection } from "../store";
import { CARD_WIDTH, RULER_HEIGHT, computeCardLayout, hourKeyForEvidence, type ConnectorSpec } from "./cardLayout"; // UPDATED line 6: added RULER_HEIGHT import — needed to stop the collapsed block from painting over the ruler header
import { LaneLabel } from "./LaneLabel";
import { ConnectorLayer } from "./ConnectorLayer";
import { EvidenceCard } from "./EvidenceCard";
import { CollapsedHourChip } from "./CollapsedHourChip";
import { TimeRuler } from "./TimeRuler";
import { CrimeBandLayer } from "./CrimeBandLayer";
import { EvidenceDetailPanel } from "./EvidenceDetailPanel"; // ADDED: restores the original bottom detail panel, rendered below the canvas inside this component (as it was before the slide-out drawer redesign)
import { readPersisted, writePersisted } from "./persistence";

interface CardTimelineProps {
  caseName: string;
  subjects: Subject[];
  evidence: Evidence[];
  /** Drawn as bands across all lanes, regardless of the subject filter. */
  crimes: Crime[];
  analysis: CaseAnalysis;
  selection: Selection;
  newEvidenceIds: Set<string>;
  onSelectEvidence: (id: string) => void;
  onClearSelection: () => void;
  onEditEvidence: (evidence: Evidence) => void;
  onEditCrime: (crime: Crime) => void;
  onRemoveEvidence: (id: string) => void;
  onSetReliability: (id: string, reliability: Reliability) => void;
  /** Undefined when stored history is unavailable. */
  loadHistory?: (evidenceId: string) => Promise<HistoryEntry[]>;
  onConfirmSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
}

export interface CardTimelineHandle {
  /** Expands the evidence's hour if collapsed, scrolls it into view, selects it, and flashes it briefly. Used by the sidebar's "jump to card" interaction. */
  focusEvidence: (id: string) => void;
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

const LANE_LABEL_COLUMN_WIDTH = 112;
const FLASH_MS = 900;
const ZOOM_LEVELS = [0.6, 0.75, 0.9, 1, 1.15, 1.3] as const;
const DEFAULT_ZOOM = 1;

/**
 * Card-based evidence timeline: a fixed lane-label column, a horizontally
 * scrolling area (time ruler + canvas) grouped into collapsible hour
 * sections, with the evidence detail panel restored below the canvas —
 * visible by default, as in the original CardTimeline (pre-drawer redesign).
 */
export const CardTimeline = forwardRef<CardTimelineHandle, CardTimelineProps>(function CardTimeline(
  {
    caseName,
    subjects,
    evidence,
    crimes,
    analysis,
    selection,
    newEvidenceIds,
    onSelectEvidence,
    onClearSelection,
    onEditEvidence,
    onEditCrime,
    onRemoveEvidence,
    onSetReliability,
    loadHistory,
    onConfirmSuggestion,
    onDismissSuggestion,
  },
  ref
) {
  const storageKey = `crimepath:collapsedHours:${caseName}`;
  const [collapsedHours, setCollapsedHours] = useState<Set<string>>(() => new Set(readPersisted<string[]>(storageKey, [])));
  const [flashId, setFlashId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string | null>(null);

  const layout = useMemo(
    () => computeCardLayout(evidence, subjects, analysis, collapsedHours, crimes),
    [evidence, subjects, analysis, collapsedHours, crimes]
  );

  const selectedId = selection?.type === "evidence" ? selection.id : null;
  const highlight = useMemo(() => computeHighlight(selectedId, layout.connectors), [selectedId, layout.connectors]);
  const selectedEvidence = selectedId ? evidence.find((e) => e.id === selectedId) : undefined; // ADDED: feeds the restored bottom panel, mirroring the original CardTimeline

  function toggleHour(key: string) {
    setCollapsedHours((prev) => {
      const next = new Set(prev);
      const wasCollapsed = next.has(key);
      if (wasCollapsed) next.delete(key);
      else next.add(key);
      writePersisted(storageKey, Array.from(next));
      const section = layout.sections.find((s) => s.key === key);
      toast(wasCollapsed ? `Expanded ${section?.label ?? "hour"}` : `Collapsed ${section?.label ?? "hour"}`);
      return next;
    });
  }

  const zoomIndex = ZOOM_LEVELS.findIndex((level) => level === zoom);
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < ZOOM_LEVELS.length - 1;

  function changeZoom(direction: -1 | 1) {
    setZoom((current) => {
      const currentIndex = ZOOM_LEVELS.findIndex((level) => level === current);
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), ZOOM_LEVELS.length - 1);
      return ZOOM_LEVELS[nextIndex];
    });
  }

  useImperativeHandle(ref, () => ({
    focusEvidence(id: string) {
      const target = evidence.find((e) => e.id === id);
      if (!target) return;
      const key = hourKeyForEvidence(target);
      if (collapsedHours.has(key)) toggleHour(key);
      onSelectEvidence(id);
      pendingFocusRef.current = id;
    },
  }));

  // Once the focused evidence has a real position (its hour is expanded), scroll to it and flash it.
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    const pos = layout.positions.get(id);
    if (!pos) return; // still mid-expand; the next layout pass will have it
    const el = scrollRef.current;
    if (el) {
      const targetScrollLeft = (pos.x + CARD_WIDTH / 2) * zoom - el.clientWidth / 2;
      el.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: "smooth" });
    }
    setFlashId(id);
    const t = setTimeout(() => setFlashId(null), FLASH_MS);
    pendingFocusRef.current = null;
    return () => clearTimeout(t);
  }, [layout, zoom]);

  return (
    // UPDATED line 119: was a height:"100%"/minHeight:layout.canvasHeight flex row that force-filled the
    // viewport (so a slide-out drawer could overlay it) — restored to the original's natural-height
    // "space-y-4" column, with the canvas on top and the (now restored) bottom detail panel below it.
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => changeZoom(-1)}
          disabled={!canZoomOut}
          title="Zoom out timeline"
          aria-label="Zoom out timeline"
          className="rounded border border-neutral-700 p-1.5 text-neutral-300 hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
        >
          <Minus size={14} />
        </button>
        <span className="w-12 text-center font-mono text-xs text-neutral-500">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => changeZoom(1)}
          disabled={!canZoomIn}
          title="Zoom in timeline"
          aria-label="Zoom in timeline"
          className="rounded border border-neutral-700 p-1.5 text-neutral-300 hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex overflow-hidden rounded-md" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div
          className="relative flex-shrink-0"
          style={{ width: LANE_LABEL_COLUMN_WIDTH * zoom, height: layout.canvasHeight * zoom, borderRight: "1px solid var(--border)" }}
        >
          <div
            className="relative"
            style={{
              width: LANE_LABEL_COLUMN_WIDTH,
              height: layout.canvasHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {subjects.map((s) => (
              <LaneLabel
                key={s.id}
                subject={s}
                subjects={subjects}
                y={layout.laneY.get(s.id) ?? 0}
                height={layout.laneHeight.get(s.id)}
              />
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="thin-scrollbar relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width: layout.canvasWidth * zoom, height: layout.canvasHeight * zoom }}>
          <div
            className="relative"
            style={{ width: layout.canvasWidth, height: layout.canvasHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onClick={onClearSelection}
          >
            {layout.sections.map((s, i) =>
              i % 2 === 1 ? (
                <div
                  key={`bg-${s.key}`}
                  className="absolute top-0"
                  style={{ left: s.startX - 10, width: s.width + 20, height: layout.canvasHeight, background: "var(--surface-2)", opacity: 0.5 }}
                />
              ) : null
            )}
            {layout.sections.slice(1).map((s) => (
              <div
                key={`div-${s.key}`}
                className="absolute top-0 border-l border-dashed"
                style={{ left: s.startX - 10, height: layout.canvasHeight, borderColor: "var(--border)" }}
              />
            ))}

            <TimeRuler width={layout.canvasWidth} sections={layout.sections} ticks={layout.ticks} onToggleSection={toggleHour} />

            <ConnectorLayer
              width={layout.canvasWidth}
              height={layout.canvasHeight}
              connectors={layout.connectors}
              highlightedKeys={highlight?.connectorKeys ?? null}
              hasSelection={!!highlight}
            />

            {/* UPDATED lines 164-178: was `top: 0, height: layout.canvasHeight` — an opaque block starting at the
                very top painted over (not just behind) the ruler's hour header for that same column, which is
                why a collapsed hour's header could render as empty. The block now starts below the ruler row
                so the header stays visible, and it's now a click target (was pointer-events-none) with a
                vertical "9:00–10:00" label down its center, per the collapsed-hours spec. */}
            <AnimatePresence>
              {layout.sections
                .filter((s) => s.collapsed)
                .map((s) => (
                  <button
                    key={`block-${s.key}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHour(s.key);
                    }}
                    aria-label={`Expand ${s.label}`}
                    title={`Expand ${s.label}`}
                    className="absolute flex cursor-pointer items-center justify-center border border-dashed hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
                    style={{
                      left: s.startX,
                      top: RULER_HEIGHT,
                      width: s.width,
                      height: layout.canvasHeight - RULER_HEIGHT,
                      background: "var(--surface-2)",
                      borderColor: "var(--border-strong)",
                    }}
                  >
                    <span
                      className="pointer-events-none select-none font-mono text-[12px]"
                      style={{ color: "var(--text-muted)", writingMode: "vertical-rl" }}
                    >
                      {s.label}
                    </span>
                  </button>
                ))}
            </AnimatePresence>

            {/* Above collapsed-hour blocks (so a crime line inside a collapsed hour still shows), below the cards. */}
            <CrimeBandLayer bands={layout.crimeBands} canvasHeight={layout.canvasHeight} onSelectCrime={onEditCrime} />

            <AnimatePresence>
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
                    isFlashing={flashId === e.id}
                    onSelect={() => onSelectEvidence(e.id)}
                  />
                );
              })}
              {layout.chips.map((chip) => (
                <CollapsedHourChip
                  key={chip.key}
                  chip={chip}
                  subjects={subjects}
                  isDimmed={!!highlight && !chip.evidenceIds.some((id) => highlight.cardIds.has(id))}
                  onClick={() => toggleHour(chip.sectionKey)}
                />
              ))}
            </AnimatePresence>
          </div>
          </div>
        </div>
      </div>

      <EvidenceDetailPanel
        evidence={selectedEvidence}
        subjects={subjects}
        analysis={analysis}
        onEdit={onEditEvidence}
        onRemove={onRemoveEvidence}
        onSetReliability={onSetReliability}
        loadHistory={loadHistory}
        onConfirmSuggestion={onConfirmSuggestion}
        onDismissSuggestion={onDismissSuggestion}
      />
    </div>
  );
});
