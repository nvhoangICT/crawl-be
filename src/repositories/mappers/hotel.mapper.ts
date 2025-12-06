import { HotelItem, MapsItem } from '../../types/crawl';

export type HotelLike = Partial<HotelItem> & Partial<MapsItem> & {
  name?: string;
  address?: string;
};

export interface HotelRow {
  name: string;
  accommodation_type: string | null;
  rating: string | null;
  address: string | null;
  province: string | null;
  phone: string | null;
  price: string | null;
  website: string | null;
  image_url: string | null;
  detail_link: string;
  services: string | null;
  images: string | null;
  scores: string | null;
  rating_value: number | null;
  description: string | null;
  distance_to_center: string | null;
  lat: string | null;
  lng: string | null;
  crawled_at: Date;
}

export function mapHotelLikeToRow(
  hotel: HotelLike,
  detailLink: string,
  sourceSite: string,
): HotelRow {
  const name = hotel.name?.trim();
  const safeName = name && name.length > 0 ? name : 'Unknown hotel';

  const ratingValue = typeof hotel.rating === 'number' && Number.isFinite(hotel.rating)
    ? Number(hotel.rating.toFixed(2))
    : null;

  const priceText = formatPrice(hotel.priceFrom, hotel.currency ?? deriveCurrencyFromPriceText(hotel.priceFrom));
  const services = hotel.amenities?.length ? hotel.amenities.map((item) => item.trim()).join(', ') : null;
  const imagesJson = hotel.images?.length ? JSON.stringify(hotel.images) : null;
  const firstImage = hotel.images?.find((src) => Boolean(src?.trim())) ?? null;

  // Only use website from crawl data, do not extract from URL for Google Maps
  // For Google Maps, we only want the actual website (e.g., facebook.com) from div.AeaXub, not the Google Maps link
  const website = hotel.website?.trim() || (sourceSite !== 'googlemaps' ? extractWebsite(detailLink, sourceSite) : null);
  const province = extractProvince(hotel.address);
  const distanceToCenter = ('distance_to_center' in hotel && typeof (hotel as any).distance_to_center === 'string')
    ? (hotel as any).distance_to_center
    : null;
  const lat = formatCoordinate(hotel.latitude);
  const lng = formatCoordinate(hotel.longitude);

  return {
    name: safeName,
    accommodation_type: sourceSite || 'hotel',
    rating: ratingValue !== null ? ratingValue.toString() : null,
    address: hotel.address ?? null,
    province,
    phone: hotel.phone ?? null,
    price: priceText,
    website,
    image_url: firstImage,
    detail_link: detailLink,
    services,
    images: imagesJson,
    scores: typeof hotel.reviewCount === 'number' ? hotel.reviewCount.toString() : null,
    rating_value: ratingValue,
    description: hotel.description ?? null,
    distance_to_center: distanceToCenter,
    lat,
    lng,
    crawled_at: new Date(),
  };
}

function extractWebsite(detailLink: string, sourceSite?: string): string | null {
  try {
    const parsed = new URL(detailLink);
    
    // For Google Maps, normalize URL to remove data parameter and query params
    // Example: https://www.google.com/maps/place/.../@21.853082,106.7689748,16z/data=!4m... 
    // Should become: https://www.google.com/maps/place/.../@21.853082,106.7689748,16z
    if (sourceSite === 'googlemaps' || (parsed.hostname.includes('google.com') && parsed.pathname.includes('/maps/'))) {
      // Remove /data=... from pathname if present
      let cleanPath = parsed.pathname;
      const dataIndex = cleanPath.indexOf('/data=');
      if (dataIndex !== -1) {
        cleanPath = cleanPath.substring(0, dataIndex);
      }
      
      // Find the /@ coordinate marker
      const atIndex = cleanPath.indexOf('/@');
      if (atIndex !== -1) {
        // Extract everything from start to /@
        const beforeAt = cleanPath.substring(0, atIndex + 2); // Include '/@'
        // Find where coordinates end (next '/' or end of string)
        const afterAt = cleanPath.substring(atIndex + 2);
        const coordEndIndex = afterAt.indexOf('/');
        const coordinates = coordEndIndex !== -1 
          ? afterAt.substring(0, coordEndIndex)
          : afterAt;
        
        // Verify coordinates look valid (numbers, dots, commas, dashes, optional 'z')
        if (coordinates && /^[\d.,-]+z?$/.test(coordinates)) {
          // Return URL with base path and coordinates
          return `${parsed.protocol}//${parsed.hostname}${beforeAt}${coordinates}`;
        }
      }
      
      // If no coordinate pattern found, return pathname without query params and data parameter
      return `${parsed.protocol}//${parsed.hostname}${cleanPath}`;
    }
    
    // For other sites, return full URL without query parameters
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function extractProvince(address?: string): string | null {
  if (!address) {
    return null;
  }
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  return parts[parts.length - 1];
}

function formatPrice(priceFrom?: number, currency?: string | null): string | null {
  if (typeof priceFrom !== 'number' || !Number.isFinite(priceFrom)) {
    return null;
  }
  const normalized = priceFrom % 1 === 0 ? priceFrom.toFixed(0) : priceFrom.toFixed(2);
  return currency ? `${normalized} ${currency}` : normalized;
}

function deriveCurrencyFromPriceText(priceFrom?: number): string | null {
  if (!priceFrom) return null;
  return 'VND'; // default fallback
}

function formatCoordinate(value?: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value.toString();
}
