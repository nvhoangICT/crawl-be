import fs from 'fs';
import path from 'path';
import { chromium, Page } from 'playwright';

type CrawlResult = {
  url: string;
  queryLabel: string;
  rawText?: string;
  count?: number | null;
  durationMs: number;
  error?: string;
};

const urls: string[] = [
  'https://www.google.com/travel/search?q=Phường+Hoàn+Kiếm,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Cửa+Nam,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Ba+Đình,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Ngọc+Hà,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Giảng+Võ,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Hai+Bà+Trưng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Vĩnh+Tuy,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Bạch+Mai,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Đống+Đa,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Kim+Liên,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Văn+Miếu+-+Quốc+Tử+Giám,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Láng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Ô+Chợ+Dừa,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Hồng+Hà,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Lĩnh+Nam,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Hoàng+Mai,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Vĩnh+Hưng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Tương+Mai,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Định+Công,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Hoàng+Liệt,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Yên+Sở,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Thanh+Xuân,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Khương+Đình,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Phương+Liệt,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Cầu+Giấy,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Nghĩa+Đô,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Yên+Hoà,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Tây+Hồ,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Phú+Thượng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Tây+Tựu,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Phú+Diễn,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Xuân+Đỉnh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Đông+Ngạc,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Thượng+Cát,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Từ+Liêm,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Xuân+Phương,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Tây+Mỗ,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Đại+Mỗ,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Long+Biên,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Bồ+Đề,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Việt+Hưng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Phúc+Lợi,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Hà+Đông,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Dương+Nội,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Yên+Nghĩa,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Phú+Lương,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Kiến+Hưng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Thanh+Trì,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Đại+Thanh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Nam+Phù,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Ngọc+Hồi,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Thanh+Liệt,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Thượng+Phúc,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Thường+Tín,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Chương+Dương,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hồng+Vân,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phú+Xuyên,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phượng+Dực,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Chuyên+Mỹ,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Đại+Xuyên,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Thanh+Oai,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Bình+Minh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Tam+Hưng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Dân+Hoà,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Vân+Đình,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Ứng+Thiên,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hoà+Xá,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Ứng+Hoà,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Mỹ+Đức,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hồng+Sơn,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phúc+Sơn,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hương+Sơn,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Chương+Mỹ,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phú+Nghĩa,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Xuân+Mai,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Trần+Phú,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hoà+Phú,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Quảng+Bị,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Minh+Châu,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Quảng+Oai,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Vật+Lại,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Cổ+Đô,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Bất+Bạt,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Suối+Hai,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Ba+Vì,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Yên+Bài,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Sơn+Tây,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Phường+Tùng+Thiện,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Đoài+Phương,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phúc+Thọ,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phúc+Lộc,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hát+Môn,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Thạch+Thất,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hạ+Bằng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Tây+Phương,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hoà+Lạc,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Yên+Xuân,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Quốc+Oai,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hưng+Đạo,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Kiều+Phú,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phú+Cát,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Hoài+Đức,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Dương+Hoà,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Sơn+Đồng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+An+Khánh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Đan+Phượng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Ô+Diên,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Liên+Minh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Gia+Lâm,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Thuận+An,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Bát+Tràng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phù+Đổng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Thư+Lâm,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Đông+Anh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Phúc+Thịnh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Thiên+Lộc,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Vĩnh+Thanh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Mê+Linh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Yên+Lãng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Tiến+Thắng,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Quang+Minh,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Sóc+Sơn,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Đa+Phúc,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Nội+Bài,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Trung+Giã,+Thành+phố+Hà+Nội',
  'https://www.google.com/travel/search?q=Xã+Kim+Anh,+Thành+phố+Hà+Nội',
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseCount = (text?: string): number | null => {
  if (!text) return null;
  const match = text.match(/(\d[\d.,]*)/);
  if (!match) return null;
  const numeric = match[1].replace(/[.,\s]/g, '');
  const value = Number(numeric);
  return Number.isFinite(value) ? value : null;
};

const extractFromPage = async (page: Page): Promise<{ rawText: string; count: number | null }> => {
  await page.waitForSelector('div.GDEAO', { timeout: 20000 });
  const texts = await page.locator('div.GDEAO').allTextContents();
  const cleaned = texts
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const targetText =
    cleaned.find((t) => /kết\s*quả/i.test(t)) ??
    cleaned.find((t) => /result/i.test(t)) ??
    cleaned[0] ??
    '';

  return {
    rawText: targetText,
    count: parseCount(targetText),
  };
};

async function crawlUrl(page: Page, url: string): Promise<{ rawText: string; count: number | null }> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500);
  try {
    return await extractFromPage(page);
  } catch (primaryError) {
    // Retry once after small wait
    await page.waitForTimeout(2000);
    return await extractFromPage(page);
  }
}

const getQueryLabel = (url: string): string => {
  try {
    const q = new URL(url).searchParams.get('q') || '';
    return decodeURIComponent(q).replace(/\+/g, ' ').trim();
  } catch {
    return url;
  }
};

async function main() {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
  });
  const context = await browser.newContext({
    locale: 'vi-VN',
    userAgent: USER_AGENT,
    viewport: { width: 1300, height: 900 },
  });

  const results: CrawlResult[] = [];
  const startAll = Date.now();

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const label = getQueryLabel(url);
    const started = Date.now();
    const page = await context.newPage();
    try {
      const { rawText, count } = await crawlUrl(page, url);
      const durationMs = Date.now() - started;
      const result: CrawlResult = {
        url,
        queryLabel: label,
        rawText,
        count,
        durationMs,
      };
      results.push(result);
      console.log(`[${i + 1}/${urls.length}] ${label}: ${count ?? 'N/A'} (${rawText})`);
    } catch (error) {
      const durationMs = Date.now() - started;
      const result: CrawlResult = {
        url,
        queryLabel: label,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(result);
      console.error(`[${i + 1}/${urls.length}] ${label}: lỗi - ${result.error}`);
    } finally {
      await page.close();
      await sleep(800 + Math.floor(Math.random() * 400));
    }
  }

  await context.close();
  await browser.close();

  const outputPath = path.join(process.cwd(), 'google-travel-hotel-counts.json');
  fs.writeFileSync(outputPath, JSON.stringify({ totalDurationMs: Date.now() - startAll, results }, null, 2), 'utf-8');
  console.log(`Đã lưu kết quả vào ${outputPath}`);
}

main().catch((error) => {
  console.error('Crawler lỗi:', error);
  process.exit(1);
});
