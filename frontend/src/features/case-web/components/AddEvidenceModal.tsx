import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import type { Evidence, EvidenceAttachment, EvidenceType, Subject, TimeCertainty } from "../types";
import { deriveApproximate, deriveExact, deriveRange } from "../timeUtils";
import { formatBytes } from "../attachmentUtils";

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB — keeps data URLs from bloating memory in this mock UI

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface AddEvidenceModalProps {
  open: boolean;
  subjects: Subject[];
  onClose: () => void;
  onSubmit: (input: Omit<Evidence, "id">) => void;
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

const CERTAINTIES: TimeCertainty[] = ["exact", "approximate", "range"];

const inputClass =
  "w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none";

export function AddEvidenceModal({ open, subjects, onClose, onSubmit }: AddEvidenceModalProps) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("witness");
  const [locationName, setLocationName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [certainty, setCertainty] = useState<TimeCertainty>("exact");
  const [exactValue, setExactValue] = useState("");
  const [approxValue, setApproxValue] = useState("");
  const [approxMargin, setApproxMargin] = useState("10");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [attachments, setAttachments] = useState<EvidenceAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setSubjectId(subjects[0]?.id ?? "");
    setEvidenceType("witness");
    setLocationName("");
    setLat("");
    setLng("");
    setEventDesc("");
    setSource("");
    setNotes("");
    setCertainty("exact");
    setExactValue("");
    setApproxValue("");
    setApproxMargin("10");
    setRangeStart("");
    setRangeEnd("");
    setAttachments([]);
    setAttachmentError("");
  }

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setAttachmentError("");
    const files = Array.from(fileList);
    const tooBig = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const ok = files.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);

    const next = await Promise.all(
      ok.map(async (file, i) => {
        const dataUrl = await readFileAsDataUrl(file);
        const attachment: EvidenceAttachment = {
          id: `att-${Date.now()}-${i}`,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl,
        };
        return attachment;
      })
    );

    setAttachments((prev) => [...prev, ...next]);
    if (tooBig.length > 0) {
      setAttachmentError(`Skipped ${tooBig.length} file(s) over 8MB.`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !locationName.trim() || !source.trim() || !eventDesc.trim()) return;

    let times;
    if (certainty === "exact") {
      if (!exactValue) return;
      times = deriveExact(exactValue);
    } else if (certainty === "approximate") {
      if (!approxValue) return;
      times = deriveApproximate(approxValue, Number(approxMargin) || 0);
    } else {
      if (!rangeStart || !rangeEnd) return;
      times = deriveRange(rangeStart, rangeEnd);
    }

    onSubmit({
      subjectId,
      evidenceType,
      location: { name: locationName.trim(), lat: Number(lat) || 0, lng: Number(lng) || 0 },
      event: eventDesc.trim(),
      source: source.trim(),
      notes: notes.trim() || undefined,
      timeCertainty: certainty,
      attachments: attachments.length > 0 ? attachments : undefined,
      ...times,
    });
    handleClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={handleClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Add Evidence</h2>
          <button
            type="button"
            onClick={handleClose}
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
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </label>

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
              Upload documents or images
            </label>
            {attachmentError && <p className="mt-1 text-[11px] text-red-400">{attachmentError}</p>}

            {attachments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {attachments.map((a) => (
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
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            disabled
            title="Coming soon: paste a raw statement and let Gemini draft the fields above"
            className="w-full cursor-not-allowed rounded border border-dashed border-neutral-700 px-2 py-1.5 text-xs text-neutral-600"
          >
            Paste statement (AI draft — coming soon)
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={handleClose} className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">
            Cancel
          </button>
          <button type="submit" className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
            Add Evidence
          </button>
        </div>
      </form>
    </div>
  );
}
