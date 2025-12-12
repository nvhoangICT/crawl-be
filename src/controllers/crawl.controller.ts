import { Request, Response } from 'express';
import { z } from 'zod';
import { CrawlService } from '../services/crawl.service';
import { logger } from '../utils/logger';
import { CrawlResponse, StreamEvent } from '../types/crawl';
import { CrawlJobService } from '../services/crawlJob.service';

const bodySchema = z.object({
  category: z.enum(['news', 'hotels', 'restaurant', 'attraction', 'maps', 'landmarks']),
  site: z.string().min(2),
  url: z.string().url(),
  crawledBy: z.string().uuid().optional(),
  crawlerName: z.string().min(1).optional(),
  options: z
    .object({
      locale: z.string().optional(),
      timeout: z.number().int().positive().optional(),
      maxPages: z.number().int().positive().optional(),
      headless: z.boolean().optional(),
    })
    .optional(),
});

export class CrawlController {
  private readonly crawlService = new CrawlService();
  private readonly crawlJobService = CrawlJobService.getInstance();

  async handleCrawl(req: Request, res: Response<CrawlResponse>) {
    try {
      const parsed = bodySchema.parse(req.body);
      // Ensure URL is valid and absolute
      new URL(parsed.url);

      const data = await this.crawlService.crawl(parsed);

      return res.json({
        success: true,
        category: parsed.category,
        site: parsed.site,
        url: parsed.url,
        data,
      });
    } catch (error) {
      logger.error('Request failed', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request payload',
          details: error.flatten(),
        });
      }

      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to crawl',
        details: {
          supportedCategories: this.crawlService.getSupportedCategories(),
        },
      });
    }
  }

  async handleCrawlList(req: Request, res: Response<CrawlResponse>) {
    try {
      const parsed = bodySchema.parse(req.body);
      new URL(parsed.url);

      const data = await this.crawlService.crawlList(parsed);

      return res.json({
        success: true,
        category: parsed.category,
        site: parsed.site,
        url: parsed.url,
        data,
      });
    } catch (error) {
      logger.error('List request failed', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request payload',
          details: error.flatten(),
        });
      }
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to crawl list',
        details: {
          supportedCategories: this.crawlService.getSupportedCategories(),
        },
      });
    }
  }

  async handleCrawlDetail(req: Request, res: Response<CrawlResponse>) {
    try {
      const parsed = bodySchema.parse(req.body);
      new URL(parsed.url);

      const data = await this.crawlService.crawlDetail(parsed);

      return res.json({
        success: true,
        category: parsed.category,
        site: parsed.site,
        url: parsed.url,
        data,
      });
    } catch (error) {
      logger.error('Detail request failed', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request payload',
          details: error.flatten(),
        });
      }
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to crawl detail',
        details: {
          supportedCategories: this.crawlService.getSupportedCategories(),
        },
      });
    }
  }

  async handleCrawlJob(req: Request, res: Response) {
    try {
      const parsed = bodySchema.parse(req.body);
      new URL(parsed.url);

      const job = this.crawlJobService.createJob(parsed);

      return res.status(202).json({
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        message: 'Đã nhận yêu cầu crawl, vui lòng kiểm tra trạng thái qua endpoint /status.',
        category: parsed.category,
        site: parsed.site,
        url: parsed.url,
      });
    } catch (error) {
      logger.error('Failed to enqueue crawl job', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request payload',
          details: error.flatten(),
        });
      }

      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enqueue crawl job',
      });
    }
  }

  async getCrawlStatus(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        return res.status(400).json({ success: false, error: 'Missing jobId' });
      }

      const job = this.crawlJobService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      return res.json({
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        createdAt: job.createdAt,
        startedAt: job.startedAt ?? null,
        finishedAt: job.finishedAt ?? null,
        errorMessage: job.errorMessage ?? null,
        category: job.params.category,
        site: job.params.site,
        url: job.params.url,
      });
    } catch (error) {
      logger.error('Failed to get crawl status', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch job status' });
    }
  }

  async getCrawlResult(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        return res.status(400).json({ success: false, error: 'Missing jobId' });
      }

      const job = this.crawlJobService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      if (job.status === 'queued' || job.status === 'running') {
        return res.status(202).json({
          status: job.status,
          message: 'Job chưa hoàn thành, vui lòng kiểm tra lại sau.',
        });
      }

      if (job.status === 'error') {
        return res.status(500).json({
          status: 'error',
          errorMessage: job.errorMessage ?? 'Unknown error',
        });
      }

      const result = this.crawlJobService.getResult(jobId);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Result not found' });
      }

      return res.json({
        status: 'done',
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get crawl result', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch result' });
    }
  }

  /**
   * Streaming endpoint using Server-Sent Events (SSE)
   * Returns data incrementally as it's crawled, similar to ChatGPT streaming
   */
  async handleCrawlStream(req: Request, res: Response) {
    try {
      const parsed = bodySchema.parse(req.body);
      // Ensure URL is valid and absolute
      new URL(parsed.url);

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Generate request ID for this stream connection
      // This helps client identify events from this specific request
      const streamRequestId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Helper function to send SSE message
      // All events already have requestId from BaseCrawler, but we log it here for tracking
      const sendEvent = (event: StreamEvent) => {
        try {
          const data = JSON.stringify(event);
          res.write(`data: ${data}\n\n`);
          // Log event for debugging (optional)
          logger.debug(`Stream event [${event.requestId}]: ${event.type}`);
        } catch (error) {
          logger.error('Error sending stream event', error);
        }
      };

      // Handle client disconnect
      req.on('close', () => {
        logger.info(`Client disconnected from stream [${streamRequestId}]`);
        res.end();
      });

      // Start crawling with streaming callback
      // All events will have requestId automatically added by BaseCrawler
      this.crawlService
        .crawl(parsed, (event) => {
          sendEvent(event);
        })
        .then(() => {
          // Stream is complete, close connection
          res.end();
        })
        .catch((error) => {
          logger.error('Crawl stream error', error);
          // Generate a temporary requestId for error events
          const errorRequestId = `error-${Date.now()}`;
          sendEvent({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            requestId: errorRequestId,
            timestamp: Date.now(),
          });
          res.end();
        });
    } catch (error) {
      logger.error('Stream request failed', error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid request payload',
          details: error.flatten(),
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to crawl',
        details: {
          supportedCategories: this.crawlService.getSupportedCategories(),
        },
      });
    }
  }
}
