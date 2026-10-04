import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Loader2, Pencil, Route, Trash2, Users, X } from "lucide-react";
import { matchesSubjectFilter, useCaseWebStore } from "../store";
import { getCaseHistory, getEvidenceHistory } from "../api";
import { MIN_ROUTE_POINTS, getRoutePoints } from "../locationUtils";
import type { Crime, Evidence, Subject } from "../types";
import { formatDateTime } from "../timeUtils";
import { AddEvidenceModal } from "./AddEvidenceModal";
import { CardTimeline, type CardTimelineHandle } from "./CardTimeline";
import { EventPathModal } from "./EventPathModal";
import { EvidenceList } from "./EvidenceList";
import { ManageSubjectsModal } from "./ManageSubjectsModal";
import { EditCaseModal } from "./EditCaseModal";

interface AllEvidencePageProps {
  open: boolean;
  caseName: string;
  subjects: Subject[];
  evidence: Evidence[];
  onClose: () => void;
  onSelectEvidence: (id: string) => void;
}

const EVIDENCE_TYPE_LABEL: Record<Evidence["evidenceType"], string> = {
  witness: "Witness",
  cctv: "CCTV",
  image: "Image",
  video: "Video",
  document: "Document",
  gps: "GPS",
  transaction: "Transaction",
  other: "Other",
};

function AllEvidencePage({ open, caseName, subjects, evidence, onClose, onSelectEvidence }: AllEvidencePageProps) {
  const [query, setQuery] = useState("");
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const sorted = [...evidence].sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
    if (!normalized) return sorted;

    return sorted.filter((item) => {
      const subject = subjectById.get(item.subjectId);
      return [
        item.event,
        item.source,
        item.location.name,
        item.notes,
        item.evidenceType,
        subject?.name,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    });
  }, [evidence, query, subjectById]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950 text-neutral-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">All Evidence</h2>
          <p className="mt-0.5 font-mono text-xs text-neutral-500">
            {caseName} · {filtered.length} of {evidence.length} items
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search evidence"
            className="w-64 rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close all evidence"
            className="rounded border border-neutral-700 p-2 text-neutral-300 hover:border-neutral-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <main className="thin-scrollbar flex-1 overflow-auto px-6 py-5">
        <div className="grid gap-3">
          {filtered.map((item) => {
            const subject = subjectById.get(item.subjectId);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectEvidence(item.id);
                  onClose();
                }}
                className="rounded-md border border-neutral-800 bg-neutral-900/70 p-4 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-neutral-800 px-2 py-1 text-[10px] font-medium uppercase text-neutral-300">
                      {EVIDENCE_TYPE_LABEL[item.evidenceType]}
                    </span>
                    <span className="text-xs text-neutral-400">{subject?.name ?? item.subjectId}</span>
                  </div>
                  <span className="font-mono text-xs text-neutral-500">{formatDateTime(item.eventTime, true)}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-neutral-100">{item.event}</p>
                <div className="mt-2 grid gap-1 text-xs text-neutral-500 sm:grid-cols-2">
                  <span>{item.location.name}</span>
                  <span>{item.source}</span>
                </div>
                {item.notes && <p className="mt-2 text-xs text-neutral-400">{item.notes}</p>}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-md border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">
              No evidence matches that search.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function CaseWebPage() {
  const {
    cases,
    selectedCaseId,
    caseName,
    subjects,
    evidence,
    analysis,
    loading,
    error,
    selection,
    subjectFilter,
    newEvidenceIds,
    load,
    selectCase,
    createCase,
    deleteCase,
    updateCase,
    addSubject,
    updateSubject,
    removeSubject,
    addEvidence,
    updateEvidence,
    setReliability,
    removeEvidence,
    toggleSubjectFilter,
    clearSubjectFilter,
    selectEvidence,
    clearSelection,
    clearError,
    updateSuggestionStatus,
    crimes,
    addCrime,
    updateCrime,
    removeCrime,
  } = useCaseWebStore();
  const [evidenceModal, setEvidenceModal] = useState<{ editing?: Evidence; editingCrime?: Crime } | null>(null);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [allEvidenceOpen, setAllEvidenceOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [newCaseError, setNewCaseError] = useState("");
  const [creatingCase, setCreatingCase] = useState(false);
  const [confirmDeleteCase, setConfirmDeleteCase] = useState(false);
  const [editCaseOpen, setEditCaseOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const currentCase = cases.find((c) => c.id === selectedCaseId);
  const [pathSubjectIds, setPathSubjectIds] = useState<string[] | null>(null);
  const timelineRef = useRef<CardTimelineHandle>(null);

  // Store actions already put failures in the error banner; swallow the
  // rethrow here for fire-and-forget callers (list/details buttons).
  const removeEvidenceQuietly = (id: string) => removeEvidence(id).catch(() => undefined);

  function jumpToEvidence(id: string) {
    timelineRef.current?.focusEvidence(id);
  }

  useEffect(() => {
    load();
  }, [load]);

  /** Evidence shown in the list and timeline: everything, or just the filtered subjects'. */
  const visibleEvidence = useMemo(
    () => evidence.filter((e) => matchesSubjectFilter(e, subjectFilter)),
    [evidence, subjectFilter]
  );

  // The path follows whichever subject is in focus: a selected subject chip,
  // or the primary subject of the selected evidence. With nothing in focus,
  // fall back to the first subject that has a drawable path.
  const pathTarget = useMemo(() => {
    // With a subject filter, the path shows every filtered subject that has one.
    if (subjectFilter.length > 0) {
      const routable = subjects.filter(
        (s) => subjectFilter.includes(s.id) && getRoutePoints(evidence, s.id).length >= MIN_ROUTE_POINTS
      );
      return {
        subject: routable[0] ?? subjects.find((s) => s.id === subjectFilter[0]),
        subjectIds: routable.map((s) => s.id),
        pointCount: routable.length > 0 ? MIN_ROUTE_POINTS : 0,
        label: routable.length > 1 ? `${routable.length} subjects` : routable[0]?.name,
      };
    }
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
    return { subject, subjectIds: subject ? [subject.id] : [], pointCount, label: subject?.name };
  }, [selection, evidence, subjects, subjectFilter]);

  const newCaseModal = newCaseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const name = newCaseName.trim();
              if (!name) return;
              setCreatingCase(true);
              setNewCaseError("");
              try {
                await createCase({ name });
                setNewCaseName("");
                setNewCaseOpen(false);
                setStarted(true);
              } catch (err) {
                setNewCaseError(err instanceof Error ? err.message : "Couldn't create case.");
              } finally {
                setCreatingCase(false);
              }
            }}
            className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-100">New Case</h2>
              <button
                type="button"
                onClick={() => setNewCaseOpen(false)}
                className="text-neutral-500 hover:text-neutral-200"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-400">Case name</span>
              <input
                autoFocus
                value={newCaseName}
                onChange={(event) => setNewCaseName(event.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none"
                placeholder="e.g. Robbery at Main Street"
              />
            </label>
            {newCaseError && <p className="mt-2 text-xs text-red-400">{newCaseError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewCaseOpen(false)}
                className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingCase}
                className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
              >
                {creatingCase && <Loader2 size={13} className="animate-spin" />}
                Create Case
              </button>
            </div>
          </form>
        </div>
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 font-mono text-sm text-neutral-500">
        Loading case data…
      </div>
    );
  }

  if (!started) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-100">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-4xl font-semibold">CrimePath</h1>
          {error && (
            <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {error}
            </div>
          )}
          <select
            value={selectedCaseId}
            onChange={(event) => selectCase(event.target.value)}
            disabled={cases.length === 0}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:text-neutral-600"
          >
            {cases.map((caseItem) => (
              <option key={caseItem.id} value={caseItem.id}>
                {caseItem.caseNumber ? `${caseItem.caseNumber} - ${caseItem.name}` : caseItem.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setStarted(true)}
            disabled={!selectedCaseId}
            className="mt-3 w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            Open case
          </button>
          <div className="my-4 flex items-center gap-3 text-xs text-neutral-600">
            <span className="h-px flex-1 bg-neutral-800" />
            or
            <span className="h-px flex-1 bg-neutral-800" />
          </div>
          <button
            type="button"
            onClick={() => setNewCaseOpen(true)}
            className="w-full rounded border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
          >
            + New case
          </button>
        </div>
        {newCaseModal}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">
            {currentCase?.caseNumber && (
              <span className="mr-2 font-mono text-sm font-normal text-neutral-500">{currentCase.caseNumber}</span>
            )}
            {caseName}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-neutral-500">
            {evidence.length} evidence · {analysis.conflicts.length} conflicts · {analysis.gaps.length} gaps ·{" "}
            {analysis.aiSuggestions.length} AI suggestions
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap">
          <select
            value={selectedCaseId}
            onChange={(event) => selectCase(event.target.value)}
            className="max-w-56 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-500 focus:outline-none"
          >
            {cases.map((caseItem) => (
              <option key={caseItem.id} value={caseItem.id}>
                {caseItem.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditCaseOpen(true)}
            title="Case details and history"
            aria-label="Case details and history"
            className="rounded border border-neutral-700 p-2 text-neutral-400 hover:border-neutral-500 hover:text-white"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteCase(true)}
            title="Delete this case"
            aria-label="Delete this case"
            className="rounded border border-neutral-700 p-2 text-neutral-400 hover:border-red-500/60 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPathSubjectIds(pathTarget.subjectIds)}
            disabled={pathTarget.pointCount < MIN_ROUTE_POINTS}
            title={
              !pathTarget.subject
                ? "No subject has enough located evidence for a path"
                : pathTarget.pointCount >= MIN_ROUTE_POINTS
                  ? `Show ${pathTarget.label}'s located events in chronological order`
                  : pathTarget.pointCount === 1
                    ? `${pathTarget.subject.name} has only one located event - see it in the evidence detail panel`
                    : `${pathTarget.subject.name} has no evidence with coordinates`
            }
            className="inline-flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
          >
            <Route size={14} />
            {pathTarget.pointCount >= MIN_ROUTE_POINTS ? "Show Event Path" : "No Event Path"}
            {pathTarget.label && <span className="text-xs text-neutral-500">- {pathTarget.label}</span>}
          </button>
          <button
            type="button"
            onClick={() => setNewCaseOpen(true)}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
          >
            New Case
          </button>
          <button
            onClick={() => setAllEvidenceOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
          >
            <Archive size={15} />
            All Evidence
          </button>
          <button
            type="button"
            onClick={() => setSubjectsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
          >
            <Users size={15} />
            Subjects
          </button>
          <button
            onClick={() => setEvidenceModal({})}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            + Add Event
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-sm text-amber-200">
          <span>{error}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss" className="text-amber-300/70 hover:text-amber-100">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Width comes from EvidenceList (320px open, 44px collapsed) so the timeline grows when it collapses. */}
        <aside className="flex-shrink-0 border-r border-neutral-800">
          <EvidenceList
            subjects={subjects}
            evidence={visibleEvidence}
            totalCount={evidence.length}
            selection={selection}
            subjectFilter={subjectFilter}
            onToggleSubject={toggleSubjectFilter}
            onClearSubjectFilter={clearSubjectFilter}
            onJumpToEvidence={jumpToEvidence}
            onRemoveEvidence={removeEvidenceQuietly}
            onManageSubjects={() => setSubjectsOpen(true)}
          />
        </aside>

        <main className="thin-scrollbar flex-1 overflow-auto p-6">
          {subjects.length === 0 ? (
            <div className="mx-auto mt-16 max-w-sm rounded-md border border-dashed border-neutral-800 p-6 text-center">
              <p className="text-sm text-neutral-300">This case has no subjects yet.</p>
              <p className="mt-1 text-xs text-neutral-500">
                Add the people, vehicles, or phones you're tracking, then attach evidence to them.
              </p>
              <button
                type="button"
                onClick={() => setSubjectsOpen(true)}
                className="mt-4 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
              >
                Add subjects
              </button>
            </div>
          ) : (
            <CardTimeline
              ref={timelineRef}
              caseName={caseName}
              subjects={subjects}
              evidence={visibleEvidence}
              crimes={crimes}
              analysis={analysis}
              selection={selection}
              newEvidenceIds={newEvidenceIds}
              onSelectEvidence={selectEvidence}
              onClearSelection={clearSelection}
              onEditEvidence={(item) => setEvidenceModal({ editing: item })}
              onEditCrime={(crime) => setEvidenceModal({ editingCrime: crime })}
              onRemoveEvidence={removeEvidenceQuietly}
              onSetReliability={(id, reliability) => setReliability(id, reliability).catch(() => undefined)}
              loadHistory={(id) => getEvidenceHistory(selectedCaseId, id)}
              onConfirmSuggestion={(id) => updateSuggestionStatus(id, "confirmed")}
              onDismissSuggestion={(id) => updateSuggestionStatus(id, "dismissed")}
            />
          )}
        </main>
      </div>

      {evidenceModal && (
        <AddEvidenceModal
          subjects={subjects}
          evidence={evidence}
          initial={evidenceModal.editing}
          initialCrime={evidenceModal.editingCrime}
          onClose={() => setEvidenceModal(null)}
          onAddSubject={addSubject}
          onSubmit={(input) =>
            evidenceModal.editing ? updateEvidence(evidenceModal.editing.id, input) : addEvidence(input)
          }
          onSubmitCrime={(input) =>
            evidenceModal.editingCrime ? updateCrime(evidenceModal.editingCrime.id, input) : addCrime(input)
          }
          onDeleteCrime={evidenceModal.editingCrime ? () => removeCrime(evidenceModal.editingCrime!.id) : undefined}
        />
      )}

      {subjectsOpen && (
        <ManageSubjectsModal
          subjects={subjects}
          evidence={evidence}
          onClose={() => setSubjectsOpen(false)}
          onAdd={addSubject}
          onUpdate={updateSubject}
          onRemove={removeSubject}
        />
      )}

      {editCaseOpen && currentCase && (
        <EditCaseModal
          caseItem={currentCase}
          subjects={subjects}
          onClose={() => setEditCaseOpen(false)}
          onSave={updateCase}
          loadHistory={() => getCaseHistory(selectedCaseId)}
        />
      )}

      {confirmDeleteCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirmDeleteCase(false)}>
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
          >
            <h2 className="text-sm font-semibold text-neutral-100">Delete “{caseName}”?</h2>
            <p className="mt-2 text-xs text-neutral-400">
              This permanently removes the case, its {subjects.length} subject{subjects.length === 1 ? "" : "s"} and{" "}
              {evidence.length} evidence item{evidence.length === 1 ? "" : "s"} from the database.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteCase(false)}
                className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteCase(false);
                  deleteCase(selectedCaseId).catch(() => undefined);
                }}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
              >
                Delete case
              </button>
            </div>
          </div>
        </div>
      )}

      {newCaseModal}

      <AllEvidencePage
        open={allEvidenceOpen}
        caseName={caseName}
        subjects={subjects}
        evidence={evidence}
        onClose={() => setAllEvidenceOpen(false)}
        onSelectEvidence={selectEvidence}
      />

      <EventPathModal
        open={pathSubjectIds !== null}
        subjects={subjects}
        evidence={evidence}
        analysis={analysis}
        subjectIds={pathSubjectIds ?? []}
        onChangeSubjects={setPathSubjectIds}
        onSelectEvidence={(id) => {
          if (!(selection?.type === "evidence" && selection.id === id)) selectEvidence(id);
        }}
        onClose={() => setPathSubjectIds(null)}
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
