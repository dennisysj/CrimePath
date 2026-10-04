import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ConnectorKind, ConnectorSpec } from "./cardLayout";
import { STATUS_COLORS } from "./statusColors";

interface ConnectorLayerProps {
  width: number;
  height: number;
  connectors: ConnectorSpec[];
  highlightedKeys: Set<string> | null;
  hasSelection: boolean;
}

const COLOR: Record<ConnectorKind, string> = {
  sequence: STATUS_COLORS.neutralLine,
  gap: STATUS_COLORS.neutralLine,
  conflict: STATUS_COLORS.conflictRing,
  link: STATUS_COLORS.neutralLine,
};

/** Minimum visible segment length (px) before a connector shows its label as a chip; shorter segments fall back to a native hover tooltip instead. */
const MIN_LABEL_LENGTH = 90;
/** Rough px-per-character estimate for JetBrains Mono at the label's font size, used to size the label's background chip. */
const CHAR_WIDTH = 5.6;

function chipWidth(label: string) {
  return label.length * CHAR_WIDTH + 10;
}

/** Two chip rects (midX/midY plus half-width/half-height) overlap if their extents intersect on both axes. */
function rectsOverlap(
  a: { midX: number; midY: number; halfW: number; halfH: number },
  b: { midX: number; midY: number; halfW: number; halfH: number }
): boolean {
  return Math.abs(a.midX - b.midX) < a.halfW + b.halfW && Math.abs(a.midY - b.midY) < a.halfH + b.halfH;
}

/** One absolutely positioned SVG layer, rendered behind the cards. Connector endpoints are already fully resolved by cardLayout (card edge, collapsed-strip edge, or a clearance point beside a collapsed block). */
export function ConnectorLayer({ width, height, connectors, highlightedKeys, hasSelection }: ConnectorLayerProps) {
  const reduceMotion = useReducedMotion();
  const spring = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 400, damping: 35 };

  // ADDED: gap/conflict label chip rects (same-lane connectors), computed up front so link (cross-lane)
  // chips can be suppressed — in favor of their tooltip — when they'd overlap one of these. Gap/conflict
  // labels always win the collision, per "keep the gap/conflict label and move the link label into the tooltip."
  const priorityChipRects = connectors
    .filter((c) => c.kind !== "link" && c.label.length > 0 && Math.abs(c.to.x - c.from.x) >= MIN_LABEL_LENGTH)
    .map((c) => ({
      midX: (c.from.x + c.to.x) / 2,
      midY: c.from.y - 14,
      halfW: chipWidth(c.label) / 2,
      halfH: 7,
    }));

  return (
    <svg width={width} height={height} className="pointer-events-none absolute left-0 top-0">
      <AnimatePresence>
        {connectors.map((c) => {
          const isHighlighted = highlightedKeys?.has(c.key) ?? false;
          const dimmed = hasSelection && !isHighlighted;
          // Conflict lines always stay their own red, even when highlighted.
          const stroke = c.kind === "conflict" ? COLOR.conflict : isHighlighted ? STATUS_COLORS.selectionRing : COLOR[c.kind];
          // UPDATED line 42: fallback was the light theme's hardcoded "#6B6860" — mirrors the new --text-muted (#9A9FA8); SVG fill attributes can't reference var().
          const labelColor = c.kind === "conflict" ? COLOR.conflict : isHighlighted ? STATUS_COLORS.selectionRing : "#9A9FA8";
          const targetOpacity = dimmed ? 0.25 : 1;
          const isNewConflictDraw = c.kind === "conflict";

          if (c.kind !== "link") {
            const midX = (c.from.x + c.to.x) / 2;
            const segmentLength = Math.abs(c.to.x - c.from.x);
            const showChip = c.label.length > 0 && segmentLength >= MIN_LABEL_LENGTH;
            const w = chipWidth(c.label);

            return (
              <motion.g key={c.key} initial={{ opacity: 0 }} animate={{ opacity: targetOpacity }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}>
                <motion.line
                  initial={isNewConflictDraw ? { pathLength: 0 } : undefined}
                  animate={{ x1: c.from.x, y1: c.from.y, x2: c.to.x, y2: c.to.y, pathLength: 1 }}
                  transition={{ ...spring, pathLength: reduceMotion ? { duration: 0 } : { duration: 0.4, ease: "easeOut" } }}
                  stroke={stroke}
                  strokeWidth={c.kind === "conflict" ? 3 : 1.5}
                  strokeDasharray={c.kind === "gap" ? "6 4" : undefined}
                >
                  {c.label && <title>{c.label}</title>}
                </motion.line>
                {showChip && (
                  <motion.g animate={{ x: midX, y: c.from.y - 14 }} transition={spring}>
                    <rect x={-w / 2} y={-8} width={w} height={14} rx={4} style={{ fill: "var(--bg)" }} />
                    <text textAnchor="middle" y={2.5} fontSize={10} fill={labelColor} className="select-none font-mono">
                      {c.label}
                    </text>
                  </motion.g>
                )}
              </motion.g>
            );
          }

          // Cross-lane bezier: from the source card toward whichever of the target's top/bottom edges is nearer.
          const lift = Math.max(20, Math.abs(c.to.y - c.from.y) * 0.4) * (c.to.y > c.from.y ? 1 : -1);
          const path = `M ${c.from.x} ${c.from.y} C ${c.from.x} ${c.from.y + lift}, ${c.to.x} ${c.to.y - lift}, ${c.to.x} ${c.to.y}`;
          const approxLength = Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y);
          const midX = (c.from.x + c.to.x) / 2;
          const midY = (c.from.y + c.to.y) / 2;
          const w = chipWidth(c.label);
          // ADDED: a link label that would collide with a same-lane gap/conflict chip loses — it falls back
          // to the <title> tooltip already on the path below, instead of drawing on top of/next to that label.
          const collidesWithPriorityChip = priorityChipRects.some((rect) =>
            rectsOverlap(rect, { midX, midY, halfW: w / 2, halfH: 6.5 })
          );
          const showChip = approxLength >= MIN_LABEL_LENGTH && !collidesWithPriorityChip;

          return (
            <motion.g key={c.key} initial={{ opacity: 0 }} animate={{ opacity: targetOpacity }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}>
              <motion.path animate={{ d: path }} transition={spring} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="2 4">
                <title>{c.label}</title>
              </motion.path>
              {showChip && (
                <motion.g animate={{ x: midX, y: midY }} transition={spring}>
                  <rect x={-w / 2} y={-7} width={w} height={13} rx={4} style={{ fill: "var(--bg)" }} />
                  <text textAnchor="middle" y={2} fontSize={9} fill={labelColor} className="select-none font-mono">
                    {c.label}
                  </text>
                </motion.g>
              )}
            </motion.g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}
