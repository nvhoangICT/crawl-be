import { Page } from 'playwright';
import { HotelItem, CrawlOptions, StreamCallback } from '../../types/crawl';

interface TextOptions {
  skipValues?: string[];
}

async function getFirstText(
  page: Page,
  selectors: string[],
  options?: TextOptions,
): Promise<string | undefined> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.count()) {
        const text = await locator.textContent();
        const normalized = text?.trim();
        if (normalized) {
          const skip = options?.skipValues?.some(
            (value) => normalized.toLowerCase() === value.trim().toLowerCase(),
          );
          if (skip) {
            continue;
          }
          return normalized;
        }
      }
    } catch {
      // Keep trying with the next selector
    }
  }
  return undefined;
}

function normalizeNumber(text?: string): number | undefined {
  if (!text) return undefined;
  const numeric = text.replace(/[^0-9.,]/g, '').replace(',', '.');
  const value = Number(numeric);
  return Number.isFinite(value) ? value : undefined;
}

async function collectImages(page: Page): Promise<string[]> {
  const imageUrls = new Set<string>();
  
  try {
    // Try to find and click the gallery/view more images button
    const galleryButtonSelectors = [
      'button:has-text("Xem tất cả ảnh")',
      'button:has-text("View all photos")',
      'button:has-text("Xem thêm")',
      'a:has-text("Xem tất cả ảnh")',
      'a:has-text("View all photos")',
      '.hotel-image-gallery button',
      '.gallery-view-more',
    ];

    let galleryOpened = false;
    for (const selector of galleryButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.count() > 0) {
          await button.click({ timeout: 5000 });
          await page.waitForTimeout(2000);
          galleryOpened = true;
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    // Collect images from various selectors
    const imageSelectors = [
      '.hotel-image-single img',
      '.hotel-image-gallery img',
      '.gallery img',
      '.hotel-photos img',
      'img[src*="klook"]',
      'img[data-src*="klook"]',
    ];

    for (const selector of imageSelectors) {
      try {
        const images = await page.locator(selector).all();
        for (const img of images) {
          const src = await img.getAttribute('src');
          const dataSrc = await img.getAttribute('data-src');
          const imageUrl = src || dataSrc;
          
          if (imageUrl && imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
            // Remove query parameters for cleaner URLs
            const cleanUrl = imageUrl.split('?')[0];
            imageUrls.add(cleanUrl);
          }
        }
      } catch {
        // Continue to next selector
      }
    }

    // If gallery was opened, try to close it
    if (galleryOpened) {
      try {
        const closeButton = page.locator('button[aria-label*="Close"], button[aria-label*="Đóng"], .close-button').first();
        if (await closeButton.count() > 0) {
          await closeButton.click({ timeout: 2000 });
        }
      } catch {
        // Ignore if close button not found
      }
    }
  } catch (error) {
    // If there's an error, at least return what we've collected so far
    console.error('Error collecting images', error);
  }

  return Array.from(imageUrls);
}

export async function crawlKlook(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForSelector('.hotel-card, .hotel-info-name, h1, h2, h3', { timeout: 15000 }).catch(() => null);

  onStream?.({
    type: 'progress',
    message: 'Page loaded, extracting Klook hotel data...',
    progress: 60,
  });

  // Extract hotel name
  const name = await getFirstText(page, [
    '.hotel-info-name h3',
    '.hotel-info-name h1',
    '.hotel-name-section h1',
    '.hotel-name-section h3',
    'h1.prefix',
    'h3.prefix',
    '.hotel-card .hotel-info-name',
    'h1',
    'h2',
  ]) || 'Unknown hotel';

  // Extract address/location
  const address = await getFirstText(page, [
    '.hotel-location .text',
    '.hotel-location',
    '.hotel-address',
    '[data-testid="address"]',
    '.location-text',
  ]) || 'Unknown address';

  // Clean address - remove "Xem bản đồ" text
  const cleanAddress = address.replace(/\s*Xem bản đồ\s*/i, '').trim();

  // Extract rating
  let rating: number | undefined;
  const ratingText = await getFirstText(page, [
    '.hotel-review-score',
    '.hotel-rating',
    '.review-score',
    '[data-testid="rating"]',
  ]);
  if (ratingText) {
    rating = normalizeNumber(ratingText);
  }

  // Extract review count
  let reviewCount: number | undefined;
  const reviewCountText = await getFirstText(page, [
    '.hotel-review-count',
    '.review-count',
    '[data-testid="review-count"]',
  ]);
  if (reviewCountText) {
    const countMatch = reviewCountText.match(/[\d,]+/);
    if (countMatch) {
      reviewCount = parseInt(countMatch[0].replace(/,/g, ''), 10);
    }
  }

  // Extract review description
  const reviewDesc = await getFirstText(page, [
    '.hotel-review-desc',
    '.review-description',
  ]);

  // Extract price
  let priceFrom: number | undefined;
  let currency: string | undefined;
  const priceText = await getFirstText(page, [
    '.price-sale .price-amount',
    '.price-amount',
    '.hotel-price',
    '[data-testid="price"]',
  ]);
  if (priceText) {
    priceFrom = normalizeNumber(priceText);
    // Try to detect currency
    const currencySymbol = await getFirstText(page, [
      '.price-sale i',
      '.price-currency',
      '.currency-symbol',
    ]);
    if (currencySymbol) {
      if (currencySymbol.includes('₫') || currencySymbol.includes('VND')) {
        currency = 'VND';
      } else if (currencySymbol.includes('$') || currencySymbol.includes('USD')) {
        currency = 'USD';
      } else if (currencySymbol.includes('€') || currencySymbol.includes('EUR')) {
        currency = 'EUR';
      }
    }
    // Default to VND if not detected
    if (!currency) {
      currency = 'VND';
    }
  }

  // Extract date tip/price note
  const dateTip = await getFirstText(page, [
    '.date-tip',
    '.price-note',
    '.price-date-info',
  ]);

  // Extract tags/amenities
  const amenities: string[] = [];
  try {
    const tagElements = await page.locator('.hotel-tag-wrap .tag-content, .hotel-tag-section .tag-content, .amenity-item, .facility-item').all();
    for (const element of tagElements) {
      const text = await element.textContent();
      if (text?.trim()) {
        amenities.push(text.trim());
      }
    }
  } catch {
    // No amenities found
  }

  // Extract description
  const description = await getFirstText(page, [
    '.hotel-description',
    '.description',
    '.hotel-detail-description',
    '[data-testid="description"]',
  ]);

  // Extract check-in/check-out times
  let checkInTime: string | undefined;
  let checkOutTime: string | undefined;
  const checkInOutText = await getFirstText(page, [
    '.check-in-out',
    '.hotel-check-time',
    '[data-testid="check-in-out"]',
  ]);
  if (checkInOutText) {
    const checkInMatch = checkInOutText.match(/Check-in[:\s]+(.+?)(?=Check-out|$)/i);
    const checkOutMatch = checkInOutText.match(/Check-out[:\s]+(.+?)$/i);
    if (checkInMatch) checkInTime = checkInMatch[1].trim();
    if (checkOutMatch) checkOutTime = checkOutMatch[1].trim();
  }

  // Extract phone number
  const phone = await getFirstText(page, [
    '.hotel-phone',
    '.phone-number',
    '[data-testid="phone"]',
    'a[href^="tel:"]',
  ]);
  // Clean phone number if it's from a tel: link
  const cleanPhone = phone?.replace(/^tel:/i, '').trim();

  // Extract star rating
  let starRating: number | undefined;
  const starRatingText = await getFirstText(page, [
    '.hotel-star',
    '.star-rating',
    '[data-testid="star-rating"]',
  ]);
  if (starRatingText) {
    const starMatch = starRatingText.match(/(\d+)[-\s]*star/i);
    if (starMatch) {
      starRating = parseInt(starMatch[1], 10);
    }
  }

  // Collect images
  const images = await collectImages(page);

  const result: HotelItem = {
    name,
    address: cleanAddress,
    rating,
    reviewCount,
    starRating,
    description,
    checkInTime,
    checkOutTime,
    phone: cleanPhone,
    priceFrom,
    currency,
    amenities: amenities.length > 0 ? amenities : undefined,
    images: images.length > 0 ? images : undefined,
  };

  onStream?.({
    type: 'data',
    data: result,
  });

  return result;
}

