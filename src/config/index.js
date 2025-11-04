import dotenv from 'dotenv';

dotenv.config();

export default {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    wsPort: parseInt(process.env.WS_PORT || '3001', 10),
    env: process.env.NODE_ENV || 'development',
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'exchange',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'exchange-service',
    groupId: process.env.KAFKA_GROUP_ID || 'exchange-group',
    topics: {
      orders: 'exchange-orders',
      trades: 'exchange-trades',
      orderbookUpdates: 'exchange-orderbook-updates',
      orderEvents: 'exchange-order-events',
    },
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  matching: {
    defaultInstrument: 'BTC-USD',
    snapshotIntervalMs: 60000, // 1 minute
  },
};

