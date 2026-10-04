import { useEffect, useMemo, useState } from "react";
import { Route } from "lucide-react";
import { useCaseWebStore } from "../store";
import { MIN_ROUTE_POINTS, getRoutePoints } from "../locationUtils";
import { AddEvidenceModal } from "./AddEvidenceModal";
import { EventPathModal } from "./EventPathModal";
import { CardTimeline } from "./CardTimeline"; // UPDATED line 4: was `import { CaseWeb } from "./CaseWeb";` — timeline replaced with the card-based version
// DELETED line 5: removed `import { DetailsPanel } from "./DetailsPanel";` — its job is now done by CardTimeline's own EvidenceDetailPanel, rendered below the canvas instead of beside it
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
    addSubject, // ADDED line 19: for the Add Evidence wizard's "+ New subject" form
    removeEvidence,
    selectSubject,
    selectEvidence,
    clearSelection,
    updateSuggestionStatus,
  } = useCaseWebStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [pathSubjectId, setPathSubjectId] = useState<string | null>(null);

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
    const targetId =
      focusId ?? subjects.find((s) => getRoutePoints(evidence, s.id).length >= MIN_ROUTE_POINTS)?.id;
    const subject = subjects.find((s) => s.id === targetId);
    const pointCount = subject ? getRoutePoints(evidence, subject.id).length : 0;
    return { subject, pointCount };
  }, [selection, evidence, subjects]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 font-mono text-sm text-neutral-500">
        Loading case data…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">{caseName}</h1>
          <p className="mt-0.5 font-mono text-xs text-neutral-500">
            {evidence.length} evidence · {analysis.conflicts.length} conflicts · {analysis.gaps.length} gaps ·{" "}
            {analysis.aiSuggestions.length} AI suggestions
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap">
          <ShowEventPathButton
            subjectName={pathTarget.subject?.name}
            pointCount={pathTarget.pointCount}
            onClick={() => setPathSubjectId(pathTarget.subject?.id ?? null)}
          />
          <button
            onClick={() => setModalOpen(true)}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            + Add Evidence
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 flex-shrink-0 border-r border-neutral-800">
          <EvidenceList
            subjects={subjects}
            evidence={evidence}
            selection={selection}
            onSelectSubject={selectSubject}
            onSelectEvidence={selectEvidence}
            onRemoveEvidence={removeEvidence}
          />
        </aside>

        {/* UPDATED lines 70-93: was <main><CaseWeb/></main> + a separate <aside><DetailsPanel/></aside> column — */}
        {/* the card timeline now renders its own detail panel below the canvas, so there's a single full-width main area. */}
        <main className="thin-scrollbar flex-1 overflow-auto p-6">
          <CardTimeline
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
        evidence={evidence} // ADDED line 99: location-combobox needs the full evidence list for per-location counts
        onClose={() => setModalOpen(false)}
        onSubmit={(input) => addEvidence(input)}
        onAddSubject={addSubject} // ADDED line 101: wired to the new store action
      />

      <EventPathModal
        open={pathSubjectId !== null}
        subjects={subjects}
        evidence={evidence}
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

function ShowEventPathButton({
  subjectName,
  pointCount,
  onClick,
}: {
  subjectName: string | undefined;
  pointCount: number;
  onClick: () => void;
}) {
  const enabled = pointCount >= MIN_ROUTE_POINTS;
  const title = !subjectName
    ? "No subject has enough located evidence for a path"
    : enabled
      ? `Show ${subjectName}'s ${pointCount} located events in chronological order`
      : pointCount === 1
        ? `${subjectName} has only one located event — see it in the evidence detail panel`
        : `${subjectName} has no evidence with coordinates`;

  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      title={title}
      className="flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
    >
      <Route size={14} />
      {enabled ? "Show Event Path" : "No Event Path"}
      {subjectName && <span className="text-xs text-neutral-500">· {subjectName}</span>}
    </button>
  );
}
