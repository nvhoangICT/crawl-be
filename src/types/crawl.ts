export type Category = 'news' | 'hotels' | 'restaurant' | 'attraction' | 'maps' | 'landmarks';

export interface CrawlOptions {
  locale?: string;
  timeout?: number;
  maxPages?: number;
  headless?: boolean;
}

export interface BaseCrawlRequest {
  category: Category;
  site: string;
  url: string;
  /**
   * ID của user thực hiện crawl - dùng để lưu vào crawler_by
   */
  crawledBy?: string;
  /**
   * Tên user/crawler - dùng để lưu vào crawler_name
   */
  crawlerName?: string;
  options?: CrawlOptions;
}

export interface NewsItem {
  title: string;
  summary?: string;
  content: string;
  author?: string;
  publishedAt?: string;
  tags?: string[];
  images?: string[];
}

export interface HotelItem {
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
  starRating?: number;
  ratingDistribution?: {
    five?: number;
    four?: number;
    three?: number;
    two?: number;
    one?: number;
  };
  description?: string;
  openHoursText?: string;
  phone?: string;
  checkInTime?: string;
  checkOutTime?: string;
  priceFrom?: number;
  currency?: string;
  website?: string;
  amenities?: string[];
  images?: string[];
  latitude?: number;
  longitude?: number;
  detailLink?: string;
}

export interface RestaurantItem {
  name: string;
  address?: string;
  province?: string;
  phone?: string;
  mobilePhone?: string;
  email?: string;
  website?: string;
  imageUrl?: string;
  detailLink?: string;
  score?: number; // rating/score
  latitude?: number;
  longitude?: number;
  images?: string[]; // For multiple images if needed
}

export interface AttractionItem {
  name: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  starRating?: number;
  ratingDistribution?: {
    five?: number;
    four?: number;
    three?: number;
    two?: number;
    one?: number;
  };
  description?: string;
  ticketPriceText?: string;
  openHoursText?: string;
  phone?: string;
  checkInTime?: string;
  checkOutTime?: string;
  amenities?: string[];
  images?: string[];
}

export interface MapsItem {
  name: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  starRating?: number;
  ratingDistribution?: {
    five?: number;
    four?: number;
    three?: number;
    two?: number;
    one?: number;
  };
  description?: string;
  ticketPriceText?: string;
  openHoursText?: string;
  phone?: string;
  website?: string;
  checkInTime?: string;
  checkOutTime?: string;
  amenities?: string[];
  images?: string[];
  latitude?: number;
  longitude?: number;
}

export interface LandmarkItem {
  name: string;
  address?: string;
  province?: string;
  phone?: string;
  mobilePhone?: string;
  email?: string;
  website?: string;
  imageUrl?: string;
  detailLink?: string;
  latitude?: number;
  longitude?: number;
}

export type CrawlResultData =
  | NewsItem
  | HotelItem
  | RestaurantItem
  | AttractionItem
  | MapsItem
  | LandmarkItem;

export interface CrawlResponseMeta {
  success: boolean;
  category?: Category;
  site?: string;
  url?: string;
}

export interface CrawlSuccessResponse extends CrawlResponseMeta {
  success: true;
  data: CrawlResultData | CrawlResultData[];
}

export interface CrawlErrorResponse extends CrawlResponseMeta {
  success: false;
  error: string;
  details?: Record<string, unknown>;
}

export type CrawlResponse = CrawlSuccessResponse | CrawlErrorResponse;

// Streaming types
export type StreamEventType = 'progress' | 'data' | 'error' | 'complete';

// Base interface for all stream events - includes requestId to prevent conflicts
export interface BaseStreamEvent {
  requestId: string; // Unique ID for this request to prevent event conflicts
  timestamp: number; // Event timestamp in milliseconds
}

export interface StreamProgressEvent extends BaseStreamEvent {
  type: 'progress';
  message: string;
  progress?: number; // 0-100
}

export interface StreamDataEvent<T extends CrawlResultData = CrawlResultData> extends BaseStreamEvent {
  type: 'data';
  data: T | T[]; // Single item or array of items
  index?: number; // For arrays
  total?: number; // For arrays
}

export interface StreamErrorEvent extends BaseStreamEvent {
  type: 'error';
  error: string;
}

export interface StreamCompleteEvent extends BaseStreamEvent {
  type: 'complete';
  totalItems?: number;
  duration?: number; // milliseconds
}

export type StreamEvent<T extends CrawlResultData = CrawlResultData> =
  | StreamProgressEvent
  | StreamDataEvent<T>
  | StreamErrorEvent
  | StreamCompleteEvent;

// Partial stream event (without requestId and timestamp) - used by handlers
// The wrapper callback will automatically add requestId and timestamp
export type PartialStreamEvent<T extends CrawlResultData = CrawlResultData> =
  | Omit<StreamProgressEvent, 'requestId' | 'timestamp'>
  | Omit<StreamDataEvent<T>, 'requestId' | 'timestamp'>
  | Omit<StreamErrorEvent, 'requestId' | 'timestamp'>
  | Omit<StreamCompleteEvent, 'requestId' | 'timestamp'>;

// Callback for streaming data
// Handlers can send events without requestId/timestamp - wrapper will add them automatically
export type StreamCallback<T extends CrawlResultData = CrawlResultData> = (
  event: StreamEvent<T> | PartialStreamEvent<T>,
  requestId?: string, // Optional requestId - will be added automatically if not provided
) => void | Promise<void>;
