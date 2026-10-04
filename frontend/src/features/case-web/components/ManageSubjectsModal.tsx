import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import type { Evidence, Subject, SubjectKind } from "../types";
import type { ProfilePictureInput, SubjectInput } from "../api";
import { SubjectAvatar } from "./SubjectAvatar";
import { MAX_ATTACHMENT_BYTES, readFileAsDataUrl } from "./addEvidenceWizard/photoMetadata";

interface ManageSubjectsModalProps {
  subjects: Subject[];
  evidence: Evidence[];
  onClose: () => void;
  onAdd: (input: SubjectInput) => Promise<Subject>;
  onUpdate: (id: string, input: Partial<SubjectInput>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSetPhoto: (id: string, input: ProfilePictureInput) => Promise<void>;
  onRemovePhoto: (id: string) => Promise<void>;
}

const SUBJECT_KINDS: SubjectKind[] = ["person", "vehicle", "phone", "other"];

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
  onSetPhoto,
  onRemovePhoto,
}: ManageSubjectsModalProps) {
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<SubjectKind>("person");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const evidenceCount = new Map<string, number>();
  const involvedCount = new Map<string, number>();
  evidence.forEach((e) => {
    evidenceCount.set(e.subjectId, (evidenceCount.get(e.subjectId) ?? 0) + 1);
    (e.involvedParties ?? []).forEach((p) => {
      if (p.subjectId !== e.subjectId) involvedCount.set(p.subjectId, (involvedCount.get(p.subjectId) ?? 0) + 1);
    });
  });

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
              subjects={subjects}
              count={evidenceCount.get(s.id) ?? 0}
              involvedIn={involvedCount.get(s.id) ?? 0}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onSetPhoto={onSetPhoto}
              onRemovePhoto={onRemovePhoto}
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

        {/* No history here: case history lives in the Edit case window, and subject changes aren't recorded
            (only the UPDATE triggers in schema.sql write history). */}
      </div>
    </div>
  );
}

function SubjectRow({
  subject,
  subjects,
  count,
  involvedIn,
  onUpdate,
  onRemove,
  onSetPhoto,
  onRemovePhoto,
  onError,
}: {
  subject: Subject;
  subjects: Subject[];
  count: number;
  /** Other subjects' items this subject is only "also involved" in. */
  involvedIn: number;
  onUpdate: (id: string, input: Partial<SubjectInput>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSetPhoto: (id: string, input: ProfilePictureInput) => Promise<void>;
  onRemovePhoto: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(subject.name);
  const [kind, setKind] = useState<SubjectKind>(subject.kind);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dirty = name.trim() !== subject.name || kind !== subject.kind;
  const deleteConsequence = [
    count > 0 ? `deletes ${count} evidence item${count === 1 ? "" : "s"}` : null,
    involvedIn > 0 ? `unlinks from ${involvedIn} other${involvedIn === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

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

  async function handlePhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError("Profile picture must be an image file.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      onError(`Profile picture must be under ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`);
      return;
    }
    await run(async () => onSetPhoto(subject.id, { fileName: file.name, dataUrl: await readFileAsDataUrl(file) }), "Couldn't save profile picture.");
  }

  return (
    <li className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5">
      <div className="group relative flex-shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          title={subject.photoUrl ? "Change profile picture" : "Add profile picture"}
          aria-label={subject.photoUrl ? "Change profile picture" : "Add profile picture"}
          className="relative block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <SubjectAvatar subject={subject} subjects={subjects} size={32} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Camera size={13} />
          </span>
        </button>
        {subject.photoUrl && !busy && (
          <button
            type="button"
            onClick={() => run(() => onRemovePhoto(subject.id), "Couldn't remove profile picture.")}
            title="Remove profile picture"
            aria-label="Remove profile picture"
            className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-neutral-200 hover:bg-red-600 group-hover:flex"
          >
            <X size={10} />
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPicked} />
      </div>
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
          {deleteConsequence && <span className="text-[10px] text-red-400">Also {deleteConsequence}.</span>}
          <button
            type="button"
            onClick={() => run(() => onRemove(subject.id), "Couldn't delete.").then(() => setConfirmingDelete(false))}
            className="whitespace-nowrap rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500"
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
          title={count > 0 ? `Delete subject and its ${count} evidence item${count === 1 ? "" : "s"}` : "Delete subject"}
          aria-label="Delete subject"
          className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-500"
        >
          <Trash2 size={13} />
        </button>
      )}
    </li>
  );
}
