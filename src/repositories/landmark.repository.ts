import { logger } from '../utils/logger';
import {
  LandmarkLike,
} from './mappers/landmark.mapper';

export class LandmarkRepository {
  constructor() {
    // Database configuration removed
  }

  async upsertByDetailLink(landmark: LandmarkLike, detailLink: string): Promise<number> {
    // Database persistence disabled
    logger.warn('Database persistence is disabled. Landmark data not saved.', { 
      detailLink,
      landmarkName: landmark.name 
    });
    return 0;
  }
}

