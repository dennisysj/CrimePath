import { useState } from "react";
import { X } from "lucide-react"; // ADDED: remove-row icon for the "Also involved" section
import type { InvolvedRole, Subject, SubjectKind, TimeCertainty } from "../../types";
import { ROLE_LABELS } from "../../types"; // ADDED: role dropdown labels for involved parties
import { SOURCE_OPTIONS, type ClockPeriod, type ClockValue, type WizardDraft } from "./wizardTypes";
import { approximateWindowPreview } from "./wizardTime";
import { LocationCombobox, type LocationStat } from "./LocationCombobox";
import { TimeWheelPicker } from "./TimeWheelPicker";

interface StepDetailsProps {
  draft: WizardDraft;
  subjects: Subject[];
  locationStats: LocationStat[];
  onChangeDraft: (patch: Partial<WizardDraft>) => void;
  onBackToSource: () => void;
  onAddSubject: (name: string, kind: SubjectKind) => Promise<Subject>;
}

const inputClass =
  "w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none";

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
}: StepDetailsProps) {
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
    const created = await onAddSubject(name, newSubjectKind);
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
    const created = await onAddSubject(name, involvedNewSubjectKind);
    updateInvolvedRow(involvedNewSubjectRow, { subjectId: created.id });
    setInvolvedNewSubjectRow(null);
    setInvolvedNewSubjectName("");
    setInvolvedNewSubjectKind("person");
  }

  return (
    <div className="space-y-3 text-sm">
      {sourceOption && SourceIcon && (
        <div className="flex items-center justify-between rounded-md border border-sky-800/50 bg-sky-500/10 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-sky-300">
            <SourceIcon size={14} />
            {sourceOption.label}
          </span>
          <button
            type="button"
            onClick={onBackToSource}
            className="text-xs text-sky-400 underline hover:text-sky-300"
          >
            change
          </button>
        </div>
      )}

      <div>
        <span className="mb-1 block text-xs text-neutral-400">Subject</span>
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
              className="flex-shrink-0 whitespace-nowrap rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
            >
              + New subject
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-950 p-2">
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
              className="flex-shrink-0 rounded bg-sky-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setNewSubjectOpen(false)}
              className="flex-shrink-0 text-xs text-neutral-500 hover:text-neutral-300"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ADDED: "Also involved" — optional, never blocks Next */}
      <div>
        <span className="mb-1 block text-xs text-neutral-400">Also involved (optional)</span>
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
                      className="flex-shrink-0 rounded bg-sky-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="flex-shrink-0 rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
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
          className="mt-2 rounded border border-dashed border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
        >
          + Add involved party
        </button>
      </div>

      <div>
        <span className="mb-1 block text-xs text-neutral-400">When</span>
        <div className="mb-2 flex gap-1 rounded border border-neutral-700 bg-neutral-950 p-0.5 text-xs">
          {CERTAINTIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChangeDraft({ certainty: c })}
              className={`flex-1 rounded px-2 py-1 capitalize transition-colors ${
                draft.certainty === c ? "bg-sky-600 text-white" : "text-neutral-400 hover:text-neutral-200"
              }`}
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
              <div className="flex items-center gap-1 whitespace-nowrap text-xs text-neutral-400">
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
            {preview && <p className="font-mono text-[11px] text-neutral-500">→ {preview}</p>}
          </div>
        )}

        {draft.certainty === "range" && (
          <div className="flex flex-wrap items-center gap-2">
            <ClockFields
              value={draft.rangeStart}
              onChange={(v) => onChangeDraft({ rangeStart: v })}
              withSeconds={false}
            />
            <span className="text-neutral-500">to</span>
            <ClockFields value={draft.rangeEnd} onChange={(v) => onChangeDraft({ rangeEnd: v })} withSeconds={false} />
          </div>
        )}
      </div>

      <div>
        <span className="mb-1 block text-xs text-neutral-400">Location</span>
        <LocationCombobox
          value={draft.locationName}
          locationStats={locationStats}
          onChange={(name, lat, lng) => onChangeDraft({ locationName: name, locationLat: lat, locationLng: lng })}
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
function ClockFields({ value, onChange, withSeconds }: ClockFieldsProps) {
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
      <span className="text-neutral-500">:</span>
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
          <span className="text-neutral-500">:</span>
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
      <div className="ml-1 flex gap-0.5 rounded border border-neutral-700 bg-neutral-950 p-0.5 text-xs">
        {(["AM", "PM"] as ClockPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ ...value, period: p })}
            className={`rounded px-1.5 py-0.5 ${
              value.period === p ? "bg-sky-600 text-white" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
