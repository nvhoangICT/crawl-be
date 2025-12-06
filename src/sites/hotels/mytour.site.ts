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
  const numeric = text.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const value = Number(numeric);
  return Number.isFinite(value) ? value : undefined;
}

function extractCoordinatesFromUrl(url: string): { latitude?: number; longitude?: number } {
  try {
    const match = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) || 
                  url.match(/q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (match) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      return {
        latitude: Number.isFinite(latitude) ? latitude : undefined,
        longitude: Number.isFinite(longitude) ? longitude : undefined,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return {};
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
      '.gallery-view-more',
      '[data-testid="view-all-photos"]',
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
      '#id-hotel-detail img',
      '.hotel-gallery img',
      '.gallery img',
      '.hotel-photos img',
      'img[src*="mytour"]',
      'img[data-src*="mytour"]',
      '.lazyload-wrapper img',
    ];

    for (const selector of imageSelectors) {
      try {
        const images = await page.locator(selector).all();
        for (const img of images) {
          const src = await img.getAttribute('src');
          const dataSrc = await img.getAttribute('data-src');
          const imageUrl = src || dataSrc;
          
          if (imageUrl && !imageUrl.startsWith('data:')) {
            // Convert relative URLs to absolute
            const cleanUrl = imageUrl.startsWith('http') 
              ? imageUrl.split('?')[0]
              : `https://mytour.vn${imageUrl.split('?')[0]}`;
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
        const closeButton = page.locator('button[aria-label*="Close"], button[aria-label*="Đóng"], .close-button, [data-testid="close-gallery"]').first();
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

export async function crawlMytour(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  
  // Wait for either detail page container or listing page items
  await page.waitForSelector('#id-hotel-detail, .item-hotel-listing, h1, h2, h3', { timeout: 15000 }).catch(() => null);

  onStream?.({
    type: 'progress',
    message: 'Page loaded, extracting Mytour hotel data...',
    progress: 60,
  });

  // Check if this is a detail page or listing page
  const isDetailPage = await page.locator('#id-hotel-detail').count() > 0;

  let name: string;
  let address: string;
  let rating: number | undefined;
  let reviewCount: number | undefined;
  let description: string | undefined;
  let checkInTime: string | undefined;
  let checkOutTime: string | undefined;
  let priceFrom: number | undefined;
  let currency: string | undefined;
  let amenities: string[] = [];
  let images: string[] = [];
  let latitude: number | undefined;
  let longitude: number | undefined;

  if (isDetailPage) {
    // Extract from detail page
    await page.waitForTimeout(2000); // Wait for dynamic content

    // Extract hotel name
    name = await getFirstText(page, [
      '#id-hotel-detail h1',
      '#id-hotel-detail h2',
      '[data-testid="hotel-name"]',
      '.hotel-name',
      'h1',
      'h2',
    ]) || 'Unknown hotel';

    // Extract address
    const addressText = await getFirstText(page, [
      '#id-hotel-detail [data-testid="address"]',
      '#id-hotel-detail .address',
      '#id-hotel-detail a[href*="google.com/maps"]',
      '#id-hotel-detail a[href*="maps.app.goo.gl"]',
      '#id-hotel-detail .MuiLink-root',
    ]);

    // Try to find address by label text
    if (!addressText) {
      const addressLabel = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('#id-hotel-detail div, #id-hotel-detail span, #id-hotel-detail p, #id-hotel-detail li'));
        const label = elements.find((el) => /địa\s*chỉ/i.test(el.textContent || ''));
        return label ? label.textContent?.replace(/\s+/g, ' ').trim() : null;
      });
      address = addressLabel || 'Unknown address';
    } else {
      address = addressText;
    }

    // Extract rating and review count
    const ratingInfo = await page.evaluate(() => {
      const root = document.querySelector('#id-hotel-detail') || document;
      const scoreEl = Array.from(root.querySelectorAll('div, span, p, strong'))
        .find((el) => /\b(\d\.?\d?)\b/.test((el.textContent || '').trim()) && /điểm|rating|đánh\s*giá/i.test(el.textContent || ''));
      const scoreText = scoreEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
      
      const reviewEl = Array.from(root.querySelectorAll('div, span, p'))
        .find((el) => /\d+\s*(đánh\s*giá|review)/i.test(el.textContent || ''));
      const reviewText = reviewEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
      
      return { scoreText, reviewText };
    });

    if (ratingInfo.scoreText) {
      const scoreMatch = ratingInfo.scoreText.match(/\b(\d+\.?\d?)\b/);
      if (scoreMatch) {
        rating = parseFloat(scoreMatch[1]);
      }
    }

    if (ratingInfo.reviewText) {
      const reviewMatch = ratingInfo.reviewText.match(/(\d+)/);
      if (reviewMatch) {
        reviewCount = parseInt(reviewMatch[1], 10);
      }
    }

    // Extract description
    const descInfo = await page.evaluate(() => {
      const root = document.querySelector('#id-hotel-detail') || document;
      const headings = Array.from(root.querySelectorAll('h2, h3, h4'));
      const descHeading = headings.find((h) => /(giới thiệu|mô tả|tổng quan)/i.test(h.textContent || ''));
      
      if (descHeading) {
        const section = descHeading.parentElement;
        if (section) {
          const paragraphs = Array.from(section.querySelectorAll('p'))
            .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          return {
            short: paragraphs[0] || '',
            full: paragraphs.join('\n'),
          };
        }
      }
      return { short: '', full: '' };
    });

    description = descInfo.full || descInfo.short;

    // Extract amenities
    const amenitiesData = await page.evaluate(() => {
      const root = document.querySelector('#id-hotel-detail') || document;
      const headings = Array.from(root.querySelectorAll('h2, h3, h4'));
      const amenitiesHeading = headings.find((h) => /(tiện ích|tiện nghi|facilities|amenit)/i.test(h.textContent || ''));
      
      if (amenitiesHeading) {
        const section = amenitiesHeading.parentElement;
        if (section) {
          return Array.from(section.querySelectorAll('li, .MuiChip-label, .chip, .tag'))
            .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        }
      }
      return [];
    });
    amenities = amenitiesData;

    // Extract check-in/check-out times
    const policyInfo = await page.evaluate(() => {
      const root = document.querySelector('#id-hotel-detail') || document;
      const headings = Array.from(root.querySelectorAll('h2, h3, h4'));
      const policyHeading = headings.find((h) => /(chính sách|quy định|policy)/i.test(h.textContent || ''));
      
      if (policyHeading) {
        const section = policyHeading.parentElement;
        if (section) {
          const items = Array.from(section.querySelectorAll('li, p'))
            .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          
          const checkIn = items.find((t) => /(nhận phòng|check\s*in)/i.test(t)) || '';
          const checkOut = items.find((t) => /(trả phòng|check\s*out)/i.test(t)) || '';
          
          return { checkIn, checkOut };
        }
      }
      return { checkIn: '', checkOut: '' };
    });

    checkInTime = policyInfo.checkIn || undefined;
    checkOutTime = policyInfo.checkOut || undefined;

    // Extract coordinates from map links
    const coords = await page.evaluate(() => {
      const root = document.querySelector('#id-hotel-detail') || document;
      const mapLink = root.querySelector('a[href*="maps"], iframe[src*="maps"]');
      const src = mapLink?.getAttribute('href') || mapLink?.getAttribute('src') || '';
      const ll = src.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || src.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (ll) {
        return {
          lat: parseFloat(ll[1]),
          lng: parseFloat(ll[2]),
        };
      }
      return { lat: null, lng: null };
    });

    if (coords.lat && coords.lng) {
      latitude = coords.lat;
      longitude = coords.lng;
    }

    // Collect images
    images = await collectImages(page);

  } else {
    // Extract from listing page (first hotel item)
    const firstHotel = page.locator('.item-hotel-listing').first();
    
    if (await firstHotel.count() > 0) {
      name = await firstHotel.locator('.hotel-name').textContent() || 'Unknown hotel';
      
      let addressText = await firstHotel.locator('.jss418 .jss391').textContent() || '';
      address = addressText.replace(/\s*Xem bản đồ\s*/i, '').trim() || 'Unknown address';

      // Extract rating
      const ratingText = await firstHotel.locator('.jss386 .jss387').textContent();
      if (ratingText) {
        rating = normalizeNumber(ratingText);
      }

      // Extract review count
      const reviewCountText = await firstHotel.locator('.jss386 .jss389').textContent();
      if (reviewCountText) {
        const countMatch = reviewCountText.match(/[\d,]+/);
        if (countMatch) {
          reviewCount = parseInt(countMatch[0].replace(/,/g, ''), 10);
        }
      }

      // Extract price
      const priceText = await firstHotel.locator('.jss445 .jss498').textContent() || 
                       await firstHotel.locator('.jss445 .jss497').textContent();
      if (priceText) {
        priceFrom = normalizeNumber(priceText);
        currency = 'VND'; // Mytour typically uses VND
      }

      // Extract image
      const imgSrc = await firstHotel.locator('.lazyload-wrapper img').getAttribute('src');
      if (imgSrc) {
        const imageUrl = imgSrc.startsWith('http') ? imgSrc : `https://mytour.vn${imgSrc}`;
        images = [imageUrl];
      }

      // Extract amenities/tags
      const tagTexts = await firstHotel.locator('.jss438 .jss439').allTextContents();
      amenities = tagTexts.map(t => t.trim()).filter(Boolean);
    } else {
      name = 'Unknown hotel';
      address = 'Unknown address';
    }
  }

  // Extract phone number (try both detail and listing)
  const phone = await getFirstText(page, [
    '#id-hotel-detail a[href^="tel:"]',
    '.hotel-phone',
    '.phone-number',
    '[data-testid="phone"]',
  ]);
  const cleanPhone = phone?.replace(/^tel:/i, '').trim();

  const result: HotelItem = {
    name: name || 'Unknown hotel',
    address: address || 'Unknown address',
    rating,
    reviewCount,
    description,
    checkInTime,
    checkOutTime,
    phone: cleanPhone,
    priceFrom,
    currency: currency || 'VND',
    amenities: amenities.length > 0 ? amenities : undefined,
    images: images.length > 0 ? images : undefined,
    latitude,
    longitude,
  };

  onStream?.({
    type: 'data',
    data: result,
  });

  return result;
}

