import { PlaywrightCrawler } from 'crawlee';
import fs from 'fs';

const storageDir = './storage';
const logsDir = './logs';
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const outputFile = `${storageDir}/klook_hotels.json`;
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+/, '')
  .replace('T', '_');
const errorLogFile = `${logsDir}/klook_error_log_${timestamp}.txt`;

type HotelRecord = Record<string, unknown> & { detailLink?: string | null };

let allHotels: HotelRecord[] = [];
if (fs.existsSync(outputFile)) {
  try {
    const raw = fs.readFileSync(outputFile, 'utf-8');
    const parsed = JSON.parse(raw);
    allHotels = Array.isArray(parsed) ? parsed : [];
    allHotels = allHotels.filter((hotel) => hotel?.detailLink);
  } catch {
    allHotels = [];
  }
}

const logErrorToFile = (message: string) => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(errorLogFile, line, 'utf-8');
};

const upsertHotel = (hotel: HotelRecord, log: typeof console) => {
  try {
    if (!hotel?.detailLink) return;
    const safeMerge = (existingObj: HotelRecord, incomingObj: HotelRecord) => {
      const result: HotelRecord = { ...existingObj };
      for (const [key, value] of Object.entries(incomingObj || {})) {
        const isEmptyString = typeof value === 'string' && value.trim() === '';
        const isEmptyArray = Array.isArray(value) && value.length === 0;
        const isNullish = value === null || value === undefined;
        if (isNullish || isEmptyString || isEmptyArray) continue;
        result[key] = value;
      }
      return result;
    };
    const idx = allHotels.findIndex((h) => h.detailLink === hotel.detailLink);
    if (idx === -1) {
      allHotels.push(hotel);
      log.info?.(`✅ Thêm mới: ${(hotel as Record<string, unknown>).ten_khach_san ?? hotel.detailLink}`);
    } else {
      allHotels[idx] = safeMerge(allHotels[idx], hotel);
      log.info?.(`♻️ Cập nhật: ${(hotel as Record<string, unknown>).ten_khach_san ?? hotel.detailLink}`);
    }
    fs.writeFileSync(outputFile, JSON.stringify(allHotels, null, 2), 'utf-8');
  } catch (err) {
    const msg = `❌ Lỗi ghi file ${outputFile}: ${(err as Error).message}`;
    log.error?.(msg);
    logErrorToFile(msg);
  }
};

const startUrls = [
  process.env.START_URL ||
    process.env.KLOOK_START_URL ||
    'https://www.klook.com/vi/hotels/searchresult/?room_num=1&adult_num=2&child_num=0&age=&city_id=549&stype=city&svalue=549&override=V%C5%A9ng%20T%C3%A0u,%20VI%E1%BB%86T%20NAM%20&title=V%C5%A9ng%20T%C3%A0u&sort=hotel_score&limit=20&current_page=1&filter_list=',
].filter(Boolean) as string[];

if (startUrls.length === 0) {
  console.log('⚠️ Vui lòng set START_URL hoặc KLOOK_START_URL để chạy crawler Klook listing.');
  process.exit(0);
}

const crawler = new PlaywrightCrawler({
  minConcurrency: 1,
  maxConcurrency: 2,
  maxRequestsPerMinute: 6,
  requestHandlerTimeoutSecs: 1800,
  async requestHandler({ page, request, log }) {
    log.info(`🔎 Klook listing: ${request.url}`);

    try {
      await page.waitForSelector('.hotel-card', { timeout: 25000 });

      let prevTotal = 0;
      let stableRounds = 0;
      for (let round = 0; round < 240; round++) {
        await page.evaluate(() => {
          const delta = Math.floor(window.innerHeight * 0.85);
          window.scrollBy(0, delta);
        });
        await page.waitForTimeout(500 + Math.floor(Math.random() * 400));

        const more = page
          .locator('button, a[role="button"], .klk-button, .load-more, [data-load-more]')
          .filter({ hasText: /xem thêm|load more|hiển thị thêm|more/i });
        if (await more.count()) {
          try {
            await more.last().click({ timeout: 8000 });
          } catch {
            // ignore
          }
        }

        const curTotal = await page.locator('.hotel-card').count();
        if (curTotal > prevTotal) {
          prevTotal = curTotal;
          stableRounds = 0;
        } else {
          stableRounds += 1;
        }

        if (round % 5 === 0) {
          await page.evaluate(() => window.scrollBy(0, -Math.floor(window.innerHeight * 0.25)));
          await page.waitForTimeout(250);
        }

        if (stableRounds >= 10) break;
      }

      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(600);
      }

      if (typeof page.isClosed === 'function' && page.isClosed()) {
        throw new Error('Page was closed before extraction');
      }

      const hotelsOnPage: HotelRecord[] = await page.evaluate(() => {
        const toText = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
        const toAbsUrl = (href: string | null) => {
          try {
            return href ? new URL(href, location.origin).toString() : '';
          } catch {
            return href || '';
          }
        };
        const toInt = (s: string | null) => {
          const m = (s || '').replace(/\D/g, '');
          return m ? parseInt(m, 10) : null;
        };

        return Array.from(document.querySelectorAll('.hotel-card')).map((card) => {
          const imageEl = card.querySelector<HTMLImageElement>('.hotel-image-single img');
          const image = imageEl?.getAttribute('src') || imageEl?.getAttribute('data-src') || '';

          const nameLink = card.querySelector<HTMLAnchorElement>('.hotel-info-name h3 a, .hotel-name-section a, h3.prefix a');
          const ten_khach_san = toText(nameLink) || toText(card.querySelector('.hotel-info-name'));
          const detailHref = nameLink?.getAttribute('href') || '';
          const detailLink = toAbsUrl(detailHref);

          const reviewScore = toText(card.querySelector('.hotel-review-score'));
          const reviewDesc = toText(card.querySelector('.hotel-review-desc'));
          const reviewCount = toText(card.querySelector('.hotel-review-count'));

          const locationText = toText(card.querySelector('.hotel-location .text')).replace(/\s*Xem bản đồ\s*/i, '').trim();

          const tags = Array.from(card.querySelectorAll('.hotel-tag-wrap .tag-content, .hotel-tag-section .tag-content'))
            .map((el) => toText(el))
            .filter(Boolean);

          const currencySymbol = toText(card.querySelector('.price-sale i')) || '₫';
          const priceText = toText(card.querySelector('.price-sale .price-amount'));
          const priceNumeric = toInt(priceText);

          const dateTip = toText(card.querySelector('.date-tip'));

          return {
            ten_khach_san,
            detailLink,
            hinh_anh: image,
            diem_danh_gia: reviewScore,
            danh_gia_text: reviewDesc,
            so_luong_danh_gia: reviewCount,
            dia_chi: locationText,
            tag_list: tags,
            don_vi_tien: currencySymbol,
            gia_da_giam: priceText,
            gia_da_giam_so: priceNumeric,
            ghi_chu_gia: dateTip,
          };
        });
      });

      for (const hotel of hotelsOnPage) {
        if (!hotel?.detailLink) continue;
        upsertHotel(hotel, log);
      }

      log.info(`📦 Klook listing thu thập: ${hotelsOnPage.length} khách sạn.`);
    } catch (err) {
      const errorMessage = `❌ Lỗi Klook listing ${request.url}: ${(err as Error).message}`;
      log.error(errorMessage);
      logErrorToFile(errorMessage);
    }
  },

  async failedRequestHandler({ request, error, log }) {
    const errorMessage = `❌ Request thất bại ${request.url}: ${error.message}`;
    log.error(errorMessage);
    logErrorToFile(errorMessage);
  },
});

await crawler.run(startUrls);
console.log(`🎉 Hoàn tất Klook listing. Kết quả: ${outputFile}`);
console.log(`📝 Log lỗi: ${errorLogFile}`);
console.log(`📦 Tổng bản ghi: ${allHotels.length}`);

