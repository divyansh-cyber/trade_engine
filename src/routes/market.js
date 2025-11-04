import express from 'express';
import { query, param, validationResult } from 'express-validator';
import exchangeService from '../services/ExchangeService.js';
import logger from '../utils/logger.js';

const router = express.Router();

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /orderbook
router.get(
  '/orderbook',
  [
    query('instrument').optional().isString(),
    query('levels').optional().isInt({ min: 1, max: 100 }).withMessage('levels must be between 1 and 100'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const instrument = req.query.instrument || 'BTC-USD';
      const levels = parseInt(req.query.levels || '20', 10);

      const orderbook = await exchangeService.getOrderBook(instrument, levels);

      res.json({
        instrument,
        bids: orderbook.bids,
        asks: orderbook.asks,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting orderbook', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /trades
router.get(
  '/trades',
  [
    query('instrument').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit must be between 1 and 1000'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const instrument = req.query.instrument || 'BTC-USD';
      const limit = parseInt(req.query.limit || '50', 10);

      const trades = await exchangeService.getRecentTrades(instrument, limit);

      res.json({
        instrument,
        trades: trades.map(t => ({
          trade_id: t.trade_id,
          buy_order_id: t.buy_order_id,
          sell_order_id: t.sell_order_id,
          price: t.price,
          quantity: t.quantity,
          timestamp: t.timestamp,
        })),
        count: trades.length,
      });
    } catch (error) {
      logger.error('Error getting trades', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /analytics
router.get(
  '/analytics',
  [
    query('instrument').optional().isString(),
    query('start_time').optional().isISO8601(),
    query('end_time').optional().isISO8601(),
    query('interval').optional().isInt({ min: 1, max: 60 }),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const instrument = req.query.instrument || 'BTC-USD';
      const startTime = req.query.start_time ? new Date(req.query.start_time) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endTime = req.query.end_time ? new Date(req.query.end_time) : new Date();
      const intervalMinutes = parseInt(req.query.interval || '1', 10);

      const aggregates = await exchangeService.getTradeAnalytics(instrument, startTime, endTime, intervalMinutes);

      // Calculate VWAP for the entire period
      const totalVolume = aggregates.reduce((sum, a) => sum + parseFloat(a.total_volume || 0), 0);
      const totalQuantity = aggregates.reduce((sum, a) => sum + parseFloat(a.total_quantity || 0), 0);
      const vwap = totalQuantity > 0 ? totalVolume / totalQuantity : 0;

      res.json({
        instrument,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        interval_minutes: intervalMinutes,
        aggregates: aggregates.map(a => ({
          time_bucket: a.time_bucket,
          trade_count: parseInt(a.trade_count || 0),
          total_quantity: parseFloat(a.total_quantity || 0),
          avg_price: parseFloat(a.avg_price || 0),
          min_price: parseFloat(a.min_price || 0),
          max_price: parseFloat(a.max_price || 0),
          total_volume: parseFloat(a.total_volume || 0),
          vwap: parseFloat(a.vwap || 0),
        })),
        overall_vwap: vwap,
      });
    } catch (error) {
      logger.error('Error getting analytics', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /orderbook/snapshot
router.post(
  '/orderbook/snapshot',
  [
    query('instrument').optional().isString(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const instrument = req.query.instrument || 'BTC-USD';

      const snapshot = await exchangeService.requestSnapshot(instrument);

      res.json({
        instrument,
        snapshot,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error creating snapshot', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /positions/:client_id
router.get(
  '/positions/:client_id',
  [
    param('client_id').notEmpty().withMessage('client_id is required'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { client_id } = req.params;
      const positions = await exchangeService.getClientPositions(client_id);

      res.json({
        client_id,
        positions: positions.map(p => ({
          instrument: p.instrument,
          net_quantity: parseFloat(p.net_quantity),
          total_cost: parseFloat(p.total_cost),
          avg_price: parseFloat(p.net_quantity) !== 0 ? parseFloat(p.total_cost) / parseFloat(p.net_quantity) : 0,
          last_updated: p.last_updated,
        })),
      });
    } catch (error) {
      logger.error('Error getting positions', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;

