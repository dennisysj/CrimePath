import { Siren } from "lucide-react";
import type { EvidenceType } from "../../types";
import { SOURCE_OPTIONS } from "./wizardTypes";

interface StepSourceProps {
  onSelect: (type: EvidenceType) => void;
  /** Switch to the crime form (the offence itself, not evidence). */
  onSelectCrime: () => void;
}

/** Step 1: the crime itself, or a 3-column grid of evidence source kinds. Picking one advances the wizard. */
export function StepSource({ onSelect, onSelectCrime }: StepSourceProps) {
  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--text)" }}>What kind of event is this?</p>

      <button
        type="button"
        onClick={onSelectCrime}
        className="mb-3 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
        style={{ borderColor: "var(--crime)", background: "color-mix(in srgb, var(--crime) 10%, transparent)" }}
      >
        <Siren size={22} style={{ color: "var(--crime)" }} />
        <span>
          <span className="block text-sm font-medium" style={{ color: "var(--crime)" }}>Crime</span>
          <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
            when &amp; where the offence happened — shown as a window across the timeline
          </span>
        </span>
      </button>

      <p className="mb-2 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Evidence</p>
      <div className="grid grid-cols-3 gap-2">
        {SOURCE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => onSelect(opt.type)}
              className="flex flex-col items-center gap-1.5 rounded-lg border px-2 py-4 text-center transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <Icon size={22} className="text-[var(--accent)]" />
              <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{opt.label}</span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
