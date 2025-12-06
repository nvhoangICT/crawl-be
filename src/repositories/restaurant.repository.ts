import { logger } from '../utils/logger';
import {
  RestaurantLike,
} from './mappers/restaurant.mapper';

export class RestaurantRepository {
  constructor() {
    // Database configuration removed
  }

  async upsertByDetailLink(restaurant: RestaurantLike, detailLink: string): Promise<number> {
    // Database persistence disabled
    logger.warn('Database persistence is disabled. Restaurant data not saved.', { 
      detailLink,
      restaurantName: restaurant.name 
    });
    return 0;
  }
}

