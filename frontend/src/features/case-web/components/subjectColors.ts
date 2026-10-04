import type { Subject } from "../types";

/**
 * Bold subject-card fills. Assigned by each subject's position in the case's
 * subject list (not by kind) and cycled if there are more subjects than
 * colors. Never red or green — those are reserved for conflict/selection.
 */
export const SUBJECT_PALETTE: { bg: string; text: string }[] = [
  { bg: "#4A6A8F", text: "#FFFFFF" }, // UPDATED line 9: was #3E5675 — brightened for the dark theme
  { bg: "#7E6BB0", text: "#FFFFFF" }, // was #A85A6C — a rose that read as conflict red, esp. on the event path map
  { bg: "#D9A441", text: "#2A1D05" }, // unchanged
  { bg: "#2F8A9A", text: "#FFFFFF" }, // UPDATED line 12: was #2F7A8A
  { bg: "#8A7A66", text: "#FFFFFF" }, // UPDATED line 13: was #7A6A58
  { bg: "#6676A0", text: "#FFFFFF" }, // UPDATED line 14: was #5B6B8C
];

export function subjectColorFor(subjects: Subject[], subjectId: string): { bg: string; text: string } {
  const index = subjects.findIndex((s) => s.id === subjectId);
  return SUBJECT_PALETTE[(index < 0 ? 0 : index) % SUBJECT_PALETTE.length];
}
