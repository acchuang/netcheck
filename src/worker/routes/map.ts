import type { Env } from '../types';
import { corsHeaders, checkRateLimit, getCf } from '../shared';

export const PROBES = [
  {
    id: 'IAD',
    name: 'Ashburn',
    country: 'US',
    region: 'North America',
    city: 'Ashburn',
    lat: 39.04,
    lon: -77.49,
  },
  {
    id: 'DFW',
    name: 'Dallas',
    country: 'US',
    region: 'North America',
    city: 'Dallas',
    lat: 32.79,
    lon: -96.77,
  },
  {
    id: 'LAX',
    name: 'Los Angeles',
    country: 'US',
    region: 'North America',
    city: 'Los Angeles',
    lat: 33.94,
    lon: -118.41,
  },
  {
    id: 'ORD',
    name: 'Chicago',
    country: 'US',
    region: 'North America',
    city: 'Chicago',
    lat: 41.88,
    lon: -87.63,
  },
  {
    id: 'SEA',
    name: 'Seattle',
    country: 'US',
    region: 'North America',
    city: 'Seattle',
    lat: 47.61,
    lon: -122.33,
  },
  {
    id: 'YYZ',
    name: 'Toronto',
    country: 'CA',
    region: 'North America',
    city: 'Toronto',
    lat: 43.65,
    lon: -79.38,
  },
  {
    id: 'MIA',
    name: 'Miami',
    country: 'US',
    region: 'North America',
    city: 'Miami',
    lat: 25.76,
    lon: -80.19,
  },
  {
    id: 'GRU',
    name: 'São Paulo',
    country: 'BR',
    region: 'South America',
    city: 'São Paulo',
    lat: -23.55,
    lon: -46.63,
  },
  {
    id: 'EZE',
    name: 'Buenos Aires',
    country: 'AR',
    region: 'South America',
    city: 'Buenos Aires',
    lat: -34.6,
    lon: -58.38,
  },
  {
    id: 'SCL',
    name: 'Santiago',
    country: 'CL',
    region: 'South America',
    city: 'Santiago',
    lat: -33.45,
    lon: -70.67,
  },
  {
    id: 'BOG',
    name: 'Bogotá',
    country: 'CO',
    region: 'South America',
    city: 'Bogotá',
    lat: 4.71,
    lon: -74.07,
  },
  {
    id: 'LHR',
    name: 'London',
    country: 'GB',
    region: 'Europe',
    city: 'London',
    lat: 51.51,
    lon: -0.13,
  },
  {
    id: 'FRA',
    name: 'Frankfurt',
    country: 'DE',
    region: 'Europe',
    city: 'Frankfurt',
    lat: 50.11,
    lon: 8.68,
  },
  {
    id: 'CDG',
    name: 'Paris',
    country: 'FR',
    region: 'Europe',
    city: 'Paris',
    lat: 49.01,
    lon: 2.55,
  },
  {
    id: 'AMS',
    name: 'Amsterdam',
    country: 'NL',
    region: 'Europe',
    city: 'Amsterdam',
    lat: 52.37,
    lon: 4.9,
  },
  {
    id: 'ARN',
    name: 'Stockholm',
    country: 'SE',
    region: 'Europe',
    city: 'Stockholm',
    lat: 59.33,
    lon: 18.07,
  },
  {
    id: 'WAW',
    name: 'Warsaw',
    country: 'PL',
    region: 'Europe',
    city: 'Warsaw',
    lat: 52.23,
    lon: 21.01,
  },
  {
    id: 'MAD',
    name: 'Madrid',
    country: 'ES',
    region: 'Europe',
    city: 'Madrid',
    lat: 40.42,
    lon: -3.7,
  },
  {
    id: 'DXB',
    name: 'Dubai',
    country: 'AE',
    region: 'Middle East',
    city: 'Dubai',
    lat: 25.2,
    lon: 55.27,
  },
  {
    id: 'TLV',
    name: 'Tel Aviv',
    country: 'IL',
    region: 'Middle East',
    city: 'Tel Aviv',
    lat: 32.09,
    lon: 34.77,
  },
  {
    id: 'JNB',
    name: 'Johannesburg',
    country: 'ZA',
    region: 'Africa',
    city: 'Johannesburg',
    lat: -26.2,
    lon: 28.05,
  },
  {
    id: 'LOS',
    name: 'Lagos',
    country: 'NG',
    region: 'Africa',
    city: 'Lagos',
    lat: 6.52,
    lon: 3.38,
  },
  {
    id: 'NBO',
    name: 'Nairobi',
    country: 'KE',
    region: 'Africa',
    city: 'Nairobi',
    lat: -1.29,
    lon: 36.82,
  },
  {
    id: 'SIN',
    name: 'Singapore',
    country: 'SG',
    region: 'Asia',
    city: 'Singapore',
    lat: 1.35,
    lon: 103.82,
  },
  {
    id: 'NRT',
    name: 'Tokyo',
    country: 'JP',
    region: 'Asia',
    city: 'Tokyo',
    lat: 35.68,
    lon: 139.69,
  },
  {
    id: 'HKG',
    name: 'Hong Kong',
    country: 'HK',
    region: 'Asia',
    city: 'Hong Kong',
    lat: 22.32,
    lon: 114.17,
  },
  {
    id: 'BOM',
    name: 'Mumbai',
    country: 'IN',
    region: 'Asia',
    city: 'Mumbai',
    lat: 19.08,
    lon: 72.88,
  },
  {
    id: 'ICN',
    name: 'Seoul',
    country: 'KR',
    region: 'Asia',
    city: 'Seoul',
    lat: 37.57,
    lon: 126.98,
  },
  {
    id: 'TPE',
    name: 'Taipei',
    country: 'TW',
    region: 'Asia',
    city: 'Taipei',
    lat: 25.03,
    lon: 121.57,
  },
  {
    id: 'SYD',
    name: 'Sydney',
    country: 'AU',
    region: 'Oceania',
    city: 'Sydney',
    lat: -33.87,
    lon: 151.21,
  },
  {
    id: 'AKL',
    name: 'Auckland',
    country: 'NZ',
    region: 'Oceania',
    city: 'Auckland',
    lat: -36.85,
    lon: 174.76,
  },
  {
    id: 'AWS-VA',
    name: 'AWS us-east-1',
    country: 'US',
    region: 'North America',
    city: 'Ashburn',
    lat: 39.04,
    lon: -77.49,
  },
  {
    id: 'AWS-IR',
    name: 'AWS eu-west-1',
    country: 'IE',
    region: 'Europe',
    city: 'Dublin',
    lat: 53.34,
    lon: -6.26,
  },
  {
    id: 'AWS-SG',
    name: 'AWS ap-southeast-1',
    country: 'SG',
    region: 'Asia',
    city: 'Singapore',
    lat: 1.35,
    lon: 103.82,
  },
  {
    id: 'GCP-IA',
    name: 'GCP us-central1',
    country: 'US',
    region: 'North America',
    city: 'Council Bluffs',
    lat: 41.26,
    lon: -95.86,
  },
  {
    id: 'GCP-BE',
    name: 'GCP europe-west1',
    country: 'BE',
    region: 'Europe',
    city: 'St. Ghislain',
    lat: 50.45,
    lon: 3.82,
  },
  {
    id: 'GCP-TW',
    name: 'GCP asia-east1',
    country: 'TW',
    region: 'Asia',
    city: 'Changhua',
    lat: 24.06,
    lon: 120.53,
  },
  {
    id: 'AZ-US',
    name: 'Azure eastus',
    country: 'US',
    region: 'North America',
    city: 'Boydton',
    lat: 36.67,
    lon: -78.39,
  },
  {
    id: 'AZ-NL',
    name: 'Azure westeurope',
    country: 'NL',
    region: 'Europe',
    city: 'Amsterdam',
    lat: 52.37,
    lon: 4.9,
  },
  {
    id: 'AZ-SG',
    name: 'Azure southeastasia',
    country: 'SG',
    region: 'Asia',
    city: 'Singapore',
    lat: 1.35,
    lon: 103.82,
  },
];

const REGION_BUCKETS: Record<string, keyof Env> = {
  wnam: 'PING_WNAM',
  enam: 'PING_ENAM',
  weur: 'PING_WEUR',
  eeur: 'PING_EEUR',
  apac: 'PING_APAC',
  oc: 'PING_OC',
};

export async function handleRegionPing(url: URL, env: Env, request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const region = url.searchParams.get('region');
  if (!region) {
    return Response.json(
      { error: 'Missing region parameter' },
      { status: 400, headers: corsHeaders(request) },
    );
  }
  const bindingName = REGION_BUCKETS[region];
  if (!bindingName) {
    return Response.json(
      { error: 'Unknown region' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const bucket = env[bindingName] as unknown as R2Bucket;
  const start = Date.now();
  const obj = await bucket.get('ping.json');
  const latency = Date.now() - start;

  if (!obj) {
    return Response.json(
      { error: 'Ping file not found' },
      { status: 404, headers: corsHeaders(request) },
    );
  }

  return Response.json({ region, latency, ts: Date.now() }, { headers: corsHeaders(request) });
}

export async function handleMapProbes(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const cf = getCf(request);
  const userColo = cf.colo || 'unknown';
  const userLat = cf.latitude ? parseFloat(cf.latitude) : null;
  const userLon = cf.longitude ? parseFloat(cf.longitude) : null;

  return Response.json(
    {
      userColo,
      userLat,
      userLon,
      probes: PROBES.map((p) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        region: p.region,
        city: p.city,
        lat: p.lat,
        lon: p.lon,
      })),
    },
    { headers: corsHeaders(request) },
  );
}