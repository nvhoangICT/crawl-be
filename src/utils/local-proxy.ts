/**
 * Simple local HTTP proxy server for testing
 * This is a basic proxy implementation for development/testing purposes
 * For production, use a proper proxy service
 */

import http from 'http';
import net from 'net';
import { logger } from './logger';

interface ProxyServerOptions {
  port?: number;
  host?: string;
}

export class LocalProxyServer {
  private server: http.Server | null = null;
  private port: number;
  private host: string;

  constructor(options: ProxyServerOptions = {}) {
    this.port = options.port || 8888;
    this.host = options.host || 'localhost';
  }

  /**
   * Start the proxy server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer((req, res) => {
          this.handleRequest(req, res);
        });

        this.server.on('connect', (req, clientSocket, head) => {
          this.handleConnect(req, clientSocket, head);
        });

        this.server.listen(this.port, this.host, () => {
          logger.info(`Local proxy server started on http://${this.host}:${this.port}`);
          resolve();
        });

        this.server.on('error', (error) => {
          logger.error('Proxy server error', { error });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the proxy server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Local proxy server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';
    const options = {
      hostname: req.headers.host?.split(':')[0] || 'localhost',
      port: parseInt(req.headers.host?.split(':')[1] || '80', 10),
      path: url,
      method: req.method,
      headers: req.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      logger.error('Proxy request error', { error, url });
      res.writeHead(500);
      res.end('Proxy Error');
    });

    req.pipe(proxyReq);
  }

  /**
   * Handle HTTPS CONNECT requests
   */
  private handleConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer,
  ): void {
    const url = new URL(`https://${req.url}`);
    const serverSocket = net.connect(parseInt(url.port) || 443, url.hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (error) => {
      logger.error('HTTPS proxy error', { error, url: req.url });
      clientSocket.end();
    });

    clientSocket.on('error', () => {
      serverSocket.end();
    });
  }

  getProxyUrl(): string {
    return `http://${this.host}:${this.port}`;
  }
}

/**
 * Start a local proxy server for testing
 * Usage: node -r ts-node/register src/utils/local-proxy.ts
 */
if (require.main === module) {
  const proxy = new LocalProxyServer({ port: 8888 });
  proxy
    .start()
    .then(() => {
      logger.info('Local proxy server is running');
      logger.info(`Configure your .env with: PROXY_LIST=localhost:8888`);
      logger.info('Press Ctrl+C to stop');
    })
    .catch((error) => {
      logger.error('Failed to start proxy server', { error });
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGINT', () => {
    proxy.stop().then(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    proxy.stop().then(() => process.exit(0));
  });
}











