import { useState } from "react";
import { Siren, Trash2, X } from "lucide-react";
import type { Crime } from "../../types";
import { geocodePlace, type CrimeInput } from "../../api";
import { extractCrimeDraft } from "../../extractApi";
import { LocationCombobox, type LocationStat } from "./LocationCombobox";
import { LocationCoordinates } from "./LocationCoordinates";
import { ClockFields } from "./StepDetails";
import { TimeWheelPicker } from "./TimeWheelPicker";
import { EMPTY_CLOCK, type ClockValue } from "./wizardTypes";
import { clockToDate, isClockComplete } from "./wizardTime";

interface CrimeFormProps {
  initial?: Crime;
  locationStats: LocationStat[];
  /** Back to the event-type picker (new crimes only). */
  onBack?: () => void;
  onCancel: () => void;
  onSave: (input: CrimeInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const inputClass =
  "w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none";

/** Wall-clock ISO (digits read as UTC, see timeUtils.ts) -> the wizard's date + 12-hour clock. */
function isoToDateAndClock(iso: string | null | undefined): { date: string; clock: ClockValue } {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: "", clock: { ...EMPTY_CLOCK } };
  const h24 = d.getUTCHours();
  return {
    date: d.toISOString().slice(0, 10),
    clock: {
      hour: String(h24 % 12 === 0 ? 12 : h24 % 12),
      minute: String(d.getUTCMinutes()).padStart(2, "0"),
      second: String(d.getUTCSeconds()).padStart(2, "0"),
      period: h24 >= 12 ? "PM" : "AM",
    },
  };
}

function clockIsEmpty(clock: ClockValue): boolean {
  return !clock.hour && !clock.minute;
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * The crime itself: what happened, when (start, optional end) and where.
 * Uses the same date + clock + wheel inputs as evidence entry. Saved as its
 * own event type and drawn on the timeline as a band across every lane, so
 * it's clear which evidence falls inside the crime window.
 */
export function CrimeForm({ initial, locationStats, onBack, onCancel, onSave, onDelete }: CrimeFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(() => isoToDateAndClock(initial?.start).date);
  const [startClock, setStartClock] = useState(() => isoToDateAndClock(initial?.start).clock);
  const [endClock, setEndClock] = useState(() => isoToDateAndClock(initial?.end).clock);
  /** Which clock the wheel below is editing. */
  const [wheelTarget, setWheelTarget] = useState<"start" | "end">("start");
  const [locationName, setLocationName] = useState(initial?.location.name ?? "");
  const [lat, setLat] = useState<number | null>(initial?.location.lat ?? null);
  const [lng, setLng] = useState<number | null>(initial?.location.lng ?? null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startDate = clockToDate(date, startClock);
  const hasEnd = !clockIsEmpty(endClock);
  const endComplete = isClockComplete(endClock, false);
  let endDate = hasEnd ? clockToDate(date, endClock) : null;
  // An end earlier in the day than the start means the crime ran past midnight.
  const crossesMidnight = Boolean(startDate && endDate && endDate < startDate);
  if (crossesMidnight && endDate) endDate = new Date(endDate.getTime() + DAY_MS);
  const valid = Boolean(title.trim() && startDate && locationName.trim() && (!hasEnd || endComplete));

  async function handleExtract() {
    if (!draftText.trim()) return;
    setExtracting(true);
    setExtractError("");
    try {
      const extracted = await extractCrimeDraft(draftText);
      const start = isoToDateAndClock(extracted.start);
      setTitle(extracted.title);
      setDescription(extracted.description);
      setDate(start.date);
      setStartClock(start.clock);
      // One date field: an end on the next day comes back as an earlier clock, read as crossing midnight.
      setEndClock(extracted.end ? isoToDateAndClock(extracted.end).clock : { ...EMPTY_CLOCK });

      const known = locationStats.find((l) => l.name.toLowerCase() === extracted.locationName.toLowerCase());
      setLocationName(known?.name ?? extracted.locationName);
      setLat(known?.lat ?? null);
      setLng(known?.lng ?? null);
      if (known?.lat == null && extracted.locationName) {
        const found = await geocodePlace(extracted.locationName).catch(() => null);
        if (found) {
          setLat(found.lat);
          setLng(found.lng);
        }
      }
      setDraftOpen(false);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!valid || !startDate) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        start: startDate.toISOString(),
        end: endDate ? endDate.toISOString() : null,
        location:
          lat != null && lng != null ? { name: locationName.trim(), lat, lng } : { name: locationName.trim() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the crime.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !window.confirm("Remove this crime from the timeline? This can't be undone.")) return;
    setSaving(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the crime.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4 text-sm thin-scrollbar">
        <div
          className="flex items-center justify-between rounded-md border px-3 py-1.5"
          style={{ borderColor: "var(--crime)", background: "color-mix(in srgb, var(--crime) 10%, transparent)" }}
        >
          <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--crime)" }}>
            <Siren size={14} />
            Crime
          </span>
          {onBack && (
            <button type="button" onClick={onBack} className="text-xs underline hover:brightness-110" style={{ color: "var(--crime)" }}>
              change
            </button>
          )}
        </div>

        <div className="rounded border border-dashed border-neutral-700 p-2">
          <button
            type="button"
            onClick={() => setDraftOpen((open) => !open)}
            className="w-full text-left text-xs text-neutral-400 hover:text-neutral-200"
          >
            {draftOpen ? "▾" : "▸"} Paste report (AI draft) — fills in the crime for you to review
          </button>
          {draftOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="e.g. Jewellery store at Metrotown robbed between 9:40 and 10:05 am on Oct 3, display cases smashed."
                rows={3}
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
                {extractError && <span className="text-xs text-red-400">{extractError}</span>}
              </div>
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>What happened</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Armed robbery at jewellery store"
            className={inputClass}
            autoFocus
          />
        </label>

        <div>
          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>When</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} mb-2 font-mono`} />

          <div className="space-y-1.5">
            <ClockRow
              label="Start"
              active={wheelTarget === "start"}
              onActivate={() => setWheelTarget("start")}
              value={startClock}
              onChange={setStartClock}
            />
            <ClockRow
              label="End"
              active={wheelTarget === "end"}
              onActivate={() => setWheelTarget("end")}
              value={endClock}
              onChange={setEndClock}
              onClear={hasEnd ? () => setEndClock({ ...EMPTY_CLOCK }) : undefined}
            />

            <TimeWheelPicker
              key={wheelTarget}
              value={wheelTarget === "start" ? startClock : endClock}
              onChange={wheelTarget === "start" ? setStartClock : setEndClock}
              withSeconds
            />

            {hasEnd && !endComplete ? (
              <p className="text-[11px] text-red-400">Finish the end time, or clear it for a single moment.</p>
            ) : crossesMidnight ? (
              <p className="text-[11px]" style={{ color: "var(--crime)" }}>
                The end is earlier than the start, so it's read as the next day.
              </p>
            ) : (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                The wheel edits the highlighted time. Leave the end empty for a single moment.
              </p>
            )}
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Location</span>
          <LocationCombobox
            value={locationName}
            locationStats={locationStats}
            onChange={(name, la, ln) => {
              setLocationName(name);
              setLat(la);
              setLng(ln);
            }}
          />
          <LocationCoordinates
            locationName={locationName}
            lat={lat}
            lng={lng}
            onChange={(la, ln) => {
              setLat(la);
              setLng(ln);
            }}
          />
        </div>

        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>Details (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What was taken, how entry was made, who reported it…"
            className={`${inputClass} resize-none`}
          />
        </label>
      </div>

      {error && <p className="border-t border-neutral-800 px-5 pt-3 text-xs text-red-400">{error}</p>}

      <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-3">
        {onDelete ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            <Trash2 size={13} /> Remove
          </button>
        ) : onBack ? (
          <button type="button" onClick={onBack} className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">
            ← Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || saving}
            onClick={handleSave}
            className="rounded px-3 py-1.5 text-sm font-semibold hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--crime)", color: "#1a1400" }}
          >
            {saving ? "Saving…" : initial ? "Save crime" : "Add crime"}
          </button>
        </div>
      </div>
    </>
  );
}

interface ClockRowProps {
  label: string;
  active: boolean;
  onActivate: () => void;
  value: ClockValue;
  onChange: (next: ClockValue) => void;
  onClear?: () => void;
}

/** "Start"/"End" label + the evidence form's h:mm:ss AM/PM fields; focusing it points the wheel at this time. */
function ClockRow({ label, active, onActivate, value, onChange, onClear }: ClockRowProps) {
  return (
    <div
      className="flex items-center gap-2 rounded px-1 py-0.5"
      style={active ? { background: "color-mix(in srgb, var(--crime) 8%, transparent)" } : undefined}
      onFocus={onActivate}
      onClick={onActivate}
    >
      <span className="w-10 flex-shrink-0 text-xs" style={{ color: active ? "var(--crime)" : "var(--text-muted)" }}>
        {label}
      </span>
      <ClockFields value={value} onChange={onChange} withSeconds />
      {onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label={`Clear ${label.toLowerCase()} time`}
          title="Clear (single moment)"
          className="rounded p-1 hover:bg-[var(--surface-2)]"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
