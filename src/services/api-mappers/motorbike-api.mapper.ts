export interface MotorbikeCreateRequest {
  location?: string;
  detailLink?: string;
  image?: string;
  imageAlt?: string;
  delivery?: string;
  vehicleType?: string;
  provider?: string;
  rating?: number;
  vehicleModels?: any; // JSON node
  availability?: string;
  pricePerDay?: string;
  price?: string;
  holidayPrice?: string;
  holidayNote?: string;
  vehicles?: any; // JSON node
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

function isValidScore(score?: number): boolean {
  if (score === undefined || score === null) return false;
  return typeof score === 'number' && !isNaN(score) && score >= 0.0 && score <= 5.0;
}

function formatCoordinate(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value.toString();
}

export type MotorbikeLike = {
  location?: string;
  detailLink?: string;
  image?: string;
  imageAlt?: string;
  delivery?: string;
  vehicleType?: string;
  provider?: string;
  rating?: number;
  vehicleModels?: any;
  availability?: string;
  pricePerDay?: string;
  price?: string;
  holidayPrice?: string;
  holidayNote?: string;
  vehicles?: any;
  latitude?: number;
  longitude?: number;
};

export function mapMotorbikeLikeToApiRequest(
  motorbike: MotorbikeLike,
  detailLink: string,
  crawledBy?: string,
  crawlerName?: string,
): MotorbikeCreateRequest {
  // Validate and clean detailLink
  const validDetailLink = detailLink && isValidUrl(detailLink) ? detailLink : undefined;

  // Validate and clean image
  const image = motorbike.image?.trim();
  const validImage = image && isValidUrl(image) ? image : undefined;

  // Validate and clean rating
  const rating = isValidScore(motorbike.rating) ? motorbike.rating : undefined;

  return {
    location: motorbike.location?.trim() || undefined,
    detailLink: validDetailLink || undefined,
    image: validImage || undefined,
    imageAlt: motorbike.imageAlt?.trim() || undefined,
    delivery: motorbike.delivery?.trim() || undefined,
    vehicleType: motorbike.vehicleType?.trim() || undefined,
    provider: motorbike.provider?.trim() || undefined,
    rating: rating !== undefined ? rating : undefined,
    vehicleModels: motorbike.vehicleModels || undefined,
    availability: motorbike.availability?.trim() || undefined,
    pricePerDay: motorbike.pricePerDay?.trim() || undefined,
    price: motorbike.price?.trim() || undefined,
    holidayPrice: motorbike.holidayPrice?.trim() || undefined,
    holidayNote: motorbike.holidayNote?.trim() || undefined,
    vehicles: motorbike.vehicles || undefined,
    lat: formatCoordinate(motorbike.latitude),
    lng: formatCoordinate(motorbike.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

