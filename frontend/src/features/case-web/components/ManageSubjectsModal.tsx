import { useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import type { Evidence, Subject, SubjectKind } from "../types";
import type { HistoryEntry, SubjectInput } from "../api";
import { HistoryList } from "./HistoryList";

interface ManageSubjectsModalProps {
  subjects: Subject[];
  evidence: Evidence[];
  onClose: () => void;
  onAdd: (input: SubjectInput) => Promise<Subject>;
  onUpdate: (id: string, input: Partial<SubjectInput>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Undefined for the demo case, which has no stored history. */
  loadHistory?: () => Promise<HistoryEntry[]>;
}

const SUBJECT_KINDS: SubjectKind[] = ["person", "vehicle", "phone", "other"];

const SUBJECT_COLOR: Record<SubjectKind, string> = {
  person: "#38bdf8",
  phone: "#a78bfa",
  vehicle: "#fbbf24",
  other: "#94a3b8",
};

const inputClass =
  "w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none";

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ManageSubjectsModal({
  subjects,
  evidence,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  loadHistory,
}: ManageSubjectsModalProps) {
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<SubjectKind>("person");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const evidenceCount = new Map<string, number>();
  evidence.forEach((e) => evidenceCount.set(e.subjectId, (evidenceCount.get(e.subjectId) ?? 0) + 1));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError("");
    try {
      await onAdd({ name, kind: newKind });
      setNewName("");
    } catch (err) {
      setError(errorText(err, "Couldn't add subject."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="thin-scrollbar max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Subjects</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <ul className="space-y-2">
          {subjects.length === 0 && (
            <li className="rounded border border-dashed border-neutral-800 px-3 py-4 text-center text-xs text-neutral-500">
              No subjects yet. Add the people, vehicles, or phones you're tracking below.
            </li>
          )}
          {subjects.map((s) => (
            <SubjectRow
              key={s.id}
              subject={s}
              count={evidenceCount.get(s.id) ?? 0}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onError={setError}
            />
          ))}
        </ul>

        <form onSubmit={handleAdd} className="mt-4 grid grid-cols-[1fr_auto_auto] items-end gap-2 border-t border-neutral-800 pt-4">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">New subject</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Person C, Silver Civic, Phone B"
              className={inputClass}
            />
          </label>
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as SubjectKind)}
            className={`${inputClass} w-auto capitalize`}
            aria-label="Subject kind"
          >
            {SUBJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {adding && <Loader2 size={13} className="animate-spin" />}
            Add
          </button>
        </form>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        {loadHistory && (
          <div className="mt-4 border-t border-neutral-800 pt-3">
            <HistoryList load={loadHistory} reloadKey={subjects} subjects={subjects} title="Case history" />
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectRow({
  subject,
  count,
  onUpdate,
  onRemove,
  onError,
}: {
  subject: Subject;
  count: number;
  onUpdate: (id: string, input: Partial<SubjectInput>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(subject.name);
  const [kind, setKind] = useState<SubjectKind>(subject.kind);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dirty = name.trim() !== subject.name || kind !== subject.kind;

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    onError("");
    try {
      await action();
    } catch (err) {
      onError(errorText(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5">
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: SUBJECT_COLOR[kind] }} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty && name.trim()) run(() => onUpdate(subject.id, { name: name.trim(), kind }), "Couldn't save.");
        }}
        aria-label="Subject name"
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-neutral-100 hover:border-neutral-700 focus:border-sky-500 focus:outline-none"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as SubjectKind)}
        aria-label="Subject kind"
        className="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-1 text-xs capitalize text-neutral-300 focus:border-sky-500 focus:outline-none"
      >
        {SUBJECT_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <span className="w-14 flex-shrink-0 text-right font-mono text-[10px] text-neutral-500">
        {count} item{count === 1 ? "" : "s"}
      </span>

      {busy ? (
        <Loader2 size={14} className="mx-1.5 animate-spin text-neutral-500" />
      ) : dirty ? (
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => run(() => onUpdate(subject.id, { name: name.trim(), kind }), "Couldn't save.")}
          className="rounded bg-sky-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Save
        </button>
      ) : confirmingDelete ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => run(() => onRemove(subject.id), "Couldn't delete.").then(() => setConfirmingDelete(false))}
            className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            className="rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={count > 0}
          title={count > 0 ? "Reassign or remove this subject's evidence before deleting it" : "Delete subject"}
          aria-label="Delete subject"
          className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-500"
        >
          <Trash2 size={13} />
        </button>
      )}
    </li>
  );
}
