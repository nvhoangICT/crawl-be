import { Page } from 'playwright';
import { HotelItem, CrawlOptions, StreamCallback } from '../../types/crawl';
import { logger } from '../../utils/logger';

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

function normalizePhoneNumber(text?: string): string | undefined {
  if (!text) return undefined;
  // Remove icons, emojis, and other non-phone characters
  // Keep only digits, +, -, spaces, parentheses, and dots
  const cleaned = text
    .replace(/[^\d+\-()\s.]/g, '') // Remove all non-phone characters
    .trim();
  return cleaned || undefined;
}

function normalizeWebsite(text?: string): string | undefined {
  if (!text) return undefined;

  // Remove zero-width and leading/trailing whitespace
  const cleaned = text
    .replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, '')
    .replace(/^(?:Trang web|Website):\s*/i, '')
    .trim();

  if (!cleaned) return undefined;

  // Skip values that look like phone numbers
  if (/^[\d\s\+\-\(\)]+$/.test(cleaned)) return undefined;

  const addProtocol = (value: string) =>
    value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;

  const candidates = [cleaned, addProtocol(cleaned)];

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      // Ignore Google-owned helper links; we want the business website
      if (/\.google\./i.test(url.hostname) || url.hostname.endsWith('g.page') || url.hostname.includes('goo.gl')) {
        continue;
      }
      return url.href;
    } catch {
      // Try next candidate
    }
  }

  // Fallback: if it looks like a domain, add protocol
  const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/;
  if (domainPattern.test(cleaned)) {
    return addProtocol(cleaned);
  }

  return undefined;
}

function parsePrice(text?: string): { price?: number; currency?: string } {
  if (!text) return {};
  
  // Common currency symbols and codes
  const currencyPatterns = [
    { symbol: '₫', code: 'VND' },
    { symbol: '$', code: 'USD' },
    { symbol: '€', code: 'EUR' },
    { symbol: '£', code: 'GBP' },
    { symbol: '¥', code: 'JPY' },
    { symbol: '₹', code: 'INR' },
  ];
  
  // Extract currency and find its position
  let currency: string | undefined;
  let currencySymbol: string | undefined;
  let currencyIndex = -1;
  
  for (const pattern of currencyPatterns) {
    const index = text.indexOf(pattern.symbol);
    if (index !== -1) {
      currency = pattern.code;
      currencySymbol = pattern.symbol;
      currencyIndex = index;
      break;
    }
  }
  
  if (currencyIndex === -1) {
    return {};
  }
  
  // Extract only the price part before the currency symbol
  // Take text from start to currency symbol position
  const priceSection = text.substring(0, currencyIndex).trim();
  
  // Extract price number from the section before currency symbol
  // Handle formats like "327.575", "327,575", "Từ 327.575", etc.
  // Remove all non-numeric characters except dots and commas
  let priceText = priceSection
    .replace(/[^\d.,]/g, '') // Keep only digits, dots, and commas
    .replace(/\./g, '') // Remove dots (thousands separator in VND)
    .replace(',', '.'); // Replace comma with dot for decimal
  
  const price = Number(priceText);
  if (!Number.isFinite(price) || price <= 0) {
    return { currency };
  }
  
  return { price, currency };
}

function extractCoordinatesFromUrl(url: string): { latitude?: number; longitude?: number } {
  try {
    const match = url.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (match) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      return {
        latitude: Number.isFinite(latitude) ? latitude : undefined,
        longitude: Number.isFinite(longitude) ? longitude : undefined,
      };
    }
  } catch {
    // Ignore parse errors and fall back to undefined
  }
  return {};
}

function normalizeGoogleImageUrl(url?: string): string | null {
  if (!url || !url.startsWith('http')) {
    return null;
  }
  const withoutQuery = url.split('?')[0];
  if (!withoutQuery.includes('googleusercontent')) {
    return withoutQuery;
  }
  const [base] = withoutQuery.split('=');
  return `${base}=w2048-h2048-k-no`;
}

async function collectImages(page: Page): Promise<string[]> {
  const imageUrls = new Set<string>();
  
  try {
    // Only collect images from the photo gallery/album, not from avatar/hero images on main page
    // Try to find and click the "Photos" button to open the gallery
    // Note: We click buttons to open gallery, but we only collect images from the opened gallery, not from the buttons themselves
    const photoButtonSelectors = [
      'button[jsaction*="pane.wfvdlephoto"]', // Photo grid button
      'button[jsaction*="pane.wfvdle836"]', // Alternative photo button
      'button.aoRNLd[aria-label*="Ảnh"]', // Photo button with Vietnamese label
      'button.aoRNLd[aria-label*="ảnh"]', // Photo button with Vietnamese label (lowercase)
      'button.aoRNLd[jsaction*="pane.wfvdle"]', // Photo button with action
      'button[aria-label*="Photos"]', // Photo button with English label
      'button[aria-label*="ảnh"]', // Photo button
      'button:has-text("Photos")', // Button with "Photos" text
      'button:has-text("Xem tất cả ảnh")', // Button with "View all photos" text (Vietnamese)
      'a[href*="photos"]', // Link to photos
    ];

    let galleryOpened = false;
    for (const selector of photoButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.count() > 0) {
          await button.click({ timeout: 5000 });
          // Wait for gallery to open - look for canvas element or gallery container
          await page.waitForSelector('canvas.aFsglc, div.m6QErb, [role="dialog"]', { timeout: 5000 }).catch(() => null);
          await page.waitForTimeout(2000); // Additional wait for gallery to fully load
          galleryOpened = true;
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (galleryOpened) {
      // Wait for gallery to load
      await page.waitForTimeout(2000);

      // Scroll to load more images (Google Maps lazy loads images)
      let previousImageCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 15;

      while (scrollAttempts < maxScrollAttempts) {
        // Find the gallery container - prioritize div.m6QErb
        const gallerySelectors = [
          'div.m6QErb',
          '[role="dialog"]',
          '[aria-label*="Photos"]',
          '[aria-label*="ảnh"]',
        ];

        let galleryContainer = null;
        for (const selector of gallerySelectors) {
          const container = page.locator(selector).last();
          if (await container.count() > 0) {
            galleryContainer = container;
            break;
          }
        }

        if (galleryContainer) {
          // Scroll within the gallery - scroll to bottom
          await galleryContainer.evaluate((el) => {
            const scrollHeight = el.scrollHeight;
            const clientHeight = el.clientHeight;
            el.scrollTop = scrollHeight - clientHeight;
          });
          await page.waitForTimeout(2000); // Wait for lazy loading

          // Collect images from div.m6QErb container - extract from background-image
          const imageContainers = await page.locator('div.m6QErb div.U39Pmb, div.m6QErb div.Uf0tqf, [role="dialog"] div.U39Pmb, [role="dialog"] div.Uf0tqf').all();
          
          for (const container of imageContainers) {
            try {
              // Get background-image from style attribute
              const style = await container.getAttribute('style');
              if (style) {
                // Extract URL from background-image: url("...")
                const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
                if (urlMatch && urlMatch[1]) {
                  let imageUrl = urlMatch[1];
                  
                  // Remove any query parameters and get base URL
                  const baseUrl = imageUrl.split('?')[0];
                  
                  // Get high quality version
                  let highQualitySrc = baseUrl
                    .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                    .replace(/=s\d+-k-no/, '=s2048-k-no')
                    .replace(/=w\d+-h\d+/, '=w2048-h2048')
                    .replace(/=s\d+/, '=s2048')
                    .replace(/=w\d+/, '=w2048');
                  
                  const normalized = normalizeGoogleImageUrl(highQualitySrc);
                  if (normalized) {
                    imageUrls.add(normalized);
                  }
                }
              }
            } catch {
              // Skip this container if there's an error
            }
          }

          // Collect from img tags in gallery (including those in dialog)
          const galleryImages = await page.locator('[role="dialog"] img[src*="googleusercontent"], div.m6QErb img[src*="googleusercontent"]').all();
          
          for (const img of galleryImages) {
            try {
              const src = await img.getAttribute('src');
              if (src && !src.startsWith('data:') && src.includes('googleusercontent')) {
                // Get high quality version
                let highQualitySrc = src
                  .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                  .replace(/=s\d+-k-no/, '=s2048-k-no')
                  .replace(/=w\d+-h\d+/, '=w2048-h2048')
                  .replace(/=s\d+/, '=s2048')
                  .replace(/=w\d+/, '=w2048');
                
                const normalized = normalizeGoogleImageUrl(highQualitySrc);
                if (normalized) {
                  imageUrls.add(normalized);
                }
              }
            } catch {
              // Skip this image if there's an error
            }
          }

          // Also collect from links with data-photo-index (photo gallery items)
          const photoLinks = await page.locator('a[data-photo-index], div[data-photo-index]').all();
          for (const link of photoLinks) {
            try {
              // Try to get image from nested elements
              const nestedContainers = await link.locator('div[style*="background-image"]').all();
              for (const nested of nestedContainers) {
                const style = await nested.getAttribute('style');
                if (style) {
                  const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
                  if (urlMatch && urlMatch[1]) {
                    let imageUrl = urlMatch[1].split('?')[0];
                    let highQualitySrc = imageUrl
                      .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                      .replace(/=s\d+-k-no/, '=s2048-k-no')
                      .replace(/=w\d+-h\d+/, '=w2048-h2048')
                      .replace(/=s\d+/, '=s2048')
                      .replace(/=w\d+/, '=w2048');
                    const normalized = normalizeGoogleImageUrl(highQualitySrc);
                    if (normalized) {
                      imageUrls.add(normalized);
                    }
                  }
                }
              }
            } catch {
              // Skip this link
            }
          }

          // Check if we've loaded more images
          const currentImageCount = imageUrls.size;
          if (currentImageCount === previousImageCount) {
            // No new images loaded, might have reached the end
            scrollAttempts++;
            if (scrollAttempts >= 3) {
              break; // Stop if no new images after 3 attempts
            }
          } else {
            previousImageCount = currentImageCount;
            scrollAttempts = 0; // Reset counter if we found new images
          }
        } else {
          break; // Gallery container not found
        }
      }

      // Try to close the gallery (optional, doesn't affect results)
      try {
        const closeButton = page.locator('button[aria-label*="Close"], button[aria-label*="Đóng"], button[jsaction*="lightbox.close"]').first();
        if (await closeButton.count() > 0) {
          await closeButton.click({ timeout: 2000 });
        }
      } catch {
        // Ignore if close button not found
      }
    }
    // Note: We don't collect images from main page fallback to avoid getting avatar/hero images
    // Only images from the opened gallery (album) are collected
  } catch (error) {
    // If there's an error, at least return what we've collected so far
    logger.error('Error collecting images', error);
  }

  return Array.from(imageUrls);
}

export async function crawlGoogleMapsHotel(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  const SPONSORED_LABELS = ['được tài trợ', 'sponsored'];

  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => null);

  const name =
    (await getFirstText(
      page,
      ['h1.DUwDvf', 'h1 span', '[data-item-id="title"] span'],
      { skipValues: SPONSORED_LABELS },
    )) ||
    'Unknown location';
  const address = await getFirstText(page, [
    '[data-item-id="address"] .Io6YTe',
    'button[data-item-id="address"] div:last-child',
  ], { skipValues: SPONSORED_LABELS });
  // Rating and review count - try new format first
  // Format 1: "Diamond Westlake Suites 4.4 (925)·4-star hotels" from div.lMbq3e
  const headerRatingText = await getFirstText(page, [
    'div.lMbq3e',
  ]);
  
  let rating: number | undefined;
  let reviewCount: number | undefined;
  let starRating: number | undefined;
  let ratingDistribution: { five?: number; four?: number; three?: number; two?: number; one?: number } | undefined;

  // Parse format: "Diamond Westlake Suites 4.4 (925)·4-star hotels"
  if (headerRatingText) {
    // Extract rating (decimal number like 4.4)
    const ratingMatch = headerRatingText.match(/(\d+\.\d+)/);
    if (ratingMatch) {
      rating = Number(ratingMatch[1]);
    }
    
    // Extract review count (number in parentheses like (925))
    const reviewMatch = headerRatingText.match(/\((\d+)\)/);
    if (reviewMatch) {
      reviewCount = Number(reviewMatch[1]);
    }
    
    // Extract star rating (number before "-star" like "4-star")
    const starMatch = headerRatingText.match(/(\d+)[-\s]*star/i);
    if (starMatch) {
      starRating = Number(starMatch[1]);
    }
  }

  // Format 2: "5 4 3 2 1 4.4 925 reviews" from div.PPCwl.cYOgid
  const ratingInfoText = await getFirstText(page, [
    'div.PPCwl.cYOgid',
    'div.PPCwl',
  ]);

  if (ratingInfoText) {    
    // Split by whitespace
    const parts = ratingInfoText.trim().split(/\s+/);
    
    // Find the index of the rating (decimal number like 4.4)
    let ratingIndex = -1;
    for (let i = 0; i < parts.length; i++) {
      if (/^\d+\.\d+$/.test(parts[i])) {
        ratingIndex = i;
        if (!rating) {
          rating = Number(parts[i]);
        }
        break;
      }
    }
    
    // Find review count (number before "reviews" or "đánh giá")
    if (!reviewCount) {
      const reviewMatch = ratingInfoText.match(/(\d+)\s*(?:reviews|đánh giá|review)/i);
      if (reviewMatch) {
        const reviewCountStr = reviewMatch[1];
        // Find the index of this number in parts
        const reviewIndex = parts.findIndex(p => p === reviewCountStr);
        if (reviewIndex !== -1) {
          reviewCount = Number(reviewCountStr);
        }
      }
    }
    
    // Extract rating distribution (5 integers before the rating)
    // These should be the first 5 integer numbers (not decimals)
    if (ratingIndex > 0) {
      const integersBeforeRating: number[] = [];
      for (let i = 0; i < ratingIndex; i++) {
        const part = parts[i];
        // Only include pure integers (not decimals)
        if (/^\d+$/.test(part)) {
          integersBeforeRating.push(Number(part));
        }
      }
      
      // If we have exactly 5 integers before rating, they are likely the distribution
      if (integersBeforeRating.length >= 5) {
        const firstFive = integersBeforeRating.slice(0, 5);
        // Validate: these should be reasonable counts
        const maxReasonableCount = reviewCount ? reviewCount * 2 : 10000;
        const looksLikeDistribution = firstFive.every(n => n >= 0 && n <= maxReasonableCount);
        
        if (looksLikeDistribution) {
          ratingDistribution = {
            five: firstFive[0] || undefined,
            four: firstFive[1] || undefined,
            three: firstFive[2] || undefined,
            two: firstFive[3] || undefined,
            one: firstFive[4] || undefined,
          };
        }
      }
    }
  }

  // Fallback to old selectors if new format didn't work
  if (!rating) {
    const ratingText = await getFirstText(page, [
      'div.F7nice span[aria-hidden="true"]',
      'div.gm2-display-2',
      '[aria-label*="stars"]',
    ]);
    rating = normalizeNumber(ratingText);
  }

  if (!reviewCount) {
    const reviewCountText = await getFirstText(page, [
      'button[jsaction*="pane.rating"] span:nth-child(2)',
      'button[jsaction*="pane.rating"] span:last-child',
      '[aria-label$="reviews"]',
    ]);
    if (reviewCountText) {
      reviewCount = Number(reviewCountText.replace(/[^0-9]/g, ''));
    }
  }
  const description = await getFirstText(page, [
    'div.HeZRrf.fontBodyMedium',
    '[data-item-id="description"] .Io6YTe',
    '[data-section-id="summary"] span',
  ]);
  const openHoursText = await getFirstText(page, [
    'div[aria-label*="Hours"] span.Io6YTe',
    '[data-item-id="opentable-hours"] .Io6YTe',
  ]);

  // Phone number
  const phoneText = await getFirstText(page, [
    'button[data-item-id*="phone"] div.AeaXub',
    'div.AeaXub[aria-label*="Phone"]',
    'button[aria-label*="Phone"] div.AeaXub',
    'div.AeaXub',
  ]);
  const phone = normalizePhoneNumber(phoneText);

  // Website information
  let website: string | undefined;
  try {
    // Try dedicated website link first (matches snippet: a.CsEnBe[data-item-id="authority"])
    const preferredSelectors = [
      'a[data-item-id="authority"]',
      'a.CsEnBe[jsaction*="pane.wfvdle41"]',
      'a[aria-label*="Trang web"]',
      'a[aria-label*="trang web"]',
      'a[aria-label*="Website"]',
    ];

    for (const selector of preferredSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        const href = await locator.getAttribute('href');
        const ariaLabel = await locator.getAttribute('aria-label');
        const text = await locator.textContent();

        website = normalizeWebsite(href) || normalizeWebsite(ariaLabel || undefined) || normalizeWebsite(text || undefined);
        if (website) break;
      }
    }

    // Fallback: scan info rows for anything that looks like a website
    if (!website) {
      const websiteElements = await page.locator('div.AeaXub, a[href^="http"]').all();
      for (const element of websiteElements) {
        const text = await element.textContent();
        const href = await element.getAttribute('href');

        website = normalizeWebsite(href) || normalizeWebsite(text || undefined);
        if (website) break;
      }
    }
  } catch {
    // Continue if website not found
  }

  // Price information
  let priceFrom: number | undefined;
  let currency: string | undefined;
  
  // Try to get price from button with aria-label containing price
  const priceButton = page.locator('button[aria-label*="đêm"], button[aria-label*="night"], button[aria-label*="₫"], button[aria-label*="$"]').first();
  try {
    if (await priceButton.count() > 0) {
      // Get aria-label first (more complete info)
      const ariaLabel = await priceButton.getAttribute('aria-label');
      if (ariaLabel) {
        const parsed = parsePrice(ariaLabel);
        if (parsed.price) {
          priceFrom = parsed.price;
          currency = parsed.currency;
        }
      }
      
      // If not found in aria-label, try text content
      if (!priceFrom) {
        const priceText = await priceButton.textContent();
        if (priceText) {
          const parsed = parsePrice(priceText);
          if (parsed.price) {
            priceFrom = parsed.price;
            currency = parsed.currency;
          }
        }
      }
    }
  } catch {
    // Continue if price button not found or error
  }
  
  // Fallback: try other selectors for price
  if (!priceFrom) {
    const priceText = await getFirstText(page, [
      'button[jsaction*="pane.wfvdle"]',
      'div[data-item-id*="price"]',
      'span[data-item-id*="price"]',
    ]);
    if (priceText) {
      const parsed = parsePrice(priceText);
      if (parsed.price) {
        priceFrom = parsed.price;
        currency = parsed.currency;
      }
    }
  }

  // Check-in/Check-out information
  let checkInTime: string | undefined;
  let checkOutTime: string | undefined;
  const checkInOutText = await getFirstText(page, [
    'div.AeaXub[data-item-id="place-info-links:"]',
    'div[data-item-id*="check-in"]',
  ]);
  if (checkInOutText) {
    const checkInMatch = checkInOutText.match(/Check-in time:\s*(.+?)(?=Check-out|$)/i);
    const checkOutMatch = checkInOutText.match(/Check-out time:\s*(.+?)$/i);
    if (checkInMatch) checkInTime = checkInMatch[1].trim();
    if (checkOutMatch) checkOutTime = checkOutMatch[1].trim();
  }

  // Amenities
  const amenities: string[] = [];
  const amenitiesText = await getFirstText(page, [
    'div.QoXOEc.fontBodySmall',
    'div[aria-label*="Amenities"]',
    'div[aria-label*="tiện ích"]',
  ]);
  if (amenitiesText) {
    // Split by multiple spaces, newlines, or bullet points
    const amenityList = amenitiesText
      .split(/\s{2,}|\n|•/)
      .map(a => a.trim())
      .filter(a => a.length > 0);
    amenities.push(...amenityList);
  }

  const images = await collectImages(page);
  const { latitude, longitude } = extractCoordinatesFromUrl(url);

  const result: HotelItem = {
    name,
    address: address || 'Unknown address',
    rating,
    reviewCount,
    starRating,
    ratingDistribution,
    description,
    openHoursText,
    phone,
    priceFrom,
    currency,
    website,
    checkInTime,
    checkOutTime,
    amenities: amenities.length > 0 ? amenities : undefined,
    images,
    latitude,
    longitude,
  };

  onStream?.({
    type: 'data',
    data: result,
  });

  return result;
}

export async function crawlGoogleMapsListHotel(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem[]> {
  const SPONSORED_LABELS = ['được tài trợ', 'sponsored', 'sponsored'];

  try {
    await page.waitForLoadState('domcontentloaded');
    
    onStream?.({
      type: 'progress',
      message: 'Loading Google Maps hotel list...',
      progress: 10,
    });

    // Wait a bit for page to fully load
    await page.waitForTimeout(3000);

    // Wait for hotel cards to appear - try multiple selectors
    const hotelCardSelectors = [
      'div[role="article"]',
      'div.Nv2PK',
      'a.hfpxzc',
    ];

    let hotelCardsFound = false;
    for (const selector of hotelCardSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        const count = await page.locator(selector).count();
        if (count > 0) {
          hotelCardsFound = true;
          logger.info(`Found ${count} elements with selector: ${selector}`);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (!hotelCardsFound) {
      logger.warn('No hotel cards found on page, returning empty array');
      onStream?.({
        type: 'progress',
        message: 'No hotel cards found on page',
        progress: 100,
      });
      return [];
    }

    const allHotels: HotelItem[] = [];
    const processedLinks = new Set<string>();
    const targetHotels = 100; // Mục tiêu lấy 100 items
    const maxHotels = options?.maxPages ? options.maxPages * 20 : targetHotels + 20; // Cho phép lấy thêm một chút để đảm bảo đủ

    let scrollAttempts = 0;
    const maxScrollAttempts = 60; // Tăng số lần scroll lên 60 để lấy nhiều items hơn
    let previousHotelCount = 0;
    let noNewContentCount = 0;
    const maxNoNewContentCount = 8; // Dừng sau 8 lần không có content mới

    onStream?.({
      type: 'progress',
      message: 'Extracting hotels from list...',
      progress: 20,
    });

    // Extract hotels initially before scrolling
    let hotelsOnPage: any[] = [];
    try {
      hotelsOnPage = await page.evaluate((sponsoredLabels) => {
        const toText = (el: Element | null) => (el?.textContent || '').trim();
        const hasSponsored = (el: Element): boolean => {
          const text = el.textContent?.toLowerCase() || '';
          if (sponsoredLabels.some(label => text.includes(label.toLowerCase()))) return true;
          const classNames = el.className?.toLowerCase() || '';
          if (classNames.includes('sponsored')) return true;
          const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
          if (sponsoredLabels.some(label => ariaLabel.includes(label.toLowerCase()))) return true;
          const sponsoredElements = el.querySelectorAll('[class*="sponsored"], [aria-label*="sponsored"], [aria-label*="tài trợ"]');
          if (sponsoredElements.length > 0) return true;
          return false;
        };

        const hotelCards = Array.from(document.querySelectorAll('div[role="article"]'));
        const hotels: any[] = [];

        for (const card of hotelCards) {
          if (hasSponsored(card)) continue;
          const linkElement = card.querySelector('a.hfpxzc');
          const href = linkElement?.getAttribute('href') || '';
          if (!href) continue;

          const nameElement = card.querySelector('div.qBF1Pd.fontHeadlineSmall');
          const name = toText(nameElement) || 'Unknown hotel';

          let rating: number | undefined;
          let reviewCount: number | undefined;
          const ratingElement = card.querySelector('span.MW4etd');
          if (ratingElement) {
            const ratingText = toText(ratingElement);
            rating = ratingText ? Number(ratingText.replace(',', '.')) : undefined;
          }

          const reviewElement = card.querySelector('span.UY7F9');
          if (reviewElement) {
            const reviewText = toText(reviewElement);
            const reviewMatch = reviewText.match(/\((\d+)\)/);
            if (reviewMatch) {
              reviewCount = Number(reviewMatch[1]);
            }
          }

          let starRating: number | undefined;
          const starRatingText = card.querySelector('div.W4Efsd span')?.textContent || '';
          const starMatch = starRatingText.match(/(\d+)[-\s]*sao/i) || starRatingText.match(/(\d+)[-\s]*star/i);
          if (starMatch) {
            starRating = Number(starMatch[1]);
          }

          let address: string | undefined;
          const addressElement = card.querySelector('div.W4Efsd span');
          if (addressElement) {
            address = toText(addressElement);
          }

          let image: string | undefined;
          const imgElement = card.querySelector('img[src*="googleusercontent"]');
          if (imgElement) {
            const src = imgElement.getAttribute('src') || '';
            if (src) {
              image = src
                .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                .replace(/=s\d+-k-no/, '=s2048-k-no')
                .replace(/=w\d+-h\d+/, '=w2048-h2048')
                .replace(/=s\d+/, '=s2048')
                .replace(/=w\d+/, '=w2048');
              image = image.split('?')[0];
            }
          }

          const amenities: string[] = [];
          const amenityElements = card.querySelectorAll('div.Yfjtfe.dc6iWb span.gSamH');
          amenityElements.forEach(el => {
            const amenity = toText(el);
            if (amenity) amenities.push(amenity);
          });

          // Price information
          let priceFrom: number | undefined;
          let currency: string | undefined;
          const priceButton = card.querySelector('button[aria-label*="đêm"], button[aria-label*="night"], button[aria-label*="₫"], button[aria-label*="$"]');
          if (priceButton) {
            // Try aria-label first
            const ariaLabel = priceButton.getAttribute('aria-label') || '';
            const priceText = ariaLabel || toText(priceButton);
            
            if (priceText) {
              // Find currency symbol position
              let currencySymbol = '';
              let currencyIndex = -1;
              
              if (priceText.includes('₫')) {
                currency = 'VND';
                currencySymbol = '₫';
                currencyIndex = priceText.indexOf('₫');
              } else if (priceText.includes('$')) {
                currency = 'USD';
                currencySymbol = '$';
                currencyIndex = priceText.indexOf('$');
              } else if (priceText.includes('€')) {
                currency = 'EUR';
                currencySymbol = '€';
                currencyIndex = priceText.indexOf('€');
              } else if (priceText.includes('£')) {
                currency = 'GBP';
                currencySymbol = '£';
                currencyIndex = priceText.indexOf('£');
              } else if (priceText.includes('¥')) {
                currency = 'JPY';
                currencySymbol = '¥';
                currencyIndex = priceText.indexOf('¥');
              } else if (priceText.includes('₹')) {
                currency = 'INR';
                currencySymbol = '₹';
                currencyIndex = priceText.indexOf('₹');
              }
              
              // Extract price number - only from text before currency symbol
              if (currencyIndex !== -1) {
                const priceSection = priceText.substring(0, currencyIndex).trim();
                const priceMatch = priceSection.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
                const price = Number(priceMatch);
                if (Number.isFinite(price) && price > 0) {
                  priceFrom = price;
                }
              }
            }
          }

          let latitude: number | undefined;
          let longitude: number | undefined;
          const coordMatch = href.match(/[?&]data=!4m\d+!3m\d+!1s[^!]+!8m\d+!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
          if (coordMatch) {
            latitude = Number(coordMatch[1]);
            longitude = Number(coordMatch[2]);
          }

          hotels.push({
            name,
            address: address || 'Unknown address',
            rating,
            reviewCount,
            starRating,
            priceFrom,
            currency,
            images: image ? [image] : undefined,
            amenities: amenities.length > 0 ? amenities : undefined,
            latitude,
            longitude,
            detailLink: href.startsWith('http') ? href : `https://www.google.com${href}`,
          });
        }

        return hotels;
      }, SPONSORED_LABELS);
    } catch (evalError) {
      logger.error('Error in initial hotel extraction', {
        error: evalError instanceof Error ? evalError.message : String(evalError),
      });
    }

    // Process initial hotels
    for (const hotelData of hotelsOnPage) {
      if (hotelData.detailLink && !processedLinks.has(hotelData.detailLink)) {
        processedLinks.add(hotelData.detailLink);
        const hotel: HotelItem = {
          name: hotelData.name,
          address: hotelData.address,
          rating: hotelData.rating,
          reviewCount: hotelData.reviewCount,
          starRating: hotelData.starRating,
          priceFrom: hotelData.priceFrom,
          currency: hotelData.currency,
          images: hotelData.images,
          amenities: hotelData.amenities,
          latitude: hotelData.latitude,
          longitude: hotelData.longitude,
          detailLink: hotelData.detailLink,
        };
        allHotels.push(hotel);
      }
    }

    previousHotelCount = hotelsOnPage.length;
    logger.info(`Initial extraction: Found ${allHotels.length} hotels, ${previousHotelCount} total cards`);

    // Không cache scrollContainer để tránh lỗi stale element hoặc chọn sai container
    while (allHotels.length < maxHotels && scrollAttempts < maxScrollAttempts && noNewContentCount < maxNoNewContentCount) {
      scrollAttempts++;
      
      // Scroll to load more results
      const scrollResult = await page.evaluate(async () => {
        // Danh sách các selector tiềm năng
        const selectors = [
          'div.m6QErb.DxyBCb.kA9KIf.dS8AEf', // Main results container
          'div.m6QErb.XiKgde', // Alternative
          'div[role="feed"]', // Feed container
          'div.m6QErb', // Generic
          'div[style*="overflow-y: auto"]',
          'div[style*="overflow-y: scroll"]'
        ];
        
        let scrolledAny = false;
        
        // Helper function to sleep
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Thử scroll TẤT CẢ các container tìm thấy thay vì chỉ 1
        for (const selector of selectors) {
          const containers = document.querySelectorAll(selector);
          for (const container of Array.from(containers)) {
            if (container && container.scrollHeight > container.clientHeight) {
              const element = container as HTMLElement;
              
              // 1. Focus vào element
              element.focus();
              
              // 2. Scroll xuống cuối từ từ
              const startScroll = element.scrollTop;
              const targetScroll = element.scrollHeight;
              const step = (targetScroll - startScroll) / 5;
              
              if (step > 0) {
                for (let i = 0; i < 5; i++) {
                   element.scrollTop += step;
                   await sleep(100);
                }
              }
              element.scrollTop = element.scrollHeight;
              await sleep(500);

              // 3. "Lắc" scroll: Scroll lên một chút rồi scroll xuống lại để trigger event
              if (element.scrollTop > 0) {
                element.scrollTop -= 50;
                await sleep(200);
                element.scrollTop = element.scrollHeight;
              }
              
              // Kiểm tra xem có thực sự scroll được không
              if (element.scrollTop > startScroll || element.scrollTop === element.scrollHeight) {
                scrolledAny = true;
              }
            }
          }
        }
        
        // Fallback: scroll window
        if (!scrolledAny) {
          window.scrollBy(0, window.innerHeight);
        }
        
        return scrolledAny;
      });
      
      logger.info(`Scroll attempt ${scrollAttempts}: scrolled=${scrollResult}, cards=${previousHotelCount}`);
      
      // Kiểm tra xem đã đến cuối danh sách chưa
      const reachedEnd = await page.evaluate(() => {
        // Tìm element báo "You've reached the end of the list"
        const endMessages = [
          "You've reached the end of the list",
          'Bạn đã xem hết danh sách',
          'reached the end',
          'end of the list',
          'hết danh sách'
        ];
        
        // Tìm các div có class chứa m6QErb và XiKgde
        const containers = document.querySelectorAll('div.m6QErb.XiKgde, div.m6QErb');
        for (const container of Array.from(containers)) {
          const text = container.textContent?.toLowerCase() || '';
          for (const msg of endMessages) {
            if (text.includes(msg.toLowerCase())) {
              return true;
            }
          }
        }
        return false;
      });
      
      if (reachedEnd) {
        logger.info('Reached end of list message detected, stopping scroll');
        break;
      }
      
      // Đợi content load - TĂNG THỜI GIAN CHỜ LÊN 8 GIÂY để content kịp load
      await page.waitForTimeout(8000);
      
      // Scroll lần 2 để chắc chắn (Quick check)
      await page.evaluate(() => {
        const containers = document.querySelectorAll('div.m6QErb, div[role="feed"]');
        for (const container of Array.from(containers)) {
          if (container && container.scrollHeight > container.clientHeight) {
            container.scrollTop = container.scrollHeight;
          }
        }
      });
      
      // Đợi thêm sau lần scroll phụ - tăng lên 5 giây
      await page.waitForTimeout(5000);
      
      // Kiểm tra lại lần nữa xem đã đến cuối danh sách chưa
      const reachedEndAfterScroll = await page.evaluate(() => {
        const endMessages = [
          "You've reached the end of the list",
          'Bạn đã xem hết danh sách',
          'reached the end',
          'end of the list',
          'hết danh sách'
        ];
        
        const containers = document.querySelectorAll('div.m6QErb.XiKgde, div.m6QErb');
        for (const container of Array.from(containers)) {
          const text = container.textContent?.toLowerCase() || '';
          for (const msg of endMessages) {
            if (text.includes(msg.toLowerCase())) {
              return true;
            }
          }
        }
        return false;
      });
      
      if (reachedEndAfterScroll) {
        logger.info('Reached end of list message detected after scroll, stopping');
        break;
      }
      
      // Kiểm tra xem có thêm content mới không
      const currentCardCount = await page.evaluate(() => {
        return document.querySelectorAll('div[role="article"]').length;
      });
      
      logger.info(`After scroll ${scrollAttempts}: Found ${currentCardCount} hotel cards`);

      // Extract hotels from current view after scrolling
      hotelsOnPage = [];
      try {
        hotelsOnPage = await page.evaluate((sponsoredLabels) => {
          const toText = (el: Element | null) => (el?.textContent || '').trim();
          const hasSponsored = (el: Element): boolean => {
            const text = el.textContent?.toLowerCase() || '';
            if (sponsoredLabels.some(label => text.includes(label.toLowerCase()))) return true;
            const classNames = el.className?.toLowerCase() || '';
            if (classNames.includes('sponsored')) return true;
            const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
            if (sponsoredLabels.some(label => ariaLabel.includes(label.toLowerCase()))) return true;
            const sponsoredElements = el.querySelectorAll('[class*="sponsored"], [aria-label*="sponsored"], [aria-label*="tài trợ"]');
            if (sponsoredElements.length > 0) return true;
            return false;
          };

          const hotelCards = Array.from(document.querySelectorAll('div[role="article"]'));
          const hotels: any[] = [];

          for (const card of hotelCards) {
            if (hasSponsored(card)) continue;
            const linkElement = card.querySelector('a.hfpxzc');
            const href = linkElement?.getAttribute('href') || '';
            if (!href) continue;

            const nameElement = card.querySelector('div.qBF1Pd.fontHeadlineSmall');
            const name = toText(nameElement) || 'Unknown hotel';

            let rating: number | undefined;
            let reviewCount: number | undefined;
            const ratingElement = card.querySelector('span.MW4etd');
            if (ratingElement) {
              const ratingText = toText(ratingElement);
              rating = ratingText ? Number(ratingText.replace(',', '.')) : undefined;
            }

            const reviewElement = card.querySelector('span.UY7F9');
            if (reviewElement) {
              const reviewText = toText(reviewElement);
              const reviewMatch = reviewText.match(/\((\d+)\)/);
              if (reviewMatch) {
                reviewCount = Number(reviewMatch[1]);
              }
            }

            let starRating: number | undefined;
            const starRatingText = card.querySelector('div.W4Efsd span')?.textContent || '';
            const starMatch = starRatingText.match(/(\d+)[-\s]*sao/i) || starRatingText.match(/(\d+)[-\s]*star/i);
            if (starMatch) {
              starRating = Number(starMatch[1]);
            }

            let address: string | undefined;
            const addressElement = card.querySelector('div.W4Efsd span');
            if (addressElement) {
              address = toText(addressElement);
            }

            let image: string | undefined;
            const imgElement = card.querySelector('img[src*="googleusercontent"]');
            if (imgElement) {
              const src = imgElement.getAttribute('src') || '';
              if (src) {
                image = src
                  .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                  .replace(/=s\d+-k-no/, '=s2048-k-no')
                  .replace(/=w\d+-h\d+/, '=w2048-h2048')
                  .replace(/=s\d+/, '=s2048')
                  .replace(/=w\d+/, '=w2048');
                image = image.split('?')[0];
              }
            }

            const amenities: string[] = [];
            const amenityElements = card.querySelectorAll('div.Yfjtfe.dc6iWb span.gSamH');
            amenityElements.forEach(el => {
              const amenity = toText(el);
              if (amenity) amenities.push(amenity);
            });

            // Price information
            let priceFrom: number | undefined;
            let currency: string | undefined;
            const priceButton = card.querySelector('button[aria-label*="đêm"], button[aria-label*="night"], button[aria-label*="₫"], button[aria-label*="$"]');
            if (priceButton) {
              // Try aria-label first
              const ariaLabel = priceButton.getAttribute('aria-label') || '';
              const priceText = ariaLabel || toText(priceButton);
              
              if (priceText) {
                // Extract currency
                if (priceText.includes('₫')) currency = 'VND';
                else if (priceText.includes('$')) currency = 'USD';
                else if (priceText.includes('€')) currency = 'EUR';
                else if (priceText.includes('£')) currency = 'GBP';
                else if (priceText.includes('¥')) currency = 'JPY';
                else if (priceText.includes('₹')) currency = 'INR';
                
                // Extract price number
                const priceMatch = priceText.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
                const price = Number(priceMatch);
                if (Number.isFinite(price) && price > 0) {
                  priceFrom = price;
                }
              }
            }

            let latitude: number | undefined;
            let longitude: number | undefined;
            const coordMatch = href.match(/[?&]data=!4m\d+!3m\d+!1s[^!]+!8m\d+!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
            if (coordMatch) {
              latitude = Number(coordMatch[1]);
              longitude = Number(coordMatch[2]);
            }

            hotels.push({
              name,
              address: address || 'Unknown address',
              rating,
              reviewCount,
              starRating,
              priceFrom,
              currency,
              images: image ? [image] : undefined,
              amenities: amenities.length > 0 ? amenities : undefined,
              latitude,
              longitude,
              detailLink: href.startsWith('http') ? href : `https://www.google.com${href}`,
            });
          }

          return hotels;
        }, SPONSORED_LABELS);
      } catch (evalError) {
        logger.error('Error evaluating page for hotels', {
          error: evalError instanceof Error ? evalError.message : String(evalError),
        });
        hotelsOnPage = [];
      }

      // Ensure hotelsOnPage is an array
      if (!Array.isArray(hotelsOnPage)) {
        logger.warn('hotelsOnPage is not an array, defaulting to empty array');
        hotelsOnPage = [];
      }

      // Process new hotels
      let newHotelsCount = 0;
      for (const hotelData of hotelsOnPage) {
        if (allHotels.length >= maxHotels) break;
        
        // Skip if we've already processed this hotel (by detail link)
        if (hotelData.detailLink && processedLinks.has(hotelData.detailLink)) {
          continue;
        }

        if (hotelData.detailLink) {
          processedLinks.add(hotelData.detailLink);
        }

        const hotel: HotelItem = {
          name: hotelData.name,
          address: hotelData.address,
          rating: hotelData.rating,
          reviewCount: hotelData.reviewCount,
          starRating: hotelData.starRating,
          priceFrom: hotelData.priceFrom,
          currency: hotelData.currency,
          images: hotelData.images,
          amenities: hotelData.amenities,
          latitude: hotelData.latitude,
          longitude: hotelData.longitude,
          detailLink: hotelData.detailLink,
        };

        allHotels.push(hotel);
        newHotelsCount++;

        onStream?.({
          type: 'data',
          data: hotel,
          index: allHotels.length - 1,
          total: allHotels.length,
        });
      }

      logger.info(`Scroll ${scrollAttempts}: Found ${newHotelsCount} new hotels (Total: ${allHotels.length})`);

      onStream?.({
        type: 'progress',
        message: `Found ${allHotels.length} hotels...`,
        progress: 20 + Math.floor((allHotels.length / maxHotels) * 70),
      });

      // Check if we've loaded more hotels
      const currentHotelCount = hotelsOnPage.length;
      if (currentHotelCount > previousHotelCount) {
        // Found new content, reset counter
        previousHotelCount = currentHotelCount;
        noNewContentCount = 0;
        logger.info(`New content detected: ${currentHotelCount} total cards (was ${previousHotelCount})`);
      } else if (newHotelsCount === 0) {
        // No new hotels added this iteration
        noNewContentCount++;
        logger.info(`No new hotels found (${noNewContentCount}/${maxNoNewContentCount})`);
      } else {
        // New hotels but same total count (might be duplicates filtered out)
        noNewContentCount = 0;
      }

      // Kiểm tra cuối cùng xem đã đến cuối danh sách chưa
      const finalEndCheck = await page.evaluate(() => {
        const endMessages = [
          "You've reached the end of the list",
          'Bạn đã xem hết danh sách',
          'reached the end',
          'end of the list',
          'hết danh sách'
        ];
        
        const containers = document.querySelectorAll('div.m6QErb.XiKgde, div.m6QErb');
        for (const container of Array.from(containers)) {
          const text = container.textContent?.toLowerCase() || '';
          for (const msg of endMessages) {
            if (text.includes(msg.toLowerCase())) {
              return true;
            }
          }
        }
        return false;
      });
      
      if (finalEndCheck) {
        logger.info('Reached end of list (final check), stopping');
        break;
      }
      
      // Nếu chưa đủ items, tiếp tục scroll thêm nếu cần (fallback logic)
      if (allHotels.length < targetHotels && scrollAttempts < maxScrollAttempts) {
        // Chỉ force scroll nếu số lượng item không tăng
        if (newHotelsCount === 0) {
           await page.evaluate(() => {
              const containers = document.querySelectorAll('div.m6QErb, div[role="feed"]');
              for (const container of Array.from(containers)) {
                if (container && container.scrollHeight > container.clientHeight) {
                   container.scrollTop = container.scrollHeight;
                }
              }
           });
           await page.waitForTimeout(4000); // Tăng thời gian chờ lên 4 giây
        }
      }
      
      // Dừng sớm nếu đã đủ items
      if (allHotels.length >= targetHotels) {
        logger.info(`Reached target of ${targetHotels} hotels, stopping`);
        break;
      }

      // Stop if no new content for several iterations
      if (noNewContentCount >= maxNoNewContentCount) {
        logger.info(`Stopping: No new content after ${noNewContentCount} iterations`);
        break;
      }
    }

    logger.info(`Crawl completed. Found ${allHotels.length} hotels total`);

    onStream?.({
      type: 'progress',
      message: `Completed. Found ${allHotels.length} hotels.`,
      progress: 100,
    });

    // Always return an array, even if empty
    return allHotels.length > 0 ? allHotels : [];
  } catch (error) {
    logger.error('Error in crawlGoogleMapsListHotel', {
      url,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    onStream?.({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });

    // Always return an array, even on error
    return [];
  }
}
