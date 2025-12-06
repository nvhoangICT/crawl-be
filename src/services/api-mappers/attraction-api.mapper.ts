import { AttractionItem } from '../../types/crawl';

export interface AttractionCreateRequest {
  name: string;
  address?: string;
  province?: string;
  phone?: string;
  mobilePhone?: string;
  email?: string;
  website?: string;
  imageUrl?: string;
  detailLink?: string;
  price?: string;
  discount?: number;
  packageName?: string;
  description?: string;
  info?: string;
  images?: any; // JSON node
  score?: number;
  review?: any; // JSON node
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

function isValidDiscount(discount?: number): boolean {
  if (discount === undefined || discount === null) return false;
  return typeof discount === 'number' && !isNaN(discount) && discount >= 0.0 && discount <= 100.0;
}

function formatCoordinate(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value.toString();
}

export function mapAttractionItemToApiRequest(
  attraction: AttractionItem,
  detailLink: string,
  crawledBy?: string,
  crawlerName?: string,
): AttractionCreateRequest {
  const name = attraction.name?.trim();
  const safeName = name && name.length > 0 ? name : 'Unknown attraction';

  // Validate and clean phone
  const phone = attraction.phone?.trim();
  const validPhone = phone && isValidPhone(phone) ? phone : undefined;

  // Validate and clean email
  const email = undefined; // AttractionItem doesn't have email, but keeping for consistency

  // Validate and clean website
  const website = undefined; // AttractionItem doesn't have website, but keeping for consistency

  // Validate and clean imageUrl
  const firstImage = attraction.images?.[0]?.trim();
  const validImageUrl = firstImage && isValidUrl(firstImage) ? firstImage : undefined;

  // Validate and clean detailLink
  const validDetailLink = detailLink && isValidUrl(detailLink) ? detailLink : undefined;

  // Validate and clean score (must be between 0.0 and 5.0)
  const score = isValidScore(attraction.rating) ? attraction.rating : undefined;

  // Extract province from address
  const province = attraction.address
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();

  return {
    name: safeName,
    address: attraction.address?.trim() || undefined,
    province: province || undefined,
    phone: validPhone || undefined,
    website: website || undefined,
    imageUrl: validImageUrl || undefined,
    detailLink: validDetailLink || undefined,
    price: attraction.ticketPriceText?.trim() || undefined,
    description: attraction.description?.trim() || undefined,
    images: attraction.images?.length ? attraction.images : undefined,
    score: score !== undefined ? score : undefined,
    lat: formatCoordinate(attraction.latitude),
    lng: formatCoordinate(attraction.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

