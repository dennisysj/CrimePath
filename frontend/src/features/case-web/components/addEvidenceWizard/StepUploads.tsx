import { useRef, useState } from "react";
import { FileText, Film, Loader2, MapPin, Sparkles, UploadCloud, X } from "lucide-react";
import type { Subject } from "../../types";
import type { UploadedImageMetadata } from "../../api";
import { ROLE_LABELS } from "../../types";
import { formatBytes } from "../../attachmentUtils";
import { KNOWN_LOCATIONS } from "../../mockData";
import { SOURCE_OPTIONS, type WizardDraft } from "./wizardTypes";
import { summarizeWhen } from "./wizardTime";
import { hasTimeOrLocation, metadataSummary } from "./photoMetadata";

export type AttachmentMetadataStatus =
  | { state: "saving" }
  | { state: "loading" }
  | { state: "done"; metadata: UploadedImageMetadata }
  | { state: "error"; message: string };

interface StepUploadsProps {
  draft: WizardDraft;
  subjects: Subject[];
  onChangeDraft: (patch: Partial<WizardDraft>) => void;
  onBackToDetails: () => void;
  metadataById: Record<string, AttachmentMetadataStatus>;
  uploadError: string;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** Overwrite When/Location with this photo's metadata. */
  onApplyMetadata: (attachmentId: string) => void;
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
export function StepUploads({
  draft,
  subjects,
  onChangeDraft,
  onBackToDetails,
  metadataById,
  uploadError,
  onAddFiles,
  onRemoveAttachment,
  onApplyMetadata,
}: StepUploadsProps) {
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
    onAddFiles(Array.from(fileList));
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
      <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium text-neutral-100">
            {SourceIcon && <SourceIcon size={14} className="text-sky-400" />}
            {sourceOption?.label}
          </span>
          <button type="button" onClick={onBackToDetails} className="text-xs text-sky-400 underline hover:text-sky-300">
            edit
          </button>
        </div>
        <dl className="space-y-0.5 font-mono text-xs text-neutral-400">
          <div className="flex gap-2">
            <dt className="w-16 flex-shrink-0 text-neutral-600">Subject</dt>
            <dd>{subject?.name ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 flex-shrink-0 text-neutral-600">When</dt>
            <dd>{whenLabel || "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 flex-shrink-0 text-neutral-600">Location</dt>
            <dd>{draft.locationName || "—"}</dd>
          </div>
          {draft.involvedParties.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-16 flex-shrink-0 text-neutral-600">Involved</dt>
              <dd className="space-y-0.5">
                {draft.involvedParties.map((p, i) => {
                  const s = subjects.find((su) => su.id === p.subjectId);
                  return (
                    <div key={i}>
                      {s?.name ?? "—"} <span className="text-neutral-600">({ROLE_LABELS[p.role]})</span>
                    </div>
                  );
                })}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div>
        <span className="mb-1 block text-xs text-neutral-400">Description (optional)</span>
        <textarea
          value={draft.notes}
          onChange={(e) => {
            onChangeDraft({ notes: e.target.value });
            setAutoFillMessage(null);
          }}
          rows={3}
          placeholder='e.g. "I saw Person A near Metrotown around 9pm."'
          className="w-full resize-none rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAutoFill}
          disabled={!canAutoFill}
          title="Mock AI extraction — a heuristic over the text above, not a real Gemini call"
          className="mt-1.5 flex items-center gap-1.5 rounded border border-sky-700/50 bg-sky-500/10 px-2 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-transparent disabled:text-neutral-500"
        >
          <Sparkles size={13} />
          Auto-fill from description
        </button>
        {autoFillMessage && <p className="mt-1 text-[11px] text-neutral-500">{autoFillMessage}</p>}
      </div>

      <div>
        <span className="mb-1 block text-xs text-neutral-400">Upload files (optional)</span>
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
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-6 text-center transition-colors ${
            dragActive
              ? "border-sky-500 bg-sky-500/10"
              : "border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900/50"
          }`}
        >
          <UploadCloud size={22} className="text-neutral-500" />
          <p className="text-xs text-neutral-400">
            Drag and drop, or <span className="text-sky-400">click to browse</span>
          </p>
          <p className="text-[11px] text-neutral-600">Images, video, or PDF · photo time and GPS are read automatically</p>
        </div>
        {uploadError && <p className="mt-1 text-[11px] text-red-400">{uploadError}</p>}

        {draft.attachments.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {draft.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5"
              >
                {a.mimeType.startsWith("image/") ? (
                  <img src={a.previewUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-neutral-800 text-neutral-500">
                    {a.mimeType.startsWith("video/") ? <Film size={15} /> : <FileText size={15} />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-neutral-300">{a.name}</p>
                  <p className="font-mono text-[10px] text-neutral-600">{formatBytes(a.size)}</p>
                  <MetadataLine status={metadataById[a.id]} onApply={() => onApplyMetadata(a.id)} />
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(a.id)}
                  aria-label="Remove attachment"
                  className="flex-shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
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

function MetadataLine({ status, onApply }: { status: AttachmentMetadataStatus | undefined; onApply: () => void }) {
  if (!status) return null;
  if (status.state === "saving" || status.state === "loading") {
    return (
      <p className="flex items-center gap-1 text-[10px] text-neutral-500">
        <Loader2 size={10} className="animate-spin" />{" "}
        {status.state === "saving" ? "Saving to src/images…" : "Reading photo metadata…"}
      </p>
    );
  }
  if (status.state === "error") return <p className="text-[10px] text-red-400">{status.message}</p>;
  return (
    <div className="flex items-center gap-1.5">
      <p className="min-w-0 truncate font-mono text-[10px] text-emerald-400/80">{metadataSummary(status.metadata)}</p>
      {hasTimeOrLocation(status.metadata) && (
        <button
          type="button"
          onClick={onApply}
          title="Use this photo's time and GPS for When and Location"
          className="flex flex-shrink-0 items-center gap-0.5 rounded border border-emerald-700/50 px-1 text-[10px] text-emerald-300 hover:bg-emerald-500/10"
        >
          <MapPin size={9} /> Apply
        </button>
      )}
    </div>
  );
}
