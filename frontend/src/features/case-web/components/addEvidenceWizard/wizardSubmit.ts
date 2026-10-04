import type { Evidence } from "../../types";
import { SOURCE_OPTIONS, type WizardDraft } from "./wizardTypes";
import { clockToDate } from "./wizardTime";

type DerivedTimes = Pick<Evidence, "eventTime" | "earliestPossibleTime" | "latestPossibleTime">;

function deriveTimesFromDraft(draft: WizardDraft): DerivedTimes | null {
  if (draft.certainty === "exact") {
    const d = clockToDate(draft.date, draft.exactTime);
    if (!d) return null;
    const iso = d.toISOString();
    return { eventTime: iso, earliestPossibleTime: iso, latestPossibleTime: iso };
  }

  if (draft.certainty === "approximate") {
    const center = clockToDate(draft.date, draft.approxTime);
    const margin = Number(draft.approxMarginMinutes);
    if (!center || !Number.isFinite(margin) || margin < 0) return null;
    const earliest = new Date(center.getTime() - margin * 60_000);
    const latest = new Date(center.getTime() + margin * 60_000);
    return {
      eventTime: center.toISOString(),
      earliestPossibleTime: earliest.toISOString(),
      latestPossibleTime: latest.toISOString(),
    };
  }

  if (draft.certainty === "range") {
    const start = clockToDate(draft.date, draft.rangeStart);
    const end = clockToDate(draft.date, draft.rangeEnd);
    if (!start || !end) return null;
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    return {
      eventTime: mid.toISOString(),
      earliestPossibleTime: start.toISOString(),
      latestPossibleTime: end.toISOString(),
    };
  }

  return null;
}

/**
 * The wizard never asks for a free-text description or attribution (unlike
 * the old single-step modal) — `event` and `source` are derived from what
 * was already picked in steps 1-2. `notes` stays its own optional field.
 */
export function buildEvidenceInput(draft: WizardDraft, subjectName: string): Omit<Evidence, "id"> | null {
  if (!draft.evidenceType || !draft.certainty) return null;
  const locationName = draft.locationName.trim();
  if (!locationName) return null;

  const times = deriveTimesFromDraft(draft);
  if (!times) return null;

  const sourceLabel = SOURCE_OPTIONS.find((o) => o.type === draft.evidenceType)?.label ?? "Evidence";

  return {
    subjectId: draft.subjectId,
    evidenceType: draft.evidenceType,
    timeCertainty: draft.certainty,
    location: { name: locationName, lat: draft.locationLat ?? 0, lng: draft.locationLng ?? 0 },
    event: `${sourceLabel} evidence involving ${subjectName} near ${locationName}.`,
    source: sourceLabel,
    notes: draft.notes.trim() || undefined,
    attachments: draft.attachments.length > 0 ? draft.attachments : undefined,
    involvedParties: draft.involvedParties.filter((p) => p.subjectId), // ADDED: carry step 2's "Also involved" rows through, dropping any left with no subject picked
    ...times,
  };
}
