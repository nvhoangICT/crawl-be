import { RestaurantItem } from '../../types/crawl';

export interface RestaurantRow {
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
  score: number | null;
  lat: string | null;
  lng: string | null;
}

function formatCoordinate(value?: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value.toString();
}

export function mapRestaurantItemToRow(
  restaurant: RestaurantItem,
  detailLink: string,
): RestaurantRow {
  const name = restaurant.name?.trim();
  const safeName = name && name.length > 0 ? name : 'Unknown restaurant';

  return {
    name: safeName,
    address: restaurant.address?.trim() || null,
    province: restaurant.province?.trim() || null,
    phone: restaurant.phone?.trim() || null,
    mobile_phone: restaurant.mobilePhone?.trim() || null,
    email: restaurant.email?.trim() || null,
    website: restaurant.website?.trim() || null,
    image_url: restaurant.imageUrl?.trim() || null,
    detail_link: detailLink,
    crawled_at: new Date(),
    score: restaurant.score !== undefined && restaurant.score !== null ? restaurant.score : null,
    lat: formatCoordinate(restaurant.latitude),
    lng: formatCoordinate(restaurant.longitude),
  };
}

// Export type alias for consistency with hotel/landmark mapper
export type RestaurantLike = RestaurantItem;

