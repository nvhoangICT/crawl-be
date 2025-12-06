import { randomUUID } from 'crypto';
import {
  BaseCrawlRequest,
  CrawlResultData,
  StreamCallback,
  StreamEvent,
} from '../types/crawl';
import { CrawlJobRecord } from '../types/jobs';
import { CrawlService } from './crawl.service';
import { logger } from '../utils/logger';

export class CrawlJobService {
  private static instance: CrawlJobService;

  private readonly crawlService = new CrawlService();
  private readonly jobs = new Map<string, CrawlJobRecord>();
  private readonly results = new Map<string, CrawlResultData>();
  private readonly queue: string[] = [];
  private isProcessing = false;

  private constructor() {}

  static getInstance(): CrawlJobService {
    if (!CrawlJobService.instance) {
      CrawlJobService.instance = new CrawlJobService();
    }

    return CrawlJobService.instance;
  }

  createJob(request: BaseCrawlRequest): CrawlJobRecord {
    const jobId = randomUUID();
    const job: CrawlJobRecord = {
      jobId,
      status: 'queued',
      progress: 0,
      currentStep: 'Queued',
      createdAt: new Date().toISOString(),
      params: request,
    };

    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    void this.processQueue();

    return { ...job };
  }

  getJob(jobId: string): CrawlJobRecord | undefined {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : undefined;
  }

  getResult(jobId: string): CrawlResultData | undefined {
    return this.results.get(jobId);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (!jobId) {
        continue;
      }

      try {
        await this.runJob(jobId);
      } catch (error) {
        logger.error('Job execution failed', { jobId, error });
      }
    }

    this.isProcessing = false;
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.currentStep = 'Initializing crawler';

    const streamCallback: StreamCallback = (event) => {
      this.handleStreamEvent(jobId, event as StreamEvent);
    };

    try {
      const data = await this.crawlService.crawl(job.params, streamCallback);
      this.results.set(jobId, data);

      job.status = 'done';
      job.progress = 100;
      job.currentStep = 'Completed';
      job.finishedAt = new Date().toISOString();

      logger.info('Crawl job completed', { jobId });
    } catch (error) {
      job.status = 'error';
      job.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      job.finishedAt = new Date().toISOString();
      job.currentStep = 'Failed';

      logger.error('Crawl job failed', { jobId, error: job.errorMessage });
    }
  }

  private handleStreamEvent(jobId: string, event: StreamEvent): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    switch (event.type) {
      case 'progress':
        if (typeof event.progress === 'number') {
          job.progress = event.progress;
        }
        if (event.message) {
          job.currentStep = event.message;
        }
        break;
      case 'error':
        job.currentStep = event.error;
        job.errorMessage = event.error;
        break;
      case 'complete':
        job.progress = 100;
        job.currentStep = 'Completed';
        break;
      default:
        break;
    }
  }
}
