import type { CardPosition, ConnectorKind, ConnectorSpec } from "./cardLayout";
import { CARD_HEIGHT, CARD_WIDTH } from "./cardLayout";

interface ConnectorLayerProps {
  width: number;
  height: number;
  connectors: ConnectorSpec[];
  positions: Map<string, CardPosition>;
  highlightedKeys: Set<string> | null;
  hasSelection: boolean;
}

const COLOR: Record<ConnectorKind, string> = {
  sequence: "#737373", // neutral-500
  gap: "#737373",
  conflict: "#ef4444", // red-500
  link: "#a3a3a3", // neutral-400
};
const GREEN = "#22c55e";

/** One absolutely positioned SVG layer, rendered behind the cards. */
export function ConnectorLayer({ width, height, connectors, positions, highlightedKeys, hasSelection }: ConnectorLayerProps) {
  return (
    <svg width={width} height={height} className="pointer-events-none absolute left-0 top-0">
      {connectors.map((c) => {
        const from = positions.get(c.fromId);
        const to = positions.get(c.toId);
        if (!from || !to) return null;

        const isHighlighted = highlightedKeys?.has(c.key) ?? false;
        const dimmed = hasSelection && !isHighlighted;
        // Conflict lines always stay red, even when highlighted.
        const stroke = c.kind === "conflict" ? COLOR.conflict : isHighlighted ? GREEN : COLOR[c.kind];
        const labelColor = c.kind === "conflict" ? COLOR.conflict : isHighlighted ? GREEN : "#a3a3a3";

        if (c.sameLane) {
          const fromRightX = from.x + CARD_WIDTH;
          const fromY = from.y + CARD_HEIGHT / 2;
          const toLeftX = to.x;
          const toY = to.y + CARD_HEIGHT / 2;
          const midX = (fromRightX + toLeftX) / 2;

          return (
            <g key={c.key} opacity={dimmed ? 0.25 : 1}>
              <line
                x1={fromRightX}
                y1={fromY}
                x2={toLeftX}
                y2={toY}
                stroke={stroke}
                strokeWidth={c.kind === "conflict" ? 3 : 1.5}
                strokeDasharray={c.kind === "gap" ? "6 4" : undefined}
              />
              <text x={midX} y={fromY - 6} textAnchor="middle" fontSize={10} fill={labelColor} className="select-none font-mono">
                {c.label}
              </text>
            </g>
          );
        }

        // Cross-lane bezier: from the source card toward whichever of the
        // target's top/bottom edges is nearer.
        const fromCenterX = from.x + CARD_WIDTH / 2;
        const toCenterX = to.x + CARD_WIDTH / 2;
        const targetBelow = to.y > from.y;
        const fromEdgeY = targetBelow ? from.y + CARD_HEIGHT : from.y;
        const toEdgeY = targetBelow ? to.y : to.y + CARD_HEIGHT;
        const lift = Math.max(20, Math.abs(toEdgeY - fromEdgeY) * 0.4) * (targetBelow ? 1 : -1);
        const path = `M ${fromCenterX} ${fromEdgeY} C ${fromCenterX} ${fromEdgeY + lift}, ${toCenterX} ${toEdgeY - lift}, ${toCenterX} ${toEdgeY}`;

        return (
          <g key={c.key} opacity={dimmed ? 0.25 : 1}>
            <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="2 4" />
            <text
              x={(fromCenterX + toCenterX) / 2}
              y={(fromEdgeY + toEdgeY) / 2}
              textAnchor="middle"
              fontSize={9}
              fill={labelColor}
              className="select-none font-mono"
            >
              {c.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
