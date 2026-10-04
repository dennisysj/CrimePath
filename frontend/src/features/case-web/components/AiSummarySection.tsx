import { useEffect } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useCaseWebStore } from "../store";

/**
 * Gemini-generated case insights. State lives in the store (aiSummary/
 * aiSummaryLoading/aiSummaryError/loadAiSummary) so this can be rendered in
 * more than one place at once (main sidebar, Evidence dashboard) without
 * each mount triggering its own Gemini call - whichever mounts first
 * fetches, the rest just read the same cached result. "Regenerate" is the
 * only way to spend a fresh call after the first automatic one per case.
 */
export function AiSummarySection() {
  const { aiSummary, aiSummaryLoading, aiSummaryError, loadAiSummary } = useCaseWebStore();

  useEffect(() => {
    loadAiSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
          <Sparkles size={15} className="text-violet-400" />
          AI Summary
        </h3>
        <button
          type="button"
          onClick={() => loadAiSummary(true)}
          disabled={aiSummaryLoading}
          className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 disabled:cursor-not-allowed disabled:text-neutral-600"
        >
          <RefreshCw size={12} className={aiSummaryLoading ? "animate-spin" : ""} />
          {aiSummaryLoading ? "Generating…" : "Regenerate"}
        </button>
      </div>
      {aiSummaryError && <p className="text-xs text-red-400">{aiSummaryError}</p>}
      {!aiSummaryError && aiSummary && (
        <ul className="space-y-1.5 text-xs text-neutral-300">
          {aiSummary.map((b, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-neutral-600">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {!aiSummaryError && !aiSummary && aiSummaryLoading && (
        <p className="text-xs text-neutral-500">Reading the case…</p>
      )}
    </div>
  );
}
