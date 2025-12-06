import { BaseCrawler } from './baseCrawler';
import { MapsItem } from '../types/crawl';
import { crawlGoogleMaps } from '../sites/maps/googlemaps.site';

export class MapsCrawler extends BaseCrawler<MapsItem> {
  constructor() {
    super({
      googlemaps: crawlGoogleMaps,
    });
  }
}

