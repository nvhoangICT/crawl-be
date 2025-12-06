import { createServer } from './app';
import { loadEnv } from './utils/env';
import { logger } from './utils/logger';

async function bootstrap() {
  loadEnv();
  const app = createServer();
  const port = Number(process.env.PORT || 4000);

  app.listen(port, () => {
    logger.info(`Crawl data service listening on port ${port}`);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to bootstrap application', { error });
  process.exit(1);
});
