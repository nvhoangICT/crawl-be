import { Router } from 'express';
import { CrawlController } from '../controllers/crawl.controller';

const controller = new CrawlController();

export const crawlRouter = Router();

crawlRouter.post('/', controller.handleCrawl.bind(controller));
crawlRouter.post('/list', controller.handleCrawlList.bind(controller));
crawlRouter.post('/detail', controller.handleCrawlDetail.bind(controller));
crawlRouter.post('/job', controller.handleCrawlJob.bind(controller));
crawlRouter.post('/stream', controller.handleCrawlStream.bind(controller));
crawlRouter.get('/status/:jobId', controller.getCrawlStatus.bind(controller));
crawlRouter.get('/result/:jobId', controller.getCrawlResult.bind(controller));
