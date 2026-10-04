import { useState } from "react";
import type { Evidence, EvidenceType, Subject, TimeCertainty } from "../types";
import { deriveApproximate, deriveExact, deriveRange } from "../timeUtils";
import { extractEvidenceDraft } from "../extractApi";

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

  const [showDraftBox, setShowDraftBox] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [draftSubjectName, setDraftSubjectName] = useState<string | null>(null);

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
    setShowDraftBox(false);
    setDraftText("");
    setExtractError(null);
    setDraftSubjectName(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleExtract() {
    if (!draftText.trim()) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const { evidence, extractedSubjectName, extractedLocationName } = await extractEvidenceDraft(draftText);

      if (evidence.evidenceType) setEvidenceType(evidence.evidenceType);
      if (evidence.event) setEventDesc(evidence.event);
      if (evidence.source) setSource(evidence.source);
      if (evidence.notes) setNotes(evidence.notes);
      if (extractedLocationName) setLocationName(extractedLocationName);

      if (evidence.timeCertainty) {
        setCertainty(evidence.timeCertainty);
        if (evidence.timeCertainty === "exact" && evidence.eventTime) {
          setExactValue(evidence.eventTime);
        } else if (
          evidence.timeCertainty === "approximate" &&
          evidence.eventTime &&
          evidence.earliestPossibleTime &&
          evidence.latestPossibleTime
        ) {
          setApproxValue(evidence.eventTime);
          const marginMs = new Date(evidence.latestPossibleTime).getTime() - new Date(evidence.eventTime).getTime();
          setApproxMargin(String(Math.max(1, Math.round(Math.abs(marginMs) / 60_000))));
        } else if (evidence.timeCertainty === "range" && evidence.earliestPossibleTime && evidence.latestPossibleTime) {
          setRangeStart(evidence.earliestPossibleTime);
          setRangeEnd(evidence.latestPossibleTime);
        }
      }

      // Gemini has no DB access, so it can only name the subject, not match
      // it to a real id - try a case-insensitive name match against the
      // known subjects, and otherwise leave it for the investigator to pick.
      setDraftSubjectName(extractedSubjectName ?? null);
      const match = extractedSubjectName
        ? subjects.find((s) => s.name.toLowerCase() === extractedSubjectName.toLowerCase())
        : undefined;
      if (match) setSubjectId(match.id);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
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

          <div className="rounded border border-dashed border-neutral-700 p-2">
            <button
              type="button"
              onClick={() => setShowDraftBox((v) => !v)}
              className="w-full text-left text-xs text-neutral-400 hover:text-neutral-200"
            >
              {showDraftBox ? "▾" : "▸"} Paste statement (AI draft) — fills in the fields above for you to review
            </button>

            {showDraftBox && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder='e.g. "I saw Alex near the bank around 9am, he left heading north."'
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={extracting || !draftText.trim()}
                    className="rounded bg-neutral-700 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {extracting ? "Extracting…" : "Extract with Gemini"}
                  </button>
                  {draftSubjectName && (
                    <span className="text-xs text-neutral-500">
                      Mentioned: <span className="text-neutral-300">{draftSubjectName}</span> — confirm the Subject field above
                    </span>
                  )}
                </div>
                {extractError && <p className="text-xs text-red-400">{extractError}</p>}
              </div>
            )}
          </div>
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
