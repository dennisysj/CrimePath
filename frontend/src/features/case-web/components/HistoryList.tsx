import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import type { HistoryEntry } from "../api";
import type { Subject } from "../types";
import { ROLE_LABELS, type InvolvedParty } from "../types";

const PROPERTY_LABEL: Record<string, string> = {
  description: "Description",
  source: "Source",
  evidence_type: "Type",
  start_datetime: "Time",
  end_datetime: "End time",
  earliestPossibleTime: "Earliest possible",
  latestPossibleTime: "Latest possible",
  timeCertainty: "Time certainty",
  location: "Location",
  latitude: "Latitude",
  longitude: "Longitude",
  investigator_notes: "Notes",
  reliability: "Reliability",
  case_number: "Case number",
  width: "Image width",
  height: "Image height",
  capturedAt: "Photo taken",
  cameraMake: "Camera make",
  cameraModel: "Camera model",
  software: "Software",
  subject: "Subject",
  involvedParties: "Also involved",
  attachment_added: "Attachment added",
  attachment_removed: "Attachment removed",
  subject_added: "Subject added",
  subject_updated: "Subject changed",
  subject_removed: "Subject removed",
  case_created: "Case created",
  case_name: "Case name",
  case_status: "Status",
};

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** ISO timestamps follow this feature's "digits are wall-clock" convention (see timeUtils.ts). */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 19);
  return `${date} ${time}`;
}

function formatValue(property: string, value: unknown, subjects: Subject[]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (property === "involvedParties" && Array.isArray(value)) {
    if (value.length === 0) return "none";
    return (value as InvolvedParty[])
      .map((p) => `${subjects.find((s) => s.id === p.subjectId)?.name ?? p.subjectId} (${ROLE_LABELS[p.role] ?? p.role})`)
      .join(", ");
  }
  if (typeof value === "object") {
    const v = value as { name?: string; kind?: string; role?: string; case_name?: string; case_status?: string };
    if (v.case_name) return v.case_status ? `${v.case_name} (${v.case_status})` : v.case_name;
    if (v.name) return v.kind || v.role ? `${v.name} (${v.kind ?? v.role})` : v.name;
    return JSON.stringify(value);
  }
  if (typeof value === "string" && ISO_DATETIME.test(value)) return formatDateTime(value);
  if (typeof value === "number") return String(Math.round(value * 1e6) / 1e6);
  return String(value);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface HistoryListProps {
  /** Fetches the entries; re-run whenever `reloadKey` changes while expanded. */
  load: () => Promise<HistoryEntry[]>;
  reloadKey: unknown;
  subjects: Subject[];
  title?: string;
  defaultOpen?: boolean;
}

/** Collapsible "who changed what" list backed by the database property-history tables. */
export function HistoryList({ load, reloadKey, subjects, title = "History", defaultOpen = false }: HistoryListProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setEntries(null);
    load()
      .then((result) => !cancelled && setEntries(result))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load history."));
    return () => {
      cancelled = true;
    };
    // `load` is recreated every render; reloadKey is what signals a real change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reloadKey]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <History size={11} />
        {title}
        {entries && ` (${entries.length})`}
      </button>

      {open && (
        <div className="mt-1.5">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!error && !entries && (
            <p className="flex items-center gap-1 text-xs text-neutral-500">
              <Loader2 size={11} className="animate-spin" /> Loading…
            </p>
          )}
          {entries && entries.length === 0 && <p className="text-xs text-neutral-600">No changes recorded yet.</p>}
          {entries && entries.length > 0 && (
            <ol className="space-y-1.5 border-l border-neutral-800 pl-3">
              {entries.map((entry, i) => {
                const label = PROPERTY_LABEL[entry.property] ?? entry.property;
                const isEvent = entry.oldValue === null || entry.newValue === null;
                return (
                  <li key={i} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-neutral-300">{label}</span>
                      <span className="flex-shrink-0 font-mono text-[10px] text-neutral-600">
                        {formatWhen(entry.changedAt)}
                        {entry.changedBy ? ` · ${entry.changedBy}` : ""}
                      </span>
                    </div>
                    {isEvent ? (
                      <p className="break-words text-neutral-400">
                        {formatValue(entry.property, entry.newValue ?? entry.oldValue, subjects)}
                      </p>
                    ) : (
                      <p className="break-words text-neutral-400">
                        <span className="text-neutral-500 line-through">
                          {formatValue(entry.property, entry.oldValue, subjects)}
                        </span>{" "}
                        → {formatValue(entry.property, entry.newValue, subjects)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
