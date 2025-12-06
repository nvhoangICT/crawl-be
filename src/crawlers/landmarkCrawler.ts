import { BaseCrawler } from './baseCrawler';
import { LandmarkItem } from '../types/crawl';
import { crawlGoogleMapsLandmark } from '../sites/landmarks/googlemaps.site';

export class LandmarkCrawler extends BaseCrawler<LandmarkItem> {
  constructor() {
    super({
      googlemaps: crawlGoogleMapsLandmark,
    });
  }
}

