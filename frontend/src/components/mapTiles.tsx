import { TileLayer } from "react-leaflet";

/** "dark" uses the same OSM tiles, inverted via the .map-dark CSS filter in index.css. */
export type MapVariant = "light" | "dark";

export function BaseTiles() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}
