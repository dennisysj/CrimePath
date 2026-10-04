import { useMemo, useState } from "react";
import { AlertTriangle, FileText, MapPin, Swords, Users, X } from "lucide-react";
import type { CaseAnalysis, Evidence, EvidenceType, Subject } from "../types";
import { matchesSubjectFilter } from "../store";
import { formatDateTime } from "../timeUtils";
import { EVIDENCE_TYPE_LABEL, hasLocation } from "../locationUtils";
import { STATUS_COLORS } from "./statusColors";
import { EvidenceInsightsPanel } from "./EvidenceInsightsPanel";

interface EvidenceDashboardProps {
  open: boolean;
  caseId: string;
  caseName: string;
  subjects: Subject[];
  evidence: Evidence[];
  analysis: CaseAnalysis;
  /** Shared with the main timeline view (store.subjectFilter) - filtering here carries over when you close this. */
  subjectFilter: string[];
  onToggleSubject: (id: string) => void;
  onClearSubjectFilter: () => void;
  onClose: () => void;
  onSelectEvidence: (id: string) => void;
}

const ALL_EVIDENCE_TYPES = Object.keys(EVIDENCE_TYPE_LABEL) as EvidenceType[];

function isUnverified(e: Evidence): boolean {
  return e.reliability !== "verified" && e.reliability !== "corroborated";
}

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  tone?: "default" | "warning" | "conflict" | "success";
}

const TONE_CLASSES: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "bg-sky-500/10 text-sky-300",
  warning: "bg-amber-500/10 text-amber-300",
  conflict: "bg-red-500/10 text-red-300",
  success: "bg-emerald-500/10 text-emerald-300",
};

function StatTile({ icon, label, value, sublabel, tone = "default" }: StatTileProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900/70 px-4 py-3">
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded ${TONE_CLASSES[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold leading-none text-neutral-100">{value}</span>
          {sublabel && <span className="text-xs text-neutral-500">{sublabel}</span>}
        </div>
        <p className="truncate text-xs text-neutral-400">{label}</p>
      </div>
    </div>
  );
}

export function EvidenceDashboard({
  open,
  caseId,
  caseName,
  subjects,
  evidence,
  analysis,
  subjectFilter,
  onToggleSubject,
  onClearSubjectFilter,
  onClose,
  onSelectEvidence,
}: EvidenceDashboardProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EvidenceType[]>([]);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const typeCounts = useMemo(() => {
    const counts = new Map<EvidenceType, number>();
    for (const e of evidence) counts.set(e.evidenceType, (counts.get(e.evidenceType) ?? 0) + 1);
    return counts;
  }, [evidence]);

  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of evidence) counts.set(e.subjectId, (counts.get(e.subjectId) ?? 0) + 1);
    return counts;
  }, [evidence]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const startMs = dateStart ? new Date(dateStart).getTime() : null;
    // End-of-day, so a same-day filter includes evidence from anywhere in that day.
    const endMs = dateEnd ? new Date(dateEnd).getTime() + 24 * 60 * 60 * 1000 - 1 : null;

    const matches = evidence.filter((item) => {
      if (subjectFilter.length > 0 && !matchesSubjectFilter(item, subjectFilter)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(item.evidenceType)) return false;
      const eventMs = new Date(item.eventTime).getTime();
      if (startMs !== null && eventMs < startMs) return false;
      if (endMs !== null && eventMs > endMs) return false;
      if (normalized) {
        const subject = subjectById.get(item.subjectId);
        const hit = [item.event, item.source, item.location.name, item.notes, item.evidenceType, subject?.name]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalized));
        if (!hit) return false;
      }
      return true;
    });

    return matches.sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
  }, [evidence, query, typeFilter, dateStart, dateEnd, subjectFilter, subjectById]);

  const stats = useMemo(() => {
    const filteredIds = new Set(filtered.map((e) => e.id));
    const evidenceById = new Map(evidence.map((e) => [e.id, e]));

    const peopleMentioned = new Set<string>();
    for (const e of filtered) {
      peopleMentioned.add(e.subjectId);
      for (const p of e.involvedParties ?? []) peopleMentioned.add(p.subjectId);
    }

    const unverifiedWitness = filtered.filter((e) => e.evidenceType === "witness" && isUnverified(e)).length;

    // Only genuine (not resolved-by-uncertainty) conflicts where both sides
    // of the conflict are in the currently filtered set.
    const conflictCountBySubject = new Map<string, number>();
    for (const c of analysis.conflicts) {
      if (c.resolvedByUncertainty) continue;
      const [aId, bId] = c.evidenceIds;
      if (!filteredIds.has(aId) || !filteredIds.has(bId)) continue;
      const subjectId = evidenceById.get(aId)?.subjectId;
      if (!subjectId) continue;
      conflictCountBySubject.set(subjectId, (conflictCountBySubject.get(subjectId) ?? 0) + 1);
    }
    let mostConflicting: { subject: Subject; count: number } | null = null;
    for (const [subjectId, count] of conflictCountBySubject) {
      const subject = subjectById.get(subjectId);
      if (subject && (!mostConflicting || count > mostConflicting.count)) {
        mostConflicting = { subject, count };
      }
    }

    const withLocation = filtered.filter(hasLocation).length;

    return { peopleMentioned: peopleMentioned.size, unverifiedWitness, mostConflicting, withLocation };
  }, [filtered, evidence, analysis.conflicts, subjectById]);

  if (!open) return null;

  const hasActiveFacets = typeFilter.length > 0 || subjectFilter.length > 0 || dateStart !== "" || dateEnd !== "";

  function clearAllFacets() {
    setTypeFilter([]);
    setDateStart("");
    setDateEnd("");
    onClearSubjectFilter();
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950 text-neutral-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Evidence</h2>
          <p className="mt-0.5 font-mono text-xs text-neutral-500">
            {caseName} · {filtered.length} of {evidence.length} items
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search evidence"
            className="w-64 rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-sky-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close evidence"
            className="rounded border border-neutral-700 p-2 text-neutral-300 hover:border-neutral-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 border-b border-neutral-800 px-6 py-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile icon={<FileText size={17} />} label="Total Evidence" value={filtered.length} />
        <StatTile icon={<Users size={17} />} label="People Mentioned" value={stats.peopleMentioned} />
        <StatTile
          icon={<AlertTriangle size={17} />}
          label="Unverified Witness Statements"
          value={stats.unverifiedWitness}
          tone="warning"
        />
        {stats.mostConflicting ? (
          <StatTile
            icon={<Swords size={17} />}
            label="Most Conflicting Evidence"
            value={stats.mostConflicting.subject.name}
            sublabel={`${stats.mostConflicting.count} conflict${stats.mostConflicting.count === 1 ? "" : "s"}`}
            tone="conflict"
          />
        ) : (
          <StatTile icon={<Swords size={17} />} label="Most Conflicting Evidence" value="None" tone="success" />
        )}
        <StatTile icon={<MapPin size={17} />} label="Items with Location Data" value={stats.withLocation} tone="success" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="thin-scrollbar w-64 flex-shrink-0 overflow-y-auto border-r border-neutral-800 px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-200">Filters</h3>
            {hasActiveFacets && (
              <button type="button" onClick={clearAllFacets} className="text-xs text-sky-400 hover:text-sky-300">
                Clear all
              </button>
            )}
          </div>

          <div className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Evidence Type</p>
            <label className="flex items-center justify-between py-1 text-sm text-neutral-200">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={typeFilter.length === 0}
                  onChange={() => setTypeFilter([])}
                  className="rounded border-neutral-600 bg-neutral-900 text-sky-500 focus:ring-sky-500"
                />
                All Types
              </span>
              <span className="font-mono text-xs text-neutral-500">{evidence.length}</span>
            </label>
            {ALL_EVIDENCE_TYPES.filter((t) => (typeCounts.get(t) ?? 0) > 0).map((t) => (
              <label key={t} className="flex items-center justify-between py-1 text-sm text-neutral-300">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={typeFilter.includes(t)}
                    onChange={() =>
                      setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                    className="rounded border-neutral-600 bg-neutral-900 text-sky-500 focus:ring-sky-500"
                  />
                  {EVIDENCE_TYPE_LABEL[t]}
                </span>
                <span className="font-mono text-xs text-neutral-500">{typeCounts.get(t)}</span>
              </label>
            ))}
          </div>

          <div className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">People</p>
            <label className="flex items-center justify-between py-1 text-sm text-neutral-200">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={subjectFilter.length === 0}
                  onChange={onClearSubjectFilter}
                  className="rounded border-neutral-600 bg-neutral-900 text-sky-500 focus:ring-sky-500"
                />
                All People
              </span>
              <span className="font-mono text-xs text-neutral-500">{subjects.length}</span>
            </label>
            {subjects
              .filter((s) => (subjectCounts.get(s.id) ?? 0) > 0)
              .map((s) => (
                <label key={s.id} className="flex items-center justify-between py-1 text-sm text-neutral-300">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={subjectFilter.includes(s.id)}
                      onChange={() => onToggleSubject(s.id)}
                      className="rounded border-neutral-600 bg-neutral-900 text-sky-500 focus:ring-sky-500"
                    />
                    {s.name}
                  </span>
                  <span className="font-mono text-xs text-neutral-500">{subjectCounts.get(s.id)}</span>
                </label>
              ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Date Range</p>
            <div className="space-y-2">
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200 focus:border-sky-500 focus:outline-none"
              />
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
        </aside>

        <main className="thin-scrollbar flex-1 overflow-auto px-6 py-5">
          <div className="grid gap-3">
            {filtered.map((item) => {
              const subject = subjectById.get(item.subjectId);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectEvidence(item.id);
                    onClose();
                  }}
                  className="rounded-md border border-neutral-800 bg-neutral-900/70 p-4 text-left transition-colors hover:border-neutral-600 hover:bg-neutral-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-neutral-800 px-2 py-1 text-[10px] font-medium uppercase text-neutral-300">
                        {EVIDENCE_TYPE_LABEL[item.evidenceType]}
                      </span>
                      <span className="text-xs text-neutral-400">{subject?.name ?? item.subjectId}</span>
                      {isUnverified(item) && item.evidenceType === "witness" && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ color: STATUS_COLORS.conflictRing, backgroundColor: "rgba(255,90,95,0.1)" }}
                        >
                          Unverified
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-neutral-500">{formatDateTime(item.eventTime, true)}</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-neutral-100">{item.event}</p>
                  <div className="mt-2 grid gap-1 text-xs text-neutral-500 sm:grid-cols-2">
                    <span>{item.location.name}</span>
                    <span>{item.source}</span>
                  </div>
                  {item.notes && <p className="mt-2 text-xs text-neutral-400">{item.notes}</p>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="rounded-md border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">
                No evidence matches the current filters.
              </div>
            )}
          </div>
        </main>

        <EvidenceInsightsPanel
          caseId={caseId}
          evidence={filtered}
          subjects={subjects}
          analysis={analysis}
          onSelectEvidence={(id) => {
            onSelectEvidence(id);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
