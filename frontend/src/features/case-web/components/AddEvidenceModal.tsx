import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import type { Evidence, EvidenceAttachment, EvidenceType, Subject, SubjectKind, TimeCertainty } from "../types";
import { deriveApproximate, deriveExact, deriveRange } from "../timeUtils";
import { formatBytes } from "../attachmentUtils";
import { extractUploadedImageMetadata, type SubjectInput, type UploadedImageMetadata } from "../api";

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB — attachments are stored inline as data URLs
const NEW_SUBJECT = "__new__";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** ISO string -> "YYYY-MM-DDTHH:mm:ss" for a datetime-local input (digits taken literally, see timeUtils). */
function toDatetimeLocalValue(value: string): string {
  return value.slice(0, 19);
}

function buildMetadataNotes(metadata: UploadedImageMetadata): string {
  const notes = [
    metadata.capturedAt ? `Photo taken: ${metadata.capturedAt.replace("T", " ")} (camera clock)` : null,
    metadata.width && metadata.height ? `Image size: ${metadata.width}x${metadata.height}` : null,
    metadata.cameraMake || metadata.cameraModel
      ? `Camera: ${[metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(" ")}`
      : null,
    metadata.software ? `Software: ${metadata.software}` : null,
  ].filter(Boolean);

  return notes.join("\n");
}

function metadataSummary(metadata: UploadedImageMetadata): string {
  const parts = [
    metadata.capturedAt ? metadata.capturedAt.replace("T", " ") : null,
    metadata.latitude !== null && metadata.longitude !== null
      ? `${metadata.latitude.toFixed(4)}, ${metadata.longitude.toFixed(4)}`
      : null,
    [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(" ") || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No time, GPS, or camera data found";
}

interface AddEvidenceModalProps {
  subjects: Subject[];
  /** When set, the form edits this evidence instead of creating a new one. */
  initial?: Evidence;
  onClose: () => void;
  onSubmit: (input: Omit<Evidence, "id">) => Promise<void>;
  onCreateSubject: (input: SubjectInput) => Promise<Subject>;
}

const EVIDENCE_TYPES: EvidenceType[] = [
  "witness",
  "cctv",
  "gps",
  "phone",
  "transaction",
  "transit",
  "police",
  "digital",
  "other",
];

const SUBJECT_KINDS: SubjectKind[] = ["person", "vehicle", "phone", "other"];

const CERTAINTIES: TimeCertainty[] = ["exact", "approximate", "range"];

const inputClass =
  "w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none";

type MetadataStatus = { state: "loading" } | { state: "done"; metadata: UploadedImageMetadata } | { state: "error"; message: string };

/** Mount fresh each time it opens (the parent renders it conditionally) so fields start from `initial`. */
export function AddEvidenceModal({ subjects, initial, onClose, onSubmit, onCreateSubject }: AddEvidenceModalProps) {
  const initialMarginMinutes = initial
    ? Math.round((new Date(initial.latestPossibleTime).getTime() - new Date(initial.eventTime).getTime()) / 60_000)
    : 10;

  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? subjects[0]?.id ?? NEW_SUBJECT);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectKind, setNewSubjectKind] = useState<SubjectKind>("person");
  const [evidenceType, setEvidenceType] = useState<EvidenceType>(initial?.evidenceType ?? "witness");
  const [locationName, setLocationName] = useState(initial?.location.name ?? "");
  const [lat, setLat] = useState(initial ? String(initial.location.lat) : "");
  const [lng, setLng] = useState(initial ? String(initial.location.lng) : "");
  const [eventDesc, setEventDesc] = useState(initial?.event ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [certainty, setCertainty] = useState<TimeCertainty>(initial?.timeCertainty ?? "exact");
  const [exactValue, setExactValue] = useState(
    initial?.timeCertainty === "exact" ? toDatetimeLocalValue(initial.eventTime) : ""
  );
  const [approxValue, setApproxValue] = useState(
    initial?.timeCertainty === "approximate" ? toDatetimeLocalValue(initial.eventTime) : ""
  );
  const [approxMargin, setApproxMargin] = useState(String(initialMarginMinutes || 10));
  const [rangeStart, setRangeStart] = useState(
    initial?.timeCertainty === "range" ? toDatetimeLocalValue(initial.earliestPossibleTime) : ""
  );
  const [rangeEnd, setRangeEnd] = useState(
    initial?.timeCertainty === "range" ? toDatetimeLocalValue(initial.latestPossibleTime) : ""
  );
  const [attachments, setAttachments] = useState<EvidenceAttachment[]>(initial?.attachments ?? []);
  const [metadataById, setMetadataById] = useState<Record<string, MetadataStatus>>({});
  const [attachmentError, setAttachmentError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasAnyTime = Boolean(exactValue || approxValue || rangeStart || rangeEnd);

  /** Fill empty fields from photo metadata; never overwrite what the investigator typed. */
  function applyMetadata(metadata: UploadedImageMetadata, fallbackName: string) {
    const capturedAt = metadata.capturedAt;
    if (capturedAt && !hasAnyTime) {
      setCertainty("exact");
      setExactValue((current) => current || toDatetimeLocalValue(capturedAt));
    }

    if (metadata.latitude !== null && metadata.longitude !== null) {
      setLat((current) => current || String(metadata.latitude));
      setLng((current) => current || String(metadata.longitude));
      setLocationName((current) => current || "Photo GPS location");
    }

    const name = metadata.fileName || fallbackName;
    setSource((current) => current || name);
    setEventDesc((current) => current || `Uploaded evidence from ${name}`);

    const metadataNotes = buildMetadataNotes(metadata);
    if (metadataNotes) {
      setNotes((current) => (current ? current : metadataNotes));
    }
  }

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setAttachmentError("");
    const files = Array.from(fileList);
    const tooBig = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const ok = files.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (tooBig.length > 0) {
      setAttachmentError(`Skipped ${tooBig.length} file(s) over 8MB.`);
    }

    const next = await Promise.all(
      ok.map(async (file, i) => {
        const attachment: EvidenceAttachment = {
          id: `att-${Date.now()}-${i}`,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: await readFileAsDataUrl(file),
        };
        return attachment;
      })
    );
    setAttachments((prev) => [...prev, ...next]);

    for (const attachment of next) {
      if (!attachment.type.startsWith("image/")) continue;
      setMetadataById((prev) => ({ ...prev, [attachment.id]: { state: "loading" } }));
      try {
        const metadata = await extractUploadedImageMetadata({
          fileName: attachment.name,
          fileType: attachment.type,
          dataUrl: attachment.dataUrl,
        });
        setMetadataById((prev) => ({ ...prev, [attachment.id]: { state: "done", metadata } }));
        applyMetadata(metadata, attachment.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        setMetadataById((prev) => ({
          ...prev,
          [attachment.id]: { state: "error", message: `Metadata could not be read: ${message}` },
        }));
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (subjectId === NEW_SUBJECT && !newSubjectName.trim()) {
      setFormError("Enter a name for the new subject.");
      return;
    }
    if (!eventDesc.trim() || !locationName.trim() || !source.trim()) {
      setFormError("Fill in what was observed, the location, and the source.");
      return;
    }

    let times;
    if (certainty === "exact") {
      if (!exactValue) return setFormError("Enter the time of the event.");
      times = deriveExact(exactValue);
    } else if (certainty === "approximate") {
      if (!approxValue) return setFormError("Enter the approximate time of the event.");
      times = deriveApproximate(approxValue, Number(approxMargin) || 0);
    } else {
      if (!rangeStart || !rangeEnd) return setFormError("Enter both the start and end of the time range.");
      if (rangeEnd < rangeStart) return setFormError("The range end must be after its start.");
      times = deriveRange(rangeStart, rangeEnd);
    }

    setSaving(true);
    try {
      let finalSubjectId = subjectId;
      if (subjectId === NEW_SUBJECT) {
        const created = await onCreateSubject({ name: newSubjectName.trim(), kind: newSubjectKind });
        finalSubjectId = created.id;
        setSubjectId(created.id);
      }

      await onSubmit({
        subjectId: finalSubjectId,
        evidenceType,
        location: { name: locationName.trim(), lat: Number(lat) || 0, lng: Number(lng) || 0 },
        event: eventDesc.trim(),
        source: source.trim(),
        notes: notes.trim() || undefined,
        timeCertainty: certainty,
        attachments: attachments.length > 0 ? attachments : undefined,
        ...times,
      });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn't save evidence.");
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
          <h2 className="text-sm font-semibold text-neutral-100">{initial ? "Edit Evidence" : "Add Evidence"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Subject</span>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NEW_SUBJECT}>+ New subject…</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Type</span>
              <select
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
                className={`${inputClass} capitalize`}
              >
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {subjectId === NEW_SUBJECT && (
            <div className="grid grid-cols-[1fr_auto] gap-3 rounded border border-sky-500/30 bg-sky-500/5 p-2">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">New subject name</span>
                <input
                  autoFocus
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="e.g. Person C"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">Kind</span>
                <select
                  value={newSubjectKind}
                  onChange={(e) => setNewSubjectKind(e.target.value as SubjectKind)}
                  className={`${inputClass} capitalize`}
                >
                  {SUBJECT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div>
            <span className="mb-1 block text-xs text-neutral-400">Attachments (optional)</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="hidden"
              id="evidence-attachments-input"
            />
            <label
              htmlFor="evidence-attachments-input"
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded border border-dashed border-neutral-700 px-2 py-2 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
            >
              <Paperclip size={13} />
              Upload documents or images (photo time and GPS fill in automatically)
            </label>
            {attachmentError && <p className="mt-1 text-[11px] text-red-400">{attachmentError}</p>}

            {attachments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {attachments.map((a) => {
                  const meta = metadataById[a.id];
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5"
                    >
                      {a.type.startsWith("image/") ? (
                        <img src={a.dataUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-neutral-800 text-neutral-500">
                          <FileText size={15} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-neutral-300">{a.name}</p>
                        <p className="font-mono text-[10px] text-neutral-600">{formatBytes(a.size)}</p>
                        {meta?.state === "loading" && (
                          <p className="flex items-center gap-1 text-[10px] text-neutral-500">
                            <Loader2 size={10} className="animate-spin" /> Reading metadata…
                          </p>
                        )}
                        {meta?.state === "done" && (
                          <p className="truncate font-mono text-[10px] text-emerald-400/80">
                            {metadataSummary(meta.metadata)}
                          </p>
                        )}
                        {meta?.state === "error" && <p className="text-[10px] text-red-400">{meta.message}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        aria-label="Remove attachment"
                        className="flex-shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">What was observed</span>
            <input
              value={eventDesc}
              onChange={(e) => setEventDesc(e.target.value)}
              placeholder="e.g. Witness reports seeing Person A near..."
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Location</span>
              <input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Metrotown"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Lat</span>
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="49.2267"
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Lng</span>
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-123.0033"
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Source</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Witness statement: ..."
              className={inputClass}
            />
          </label>

          <div>
            <span className="mb-1 block text-xs text-neutral-400">Time certainty</span>
            <div className="mb-2 flex gap-1 rounded border border-neutral-700 bg-neutral-950 p-0.5 text-xs">
              {CERTAINTIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCertainty(c)}
                  className={`flex-1 rounded px-2 py-1 capitalize transition-colors ${
                    certainty === c ? "bg-sky-600 text-white" : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {certainty === "exact" && (
              <input
                type="datetime-local"
                step={1}
                value={exactValue}
                onChange={(e) => setExactValue(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            )}

            {certainty === "approximate" && (
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={approxValue}
                  onChange={(e) => setApproxValue(e.target.value)}
                  className={`${inputClass} flex-1 font-mono`}
                />
                <div className="flex items-center gap-1 whitespace-nowrap text-xs text-neutral-400">
                  <span>±</span>
                  <input
                    type="number"
                    min={1}
                    value={approxMargin}
                    onChange={(e) => setApproxMargin(e.target.value)}
                    className={`${inputClass} w-14 font-mono`}
                  />
                  <span>min</span>
                </div>
              </div>
            )}

            {certainty === "range" && (
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className={`${inputClass} flex-1 font-mono`}
                />
                <span className="text-neutral-500">to</span>
                <input
                  type="datetime-local"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className={`${inputClass} flex-1 font-mono`}
                />
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </label>

          <button
            type="button"
            disabled
            title="Coming soon: paste a raw statement and let Gemini draft the fields above"
            className="w-full cursor-not-allowed rounded border border-dashed border-neutral-700 px-2 py-1.5 text-xs text-neutral-600"
          >
            Paste statement (AI draft — coming soon)
          </button>
        </div>

        {formError && <p className="mt-3 text-xs text-red-400">{formError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {initial ? "Save Changes" : "Add Evidence"}
          </button>
        </div>
      </form>
    </div>
  );
}
