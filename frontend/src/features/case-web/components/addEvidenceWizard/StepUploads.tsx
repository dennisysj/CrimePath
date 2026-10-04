import { useRef, useState } from "react";
import { FileText, Film, Sparkles, UploadCloud, X } from "lucide-react";
import type { EvidenceAttachment, Subject } from "../../types";
import { ROLE_LABELS } from "../../types";
import { formatBytes } from "../../attachmentUtils";
import { KNOWN_LOCATIONS } from "../../mockData";
import { SOURCE_OPTIONS, type WizardDraft } from "./wizardTypes";
import { summarizeWhen } from "./wizardTime";

interface StepUploadsProps {
  draft: WizardDraft;
  subjects: Subject[];
  onChangeDraft: (patch: Partial<WizardDraft>) => void;
  onBackToDetails: () => void;
}

let attachmentSeq = 1;

function filesToAttachments(files: File[]): EvidenceAttachment[] {
  return files.map((file) => ({
    id: `att-${Date.now()}-${attachmentSeq++}`,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    previewUrl: URL.createObjectURL(file),
  }));
}

/**
 * Mock "Gemini" extraction: a plain heuristic over the typed description —
 * no API call. Looks for a time ("9:45am"), a subject name, and a known
 * location name already mentioned in the text. Never overwrites fields it
 * can't find a match for, so a manual edit never gets clobbered.
 */
function mockAutoFillFromText(text: string, subjects: Subject[]): Partial<WizardDraft> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const patch: Partial<WizardDraft> = {};

  const timeMatch = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    const hour = timeMatch[1];
    const minute = (timeMatch[2] ?? "00").padStart(2, "0");
    const period = timeMatch[3].toUpperCase() as "AM" | "PM";
    patch.certainty = "approximate";
    patch.approxTime = { hour, minute, second: "00", period };
    patch.approxMarginMinutes = "15";
  }

  const matchedSubject = subjects.find((s) => lower.includes(s.name.toLowerCase()));
  if (matchedSubject) patch.subjectId = matchedSubject.id;

  const matchedLocation = KNOWN_LOCATIONS.find((l) => lower.includes(l.name.toLowerCase()));
  if (matchedLocation) {
    patch.locationName = matchedLocation.name;
    patch.locationLat = matchedLocation.lat;
    patch.locationLng = matchedLocation.lng;
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

/** Step 3: description (+ mock AI auto-fill) first, then the optional upload dropzone, below a read-only summary of steps 1-2. */
export function StepUploads({ draft, subjects, onChangeDraft, onBackToDetails }: StepUploadsProps) {
  const [dragActive, setDragActive] = useState(false);
  const [autoFillMessage, setAutoFillMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sourceOption = SOURCE_OPTIONS.find((o) => o.type === draft.evidenceType);
  const SourceIcon = sourceOption?.icon;
  const subject = subjects.find((s) => s.id === draft.subjectId);
  const whenLabel = summarizeWhen(draft);
  const canAutoFill = draft.notes.trim().length > 0 || draft.attachments.length > 0;

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList || fileList.length === 0) return;
    const created = filesToAttachments(Array.from(fileList));
    onChangeDraft({ attachments: [...draft.attachments, ...created] });
  }

  function removeAttachment(id: string) {
    const target = draft.attachments.find((a) => a.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChangeDraft({ attachments: draft.attachments.filter((a) => a.id !== id) });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  function handleAutoFill() {
    if (!draft.notes.trim()) {
      setAutoFillMessage("Auto-fill from uploaded files isn't available in this preview — try adding a short description instead.");
      return;
    }
    const patch = mockAutoFillFromText(draft.notes, subjects);
    if (!patch) {
      setAutoFillMessage("Couldn't find enough detail to auto-fill — happy to let you fill it in manually.");
      return;
    }
    onChangeDraft(patch);
    setAutoFillMessage("Auto-filled from your description — review before adding.");
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--text)" }}>
            {SourceIcon && <SourceIcon size={14} className="text-[var(--accent)]" />}
            {sourceOption?.label}
          </span>
          <button type="button" onClick={onBackToDetails} className="text-xs underline hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]" style={{ color: "var(--accent)" }}>
            edit
          </button>
        </div>
        <dl className="space-y-0.5 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
          <div className="flex gap-2">
            <dt className="w-16 flex-shrink-0" style={{ color: "var(--text-muted)" }}>Subject</dt>
            <dd>{subject?.name ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 flex-shrink-0" style={{ color: "var(--text-muted)" }}>When</dt>
            <dd>{whenLabel || "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 flex-shrink-0" style={{ color: "var(--text-muted)" }}>Location</dt>
            <dd>{draft.locationName || "—"}</dd>
          </div>
          {draft.involvedParties.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-16 flex-shrink-0" style={{ color: "var(--text-muted)" }}>Involved</dt>
              <dd className="space-y-0.5">
                {draft.involvedParties.map((p, i) => {
                  const s = subjects.find((su) => su.id === p.subjectId);
                  return (
                    <div key={i}>
                      {s?.name ?? "—"} <span style={{ color: "var(--text-muted)" }}>({ROLE_LABELS[p.role]})</span>
                    </div>
                  );
                })}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div>
        <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Description (optional)</span>
        <textarea
          value={draft.notes}
          onChange={(e) => {
            onChangeDraft({ notes: e.target.value });
            setAutoFillMessage(null);
          }}
          rows={3}
          placeholder='e.g. "I saw Person A near Metrotown around 9pm."'
          className="w-full resize-none rounded border px-2 py-1.5 focus:outline-none"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        <button
          type="button"
          onClick={handleAutoFill}
          disabled={!canAutoFill}
          title="Mock AI extraction — a heuristic over the text above, not a real Gemini call"
          className="mt-1.5 flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs font-medium hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
          style={{ borderColor: "var(--accent)", background: "rgba(61,106,242,0.1)", color: "var(--accent)" }} /* UPDATED line 173: rgba was (47,91,234) */
        >
          <Sparkles size={13} />
          Auto-fill from description
        </button>
        {autoFillMessage && <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{autoFillMessage}</p>}
      </div>

      <div>
        <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Upload files (optional)</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
          id="wizard-upload-input"
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-6 text-center transition-colors hover:brightness-95"
          style={dragActive ? { borderColor: "var(--accent)", background: "rgba(61,106,242,0.08)" } : { borderColor: "var(--border-strong)" }} /* UPDATED line 204: rgba was (47,91,234) */
        >
          <UploadCloud size={22} style={{ color: "var(--text-muted)" }} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Drag and drop, or <span style={{ color: "var(--accent)" }}>click to browse</span>
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Images, video, or PDF</p>
        </div>

        {draft.attachments.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {draft.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded border px-2 py-1.5"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                {a.mimeType.startsWith("image/") ? (
                  <img src={a.previewUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
                    {a.mimeType.startsWith("video/") ? <Film size={15} /> : <FileText size={15} />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs" style={{ color: "var(--text)" }}>{a.name}</p>
                  <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{formatBytes(a.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  aria-label="Remove attachment"
                  className="flex-shrink-0 rounded p-1 hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--conflict-ring)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
