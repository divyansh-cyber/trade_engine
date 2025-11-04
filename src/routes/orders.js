import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import exchangeService from '../services/ExchangeService.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// POST /orders
router.post(
  '/',
  [
    body('client_id').notEmpty().withMessage('client_id is required'),
    body('instrument').optional().isString(),
    body('side').isIn(['buy', 'sell']).withMessage('side must be buy or sell'),
    body('type').isIn(['limit', 'market']).withMessage('type must be limit or market'),
    body('price').if(body('type').equals('limit')).isFloat({ min: 0 }).withMessage('price must be positive for limit orders'),
    body('quantity').isFloat({ min: 0.00000001 }).withMessage('quantity must be positive'),
    body('order_id').optional().isString(),
    body('idempotency_key').optional().isString(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const startTime = Date.now();
      const {
        idempotency_key,
        order_id,
        client_id,
        instrument,
        side,
        type,
        price,
        quantity,
      } = req.body;

      const orderData = {
        order_id: order_id || uuidv4(),
        client_id,
        instrument: instrument || 'BTC-USD',
        side,
        type,
        price: price ? parseFloat(price) : null,
        quantity: parseFloat(quantity),
      };

      const result = await exchangeService.submitOrder(orderData, idempotency_key);

      const latency = Date.now() - startTime;
      logger.info('Order submitted via HTTP', {
        order_id: result.order.order_id,
        latency_ms: latency,
      });

      res.status(201).json({
        order: result.order.toJSON(),
        trades: result.trades.map(t => t.toJSON()),
        orderbook: result.orderbook,
      });
    } catch (error) {
      logger.error('Error submitting order', { error: error.message, stack: error.stack });
      res.status(400).json({ error: error.message });
    }
  }
);

// POST /orders/:order_id/cancel
router.post(
  '/:order_id/cancel',
  [
    param('order_id').notEmpty().withMessage('order_id is required'),
    query('instrument').optional().isString(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { order_id } = req.params;
      const { instrument } = req.query;

      const order = await exchangeService.cancelOrder(order_id, instrument);

      res.json({ order: order.toJSON() });
    } catch (error) {
      logger.error('Error cancelling order', { error: error.message });
      res.status(404).json({ error: error.message });
    }
  }
);

// GET /orders/:order_id
router.get(
  '/:order_id',
  [
    param('order_id').notEmpty().withMessage('order_id is required'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { order_id } = req.params;
      const order = await exchangeService.getOrder(order_id);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json({ order: order.toJSON() });
    } catch (error) {
      logger.error('Error getting order', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;

