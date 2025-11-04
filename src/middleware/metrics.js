import client from 'prom-client';
import logger from '../utils/logger.js';

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
export const ordersReceivedTotal = new client.Counter({
  name: 'orders_received_total',
  help: 'Total number of orders received',
  labelNames: ['type', 'side', 'instrument'],
  registers: [register],
});

export const ordersMatchedTotal = new client.Counter({
  name: 'orders_matched_total',
  help: 'Total number of orders matched',
  labelNames: ['instrument'],
  registers: [register],
});

export const ordersRejectedTotal = new client.Counter({
  name: 'orders_rejected_total',
  help: 'Total number of orders rejected',
  labelNames: ['reason'],
  registers: [register],
});

export const orderLatency = new client.Histogram({
  name: 'order_latency_seconds',
  help: 'Order processing latency in seconds',
  labelNames: ['type', 'side'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const orderbookDepth = new client.Gauge({
  name: 'current_orderbook_depth',
  help: 'Current orderbook depth (number of price levels)',
  labelNames: ['instrument', 'side'],
  registers: [register],
});

export const tradesTotal = new client.Counter({
  name: 'trades_total',
  help: 'Total number of trades executed',
  labelNames: ['instrument'],
  registers: [register],
});

export const tradeVolume = new client.Counter({
  name: 'trade_volume_total',
  help: 'Total trade volume',
  labelNames: ['instrument'],
  registers: [register],
});

// Make register available
export { register };

// Middleware to track request latency
export const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    
    if (req.route) {
      const route = req.route.path;
      const method = req.method.toLowerCase();
      
      // Track HTTP request latency if needed
      // This can be extended to track specific endpoints
    }
  });

  next();
};

