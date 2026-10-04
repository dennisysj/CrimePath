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
function describeEvent(
  draft: WizardDraft,
  sourceLabel: string,
  subjectName: string,
  locationName: string,
  nameOf: (subjectId: string) => string | undefined,
): string {
  // Whoever is tagged "Reported by" in step 2 is the person giving the account.
  const reporterNames = draft.involvedParties
    .filter((p) => p.role === "reported_by" && p.subjectId)
    .map((p) => nameOf(p.subjectId))
    .filter((n): n is string => !!n);
  const reporters = reporterNames.join(" and ");

  if (!reporters) return `${sourceLabel} evidence involving ${subjectName} near ${locationName}.`;
  if (draft.evidenceType === "witness") return `${reporters} said they saw ${subjectName} near ${locationName}.`;
  return `${sourceLabel} evidence involving ${subjectName} near ${locationName}, reported by ${reporters}.`;
}

export function buildEvidenceInput(
  draft: WizardDraft,
  subjectName: string,
  nameOf: (subjectId: string) => string | undefined,
): Omit<Evidence, "id"> | null {
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
    location:
      draft.locationLat != null && draft.locationLng != null
        ? { name: locationName, lat: draft.locationLat, lng: draft.locationLng }
        : { name: locationName },
    event: describeEvent(draft, sourceLabel, subjectName, locationName, nameOf),
    source: sourceLabel,
    notes: draft.notes.trim() || undefined,
    attachments: draft.attachments.length > 0 ? draft.attachments : undefined,
    involvedParties: draft.involvedParties.filter((p) => p.subjectId), // ADDED: carry step 2's "Also involved" rows through, dropping any left with no subject picked
    ...times,
  };
}
