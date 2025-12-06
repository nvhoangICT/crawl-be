import { BaseCrawler } from './baseCrawler';
import { AttractionItem } from '../types/crawl';
import { crawlTripAdvisor } from '../sites/attraction/tripadvisor.site';

export class AttractionCrawler extends BaseCrawler<AttractionItem> {
  constructor() {
    super({
      tripadvisor: crawlTripAdvisor,
    });
  }
}
