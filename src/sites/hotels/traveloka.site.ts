import { Page } from 'playwright';
import { HotelItem, CrawlOptions, StreamCallback } from '../../types/crawl';
import { HotelRepository } from '../../repositories/hotel.repository';
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
  const numeric = text.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const value = Number(numeric);
  return Number.isFinite(value) ? value : undefined;
}

async function collectImages(page: Page): Promise<string[]> {
  const imageUrls = new Set<string>();
  
  try {
    // Collect images from various selectors
    const imageSelectors = [
      'img[data-testid*="image"]',
      'img[data-testid*="photo"]',
      'img[src*="traveloka"]',
      'img[data-src*="traveloka"]',
    ];

    for (const selector of imageSelectors) {
      try {
        const images = await page.locator(selector).all();
        for (const img of images) {
          const src = await img.getAttribute('src');
          const dataSrc = await img.getAttribute('data-src');
          const imageUrl = src || dataSrc;
          
          if (imageUrl && !imageUrl.startsWith('data:')) {
            const cleanUrl = imageUrl.split('?')[0];
            imageUrls.add(cleanUrl);
          }
        }
      } catch {
        // Continue to next selector
      }
    }
  } catch (error) {
    logger.error('Error collecting images', error);
  }

  return Array.from(imageUrls);
}

async function crawlDetailPage(
  detailPage: Page,
  detailLink: string,
  hotel: HotelItem,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  try {
    await detailPage.goto(detailLink, { 
      waitUntil: 'domcontentloaded', 
      timeout: 20000 
    });

    // Wait for main selectors
    await detailPage.waitForSelector(
      'h3[data-testid="tvat-hotelName"], div[data-testid="tvat-hotelLocation"]',
      { timeout: 10000 }
    ).catch(() => null);

    // Extract detailed information
    const detailInfo = await detailPage.evaluate(() => {
      const toText = (el: Element | null) => (el?.textContent || '').trim();
      const toTextArray = (els: NodeListOf<Element>) => 
        Array.from(els).map(el => toText(el)).filter(Boolean);

      // Hotel name
      const name = toText(document.querySelector('h3[data-testid="tvat-hotelName"]')) || '';

      // Address
      const address = toText(document.querySelector('div[data-testid="tvat-hotelLocation"]')) || '';

      // Description
      const description = toText(document.querySelector('[data-testid*="description"]')) || '';

      // Rating
      const ratingText = toText(document.querySelector('div[data-testid="tvat-ratingScore"]')) || '';
      const rating = ratingText ? parseFloat(ratingText.split(' ')[0]) : null;

      // Review count
      const reviewCountText = toText(document.querySelector('[data-testid*="review"]')) || '';
      const reviewCount = reviewCountText ? parseInt(reviewCountText.replace(/[^0-9]/g, ''), 10) : null;

      // Amenities
      const amenities = toTextArray(document.querySelectorAll('[data-testid*="amenity"], [data-testid*="facility"]'));

      return { name, address, description, rating, reviewCount, amenities };
    });

    // Update hotel with detail information
    if (detailInfo.name) {
      hotel.name = detailInfo.name;
    }
    if (detailInfo.address) {
      hotel.address = detailInfo.address;
    }
    if (detailInfo.description) {
      hotel.description = detailInfo.description;
    }
    if (detailInfo.rating !== null) {
      hotel.rating = detailInfo.rating;
    }
    if (detailInfo.reviewCount !== null) {
      hotel.reviewCount = detailInfo.reviewCount;
    }
    if (detailInfo.amenities.length > 0) {
      hotel.amenities = detailInfo.amenities;
    }

    // Collect images from detail page
    const detailImages = await collectImages(detailPage);
    if (detailImages.length > 0) {
      hotel.images = [...(hotel.images || []), ...detailImages];
      // Remove duplicates
      hotel.images = Array.from(new Set(hotel.images));
    }

  } catch (error) {
    logger.error('Error crawling detail page', { 
      detailLink, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }

  return hotel;
}

export async function crawlTraveloka(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  
  // Check if this is a listing page or detail page
  const isListingPage = url.includes('/hotel/search') || url.includes('/search');
  
  if (!isListingPage) {
    // If it's a detail page, crawl it as single hotel
    return await crawlSingleDetailPage(page, url, options, onStream);
  }

  // Set extra HTTP headers to avoid blocking
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  });

  // Wait for page to load completely
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2000 + Math.random() * 2000); // Random delay

  // Try multiple selectors to find hotel items
  const possibleSelectors = [
    'div[data-testid="tvat-searchListItem"]',
    '[data-testid="tvat-searchListItem"]',
    '[data-testid*="searchListItem"]',
    '[data-testid*="hotel-item"]',
    '[data-testid*="hotel-card"]',
  ];

  let selectorFound = false;
  let hotelsOnPage: Array<{
    title: string;
    detailLink: string;
    mainImage: string;
    location: string;
    ratingScore: string;
    discountedPrice: string;
  }> = [];

  for (const selector of possibleSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000, state: 'attached' }).catch(() => null);
      
      const itemCount = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
      }, selector);

      if (itemCount > 0) {
        logger.info(`Found ${itemCount} items with selector: ${selector}`);
        selectorFound = true;

        hotelsOnPage = await page.evaluate((sel) => {
          const toText = (el: Element | null) => (el?.textContent || '').trim();
          
          return Array.from(document.querySelectorAll(sel)).map((item) => {
            const qs = (sel: string, parent: Element = item) => {
              try {
                return parent.querySelector(sel);
              } catch {
                return null;
              }
            };

            // Get detail link
            const contentElement = qs('div[data-testid="tvat-searchListItem-content"]') || 
                                  qs('[data-testid*="content"]') ||
                                  qs('a') ||
                                  item;
            
            let detailLink = '';
            if (contentElement) {
              detailLink = contentElement.getAttribute('href') || 
                          contentElement.closest('a')?.getAttribute('href') || 
                          contentElement.querySelector('a')?.getAttribute('href') || '';
              
              if (!detailLink) {
                const clickableElements = contentElement.querySelectorAll('[tabindex="0"], [role="button"], a');
                for (const element of clickableElements) {
                  const href = element.getAttribute('href') || element.getAttribute('data-href');
                  if (href) {
                    detailLink = href;
                    break;
                  }
                }
              }
              
              if (detailLink && !detailLink.startsWith('http')) {
                detailLink = `https://www.traveloka.com${detailLink}`;
              }
            }

            // Get hotel name
            const titleSelectors = [
              'h3[data-testid="tvat-hotelName"]',
              '[data-testid="tvat-hotelName"]',
              '[data-testid*="hotelName"]',
              'h3',
              'h2',
            ];
            
            let title = '';
            for (const titleSel of titleSelectors) {
              const titleEl = qs(titleSel);
              if (titleEl && titleEl.textContent?.trim()) {
                title = titleEl.textContent.trim();
                break;
              }
            }

            // Fallback: create link from title if not found
            if (!detailLink && title) {
              detailLink = `https://www.traveloka.com/vi-vn/hotel/search?q=${encodeURIComponent(title)}`;
            }

            // Get main image
            const mainImageSelectors = [
              'img[data-testid="list-view-card-main-image"]',
              '[data-testid*="main-image"]',
              'img[data-testid*="image"]',
              'img',
            ];
            
            let mainImage = '';
            for (const imgSel of mainImageSelectors) {
              const imgEl = qs(imgSel);
              if (imgEl && imgEl.getAttribute('src')) {
                mainImage = imgEl.getAttribute('src') || '';
                break;
              }
            }

            // Get location
            const locationSelectors = [
              'div[data-testid="tvat-hotelLocation"]',
              '[data-testid*="location"]',
              '[data-testid*="address"]',
            ];
            
            let location = '';
            for (const locSel of locationSelectors) {
              const locEl = qs(locSel);
              if (locEl) {
                location = locEl.querySelector('div[dir="auto"]')?.textContent?.trim() || 
                          locEl.textContent?.trim() || '';
                if (location) break;
              }
            }

            // Get rating score
            const ratingSelectors = [
              'div[data-testid="tvat-ratingScore"]',
              '[data-testid*="rating"]',
              '[data-testid*="score"]',
            ];
            
            let ratingScore = '';
            for (const ratingSel of ratingSelectors) {
              const ratingEl = qs(ratingSel);
              if (ratingEl && ratingEl.textContent?.trim()) {
                ratingScore = ratingEl.textContent.trim().split(' ')[0];
                break;
              }
            }

            // Get price
            const priceSelectors = [
              'div[data-testid="tvat-hotelPrice"]',
              '[data-testid*="price"]',
            ];
            
            let discountedPrice = '';
            for (const priceSel of priceSelectors) {
              const priceEl = qs(priceSel);
              if (priceEl && priceEl.textContent?.trim()) {
                discountedPrice = priceEl.textContent.trim();
                break;
              }
            }

            return {
              title,
              detailLink,
              mainImage,
              location,
              ratingScore,
              discountedPrice,
            };
          });
        }, selector);

        break;
      }
    } catch (err) {
      logger.info(`Selector ${selector} not found: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  if (!selectorFound || hotelsOnPage.length === 0) {
    logger.warning('No hotel items found on listing page');
    return {
      name: 'No hotels found',
      address: 'Unknown address',
    };
  }

  onStream?.({
    type: 'progress',
    message: `Found ${hotelsOnPage.length} hotels, crawling details...`,
    progress: 40,
  });

  const hotelRepository = new HotelRepository();
  const allHotels: HotelItem[] = [];
  const processedDetailLinks = new Set<string>();
  const maxHotels = options?.maxPages ? options.maxPages * 25 : 500; // Approximate 25 hotels per page

  // Crawl detail for each hotel
  for (let i = 0; i < hotelsOnPage.length && allHotels.length < maxHotels; i++) {
    const hotelData = hotelsOnPage[i];
    
    if (!hotelData.detailLink || processedDetailLinks.has(hotelData.detailLink)) {
      continue;
    }

    processedDetailLinks.add(hotelData.detailLink);

    try {
      // Create initial hotel item from listing data
      const hotel: HotelItem = {
        name: hotelData.title || 'Unknown hotel',
        address: hotelData.location || 'Unknown address',
        images: hotelData.mainImage ? [hotelData.mainImage] : undefined,
        rating: normalizeNumber(hotelData.ratingScore),
        priceFrom: normalizeNumber(hotelData.discountedPrice),
        currency: 'VND', // Traveloka typically uses VND
      };

      // Crawl detail page
      const detailPage = await page.context().newPage();
      try {
        const enrichedHotel = await crawlDetailPage(detailPage, hotelData.detailLink, hotel, onStream);
        hotel.name = enrichedHotel.name || hotel.name;
        hotel.address = enrichedHotel.address || hotel.address;
        hotel.description = enrichedHotel.description;
        hotel.rating = enrichedHotel.rating || hotel.rating;
        hotel.reviewCount = enrichedHotel.reviewCount;
        hotel.amenities = enrichedHotel.amenities;
        hotel.images = enrichedHotel.images;
      } finally {
        await detailPage.close();
      }

      // Save to database
      try {
        await hotelRepository.upsertByDetailLink(hotel, hotelData.detailLink, 'traveloka');
        logger.info('Hotel saved to database', { 
          name: hotel.name, 
          detailLink: hotelData.detailLink 
        });
      } catch (error) {
        logger.error('Failed to save hotel to database', {
          name: hotel.name,
          detailLink: hotelData.detailLink,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      allHotels.push(hotel);

      // Emit progress
      onStream?.({
        type: 'data',
        data: hotel,
        index: allHotels.length - 1,
        total: hotelsOnPage.length,
      });

      onStream?.({
        type: 'progress',
        message: `Processed ${allHotels.length} hotels`,
        progress: 50 + Math.floor((allHotels.length / maxHotels) * 40),
      });

      // Small delay between requests
      await page.waitForTimeout(1000 + Math.floor(Math.random() * 2000));

    } catch (error) {
      logger.error('Error processing hotel', {
        detailLink: hotelData.detailLink,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Return first hotel (to match return type, but all hotels are already saved to DB)
  return allHotels[0] || {
    name: 'No hotels found',
    address: 'Unknown address',
  };
}

async function crawlSingleDetailPage(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(2000);

  const name = await getFirstText(page, [
    'h3[data-testid="tvat-hotelName"]',
    '[data-testid="tvat-hotelName"]',
    '[data-testid*="hotelName"]',
    'h3',
    'h1',
  ]) || 'Unknown hotel';

  const hotel: HotelItem = {
    name,
    address: await getFirstText(page, [
      'div[data-testid="tvat-hotelLocation"]',
      '[data-testid*="location"]',
      '[data-testid*="address"]',
    ]) || 'Unknown address',
  };

  const enrichedHotel = await crawlDetailPage(page, url, hotel, onStream);
  
  // Save to database
  const hotelRepository = new HotelRepository();
  try {
    await hotelRepository.upsertByDetailLink(enrichedHotel, url, 'traveloka');
  } catch (error) {
    logger.error('Failed to save hotel to database', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  onStream?.({
    type: 'data',
    data: enrichedHotel,
  });

  return enrichedHotel;
}
