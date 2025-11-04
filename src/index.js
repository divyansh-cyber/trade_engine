import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import logger from './utils/logger.js';
import postgres from './db/postgres.js';
import redis from './db/redis.js';
import kafkaProducer from './kafka/producer.js';
import kafkaConsumer from './kafka/consumer.js';
import exchangeService from './services/ExchangeService.js';
import orderRoutes from './routes/orders.js';
import marketRoutes from './routes/market.js';
import adminRoutes from './routes/admin.js';
import { metricsMiddleware } from './middleware/metrics.js';
import WebSocketServer from './websocket/server.js';

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(metricsMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/orders', limiter);
app.use('/market', limiter);

// Routes
app.use('/orders', orderRoutes);
app.use('/market', marketRoutes);
app.use('/', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(config.server.env === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize services
async function initialize() {
  try {
    logger.info('Initializing services...');

    // Connect to databases
    await postgres.connect();
    logger.info('PostgreSQL connected');

    await redis.connect();
    logger.info('Redis connected');

    // Connect to Kafka
    await kafkaProducer.connect();
    logger.info('Kafka producer connected');

    // Initialize exchange service
    await exchangeService.initialize();
    logger.info('Exchange service initialized');

    // Setup WebSocket server
    const wsServer = new WebSocketServer(server);
    wsServer.initialize();

    // Start HTTP server
    const port = config.server.port;
    server.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
      logger.info(`Health check: http://localhost:${port}/healthz`);
      logger.info(`Metrics: http://localhost:${port}/metrics`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      await shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      await shutdown();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to initialize services', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

async function shutdown() {
  try {
    logger.info('Shutting down services...');

    // Shutdown exchange service
    await exchangeService.shutdown();
    logger.info('Exchange service shut down');

    // Disconnect Kafka
    await kafkaProducer.disconnect();
    logger.info('Kafka producer disconnected');

    // Disconnect databases
    await redis.disconnect();
    logger.info('Redis disconnected');

    await postgres.disconnect();
    logger.info('PostgreSQL disconnected');

    // Close HTTP server
    server.close(() => {
      logger.info('HTTP server closed');
    });
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }
}

// Start the application
initialize().catch((error) => {
  logger.error('Fatal error during initialization', { error: error.message, stack: error.stack });
  process.exit(1);
});

export default app;

