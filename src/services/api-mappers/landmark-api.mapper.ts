import { LandmarkItem } from '../../types/crawl';

export interface LandmarkCreateRequest {
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

function formatCoordinate(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value.toString();
}

export function mapLandmarkItemToApiRequest(
  landmark: LandmarkItem,
  detailLink: string,
  crawledBy?: string,
  crawlerName?: string,
): LandmarkCreateRequest {
  const name = landmark.name?.trim();
  const safeName = name && name.length > 0 ? name : 'Unknown landmark';

  return {
    name: safeName,
    address: landmark.address?.trim() || undefined,
    province: landmark.province?.trim() || undefined,
    phone: landmark.phone?.trim() || undefined,
    mobilePhone: landmark.mobilePhone?.trim() || undefined,
    email: landmark.email?.trim() || undefined,
    website: landmark.website?.trim() || undefined,
    imageUrl: landmark.imageUrl?.trim() || undefined,
    detailLink,
    lat: formatCoordinate(landmark.latitude),
    lng: formatCoordinate(landmark.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

