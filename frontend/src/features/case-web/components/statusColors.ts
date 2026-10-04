/**
 * Mirrors the status color variables in index.css (--conflict, --conflict-ring,
 * --linked, --ai). SVG stroke/fill attributes and Leaflet's string-built
 * divIcon HTML can't reference CSS var(), so this is the one JS-side source
 * of truth those contexts read from, kept in sync with the CSS values by hand.
 */
export const STATUS_COLORS = {
  conflict: "#A32D2D",
  conflictRing: "#FF5A5F", // UPDATED line 9: was #E24B4A — brighter red for the dark theme
  linked: "#27500A",
  ai: "#3C3489",
  selectionRing: "#F2F1EC", // UPDATED line 12: was #111111 (black) — now a white ring to read against dark card fills
  neutralLine: "#5F646E", // UPDATED line 13: was #B4B2A9 (light-theme gray)
} as const;
