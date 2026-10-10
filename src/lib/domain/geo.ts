/**
 * Routing provider adapter. No live maps/routing credentials are configured,
 * so the default adapter is a SIMULATED estimator: straight-line (haversine)
 * distance × a configurable road factor, at a configurable average speed.
 * Real deployments must plug in a routing provider implementing RoutingProvider.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface LegMetrics {
  distanceM: number; // integer metres
  durationS: number; // integer seconds
}

export interface RoutingProvider {
  readonly name: string;
  readonly simulated: boolean;
  leg(a: LatLng, b: LatLng): LegMetrics;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function createSimulatedRouting(opts: { roadFactorBps: number; avgSpeedKmph: number }): RoutingProvider {
  return {
    name: "simulated-haversine",
    simulated: true,
    leg(a, b) {
      const distanceM = Math.round((haversineM(a, b) * opts.roadFactorBps) / 10000);
      const durationS = Math.round(distanceM / ((opts.avgSpeedKmph * 1000) / 3600));
      return { distanceM, durationS };
    },
  };
}

export function routeMetrics(points: LatLng[], routing: RoutingProvider): LegMetrics {
  let distanceM = 0;
  let durationS = 0;
  for (let i = 1; i < points.length; i++) {
    const l = routing.leg(points[i - 1], points[i]);
    distanceM += l.distanceM;
    durationS += l.durationS;
  }
  return { distanceM, durationS };
}
