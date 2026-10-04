import { useEffect, useMemo, useRef, useState } from "react"; // UPDATED line 1: was `useEffect, useMemo, useRef, useState` with no change here — kept as-is, `useRef` still used for the timeline ref
import { motion } from "motion/react";
import { Route } from "lucide-react";
import { useCaseWebStore } from "../store";
import { MIN_ROUTE_POINTS, getRoutePoints } from "../locationUtils";
import { AddEvidenceModal } from "./AddEvidenceModal";
import { CardTimeline, type CardTimelineHandle } from "./CardTimeline";
import { EventPathModal } from "./EventPathModal"; // UPDATED line 8: was `import { EvidenceDetailPanel } from "./EvidenceDetailPanel";` + `import { PathView } from "./PathView";` — the drawer import is gone (CardTimeline owns its own restored bottom panel again) and PathView is replaced by the restored pop-out modal
import { EvidenceList } from "./EvidenceList";

export function CaseWebPage() {
  const {
    caseName,
    subjects,
    evidence,
    analysis,
    loading,
    selection,
    newEvidenceIds,
    load,
    addEvidence,
    addSubject,
    removeEvidence,
    selectSubject,
    selectEvidence,
    clearSelection,
    updateSuggestionStatus,
  } = useCaseWebStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [pathSubjectId, setPathSubjectId] = useState<string | null>(null); // UPDATED line 33: replaces the old `pathViewActive`/`drawerEvidenceId` state pair — this one state now doubles as "is the path modal open" (non-null) exactly like the original EventPathModal wiring
  const timelineRef = useRef<CardTimelineHandle>(null);

  useEffect(() => {
    load();
  }, [load]);

  // The path follows whichever subject is in focus: a selected subject chip,
  // or the primary subject of the selected evidence. With nothing in focus,
  // fall back to the first subject that has a drawable path.
  const pathTarget = useMemo(() => {
    const focusId =
      selection?.type === "subject"
        ? selection.id
        : selection?.type === "evidence"
          ? evidence.find((e) => e.id === selection.id)?.subjectId
          : undefined;
    const targetId = focusId ?? subjects.find((s) => getRoutePoints(evidence, s.id).length >= MIN_ROUTE_POINTS)?.id;
    const subject = subjects.find((s) => s.id === targetId);
    const pointCount = subject ? getRoutePoints(evidence, subject.id).length : 0;
    return { subject, pointCount };
  }, [selection, evidence, subjects]);

  // UPDATED: was `handleJumpToEvidence`, which also had to close the in-place path view before focusing
  // a card. The path is a pop-out again now, so a sidebar click can always focus the timeline directly.
  function handleJumpToEvidence(id: string) {
    timelineRef.current?.focusEvidence(id);
  }

  // UPDATED: was `handleShowPath` + `handleTogglePathView`, which flipped `pathViewActive` to swap the
  // in-place PathView in for the card timeline. Restored to the original's plain "open the pop-out".
  function handleOpenPathModal(subjectId: string | null) {
    setPathSubjectId(subjectId);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center font-mono text-sm" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
        Loading case data…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <header className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-lg font-semibold">{caseName}</h1>
          <p className="mt-0.5 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            {evidence.length} evidence · {analysis.conflicts.length} conflicts · {analysis.gaps.length} gaps ·{" "}
            {analysis.aiSuggestions.length} AI suggestions
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap">
          <ShowPathButton
            enabled={pathTarget.pointCount >= MIN_ROUTE_POINTS}
            onClick={() => handleOpenPathModal(pathTarget.subject?.id ?? null)}
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setModalOpen(true)}
            className="rounded px-3 py-1.5 text-sm font-medium transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
            style={{ background: "var(--primary)", color: "var(--primary-text)" }}
          >
            + Add evidence
          </motion.button>
        </div>
      </header>

      {/* UPDATED lines 95-110: was a `flex min-h-0 flex-1 overflow-hidden` row with `<main>` set up to
          absolutely-position the slide-out drawer over the canvas (`relative`, `overflow-hidden`) and
          force the card timeline to fill it (`h-full`). Restored to the original's plain scrollable
          main — CardTimeline now carries its own natural-height canvas + bottom detail panel again. */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex-shrink-0 border-r" style={{ borderColor: "var(--border)" }}>
          <EvidenceList
            subjects={subjects}
            evidence={evidence}
            selection={selection}
            onSelectSubject={selectSubject}
            onJumpToEvidence={handleJumpToEvidence}
            onRemoveEvidence={removeEvidence}
          />
        </aside>

        <main className="thin-scrollbar flex-1 overflow-auto p-6">
          <CardTimeline
            ref={timelineRef}
            caseName={caseName}
            subjects={subjects}
            evidence={evidence}
            analysis={analysis}
            selection={selection}
            newEvidenceIds={newEvidenceIds}
            onSelectEvidence={selectEvidence}
            onClearSelection={clearSelection}
            onConfirmSuggestion={(id: string) => updateSuggestionStatus(id, "confirmed")}
            onDismissSuggestion={(id: string) => updateSuggestionStatus(id, "dismissed")}
          />
        </main>
      </div>

      <AddEvidenceModal
        open={modalOpen}
        subjects={subjects}
        evidence={evidence}
        onClose={() => setModalOpen(false)}
        onSubmit={(input) => addEvidence(input)}
        onAddSubject={addSubject}
      />

      <EventPathModal
        open={pathSubjectId !== null}
        subjects={subjects}
        evidence={evidence}
        analysis={analysis}
        subjectId={pathSubjectId}
        onChangeSubject={setPathSubjectId}
        onSelectEvidence={(id) => {
          if (!(selection?.type === "evidence" && selection.id === id)) selectEvidence(id);
        }}
        onClose={() => setPathSubjectId(null)}
      />
    </div>
  );
}

// UPDATED: was `ShowPathButton({ active, enabled, onClick })`, which toggled between "Show path →" and
// "← Back to timeline" for the in-place PathView. The "active" concept is gone — this always opens the
// pop-out — but the button keeps its current visual styling (motion press feedback, accent fill, focus
// ring) per "Keep: button hover/press/focus feedback."
function ShowPathButton({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={enabled ? { scale: 0.95 } : undefined}
      disabled={!enabled}
      onClick={onClick}
      title={enabled ? "Show the current subject's path on a map" : "No subject has enough located evidence for a path"}
      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
    >
      <Route size={14} />
      Show path →
    </motion.button>
  );
}
