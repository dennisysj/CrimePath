import type { EvidenceType } from "../../types";
import { SOURCE_OPTIONS } from "./wizardTypes";

interface StepSourceProps {
  onSelect: (type: EvidenceType) => void;
}

/** Step 1: a 3-column grid of source-kind cards. Picking one advances the wizard. */
export function StepSource({ onSelect }: StepSourceProps) {
  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--text)" }}>What kind of evidence is this?</p>
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
