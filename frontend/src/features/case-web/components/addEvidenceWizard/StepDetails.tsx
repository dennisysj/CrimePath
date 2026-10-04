import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react"; // ADDED: remove-row icon for the "Also involved" section
import type { InvolvedRole, Subject, SubjectKind, TimeCertainty } from "../../types";
import { ROLE_LABELS } from "../../types"; // ADDED: role dropdown labels for involved parties
import { SOURCE_OPTIONS, type ClockPeriod, type ClockValue, type WizardDraft } from "./wizardTypes";
import { approximateWindowPreview } from "./wizardTime";
import { LocationCombobox, type LocationStat } from "./LocationCombobox";
import { LocationCoordinates } from "./LocationCoordinates";
import { TimeWheelPicker } from "./TimeWheelPicker";
import type { AttachmentMetadataStatus } from "./StepUploads";
import { metadataSummary } from "./photoMetadata";

interface StepDetailsProps {
  draft: WizardDraft;
  subjects: Subject[];
  locationStats: LocationStat[];
  onChangeDraft: (patch: Partial<WizardDraft>) => void;
  onBackToSource: () => void;
  onAddSubject: (name: string, kind: SubjectKind) => Promise<Subject>;
  /** Attach a photo and fill empty When/Location fields from its metadata. */
  onFillFromPhoto: (files: File[]) => void;
  /** Metadata status of the most recently attached photo. */
  photoStatus: AttachmentMetadataStatus | undefined;
}

const inputClass =
  "w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none";

const CERTAINTIES: TimeCertainty[] = ["exact", "approximate", "range"];
const SUBJECT_KINDS: SubjectKind[] = ["person", "vehicle", "phone", "other"];
const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [InvolvedRole, string][]; // ADDED: for the involved-party role dropdown

export function StepDetails({
  draft,
  subjects,
  locationStats,
  onChangeDraft,
  onBackToSource,
  onAddSubject,
  onFillFromPhoto,
  photoStatus,
}: StepDetailsProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectKind, setNewSubjectKind] = useState<SubjectKind>("person");
  const [savingSubject, setSavingSubject] = useState(false);

  // ADDED: local state for the "+ New subject" option inside an involved-party row
  const [involvedNewSubjectRow, setInvolvedNewSubjectRow] = useState<number | null>(null);
  const [involvedNewSubjectName, setInvolvedNewSubjectName] = useState("");
  const [involvedNewSubjectKind, setInvolvedNewSubjectKind] = useState<SubjectKind>("person");

  const sourceOption = SOURCE_OPTIONS.find((o) => o.type === draft.evidenceType);
  const SourceIcon = sourceOption?.icon;
  const preview = draft.certainty === "approximate" ? approximateWindowPreview(draft) : null;

  async function handleSaveNewSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    setSavingSubject(true);
    let created: Subject;
    try {
      created = await onAddSubject(name, newSubjectKind);
    } catch {
      setSavingSubject(false);
      return; // the store already shows the error banner
    }
    onChangeDraft({ subjectId: created.id });
    setSavingSubject(false);
    setNewSubjectOpen(false);
    setNewSubjectName("");
    setNewSubjectKind("person");
  }

  // ADDED: involved-party row helpers — add/update/remove, plus the inline "+ New subject" save for a row
  function addInvolvedRow() {
    const used = new Set(draft.involvedParties.map((p) => p.subjectId));
    const firstAvailable = subjects.find((s) => s.id !== draft.subjectId && !used.has(s.id));
    onChangeDraft({
      involvedParties: [...draft.involvedParties, { subjectId: firstAvailable?.id ?? "", role: "with" }],
    });
  }

  function updateInvolvedRow(index: number, patch: Partial<{ subjectId: string; role: InvolvedRole }>) {
    onChangeDraft({
      involvedParties: draft.involvedParties.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  }

  function removeInvolvedRow(index: number) {
    onChangeDraft({ involvedParties: draft.involvedParties.filter((_, i) => i !== index) });
  }

  async function handleSaveInvolvedNewSubject() {
    const name = involvedNewSubjectName.trim();
    if (!name || involvedNewSubjectRow === null) return;
    let created: Subject;
    try {
      created = await onAddSubject(name, involvedNewSubjectKind);
    } catch {
      return; // the store already shows the error banner
    }
    updateInvolvedRow(involvedNewSubjectRow, { subjectId: created.id });
    setInvolvedNewSubjectRow(null);
    setInvolvedNewSubjectName("");
    setInvolvedNewSubjectKind("person");
  }

  return (
    <div className="space-y-3 text-sm">
      {sourceOption && SourceIcon && (
        // UPDATED line 92: rgba was (47,91,234) — matches new --accent #3D6AF2
        <div className="flex items-center justify-between rounded-md border px-3 py-1.5" style={{ borderColor: "var(--border)", background: "rgba(61,106,242,0.08)" }}>
          <span className="flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
            <SourceIcon size={14} />
            {sourceOption.label}
          </span>
          <button
            type="button"
            onClick={onBackToSource}
            className="text-xs underline hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
            style={{ color: "var(--accent)" }}
          >
            change
          </button>
        </div>
      )}

      <div className="rounded-md border border-dashed border-neutral-700 px-3 py-2">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onFillFromPhoto(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300"
        >
          <Camera size={13} />
          Fill time &amp; location from a photo
        </button>
        {(photoStatus?.state === "saving" || photoStatus?.state === "loading") && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-500">
            <Loader2 size={10} className="animate-spin" />{" "}
            {photoStatus.state === "saving" ? "Saving photo to src/images…" : "Reading photo metadata…"}
          </p>
        )}
        {photoStatus?.state === "done" && (
          <p className="mt-1 truncate font-mono text-[11px] text-emerald-400/80">{metadataSummary(photoStatus.metadata)}</p>
        )}
        {photoStatus?.state === "error" && <p className="mt-1 text-[11px] text-red-400">{photoStatus.message}</p>}
        {!photoStatus && (
          <p className="mt-0.5 text-[11px] text-neutral-600">The photo is also attached to this evidence.</p>
        )}
      </div>

      <div>
        <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Subject</span>
        {!newSubjectOpen ? (
          <div className="flex gap-2">
            <select
              value={draft.subjectId}
              onChange={(e) => onChangeDraft({ subjectId: e.target.value })}
              className={inputClass}
            >
              <option value="" disabled>
                Select a subject…
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setNewSubjectOpen(true)}
              className="flex-shrink-0 whitespace-nowrap rounded border px-2 py-1.5 text-xs hover:brightness-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              + New subject
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded border p-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <input
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Name"
              className={`${inputClass} flex-1`}
            />
            <select
              value={newSubjectKind}
              onChange={(e) => setNewSubjectKind(e.target.value as SubjectKind)}
              className={`${inputClass} w-28 capitalize`}
            >
              {SUBJECT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSaveNewSubject}
              disabled={!newSubjectName.trim() || savingSubject}
              className="flex-shrink-0 rounded px-2 py-1.5 text-xs font-medium hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setNewSubjectOpen(false)}
              className="flex-shrink-0 text-xs hover:brightness-75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ADDED: "Also involved" — optional, never blocks Next */}
      <div>
        <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Also involved (optional)</span>
        <div className="space-y-2">
          {draft.involvedParties.map((party, index) => {
            const used = new Set(draft.involvedParties.filter((_, i) => i !== index).map((p) => p.subjectId));
            const availableSubjects = subjects.filter((s) => s.id !== draft.subjectId && !used.has(s.id));
            const isAddingSubjectHere = involvedNewSubjectRow === index;

            return (
              <div key={index} className="flex items-center gap-1.5">
                {!isAddingSubjectHere ? (
                  <select
                    value={party.subjectId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") setInvolvedNewSubjectRow(index);
                      else updateInvolvedRow(index, { subjectId: e.target.value });
                    }}
                    className={`${inputClass} flex-1`}
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    {availableSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="__new__">+ New subject</option>
                  </select>
                ) : (
                  <div className="flex flex-1 items-center gap-1.5">
                    <input
                      value={involvedNewSubjectName}
                      onChange={(e) => setInvolvedNewSubjectName(e.target.value)}
                      placeholder="Name"
                      className={`${inputClass} flex-1`}
                    />
                    <select
                      value={involvedNewSubjectKind}
                      onChange={(e) => setInvolvedNewSubjectKind(e.target.value as SubjectKind)}
                      className={`${inputClass} w-20 capitalize`}
                    >
                      {SUBJECT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleSaveInvolvedNewSubject}
                      disabled={!involvedNewSubjectName.trim()}
                      className="flex-shrink-0 rounded px-2 py-1.5 text-xs font-medium hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
                      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                    >
                      Save
                    </button>
                  </div>
                )}

                <select
                  value={party.role}
                  onChange={(e) => updateInvolvedRow(index, { role: e.target.value as InvolvedRole })}
                  className={`${inputClass} w-32 flex-shrink-0`}
                >
                  {ROLE_OPTIONS.map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => removeInvolvedRow(index)}
                  aria-label="Remove involved party"
                  className="flex-shrink-0 rounded p-1.5 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--conflict-ring)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addInvolvedRow}
          className="mt-2 rounded border border-dashed px-2 py-1 text-xs hover:brightness-75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
          style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
        >
          + Add involved party
        </button>
      </div>

      <div>
        <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>When</span>
        <div className="mb-2 flex gap-1 rounded border p-0.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          {CERTAINTIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChangeDraft({ certainty: c })}
              className="flex-1 rounded px-2 py-1 capitalize transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={draft.certainty === c ? { background: "var(--accent)", color: "var(--accent-text)" } : { color: "var(--text-muted)" }}
            >
              {c}
            </button>
          ))}
        </div>

        <input
          type="date"
          value={draft.date}
          onChange={(e) => onChangeDraft({ date: e.target.value })}
          className={`${inputClass} mb-2 font-mono`}
        />

        {draft.certainty === "exact" && (
          <div className="space-y-2">
            <ClockFields value={draft.exactTime} onChange={(v) => onChangeDraft({ exactTime: v })} withSeconds />
            <TimeWheelPicker value={draft.exactTime} onChange={(v) => onChangeDraft({ exactTime: v })} withSeconds />
          </div>
        )}

        {draft.certainty === "approximate" && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <ClockFields
                value={draft.approxTime}
                onChange={(v) => onChangeDraft({ approxTime: v })}
                withSeconds={false}
              />
              <div className="flex items-center gap-1 whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
                <span>±</span>
                <input
                  type="number"
                  min={1}
                  value={draft.approxMarginMinutes}
                  onChange={(e) => onChangeDraft({ approxMarginMinutes: e.target.value })}
                  className={`${inputClass} w-14 font-mono`}
                />
                <span>min</span>
              </div>
            </div>
            <TimeWheelPicker
              value={draft.approxTime}
              onChange={(v) => onChangeDraft({ approxTime: v })}
              withSeconds={false}
            />
            {preview && <p className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>→ {preview}</p>}
          </div>
        )}

        {draft.certainty === "range" && (
          <div className="flex flex-wrap items-center gap-2">
            <ClockFields
              value={draft.rangeStart}
              onChange={(v) => onChangeDraft({ rangeStart: v })}
              withSeconds={false}
            />
            <span style={{ color: "var(--text-muted)" }}>to</span>
            <ClockFields value={draft.rangeEnd} onChange={(v) => onChangeDraft({ rangeEnd: v })} withSeconds={false} />
          </div>
        )}
      </div>

      <div>
        <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Location</span>
        <LocationCombobox
          value={draft.locationName}
          locationStats={locationStats}
          onChange={(name, lat, lng) => onChangeDraft({ locationName: name, locationLat: lat, locationLng: lng })}
        />
        <LocationCoordinates
          locationName={draft.locationName}
          lat={draft.locationLat}
          lng={draft.locationLng}
          onChange={(lat, lng) => onChangeDraft({ locationLat: lat, locationLng: lng })}
        />
      </div>
    </div>
  );
}

interface ClockFieldsProps {
  value: ClockValue;
  onChange: (next: ClockValue) => void;
  withSeconds: boolean;
}

/** h:mm[:ss] typed inputs + an AM/PM toggle. Shared by exact/approximate/range. */
export function ClockFields({ value, onChange, withSeconds }: ClockFieldsProps) {
  function clampNumeric(raw: string, max: number): string {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (digits === "") return "";
    return String(Math.min(Number(digits), max));
  }

  function padOnBlur(key: "minute" | "second") {
    const raw = value[key];
    if (raw !== "") onChange({ ...value, [key]: raw.padStart(2, "0") });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={value.hour}
        onChange={(e) => onChange({ ...value, hour: clampNumeric(e.target.value, 12) })}
        placeholder="h"
        inputMode="numeric"
        className={`${inputClass} w-11 text-center font-mono`}
      />
      <span style={{ color: "var(--text-muted)" }}>:</span>
      <input
        value={value.minute}
        onChange={(e) => onChange({ ...value, minute: clampNumeric(e.target.value, 59) })}
        onBlur={() => padOnBlur("minute")}
        placeholder="mm"
        inputMode="numeric"
        className={`${inputClass} w-11 text-center font-mono`}
      />
      {withSeconds && (
        <>
          <span style={{ color: "var(--text-muted)" }}>:</span>
          <input
            value={value.second}
            onChange={(e) => onChange({ ...value, second: clampNumeric(e.target.value, 59) })}
            onBlur={() => padOnBlur("second")}
            placeholder="ss"
            inputMode="numeric"
            className={`${inputClass} w-11 text-center font-mono`}
          />
        </>
      )}
      <div className="ml-1 flex gap-0.5 rounded border p-0.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        {(["AM", "PM"] as ClockPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ ...value, period: p })}
            className="rounded px-1.5 py-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
            style={value.period === p ? { background: "var(--accent)", color: "var(--accent-text)" } : { color: "var(--text-muted)" }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
