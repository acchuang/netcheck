export const CF_POPS: Record<string, [string, number, number]> = {
  SIN: ["Singapore", 1.35, 103.82], NRT: ["Tokyo", 35.76, 140.39], HKG: ["Hong Kong", 22.31, 113.91],
  ICN: ["Seoul", 37.46, 126.44], TPE: ["Taipei", 25.08, 121.23], BKK: ["Bangkok", 13.69, 100.75],
  KUL: ["Kuala Lumpur", 2.75, 101.71], MNL: ["Manila", 14.51, 121.02], CGK: ["Jakarta", -6.13, 106.66],
  BOM: ["Mumbai", 19.09, 72.87], DEL: ["Delhi", 28.57, 77.10], SYD: ["Sydney", -33.95, 151.18],
  MEL: ["Melbourne", -37.67, 144.84], AKL: ["Auckland", -37.01, 174.78], PER: ["Perth", -31.94, 115.97],
  BNE: ["Brisbane", -27.38, 153.12], ADL: ["Adelaide", -34.94, 138.53],
  LAX: ["Los Angeles", 33.94, -118.41], SFO: ["San Francisco", 37.62, -122.38],
  SJC: ["San Jose", 37.36, -121.93], SEA: ["Seattle", 47.45, -122.31], PDX: ["Portland", 45.59, -122.60],
  DEN: ["Denver", 39.86, -104.67], DFW: ["Dallas", 32.90, -97.04], IAH: ["Houston", 29.98, -95.34],
  ORD: ["Chicago", 41.97, -87.91], ATL: ["Atlanta", 33.64, -84.43], MIA: ["Miami", 25.80, -80.29],
  IAD: ["Washington DC", 38.95, -77.46], EWR: ["Newark", 40.69, -74.17], JFK: ["New York", 40.64, -73.78],
  BOS: ["Boston", 42.37, -71.02], YYZ: ["Toronto", 43.68, -79.63], YVR: ["Vancouver", 49.20, -123.18],
  GRU: ["São Paulo", -23.43, -46.47], SCL: ["Santiago", -33.39, -70.79], BOG: ["Bogotá", 4.70, -74.15],
  LIM: ["Lima", -12.02, -77.11], MEX: ["Mexico City", 19.44, -99.07],
  LHR: ["London", 51.47, -0.46], AMS: ["Amsterdam", 52.31, 4.76], FRA: ["Frankfurt", 50.03, 8.57],
  CDG: ["Paris", 49.01, 2.55], MAD: ["Madrid", 40.47, -3.56], MXP: ["Milan", 45.63, 8.72],
  ZRH: ["Zurich", 47.46, 8.55], VIE: ["Vienna", 48.11, 16.57], WAW: ["Warsaw", 52.17, 20.97],
  ARN: ["Stockholm", 59.65, 17.94], HEL: ["Helsinki", 60.32, 24.95], CPH: ["Copenhagen", 55.62, 12.66],
  OSL: ["Oslo", 60.19, 11.10], DUB: ["Dublin", 53.43, -6.27], LIS: ["Lisbon", 38.77, -9.13],
  PRG: ["Prague", 50.10, 14.26], BRU: ["Brussels", 50.90, 4.48], MRS: ["Marseille", 43.44, 5.22],
  HAM: ["Hamburg", 53.63, 9.99], MUC: ["Munich", 48.35, 11.79],
  JNB: ["Johannesburg", -26.14, 28.25], CPT: ["Cape Town", -33.97, 18.60], NBO: ["Nairobi", -1.32, 36.93],
  LOS: ["Lagos", 6.58, 3.32], CAI: ["Cairo", 30.12, 31.41],
  DOH: ["Doha", 25.26, 51.57], DXB: ["Dubai", 25.25, 55.36], TLV: ["Tel Aviv", 32.01, 34.89],
  IST: ["Istanbul", 41.26, 28.74], KIX: ["Osaka", 34.43, 135.23], FUK: ["Fukuoka", 33.59, 130.45],
  CKG: ["Chongqing", 29.72, 106.64], CTU: ["Chengdu", 30.58, 103.95],
  PVG: ["Shanghai", 31.14, 121.81], PEK: ["Beijing", 40.08, 116.58], CMB: ["Colombo", 7.18, 79.88],
};

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatColo(colo: string | null, userLat?: number | null, userLon?: number | null): string {
  if (!colo || colo === "unknown") return "—";
  const pop = CF_POPS[colo];
  if (!pop) return colo;
  const [city, popLat, popLon] = pop;
  let dist = "";
  if (userLat != null && userLon != null) {
    const km = Math.round(haversineKm(userLat, userLon, popLat, popLon));
    dist = ` · ${km.toLocaleString()} km`;
  }
  return `${city} (${colo})${dist}`;
}