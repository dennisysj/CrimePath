// Replaces the old single-screen Add Evidence form with a 3-step wizard
// (Source -> Details -> Uploads). Gemini extraction fills that draft so the
// investigator can still review every field before submitting.
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { Evidence, EvidenceType, Subject, SubjectKind } from "../types";
import { extractEvidenceDraft } from "../extractApi";
import { StepSource } from "./addEvidenceWizard/StepSource";
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

interface AddEvidenceModalProps {
  open: boolean;
  subjects: Subject[];
  evidence: Evidence[];
  onClose: () => void;
  onSubmit: (input: Omit<Evidence, "id">) => void | Promise<void>;
  onAddSubject: (input: Omit<Subject, "id">) => Promise<Subject>;
}

const ALL_STEPS: WizardStep[] = [1, 2, 3];
const WIZARD_EVIDENCE_TYPES = new Set<string>(SOURCE_OPTIONS.map((option) => option.type));

function asWizardType(value: string | undefined): EvidenceType | null {
  if (value && WIZARD_EVIDENCE_TYPES.has(value)) return value as EvidenceType;
  return null;
}

function isoToDateAndClock(iso: string): { date: string; clock: ClockValue } | null {
  const parsed = new Date(iso);
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

export function AddEvidenceModal({ open, subjects, evidence, onClose, onSubmit, onAddSubject }: AddEvidenceModalProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [slideEntered, setSlideEntered] = useState(true);
  const [draft, setDraft] = useState<WizardDraft>(EMPTY_DRAFT);
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
      else byName.set(key, { name: item.location.name, lat: item.location.lat, lng: item.location.lng, count: 1 });
    });
    return Array.from(byName.values()).sort((a, b) => b.count - a.count);
  }, [evidence]);

  if (!open) return null;

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

      if (extractedLocationName) patch.locationName = extractedLocationName;

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
          const marginMs = new Date(extracted.latestPossibleTime).getTime() - new Date(extracted.eventTime).getTime();
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
      const match = extractedSubjectName
        ? subjects.find((subject) => subject.name.toLowerCase() === extractedSubjectName.toLowerCase())
        : undefined;
      if (match) patch.subjectId = match.id;

      setDraft((current) => ({ ...current, ...patch }));
      if (patch.evidenceType && step === 1) goTo(2, "forward");
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

  async function handleSubmit() {
    const subjectName = subjects.find((subject) => subject.id === draft.subjectId)?.name ?? "the subject";
    const input = buildEvidenceInput(draft, subjectName);
    if (!input) return;

    setSubmitting(true);
    await onSubmit(input);
    setSubmitting(false);

    // The attachments just got handed off to `input` (now living in the
    // store as part of the real Evidence) — clear the draft's copy without
    // revoking their object URLs, so `reset()` later doesn't break them.
    setSubmittedAttachmentCount(draft.attachments.length);
    setDraft(EMPTY_DRAFT);
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
          <h2 className="text-sm font-semibold text-neutral-100">Add evidence</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-neutral-500 hover:text-neutral-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {submitted ? (
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
                {step === 1 && <StepSource onSelect={handleSelectSource} />}
                {step === 2 && (
                  <StepDetails
                    draft={draft}
                    subjects={subjects}
                    locationStats={locationStats}
                    onChangeDraft={patchDraft}
                    onBackToSource={() => goTo(1, "back")}
                    onAddSubject={handleAddSubject}
                  />
                )}
                {step === 3 && (
                  <StepUploads
                    draft={draft}
                    subjects={subjects}
                    onChangeDraft={patchDraft}
                    onBackToDetails={() => goTo(2, "back")}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-3">
              {step > 1 ? (
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
                  {submitting ? "Adding…" : "Add evidence"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
