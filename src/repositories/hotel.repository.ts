import { logger } from '../utils/logger';
import {
  HotelLike,
} from './mappers/hotel.mapper';

export class HotelRepository {
  constructor() {
    // Database configuration removed
  }

  async upsertByDetailLink(hotel: HotelLike, detailLink: string, sourceSite: string): Promise<number> {
    // Database persistence disabled
    logger.warn('Database persistence is disabled. Hotel data not saved.', { 
      detailLink,
      sourceSite,
      hotelName: hotel.name 
    });
    return 0;
  }
}
