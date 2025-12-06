export interface AirportTransferCreateRequest {
  fromLocation?: string;
  toLocation?: string;
  vehicleType?: string;
  routeType?: string;
  price?: string;
  lat?: string;
  lng?: string;
  crawledBy?: string;
  crawlerName?: string;
}

function formatCoordinate(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value.toString();
}

export type AirportTransferLike = {
  fromLocation?: string;
  toLocation?: string;
  vehicleType?: string;
  routeType?: string;
  price?: string;
  latitude?: number;
  longitude?: number;
};

export function mapAirportTransferLikeToApiRequest(
  airportTransfer: AirportTransferLike,
  detailLink?: string,
  crawledBy?: string,
  crawlerName?: string,
): AirportTransferCreateRequest {
  return {
    fromLocation: airportTransfer.fromLocation?.trim() || undefined,
    toLocation: airportTransfer.toLocation?.trim() || undefined,
    vehicleType: airportTransfer.vehicleType?.trim() || undefined,
    routeType: airportTransfer.routeType?.trim() || undefined,
    price: airportTransfer.price?.trim() || undefined,
    lat: formatCoordinate(airportTransfer.latitude),
    lng: formatCoordinate(airportTransfer.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

