import { LandmarkItem } from '../../types/crawl';

export interface LandmarkRow {
  name: string;
  address: string | null;
  province: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  website: string | null;
  image_url: string | null;
  detail_link: string;
  crawled_at: Date;
  lat: string | null;
  lng: string | null;
}

function formatCoordinate(value?: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value.toString();
}

export function mapLandmarkItemToRow(
  landmark: LandmarkItem,
  detailLink: string,
): LandmarkRow {
  const name = landmark.name?.trim();
  const safeName = name && name.length > 0 ? name : 'Unknown landmark';

  return {
    name: safeName,
    address: landmark.address?.trim() || null,
    province: landmark.province?.trim() || null,
    phone: landmark.phone?.trim() || null,
    mobile_phone: landmark.mobilePhone?.trim() || null,
    email: landmark.email?.trim() || null,
    website: landmark.website?.trim() || null,
    image_url: landmark.imageUrl?.trim() || null,
    detail_link: detailLink,
    crawled_at: new Date(),
    lat: formatCoordinate(landmark.latitude),
    lng: formatCoordinate(landmark.longitude),
  };
}

// Export type alias for consistency with hotel mapper
export type LandmarkLike = LandmarkItem;

