export type LatLngExpression = [number, number] | { lat: number; lng: number };

export interface Map {
  setView(center: LatLngExpression, zoom: number): Map;
  fitBounds(bounds: LatLngExpression[], options?: Record<string, unknown>): Map;
  addLayer(layer: Layer): Map;
  remove(): void;
  invalidateSize(options?: Record<string, unknown>): Map;
  getContainer(): HTMLElement;
  on(event: string, fn: () => void): Map;
}

export interface Layer {
  addTo(map: Map): Layer;
  remove(): void;
}

export interface TileLayer extends Layer {
  addTo(map: Map): TileLayer;
}

export interface CircleMarker extends Layer {
  addTo(map: Map): CircleMarker;
  bindPopup(content: string, options?: Record<string, unknown>): CircleMarker;
  setStyle(options: Record<string, unknown>): CircleMarker;
  openPopup(): CircleMarker;
}

export interface Polyline extends Layer {
  addTo(map: Map): Polyline;
}

export interface Icon {}

export interface L {
  map(element: string | HTMLElement, options?: Record<string, unknown>): Map;
  tileLayer(url: string, options?: Record<string, unknown>): TileLayer;
  circleMarker(latlng: LatLngExpression, options?: Record<string, unknown>): CircleMarker;
  polyline(latlngs: LatLngExpression[], options?: Record<string, unknown>): Polyline;
  latLng(lat: number, lng: number): { lat: number; lng: number };
  icon(options: Record<string, unknown>): Icon;
}

declare global {
  const L: L;
}
