import { HotelItem, MapsItem } from '../../types/crawl';

export type HotelLike = Partial<HotelItem> & Partial<MapsItem> & {
  name?: string;
  address?: string;
};

export interface HotelCreateRequest {
  name: string;
  accommodationType?: string;
  rating?: string;
  address?: string;
  province?: string;
  phone?: string;
  mobilePhone?: string;
  fax?: string;
  email?: string;
  website?: string;
  roomCount?: number;
  rooms?: any; // JSON node
  price?: string;
  imageUrl?: string;
  detailLink?: string;
  services?: string;
  images?: any; // JSON node
  scores?: string;
  ratingLocation?: number;
  ratingValue?: number;
  ratingComfort?: number;
  ratingFacilities?: number;
  ratingStaff?: number;
  ratingCleanliness?: number;
  description?: string;
  distanceToCenter?: string;
  lat?: string;
  lng?: string;
  crawledBy?: string;
  crawlerName?: string;
}

function extractProvince(address?: string): string | undefined {
  if (!address) {
    return undefined;
  }
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return parts[parts.length - 1];
}

function formatPrice(priceFrom?: number, currency?: string | null): string | undefined {
  if (typeof priceFrom !== 'number' || !Number.isFinite(priceFrom)) {
    return undefined;
  }
  const normalized = priceFrom % 1 === 0 ? priceFrom.toFixed(0) : priceFrom.toFixed(2);
  return currency ? `${normalized} ${currency}` : normalized;
}

function extractWebsite(detailLink: string, sourceSite?: string): string | undefined {
  try {
    const parsed = new URL(detailLink);
    
    // For Google Maps, normalize URL to remove data parameter and query params
    if (sourceSite === 'googlemaps' || (parsed.hostname.includes('google.com') && parsed.pathname.includes('/maps/'))) {
      let cleanPath = parsed.pathname;
      const dataIndex = cleanPath.indexOf('/data=');
      if (dataIndex !== -1) {
        cleanPath = cleanPath.substring(0, dataIndex);
      }
      
      const atIndex = cleanPath.indexOf('/@');
      if (atIndex !== -1) {
        const beforeAt = cleanPath.substring(0, atIndex + 2);
        const afterAt = cleanPath.substring(atIndex + 2);
        const coordEndIndex = afterAt.indexOf('/');
        const coordinates = coordEndIndex !== -1 
          ? afterAt.substring(0, coordEndIndex)
          : afterAt;
        
        if (coordinates && /^[\d.,-]+z?$/.test(coordinates)) {
          return `${parsed.protocol}//${parsed.hostname}${beforeAt}${coordinates}`;
        }
      }
      
      return `${parsed.protocol}//${parsed.hostname}${cleanPath}`;
    }
    
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

export function mapHotelLikeToApiRequest(
  hotel: HotelLike,
  detailLink: string,
  sourceSite: string,
  crawledBy?: string,
  crawlerName?: string,
): HotelCreateRequest {
  const name = hotel.name?.trim();
  const safeName = name && name.length > 0 ? name : 'Unknown hotel';

  const ratingValue = typeof hotel.rating === 'number' && Number.isFinite(hotel.rating)
    ? Number(hotel.rating.toFixed(2))
    : undefined;

  const priceText = formatPrice(hotel.priceFrom, hotel.currency ?? 'VND');
  const services = hotel.amenities?.length ? hotel.amenities.map((item) => item.trim()).join(', ') : undefined;
  const imagesArray = hotel.images?.length ? hotel.images.filter((src) => Boolean(src?.trim())) : undefined;
  const firstImage = imagesArray?.[0];

  const website = hotel.website?.trim() || (sourceSite !== 'googlemaps' ? extractWebsite(detailLink, sourceSite) : undefined);
  const province = extractProvince(hotel.address);
  const distanceToCenter = ('distance_to_center' in hotel && typeof (hotel as any).distance_to_center === 'string')
    ? (hotel as any).distance_to_center
    : undefined;

  return {
    name: safeName,
    accommodationType: (sourceSite === 'googlemaps' && hotel.accommodationType) 
      ? hotel.accommodationType 
      : (sourceSite || 'hotel'),
    rating: ratingValue !== undefined ? ratingValue.toString() : undefined,
    address: hotel.address ?? undefined,
    province,
    phone: hotel.phone ?? undefined,
    website,
    price: priceText,
    imageUrl: firstImage,
    detailLink,
    services,
    images: imagesArray,
    scores: typeof hotel.reviewCount === 'number' ? hotel.reviewCount.toString() : undefined,
    ratingValue,
    description: hotel.description ?? undefined,
    distanceToCenter,
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}
