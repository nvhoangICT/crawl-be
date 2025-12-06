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
  const numeric = text.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
  const value = Number(numeric);
  return Number.isFinite(value) ? value : undefined;
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
  
  // Extract price number from text before currency symbol
  const priceSection = text.substring(0, currencyIndex).trim();
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

function parseRating(text?: string): { rating?: number; reviewCount?: number } {
  if (!text) return {};
  
  // Pattern: "4,9 (2,0 N)" or "4.9 (2.0 N)" or "4,9 (2.0)" or "4.9 (2000)"
  // Extract rating (decimal number)
  const ratingMatch = text.match(/(\d+[,.]\d+)/);
  let rating: number | undefined;
  if (ratingMatch) {
    rating = normalizeNumber(ratingMatch[1]);
  }
  
  // Extract review count from parentheses
  const reviewMatch = text.match(/\(([\d.,\s]+)\s*[Nn]?\)/);
  let reviewCount: number | undefined;
  if (reviewMatch) {
    const reviewText = reviewMatch[1].replace(/[^\d.,]/g, '').replace(/,/g, '.');
    // Handle formats like "2,0" (2.0) or "2000" (2000)
    const reviewValue = Number(reviewText);
    if (Number.isFinite(reviewValue)) {
      // If value is less than 10, it might be in format "2,0" meaning 2.0, so multiply by 1000
      // Otherwise use as is
      if (reviewValue < 10 && reviewText.includes(',')) {
        reviewCount = Math.round(reviewValue * 1000);
      } else {
        reviewCount = Math.round(reviewValue);
      }
    }
  }
  
  return { rating, reviewCount };
}

function parseStarRating(text?: string): number | undefined {
  if (!text) return undefined;
  
  // Pattern: "5 sao" or "5-star" or "5 star"
  const starMatch = text.match(/(\d+)[-\s]*(?:sao|star)/i);
  if (starMatch) {
    return Number(starMatch[1]);
  }
  
  return undefined;
}

async function collectImages(page: Page): Promise<string[]> {
  const imageUrls = new Set<string>();
  
  try {
    // Collect images from Google Travel hotel cards
    const imageSelectors = [
      'img[src*="googleusercontent"]',
      'img[src*="google"]',
      'img[data-src*="googleusercontent"]',
      'img[data-src*="google"]',
      'div[style*="background-image"]',
    ];

    for (const selector of imageSelectors) {
      try {
        if (selector.includes('background-image')) {
          // Handle background images
          const elements = await page.locator(selector).all();
          for (const el of elements) {
            const style = await el.getAttribute('style');
            if (style) {
              const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
              if (urlMatch && urlMatch[1]) {
                let imageUrl = urlMatch[1].split('?')[0];
                // Get high quality version
                imageUrl = imageUrl
                  .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                  .replace(/=s\d+-k-no/, '=s2048-k-no')
                  .replace(/=w\d+-h\d+/, '=w2048-h2048')
                  .replace(/=s\d+/, '=s2048')
                  .replace(/=w\d+/, '=w2048');
                if (imageUrl && !imageUrl.startsWith('data:')) {
                  imageUrls.add(imageUrl);
                }
              }
            }
          }
        } else {
          // Handle img tags
          const images = await page.locator(selector).all();
          for (const img of images) {
            const src = await img.getAttribute('src');
            const dataSrc = await img.getAttribute('data-src');
            const imageUrl = src || dataSrc;
            
            if (imageUrl && !imageUrl.startsWith('data:')) {
              let cleanUrl = imageUrl.split('?')[0];
              // Get high quality version for Google images
              if (cleanUrl.includes('googleusercontent')) {
                cleanUrl = cleanUrl
                  .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                  .replace(/=s\d+-k-no/, '=s2048-k-no')
                  .replace(/=w\d+-h\d+/, '=w2048-h2048')
                  .replace(/=s\d+/, '=s2048')
                  .replace(/=w\d+/, '=w2048');
              }
              imageUrls.add(cleanUrl);
            }
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
      // Ignore Google-owned helper links
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

async function crawlGoogleTravelDetail(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000); // Wait for dynamic content and tabs to load

  onStream?.({
    type: 'progress',
    message: 'Loading Google Travel detail page...',
    progress: 10,
  });

  // Wait for tabs to appear
  const tabSelectors = [
    'span[role="tab"]',
    'button[role="tab"]',
    '[role="tab"]',
  ];

  let tabsFound = false;
  for (const selector of tabSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 }).catch(() => null);
      const count = await page.locator(selector).count();
      if (count > 0) {
        tabsFound = true;
        logger.info(`Found ${count} tabs`);
        break;
      }
    } catch {
      // Continue to next selector
    }
  }

  // Extract data from all tabs
  const hotelData = await page.evaluate(() => {
    const toText = (el: Element | null) => (el?.textContent || '').trim();
    const cleanAddressText = (value?: string) =>
      (value || '')
        .replace(/[\u2022•·]+/g, ' ') // remove bullet separators
        .replace(/\s+/g, ' ')
        .trim();
    const isLikelyAddress = (value: string) => {
      if (!value) return false;
      if (value === '•') return false;
      if (value.length < 6 || value.length > 160) return false;
      if (!/[A-Za-zÀ-ỹ0-9]/.test(value)) return false;
      const hasComma = value.includes(',');
      const hasKeyword = /(Hà Nội|Hồ Chí Minh|Đà Nẵng|Quảng|Tỉnh|Thành phố|District|Ward|Street|City|Province|Phường|Quận|Đường|Việt Nam)/i.test(
        value,
      );
      const hasNumber = /\d/.test(value);
      return hasComma || (hasKeyword && (hasNumber || value.length > 10));
    };
    const findAddressCandidate = (selector: string) => {
      const elements = Array.from(document.querySelectorAll(selector));
      for (const el of elements) {
        const candidate = cleanAddressText(toText(el));
        if (isLikelyAddress(candidate)) {
          return candidate;
        }
      }
      return '';
    };

    const amenityKeywordMap = [
      { keyword: 'pool', label: 'Pool' },
      { keyword: 'bể bơi', label: 'Bể bơi' },
      { keyword: 'hồ bơi', label: 'Hồ bơi' },
      { keyword: 'spa', label: 'Spa' },
      { keyword: 'wi-fi miễn phí', label: 'Wi-Fi miễn phí' },
      { keyword: 'wi-fi', label: 'Wi-Fi' },
      { keyword: 'wifi', label: 'Wi-Fi' },
      { keyword: 'internet', label: 'Internet' },
      { keyword: 'free wifi', label: 'Free Wi-Fi' },
      { keyword: 'chỗ đậu xe miễn phí', label: 'Chỗ đậu xe miễn phí' },
      { keyword: 'đậu xe miễn phí', label: 'Đậu xe miễn phí' },
      { keyword: 'bãi đỗ xe', label: 'Bãi đỗ xe' },
      { keyword: 'parking', label: 'Parking' },
      { keyword: 'valet parking', label: 'Valet parking' },
      { keyword: 'restaurant', label: 'Restaurant' },
      { keyword: 'nhà hàng', label: 'Nhà hàng' },
      { keyword: 'bar', label: 'Bar' },
      { keyword: 'quán bar', label: 'Quán bar' },
      { keyword: 'breakfast', label: 'Breakfast' },
      { keyword: 'bữa sáng', label: 'Bữa sáng' },
      { keyword: 'gym', label: 'Gym' },
      { keyword: 'fitness', label: 'Fitness center' },
      { keyword: 'phòng gym', label: 'Phòng gym' },
      { keyword: 'trung tâm thể dục', label: 'Trung tâm thể dục' },
      { keyword: 'air conditioning', label: 'Air conditioning' },
      { keyword: 'điều hòa', label: 'Điều hòa' },
      { keyword: 'máy lạnh', label: 'Máy lạnh' },
      { keyword: 'room service', label: 'Room service' },
      { keyword: 'dịch vụ phòng', label: 'Dịch vụ phòng' },
      { keyword: 'laundry', label: 'Laundry' },
      { keyword: 'giặt ủi', label: 'Giặt ủi' },
      { keyword: 'giặt là', label: 'Giặt là' },
      { keyword: 'shuttle', label: 'Shuttle service' },
      { keyword: 'đưa đón sân bay', label: 'Đưa đón sân bay' },
      { keyword: 'xe đưa đón', label: 'Xe đưa đón' },
      { keyword: 'non-smoking', label: 'Non-smoking rooms' },
      { keyword: 'không hút thuốc', label: 'Không hút thuốc' },
      { keyword: 'family rooms', label: 'Family rooms' },
      { keyword: 'phòng gia đình', label: 'Phòng gia đình' },
      { keyword: 'pet friendly', label: 'Pet friendly' },
      { keyword: 'thú cưng', label: 'Cho phép thú cưng' },
      { keyword: 'business center', label: 'Business center' },
      { keyword: 'trung tâm dịch vụ doanh nhân', label: 'Trung tâm dịch vụ doanh nhân' },
      { keyword: 'meeting room', label: 'Meeting room' },
      { keyword: 'phòng họp', label: 'Phòng họp' },
      { keyword: 'conference', label: 'Conference facilities' },
      { keyword: 'hội nghị', label: 'Hội nghị' },
      { keyword: '24-hour front desk', label: '24-hour front desk' },
      { keyword: 'lễ tân 24 giờ', label: 'Lễ tân 24 giờ' },
      { keyword: 'concierge', label: 'Concierge' },
      { keyword: 'elevator', label: 'Elevator' },
      { keyword: 'thang máy', label: 'Thang máy' },
      { keyword: 'an ninh', label: 'An ninh' },
      { keyword: 'két an toàn', label: 'Két an toàn' },
      { keyword: 'ban công', label: 'Ban công' },
      { keyword: 'balcony', label: 'Balcony' },
    ];

    const amenityBlacklistPatterns = [
      /does\s/i,
      /how long/i,
      /approximate/i,
      /temple/i,
      /airport/i,
      /similar hotels/i,
      /vacation rentals/i,
      /see all results/i,
      /currency/i,
      /learn more/i,
      /about this data/i,
      /feedback/i,
      /privacy/i,
      /terms/i,
      /pricing issues/i,
      /help center/i,
      /join user studies/i,
      /vietnam - from your internet address/i,
    ];

    const cleanAmenityText = (value?: string) => {
      if (!value) return '';
      return value
        .replace(/[\u2022•·]+/g, ' ')
        .replace(/([a-zà-ỹ])([A-Z])/g, '$1 $2')
        .replace(/([A-Za-z])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-z])/g, '$1 $2')
        .replace(/Wi-Fifree/gi, 'Wi-Fi free')
        .replace(/Parkingfree/gi, 'Parking free')
        .replace(/freeParking/gi, 'free Parking')
        .replace(/\s+/g, ' ')
        .replace(/^[,;.:\-\s]+|[,;.:\-\s]+$/g, '')
        .trim();
    };

    const isLikelyAmenityText = (value: string) => {
      if (!value) return false;
      if (value.length < 2 || value.length > 60) return false;
      if (value.toLowerCase().startsWith('dolce ')) return false;
      if (amenityBlacklistPatterns.some((pattern) => pattern.test(value))) return false;
      if (/[?]/.test(value)) return false;
      const lower = value.toLowerCase();
      const hasKeyword = amenityKeywordMap.some(({ keyword }) => lower.includes(keyword));
      if (!hasKeyword) return false;
      const wordCount = value.split(/\s+/).length;
      return wordCount <= 10;
    };

    const extractAmenityCandidates = (text?: string) => {
      if (!text) return [];
      const normalized = cleanAmenityText(text);
      if (!normalized) return [];
      const parts = normalized
        .split(/[\n•·]+| {2,}|,\s*|;|\||\/|\?|!|(?:\.\s+)/)
        .map((part) => cleanAmenityText(part))
        .filter((part) => part && isLikelyAmenityText(part));

      const keywordMatches = new Set<string>();
      const lowerNormalized = normalized.toLowerCase();
      amenityKeywordMap.forEach(({ keyword, label }) => {
        if (lowerNormalized.includes(keyword)) {
          keywordMatches.add(label);
        }
      });

      return Array.from(new Set<string>([...parts, ...keywordMatches]));
    };

    const appendAmenities = (target: string[], seen: Set<string>, text?: string) => {
      const candidates = extractAmenityCandidates(text);
      candidates.forEach((candidate) => {
        if (!seen.has(candidate)) {
          seen.add(candidate);
          target.push(candidate);
        }
      });
    };
    
    // Find overview tab panel
    const overviewPanel = document.querySelector('span[role="tabpanel"][id="overview"], div[role="tabpanel"][id="overview"]');
    const overviewText = overviewPanel ? toText(overviewPanel) : '';
    
    // Extract hotel name - prioritize specific h1 element
    let name = '';
    
    // First, try to find name in specific h1 element with class QORQHb fZscne
    const nameEl = document.querySelector('h1.QORQHb.fZscne, h1.QORQHb, h1[class*="QORQHb"][class*="fZscne"]');
    if (nameEl) {
      name = toText(nameEl);
    }
    
    // Fallback: try other h1 selectors
    if (!name) {
      const h1El = document.querySelector('h1');
      if (h1El) {
        const h1Text = toText(h1El);
        // Only use if it doesn't contain common non-name text
        if (h1Text && !h1Text.includes('View all photos') && !h1Text.includes('Đường') && h1Text.length < 100) {
          name = h1Text;
        }
      }
    }
    
    // Fallback: try other name selectors
    if (!name) {
      const nameSelectors = [
        '[data-hotel-name]',
        '[class*="hotel-name"]',
        '[data-name]',
        '[class*="name"]',
      ];
      
      for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const elText = toText(el);
          // Only use if it doesn't contain common non-name text
          if (elText && !elText.includes('View all photos') && !elText.includes('Đường') && elText.length < 100) {
            name = elText;
            break;
          }
        }
      }
    }
    
    // Last fallback: try regex pattern matching (but be careful)
    if (!name) {
      const nameMatch = overviewText.match(/^([^•\n]+?)(?:\s+Khách sạn|\s+\d+\s+sao|•|View all photos)/i);
      if (nameMatch) {
        const candidate = nameMatch[1].trim();
        // Only use if it doesn't contain common non-name text
        if (candidate && !candidate.includes('View all photos') && !candidate.includes('Đường') && candidate.length < 100) {
          name = candidate;
        }
      }
    }
    
    // Final fallback: take first meaningful part (but filter out unwanted text)
    if (!name) {
      const parts = overviewText.split(/[•\n]/);
      for (const part of parts) {
        const trimmed = part.trim();
        // Skip if contains unwanted text or too long
        if (trimmed && 
            !trimmed.includes('View all photos') && 
            !trimmed.includes('Đường') && 
            trimmed.length > 5 && 
            trimmed.length < 100) {
          name = trimmed;
          break;
        }
      }
    }

    // Extract star rating
    let starRating: number | undefined;
    const starMatch = overviewText.match(/(\d+)[-\s]*(?:sao|star)/i);
    if (starMatch) {
      starRating = Number(starMatch[1]);
    }

    // Extract address - prioritize specific address element
    let address = '';
    
    // First, try to find address in specific element with class CFH2De
    address = findAddressCandidate('span.CFH2De, div.CFH2De, [class*="CFH2De"]');
    
    // Fallback: try other address selectors
    if (!address) {
      const addressSelectors = [
        '[data-address]',
        '[class*="address"]',
        '[aria-label*="address" i]',
        '[aria-label*="địa chỉ" i]',
      ];
      
      for (const selector of addressSelectors) {
        const candidate = findAddressCandidate(selector);
        if (candidate) {
          address = candidate;
          break;
        }
      }
    }
    
    // Fallback: try parsing from overview text segments
    if (!address) {
      const segments = overviewText.split(/[•\n]/);
      for (const segment of segments) {
        const candidate = cleanAddressText(segment);
        if (isLikelyAddress(candidate)) {
          address = candidate;
          break;
        }
      }
    }
    
    // Last fallback: try regex pattern matching
    if (!address) {
      const addressMatch = overviewText.match(
        /([A-Za-zÀ-ỹ0-9][^•\n]{6,}?(?:,\s*[^•\n]+){1,3})/,
      );
      if (addressMatch) {
        const candidate = cleanAddressText(addressMatch[1]);
        if (isLikelyAddress(candidate)) {
          address = candidate;
        }
      }
    }

    // Extract price - prioritize specific price element
    let priceText = '';
    let currency = '';
    
    // First, try to find price in specific element with class qQOQpe prxS3d
    const priceEl = document.querySelector('span.qQOQpe.prxS3d, span.qQOQpe, span.prxS3d, [class*="qQOQpe"][class*="prxS3d"]');
    if (priceEl) {
      const priceElText = toText(priceEl);
      const priceMatch = priceElText.match(/([\d.,\s]+)\s*([₫$€£¥₹])/);
      if (priceMatch) {
        priceText = priceMatch[1].trim();
        currency = priceMatch[2];
      }
    }
    
    // Fallback: try other price selectors
    if (!priceText) {
      const priceSelectors = [
        'span[class*="price"]',
        'div[class*="price"]',
        '[data-price]',
        '[aria-label*="₫"]',
        '[aria-label*="$"]',
      ];
      
      for (const selector of priceSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const elText = toText(el);
          const priceMatch = elText.match(/([\d.,\s]+)\s*([₫$€£¥₹])/);
          if (priceMatch) {
            priceText = priceMatch[1].trim();
            currency = priceMatch[2];
            break;
          }
        }
      }
    }
    
    // Last fallback: try regex on overview text (but exclude phone patterns)
    if (!priceText) {
      // Match price pattern but exclude phone number patterns
      // Phone numbers usually have format: 024 3719 9222 (3-4 digits, space, 3-4 digits, space, 3-4 digits)
      // Prices usually have more digits and currency symbol
      const priceMatch = overviewText.match(/([\d.,]{4,})\s*([₫$€£¥₹])/);
      if (priceMatch) {
        // Double check it's not a phone number
        const potentialPrice = priceMatch[1].trim();
        // Phone numbers typically have 8-12 digits total, prices have more
        const digitCount = potentialPrice.replace(/[^\d]/g, '').length;
        if (digitCount > 6) { // Prices usually have more digits than phone numbers
          priceText = potentialPrice;
          currency = priceMatch[2];
        }
      }
    }

    // Extract phone number (after price to avoid conflicts)
    let phone = '';
    // Pattern: "024 3719 9222" or similar phone formats
    // But exclude if it looks like a price (has currency symbol nearby)
    const phoneMatch = overviewText.match(/(\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4})/);
    if (phoneMatch) {
      const phoneCandidate = phoneMatch[1].trim();
      // Check if this is not part of a price (should not have currency symbol nearby)
      const phoneIndex = overviewText.indexOf(phoneCandidate);
      const nearbyText = overviewText.substring(Math.max(0, phoneIndex - 10), phoneIndex + phoneCandidate.length + 10);
      // If no currency symbol nearby, it's likely a phone number
      if (!/[₫$€£¥₹]/.test(nearbyText)) {
        phone = phoneCandidate;
      }
    }

    // Extract rating
    let rating: number | undefined;
    let reviewCount: number | undefined;
    // Pattern: "4,9 Xuất sắc" or "4.9 Excellent"
    const ratingMatch = overviewText.match(/(\d+[,.]\d+)\s*(?:Xuất sắc|Excellent|Tốt|Good)/i);
    if (ratingMatch) {
      rating = Number(ratingMatch[1].replace(',', '.'));
    }

    // Try to find rating in other elements
    const ratingEl = document.querySelector('[data-rating], [class*="rating"]');
    if (ratingEl && !rating) {
      const ratingText = toText(ratingEl);
      const ratingNumMatch = ratingText.match(/(\d+[,.]\d+)/);
      if (ratingNumMatch) {
        rating = Number(ratingNumMatch[1].replace(',', '.'));
      }
    }

    // Extract website
    let website = '';
    const websiteEl = document.querySelector('a[href*="http"]:not([href*="google.com"]):not([href*="maps.google"])');
    if (websiteEl) {
      const href = websiteEl.getAttribute('href') || '';
      if (href && !href.includes('google.com') && !href.includes('maps')) {
        website = href;
      }
    }

    // Extract images with deduplication
    const imageSet = new Set<string>();
    const baseUrlSet = new Set<string>(); // Track base URLs to avoid duplicates
    
    // Helper function to normalize and extract base URL
    const normalizeImageUrl = (url: string): { normalized: string; baseUrl: string } | null => {
      if (!url || url.startsWith('data:')) return null;
      
      // Remove query parameters
      let cleanUrl = url.split('?')[0];
      
      if (!cleanUrl.includes('googleusercontent')) return null;
      
      // Extract base URL (before the first = sign with parameters)
      // Example: https://lh3.googleusercontent.com/p/AF1QipNH2phLXJ7bw_ItZAng5p61Dfdq3Pqs2uZdIaGO=w2048-h2048-k-no
      // Base: https://lh3.googleusercontent.com/p/AF1QipNH2phLXJ7bw_ItZAng5p61Dfdq3Pqs2uZdIaGO
      const equalIndex = cleanUrl.indexOf('=');
      const baseUrl = equalIndex !== -1 ? cleanUrl.substring(0, equalIndex) : cleanUrl;
      
      // Normalize to high quality version
      let normalized = cleanUrl;
      if (normalized.includes('=')) {
        // Replace size parameters with high quality version
        normalized = normalized
          .replace(/=s\d+-k-no/, '=s2048-k-no')
          .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
          .replace(/=w\d+-h\d+-n-k/, '=w2048-h2048-n-k')
          .replace(/=w\d+-h\d+-n-k-rw-no-v1/, '=w2048-h2048-n-k-rw-no-v1')
          .replace(/=w\d+-h\d+/, '=w2048-h2048')
          .replace(/=s\d+/, '=s2048')
          .replace(/=w\d+/, '=w2048');
      } else {
        // If no size parameter, add high quality version
        normalized = `${baseUrl}=w2048-h2048-k-no`;
      }
      
      return { normalized, baseUrl };
    };
    
    // Collect from img elements
    const imgElements = document.querySelectorAll('img[src*="googleusercontent"], img[data-src*="googleusercontent"]');
    imgElements.forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (src) {
        const result = normalizeImageUrl(src);
        if (result && !baseUrlSet.has(result.baseUrl)) {
          baseUrlSet.add(result.baseUrl);
          imageSet.add(result.normalized);
        }
      }
    });
    
    // Also collect from background images
    const bgElements = document.querySelectorAll('[style*="background-image"]');
    bgElements.forEach((el) => {
      const style = el.getAttribute('style') || '';
      const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch && urlMatch[1]) {
        const result = normalizeImageUrl(urlMatch[1]);
        if (result && !baseUrlSet.has(result.baseUrl)) {
          baseUrlSet.add(result.baseUrl);
          imageSet.add(result.normalized);
        }
      }
    });
    
    const images = Array.from(imageSet);

    // Extract amenities with filtering
    const amenities: string[] = [];
    const amenitySet = new Set<string>();
    const amenitiesMatch = overviewText.match(/(?:Tiện nghi|Amenities|Facilities)[:\s]+(.+)/i);
    if (amenitiesMatch) {
      appendAmenities(amenities, amenitySet, amenitiesMatch[1]);
    }

    const amenityElements = document.querySelectorAll('[data-amenity], [class*="amenity"], section, article');
    amenityElements.forEach((el) => {
      const text = toText(el);
      const isTaggedElement = el.matches('[data-amenity], [class*="amenity"]');
      if (!isTaggedElement && !/(Tiện nghi|Amenities|Facilities|Wi-?Fi|Pool|Bể bơi|Spa)/i.test(text)) {
        return;
      }
      appendAmenities(amenities, amenitySet, text);
    });

    return {
      name,
      address,
      phone,
      priceText,
      currency,
      rating,
      reviewCount,
      starRating,
      website,
      images,
      amenities,
      overviewText,
    };
  });

  onStream?.({
    type: 'progress',
    message: 'Extracting data from tabs...',
    progress: 50,
  });

  // Try to click on other tabs to get more information
  const tabNames = ['photos', 'reviews', 'amenities', 'location'];
  for (const tabName of tabNames) {
    try {
      const tabButton = page.locator(`[role="tab"][aria-label*="${tabName}" i], button[aria-label*="${tabName}" i]`).first();
      if (await tabButton.count() > 0) {
        await tabButton.click({ timeout: 3000 });
        await page.waitForTimeout(2000); // Wait for tab content to load
        
        // Extract additional data from this tab
        const additionalData = await page.evaluate((tab) => {
          const toText = (el: Element | null) => (el?.textContent || '').trim();
          const amenityKeywordMap = [
            { keyword: 'pool', label: 'Pool' },
            { keyword: 'bể bơi', label: 'Bể bơi' },
            { keyword: 'hồ bơi', label: 'Hồ bơi' },
            { keyword: 'spa', label: 'Spa' },
            { keyword: 'wi-fi miễn phí', label: 'Wi-Fi miễn phí' },
            { keyword: 'wi-fi', label: 'Wi-Fi' },
            { keyword: 'wifi', label: 'Wi-Fi' },
            { keyword: 'internet', label: 'Internet' },
            { keyword: 'free wifi', label: 'Free Wi-Fi' },
            { keyword: 'chỗ đậu xe miễn phí', label: 'Chỗ đậu xe miễn phí' },
            { keyword: 'đậu xe miễn phí', label: 'Đậu xe miễn phí' },
            { keyword: 'bãi đỗ xe', label: 'Bãi đỗ xe' },
            { keyword: 'parking', label: 'Parking' },
            { keyword: 'valet parking', label: 'Valet parking' },
            { keyword: 'restaurant', label: 'Restaurant' },
            { keyword: 'nhà hàng', label: 'Nhà hàng' },
            { keyword: 'bar', label: 'Bar' },
            { keyword: 'quán bar', label: 'Quán bar' },
            { keyword: 'breakfast', label: 'Breakfast' },
            { keyword: 'bữa sáng', label: 'Bữa sáng' },
            { keyword: 'gym', label: 'Gym' },
            { keyword: 'fitness', label: 'Fitness center' },
            { keyword: 'phòng gym', label: 'Phòng gym' },
            { keyword: 'trung tâm thể dục', label: 'Trung tâm thể dục' },
            { keyword: 'air conditioning', label: 'Air conditioning' },
            { keyword: 'điều hòa', label: 'Điều hòa' },
            { keyword: 'máy lạnh', label: 'Máy lạnh' },
            { keyword: 'room service', label: 'Room service' },
            { keyword: 'dịch vụ phòng', label: 'Dịch vụ phòng' },
            { keyword: 'laundry', label: 'Laundry' },
            { keyword: 'giặt ủi', label: 'Giặt ủi' },
            { keyword: 'giặt là', label: 'Giặt là' },
            { keyword: 'shuttle', label: 'Shuttle service' },
            { keyword: 'đưa đón sân bay', label: 'Đưa đón sân bay' },
            { keyword: 'xe đưa đón', label: 'Xe đưa đón' },
            { keyword: 'non-smoking', label: 'Non-smoking rooms' },
            { keyword: 'không hút thuốc', label: 'Không hút thuốc' },
            { keyword: 'family rooms', label: 'Family rooms' },
            { keyword: 'phòng gia đình', label: 'Phòng gia đình' },
            { keyword: 'pet friendly', label: 'Pet friendly' },
            { keyword: 'thú cưng', label: 'Cho phép thú cưng' },
            { keyword: 'business center', label: 'Business center' },
            { keyword: 'trung tâm dịch vụ doanh nhân', label: 'Trung tâm dịch vụ doanh nhân' },
            { keyword: 'meeting room', label: 'Meeting room' },
            { keyword: 'phòng họp', label: 'Phòng họp' },
            { keyword: 'conference', label: 'Conference facilities' },
            { keyword: 'hội nghị', label: 'Hội nghị' },
            { keyword: '24-hour front desk', label: '24-hour front desk' },
            { keyword: 'lễ tân 24 giờ', label: 'Lễ tân 24 giờ' },
            { keyword: 'concierge', label: 'Concierge' },
            { keyword: 'elevator', label: 'Elevator' },
            { keyword: 'thang máy', label: 'Thang máy' },
            { keyword: 'an ninh', label: 'An ninh' },
            { keyword: 'két an toàn', label: 'Két an toàn' },
            { keyword: 'ban công', label: 'Ban công' },
            { keyword: 'balcony', label: 'Balcony' },
          ];
          const amenityBlacklistPatterns = [
            /does\s/i,
            /how long/i,
            /approximate/i,
            /temple/i,
            /airport/i,
            /similar hotels/i,
            /vacation rentals/i,
            /see all results/i,
            /currency/i,
            /learn more/i,
            /about this data/i,
            /feedback/i,
            /privacy/i,
            /terms/i,
            /pricing issues/i,
            /help center/i,
            /join user studies/i,
            /vietnam - from your internet address/i,
          ];
          const cleanAmenityText = (value?: string) => {
            if (!value) return '';
            return value
              .replace(/[\u2022•·]+/g, ' ')
              .replace(/([a-zà-ỹ])([A-Z])/g, '$1 $2')
              .replace(/([A-Za-z])(\d)/g, '$1 $2')
              .replace(/(\d)([A-Za-z])/g, '$1 $2')
              .replace(/Wi-Fifree/gi, 'Wi-Fi free')
              .replace(/Parkingfree/gi, 'Parking free')
              .replace(/freeParking/gi, 'free Parking')
              .replace(/\s+/g, ' ')
              .replace(/^[,;.:\-\s]+|[,;.:\-\s]+$/g, '')
              .trim();
          };
          const isLikelyAmenityText = (value: string) => {
            if (!value) return false;
            if (value.length < 2 || value.length > 60) return false;
            if (value.toLowerCase().startsWith('dolce ')) return false;
            if (amenityBlacklistPatterns.some((pattern) => pattern.test(value))) return false;
            if (/[?]/.test(value)) return false;
            const lower = value.toLowerCase();
            const hasKeyword = amenityKeywordMap.some(({ keyword }) => lower.includes(keyword));
            if (!hasKeyword) return false;
            const wordCount = value.split(/\s+/).length;
            return wordCount <= 10;
          };
          const extractAmenityCandidates = (text?: string) => {
            if (!text) return [];
            const normalized = cleanAmenityText(text);
            if (!normalized) return [];
            const parts = normalized
              .split(/[\n•·]+| {2,}|,\s*|;|\||\/|\?|!|(?:\.\s+)/)
              .map((part) => cleanAmenityText(part))
              .filter((part) => part && isLikelyAmenityText(part));
            const keywordMatches = new Set<string>();
            const lowerNormalized = normalized.toLowerCase();
            amenityKeywordMap.forEach(({ keyword, label }) => {
              if (lowerNormalized.includes(keyword)) {
                keywordMatches.add(label);
              }
            });
            return Array.from(new Set<string>([...parts, ...keywordMatches]));
          };
          const appendAmenities = (list: string[], seen: Set<string>, text?: string) => {
            extractAmenityCandidates(text).forEach((candidate) => {
              if (!seen.has(candidate)) {
                seen.add(candidate);
                list.push(candidate);
              }
            });
          };
          const data: any = {};

          if (tab === 'photos') {
            // Collect more images with deduplication
            const imageSet = new Set<string>();
            const baseUrlSet = new Set<string>();
            
            const normalizeImageUrl = (url: string): { normalized: string; baseUrl: string } | null => {
              if (!url || url.startsWith('data:')) return null;
              
              let cleanUrl = url.split('?')[0];
              if (!cleanUrl.includes('googleusercontent')) return null;
              
              const equalIndex = cleanUrl.indexOf('=');
              const baseUrl = equalIndex !== -1 ? cleanUrl.substring(0, equalIndex) : cleanUrl;
              
              let normalized = cleanUrl;
              if (normalized.includes('=')) {
                normalized = normalized
                  .replace(/=s\d+-k-no/, '=s2048-k-no')
                  .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                  .replace(/=w\d+-h\d+-n-k/, '=w2048-h2048-n-k')
                  .replace(/=w\d+-h\d+-n-k-rw-no-v1/, '=w2048-h2048-n-k-rw-no-v1')
                  .replace(/=w\d+-h\d+/, '=w2048-h2048')
                  .replace(/=s\d+/, '=s2048')
                  .replace(/=w\d+/, '=w2048');
              } else {
                normalized = `${baseUrl}=w2048-h2048-k-no`;
              }
              
              return { normalized, baseUrl };
            };
            
            const imgElements = document.querySelectorAll('img[src*="googleusercontent"], img[data-src*="googleusercontent"]');
            imgElements.forEach((img) => {
              const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
              if (src) {
                const result = normalizeImageUrl(src);
                if (result && !baseUrlSet.has(result.baseUrl)) {
                  baseUrlSet.add(result.baseUrl);
                  imageSet.add(result.normalized);
                }
              }
            });
            
            // Also collect from background images
            const bgElements = document.querySelectorAll('[style*="background-image"]');
            bgElements.forEach((el) => {
              const style = el.getAttribute('style') || '';
              const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
              if (urlMatch && urlMatch[1]) {
                const result = normalizeImageUrl(urlMatch[1]);
                if (result && !baseUrlSet.has(result.baseUrl)) {
                  baseUrlSet.add(result.baseUrl);
                  imageSet.add(result.normalized);
                }
              }
            });
            
            data.images = Array.from(imageSet);
          } else if (tab === 'amenities') {
            const amenityElements = document.querySelectorAll('[data-amenity], [class*="amenity"], section, article');
            const amenities: string[] = [];
            const amenitySet = new Set<string>();
            amenityElements.forEach((el) => {
              const text = toText(el);
              const isTaggedElement = el.matches('[data-amenity], [class*="amenity"]');
              if (!isTaggedElement && !/(Tiện nghi|Amenities|Facilities|Wi-?Fi|Pool|Bể bơi|Spa)/i.test(text)) {
                return;
              }
              appendAmenities(amenities, amenitySet, text);
            });
            data.amenities = amenities;
          } else if (tab === 'reviews') {
            // Extract review count if not found
            const reviewText = document.body.textContent || '';
            const reviewMatch = reviewText.match(/(\d+[\d.,\s]*)\s*(?:đánh giá|reviews|review)/i);
            if (reviewMatch) {
              const reviewNum = reviewMatch[1].replace(/[^\d.,]/g, '').replace(/,/g, '');
              data.reviewCount = Number(reviewNum);
            }
          }
          return data;
        }, tabName);

        // Merge additional data with proper deduplication
        if (additionalData.images && additionalData.images.length > 0) {
          // Extract base URLs from existing images
          const existingBaseUrls = new Set<string>();
          (hotelData.images || []).forEach((url: string) => {
            const equalIndex = url.indexOf('=');
            const baseUrl = equalIndex !== -1 ? url.substring(0, equalIndex) : url;
            existingBaseUrls.add(baseUrl);
          });
          
          // Only add new images that don't have duplicate base URLs
          const newImages: string[] = [];
          additionalData.images.forEach((url: string) => {
            const equalIndex = url.indexOf('=');
            const baseUrl = equalIndex !== -1 ? url.substring(0, equalIndex) : url;
            if (!existingBaseUrls.has(baseUrl)) {
              existingBaseUrls.add(baseUrl);
              newImages.push(url);
            }
          });
          
          hotelData.images = [...(hotelData.images || []), ...newImages];
        }
        if (additionalData.amenities && additionalData.amenities.length > 0) {
          hotelData.amenities = [...(hotelData.amenities || []), ...additionalData.amenities];
          // Remove duplicates
          hotelData.amenities = Array.from(new Set(hotelData.amenities));
        }
        if (additionalData.reviewCount) {
          hotelData.reviewCount = additionalData.reviewCount;
        }
      }
    } catch (error) {
      logger.warn(`Error clicking tab ${tabName}`, { error });
      // Continue to next tab
    }
  }

  // Parse price
  const { price: priceFrom, currency } = parsePrice(
    hotelData.priceText ? `${hotelData.priceText} ${hotelData.currency || '₫'}` : undefined
  );

  // Normalize phone and website
  const phone = normalizePhoneNumber(hotelData.phone);
  const website = normalizeWebsite(hotelData.website);

  const result: HotelItem = {
    name: hotelData.name || 'Unknown hotel',
    address: hotelData.address || 'Unknown address',
    rating: hotelData.rating,
    reviewCount: hotelData.reviewCount,
    starRating: hotelData.starRating,
    priceFrom,
    currency: currency || hotelData.currency || 'VND',
    phone,
    website,
    amenities: hotelData.amenities && hotelData.amenities.length > 0 ? hotelData.amenities : undefined,
    images: hotelData.images && hotelData.images.length > 0 ? hotelData.images : undefined,
    detailLink: url,
  };

  onStream?.({
    type: 'progress',
    message: 'Detail crawl completed',
    progress: 100,
  });

  onStream?.({
    type: 'data',
    data: result,
  });

  return result;
}

export async function crawlGoogleTravel(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem> {
  // Check if this is a detail page (contains /hotels/entity/)
  const isDetailPage = url.includes('/hotels/entity/');
  
  if (isDetailPage) {
    return await crawlGoogleTravelDetail(page, url, options, onStream);
  }

  // Otherwise, treat as list page
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000); // Wait for dynamic content

  // Wait for hotel items to appear
  const hotelItemSelectors = [
    'div.uaTTDe.BcKagd.bLc2Te.Xr6b1e',
    'div[class*="uaTTDe"]',
    'div[jscontroller="rqWJpd"]',
    'div[data-hveid]',
  ];

  let hotelItemsFound = false;
  for (const selector of hotelItemSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 }).catch(() => null);
      const count = await page.locator(selector).count();
      if (count > 0) {
        hotelItemsFound = true;
        logger.info(`Found ${count} hotel items with selector: ${selector}`);
        break;
      }
    } catch {
      // Continue to next selector
    }
  }

  if (!hotelItemsFound) {
    logger.warn('No hotel items found on Google Travel page');
    return {
      name: 'No hotels found',
      address: 'Unknown address',
    };
  }

  // Extract hotel data from the first item (for single hotel crawl)
  const hotelData = await page.evaluate(() => {
    const toText = (el: Element | null) => (el?.textContent || '').trim();
    
    // Find first hotel item
    const hotelItem = document.querySelector('div.uaTTDe.BcKagd.bLc2Te.Xr6b1e, div[jscontroller="rqWJpd"]');
    if (!hotelItem) return null;

    const fullText = toText(hotelItem);
    
    // Extract hotel name (usually first part before "GIÁ TỐT" or price)
    let name = '';
    const nameMatch = fullText.match(/^([^₫$€£¥₹0-9]+?)(?:\s+GIÁ\s+TỐT|\s+\d)/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
    } else {
      // Fallback: take first 50 characters
      name = fullText.substring(0, 50).trim();
    }

    // Extract price
    const priceMatch = fullText.match(/([\d.,\s]+)\s*([₫$€£¥₹])/);
    let priceText = '';
    let currency = '';
    if (priceMatch) {
      priceText = priceMatch[1].trim();
      currency = priceMatch[2];
    }

    // Extract rating and review count
    const ratingMatch = fullText.match(/(\d+[,.]\d+)\s*\(([\d.,\s]+)\s*[Nn]?\)/);
    let rating: number | undefined;
    let reviewCount: number | undefined;
    if (ratingMatch) {
      rating = Number(ratingMatch[1].replace(',', '.'));
      const reviewText = ratingMatch[2].replace(/[^\d.,]/g, '').replace(/,/g, '.');
      const reviewValue = Number(reviewText);
      if (Number.isFinite(reviewValue)) {
        if (reviewValue < 10 && ratingMatch[2].includes(',')) {
          reviewCount = Math.round(reviewValue * 1000);
        } else {
          reviewCount = Math.round(reviewValue);
        }
      }
    }

    // Extract star rating
    const starMatch = fullText.match(/(\d+)[-\s]*(?:sao|star)/i);
    let starRating: number | undefined;
    if (starMatch) {
      starRating = Number(starMatch[1]);
    }

    // Extract amenities (after "Tiện nghi" or "Amenities")
    const amenitiesText = fullText.match(/(?:Tiện nghi|Amenities)[:\s]+(.+?)(?:\s*·|$)/i);
    const amenities: string[] = [];
    if (amenitiesText) {
      const amenityList = amenitiesText[1]
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);
      amenities.push(...amenityList);
    }

    // Try to find detail link
    let detailLink = '';
    const linkElement = hotelItem.querySelector('a[href]');
    if (linkElement) {
      detailLink = linkElement.getAttribute('href') || '';
      if (detailLink && !detailLink.startsWith('http')) {
        detailLink = `https://www.google.com${detailLink}`;
      }
    }

    // Try to find image
    let image = '';
    const imgElement = hotelItem.querySelector('img[src*="google"], img[data-src*="google"]');
    if (imgElement) {
      image = imgElement.getAttribute('src') || imgElement.getAttribute('data-src') || '';
      if (image) {
        image = image.split('?')[0];
        if (image.includes('googleusercontent')) {
          image = image
            .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
            .replace(/=s\d+-k-no/, '=s2048-k-no')
            .replace(/=w\d+-h\d+/, '=w2048-h2048')
            .replace(/=s\d+/, '=s2048')
            .replace(/=w\d+/, '=w2048');
        }
      }
    }

    return {
      name,
      priceText,
      currency,
      rating,
      reviewCount,
      starRating,
      amenities,
      detailLink,
      image,
      fullText,
    };
  });

  if (!hotelData) {
    return {
      name: 'No hotel data found',
      address: 'Unknown address',
    };
  }

  // Parse price
  const { price: priceFrom, currency } = parsePrice(
    hotelData.priceText ? `${hotelData.priceText} ${hotelData.currency || '₫'}` : undefined
  );

  const result: HotelItem = {
    name: hotelData.name || 'Unknown hotel',
    address: 'Unknown address', // Google Travel list items don't always show full address
    rating: hotelData.rating,
    reviewCount: hotelData.reviewCount,
    starRating: hotelData.starRating,
    priceFrom,
    currency: currency || hotelData.currency || 'VND',
    amenities: hotelData.amenities.length > 0 ? hotelData.amenities : undefined,
    images: hotelData.image ? [hotelData.image] : undefined,
    detailLink: hotelData.detailLink,
  };

  onStream?.({
    type: 'data',
    data: result,
  });

  return result;
}

export async function crawlGoogleTravelList(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>,
): Promise<HotelItem[]> {
  try {
    await page.waitForLoadState('domcontentloaded');
    
    onStream?.({
      type: 'progress',
      message: 'Loading Google Travel hotel list...',
      progress: 10,
    });

    // Wait for page to fully load
    await page.waitForTimeout(5000);

    // Wait for hotel items to appear
    const hotelItemSelectors = [
      'div.uaTTDe.BcKagd.bLc2Te.Xr6b1e',
      'div[class*="uaTTDe"]',
      'div[jscontroller="rqWJpd"]',
      'div[data-hveid]',
    ];

    let hotelItemsFound = false;
    for (const selector of hotelItemSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 15000 }).catch(() => null);
        const count = await page.locator(selector).count();
        if (count > 0) {
          hotelItemsFound = true;
          logger.info(`Found ${count} hotel items with selector: ${selector}`);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (!hotelItemsFound) {
      logger.warn('No hotel items found on Google Travel page');
      onStream?.({
        type: 'progress',
        message: 'No hotel items found',
        progress: 100,
      });
      return [];
    }

    const allHotels: HotelItem[] = [];
    const processedLinks = new Set<string>();
    const targetHotels = options?.maxPages ? options.maxPages * 20 : 100;
    const maxHotels = targetHotels + 20;

    let scrollAttempts = 0;
    const maxScrollAttempts = 50;
    let previousHotelCount = 0;
    let noNewContentCount = 0;
    const maxNoNewContentCount = 5;

    onStream?.({
      type: 'progress',
      message: 'Extracting hotels from list...',
      progress: 20,
    });

    // Extract hotels initially
    let hotelsOnPage: any[] = [];
    try {
      hotelsOnPage = await page.evaluate(() => {
        const toText = (el: Element | null) => (el?.textContent || '').trim();
        
        const hotelItems = Array.from(
          document.querySelectorAll('div.uaTTDe.BcKagd.bLc2Te.Xr6b1e, div[jscontroller="rqWJpd"]')
        );
        
        const hotels: any[] = [];

        for (const hotelItem of hotelItems) {
          const fullText = toText(hotelItem);
          if (!fullText) continue;

          // Extract hotel name
          let name = '';
          const nameMatch = fullText.match(/^([^₫$€£¥₹0-9]+?)(?:\s+GIÁ\s+TỐT|\s+\d)/i);
          if (nameMatch) {
            name = nameMatch[1].trim();
          } else {
            // Fallback: take first meaningful part
            const parts = fullText.split(/[·\n]/);
            name = parts[0]?.trim() || fullText.substring(0, 50).trim();
          }

          // Extract price
          const priceMatch = fullText.match(/([\d.,\s]+)\s*([₫$€£¥₹])/);
          let priceText = '';
          let currencySymbol = '';
          if (priceMatch) {
            priceText = priceMatch[1].trim();
            currencySymbol = priceMatch[2];
          }

          // Extract rating and review count
          const ratingMatch = fullText.match(/(\d+[,.]\d+)\s*\(([\d.,\s]+)\s*[Nn]?\)/);
          let rating: number | undefined;
          let reviewCount: number | undefined;
          if (ratingMatch) {
            rating = Number(ratingMatch[1].replace(',', '.'));
            const reviewText = ratingMatch[2].replace(/[^\d.,]/g, '').replace(/,/g, '.');
            const reviewValue = Number(reviewText);
            if (Number.isFinite(reviewValue)) {
              if (reviewValue < 10 && ratingMatch[2].includes(',')) {
                reviewCount = Math.round(reviewValue * 1000);
              } else {
                reviewCount = Math.round(reviewValue);
              }
            }
          }

          // Extract star rating
          const starMatch = fullText.match(/(\d+)[-\s]*(?:sao|star)/i);
          let starRating: number | undefined;
          if (starMatch) {
            starRating = Number(starMatch[1]);
          }

          // Extract location/address (look for location indicators)
          let address = '';
          const locationMatch = fullText.match(/(?:Địa điểm|Location|Address)[:\s]+(.+?)(?:\s*·|$)/i);
          if (locationMatch) {
            address = locationMatch[1].trim();
          }

          // Extract amenities
          const amenitiesText = fullText.match(/(?:Tiện nghi|Amenities)[:\s]+(.+?)(?:\s*·|$)/i);
          const amenities: string[] = [];
          if (amenitiesText) {
            const amenityList = amenitiesText[1]
              .split(',')
              .map(a => a.trim())
              .filter(a => a.length > 0);
            amenities.push(...amenityList);
          }

          // Find detail link
          let detailLink = '';
          const linkElement = hotelItem.querySelector('a[href]');
          if (linkElement) {
            detailLink = linkElement.getAttribute('href') || '';
            if (detailLink && !detailLink.startsWith('http')) {
              detailLink = `https://www.google.com${detailLink}`;
            }
          }

          // Find image
          let image = '';
          const imgElement = hotelItem.querySelector('img[src*="google"], img[data-src*="google"]');
          if (imgElement) {
            image = imgElement.getAttribute('src') || imgElement.getAttribute('data-src') || '';
            if (image) {
              image = image.split('?')[0];
              if (image.includes('googleusercontent')) {
                image = image
                  .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                  .replace(/=s\d+-k-no/, '=s2048-k-no')
                  .replace(/=w\d+-h\d+/, '=w2048-h2048')
                  .replace(/=s\d+/, '=s2048')
                  .replace(/=w\d+/, '=w2048');
              }
            }
          }

          // Parse price
          let priceFrom: number | undefined;
          let currency: string | undefined;
          if (priceText && currencySymbol) {
            const currencyMap: Record<string, string> = {
              '₫': 'VND',
              '$': 'USD',
              '€': 'EUR',
              '£': 'GBP',
              '¥': 'JPY',
              '₹': 'INR',
            };
            currency = currencyMap[currencySymbol] || 'VND';
            
            const priceNum = Number(priceText.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
            if (Number.isFinite(priceNum) && priceNum > 0) {
              priceFrom = priceNum;
            }
          }

          hotels.push({
            name: name || 'Unknown hotel',
            address: address || 'Unknown address',
            rating,
            reviewCount,
            starRating,
            priceFrom,
            currency,
            amenities: amenities.length > 0 ? amenities : undefined,
            images: image ? [image] : undefined,
            detailLink,
          });
        }

        return hotels;
      });
    } catch (evalError) {
      logger.error('Error in initial hotel extraction', {
        error: evalError instanceof Error ? evalError.message : String(evalError),
      });
    }

    // Process initial hotels
    for (const hotelData of hotelsOnPage) {
      if (hotelData.detailLink && !processedLinks.has(hotelData.detailLink)) {
        processedLinks.add(hotelData.detailLink);
        allHotels.push(hotelData);
      } else if (!hotelData.detailLink) {
        // Add hotels without detail links too
        allHotels.push(hotelData);
      }
    }

    previousHotelCount = hotelsOnPage.length;
    logger.info(`Initial extraction: Found ${allHotels.length} hotels`);

    // Scroll to load more results
    while (allHotels.length < maxHotels && scrollAttempts < maxScrollAttempts && noNewContentCount < maxNoNewContentCount) {
      scrollAttempts++;
      
      // Scroll page
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });
      
      await page.waitForTimeout(3000);
      
      // Extract hotels after scroll
      hotelsOnPage = [];
      try {
        hotelsOnPage = await page.evaluate(() => {
          const toText = (el: Element | null) => (el?.textContent || '').trim();
          
          const hotelItems = Array.from(
            document.querySelectorAll('div.uaTTDe.BcKagd.bLc2Te.Xr6b1e, div[jscontroller="rqWJpd"]')
          );
          
          const hotels: any[] = [];

          for (const hotelItem of hotelItems) {
            const fullText = toText(hotelItem);
            if (!fullText) continue;

            // Extract hotel name
            let name = '';
            const nameMatch = fullText.match(/^([^₫$€£¥₹0-9]+?)(?:\s+GIÁ\s+TỐT|\s+\d)/i);
            if (nameMatch) {
              name = nameMatch[1].trim();
            } else {
              const parts = fullText.split(/[·\n]/);
              name = parts[0]?.trim() || fullText.substring(0, 50).trim();
            }

            // Extract price
            const priceMatch = fullText.match(/([\d.,\s]+)\s*([₫$€£¥₹])/);
            let priceText = '';
            let currencySymbol = '';
            if (priceMatch) {
              priceText = priceMatch[1].trim();
              currencySymbol = priceMatch[2];
            }

            // Extract rating
            const ratingMatch = fullText.match(/(\d+[,.]\d+)\s*\(([\d.,\s]+)\s*[Nn]?\)/);
            let rating: number | undefined;
            let reviewCount: number | undefined;
            if (ratingMatch) {
              rating = Number(ratingMatch[1].replace(',', '.'));
              const reviewText = ratingMatch[2].replace(/[^\d.,]/g, '').replace(/,/g, '.');
              const reviewValue = Number(reviewText);
              if (Number.isFinite(reviewValue)) {
                if (reviewValue < 10 && ratingMatch[2].includes(',')) {
                  reviewCount = Math.round(reviewValue * 1000);
                } else {
                  reviewCount = Math.round(reviewValue);
                }
              }
            }

            // Extract star rating
            const starMatch = fullText.match(/(\d+)[-\s]*(?:sao|star)/i);
            let starRating: number | undefined;
            if (starMatch) {
              starRating = Number(starMatch[1]);
            }

            // Extract amenities
            const amenitiesText = fullText.match(/(?:Tiện nghi|Amenities)[:\s]+(.+?)(?:\s*·|$)/i);
            const amenities: string[] = [];
            if (amenitiesText) {
              const amenityList = amenitiesText[1]
                .split(',')
                .map(a => a.trim())
                .filter(a => a.length > 0);
              amenities.push(...amenityList);
            }

            // Find detail link
            let detailLink = '';
            const linkElement = hotelItem.querySelector('a[href]');
            if (linkElement) {
              detailLink = linkElement.getAttribute('href') || '';
              if (detailLink && !detailLink.startsWith('http')) {
                detailLink = `https://www.google.com${detailLink}`;
              }
            }

            // Find image
            let image = '';
            const imgElement = hotelItem.querySelector('img[src*="google"], img[data-src*="google"]');
            if (imgElement) {
              image = imgElement.getAttribute('src') || imgElement.getAttribute('data-src') || '';
              if (image) {
                image = image.split('?')[0];
                if (image.includes('googleusercontent')) {
                  image = image
                    .replace(/=w\d+-h\d+-k-no/, '=w2048-h2048-k-no')
                    .replace(/=s\d+-k-no/, '=s2048-k-no')
                    .replace(/=w\d+-h\d+/, '=w2048-h2048')
                    .replace(/=s\d+/, '=s2048')
                    .replace(/=w\d+/, '=w2048');
                }
              }
            }

            // Parse price
            let priceFrom: number | undefined;
            let currency: string | undefined;
            if (priceText && currencySymbol) {
              const currencyMap: Record<string, string> = {
                '₫': 'VND',
                '$': 'USD',
                '€': 'EUR',
                '£': 'GBP',
                '¥': 'JPY',
                '₹': 'INR',
              };
              currency = currencyMap[currencySymbol] || 'VND';
              
              const priceNum = Number(priceText.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
              if (Number.isFinite(priceNum) && priceNum > 0) {
                priceFrom = priceNum;
              }
            }

            hotels.push({
              name: name || 'Unknown hotel',
              address: 'Unknown address',
              rating,
              reviewCount,
              starRating,
              priceFrom,
              currency,
              amenities: amenities.length > 0 ? amenities : undefined,
              images: image ? [image] : undefined,
              detailLink,
            });
          }

          return hotels;
        });
      } catch (evalError) {
        logger.error('Error evaluating page for hotels', {
          error: evalError instanceof Error ? evalError.message : String(evalError),
        });
        hotelsOnPage = [];
      }

      // Process new hotels
      let newHotelsCount = 0;
      for (const hotelData of hotelsOnPage) {
        if (allHotels.length >= maxHotels) break;
        
        if (hotelData.detailLink && processedLinks.has(hotelData.detailLink)) {
          continue;
        }

        if (hotelData.detailLink) {
          processedLinks.add(hotelData.detailLink);
        }

        allHotels.push(hotelData);
        newHotelsCount++;

        onStream?.({
          type: 'data',
          data: hotelData,
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
        previousHotelCount = currentHotelCount;
        noNewContentCount = 0;
      } else if (newHotelsCount === 0) {
        noNewContentCount++;
      } else {
        noNewContentCount = 0;
      }

      // Stop if no new content
      if (noNewContentCount >= maxNoNewContentCount) {
        logger.info(`Stopping: No new content after ${noNewContentCount} iterations`);
        break;
      }

      // Stop if reached target
      if (allHotels.length >= targetHotels) {
        logger.info(`Reached target of ${targetHotels} hotels, stopping`);
        break;
      }
    }

    logger.info(`Crawl completed. Found ${allHotels.length} hotels total`);

    onStream?.({
      type: 'progress',
      message: `Completed. Found ${allHotels.length} hotels.`,
      progress: 100,
    });

    return allHotels.length > 0 ? allHotels : [];
  } catch (error) {
    logger.error('Error in crawlGoogleTravelList', {
      url,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    onStream?.({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });

    return [];
  }
}

