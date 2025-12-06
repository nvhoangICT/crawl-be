import { Page } from 'playwright';
import { HotelItem, CrawlOptions, StreamCallback } from '../../types/crawl';
import { HotelRepository } from '../../repositories/hotel.repository';
import { logger } from '../../utils/logger';

function normalizeNumber(text?: string): number | undefined {
  if (!text) return undefined;
  const numeric = text.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const value = Number(numeric);
  return Number.isFinite(value) ? value : undefined;
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
      timeout: 20000,
    });

    // Wait for main content
    await detailPage.waitForSelector('h1, .HeaderCerebrum__Name, .PropertyLocation__Text', {
      timeout: 10000,
    }).catch(() => null);

    await detailPage.waitForTimeout(3000); // Wait longer for dynamic content

    // Extract detailed information
    const detailInfo = await detailPage.evaluate(() => {
      const toText = (el: Element | null) => (el?.textContent || '').trim();
      const toTextArray = (els: NodeListOf<Element>) =>
        Array.from(els).map((el) => toText(el)).filter(Boolean);

      // Hotel name
      const name =
        toText(document.querySelector('h1.HeaderCerebrum__Name')) ||
        toText(document.querySelector('h1')) ||
        toText(document.querySelector('[data-selenium="hotel-name"]')) ||
        '';

      // Address
      const address =
        toText(document.querySelector('.PropertyLocation__Text')) ||
        toText(document.querySelector('[data-element-name="property-address"]')) ||
        toText(document.querySelector('[data-selenium="hotel-address"]')) ||
        '';

      // Description - try multiple selectors for full description
      let description = '';
      const descriptionSelectors = [
        '.PropertyDescription__Text',
        '[data-element-name="property-description"]',
        '.PropertyDescription',
        '[data-selenium="property-description"]',
        '.hotel-description',
        '.property-overview',
      ];
      for (const sel of descriptionSelectors) {
        const descEl = document.querySelector(sel);
        if (descEl) {
          description = toText(descEl);
          if (description.length > 50) break; // Prefer longer descriptions
        }
      }

      // Rating
      const ratingText =
        toText(document.querySelector('.Review-facade .Review__Score')) ||
        toText(document.querySelector('[data-element-name="property-rating"]')) ||
        toText(document.querySelector('[data-selenium="hotel-rating"]')) ||
        toText(document.querySelector('.ReviewScore')) ||
        '';
      const rating = ratingText ? parseFloat(ratingText.replace(/[^0-9.]/g, '')) : null;

      // Review count
      const reviewCountText =
        toText(document.querySelector('.Review-facade .Review__Count')) ||
        toText(document.querySelector('[data-element-name="property-review-count"]')) ||
        toText(document.querySelector('[data-selenium="hotel-review-count"]')) ||
        '';
      const reviewCount = reviewCountText
        ? parseInt(reviewCountText.replace(/[^0-9]/g, ''), 10)
        : null;

      // Star rating
      let starRating: number | null = null;
      const starSelectors = [
        '[data-selenium="star-rating"]',
        '.StarRating',
        '[class*="StarRating"]',
        '[class*="star-rating"]',
        '[data-element-name="star-rating"]',
      ];
      for (const sel of starSelectors) {
        const starEl = document.querySelector(sel);
        if (starEl) {
          const starText = toText(starEl);
          const starMatch = starText.match(/(\d+)[-\s]*star/i) || starText.match(/(\d+)/);
          if (starMatch) {
            starRating = parseInt(starMatch[1], 10);
            break;
          }
        }
      }

      // Phone number
      let phone = '';
      const phoneSelectors = [
        'a[href^="tel:"]',
        '[data-selenium="hotel-phone"]',
        '[data-element-name="property-phone"]',
        '.PropertyPhone',
        '[class*="Phone"]',
      ];
      for (const sel of phoneSelectors) {
        const phoneEl = document.querySelector(sel);
        if (phoneEl) {
          phone = phoneEl.getAttribute('href')?.replace(/^tel:/i, '') || toText(phoneEl);
          if (phone) break;
        }
      }

      // Check-in/Check-out times
      let checkInTime = '';
      let checkOutTime = '';
      const policySelectors = [
        '[data-selenium="property-policy"]',
        '.PropertyPolicy',
        '[data-element-name="property-policy"]',
        '.CheckInOut',
        '[class*="Policy"]',
        '[class*="CheckIn"]',
      ];
      for (const sel of policySelectors) {
        const policyEl = document.querySelector(sel);
        if (policyEl) {
          const policyText = toText(policyEl);
          const checkInMatch = policyText.match(
            /(?:nhận phòng|check\s*in|check-in|check in)[:\s]+(.+?)(?=\n|trả phòng|check\s*out|check-out|check out|$)/i,
          );
          const checkOutMatch = policyText.match(
            /(?:trả phòng|check\s*out|check-out|check out)[:\s]+(.+?)(?=\n|$)/i,
          );
          if (checkInMatch) checkInTime = checkInMatch[1].trim();
          if (checkOutMatch) checkOutTime = checkOutMatch[1].trim();
          if (checkInTime || checkOutTime) break;
        }
      }

      // Amenities - try multiple selectors
      const amenitySelectors = [
        '.FacilitiesList__Item',
        '[data-element-name="amenity"]',
        '[data-selenium="amenity"]',
        '.FacilityItem',
        '[class*="Facility"]',
        '[class*="Amenity"]',
      ];
      const amenitiesSet = new Set<string>();
      for (const sel of amenitySelectors) {
        const amenityEls = document.querySelectorAll(sel);
        amenityEls.forEach((el) => {
          const text = toText(el);
          if (text && text.length > 0) {
            amenitiesSet.add(text);
          }
        });
      }
      const amenities = Array.from(amenitiesSet);

      // Images - collect all possible image sources
      const images: string[] = [];
      const imageSelectors = [
        '.Gallery__Image img',
        '[data-element-name="property-image"] img',
        '.PropertyImage img',
        '[data-selenium="property-image"] img',
        '.hotel-image img',
        'img[class*="PropertyImage"]',
        'img[class*="HotelImage"]',
      ];
      const imageUrls = new Set<string>();
      for (const sel of imageSelectors) {
        const imageEls = document.querySelectorAll(sel);
        imageEls.forEach((img) => {
          const src =
            img.getAttribute('src') ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('data-original');
          if (src && !src.startsWith('data:') && !src.includes('placeholder')) {
            imageUrls.add(src);
          }
        });
      }
      const imagesArray = Array.from(imageUrls);

      // Coordinates from map
      let latitude: number | null = null;
      let longitude: number | null = null;
      const mapSelectors = [
        'a[href*="maps.google"]',
        'iframe[src*="maps.google"]',
        'a[href*="google.com/maps"]',
        '[data-selenium="property-map"]',
        '.PropertyMap iframe',
      ];
      for (const sel of mapSelectors) {
        const mapEl = document.querySelector(sel);
        if (mapEl) {
          const href = mapEl.getAttribute('href') || mapEl.getAttribute('src') || '';
          // Try to extract coordinates from Google Maps URL
          const llMatch =
            href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
            href.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/) ||
            href.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
          if (llMatch) {
            latitude = parseFloat(llMatch[1]);
            longitude = parseFloat(llMatch[2]);
            break;
          }
        }
      }

      return {
        name,
        address,
        description,
        rating,
        reviewCount,
        starRating,
        phone,
        checkInTime,
        checkOutTime,
        amenities,
        images: imagesArray,
        latitude,
        longitude,
      };
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
    if (detailInfo.starRating !== null) {
      hotel.starRating = detailInfo.starRating;
    }
    if (detailInfo.phone) {
      hotel.phone = detailInfo.phone;
    }
    if (detailInfo.checkInTime) {
      hotel.checkInTime = detailInfo.checkInTime;
    }
    if (detailInfo.checkOutTime) {
      hotel.checkOutTime = detailInfo.checkOutTime;
    }
    if (detailInfo.amenities.length > 0) {
      // Merge with existing amenities, remove duplicates
      const existingAmenities = hotel.amenities || [];
      const allAmenities = [...new Set([...existingAmenities, ...detailInfo.amenities])];
      hotel.amenities = allAmenities;
    }
    if (detailInfo.images.length > 0) {
      hotel.images = [...(hotel.images || []), ...detailInfo.images];
      // Remove duplicates
      hotel.images = Array.from(new Set(hotel.images));
    }
    if (detailInfo.latitude !== null && detailInfo.longitude !== null) {
      hotel.latitude = detailInfo.latitude;
      hotel.longitude = detailInfo.longitude;
    }
  } catch (error) {
    logger.error('Error crawling detail page', {
      detailLink,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return hotel;
}

export async function crawlAgoda(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

  // Check if this is a listing page or detail page
  const isListingPage = url.includes('/search') || url.includes('/vi-vn/search');

  if (!isListingPage) {
    // If it's a detail page, crawl it as single hotel
    return await crawlSingleDetailPage(page, url, options, onStream);
  }

  // Set extra HTTP headers to avoid blocking
  await page.setExtraHTTPHeaders({
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  });

  onStream?.({
    type: 'progress',
    message: 'Loading Agoda listing page...',
    progress: 10,
  });

  // Wait for contentContainer to load
  await page.waitForSelector('#contentContainer', { timeout: 30000 }).catch(() => null);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(3000 + Math.random() * 2000); // Random delay

  onStream?.({
    type: 'progress',
    message: 'Page loaded, extracting hotel items...',
    progress: 30,
  });

  // Try multiple selectors to find hotel items
  const possibleSelectors = [
    '[data-selenium="hotel-item"]',
    '.PropertyCard',
    '.HotelCard',
    '[data-element-name="hotel-card"]',
    'div[class*="PropertyCard"]',
    'div[class*="HotelCard"]',
    'div[class*="hotel-item"]',
    'div[class*="property-item"]',
    'article[class*="PropertyCard"]',
    'article[class*="HotelCard"]',
  ];

  let selectorFound = false;
  let hotelsOnPage: Array<{
    name: string;
    detailLink: string;
    mainImage: string;
    address: string;
    rating: string;
    reviewCount: string;
    price: string;
  }> = [];

  for (const selector of possibleSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000, state: 'attached' }).catch(() => null);

      const itemCount = await page.evaluate((sel) => {
        const container = document.getElementById('contentContainer');
        if (!container) return 0;
        return container.querySelectorAll(sel).length;
      }, selector);

      if (itemCount > 0) {
        logger.info(`Found ${itemCount} items with selector: ${selector}`);
        selectorFound = true;

        hotelsOnPage = await page.evaluate((sel) => {
          const toText = (el: Element | null) => (el?.textContent || '').trim();
          const container = document.getElementById('contentContainer');
          if (!container) return [];

          return Array.from(container.querySelectorAll(sel)).map((item) => {
            const qs = (sel: string, parent: Element = item) => {
              try {
                return parent.querySelector(sel);
              } catch {
                return null;
              }
            };

            // Get detail link
            let detailLink = '';
            const linkElement =
              qs('a[href*="/hotel/"]') ||
              qs('a[href*="/property/"]') ||
              qs('a') ||
              item.closest('a');
            if (linkElement) {
              detailLink = linkElement.getAttribute('href') || '';
              if (detailLink && !detailLink.startsWith('http')) {
                detailLink = `https://www.agoda.com${detailLink}`;
              }
            }

            // Get hotel name
            const nameSelectors = [
              '[data-selenium="hotel-name"]',
              'h3',
              'h2',
              '[class*="PropertyName"]',
              '[class*="HotelName"]',
              '[data-element-name="hotel-name"]',
            ];
            let name = '';
            for (const nameSel of nameSelectors) {
              const nameEl = qs(nameSel);
              if (nameEl && nameEl.textContent?.trim()) {
                name = nameEl.textContent.trim();
                break;
              }
            }

            // Get address
            const addressSelectors = [
              '[data-selenium="hotel-address"]',
              '[class*="Address"]',
              '[class*="Location"]',
              '[data-element-name="hotel-address"]',
            ];
            let address = '';
            for (const addrSel of addressSelectors) {
              const addrEl = qs(addrSel);
              if (addrEl && addrEl.textContent?.trim()) {
                address = addrEl.textContent.trim();
                break;
              }
            }

            // Get rating
            const ratingSelectors = [
              '[data-selenium="hotel-rating"]',
              '[class*="Rating"]',
              '[class*="Score"]',
              '[data-element-name="hotel-rating"]',
            ];
            let rating = '';
            for (const ratingSel of ratingSelectors) {
              const ratingEl = qs(ratingSel);
              if (ratingEl && ratingEl.textContent?.trim()) {
                rating = ratingEl.textContent.trim();
                break;
              }
            }

            // Get review count
            const reviewSelectors = [
              '[data-selenium="hotel-review-count"]',
              '[class*="Review"]',
              '[class*="ReviewCount"]',
              '[data-element-name="hotel-review-count"]',
            ];
            let reviewCount = '';
            for (const reviewSel of reviewSelectors) {
              const reviewEl = qs(reviewSel);
              if (reviewEl && reviewEl.textContent?.trim()) {
                reviewCount = reviewEl.textContent.trim();
                break;
              }
            }

            // Get price
            const priceSelectors = [
              '[data-selenium="hotel-price"]',
              '[class*="Price"]',
              '[class*="Amount"]',
              '[data-element-name="hotel-price"]',
            ];
            let price = '';
            for (const priceSel of priceSelectors) {
              const priceEl = qs(priceSel);
              if (priceEl && priceEl.textContent?.trim()) {
                price = priceEl.textContent.trim();
                break;
              }
            }

            // Get main image
            const imageSelectors = [
              'img[data-selenium="hotel-image"]',
              'img[class*="PropertyImage"]',
              'img[class*="HotelImage"]',
              'img',
            ];
            let mainImage = '';
            for (const imgSel of imageSelectors) {
              const imgEl = qs(imgSel);
              if (imgEl) {
                mainImage =
                  imgEl.getAttribute('src') ||
                  imgEl.getAttribute('data-src') ||
                  imgEl.getAttribute('data-lazy-src') ||
                  '';
                if (mainImage && !mainImage.startsWith('data:')) {
                  break;
                }
              }
            }

            return {
              name,
              detailLink,
              mainImage,
              address,
              rating,
              reviewCount,
              price,
            };
          });
        }, selector);

        break;
      }
    } catch (err) {
      logger.info(
        `Selector ${selector} not found: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
  }

  if (!selectorFound || hotelsOnPage.length === 0) {
    logger.warn('No hotel items found on listing page');
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
        name: hotelData.name || 'Unknown hotel',
        address: hotelData.address || 'Unknown address',
        images: hotelData.mainImage ? [hotelData.mainImage] : undefined,
        rating: normalizeNumber(hotelData.rating),
        reviewCount: normalizeNumber(hotelData.reviewCount),
        priceFrom: normalizeNumber(hotelData.price),
        currency: hotelData.price?.includes('VND') || hotelData.price?.includes('₫')
          ? 'VND'
          : hotelData.price?.includes('USD') || hotelData.price?.includes('$')
            ? 'USD'
            : 'VND',
      };

      // Crawl detail page
      const detailPage = await page.context().newPage();
      try {
        const enrichedHotel = await crawlDetailPage(detailPage, hotelData.detailLink, hotel, onStream);
        // Update all fields from enriched hotel
        hotel.name = enrichedHotel.name || hotel.name;
        hotel.address = enrichedHotel.address || hotel.address;
        hotel.description = enrichedHotel.description;
        hotel.rating = enrichedHotel.rating || hotel.rating;
        hotel.reviewCount = enrichedHotel.reviewCount;
        hotel.starRating = enrichedHotel.starRating;
        hotel.phone = enrichedHotel.phone;
        hotel.checkInTime = enrichedHotel.checkInTime;
        hotel.checkOutTime = enrichedHotel.checkOutTime;
        hotel.amenities = enrichedHotel.amenities;
        hotel.images = enrichedHotel.images;
        hotel.latitude = enrichedHotel.latitude;
        hotel.longitude = enrichedHotel.longitude;
      } finally {
        await detailPage.close();
      }

      // Save to database
      try {
        await hotelRepository.upsertByDetailLink(hotel, hotelData.detailLink, 'agoda');
        logger.info('Hotel saved to database', {
          name: hotel.name,
          detailLink: hotelData.detailLink,
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
  // Create initial hotel object
  const hotel: HotelItem = {
    name: 'Unknown hotel',
    address: 'Unknown address',
  };

  // Use the detailed crawl function to get all information
  const enrichedHotel = await crawlDetailPage(page, url, hotel, onStream);

  // Save to database
  const hotelRepository = new HotelRepository();
  try {
    await hotelRepository.upsertByDetailLink(enrichedHotel, url, 'agoda');
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
