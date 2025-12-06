import { BaseCrawler } from './baseCrawler';
import { NewsItem } from '../types/crawl';
import { crawlVnExpress } from '../sites/news/vnexpress.site';
import { crawlTuoiTre } from '../sites/news/tuoitre.site';

export class NewsCrawler extends BaseCrawler<NewsItem> {
  constructor() {
    super({
      vnexpress: crawlVnExpress,
      tuoitre: crawlTuoiTre,
    });
  }
}
