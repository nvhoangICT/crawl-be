import { Page } from 'playwright';
import { RestaurantItem } from '../../types/crawl';

export async function crawlFoody(page: Page): Promise<RestaurantItem> {
  const name = (await page.textContent('.main-info-title'))?.trim() || 'Unknown restaurant';
  const address = (await page.textContent('.res-common-add'))?.trim() || 'Unknown address';
  const ratingText = (await page.textContent('.microsite-point-avg'))?.trim();
  const priceRange = (await page.textContent('.res-common-minmaxprice span'))?.trim();
  const cuisine = await page.locator('.res-info-breakingnoti .category').allInnerTexts();
  const openHoursText = (await page.textContent('.res-common-hours'))?.trim();
  const phone = (await page.textContent('.res-common-phone a'))?.trim();
  const images = await page.locator('.picture-list img[src]').allAttributeValues('src');

  return {
    name,
    address,
    rating: ratingText ? Number(ratingText) : undefined,
    priceRange,
    cuisine: cuisine?.map((item) => item.trim()).filter(Boolean),
    openHoursText,
    phone,
    images,
  };
}
