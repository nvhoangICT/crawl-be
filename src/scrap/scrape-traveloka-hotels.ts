// scrape-traveloka-hotels.ts

import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';

const storageDir = './storage';

if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir);

const outputFile = `${storageDir}/traveloka_hotels.json`;

let allItems: any[] = [];

// URL khởi đầu, thay bằng URL cụ thể của trang danh sách khách sạn trên Traveloka
const baseUrl = 'https://www.traveloka.com/vi-vn/hotels/search?spec=01-08-2025.02-08-2025.1.1.HOTEL_GEO.10010169.%C4%90%C3%A0%20L%E1%BA%A1t.2'; // Ví dụ: Trang khách sạn tại Đà Lạt

const startUrls = [baseUrl];

const maxPages = 10; // Giới hạn số trang tối đa

const crawler = new PlaywrightCrawler({
  minConcurrency: 1,
  maxConcurrency: 1, // Giảm concurrency để tránh bị chặn
  maxRequestsPerMinute: 2, // Giảm tốc độ request
  requestHandlerTimeoutSecs: 180, // Tăng timeout
  headless: false, // Chạy với browser visible để debug
  preNavigationHooks: [
    ({ page, request }) => {
      return page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      });
    },
  ],

  async requestHandler({ page, request, log, enqueueLinks }) {
    log.info(`Đang crawl: ${request.url}`);

    // Thêm độ trễ ngẫu nhiên để tránh bị chặn
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000 + 1000));

    try {
      // Kiểm tra nếu đang crawl trang danh sách
      if (request.url.startsWith(baseUrl)) {
        
        // Chờ page load hoàn toàn
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        
        // Thêm thời gian chờ thêm để đảm bảo trang load hoàn toàn
        await new Promise((resolve) => setTimeout(resolve, 5000));
        
        // Debug: log page title và URL
        const pageTitle = await page.title();
        log.info(`Page title: ${pageTitle}`);
        log.info(`Current URL: ${page.url()}`);
        
        // Thử nhiều selector khác nhau để tìm items
        let itemsOnPage: any[] = [];
        let selectorFound = false;
        
        const possibleSelectors = [
          'div[data-testid="tvat-searchListItem"]',
          '[data-testid="tvat-searchListItem"]',
          '.tvat-searchListItem',
          '[data-testid*="searchListItem"]',
          '[data-testid*="hotels-item"]',
          '[data-testid*="hotels-card"]',
          '.hotels-item',
          '.hotels-card',
          '[class*="hotels"]',
          '[class*="search"]',
        ];
        
        for (const selector of possibleSelectors) {
          try {
            log.info(`Thử selector: ${selector}`);
            
            // Chờ selector với timeout ngắn hơn
            await page.waitForSelector(selector, { timeout: 10000, state: 'attached' });
            
            // Kiểm tra xem có items không
            const itemCount = await page.evaluate((sel) => {
              return document.querySelectorAll(sel).length;
            }, selector);
            
            if (itemCount > 0) {
              log.info(`Tìm thấy ${itemCount} items với selector: ${selector}`);
              selectorFound = true;
              
              // Lấy items với selector này
              itemsOnPage = await page.evaluate((sel) => {
                return Array.from(document.querySelectorAll(sel)).map((item) => {
                  const qs = (sel: string, parent: Element = item) => {
                    try {
                      return parent.querySelector(sel);
                    } catch {
                      return null;
                    }
                  };

                  // Lấy link chi tiết - cần tìm trong content element
                  const contentElement = qs('div[data-testid="tvat-searchListItem-content"]') || 
                                       qs('[data-testid*="content"]') ||
                                       qs('a') ||
                                       item;

                  let detailLink = '';
                  if (contentElement) {
                    // Thử tìm href trực tiếp hoặc trong parent
                    detailLink = contentElement.getAttribute('href') || 
                                contentElement.closest('a')?.getAttribute('href') || 
                                contentElement.querySelector('a')?.getAttribute('href') || '';
                    
                    // Thử tìm trong các element con có thể click được
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

                  // Lấy tên khách sạn - thử nhiều selector
                  const titleSelectors = [
                    'h3[data-testid="tvat-hotelName"]',
                    '[data-testid="tvat-hotelName"]',
                    '[data-testid*="hotelName"]',
                    'h3',
                    'h2',
                    '[class*="title"]',
                    '[class*="name"]'
                  ];
                  
                  let title = '';
                  for (const titleSel of titleSelectors) {
                    const titleEl = qs(titleSel);
                    if (titleEl && titleEl.textContent?.trim()) {
                      title = titleEl.textContent.trim();
                      break;
                    }
                  }

                  // Fallback: nếu không tìm thấy link, tạo link từ title
                  if (!detailLink && title) {
                    detailLink = `https://www.traveloka.com/vi-vn/hotels/search?q=${encodeURIComponent(title)}`;
                  }

                  // Lấy ảnh chính
                  const mainImageSelectors = [
                    'img[data-testid="list-view-card-main-image"]',
                    '[data-testid*="main-image"]',
                    'img[data-testid*="image"]',
                    'img'
                  ];
                  
                  let mainImage = '';
                  for (const imgSel of mainImageSelectors) {
                    const imgEl = qs(imgSel);
                    if (imgEl && imgEl.getAttribute('src')) {
                      mainImage = imgEl.getAttribute('src');
                      break;
                    }
                  }

                  // Lấy địa điểm - thử nhiều selector
                  const locationSelectors = [
                    'div[data-testid="tvat-hotelLocation"]',
                    '[data-testid*="location"]',
                    '[data-testid*="address"]',
                    '[class*="location"]',
                    '[class*="address"]'
                  ];
                  
                  let location = '';
                  for (const locSel of locationSelectors) {
                    const locEl = qs(locSel);
                    if (locEl) {
                      location = locEl.querySelector('div[dir="auto"]')?.textContent?.trim() || 
                                locEl.querySelector('.css-901oao')?.textContent?.trim() || 
                                locEl.textContent?.trim() || '';
                      if (location) break;
                    }
                  }

                  // Lấy điểm đánh giá
                  const ratingSelectors = [
                    'div[data-testid="tvat-ratingScore"]',
                    '[data-testid*="rating"]',
                    '[data-testid*="score"]',
                    '[class*="rating"]',
                    '[class*="score"]'
                  ];
                  
                  let ratingScore = '';
                  for (const ratingSel of ratingSelectors) {
                    const ratingEl = qs(ratingSel);
                    if (ratingEl && ratingEl.textContent?.trim()) {
                      ratingScore = ratingEl.textContent.trim().split(' ')[0];
                      break;
                    }
                  }
                  
                  // Lấy giá - thử nhiều selector
                  const priceSelectors = [
                    'div[data-testid="tvat-hotelPrice"]',
                    '[data-testid*="price"]',
                    '[class*="price"]',
                    '[class*="cost"]'
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
                    selector: sel, // Thêm thông tin về selector được sử dụng
                  };
                });
              }, selector);
              
              break; // Thoát khỏi vòng lặp nếu tìm thấy items
            }
          } catch (err: any) {
            log.info(`Selector ${selector} không tìm thấy: ${err.message}`);
            continue;
          }
        }
        
        if (!selectorFound) {
          log.warning('Không tìm thấy selector nào phù hợp. Thử lấy tất cả text content để debug...');
          
          // Debug: lấy tất cả text content để xem cấu trúc trang
          const pageContent = await page.evaluate(() => {
            return {
              title: document.title,
              bodyText: document.body.textContent?.substring(0, 1000),
              allElements: Array.from(document.querySelectorAll('*')).slice(0, 50).map(el => ({
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                dataTestId: el.getAttribute('data-testid'),
                textContent: el.textContent?.substring(0, 100)
              }))
            };
          });
          
          log.info(`Page content debug: ${JSON.stringify(pageContent, null, 2)}`);
          
          // Thử tìm bất kỳ element nào có thể là hotels item
          itemsOnPage = await page.evaluate(() => {
            const allDivs = Array.from(document.querySelectorAll('div'));
            const possibleItems = allDivs.filter(div => {
              const text = div.textContent?.toLowerCase() || '';
              return text.includes('khách sạn') || text.includes('hotels') || text.includes('đánh giá') || text.includes('rating');
            }).slice(0, 10);
            
            return possibleItems.map(item => ({
              title: item.textContent?.substring(0, 100) || 'Unknown',
              detailLink: '',
              mainImage: '',
              location: '',
              ratingScore: '',
              discountedPrice: '',
              selector: 'fallback',
              rawText: item.textContent?.substring(0, 200) || ''
            }));
          });
        }

        // Thêm các mục vào allItems
        for (const item of itemsOnPage) {
          if (!allItems.some((existingItem) => existingItem.detailLink === item.detailLink)) {
            allItems.push(item);
          }
        }

        log.info(`Đã tìm thấy ${itemsOnPage.length} mục trên trang ${request.url}`);

        // Nếu có mục trên trang, thêm trang tiếp theo
        if (itemsOnPage.length > 0) {
          const currentPageMatch = request.url.match(/PageIndex=(\d+)/);
          const currentPage = currentPageMatch ? parseInt(currentPageMatch[1], 10) : 1;

          if (currentPage < maxPages) {
            const nextPageUrl = `${baseUrl}?PageIndex=${currentPage + 1}`;
            log.info(`Thêm trang tiếp theo: ${nextPageUrl}`);
            await enqueueLinks({ urls: [nextPageUrl] });
          }
        }
      }
    } catch (err: any) {
      log.error(`Lỗi khi crawl trang ${request.url}: ${err.message}`);
      
      // Debug: chụp ảnh màn hình khi có lỗi
      try {
        const screenshotPath = `./storage/error_screenshot_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        log.info(`Đã chụp ảnh màn hình lỗi: ${screenshotPath}`);
      } catch (screenshotErr: any) {
        log.error(`Không thể chụp ảnh màn hình: ${screenshotErr.message}`);
      }
    }
  },

  // Xử lý lỗi request, bao gồm 403
  async failedRequestHandler({ request, log, error }) {
    log.error(`Request ${request.url} thất bại sau ${request.retryCount} lần thử lại: ${error.message}`);
  },
});

await crawler.run(startUrls);

// Ghi file
fs.writeFileSync(outputFile, JSON.stringify(allItems, null, 2), 'utf-8');
console.log(`Đã lưu ${allItems.length} mục vào ${outputFile}`);

// Thêm dấu thời gian cho file
const now = new Date();
const timestamp = now
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+/, '')
  .replace('T', '_');

const outputFileWithTimestamp = `${storageDir}/traveloka_hotels_${timestamp}.json`;
fs.copyFileSync(outputFile, outputFileWithTimestamp);
console.log(`Đã tạo bản sao với dấu thời gian: ${outputFileWithTimestamp}`);

