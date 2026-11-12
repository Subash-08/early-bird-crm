"use client";

import { useRef, useState, type PointerEvent } from "react";
import { MapPin, Minus, Plus } from "lucide-react";
import { distanceMetres } from "@/lib/attendance-domain";
import styles from "./attendance-map.module.css";

type Point = { latitude: number; longitude: number };
type Pixel = { x: number; y: number };
type Fix = Point & { accuracyM: number };
const SIZE = 256;
const LIMIT = 85.05112878;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const world = (zoom: number) => SIZE * 2 ** zoom;
const wrap = (value: number, period: number) => ((value % period) + period) % period;

function project(point: Point, zoom: number): Pixel {
  const sine = Math.sin(clamp(point.latitude, -LIMIT, LIMIT) * Math.PI / 180);
  return {
    x: (point.longitude + 180) / 360 * world(zoom),
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * world(zoom),
  };
}

function unproject(pixel: Pixel, zoom: number): Point {
  return {
    longitude: wrap(pixel.x, world(zoom)) / world(zoom) * 360 - 180,
    latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * clamp(pixel.y, 0, world(zoom)) / world(zoom)))) * 180 / Math.PI,
  };
}

export function AttendanceMap({ office, radiusM, fix, accuracyLimit, onPick }: {
  office: Point; radiusM: number; fix?: Fix | null; accuracyLimit?: number;
  onPick?: (point: Point) => void;
}) {
  const [view, setView] = useState<{ center: Point; zoom: number } | null>(null);
  const [overview, setOverview] = useState(true);
  const [size, setSize] = useState({ width: 600, height: 300 });
  const observer = useRef<ResizeObserver | null>(null);
  const drag = useRef<{ start: Pixel; center: Pixel; moved: boolean } | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const radius = clamp(radiusM || 0, 0, 1000);
  const metresPerPixel = (z: number) => Math.cos(clamp(office.latitude, -LIMIT, LIMIT) * Math.PI / 180) * 40_030_174 / world(z);
  const officeZoom = clamp(Math.floor(Math.log2(Math.min(size.width, size.height) * metresPerPixel(0) / Math.max(radius * 2.8, 180))), 1, 19);
  const distance = fix ? distanceMetres(office, fix) : null;
  const accurate = fix && fix.accuracyM <= (accuracyLimit ?? Infinity);
  const distant = !onPick && distance !== null && distance > Math.min(size.width, size.height) * metresPerPixel(officeZoom) * 0.38;
  const staffOverview = distant && overview && distance !== null;
  const zoom = view?.zoom ?? (staffOverview ? clamp(Math.floor(Math.log2(Math.min(size.width, size.height) * metresPerPixel(0) / (distance * 2.8))), 0, officeZoom) : officeZoom);
  const officePixel = project(office, zoom);
  const fixPixel = fix ? project(fix, zoom) : null;
  const relativeX = (x: number, center: number) => wrap(x - center + world(zoom) / 2, world(zoom)) - world(zoom) / 2;
  const center = view ? project(view.center, zoom) : staffOverview && fixPixel
    ? { x: officePixel.x + relativeX(fixPixel.x, officePixel.x) / 2, y: (officePixel.y + fixPixel.y) / 2 } : officePixel;
  const left = center.x - size.width / 2, top = center.y - size.height / 2;
  const at = (pixel: Pixel) => ({ x: relativeX(pixel.x, center.x) + size.width / 2, y: pixel.y - top });
  const pin = at(officePixel);
  const me = fixPixel ? at(fixPixel) : null;
  const tiles: { key: string; url: string; x: number; y: number }[] = [];
  // The staff location is drawn locally; only office-area tiles are requested.
  if (!staffOverview) {
    const count = 2 ** zoom;
    for (let y = Math.max(0, Math.floor(top / SIZE)); y <= Math.min(count - 1, Math.floor((top + size.height) / SIZE)); y++) {
      for (let x = Math.floor(left / SIZE); x <= Math.floor((left + size.width) / SIZE); x++) {
        tiles.push({ key: `${zoom}/${x}/${y}`, url: `https://tile.openstreetmap.org/${zoom}/${wrap(x, count)}/${y}.png`, x: x * SIZE - left, y: y * SIZE - top });
      }
    }
  }

  function pointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * size.width / bounds.width, y: (event.clientY - bounds.top) * size.height / bounds.height };
  }

  return <div className={styles.map}>
    <div className={styles.viewport} ref={(node) => {
      observer.current?.disconnect();
      if (!node) return;
      observer.current = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width && height) setSize((old) => old.width === width && old.height === height ? old : { width, height });
      });
      observer.current.observe(node);
    }}>
      {tiles.map((tile) => (
        // Tiles use native browser caching and go straight to the map provider.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={tile.key} src={tile.url} alt="" draggable={false} width={SIZE} height={SIZE}
          referrerPolicy="strict-origin-when-cross-origin" onError={() => setTilesFailed(true)} style={{ left: tile.x, top: tile.y }} />
      ))}
      <svg className={onPick ? styles.picker : undefined} viewBox={`0 0 ${size.width} ${size.height}`}
        role={onPick ? "group" : "img"} aria-label={onPick ? "Office map. Click to place the pin, drag or use arrow keys to pan, and press Enter to place the pin at the center." : "Map of the office attendance radius and your last location"}
        tabIndex={onPick ? 0 : undefined}
        onKeyDown={onPick ? (event) => {
          const offsets: Record<string, Pixel> = { ArrowLeft: { x: -48, y: 0 }, ArrowRight: { x: 48, y: 0 }, ArrowUp: { x: 0, y: -48 }, ArrowDown: { x: 0, y: 48 } };
          if (event.key === "Enter") { event.preventDefault(); onPick(unproject(center, zoom)); }
          const offset = offsets[event.key];
          if (offset) {
            event.preventDefault();
            setView({ center: unproject({ x: center.x + offset.x, y: center.y + offset.y }, zoom), zoom });
          }
        } : undefined}
        onPointerDown={onPick ? (event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          drag.current = { start: pointer(event), center, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        } : undefined}
        onPointerMove={onPick ? (event) => {
          if (!event.isPrimary || !drag.current) return;
          const point = pointer(event);
          const dx = point.x - drag.current.start.x, dy = point.y - drag.current.start.y;
          if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
          if (drag.current.moved) setView({ center: unproject({ x: drag.current.center.x - dx, y: drag.current.center.y - dy }, zoom), zoom });
        } : undefined}
        onPointerUp={onPick ? (event) => {
          if (!event.isPrimary) return;
          if (drag.current && !drag.current.moved) {
            const point = pointer(event);
            setView({ center: unproject(center, zoom), zoom });
            onPick(unproject({ x: left + point.x, y: top + point.y }, zoom));
          }
          drag.current = null;
        } : undefined}
        onLostPointerCapture={() => { drag.current = null; }}>
        <circle cx={pin.x} cy={pin.y} r={radius / metresPerPixel(zoom)} fill="#1677a733" stroke="#12637d" strokeWidth={2} />
        <circle cx={pin.x} cy={pin.y} r={7} fill="#12637d" stroke="white" strokeWidth={2}><title>Office</title></circle>
        {me && fix && <circle cx={me.x} cy={me.y} r={5} fill={accurate ? "#db623d" : "#986300"} stroke="white" strokeWidth={2}><title>Your reported location</title></circle>}
      </svg>
      {onPick && <div className={styles.controls}>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 19} onClick={() => setView({ center: unproject(center, zoom), zoom: zoom + 1 })}><Plus /></button>
        <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setView({ center: unproject(center, zoom), zoom: zoom - 1 })}><Minus /></button>
        <button type="button" aria-label="Center on office" onClick={() => setView(null)}><MapPin /></button>
      </div>}
      {!staffOverview && <a className={styles.credit} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}
    </div>
    <div className={styles.legend}>
      <span><i /> Office · {radius} m radius</span>
      {fix && <span><i className={styles.staff} /> Your location · accuracy ±{Math.round(fix.accuracyM).toLocaleString()} m</span>}
      {distant && <button type="button" className="button secondary" onClick={() => setOverview(!overview)}>{overview ? "Office view" : "Show both locations"}</button>}
    </div>
    {staffOverview && <p className={styles.note}>Overview of both locations. Switch to Office view to see nearby streets.</p>}
    {tilesFailed && !staffOverview && <p className={styles.note}>Some street tiles could not load. The pins and radius still work.</p>}
    {distance !== null && <p className={styles.note}>{accurate ? `About ${Math.round(distance).toLocaleString()} m from the office · ${distance <= radius ? "inside" : "outside"} the radius (preview).` : "Location is too approximate to tell if you are inside the office radius. Try again with precise location enabled."}</p>}
  </div>;
}
