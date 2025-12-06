import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { crawlRouter } from './routes/crawl.route';
import { logger } from './utils/logger';

export function createServer() {
  const app = express();

  // Enable CORS for all routes
  app.use(cors({
    origin: true, // Allow all origins (you can specify specific origins like 'http://localhost:5173' if needed)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/crawl', crawlRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}
