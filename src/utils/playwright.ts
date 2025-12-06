import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { CrawlOptions } from '../types/crawl';

export interface BrowserArtifacts {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; DataCrawler/1.0; +https://example.com/bot)';

export async function createBrowser(options?: CrawlOptions): Promise<BrowserArtifacts> {
  const browser = await chromium.launch({
    // headless: options?.headless ?? (process.env.HEADLESS === 'false' ? false : true),
    headless: true,
  });

  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    locale: options?.locale ?? 'en-US',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(options?.timeout ?? DEFAULT_TIMEOUT);

  return { browser, context, page };
}

export async function withPage<T>(
  options: CrawlOptions | undefined,
  handler: (page: Page) => Promise<T>,
): Promise<T> {
  const { browser, context, page } = await createBrowser(options);
  try {
    return await handler(page);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}
