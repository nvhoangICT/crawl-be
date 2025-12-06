export interface TourBusCreateRequest {
  title?: string;
  routeUrl?: string;
  detailLink?: string;
  image?: string;
  imageAlt?: string;
  vehicleType?: string;
  serviceType?: string;
  maxPassengers?: string;
  departure?: string;
  destination?: string;
  price?: string;
  vatNote?: string;
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

export type TourBusLike = {
  title?: string;
  routeUrl?: string;
  detailLink?: string;
  image?: string;
  imageAlt?: string;
  vehicleType?: string;
  serviceType?: string;
  maxPassengers?: string;
  departure?: string;
  destination?: string;
  price?: string;
  vatNote?: string;
  latitude?: number;
  longitude?: number;
};

export function mapTourBusLikeToApiRequest(
  tourBus: TourBusLike,
  detailLink: string,
  crawledBy?: string,
  crawlerName?: string,
): TourBusCreateRequest {
  // Validate and clean routeUrl
  const routeUrl = tourBus.routeUrl?.trim();
  const validRouteUrl = routeUrl && isValidUrl(routeUrl) ? routeUrl : undefined;

  // Validate and clean detailLink
  const validDetailLink = detailLink && isValidUrl(detailLink) ? detailLink : undefined;

  // Validate and clean image
  const image = tourBus.image?.trim();
  const validImage = image && isValidUrl(image) ? image : undefined;

  return {
    title: tourBus.title?.trim() || undefined,
    routeUrl: validRouteUrl || undefined,
    detailLink: validDetailLink || undefined,
    image: validImage || undefined,
    imageAlt: tourBus.imageAlt?.trim() || undefined,
    vehicleType: tourBus.vehicleType?.trim() || undefined,
    serviceType: tourBus.serviceType?.trim() || undefined,
    maxPassengers: tourBus.maxPassengers?.trim() || undefined,
    departure: tourBus.departure?.trim() || undefined,
    destination: tourBus.destination?.trim() || undefined,
    price: tourBus.price?.trim() || undefined,
    vatNote: tourBus.vatNote?.trim() || undefined,
    lat: formatCoordinate(tourBus.latitude),
    lng: formatCoordinate(tourBus.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

