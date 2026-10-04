import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-polylinedecorator";

interface PolylineDecoratorLayerProps {
  positions: [number, number][];
  color: string;
}

type PolylineDecoratorLeaflet = typeof L & {
  polylineDecorator: (line: L.Polyline, options: unknown) => L.Layer;
  Symbol: {
    arrowHead: (options: unknown) => unknown;
  };
};

/**
 * Arrowheads along a path, drawn with leaflet-polylinedecorator. Leaflet
 * layers aren't React elements, so this attaches an imperative decorator
 * layer to the existing map instance and removes it on unmount/change.
 */
export function PolylineDecoratorLayer({ positions, color }: PolylineDecoratorLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (positions.length < 2) return;
    const decoratorLeaflet = L as PolylineDecoratorLeaflet;
    const line = L.polyline(positions);
    const decorator = decoratorLeaflet.polylineDecorator(line, {
      patterns: [
        {
          offset: "5%",
          repeat: 80,
          symbol: decoratorLeaflet.Symbol.arrowHead({
            pixelSize: 8,
            polygon: true,
            pathOptions: { color, fillColor: color, fillOpacity: 1, weight: 0 },
          }),
        },
      ],
    }).addTo(map);

    return () => {
      decorator.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, color, JSON.stringify(positions)]);

  return null;
}
