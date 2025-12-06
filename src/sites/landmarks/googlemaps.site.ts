import { Page } from 'playwright';
import { LandmarkItem, CrawlOptions, StreamCallback } from '../../types/crawl';
import { logger } from '../../utils/logger';

async function getFirstText(
  page: Page,
  selectors: string[],
): Promise<string | undefined> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.count()) {
        const text = await locator.textContent();
        if (text?.trim()) {
          return text.trim();
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

async function collectImages(page: Page): Promise<string[]> {
  const imageUrls = new Set<string>();
  
  try {
    // Try to find and click the "Photos" button to open the gallery
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
      let previousImageCount = 0;
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

export async function crawlGoogleMapsLandmark(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<LandmarkItem>,
): Promise<LandmarkItem> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => null);

  // Extract name
  const name =
    (await getFirstText(page, ['h1.DUwDvf', 'h1 span', '[data-item-id="title"] span'])) ||
    'Unknown landmark';

  // Extract address
  const address = await getFirstText(page, [
    '[data-item-id="address"] .Io6YTe',
    'button[data-item-id="address"] div:last-child',
    'button[data-item-id="address"]',
  ]);

  // Extract province from address
  const province = extractProvinceFromAddress(address);

  // Extract phone numbers
  const phoneText = await getFirstText(page, [
    'button[data-item-id*="phone"] div.AeaXub',
    'div.AeaXub[aria-label*="Phone"]',
    'button[aria-label*="Phone"] div.AeaXub',
    'div.AeaXub',
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

  const result: LandmarkItem = {
    name,
    address,
    province,
    phone,
    mobilePhone,
    email,
    website,
    imageUrl,
    detailLink: url,
    latitude,
    longitude,
  };

  onStream?.({
    type: 'data',
    data: result,
  });

  return result;
}

