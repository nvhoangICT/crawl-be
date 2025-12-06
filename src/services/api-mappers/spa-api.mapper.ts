export interface SpaCreateRequest {
  name: string;
  address?: string;
  province?: string;
  phone?: string;
  mobilePhone?: string;
  email?: string;
  website?: string;
  imageUrl?: string;
  detailLink?: string;
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

function formatCoordinate(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value.toString();
}

export type SpaLike = {
  name?: string;
  address?: string;
  province?: string;
  phone?: string;
  mobilePhone?: string;
  email?: string;
  website?: string;
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
};

export function mapSpaLikeToApiRequest(
  spa: SpaLike,
  detailLink: string,
  crawledBy?: string,
  crawlerName?: string,
): SpaCreateRequest {
  const name = spa.name?.trim();
  const safeName = name && name.length > 0 ? name : 'Unknown spa';

  // Validate and clean phone
  const phone = spa.phone?.trim();
  const validPhone = phone && isValidPhone(phone) ? phone : undefined;

  // Validate and clean mobilePhone
  const mobilePhone = spa.mobilePhone?.trim();
  const validMobilePhone = mobilePhone && isValidPhone(mobilePhone) ? mobilePhone : undefined;

  // Validate and clean email
  const email = spa.email?.trim();
  const validEmail = email && isValidEmail(email) ? email : undefined;

  // Validate and clean website
  const website = spa.website?.trim();
  const validWebsite = website && isValidUrl(website) ? website : undefined;

  // Validate and clean imageUrl
  const imageUrl = spa.imageUrl?.trim();
  const validImageUrl = imageUrl && isValidUrl(imageUrl) ? imageUrl : undefined;

  // Validate and clean detailLink
  const validDetailLink = detailLink && isValidUrl(detailLink) ? detailLink : undefined;

  return {
    name: safeName,
    address: spa.address?.trim() || undefined,
    province: spa.province?.trim() || undefined,
    phone: validPhone || undefined,
    mobilePhone: validMobilePhone || undefined,
    email: validEmail || undefined,
    website: validWebsite || undefined,
    imageUrl: validImageUrl || undefined,
    detailLink: validDetailLink || undefined,
    lat: formatCoordinate(spa.latitude),
    lng: formatCoordinate(spa.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

