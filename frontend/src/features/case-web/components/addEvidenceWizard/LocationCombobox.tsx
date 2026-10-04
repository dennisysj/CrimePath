import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { KNOWN_LOCATIONS } from "../../mockData";

export interface LocationStat {
  name: string;
  lat: number | null;
  lng: number | null;
  count: number;
}

interface LocationComboboxProps {
  value: string;
  locationStats: LocationStat[];
  onChange: (name: string, lat: number | null, lng: number | null) => void;
}

const inputClass =
  "w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none";

/**
 * Typing filters locations already used in this case; picking one reuses
 * its coordinates. Typing something new offers to add it — looking up
 * KNOWN_LOCATIONS for coordinates if the name matches, otherwise saving
 * without lat/lng. Never shows raw lat/lng inputs.
 */
export function LocationCombobox({ value, locationStats, onChange }: LocationComboboxProps) {
  const [open, setOpen] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? locationStats.filter((l) => l.name.toLowerCase().includes(query))
    : locationStats;
  const hasExactMatch = locationStats.some((l) => l.name.toLowerCase() === query);

  function scheduleClose() {
    closeTimeout.current = setTimeout(() => setOpen(false), 120);
  }

  function cancelClose() {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
  }

  function selectExisting(stat: LocationStat) {
    onChange(stat.name, stat.lat, stat.lng);
    setOpen(false);
  }

  function selectNew() {
    const trimmed = value.trim();
    const known = KNOWN_LOCATIONS.find((k) => k.name.toLowerCase() === trimmed.toLowerCase());
    onChange(trimmed, known?.lat ?? null, known?.lng ?? null);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value, null, null)}
        onFocus={() => setOpen(true)}
        onBlur={scheduleClose}
        placeholder="Metrotown"
        className={inputClass}
        autoComplete="off"
      />

      {open && (query.length > 0 || filtered.length > 0) && (
        <ul
          onMouseDown={cancelClose}
          className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border py-1 shadow-lg thin-scrollbar"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {filtered.map((stat) => (
            <li key={stat.name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectExisting(stat)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text)" }}
              >
                <span className="truncate">{stat.name}</span>
                <span className="ml-2 flex-shrink-0 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {stat.count} evidence
                </span>
              </button>
            </li>
          ))}

          {query.length > 0 && !hasExactMatch && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={selectNew}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
                style={{ color: "var(--accent)" }}
              >
                <Plus size={13} />
                Add "{value.trim()}" as new location
              </button>
            </li>
          )}

          {filtered.length === 0 && query.length === 0 && (
            <li className="px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>Start typing a location…</li>
          )}
        </ul>
      )}
    </div>
  );
}
