import { Page } from 'playwright';
import { AttractionItem } from '../../types/crawl';

export async function crawlTripAdvisor(page: Page): Promise<AttractionItem> {
  const name = (await page.textContent('h1'))?.trim() || 'Unknown attraction';
  const address = (await page.textContent('[data-test-target="nav-impression"]'))?.trim();
  const ratingText = (await page.getAttribute('[data-test-target="review-rating"] svg', 'aria-label')) ?? undefined;
  const reviewCountText = (await page.textContent('[data-test-target="review-count"]'))?.replace(/[^0-9]/g, '');
  const description = (await page.textContent('[data-test-target="taLnk"]'))?.trim();
  const ticketPriceText = (await page.textContent('[data-test-target="ticket-price"]'))?.trim();
  const openHoursText = (await page.textContent('[data-test-target="open-close-times"]'))?.trim();
  const images = await page.locator('picture img[srcset]').allAttributeValues('src');

  return {
    name,
    address,
    rating: ratingText ? Number(ratingText.replace(/[^0-9.]/g, '')) : undefined,
    reviewCount: reviewCountText ? Number(reviewCountText) : undefined,
    description,
    ticketPriceText,
    openHoursText,
    images,
  };
}
