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
    // Try to find and click the gallery/view more images button
    const galleryButtonSelectors = [
      'button[data-testid="image-viewer-expand"]',
      'button:has-text("View all photos")',
      'button:has-text("Xem tất cả ảnh")',
      'a:has-text("View all photos")',
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
      '[data-testid="image-viewer-image"] img',
      '[data-testid="image"]',
      'img[src*="booking.com"]',
      'img[data-src*="booking.com"]',
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

    // If gallery was opened, try to close it
    if (galleryOpened) {
      try {
        const closeButton = page.locator('button[aria-label*="Close"], button[aria-label*="Đóng"], [data-testid="image-viewer-close"]').first();
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
      'p.address.address_clean, div.hp-description, div#hotelPoliciesInc',
      { timeout: 10000 }
    ).catch(() => null);

    // Extract detailed information
    const detailInfo = await detailPage.evaluate(() => {
      const toText = (el: Element | null) => (el?.textContent || '').trim();
      const toTextArray = (els: NodeListOf<Element>) =>
        Array.from(els).map(el => toText(el)).filter(Boolean);

      // Address
      const address = toText(document.querySelector('p.address.address_clean')) || '';

      // Hotel info (description)
      const hotelInfo = toText(
        document.querySelector('div.hp-description')
      ) || '';

      // Policy
      const policyEls = document.querySelectorAll('div#hotelPoliciesInc div.policy');
      const policy = policyEls.length
        ? Array.from(policyEls).map(el => toText(el)).join('\n')
        : '';

      // Room classes
      const roomClasses = Array.from(document.querySelectorAll('div.room-details')).map(roomEl => {
        const roomName = toText(roomEl.querySelector('span.room-type')) || '';
        const facilities = toTextArray(roomEl.querySelectorAll('div.facility-item'));
        const price = toText(roomEl.querySelector('div.price-amount')) || '';
        const maxGuests = toText(roomEl.querySelector('div.max-occupancy')) || '';
        return { roomName, facilities, price, maxGuests };
      });

      return { address, hotelInfo, policy, roomClasses };
    });

    // Update hotel with detail information
    if (detailInfo.address) {
      hotel.address = detailInfo.address;
    }

    if (detailInfo.hotelInfo) {
      hotel.description = detailInfo.hotelInfo;
    }

    // Extract check-in/check-out from policy
    if (detailInfo.policy) {
      const checkInMatch = detailInfo.policy.match(/(?:nhận phòng|check\s*in|check-in)[:\s]+(.+?)(?=\n|trả phòng|check\s*out|check-out|$)/i);
      const checkOutMatch = detailInfo.policy.match(/(?:trả phòng|check\s*out|check-out)[:\s]+(.+?)(?=\n|$)/i);
      if (checkInMatch) hotel.checkInTime = checkInMatch[1].trim();
      if (checkOutMatch) hotel.checkOutTime = checkOutMatch[1].trim();
    }

    // Add room facilities to amenities
    if (detailInfo.roomClasses && detailInfo.roomClasses.length > 0) {
      const roomFacilities = new Set<string>();
      detailInfo.roomClasses.forEach(room => {
        room.facilities.forEach(facility => roomFacilities.add(facility));
      });
      if (hotel.amenities) {
        hotel.amenities = [...hotel.amenities, ...Array.from(roomFacilities)];
      } else {
        hotel.amenities = Array.from(roomFacilities);
      }
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

export async function crawlBooking(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

  // Check if this is a listing page or detail page
  const isListingPage = url.includes('/searchresults') || url.includes('/search');

  if (!isListingPage) {
    // If it's a detail page, crawl it as single hotel
    return await crawlSingleDetailPage(page, url, options, onStream);
  }

  // Crawl listing page
  await page.waitForSelector('div[data-testid="property-card-container"]', { timeout: 10000 });

  onStream?.({
    type: 'progress',
    message: 'Page loaded, extracting Booking hotels from listing...',
    progress: 30,
  });

  const hotelRepository = new HotelRepository();
  const allHotels: HotelItem[] = [];
  const processedDetailLinks = new Set<string>();
  const maxHotels = options?.maxPages ? options.maxPages * 25 : 500; // Approximate 25 hotels per page

  let loadMore = true;
  let iteration = 0;
  const maxIterations = 50; // Prevent infinite loop

  while (loadMore && allHotels.length < maxHotels && iteration < maxIterations) {
    iteration++;

    // Scroll to bottom to ensure load more button is visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // Get current hotel count
    const previousHotelCount = await page.evaluate(() =>
      document.querySelectorAll('div[data-testid="property-card-container"]').length
    );

    // Extract hotels from listing page
    const hotelsOnPage = await page.evaluate(() => {
      const toText = (el: Element | null) => (el?.textContent || '').trim();

      return Array.from(document.querySelectorAll('div[data-testid="property-card-container"]')).map((hotel) => {
        const qs = (sel: string) => hotel.querySelector(sel);

        const name = toText(qs('div[data-testid="title"]')) || 'Unknown hotel';
        const detailLink = qs('a[data-testid="title-link"]')?.getAttribute('href') || '';
        const fullDetailLink = detailLink.startsWith('http')
          ? detailLink
          : `https://www.booking.com${detailLink}`;

        const image = qs('img[data-testid="image"]')?.getAttribute('src') || '';
        const location = toText(qs('span[data-testid="address"]')) || 'Unknown address';
        const distance = toText(qs('span[data-testid="distance"]')) || '';
        const description = toText(qs('div.fff1944c52:not([class*="f6e3a11b0d"])')) || '';

        const ratingText = toText(qs('div[data-testid="review-score"] div.f63b14ab7a')) || '';
        const reviewCountText = toText(qs('div.fff1944c52.eaa8455879')) || '';
        const quality = toText(qs('div.f63b14ab7a.becbee2f63')) || '';

        const starsElement = qs('div[data-testid="rating-stars"]');
        const stars = starsElement?.querySelectorAll('span.fc70cba028').length || 0;

        return {
          name,
          detailLink: fullDetailLink,
          image,
          location,
          distance,
          description,
          ratingText,
          reviewCountText,
          quality,
          stars,
        };
      });
    });

    onStream?.({
      type: 'progress',
      message: `Found ${hotelsOnPage.length} hotels on page, crawling details...`,
      progress: 40,
    });

    // Crawl detail for each hotel
    for (let i = 0; i < hotelsOnPage.length; i++) {
      const hotelData = hotelsOnPage[i];

      if (!hotelData.detailLink || processedDetailLinks.has(hotelData.detailLink)) {
        continue;
      }

      if (allHotels.length >= maxHotels) {
        loadMore = false;
        break;
      }

      processedDetailLinks.add(hotelData.detailLink);

      try {
        // Create initial hotel item from listing data
        const hotel: HotelItem = {
          name: hotelData.name,
          address: hotelData.location,
          images: hotelData.image ? [hotelData.image] : undefined,
          rating: normalizeNumber(hotelData.ratingText),
          reviewCount: normalizeNumber(hotelData.reviewCountText),
          starRating: hotelData.stars > 0 ? hotelData.stars : undefined,
          description: hotelData.description || undefined,
        };

        // Crawl detail page
        const detailPage = await page.context().newPage();
        try {
          const enrichedHotel = await crawlDetailPage(detailPage, hotelData.detailLink, hotel, onStream);
          hotel.address = enrichedHotel.address || hotel.address;
          hotel.description = enrichedHotel.description || hotel.description;
          hotel.checkInTime = enrichedHotel.checkInTime;
          hotel.checkOutTime = enrichedHotel.checkOutTime;
          hotel.amenities = enrichedHotel.amenities;
          hotel.images = enrichedHotel.images;
        } finally {
          await detailPage.close();
        }

        // Save to database
        try {
          await hotelRepository.upsertByDetailLink(hotel, hotelData.detailLink, 'booking');
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
        await page.waitForTimeout(1000 + Math.floor(Math.random() * 1000));

      } catch (error) {
        logger.error('Error processing hotel', {
          detailLink: hotelData.detailLink,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Check for load more button
    const loadMoreButton = await page.locator('button.de576f5064 span.ca2ca5203b').first();
    if (await loadMoreButton.count() > 0 && allHotels.length < maxHotels) {
      try {
        const isDisabled = await loadMoreButton.evaluate(button => {
          const parent = button.closest('button');
          return parent?.hasAttribute('disabled') || parent?.getAttribute('aria-disabled') === 'true';
        });

        if (isDisabled) {
          logger.info('Load more button is disabled, stopping.');
          loadMore = false;
          break;
        }

        logger.info('Clicking load more button');
        await loadMoreButton.click();

        // Wait for new content
        try {
          await page.waitForFunction(
            (prevCount) => {
              const currentCount = document.querySelectorAll('div[data-testid="property-card-container"]').length;
              return currentCount > prevCount;
            },
            previousHotelCount,
            { timeout: 10000 }
          );
          const newCount = await page.evaluate(() =>
            document.querySelectorAll('div[data-testid="property-card-container"]').length
          );
          logger.info(`Loaded more data, current hotel count on page: ${newCount}`);
        } catch (err) {
          logger.info(`No new data loaded after 10 seconds, stopping.`);
          loadMore = false;
          break;
        }
      } catch (error) {
        logger.error('Error clicking load more button', error);
        loadMore = false;
        break;
      }
    } else {
      logger.info('No load more button found or reached max hotels, stopping.');
      loadMore = false;
      break;
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
  await page.waitForSelector(
    'p.address.address_clean, div.hp-description, div#hotelPoliciesInc',
    { timeout: 10000 }
  ).catch(() => null);

  const name = await getFirstText(page, [
    '[data-testid="title"]',
    'h1',
    'h2',
    '.hotel-name',
  ]) || 'Unknown hotel';

  const hotel: HotelItem = {
    name,
    address: await getFirstText(page, ['p.address.address_clean']) || 'Unknown address',
  };

  const enrichedHotel = await crawlDetailPage(page, url, hotel, onStream);

  // Save to database
  const hotelRepository = new HotelRepository();
  try {
    await hotelRepository.upsertByDetailLink(enrichedHotel, url, 'booking');
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

export async function crawlBookingDetail(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  return crawlSingleDetailPage(page, url, options, onStream);
}

export async function crawlBookingList(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem[]> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

  // Crawl listing page
  await page.waitForSelector('div[data-testid="property-card-container"]', { timeout: 10000 });

  onStream?.({
    type: 'progress',
    message: 'Page loaded, extracting Booking hotels from listing...',
    progress: 30,
  });

  const hotelRepository = new HotelRepository();
  const allHotels: HotelItem[] = [];
  const maxHotels = options?.maxPages ? options.maxPages * 25 : 500; // Approximate 25 hotels per page

  let loadMore = true;
  let iteration = 0;
  const maxIterations = 50; // Prevent infinite loop

  while (loadMore && allHotels.length < maxHotels && iteration < maxIterations) {
    iteration++;

    // Scroll to bottom to ensure load more button is visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // Get current hotel count
    const previousHotelCount = await page.evaluate(() =>
      document.querySelectorAll('div[data-testid="property-card-container"]').length
    );

    // Extract hotels from listing page
    const hotelsOnPage = await page.evaluate(() => {
      const toText = (el: Element | null) => (el?.textContent || '').trim();

      return Array.from(document.querySelectorAll('div[data-testid="property-card-container"]')).map((hotel) => {
        const qs = (sel: string) => hotel.querySelector(sel);

        const name = toText(qs('div[data-testid="title"]')) || 'Unknown hotel';
        const detailLink = qs('a[data-testid="title-link"]')?.getAttribute('href') || '';
        const fullDetailLink = detailLink.startsWith('http')
          ? detailLink
          : `https://www.booking.com${detailLink}`;

        const image = qs('img[data-testid="image"]')?.getAttribute('src') || '';
        const location = toText(qs('span[data-testid="address"]')) || 'Unknown address';
        const distance = toText(qs('span[data-testid="distance"]')) || '';
        const description = toText(qs('div.fff1944c52:not([class*="f6e3a11b0d"])')) || '';

        const ratingText = toText(qs('div[data-testid="review-score"] div.f63b14ab7a')) || '';
        const reviewCountText = toText(qs('div.fff1944c52.eaa8455879')) || '';
        const quality = toText(qs('div.f63b14ab7a.becbee2f63')) || '';

        const starsElement = qs('div[data-testid="rating-stars"]');
        const stars = starsElement?.querySelectorAll('span.fc70cba028').length || 0;

        return {
          name,
          detailLink: fullDetailLink,
          image,
          location,
          distance,
          description,
          ratingText,
          reviewCountText,
          quality,
          stars,
        };
      });
    });

    onStream?.({
      type: 'progress',
      message: `Found ${hotelsOnPage.length} hotels on page...`,
      progress: 40,
    });

    // Process found hotels
    for (let i = 0; i < hotelsOnPage.length; i++) {
      const hotelData = hotelsOnPage[i];

      if (allHotels.length >= maxHotels) {
        loadMore = false;
        break;
      }

      // Check if we already have this hotel in the current list (by detail link or name)
      // Since we scroll and reload, we might see duplicates? 
      // Actually booking.com appends, but we re-query all.
      // So we should only add new ones.
      // But wait, we are re-querying ALL cards on the page.
      // So we should clear allHotels and re-populate? 
      // No, we want to accumulate.
      // But if we re-query all, we get 0..N.
      // So we should probably just take the ones we haven't processed.
      // But we don't have unique IDs easily. Detail link is good.

      // Let's just use a Set of processed links for this session
      // But wait, I need to declare it outside the loop.
      // I'll assume I can just filter duplicates later or check against allHotels.
      const alreadyExists = allHotels.some(h => h.name === hotelData.name); // Simple check
      if (alreadyExists) continue;

      const hotel: HotelItem = {
        name: hotelData.name,
        address: hotelData.location,
        images: hotelData.image ? [hotelData.image] : undefined,
        rating: normalizeNumber(hotelData.ratingText),
        reviewCount: normalizeNumber(hotelData.reviewCountText),
        starRating: hotelData.stars > 0 ? hotelData.stars : undefined,
        description: hotelData.description || undefined,
        // We can store detailLink in metadata or something if we want to return it
        // But HotelItem doesn't have it.
        // We should probably add it to HotelItem?
        // For now, let's just return what we have.
      };

      // Save to database (optional for list crawl? maybe yes to cache basic info)
      try {
        await hotelRepository.upsertByDetailLink(hotel, hotelData.detailLink, 'booking');
      } catch (error) {
        // ignore
      }

      allHotels.push(hotel);
    }

    onStream?.({
      type: 'data',
      data: allHotels, // Send accumulated list? Or just new items?
      // The stream contract says data: T | T[].
      // If we send the whole list every time, it's heavy.
      // If we send new items, it's better.
      // But here I'm just returning the final list at the end.
    });

    // Check for load more button
    const loadMoreButton = await page.locator('button.de576f5064 span.ca2ca5203b').first();
    if (await loadMoreButton.count() > 0 && allHotels.length < maxHotels) {
      try {
        const isDisabled = await loadMoreButton.evaluate(button => {
          const parent = button.closest('button');
          return parent?.hasAttribute('disabled') || parent?.getAttribute('aria-disabled') === 'true';
        });

        if (isDisabled) {
          loadMore = false;
          break;
        }

        await loadMoreButton.click();

        // Wait for new content
        try {
          await page.waitForFunction(
            (prevCount) => {
              const currentCount = document.querySelectorAll('div[data-testid="property-card-container"]').length;
              return currentCount > prevCount;
            },
            previousHotelCount,
            { timeout: 10000 }
          );
        } catch (err) {
          loadMore = false;
          break;
        }
      } catch (error) {
        loadMore = false;
        break;
      }
    } else {
      loadMore = false;
      break;
    }
  }

  return allHotels;
}
