import { PlaywrightCrawler } from 'crawlee';
import { Page } from 'playwright';
import { randomUUID } from 'crypto';
import {
  BaseCrawlRequest,
  CrawlOptions,
  CrawlResultData,
  StreamCallback,
  StreamEvent,
} from '../types/crawl';
import { logger } from '../utils/logger';

export type SiteHandler<T extends CrawlResultData> = (
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<T>,
) => Promise<T>;

export type ListHandler<T extends CrawlResultData> = (
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<T>,
) => Promise<T[]>;

export type DetailHandler<T extends CrawlResultData> = (
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<T>,
) => Promise<T>;

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; DataCrawler/1.0; +https://example.com/bot)';

/**
 * Optimized wait strategy: waits for either critical selector or timeout
 * This reduces wait time significantly compared to networkidle
 */
async function smartWait(
  page: Page,
  criticalSelectors: string[],
  timeout: number = 15000,
): Promise<void> {
  const startTime = Date.now();

  // Try to wait for critical selectors first
  const selectorPromises = criticalSelectors.map((selector) =>
    page
      .waitForSelector(selector, { timeout: 5000, state: 'attached' })
      .catch(() => null),
  );

  // Race between selectors and a shorter timeout
  // Use Promise.race with all selector promises
  const selectorRace = Promise.race(
    selectorPromises.map((p) => p.then((result) => ({ success: true, result }))),
  );

  await Promise.race([
    selectorRace,
    new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 5000))),
  ]);

  // If we still have time, wait a bit more for dynamic content
  const elapsed = Date.now() - startTime;
  if (elapsed < timeout) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, timeout - elapsed)));
  }
}

export abstract class BaseCrawler<T extends CrawlResultData> {
  constructor(
    private readonly siteHandlers: Record<string, SiteHandler<T>>,
    private readonly listHandlers: Record<string, ListHandler<T>> = {},
    private readonly detailHandlers: Record<string, DetailHandler<T>> = {},
  ) { }

  async crawl(
    request: BaseCrawlRequest,
    onStream?: StreamCallback<T>,
  ): Promise<T> {
    const handler = this.siteHandlers[request.site];
    if (!handler) {
      throw new Error(`Unsupported site '${request.site}' for category ${request.category}`);
    }

    const options: CrawlOptions = request.options ?? {};
    let result: T | undefined;
    const startTime = Date.now();

    // Generate unique request ID for tracking and isolation
    // Each concurrent request gets its own isolated browser context and storage
    const requestId = randomUUID();

    logger.info(`Starting crawl request ${requestId} for ${request.category}/${request.site}`);

    // Helper function to wrap events with requestId and timestamp
    // This ensures each event can be identified by the client to prevent conflicts
    const emitEvent = (event: {
      type: 'progress';
      message: string;
      progress?: number;
    } | {
      type: 'data';
      data: T | T[];
      index?: number;
      total?: number;
    } | {
      type: 'complete';
      totalItems?: number;
      duration?: number;
    } | {
      type: 'error';
      error: string;
    }) => {
      if (onStream) {
        const enrichedEvent = {
          ...event,
          requestId,
          timestamp: Date.now(),
        } as StreamEvent<T>;
        onStream(enrichedEvent, requestId);
      }
    };

    // Emit progress event
    emitEvent({
      type: 'progress',
      message: `Starting crawl for ${request.site}...`,
      progress: 0,
    });

    // Each PlaywrightCrawler instance creates its own isolated:
    // - Browser context (separate cookies, cache, storage)
    // - Storage directory (managed by Crawlee automatically)
    // - Request queue (isolated per instance)
    // This ensures no data conflicts between concurrent requests
    const crawler = new PlaywrightCrawler({
      // maxRequestsPerCrawl: 1,
      minConcurrency: 1,
      maxConcurrency: 1,
      requestHandlerTimeoutSecs: Math.ceil((options.timeout ?? DEFAULT_TIMEOUT) / 1000),
      launchContext: {
        launchOptions: {
          headless: options.headless ?? (process.env.HEADLESS === 'false' ? false : true),
        },
      },
      requestHandler: async ({ page }) => {
        try {
          logger.info(`Navigating to URL ${request.url} for site ${request.site}`);

          emitEvent({
            type: 'progress',
            message: 'Loading page...',
            progress: 10,
          });

          // Optimized navigation: use 'domcontentloaded' instead of 'networkidle'
          // This is much faster and usually sufficient
          await page.goto(request.url, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeout ?? DEFAULT_TIMEOUT,
          });

          emitEvent({
            type: 'progress',
            message: 'Page loaded, extracting data...',
            progress: 30,
          });

          // Use smart wait instead of networkidle
          // This waits for critical content or times out quickly
          await smartWait(page, [], 3000);

          emitEvent({
            type: 'progress',
            message: 'Processing data...',
            progress: 50,
          });

          // Create wrapper callback that automatically adds requestId and timestamp
          // This ensures all events from handlers also have requestId to prevent conflicts
          const wrappedStreamCallback: StreamCallback<T> = (event, providedRequestId) => {
            if (onStream) {
              // If event already has requestId, use it; otherwise use the one from this request
              const enrichedEvent = {
                ...event,
                requestId: (event as any).requestId || requestId,
                timestamp: (event as any).timestamp || Date.now(),
              } as StreamEvent<T>;
              onStream(enrichedEvent, requestId);
            }
          };

          result = await handler(page, request.url, options, wrappedStreamCallback);

          emitEvent({
            type: 'progress',
            message: 'Crawl completed',
            progress: 100,
          });
        } catch (error) {
          logger.error(`Error in requestHandler for ${request.site}`, {
            url: request.url,
            site: request.site,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          // Re-throw the error so it's caught by the outer try-catch
          throw error;
        }
      },
    });

    try {
      await crawler.run([{ url: request.url }]);

      if (!result) {
        throw new Error(`Failed to crawl data for site '${request.site}'`);
      }

      const duration = Date.now() - startTime;
      emitEvent({
        type: 'complete',
        totalItems: Array.isArray(result) ? result.length : 1,
        duration,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emitEvent({
        type: 'error',
        error: errorMessage,
      });
      throw error;
    }
  }


  async crawlList(
    request: BaseCrawlRequest,
    onStream?: StreamCallback<T>,
  ): Promise<T[]> {
    const handler = this.listHandlers[request.site];
    if (!handler) {
      throw new Error(`Unsupported site '${request.site}' for list crawl in category ${request.category}`);
    }

    const options: CrawlOptions = request.options ?? {};
    let result: T[] | undefined;
    const startTime = Date.now();
    const requestId = randomUUID();

    logger.info(`Starting list crawl request ${requestId} for ${request.category}/${request.site}`);

    const emitEvent = (event: any) => {
      if (onStream) {
        const enrichedEvent = {
          ...event,
          requestId,
          timestamp: Date.now(),
        } as StreamEvent<T>;
        onStream(enrichedEvent, requestId);
      }
    };

    emitEvent({
      type: 'progress',
      message: `Starting list crawl for ${request.site
        }...`,
      progress: 0,
    });

    const crawler = new PlaywrightCrawler({
      minConcurrency: 1,
      maxConcurrency: 1,
      requestHandlerTimeoutSecs: Math.ceil((options.timeout ?? DEFAULT_TIMEOUT) / 1000),
      launchContext: {
        launchOptions: {
          headless: options.headless ?? (process.env.HEADLESS === 'false' ? false : true),
        },
      },
      requestHandler: async ({ page }) => {
        try {
          logger.info(`Navigating to URL ${request.url} for site ${request.site}`);

          emitEvent({
            type: 'progress',
            message: 'Loading page...',
            progress: 10,
          });

          await page.goto(request.url, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeout ?? DEFAULT_TIMEOUT,
          });

          emitEvent({
            type: 'progress',
            message: 'Page loaded, extracting data...',
            progress: 30,
          });

          await smartWait(page, [], 3000);

          emitEvent({
            type: 'progress',
            message: 'Processing data...',
            progress: 50,
          });

          const wrappedStreamCallback: StreamCallback<T> = (event, providedRequestId) => {
            if (onStream) {
              const enrichedEvent = {
                ...event,
                requestId: (event as any).requestId || requestId,
                timestamp: (event as any).timestamp || Date.now(),
              } as StreamEvent<T>;
              onStream(enrichedEvent, requestId);
            }
          };

          result = await handler(page, request.url, options, wrappedStreamCallback);

          emitEvent({
            type: 'progress',
            message: 'Crawl list completed',
            progress: 100,
          });
        } catch (error) {
          logger.error(`Error in list requestHandler for ${request.site}`, {
            url: request.url,
            site: request.site,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    });

    try {
      await crawler.run([{ url: request.url }]);

      if (!result) {
        throw new Error(`Failed to crawl list data for site '${request.site}'`);
      }

      const duration = Date.now() - startTime;
      emitEvent({
        type: 'complete',
        totalItems: result.length,
        duration,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emitEvent({
        type: 'error',
        error: errorMessage,
      });
      throw error;
    }
  }

  async crawlDetail(
    request: BaseCrawlRequest,
    onStream?: StreamCallback<T>,
  ): Promise<T> {
    const handler = this.detailHandlers[request.site];
    if (!handler) {
      throw new Error(`Unsupported site '${request.site}' for detail crawl in category ${request.category} `);
    }

    const options: CrawlOptions = request.options ?? {};
    let result: T | undefined;
    const startTime = Date.now();
    const requestId = randomUUID();

    logger.info(`Starting detail crawl request ${requestId} for ${request.category} / ${request.site}`);

    const emitEvent = (event: any) => {
      if (onStream) {
        const enrichedEvent = {
          ...event,
          requestId,
          timestamp: Date.now(),
        } as StreamEvent<T>;
        onStream(enrichedEvent, requestId);
      }
    };

    emitEvent({
      type: 'progress',
      message: `Starting detail crawl for ${request.site}...`,
      progress: 0,
    });

    const crawler = new PlaywrightCrawler({
      minConcurrency: 1,
      maxConcurrency: 1,
      requestHandlerTimeoutSecs: Math.ceil((options.timeout ?? DEFAULT_TIMEOUT) / 1000),
      launchContext: {
        launchOptions: {
          headless: options.headless ?? (process.env.HEADLESS === 'false' ? false : true),
        },
      },
      requestHandler: async ({ page }) => {
        try {
          logger.info(`Navigating to URL ${request.url} for site ${request.site}`);

          emitEvent({
            type: 'progress',
            message: 'Loading page...',
            progress: 10,
          });

          await page.goto(request.url, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeout ?? DEFAULT_TIMEOUT,
          });

          emitEvent({
            type: 'progress',
            message: 'Page loaded, extracting data...',
            progress: 30,
          });

          await smartWait(page, [], 3000);

          emitEvent({
            type: 'progress',
            message: 'Processing data...',
            progress: 50,
          });

          const wrappedStreamCallback: StreamCallback<T> = (event, providedRequestId) => {
            if (onStream) {
              const enrichedEvent = {
                ...event,
                requestId: (event as any).requestId || requestId,
                timestamp: (event as any).timestamp || Date.now(),
              } as StreamEvent<T>;
              onStream(enrichedEvent, requestId);
            }
          };

          result = await handler(page, request.url, options, wrappedStreamCallback);

          emitEvent({
            type: 'progress',
            message: 'Crawl detail completed',
            progress: 100,
          });
        } catch (error) {
          logger.error(`Error in detail requestHandler for ${request.site}`, {
            url: request.url,
            site: request.site,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    });

    try {
      await crawler.run([{ url: request.url }]);

      if (!result) {
        throw new Error(`Failed to crawl detail data for site '${request.site}'`);
      }

      const duration = Date.now() - startTime;
      emitEvent({
        type: 'complete',
        totalItems: 1,
        duration,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emitEvent({
        type: 'error',
        error: errorMessage,
      });
      throw error;
    }
  }
}
