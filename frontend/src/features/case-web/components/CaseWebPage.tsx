import { useEffect, useState } from "react";
import { useCaseWebStore } from "../store";
import { AddEvidenceModal } from "./AddEvidenceModal";
import { CaseWeb } from "./CaseWeb";
import { DetailsPanel } from "./DetailsPanel";
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
    removeEvidence,
    selectSubject,
    selectEvidence,
    clearSelection,
    updateSuggestionStatus,
  } = useCaseWebStore();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

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
        <button
          onClick={() => setModalOpen(true)}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
        >
          + Add Evidence
        </button>
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

        <main className="thin-scrollbar flex-1 overflow-auto p-6">
          <CaseWeb
            subjects={subjects}
            evidence={evidence}
            analysis={analysis}
            selection={selection}
            newEvidenceIds={newEvidenceIds}
            onSelectSubject={selectSubject}
            onSelectEvidence={selectEvidence}
            onClearSelection={clearSelection}
          />
        </main>

        <aside className="w-96 flex-shrink-0 border-l border-neutral-800">
          <DetailsPanel
            subjects={subjects}
            evidence={evidence}
            analysis={analysis}
            selection={selection}
            onSelectEvidence={selectEvidence}
            onConfirmSuggestion={(id) => updateSuggestionStatus(id, "confirmed")}
            onDismissSuggestion={(id) => updateSuggestionStatus(id, "dismissed")}
          />
        </aside>
      </div>

      <AddEvidenceModal
        open={modalOpen}
        subjects={subjects}
        onClose={() => setModalOpen(false)}
        onSubmit={(input) => addEvidence(input)}
      />
    </div>
  );
}
