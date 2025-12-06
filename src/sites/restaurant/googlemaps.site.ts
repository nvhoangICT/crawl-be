import { Page } from 'playwright';
import { RestaurantItem, CrawlOptions, StreamCallback } from '../../types/crawl';
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

function normalizePhoneNumber(text?: string): string | undefined {
  if (!text) return undefined;
  // Remove icons, emojis, and other non-phone characters
  // Keep only digits, +, -, spaces, parentheses, and dots
  const cleaned = text
    .replace(/[^\d+\-()\s.]/g, '') // Remove all non-phone characters
    .trim();
  return cleaned || undefined;
}

function extractProvinceFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  
  // Common Vietnamese province patterns
  const provincePatterns = [
    /(?:Tỉnh|Thành phố)\s+([^,]+)/i,
    /([^,]+)\s*(?:Tỉnh|Thành phố)/i,
    /,\s*([^,]+?)(?:\s*,\s*|$)/, // Last part before final comma or end
  ];
  
  for (const pattern of provincePatterns) {
    const match = address.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Fallback: try to extract last meaningful part
  const parts = address.split(',').map(p => p.trim()).filter(p => p);
  if (parts.length > 1) {
    // Return the second-to-last or last part
    return parts[parts.length - 1] || parts[parts.length - 2];
  }
  
  return undefined;
}

function extractCoordinatesFromUrl(url: string): { latitude?: number; longitude?: number } {
  try {
    // Try format: /@lat,lng
    let match = url.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (match) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      return {
        latitude: Number.isFinite(latitude) ? latitude : undefined,
        longitude: Number.isFinite(longitude) ? longitude : undefined,
      };
    }
    
    // Try format: !3dlat!4dlng
    match = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
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

async function collectImages(page: Page): Promise<string[]> {
  const imageUrls = new Set<string>();
  
  try {
    // First, try to collect images from the main page (including canvas area)
    // Canvas element with class aFsglc (and classes JRr1M, DnOnV) is often used for displaying main image
    // Check if canvas exists - this indicates we're on a detail page with image gallery
    const canvasExists = await page.locator('canvas.aFsglc').count() > 0;
    
    if (canvasExists) {
      // Canvas found - look for images in the same area
      // Look for img tags that are siblings or nearby canvas
      const nearbyImages = await page.locator('canvas.aFsglc ~ img, canvas.aFsglc + img, canvas.aFsglc').locator('..').locator('img').all();
      
      for (const img of nearbyImages) {
        try {
          const src = await img.getAttribute('src');
          const dataSrc = await img.getAttribute('data-src');
          const imageUrl = src || dataSrc;
          if (imageUrl && !imageUrl.startsWith('data:') && (imageUrl.includes('googleusercontent') || imageUrl.startsWith('http'))) {
            let highQualitySrc = imageUrl
              .split('?')[0]
              .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
              .replace(/=s\d+-k-no/, '=s2048-k-no')
              .replace(/=w\d+-h\d+/, '=w2048-h2048')
              .replace(/=s\d+/, '=s2048')
              .replace(/=w\d+/, '=w2048');
            if (highQualitySrc.startsWith('https://')) {
              imageUrls.add(highQualitySrc);
            }
          }
        } catch {
          // Skip this image
        }
      }
      
      // Look for background-image in containers near canvas
      const nearbyContainers = await page.locator('canvas.aFsglc ~ div, canvas.aFsglc + div').all();
      
      for (const container of nearbyContainers) {
        try {
          const style = await container.getAttribute('style');
          if (style) {
            const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
            if (urlMatch && urlMatch[1]) {
              let imageUrl = urlMatch[1];
              const baseUrl = imageUrl.split('?')[0];
              let highQualitySrc = baseUrl
                .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                .replace(/=s\d+-k-no/, '=s2048-k-no')
                .replace(/=w\d+-h\d+/, '=w2048-h2048')
                .replace(/=s\d+/, '=s2048')
                .replace(/=w\d+/, '=w2048');
              if (highQualitySrc.startsWith('https://') && highQualitySrc.includes('googleusercontent')) {
                imageUrls.add(highQualitySrc);
              }
            }
          }
        } catch {
          // Skip this container
        }
      }
    }

    // Also collect from main page image elements (not just gallery)
    try {
      const mainPageImages = await page.locator('img[src*="googleusercontent"], img[data-src*="googleusercontent"], div[style*="background-image"]').all();
      for (const element of mainPageImages) {
        try {
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          if (tagName === 'img') {
            const src = await element.getAttribute('src');
            const dataSrc = await element.getAttribute('data-src');
            const imageUrl = src || dataSrc;
            if (imageUrl && !imageUrl.startsWith('data:') && imageUrl.includes('googleusercontent')) {
              let highQualitySrc = imageUrl
                .split('?')[0]
                .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                .replace(/=s\d+-k-no/, '=s2048-k-no')
                .replace(/=w\d+-h\d+/, '=w2048-h2048')
                .replace(/=s\d+/, '=s2048')
                .replace(/=w\d+/, '=w2048');
              if (highQualitySrc.startsWith('https://')) {
                imageUrls.add(highQualitySrc);
              }
            }
          } else if (tagName === 'div') {
            const style = await element.getAttribute('style');
            if (style) {
              const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
              if (urlMatch && urlMatch[1]) {
                let imageUrl = urlMatch[1];
                const baseUrl = imageUrl.split('?')[0];
                let highQualitySrc = baseUrl
                  .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                  .replace(/=s\d+-k-no/, '=s2048-k-no')
                  .replace(/=w\d+-h\d+/, '=w2048-h2048')
                  .replace(/=s\d+/, '=s2048')
                  .replace(/=w\d+/, '=w2048');
                if (highQualitySrc.startsWith('https://') && highQualitySrc.includes('googleusercontent')) {
                  imageUrls.add(highQualitySrc);
                }
              }
            }
          }
        } catch {
          // Skip this element
        }
      }
    } catch {
      // Continue if error
    }

    // Try to find and click the "Photos" button to open the gallery for more images
    const photoButtonSelectors = [
      'button[jsaction*="pane.wfvdlephoto"]',
      'button[jsaction*="pane.wfvdle836"]',
      'button.aoRNLd[aria-label*="Ảnh"]',
      'button.aoRNLd[aria-label*="ảnh"]',
      'button.aoRNLd[jsaction*="pane.wfvdle"]',
      'button[aria-label*="Photos"]',
      'button[aria-label*="ảnh"]',
      'button:has-text("Photos")',
      'button:has-text("Xem tất cả ảnh")',
      'a[href*="photos"]',
    ];

    let galleryOpened = false;
    for (const selector of photoButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.count() > 0) {
          await button.click({ timeout: 5000 });
          await page.waitForSelector('canvas.aFsglc, div.m6QErb, [role="dialog"]', { timeout: 5000 }).catch(() => null);
          await page.waitForTimeout(2000);
          galleryOpened = true;
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (galleryOpened) {
      await page.waitForTimeout(2000);

      // Scroll to load more images
      let previousImageCount = imageUrls.size;
      let scrollAttempts = 0;
      const maxScrollAttempts = 10;

      while (scrollAttempts < maxScrollAttempts) {
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
          await galleryContainer.evaluate((el) => {
            const scrollHeight = el.scrollHeight;
            const clientHeight = el.clientHeight;
            el.scrollTop = scrollHeight - clientHeight;
          });
          await page.waitForTimeout(2000);

          // Collect images from background-image style
          const imageContainers = await page.locator('div.m6QErb div.U39Pmb, div.m6QErb div.Uf0tqf, [role="dialog"] div.U39Pmb, [role="dialog"] div.Uf0tqf').all();
          
          for (const container of imageContainers) {
            try {
              const style = await container.getAttribute('style');
              if (style) {
                const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
                if (urlMatch && urlMatch[1]) {
                  let imageUrl = urlMatch[1];
                  const baseUrl = imageUrl.split('?')[0];
                  
                  let highQualitySrc = baseUrl
                    .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                    .replace(/=s\d+-k-no/, '=s2048-k-no')
                    .replace(/=w\d+-h\d+/, '=w2048-h2048')
                    .replace(/=s\d+/, '=s2048')
                    .replace(/=w\d+/, '=w2048');
                  
                  if (highQualitySrc.startsWith('https://') && highQualitySrc.includes('googleusercontent')) {
                    imageUrls.add(highQualitySrc);
                  }
                }
              }
            } catch {
              // Skip this container
            }
          }

          // Collect from img tags
          const galleryImages = await page.locator('[role="dialog"] img[src*="googleusercontent"], div.m6QErb img[src*="googleusercontent"]').all();
          
          for (const img of galleryImages) {
            try {
              const src = await img.getAttribute('src');
              if (src && !src.startsWith('data:') && src.includes('googleusercontent')) {
                let highQualitySrc = src
                  .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                  .replace(/=s\d+-k-no/, '=s2048-k-no')
                  .replace(/=w\d+-h\d+/, '=w2048-h2048')
                  .replace(/=s\d+/, '=s2048')
                  .replace(/=w\d+/, '=w2048');
                
                if (highQualitySrc.startsWith('https://')) {
                  imageUrls.add(highQualitySrc);
                }
              }
            } catch {
              // Skip this image
            }
          }

          // Check if we've loaded more images
          const currentImageCount = imageUrls.size;
          if (currentImageCount === previousImageCount) {
            scrollAttempts++;
            if (scrollAttempts >= 3) {
              break;
            }
          } else {
            previousImageCount = currentImageCount;
            scrollAttempts = 0;
          }
        } else {
          break;
        }
      }

      // Try to close the gallery
      try {
        const closeButton = page.locator('button[aria-label*="Close"], button[aria-label*="Đóng"], button[jsaction*="lightbox.close"]').first();
        if (await closeButton.count() > 0) {
          await closeButton.click({ timeout: 2000 });
        }
      } catch {
        // Ignore if close button not found
      }
    }
  } catch (error) {
    logger.error('Error collecting images', error);
  }

  return Array.from(imageUrls);
}

export async function crawlGoogleMapsRestaurant(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<RestaurantItem>,
): Promise<RestaurantItem> {
  const SPONSORED_LABELS = ['được tài trợ', 'sponsored'];

  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => null);

  // Extract name
  const name =
    (await getFirstText(page, ['h1.DUwDvf', 'h1 span', '[data-item-id="title"] span'], { skipValues: SPONSORED_LABELS })) ||
    'Unknown restaurant';

  // Extract address
  const address = await getFirstText(page, [
    '[data-item-id="address"] .Io6YTe',
    'button[data-item-id="address"] div:last-child',
    'button[data-item-id="address"]',
  ], { skipValues: SPONSORED_LABELS });

  // Extract province from address
  const province = extractProvinceFromAddress(address);

  // Extract rating/score
  let score: number | undefined;
  const headerRatingText = await getFirstText(page, [
    'div.lMbq3e',
    'div.PPCwl.cYOgid',
    'div.PPCwl',
  ]);
  
  if (headerRatingText) {
    // Extract rating (decimal number like 4.4, 5.0)
    const ratingMatch = headerRatingText.match(/(\d+\.\d+)/);
    if (ratingMatch) {
      score = Number(ratingMatch[1]);
    } else {
      // Try integer rating
      const intMatch = headerRatingText.match(/(\d+)(?:\s|$)/);
      if (intMatch) {
        score = Number(intMatch[1]);
      }
    }
  }

  // Extract phone numbers
  const phoneText = await getFirstText(page, [
    'button[data-item-id*="phone"] div.AeaXub',
    'div.AeaXub[aria-label*="Phone"]',
    'button[aria-label*="Phone"] div.AeaXub',
    'button[data-item-id*="phone"]',
  ]);
  
  let phone: string | undefined = normalizePhoneNumber(phoneText);
  // Try to separate mobile phone if there are multiple numbers
  let mobilePhone: string | undefined;
  if (phoneText) {
    const phoneNumbers = phoneText.split(/[,\n]/).map(p => normalizePhoneNumber(p.trim())).filter(p => p);
    if (phoneNumbers.length > 1) {
      phone = phoneNumbers[0];
      mobilePhone = phoneNumbers[1];
    }
  }

  // Extract email
  let email: string | undefined;
  try {
    const emailElements = await page.locator('div.AeaXub, a[href^="mailto:"]').all();
    for (const element of emailElements) {
      const text = await element.textContent();
      const href = await element.getAttribute('href');
      
      if (href && href.startsWith('mailto:')) {
        email = href.replace('mailto:', '').trim();
        break;
      }
      
      if (text) {
        const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          email = emailMatch[0];
          break;
        }
      }
    }
  } catch {
    // Continue if email not found
  }

  // Extract website
  let website: string | undefined;
  try {
    const websiteElements = await page.locator('div.AeaXub, a[href^="http"]').all();
    for (const element of websiteElements) {
      const text = await element.textContent();
      const href = await element.getAttribute('href');
      
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        // Skip mailto links
        if (href.startsWith('mailto:')) continue;
        website = href;
        break;
      }
      
      if (text) {
        const cleaned = text.trim().replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, '');
        
        if (!cleaned) continue;
        
        // Skip if it looks like a phone number
        if (/^[\d\s\+\-\(\)]+$/.test(cleaned)) continue;
        
        // Check if it looks like a website
        if (/^https?:\/\//i.test(cleaned)) {
          website = cleaned;
          break;
        }
        
        const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/;
        if (domainPattern.test(cleaned)) {
          website = cleaned.startsWith('http://') || cleaned.startsWith('https://') 
            ? cleaned 
            : `https://${cleaned}`;
          break;
        }
      }
    }
  } catch {
    // Continue if website not found
  }

  // Collect images - get the first image as imageUrl
  const images = await collectImages(page);
  const imageUrl = images.length > 0 ? images[0] : undefined;

  // Extract coordinates from URL
  const { latitude, longitude } = extractCoordinatesFromUrl(url);

  const result: RestaurantItem = {
    name,
    address,
    province,
    phone,
    mobilePhone,
    email,
    website,
    imageUrl,
    detailLink: url,
    score,
    latitude,
    longitude,
    images: images.length > 0 ? images : undefined,
  };

  onStream?.({
    type: 'data',
    data: result,
  });

  return result;
}

export async function crawlGoogleMapsListRestaurant(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<RestaurantItem>,
): Promise<RestaurantItem[]> {
  const SPONSORED_LABELS = ['được tài trợ', 'sponsored'];

  try {
    await page.waitForLoadState('domcontentloaded');
    
    onStream?.({
      type: 'progress',
      message: 'Loading Google Maps restaurant list...',
      progress: 10,
    });

    // Wait a bit for page to fully load
    await page.waitForTimeout(3000);

    // Wait for restaurant cards to appear - try multiple selectors
    const restaurantCardSelectors = [
      'div[role="article"]',
      'div.Nv2PK',
      'a.hfpxzc',
    ];

    let restaurantCardsFound = false;
    for (const selector of restaurantCardSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        const count = await page.locator(selector).count();
        if (count > 0) {
          restaurantCardsFound = true;
          logger.info(`Found ${count} elements with selector: ${selector}`);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (!restaurantCardsFound) {
      logger.warn('No restaurant cards found on page, returning empty array');
      onStream?.({
        type: 'progress',
        message: 'No restaurant cards found on page',
        progress: 100,
      });
      return [];
    }

    const allRestaurants: RestaurantItem[] = [];
    const processedLinks = new Set<string>();
    const targetRestaurants = 100; // Mục tiêu lấy 100 items
    const maxRestaurants = options?.maxPages ? options.maxPages * 20 : targetRestaurants + 20;

    let scrollAttempts = 0;
    const maxScrollAttempts = 60;
    let previousRestaurantCount = 0;
    let noNewContentCount = 0;
    const maxNoNewContentCount = 8;

    onStream?.({
      type: 'progress',
      message: 'Starting to extract restaurants from list...',
      progress: 20,
    });

    let restaurantsOnPage: Array<{
      name: string;
      address?: string;
      score?: number;
      imageUrl?: string;
      detailLink?: string;
      latitude?: number;
      longitude?: number;
    }> = [];

    try {
      restaurantsOnPage = await page.evaluate((sponsoredLabels) => {
        const toText = (el: Element | null) => (el?.textContent || '').trim();
        const isSponsored = (text: string) => 
          sponsoredLabels.some(label => text.toLowerCase().includes(label.toLowerCase()));

        const restaurants: Array<{
          name: string;
          address?: string;
          score?: number;
          imageUrl?: string;
          detailLink?: string;
          latitude?: number;
          longitude?: number;
        }> = [];

        const cards = Array.from(document.querySelectorAll('div[role="article"], div.Nv2PK, a.hfpxzc'));
        
        for (const card of cards) {
          const linkElement = card.querySelector('a.hfpxzc') || (card.tagName === 'A' ? card : null);
          if (!linkElement) continue;

          const href = linkElement.getAttribute('href') || '';
          if (!href || href.includes('javascript:') || href.includes('#')) continue;

          // Skip sponsored items
          const cardText = toText(card);
          if (isSponsored(cardText)) continue;

          // Extract name
          const nameElement = card.querySelector('div.qBF1Pd, div[role="heading"], div.fontHeadlineSmall');
          const name = toText(nameElement);
          if (!name || name.length === 0) continue;

          // Extract address
          const addressElement = card.querySelector('span.W4Efsd:last-of-type, div.W4Efsd:last-of-type, span[aria-label*="address"]');
          const address = toText(addressElement);

          // Extract rating/score
          let score: number | undefined;
          const ratingElement = card.querySelector('span.MW4etd, span[aria-label*="rating"]');
          const ratingText = toText(ratingElement);
          if (ratingText) {
            const ratingMatch = ratingText.match(/(\d+\.\d+)/);
            if (ratingMatch) {
              score = Number(ratingMatch[1]);
            }
          }

          // Extract image
          const imgElement = card.querySelector('img');
          const imageUrl = imgElement?.getAttribute('src') || imgElement?.getAttribute('data-src') || undefined;

          // Extract coordinates from href
          let latitude: number | undefined;
          let longitude: number | undefined;
          const coordMatch = href.match(/[?&]data=!4m\d+!3m\d+!1s[^!]+!8m\d+!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
          if (coordMatch) {
            latitude = Number(coordMatch[1]);
            longitude = Number(coordMatch[2]);
          } else {
            // Try @ format
            const atMatch = href.match(/\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (atMatch) {
              latitude = Number(atMatch[1]);
              longitude = Number(atMatch[2]);
            }
          }

          restaurants.push({
            name,
            address: address || undefined,
            score,
            imageUrl,
            detailLink: href.startsWith('http') ? href : `https://www.google.com${href}`,
            latitude,
            longitude,
          });
        }

        return restaurants;
      }, SPONSORED_LABELS);
    } catch (evalError) {
      logger.error('Error in initial restaurant extraction', {
        error: evalError instanceof Error ? evalError.message : String(evalError),
      });
    }

    // Process initial restaurants
    for (const restaurantData of restaurantsOnPage) {
      if (restaurantData.detailLink && !processedLinks.has(restaurantData.detailLink)) {
        processedLinks.add(restaurantData.detailLink);
        const restaurant: RestaurantItem = {
          name: restaurantData.name,
          address: restaurantData.address,
          score: restaurantData.score,
          imageUrl: restaurantData.imageUrl,
          detailLink: restaurantData.detailLink,
          latitude: restaurantData.latitude,
          longitude: restaurantData.longitude,
        };
        allRestaurants.push(restaurant);
      }
    }

    previousRestaurantCount = restaurantsOnPage.length;
    logger.info(`Initial extraction: Found ${allRestaurants.length} restaurants, ${previousRestaurantCount} total cards`);

    // Scroll to load more restaurants
    while (allRestaurants.length < maxRestaurants && scrollAttempts < maxScrollAttempts && noNewContentCount < maxNoNewContentCount) {
      scrollAttempts++;

      onStream?.({
        type: 'progress',
        message: `Scrolling to load more restaurants... (${allRestaurants.length}/${maxRestaurants})`,
        progress: 20 + Math.floor((allRestaurants.length / maxRestaurants) * 60),
      });

      // Find scrollable container
      const scrollContainerSelectors = [
        'div[role="main"]',
        'div.m6QErb',
        'div[aria-label*="Results"]',
      ];

      let scrollContainer = null;
      for (const selector of scrollContainerSelectors) {
        const container = page.locator(selector).first();
        if (await container.count() > 0) {
          scrollContainer = container;
          break;
        }
      }

      if (scrollContainer) {
        await scrollContainer.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
      } else {
        // Fallback: scroll the page
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
      }

      await page.waitForTimeout(2000);

      // Re-extract restaurants
      restaurantsOnPage = [];
      try {
        restaurantsOnPage = await page.evaluate((sponsoredLabels) => {
          const toText = (el: Element | null) => (el?.textContent || '').trim();
          const isSponsored = (text: string) => 
            sponsoredLabels.some(label => text.toLowerCase().includes(label.toLowerCase()));

          const restaurants: Array<{
            name: string;
            address?: string;
            score?: number;
            imageUrl?: string;
            detailLink?: string;
            latitude?: number;
            longitude?: number;
          }> = [];

          const cards = Array.from(document.querySelectorAll('div[role="article"], div.Nv2PK, a.hfpxzc'));
          
          for (const card of cards) {
            const linkElement = card.querySelector('a.hfpxzc') || (card.tagName === 'A' ? card : null);
            if (!linkElement) continue;

            const href = linkElement.getAttribute('href') || '';
            if (!href || href.includes('javascript:') || href.includes('#')) continue;

            const cardText = toText(card);
            if (isSponsored(cardText)) continue;

            const nameElement = card.querySelector('div.qBF1Pd, div[role="heading"], div.fontHeadlineSmall');
            const name = toText(nameElement);
            if (!name || name.length === 0) continue;

            const addressElement = card.querySelector('span.W4Efsd:last-of-type, div.W4Efsd:last-of-type');
            const address = toText(addressElement);

            let score: number | undefined;
            const ratingElement = card.querySelector('span.MW4etd, span[aria-label*="rating"]');
            const ratingText = toText(ratingElement);
            if (ratingText) {
              const ratingMatch = ratingText.match(/(\d+\.\d+)/);
              if (ratingMatch) {
                score = Number(ratingMatch[1]);
              }
            }

            const imgElement = card.querySelector('img');
            const imageUrl = imgElement?.getAttribute('src') || imgElement?.getAttribute('data-src') || undefined;

            let latitude: number | undefined;
            let longitude: number | undefined;
            const coordMatch = href.match(/[?&]data=!4m\d+!3m\d+!1s[^!]+!8m\d+!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
            if (coordMatch) {
              latitude = Number(coordMatch[1]);
              longitude = Number(coordMatch[2]);
            } else {
              const atMatch = href.match(/\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
              if (atMatch) {
                latitude = Number(atMatch[1]);
                longitude = Number(atMatch[2]);
              }
            }

            restaurants.push({
              name,
              address: address || undefined,
              score,
              imageUrl,
              detailLink: href.startsWith('http') ? href : `https://www.google.com${href}`,
              latitude,
              longitude,
            });
          }

          return restaurants;
        }, SPONSORED_LABELS);
      } catch (evalError) {
        logger.error('Error in restaurant extraction during scroll', {
          error: evalError instanceof Error ? evalError.message : String(evalError),
        });
      }

      // Process new restaurants
      let newRestaurantsCount = 0;
      for (const restaurantData of restaurantsOnPage) {
        if (restaurantData.detailLink && !processedLinks.has(restaurantData.detailLink)) {
          processedLinks.add(restaurantData.detailLink);
          const restaurant: RestaurantItem = {
            name: restaurantData.name,
            address: restaurantData.address,
            score: restaurantData.score,
            imageUrl: restaurantData.imageUrl,
            detailLink: restaurantData.detailLink,
            latitude: restaurantData.latitude,
            longitude: restaurantData.longitude,
          };
          allRestaurants.push(restaurant);
          newRestaurantsCount++;
        }
      }

      if (restaurantsOnPage.length === previousRestaurantCount) {
        noNewContentCount++;
      } else {
        noNewContentCount = 0;
        previousRestaurantCount = restaurantsOnPage.length;
      }

      if (newRestaurantsCount === 0) {
        noNewContentCount++;
      }

      logger.info(`Scroll ${scrollAttempts}: Found ${newRestaurantsCount} new restaurants, total: ${allRestaurants.length}`);
    }

    onStream?.({
      type: 'progress',
      message: `Completed extraction: ${allRestaurants.length} restaurants found`,
      progress: 100,
    });

    logger.info(`Total restaurants extracted: ${allRestaurants.length}`);
    return allRestaurants;
  } catch (error) {
    logger.error('Error crawling Google Maps restaurant list', error);
    onStream?.({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

