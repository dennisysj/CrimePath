// Replaces the old single-screen Add Evidence form with a 3-step wizard
// (Source -> Details -> Uploads). This is a full rewrite rather than a
// patch, so per review it's not annotated line-by-line against the old
// file — see git history for the previous version.
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { Evidence, EvidenceType, Subject, SubjectKind } from "../types";
import { StepSource } from "./addEvidenceWizard/StepSource";
import { StepDetails } from "./addEvidenceWizard/StepDetails";
import { StepUploads } from "./addEvidenceWizard/StepUploads";
import type { LocationStat } from "./addEvidenceWizard/LocationCombobox";
import {
  DEFAULT_CERTAINTY_FOR_SOURCE,
  EMPTY_DRAFT,
  STEP_LABELS,
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

export function AddEvidenceModal({ open, subjects, evidence, onClose, onSubmit, onAddSubject }: AddEvidenceModalProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [slideEntered, setSlideEntered] = useState(true);
  const [draft, setDraft] = useState<WizardDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAttachmentCount, setSubmittedAttachmentCount] = useState(0);

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
    evidence.forEach((e) => {
      const key = e.location.name.toLowerCase();
      const existing = byName.get(key);
      if (existing) existing.count += 1;
      else byName.set(key, { name: e.location.name, lat: e.location.lat, lng: e.location.lng, count: 1 });
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
    draft.attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setStep(1);
    setDirection("forward");
    setSlideEntered(true);
    setDraft(EMPTY_DRAFT);
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

  function goTo(next: WizardStep, dir: "forward" | "back") {
    setDirection(dir);
    setStep(next);
  }

  function handleSelectSource(type: EvidenceType) {
    setDraft((d) => {
      // Changing the source only re-applies the When default — everything
      // else already typed in stays put.
      const certainty = d.evidenceType === type ? d.certainty : DEFAULT_CERTAINTY_FOR_SOURCE[type];
      return { ...d, evidenceType: type, certainty };
    });
    goTo(2, "forward");
  }

  function patchDraft(patch: Partial<WizardDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function handleAddSubject(name: string, kind: SubjectKind) {
    return onAddSubject({ name, kind });
  }

  async function handleSubmit() {
    const subjectName = subjects.find((s) => s.id === draft.subjectId)?.name ?? "the subject";
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
