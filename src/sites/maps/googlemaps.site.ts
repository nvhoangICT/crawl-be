import { Page } from 'playwright';
import { MapsItem } from '../../types/crawl';
import { logger } from '../../utils/logger';

async function getFirstText(page: Page, selectors: string[]): Promise<string | undefined> {
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

function normalizeNumber(text?: string): number | undefined {
  if (!text) return undefined;
  const numeric = text.replace(/[^0-9.,]/g, '').replace(',', '.');
  const value = Number(numeric);
  return Number.isFinite(value) ? value : undefined;
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
                  
                  // Ensure we have a valid URL
                  if (highQualitySrc.startsWith('https://') && highQualitySrc.includes('googleusercontent')) {
                    imageUrls.add(highQualitySrc);
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
                
                // Ensure we have a valid URL
                if (highQualitySrc.startsWith('https://')) {
                  imageUrls.add(highQualitySrc);
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
                    if (highQualitySrc.startsWith('https://') && highQualitySrc.includes('googleusercontent')) {
                      imageUrls.add(highQualitySrc);
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

export async function crawlGoogleMaps(page: Page): Promise<MapsItem> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => null);

  const name =
    (await getFirstText(page, ['h1.DUwDvf', 'h1 span', '[data-item-id="title"] span'])) ||
    'Unknown location';
  const address = await getFirstText(page, [
    '[data-item-id="address"] .Io6YTe',
    'button[data-item-id="address"] div:last-child',
  ]);
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
  const phone = await getFirstText(page, [
    'button[data-item-id*="phone"] div.AeaXub',
    'div.AeaXub[aria-label*="Phone"]',
    'button[aria-label*="Phone"] div.AeaXub',
  ]);

  // Website information
  let website: string | undefined;
  try {
    // Find all div.AeaXub elements and check for website patterns
    const websiteElements = await page.locator('div.AeaXub').all();
    logger.info(`Found ${websiteElements.length} div.AeaXub elements`);
    
    for (const element of websiteElements) {
      const text = await element.textContent();
      if (text) {
        // Remove any leading/trailing whitespace and special characters (like zero-width space)
        const cleaned = text.trim().replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, '');
        
        logger.info(`Checking AeaXub element: "${cleaned}"`);
        
        if (!cleaned) continue;
        
        // Skip if it looks like a phone number
        if (/^[\d\s\+\-\(\)]+$/.test(cleaned)) {
          logger.info(`Skipped phone number: ${cleaned}`);
          continue;
        }
        
        // Check if it looks like a website
        // Pattern 1: Already has http:// or https://
        if (/^https?:\/\//i.test(cleaned)) {
          website = cleaned;
          logger.info(`Found website (full URL): ${website}`);
          break;
        }
        
        // Pattern 2: Domain name with TLD (e.g., facebook.com, example.com.vn)
        // Match: word characters, dots, hyphens, ending with valid TLD
        const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/;
        if (domainPattern.test(cleaned)) {
          // Normalize website URL - add https:// if not present
          website = cleaned.startsWith('http://') || cleaned.startsWith('https://') 
            ? cleaned 
            : `https://${cleaned}`;
          logger.info(`Found website (domain): ${cleaned} -> normalized to: ${website}`);
          break; // Use first valid website found
        }
      }
    }
    
    if (!website) {
      logger.info('No website found in div.AeaXub elements');
    }
  } catch (error) {
    logger.error('Error extracting website:', error);
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

  return {
    name,
    address,
    rating,
    reviewCount,
    starRating,
    ratingDistribution,
    description,
    openHoursText,
    phone,
    website,
    checkInTime,
    checkOutTime,
    amenities: amenities.length > 0 ? amenities : undefined,
    images,
  };
}

