export interface BusCreateRequest {
  sourceUrl?: string;
  providerName?: string;
  providerUrl?: string;
  timeRange?: string;
  departure?: string;
  destination?: string;
  price?: string;
  lat?: string;
  lng?: string;
  crawledBy?: string;
  crawlerName?: string;
}

// Validation patterns matching backend DTO
const URL_PATTERN = /^(https?|ftp):\/\/[^\s\/$.?#].[^\s]*$/;

function isValidUrl(url?: string): boolean {
  if (!url) return false;
  return URL_PATTERN.test(url.trim());
}

function formatCoordinate(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value.toString();
}

export type BusLike = {
  sourceUrl?: string;
  providerName?: string;
  providerUrl?: string;
  timeRange?: string;
  departure?: string;
  destination?: string;
  price?: string;
  latitude?: number;
  longitude?: number;
};

export function mapBusLikeToApiRequest(
  bus: BusLike,
  detailLink?: string,
  crawledBy?: string,
  crawlerName?: string,
): BusCreateRequest {
  // Validate and clean sourceUrl
  const sourceUrl = bus.sourceUrl?.trim();
  const validSourceUrl = sourceUrl && isValidUrl(sourceUrl) ? sourceUrl : undefined;

  // Validate and clean providerUrl
  const providerUrl = bus.providerUrl?.trim();
  const validProviderUrl = providerUrl && isValidUrl(providerUrl) ? providerUrl : undefined;

  return {
    sourceUrl: validSourceUrl || detailLink || undefined,
    providerName: bus.providerName?.trim() || undefined,
    providerUrl: validProviderUrl || undefined,
    timeRange: bus.timeRange?.trim() || undefined,
    departure: bus.departure?.trim() || undefined,
    destination: bus.destination?.trim() || undefined,
    price: bus.price?.trim() || undefined,
    lat: formatCoordinate(bus.latitude),
    lng: formatCoordinate(bus.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

