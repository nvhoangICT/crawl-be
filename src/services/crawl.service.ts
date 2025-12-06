import { AttractionCrawler } from '../crawlers/attractionCrawler';
import { HotelCrawler } from '../crawlers/hotelCrawler';
import { NewsCrawler } from '../crawlers/newsCrawler';
import { RestaurantCrawler } from '../crawlers/restaurantCrawler';
import { MapsCrawler } from '../crawlers/mapsCrawler';
import { LandmarkCrawler } from '../crawlers/landmarkCrawler';
import { PersistenceService } from './persistence.service';
import {
  BaseCrawlRequest,
  Category,
  CrawlResultData,
  StreamCallback,
} from '../types/crawl';

export class CrawlService {
  private readonly crawlers: Record<Category, NewsCrawler | HotelCrawler | RestaurantCrawler | AttractionCrawler | MapsCrawler | LandmarkCrawler> = {
    news: new NewsCrawler(),
    hotels: new HotelCrawler(),
    restaurant: new RestaurantCrawler(),
    attraction: new AttractionCrawler(),
    maps: new MapsCrawler(),
    landmarks: new LandmarkCrawler(),
  };

  private readonly persistenceService = new PersistenceService();

  getSupportedCategories(): Category[] {
    return Object.keys(this.crawlers) as Category[];
  }

  async crawl(
    request: BaseCrawlRequest,
    onStream?: StreamCallback,
  ): Promise<CrawlResultData | CrawlResultData[]> {
    const crawler = this.crawlers[request.category];
    if (!crawler) {
      throw new Error(`Unsupported category '${request.category}'`);
    }

    const data = await crawler.crawl(request, onStream);
    await this.persistenceService.persist(request, data);
    return data;
  }

  async crawlList(
    request: BaseCrawlRequest,
    onStream?: StreamCallback,
  ): Promise<CrawlResultData[]> {
    const crawler = this.crawlers[request.category];
    if (!crawler) {
      throw new Error(`Unsupported category '${request.category}'`);
    }

    const data = await crawler.crawlList(request, onStream);
    return data;
  }

  async crawlDetail(
    request: BaseCrawlRequest,
    onStream?: StreamCallback,
  ): Promise<CrawlResultData> {
    const crawler = this.crawlers[request.category];
    if (!crawler) {
      throw new Error(`Unsupported category '${request.category}'`);
    }

    const data = await crawler.crawlDetail(request, onStream);
    await this.persistenceService.persist(request, data);
    return data;
  }
}
