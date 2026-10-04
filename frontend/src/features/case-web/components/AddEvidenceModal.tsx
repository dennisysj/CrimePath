// "Add event": step 1 picks the crime itself (its own one-page form) or an
// evidence source, which continues as a 3-step wizard
// (Source -> Details -> Uploads). Gemini extraction fills that draft so the
// investigator can still review every field before submitting.
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { Crime, Evidence, EvidenceType, Subject, SubjectKind } from "../types";
import { geocodePlace, readUploadedFileMetadata, uploadFile, type CrimeInput } from "../api";
import { extractEvidenceDraft } from "../extractApi";
import { getEvidenceCoordinates } from "../locationUtils";
import { StepSource } from "./addEvidenceWizard/StepSource";
import { CrimeForm } from "./addEvidenceWizard/CrimeForm";
import { StepDetails } from "./addEvidenceWizard/StepDetails";
import { StepUploads } from "./addEvidenceWizard/StepUploads";
import type { LocationStat } from "./addEvidenceWizard/LocationCombobox";
import {
  DEFAULT_CERTAINTY_FOR_SOURCE,
  EMPTY_DRAFT,
  SOURCE_OPTIONS,
  STEP_LABELS,
  type ClockValue,
  type WizardDraft,
  type WizardStep,
} from "./addEvidenceWizard/wizardTypes";
import { isStep2Valid } from "./addEvidenceWizard/wizardTime";
import { buildEvidenceInput } from "./addEvidenceWizard/wizardSubmit";
import {
  MAX_ATTACHMENT_BYTES,
  evidenceToDraft,
  fileToAttachment,
  metadataPatchForEmptyFields,
  metadataToDraftPatch,
} from "./addEvidenceWizard/photoMetadata";
import type { AttachmentMetadataStatus } from "./addEvidenceWizard/StepUploads";

interface AddEvidenceModalProps {
  subjects: Subject[];
  evidence: Evidence[];
  /** When set, the wizard edits this evidence instead of creating a new one. */
  initial?: Evidence;
  /** When set, the modal opens straight on the crime form to edit this crime. */
  initialCrime?: Crime;
  onClose: () => void;
  onSubmit: (input: Omit<Evidence, "id">) => void | Promise<void>;
  onAddSubject: (input: Omit<Subject, "id">) => Promise<Subject>;
  onSubmitCrime: (input: CrimeInput) => Promise<void>;
  onDeleteCrime?: () => Promise<void>;
}

const ALL_STEPS: WizardStep[] = [1, 2, 3];
const WIZARD_EVIDENCE_TYPES = new Set<string>(SOURCE_OPTIONS.map((option) => option.type));

function asWizardType(value: string | undefined): EvidenceType | null {
  if (value && WIZARD_EVIDENCE_TYPES.has(value)) return value as EvidenceType;
  return null;
}

/** Times without an offset are wall-clock times; read them as UTC like the rest of the timeline, not as browser-local. */
function parseWallClock(iso: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);
}

function isoToDateAndClock(iso: string): { date: string; clock: ClockValue } | null {
  const parsed = parseWallClock(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  let hour = parsed.getUTCHours();
  const period: ClockValue["period"] = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return {
    date: parsed.toISOString().slice(0, 10),
    clock: {
      hour: String(hour),
      minute: String(parsed.getUTCMinutes()).padStart(2, "0"),
      second: String(parsed.getUTCSeconds()).padStart(2, "0"),
      period,
    },
  };
}

const SUBJECT_PREFIXES = new Set(["person", "subject", "suspect", "witness", "phone", "vehicle", "car", "mr", "ms", "mrs"]);

/** Words of a name, minus generic prefixes: "Person A" and "subject a" both -> ["a"]. */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !SUBJECT_PREFIXES.has(word))
    .join(" ");
}

/** Match Gemini's subject name ("a", "subject a") to a case subject ("Person A"). */
function findSubjectByName(subjects: Subject[], extracted: string): Subject | undefined {
  const exact = subjects.find((s) => s.name.toLowerCase() === extracted.trim().toLowerCase());
  if (exact) return exact;
  const key = nameKey(extracted);
  if (!key) return undefined;
  const matches = subjects.filter((s) => nameKey(s.name) === key);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Mount fresh each time it opens (the parent renders it conditionally) so the draft starts from `initial`. */
export function AddEvidenceModal({
  subjects,
  evidence,
  initial,
  initialCrime,
  onClose,
  onSubmit,
  onAddSubject,
  onSubmitCrime,
  onDeleteCrime,
}: AddEvidenceModalProps) {
  const isEdit = Boolean(initial);
  const [crimeMode, setCrimeMode] = useState(Boolean(initialCrime));
  const [step, setStep] = useState<WizardStep>(initial ? 2 : 1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [slideEntered, setSlideEntered] = useState(true);
  const [draft, setDraft] = useState<WizardDraft>(() => (initial ? evidenceToDraft(initial) : EMPTY_DRAFT));
  const [metadataById, setMetadataById] = useState<Record<string, AttachmentMetadataStatus>>({});
  const [uploadError, setUploadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAttachmentCount, setSubmittedAttachmentCount] = useState(0);
  const [showDraftBox, setShowDraftBox] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [draftSubjectName, setDraftSubjectName] = useState<string | null>(null);

  // Re-trigger the slide-in transition every time the step changes: render
  // at the offset position first, then flip to "entered" next frame so the
  // CSS transition actually animates instead of snapping.
  useEffect(() => {
    setSlideEntered(false);
    const raf = requestAnimationFrame(() => setSlideEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const locationStats = useMemo<LocationStat[]>(() => {
    const byName = new Map<string, LocationStat>();
    evidence.forEach((item) => {
      const key = item.location.name.toLowerCase();
      const existing = byName.get(key);
      if (existing) existing.count += 1;
      else {
        const coords = getEvidenceCoordinates(item);
        byName.set(key, { name: item.location.name, lat: coords?.lat ?? null, lng: coords?.lng ?? null, count: 1 });
      }
    });
    return Array.from(byName.values()).sort((a, b) => b.count - a.count);
  }, [evidence]);

  function reset() {
    // Attachments use URL.createObjectURL, which must be revoked explicitly
    // or the blob stays alive in memory even after the modal is discarded.
    // (After a successful submit, draft.attachments is already emptied —
    // see handleSubmit — so this is a no-op there; it only fires for real
    // when the modal is abandoned before submitting.)
    draft.attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
    setStep(1);
    setDirection("forward");
    setSlideEntered(true);
    setDraft(EMPTY_DRAFT);
    setMetadataById({});
    setUploadError("");
    setSubmitError("");
    setShowDraftBox(false);
    setDraftText("");
    setExtractError(null);
    setDraftSubjectName(null);
  }

  function handleClose() {
    reset();
    setSubmitted(false);
    onClose();
  }

  function handleAddAnother() {
    reset();
    setSubmitted(false);
  }

  async function handleExtract() {
    if (!draftText.trim()) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const { evidence: extracted, extractedSubjectName, extractedLocationName } = await extractEvidenceDraft(draftText);
      const patch: Partial<WizardDraft> = {};
      const evidenceType = asWizardType(extracted.evidenceType);

      if (evidenceType) {
        patch.evidenceType = evidenceType;
        patch.certainty = extracted.timeCertainty ?? DEFAULT_CERTAINTY_FOR_SOURCE[evidenceType];
      } else if (extracted.timeCertainty) {
        patch.certainty = extracted.timeCertainty;
      }

      if (extractedLocationName) {
        // Reuse coordinates from a location already in this case; otherwise
        // they're looked up below, once the rest of the draft is filled in.
        const known = locationStats.find((l) => l.name.toLowerCase() === extractedLocationName.toLowerCase());
        patch.locationName = known?.name ?? extractedLocationName;
        patch.locationLat = known?.lat ?? null;
        patch.locationLng = known?.lng ?? null;
      }

      const noteParts = [extracted.event, extracted.notes].filter((part): part is string => Boolean(part));
      if (noteParts.length > 0) patch.notes = noteParts.join("\n");

      if (extracted.timeCertainty === "exact" && extracted.eventTime) {
        const parsed = isoToDateAndClock(extracted.eventTime);
        if (parsed) {
          patch.date = parsed.date;
          patch.exactTime = parsed.clock;
          patch.certainty = "exact";
        }
      } else if (extracted.timeCertainty === "approximate" && extracted.eventTime && extracted.latestPossibleTime) {
        const parsed = isoToDateAndClock(extracted.eventTime);
        if (parsed) {
          patch.date = parsed.date;
          patch.approxTime = { ...parsed.clock, second: "00" };
          const marginMs =
            parseWallClock(extracted.latestPossibleTime).getTime() - parseWallClock(extracted.eventTime).getTime();
          patch.approxMarginMinutes = String(Math.max(1, Math.round(Math.abs(marginMs) / 60_000)));
          patch.certainty = "approximate";
        }
      } else if (extracted.timeCertainty === "range" && extracted.earliestPossibleTime && extracted.latestPossibleTime) {
        const start = isoToDateAndClock(extracted.earliestPossibleTime);
        const end = isoToDateAndClock(extracted.latestPossibleTime);
        if (start && end) {
          patch.date = start.date;
          patch.rangeStart = { ...start.clock, second: "00" };
          patch.rangeEnd = { ...end.clock, second: "00" };
          patch.certainty = "range";
        }
      }

      setDraftSubjectName(extractedSubjectName ?? null);
      const match = extractedSubjectName ? findSubjectByName(subjects, extractedSubjectName) : undefined;
      if (match) patch.subjectId = match.id;

      setDraft((current) => ({ ...current, ...patch }));
      if (patch.evidenceType && step === 1) goTo(2, "forward");

      const placeName = patch.locationName;
      if (placeName && patch.locationLat == null) {
        // Best effort: if nothing matches, the investigator can Find or pick on the map.
        const found = await geocodePlace(placeName).catch(() => null);
        if (found) {
          setDraft((current) =>
            current.locationName === placeName && current.locationLat == null
              ? { ...current, locationLat: found.lat, locationLng: found.lng }
              : current
          );
        }
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function goTo(next: WizardStep, dir: "forward" | "back") {
    setDirection(dir);
    setStep(next);
  }

  function handleSelectSource(type: EvidenceType) {
    setDraft((current) => {
      // Changing the source only re-applies the When default — everything
      // else already typed in stays put.
      const certainty = current.evidenceType === type ? current.certainty : DEFAULT_CERTAINTY_FOR_SOURCE[type];
      return { ...current, evidenceType: type, certainty };
    });
    goTo(2, "forward");
  }

  function patchDraft(patch: Partial<WizardDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function handleAddSubject(name: string, kind: SubjectKind) {
    return onAddSubject({ name, kind });
  }

  /**
   * Attach files, then read each image's metadata on the backend. Time and
   * GPS fill in any When/Location fields that are still empty; they never
   * overwrite what the investigator already entered (use "Apply" for that).
   */
  async function handleAddFiles(files: File[]) {
    if (files.length === 0) return;
    const tooBig = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    setUploadError(tooBig.length > 0 ? `Skipped ${tooBig.length} file(s) over 8MB.` : "");

    const created = await Promise.all(files.filter((f) => f.size <= MAX_ATTACHMENT_BYTES).map(fileToAttachment));
    setDraft((d) => ({ ...d, attachments: [...d.attachments, ...created] }));

    // Step 1: save each file into src/images. Step 2 (images only): once it
    // is saved, read its metadata from the saved file. From here on the
    // attachment points at the saved file instead of carrying the data.
    for (const attachment of created) {
      const isImage = attachment.mimeType.startsWith("image/");
      if (isImage) setMetadataById((prev) => ({ ...prev, [attachment.id]: { state: "saving" } }));
      try {
        const uploaded = await uploadFile({
          fileName: attachment.name,
          fileType: attachment.mimeType,
          dataUrl: attachment.previewUrl,
        });
        setDraft((d) => ({
          ...d,
          attachments: d.attachments.map((a) => (a.id === attachment.id ? { ...a, previewUrl: uploaded.previewUrl } : a)),
        }));
        if (!isImage) continue;

        setMetadataById((prev) => ({ ...prev, [attachment.id]: { state: "loading" } }));
        const metadata = await readUploadedFileMetadata(uploaded.storedFileName, {
          fileName: attachment.name,
          fileType: attachment.mimeType,
        });
        setMetadataById((prev) => ({ ...prev, [attachment.id]: { state: "done", metadata } }));
        setDraft((d) => ({ ...d, ...metadataPatchForEmptyFields(d, metadata) }));
      } catch (error) {
        // The file stays attached as data; the backend saves it to
        // src/images when the evidence is submitted.
        if (!isImage) continue;
        const reason =
          error instanceof TypeError
            ? "can't reach the backend. Is it running? (npm run dev from the repo root)"
            : error instanceof Error
              ? error.message
              : "unknown error";
        setMetadataById((prev) => ({
          ...prev,
          [attachment.id]: { state: "error", message: `Metadata could not be read: ${reason}` },
        }));
      }
    }
  }

  function handleApplyMetadata(attachmentId: string) {
    const status = metadataById[attachmentId];
    if (status?.state !== "done") return;
    patchDraft(metadataToDraftPatch(status.metadata));
  }

  function handleRemoveAttachment(id: string) {
    setDraft((d) => ({ ...d, attachments: d.attachments.filter((a) => a.id !== id) }));
    setMetadataById(({ [id]: _removed, ...rest }) => rest);
  }

  async function handleSubmit() {
    const subjectName = subjects.find((s) => s.id === draft.subjectId)?.name ?? "the subject";
    const built = buildEvidenceInput(draft, subjectName);
    if (!built) return;
    // Keep a hand-written description/source when editing; only the
    // wizard's auto-generated text is regenerated from the new fields.
    const input =
      initial && !/ evidence involving .+ near .+\.$/.test(initial.event)
        ? { ...built, event: initial.event, source: initial.source }
        : built;

    setSubmitting(true);
    setSubmitError("");
    try {
      await onSubmit(input);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't save evidence.");
      return;
    } finally {
      setSubmitting(false);
    }

    if (isEdit) {
      onClose();
      return;
    }
    setSubmittedAttachmentCount(draft.attachments.length);
    setDraft(EMPTY_DRAFT);
    setMetadataById({});
    setSubmitted(true);
  }

  const step2Valid = isStep2Valid(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={handleClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-100">
            {initialCrime ? "Edit crime" : crimeMode ? "Add crime" : isEdit ? "Edit evidence" : "Add event"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-neutral-500 hover:text-neutral-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {crimeMode ? (
          <CrimeForm
            initial={initialCrime}
            locationStats={locationStats}
            onBack={initialCrime ? undefined : () => setCrimeMode(false)}
            onCancel={handleClose}
            onSave={async (input) => {
              await onSubmitCrime(input);
              onClose();
            }}
            onDelete={
              initialCrime && onDeleteCrime
                ? async () => {
                    await onDeleteCrime();
                    onClose();
                  }
                : undefined
            }
          />
        ) : submitted ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <Check size={24} />
            </div>
            <p className="text-sm font-medium text-neutral-100">Added to the timeline</p>
            <p className="text-xs text-neutral-500">
              {submittedAttachmentCount > 0
                ? `${submittedAttachmentCount} attachment${submittedAttachmentCount === 1 ? "" : "s"} included.`
                : "No attachments included."}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleAddAnother}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
              >
                Add another
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-1.5 border-b border-neutral-800 px-5 py-3 text-xs">
              {ALL_STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                      s === step
                        ? "bg-sky-600 text-white"
                        : s < step
                          ? "bg-sky-600/25 text-sky-300"
                          : "bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    {s < step ? <Check size={11} /> : s}
                  </span>
                  <span className={s === step ? "font-medium text-neutral-100" : "text-neutral-500"}>
                    {STEP_LABELS[s]}
                  </span>
                  {i < ALL_STEPS.length - 1 && <span className="px-0.5 text-neutral-600">→</span>}
                </div>
              ))}
            </div>

            <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden px-5 py-4 thin-scrollbar">
              <div className="mb-4 rounded border border-dashed border-neutral-700 p-2">
                <button
                  type="button"
                  onClick={() => setShowDraftBox((value) => !value)}
                  className="w-full text-left text-xs text-neutral-400 hover:text-neutral-200"
                >
                  {showDraftBox ? "▾" : "▸"} Paste statement (AI draft) — fills in the fields for you to review
                </button>

                {showDraftBox && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder='e.g. "I saw Alex near the bank around 9am, he left heading north."'
                      rows={2}
                      className="w-full resize-none rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none"
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
                          Mentioned: <span className="text-neutral-300">{draftSubjectName}</span>
                        </span>
                      )}
                    </div>
                    {extractError && <p className="text-xs text-red-400">{extractError}</p>}
                  </div>
                )}
              </div>

              <div
                key={step}
                style={{
                  transform: slideEntered ? "translateX(0)" : direction === "forward" ? "translateX(32px)" : "translateX(-32px)",
                  opacity: slideEntered ? 1 : 0,
                  transition: "transform 280ms ease-out, opacity 280ms ease-out",
                }}
              >
                {step === 1 && <StepSource onSelect={handleSelectSource} onSelectCrime={() => setCrimeMode(true)} />}
                {step === 2 && (
                  <StepDetails
                    draft={draft}
                    subjects={subjects}
                    locationStats={locationStats}
                    onChangeDraft={patchDraft}
                    onBackToSource={() => goTo(1, "back")}
                    onAddSubject={handleAddSubject}
                    onFillFromPhoto={handleAddFiles}
                    photoStatus={Object.values(metadataById).at(-1)}
                  />
                )}
                {step === 3 && (
                  <StepUploads
                    draft={draft}
                    subjects={subjects}
                    onChangeDraft={patchDraft}
                    onBackToDetails={() => goTo(2, "back")}
                    metadataById={metadataById}
                    uploadError={uploadError}
                    onAddFiles={handleAddFiles}
                    onRemoveAttachment={handleRemoveAttachment}
                    onApplyMetadata={handleApplyMetadata}
                  />
                )}
              </div>
            </div>

            {submitError && (
              <p className="border-t border-neutral-800 px-5 pt-3 text-xs text-red-400">{submitError}</p>
            )}

            <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-3">
              {step > 1 && !(isEdit && step === 2) ? (
                <button
                  type="button"
                  onClick={() => goTo((step - 1) as WizardStep, "back")}
                  className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
                >
                  ← Back
                </button>
              ) : (
                <span />
              )}

              {step === 1 && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
                >
                  Cancel
                </button>
              )}

              {step === 2 && (
                <button
                  type="button"
                  disabled={!step2Valid}
                  onClick={() => goTo(3, "forward")}
                  className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                >
                  Next →
                </button>
              )}

              {step === 3 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                >
                  {submitting ? "Saving…" : isEdit ? "Save changes" : "Add evidence"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
