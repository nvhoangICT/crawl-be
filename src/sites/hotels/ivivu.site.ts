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
      'img[src*="ivivu"]',
      'img[data-src*="ivivu"]',
      '.pdv__content-image img',
      '.hotel-gallery img',
      '.gallery img',
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
              : `https://www.ivivu.com${imageUrl.split('?')[0]}`;
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
      '.ho2__title--address, .hoi__body--html-content, .hu2__body--html-content',
      { timeout: 10000 }
    ).catch(() => null);

    // Extract detailed information
    const detailInfo = await detailPage.evaluate(() => {
      const toText = (el: Element | null) => (el?.textContent || '').trim();
      const toTextArray = (els: NodeListOf<Element>) => 
        Array.from(els).map(el => toText(el)).filter(Boolean);

      // Address
      const address = toText(document.querySelector('.ho2__title--address')) || '';

      // Hotel info (description)
      const hotelInfo = toText(
        document.querySelector('.hoi__body--html-content, .hu2__body--html-content')
      ) || '';

      // Policy
      const policyEls = document.querySelectorAll('.hu2__body--pocily-item');
      const policy = policyEls.length 
        ? Array.from(policyEls).map(el => toText(el)).join('\n')
        : '';

      // Room classes
      const roomClasses = Array.from(document.querySelectorAll('.rcc__container')).map(roomEl => {
        const roomName = toText(roomEl.querySelector('.rccf__text--room-name')) || '';
        const facilities = toTextArray(roomEl.querySelectorAll('.rccf__facilities--text'));
        const price = toText(roomEl.querySelector('.rcct__price--ta-text')) || '';
        const maxGuests = toText(roomEl.querySelector('.rccff__text')) || '';
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
      const checkInMatch = detailInfo.policy.match(/(?:nhận phòng|check\s*in)[:\s]+(.+?)(?=\n|trả phòng|check\s*out|$)/i);
      const checkOutMatch = detailInfo.policy.match(/(?:trả phòng|check\s*out)[:\s]+(.+?)(?=\n|$)/i);
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

export async function crawlIvivu(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  
  // Check if this is a listing page or detail page
  const isListingPage = url.includes('/tim-kiem') || url.includes('/khach-san');
  
  if (!isListingPage) {
    // If it's a detail page, crawl it as single hotel
    return await crawlSingleDetailPage(page, url, options, onStream);
  }

  // Crawl listing page
  await page.waitForSelector('iv-product-view a.pdv__box', { timeout: 10000 });

  onStream?.({
    type: 'progress',
    message: 'Page loaded, extracting Ivivu hotels from listing...',
    progress: 30,
  });

  // Extract hotels from listing page
  const hotelsOnPage = await page.evaluate(() => {
    const toText = (el: Element | null) => (el?.textContent || '').trim();
    
    return Array.from(document.querySelectorAll('iv-product-view a.pdv__box')).map((hotel) => {
      const qs = (sel: string) => hotel.querySelector(sel);
      
      const name = toText(qs('.pdv__hotel-name')) || 'Unknown hotel';
      const detailLink = hotel.getAttribute('href') || '';
      const fullDetailLink = detailLink.startsWith('http')
        ? detailLink
        : `https://www.ivivu.com${detailLink}`;
      
      const image = qs('.pdv__content-image img')?.getAttribute('src') || '';
      const fullImageUrl = image.startsWith('http') 
        ? image 
        : `https://www.ivivu.com${image}`;
      
      const location = toText(qs('.pdv__location-name')) || 'Unknown address';
      
      const extraInfoElement = qs('.pdv__extra-options-box');
      const extraInfo = extraInfoElement
        ? toText(extraInfoElement)
        : '';
      
      const priceText = toText(qs('.pdv__price-text')) || '';
      const roomType = toText(qs('.pdv__price-name')) || '';
      const breakfast = toText(qs('.pdv__price-includes')) || '';
      
      return {
        name,
        detailLink: fullDetailLink,
        image: fullImageUrl,
        location,
        extraInfo,
        priceText,
        roomType,
        breakfast,
      };
    });
  });

  onStream?.({
    type: 'progress',
    message: `Found ${hotelsOnPage.length} hotels, crawling details...`,
    progress: 50,
  });

  const hotelRepository = new HotelRepository();
  const allHotels: HotelItem[] = [];
  const processedDetailLinks = new Set<string>();

  // Crawl detail for each hotel
  for (let i = 0; i < hotelsOnPage.length; i++) {
    const hotelData = hotelsOnPage[i];
    
    if (!hotelData.detailLink || processedDetailLinks.has(hotelData.detailLink)) {
      continue;
    }

    processedDetailLinks.add(hotelData.detailLink);

    try {
      // Create initial hotel item from listing data
      const hotel: HotelItem = {
        name: hotelData.name,
        address: hotelData.location,
        images: hotelData.image ? [hotelData.image] : undefined,
        priceFrom: normalizeNumber(hotelData.priceText),
        currency: 'VND', // Ivivu typically uses VND
        description: hotelData.extraInfo || undefined,
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
        await hotelRepository.upsertByDetailLink(hotel, hotelData.detailLink, 'ivivu');
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
        index: i,
        total: hotelsOnPage.length,
      });

      onStream?.({
        type: 'progress',
        message: `Processed ${i + 1}/${hotelsOnPage.length} hotels`,
        progress: 50 + Math.floor((i + 1) / hotelsOnPage.length * 40),
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

  // Return first hotel (to match return type, but all hotels are already saved to DB)
  // In practice, the caller should use the stream callback to get all hotels
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
    '.ho2__title--address, .hoi__body--html-content, .hu2__body--html-content',
    { timeout: 10000 }
  ).catch(() => null);

  const hotel: HotelItem = {
    name: await getFirstText(page, ['h1', 'h2', '.hotel-name']) || 'Unknown hotel',
    address: await getFirstText(page, ['.ho2__title--address']) || 'Unknown address',
  };

  const enrichedHotel = await crawlDetailPage(page, url, hotel, onStream);
  
  // Save to database
  const hotelRepository = new HotelRepository();
  try {
    await hotelRepository.upsertByDetailLink(enrichedHotel, url, 'ivivu');
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

