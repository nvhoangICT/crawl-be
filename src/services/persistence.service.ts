import {
  BaseCrawlRequest,
  Category,
  CrawlResultData,
  HotelItem,
  LandmarkItem,
  RestaurantItem,
  MapsItem,
} from '../types/crawl';
import { AdminApiService } from './admin-api.service';
import { logger } from '../utils/logger';

type PersistHandler = (
  request: BaseCrawlRequest,
  data: CrawlResultData,
) => Promise<void>;

export class PersistenceService {
  private readonly adminApiService = new AdminApiService();
  private readonly handlers: Partial<Record<Category, PersistHandler>>;

  constructor() {
    this.handlers = {
      hotels: this.persistHotel.bind(this),
      maps: this.persistHotel.bind(this),
      landmarks: this.persistLandmark.bind(this),
      restaurant: this.persistRestaurant.bind(this),
    };
  }

  async persist(request: BaseCrawlRequest, data: CrawlResultData): Promise<void> {
    const handler = this.handlers[request.category];
    if (!handler) {
      return;
    }

    try {
      await handler(request, data);
    } catch (error) {
      logger.error('Failed to persist crawl result via admin API', {
        category: request.category,
        site: request.site,
        url: request.url,
        error,
      });
    }
  }

  private async persistHotel(
    request: BaseCrawlRequest,
    data: CrawlResultData,
  ): Promise<void> {
    const hotel = data as HotelItem | MapsItem | undefined;
    if (!hotel || typeof hotel !== 'object') {
      logger.warn('Skipping hotel persistence due to invalid payload', {
        category: request.category,
        site: request.site,
      });
      return;
    }

    // Use detailLink from hotel if available, otherwise use request URL
    const detailLink = (hotel as HotelItem).detailLink || request.url;
    
    await this.adminApiService.createHotel(hotel, detailLink, request.site);
  }

  private async persistLandmark(
    request: BaseCrawlRequest,
    data: CrawlResultData,
  ): Promise<void> {
    const landmark = data as LandmarkItem | undefined;
    if (!landmark || typeof landmark !== 'object') {
      logger.warn('Skipping landmark persistence due to invalid payload', {
        category: request.category,
        site: request.site,
      });
      return;
    }

    // Use detailLink from landmark if available, otherwise use request URL
    const detailLink = landmark.detailLink || request.url;
    
    // TODO: Implement logic to get crawledBy UUID and crawlerName from request context or user session
    // For now, hardcoding temporary values
    const crawledBy = '00000000-0000-0000-0000-000000000001'; // TODO: Replace with actual crawler UUID
    const crawlerName = 'default-crawler'; // TODO: Replace with actual crawler name
    
    await this.adminApiService.createLandmark(landmark, detailLink, crawledBy, crawlerName);
  }

  private async persistRestaurant(
    request: BaseCrawlRequest,
    data: CrawlResultData,
  ): Promise<void> {
    const restaurant = data as RestaurantItem | undefined;
    if (!restaurant || typeof restaurant !== 'object') {
      logger.warn('Skipping restaurant persistence due to invalid payload', {
        category: request.category,
        site: request.site,
      });
      return;
    }

    // Use detailLink from restaurant if available, otherwise use request URL
    const detailLink = restaurant.detailLink || request.url;
    
    // TODO: Implement logic to get crawledBy UUID and crawlerName from request context or user session
    // For now, hardcoding temporary values
    const crawledBy = '00000000-0000-0000-0000-000000000001'; // TODO: Replace with actual crawler UUID
    const crawlerName = 'default-crawler'; // TODO: Replace with actual crawler name
    
    await this.adminApiService.createRestaurant(restaurant, detailLink, crawledBy, crawlerName);
  }
}
