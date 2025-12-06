import { RestaurantItem } from '../../types/crawl';

export interface RestaurantCreateRequest {
  name: string;
  address?: string;
  province?: string;
  phone?: string | null;
  mobilePhone?: string | null;
  email?: string | null;
  website?: string;
  imageUrl?: string;
  detailLink?: string;
  score?: number | null;
  lat?: string;
  lng?: string;
  crawledBy?: string;
  crawlerName?: string;
}

// Validation patterns matching backend DTO
const PHONE_PATTERN = /^\+?[0-9\-\s]*$/;
const URL_PATTERN = /^(https?|ftp):\/\/[^\s\/$.?#].[^\s]*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidPhone(phone?: string): boolean {
  if (!phone) return false;
  return PHONE_PATTERN.test(phone.trim());
}

function isValidUrl(url?: string): boolean {
  if (!url) return false;
  return URL_PATTERN.test(url.trim());
}

function isValidEmail(email?: string): boolean {
  if (!email) return false;
  return EMAIL_PATTERN.test(email.trim());
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

export function mapRestaurantItemToApiRequest(
  restaurant: RestaurantItem,
  detailLink: string,
  crawledBy?: string,
  crawlerName?: string,
): RestaurantCreateRequest {
  const name = restaurant.name?.trim();
  const safeName = name && name.length > 0 ? name : 'Unknown restaurant';

  // Validate and clean phone
  const phone = restaurant.phone?.trim();
  const validPhone = phone && isValidPhone(phone) ? phone : undefined;

  // Validate and clean mobilePhone
  const mobilePhone = restaurant.mobilePhone?.trim();
  const validMobilePhone = mobilePhone && isValidPhone(mobilePhone) ? mobilePhone : undefined;

  // Validate and clean email
  const email = restaurant.email?.trim();
  const validEmail = email && isValidEmail(email) ? email : undefined;

  // Validate and clean website
  const website = restaurant.website?.trim();
  const validWebsite = website && isValidUrl(website) ? website : undefined;

  // Validate and clean imageUrl
  const imageUrl = restaurant.imageUrl?.trim();
  const validImageUrl = imageUrl && isValidUrl(imageUrl) ? imageUrl : undefined;

  // Validate and clean detailLink
  const validDetailLink = detailLink && isValidUrl(detailLink) ? detailLink : undefined;

  // Validate and clean score (must be between 0.0 and 5.0)
  const score = isValidScore(restaurant.score) ? restaurant.score : undefined;

  return {
    name: safeName,
    address: restaurant.address?.trim() || undefined,
    province: restaurant.province?.trim() || undefined,
    phone: validPhone || null,
    mobilePhone: validMobilePhone || null,
    email: validEmail || null,
    website: validWebsite || undefined,
    imageUrl: validImageUrl || undefined,
    detailLink: validDetailLink || undefined,
    score: score !== undefined ? score : null,
    lat: formatCoordinate(restaurant.latitude),
    lng: formatCoordinate(restaurant.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

