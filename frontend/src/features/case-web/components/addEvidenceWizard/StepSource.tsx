import type { EvidenceType } from "../../types";
import { SOURCE_OPTIONS } from "./wizardTypes";

interface StepSourceProps {
  onSelect: (type: EvidenceType) => void;
}

/** Step 1: a 3-column grid of source-kind cards. Picking one advances the wizard. */
export function StepSource({ onSelect }: StepSourceProps) {
  return (
    <div>
      <p className="mb-3 text-sm text-neutral-300">What kind of evidence is this?</p>
      <div className="grid grid-cols-3 gap-2">
        {SOURCE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => onSelect(opt.type)}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-4 text-center transition-colors hover:border-sky-500 hover:bg-neutral-900"
            >
              <Icon size={22} className="text-sky-400" />
              <span className="text-sm font-medium text-neutral-100">{opt.label}</span>
              <span className="text-[11px] text-neutral-500">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
