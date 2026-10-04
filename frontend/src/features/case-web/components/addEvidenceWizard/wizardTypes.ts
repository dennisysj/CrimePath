import type { ComponentType } from "react";
import { Camera, CreditCard, FileText, Film, HelpCircle, Image, MessageSquareText, Navigation } from "lucide-react";
import type { EvidenceAttachment, EvidenceType, InvolvedParty, TimeCertainty } from "../../types";

export type WizardStep = 1 | 2 | 3;

export const STEP_LABELS: Record<WizardStep, string> = {
  1: "Source",
  2: "Details",
  3: "Uploads",
};

type IconComponent = ComponentType<{ size?: number | string; className?: string }>;

export interface SourceOption {
  type: EvidenceType;
  label: string;
  hint: string;
  icon: IconComponent;
}

export const SOURCE_OPTIONS: SourceOption[] = [
  { type: "witness", label: "Witness", hint: "statement", icon: MessageSquareText },
  { type: "cctv", label: "CCTV", hint: "camera footage", icon: Camera },
  { type: "image", label: "Image", hint: "photo", icon: Image },
  { type: "video", label: "Video", hint: "other footage", icon: Film },
  { type: "document", label: "Document", hint: "report, record", icon: FileText },
  { type: "gps", label: "GPS", hint: "location log", icon: Navigation },
  { type: "transaction", label: "Transaction", hint: "card, purchase", icon: CreditCard },
  { type: "other", label: "Other", hint: "anything else", icon: HelpCircle },
];

/**
 * Default "When" certainty per source (step 2). Witness/document/other
 * accounts are inherently fuzzier than a timestamped system record.
 */
export const DEFAULT_CERTAINTY_FOR_SOURCE: Record<EvidenceType, "exact" | "approximate"> = {
  witness: "approximate",
  document: "approximate",
  other: "approximate",
  cctv: "exact",
  image: "exact",
  video: "exact",
  gps: "exact",
  transaction: "exact",
};

export type ClockPeriod = "AM" | "PM";

/** A typed 12-hour clock value. `second` is ignored by modes that don't use it. */
export interface ClockValue {
  hour: string;
  minute: string;
  second: string;
  period: ClockPeriod;
}

export const EMPTY_CLOCK: ClockValue = { hour: "", minute: "", second: "00", period: "AM" };

/**
 * Draft state carried across all three wizard steps. Navigating back and
 * forth never clears any of this — only picking a *different* source
 * re-applies the certainty default (handled by the shell, not here).
 */
export interface WizardDraft {
  evidenceType: EvidenceType | null;

  // Step 2
  subjectId: string;
  involvedParties: InvolvedParty[];
  certainty: TimeCertainty | null;
  date: string; // yyyy-mm-dd, shared across all three "When" modes
  exactTime: ClockValue;
  approxTime: ClockValue; // second unused
  approxMarginMinutes: string;
  rangeStart: ClockValue; // second unused
  rangeEnd: ClockValue; // second unused
  locationName: string;
  locationLat: number | null;
  locationLng: number | null;

  // Step 3
  attachments: EvidenceAttachment[];
  notes: string;
}

export const EMPTY_DRAFT: WizardDraft = {
  evidenceType: null,
  subjectId: "",
  involvedParties: [],
  certainty: null,
  date: "",
  exactTime: { ...EMPTY_CLOCK },
  approxTime: { ...EMPTY_CLOCK },
  approxMarginMinutes: "15",
  rangeStart: { ...EMPTY_CLOCK },
  rangeEnd: { ...EMPTY_CLOCK },
  locationName: "",
  locationLat: null,
  locationLng: null,
  attachments: [],
  notes: "",
};
