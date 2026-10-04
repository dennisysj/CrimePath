import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { CaseSummary, Subject } from "../types";
import type { CaseUpdate, HistoryEntry } from "../api";
import { HistoryList } from "./HistoryList";

interface EditCaseModalProps {
  caseItem: CaseSummary;
  subjects: Subject[];
  onClose: () => void;
  onSave: (input: CaseUpdate) => Promise<void>;
  loadHistory: () => Promise<HistoryEntry[]>;
}

const STATUSES = ["open", "closed", "archived"] as const;

const inputClass =
  "w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none";

/** Rename a case / change its description or status. Every change is recorded in case_property_history. */
export function EditCaseModal({ caseItem, subjects, onClose, onSave, loadHistory }: EditCaseModalProps) {
  const [name, setName] = useState(caseItem.name);
  const [description, setDescription] = useState(caseItem.description ?? "");
  const [status, setStatus] = useState(caseItem.status ?? "open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const dirty =
    name.trim() !== caseItem.name ||
    description.trim() !== (caseItem.description ?? "") ||
    status !== (caseItem.status ?? "open");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dirty) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), description: description.trim() || null, status });
      setSavedCount((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save case.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="thin-scrollbar max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Case details</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Case name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} capitalize`}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">
            Close
          </button>
          <button
            type="submit"
            disabled={saving || !dirty || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
        </div>

        <div className="mt-4 border-t border-neutral-800 pt-3">
          <HistoryList load={loadHistory} reloadKey={savedCount} subjects={subjects} title="Case history" defaultOpen />
        </div>
      </form>
    </div>
  );
}
