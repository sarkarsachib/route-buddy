/**
 * DEMO gazetteer for the candidate pilot corridor (Duttapukur–Barasat–
 * Madhyamgram–Kolkata). Coordinates are approximate, for simulation only, and
 * the corridor itself is UNVALIDATED. Replace with a geocoding provider.
 */
export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const DEMO_PLACES: Place[] = [
  { id: "duttapukur", name: "Duttapukur Station", lat: 22.772, lng: 88.534 },
  { id: "barasat", name: "Barasat Champadali More", lat: 22.723, lng: 88.481 },
  { id: "madhyamgram", name: "Madhyamgram Chowmatha", lat: 22.695, lng: 88.456 },
  { id: "birati", name: "Birati", lat: 22.667, lng: 88.433 },
  { id: "airport", name: "Kolkata Airport Gate 1", lat: 22.654, lng: 88.4467 },
  { id: "dumdum", name: "Dum Dum Station", lat: 22.623, lng: 88.421 },
  { id: "ultadanga", name: "Ultadanga", lat: 22.59, lng: 88.39 },
  { id: "sealdah", name: "Sealdah Station", lat: 22.567, lng: 88.37 },
  { id: "saltlake", name: "Salt Lake Sector V", lat: 22.576, lng: 88.433 },
  { id: "esplanade", name: "Esplanade", lat: 22.5645, lng: 88.3513 },
  { id: "howrah", name: "Howrah Station", lat: 22.5839, lng: 88.3426 },
];

export function placeById(id: string): Place | undefined {
  return DEMO_PLACES.find((p) => p.id === id);
}
