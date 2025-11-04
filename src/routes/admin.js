import express from 'express';
import client from 'prom-client';
import { register } from '../middleware/metrics.js';
import logger from '../utils/logger.js';
import postgres from '../db/postgres.js';
import redis from '../db/redis.js';
import kafkaProducer from '../kafka/producer.js';

const router = express.Router();

// Welcome/API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'FedEx Exchange API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/healthz',
      metrics: '/metrics',
      orders: '/orders (POST)',
      orderbook: '/market/orderbook?instrument=BTC-USD',
      trades: '/market/trades?instrument=BTC-USD',
      websocket: 'ws://localhost:3000/stream'
    },
    documentation: {
      postman: 'Import postman_collection.json',
      swagger: 'Coming soon'
    }
  });
});

// Health check endpoint
router.get('/healthz', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // Check PostgreSQL
  try {
    await postgres.query('SELECT NOW()');
    health.checks.postgres = 'healthy';
  } catch (error) {
    health.checks.postgres = 'unhealthy';
    health.status = 'unhealthy';
  }

  // Check Redis
  try {
    await redis.client.ping();
    health.checks.redis = 'healthy';
  } catch (error) {
    health.checks.redis = 'unhealthy';
    health.status = 'unhealthy';
  }

  // Check Kafka
  try {
    if (kafkaProducer.connected) {
      health.checks.kafka = 'healthy';
    } else {
      health.checks.kafka = 'unhealthy';
      health.status = 'unhealthy';
    }
  } catch (error) {
    health.checks.kafka = 'unhealthy';
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error getting metrics', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;

