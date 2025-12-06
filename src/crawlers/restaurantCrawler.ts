import { BaseCrawler } from './baseCrawler';
import { RestaurantItem } from '../types/crawl';
import { crawlFoody } from '../sites/restaurant/foody.site';
import { crawlGoogleMapsRestaurant, crawlGoogleMapsListRestaurant } from '../sites/restaurant/googlemaps.site';

export class RestaurantCrawler extends BaseCrawler<RestaurantItem> {
  constructor() {
    super({
      foody: crawlFoody,
      googlemaps: crawlGoogleMapsRestaurant,
    },
    {
      googlemaps: crawlGoogleMapsListRestaurant,
    });
  }
}
