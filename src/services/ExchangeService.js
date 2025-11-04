import { MatchingEngine } from '../matching/MatchingEngine.js';
import { Order } from '../models/Order.js';
import { v4 as uuidv4 } from 'uuid';
import postgres from '../db/postgres.js';
import redis from '../db/redis.js';
import kafkaProducer from '../kafka/producer.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import {
  ordersReceivedTotal,
  ordersMatchedTotal,
  ordersRejectedTotal,
  orderLatency,
  tradesTotal,
  tradeVolume,
} from '../middleware/metrics.js';

/**
 * Multi-instrument Exchange Service
 * Manages multiple matching engines, one per instrument
 */
export class ExchangeService {
  constructor() {
    this.engines = new Map(); // instrument -> MatchingEngine
    this.snapshotInterval = null;
  }

  getEngine(instrument) {
    if (!this.engines.has(instrument)) {
      const engine = new MatchingEngine(instrument);
      this.engines.set(instrument, engine);
      logger.info(`Created matching engine for ${instrument}`);
    }
    return this.engines.get(instrument);
  }

  async initialize() {
    // Load existing open orders from database
    const instruments = await this._loadOpenOrders();
    
    // Start snapshot interval
    this._startSnapshotInterval();
    
    logger.info('Exchange service initialized', { instruments });
  }

  async _loadOpenOrders() {
    try {
      // For now, just load default instrument
      const instrument = config.matching.defaultInstrument;
      const openOrders = await postgres.getOpenOrders(instrument);
      
      const engine = this.getEngine(instrument);
      
      // Rebuild order book from open orders
      for (const orderRow of openOrders) {
        const order = Order.fromDB(orderRow);
        if (order.is_open) {
          engine.orderBook.addOrder(order);
        }
      }
      
      logger.info(`Loaded ${openOrders.length} open orders for ${instrument}`);
      return [instrument];
    } catch (error) {
      logger.error('Error loading open orders', { error: error.message });
      return [];
    }
  }

  _startSnapshotInterval() {
    this.snapshotInterval = setInterval(async () => {
      for (const [instrument, engine] of this.engines.entries()) {
        try {
          const snapshot = engine.getOrderBookSnapshot(20);
          await postgres.saveOrderBookSnapshot(instrument, snapshot);
          await kafkaProducer.sendOrderBookUpdate(instrument, snapshot);
        } catch (error) {
          logger.error('Error saving snapshot', { instrument, error: error.message });
        }
      }
    }, config.matching.snapshotIntervalMs);
  }

  async submitOrder(orderData, idempotencyKey = null) {
    const startTime = Date.now();

    // Check idempotency
    if (idempotencyKey) {
      const existingOrderId = await redis.getIdempotencyKey(idempotencyKey);
      if (existingOrderId) {
        const existingOrder = await postgres.getOrder(existingOrderId);
        if (existingOrder) {
          logger.info('Idempotent order request', { idempotencyKey, orderId: existingOrderId });
          return { order: Order.fromDB(existingOrder), trades: [], orderbook: {} };
        }
      }
    }

    // Validate order
    try {
      this._validateOrder(orderData);
    } catch (error) {
      ordersRejectedTotal.inc({ reason: error.message });
      throw error;
    }

    // Create order
    const order = new Order({
      order_id: orderData.order_id || uuidv4(),
      client_id: orderData.client_id,
      instrument: orderData.instrument || config.matching.defaultInstrument,
      side: orderData.side,
      type: orderData.type,
      price: orderData.price,
      quantity: orderData.quantity,
      filled_quantity: 0,
      status: 'open',
      idempotency_key: idempotencyKey,
    });

    // Track metrics
    ordersReceivedTotal.inc({
      type: order.type,
      side: order.side,
      instrument: order.instrument,
    });

    // Save order to database
    await postgres.saveOrder(order);

    // Save idempotency key
    if (idempotencyKey) {
      await redis.setIdempotencyKey(idempotencyKey, order.order_id);
    }

    // Save order event
    await postgres.saveOrderEvent({
      order_id: order.order_id,
      event_type: 'order_created',
      event_data: order.toJSON(),
      timestamp: new Date(),
    });

    // Publish to Kafka
    await kafkaProducer.sendOrder(order);
    await kafkaProducer.sendOrderEvent({
      order_id: order.order_id,
      event_type: 'order_created',
      event_data: order.toJSON(),
    });

    // Process order through matching engine
    const engine = this.getEngine(order.instrument);
    
    const trades = [];
    const orderUpdates = [];

    await engine.processOrder(
      order,
      async (trade) => {
        trades.push(trade);
        // Save trade
        await postgres.saveTrade(trade);
        
        // Track metrics
        tradesTotal.inc({ instrument: trade.instrument });
        tradeVolume.inc({ instrument: trade.instrument }, trade.quantity * trade.price);
        ordersMatchedTotal.inc({ instrument: trade.instrument });
        
        // Update client positions
        await this._updatePositions(trade);
        
        // Publish to Kafka
        await kafkaProducer.sendTrade(trade);
        
        // Publish to Redis pub/sub for WebSocket clients
        await redis.publish(`trades:${trade.instrument}`, trade.toJSON());
      },
      async (updatedOrder) => {
        orderUpdates.push(updatedOrder);
        // Update order in database
        await postgres.saveOrder(updatedOrder);
        
        // Save order event
        await postgres.saveOrderEvent({
          order_id: updatedOrder.order_id,
          event_type: `order_${updatedOrder.status}`,
          event_data: updatedOrder.toJSON(),
          timestamp: new Date(),
        });
        
        // Publish to Kafka
        await kafkaProducer.sendOrder(updatedOrder);
        
        // Publish to Redis pub/sub
        await redis.publish(`orders:${updatedOrder.instrument}`, updatedOrder.toJSON());
      }
    );

    // Track latency
    const latency = (Date.now() - startTime) / 1000;
    orderLatency.observe({ type: order.type, side: order.side }, latency);

    // Publish orderbook update
    const snapshot = engine.getOrderBookSnapshot(20);
    await kafkaProducer.sendOrderBookUpdate(order.instrument, snapshot);
    await redis.publish(`orderbook:${order.instrument}`, snapshot);

    logger.info('Order submitted', {
      order_id: order.order_id,
      instrument: order.instrument,
      type: order.type,
      side: order.side,
      trades_count: trades.length,
      latency_ms: latency * 1000,
    });

    return { order, trades, orderbook: snapshot };
  }

  async cancelOrder(orderId, instrument = null) {
    // Find instrument if not provided
    if (!instrument) {
      instrument = config.matching.defaultInstrument;
    }

    const engine = this.getEngine(instrument);
    const order = engine.cancelOrder(orderId);

    if (!order) {
      // Try to load from database
      const orderRow = await postgres.getOrder(orderId);
      if (!orderRow) {
        throw new Error(`Order ${orderId} not found`);
      }
      const dbOrder = Order.fromDB(orderRow);
      dbOrder.cancel();
      await postgres.saveOrder(dbOrder);
      return dbOrder;
    }

    // Update in database
    await postgres.saveOrder(order);

    // Save order event
    await postgres.saveOrderEvent({
      order_id: order.order_id,
      event_type: 'order_cancelled',
      event_data: order.toJSON(),
      timestamp: new Date(),
    });

    // Publish to Kafka
    await kafkaProducer.sendOrder(order);
    
    // Publish orderbook update
    const snapshot = engine.getOrderBookSnapshot(20);
    await kafkaProducer.sendOrderBookUpdate(instrument, snapshot);
    await redis.publish(`orderbook:${instrument}`, snapshot);

    logger.info('Order cancelled', { order_id: orderId, instrument });

    return order;
  }

  async getOrder(orderId) {
    // Try in-memory first
    for (const engine of this.engines.values()) {
      const order = engine.getOrder(orderId);
      if (order) {
        return order;
      }
    }

    // Fallback to database
    const orderRow = await postgres.getOrder(orderId);
    return orderRow ? Order.fromDB(orderRow) : null;
  }

  async getOrderBook(instrument, levels = 20) {
    const engine = this.getEngine(instrument);
    return engine.getOrderBookSnapshot(levels);
  }

  async getRecentTrades(instrument, limit = 50) {
    const engine = this.getEngine(instrument);
    const inMemoryTrades = engine.getRecentTrades(limit);
    
    // Also get from database for persistence
    const dbTrades = await postgres.getRecentTrades(instrument, limit);
    
    // Merge and deduplicate
    const tradeMap = new Map();
    
    for (const trade of inMemoryTrades) {
      tradeMap.set(trade.trade_id, trade);
    }
    
    for (const tradeRow of dbTrades) {
      const trade = {
        trade_id: tradeRow.trade_id,
        buy_order_id: tradeRow.buy_order_id,
        sell_order_id: tradeRow.sell_order_id,
        instrument: tradeRow.instrument,
        price: parseFloat(tradeRow.price),
        quantity: parseFloat(tradeRow.quantity),
        timestamp: tradeRow.timestamp,
      };
      tradeMap.set(trade.trade_id, trade);
    }
    
    return Array.from(tradeMap.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  async requestSnapshot(instrument) {
    const engine = this.getEngine(instrument);
    const snapshot = engine.getOrderBookSnapshot(20);
    await postgres.saveOrderBookSnapshot(instrument, snapshot);
    return snapshot;
  }

  async _validateOrder(orderData) {
    if (!orderData.client_id) {
      throw new Error('client_id is required');
    }
    if (!orderData.side || !['buy', 'sell'].includes(orderData.side)) {
      throw new Error('side must be "buy" or "sell"');
    }
    if (!orderData.type || !['limit', 'market'].includes(orderData.type)) {
      throw new Error('type must be "limit" or "market"');
    }
    if (!orderData.quantity || orderData.quantity <= 0) {
      throw new Error('quantity must be positive');
    }
    if (orderData.type === 'limit' && (!orderData.price || orderData.price <= 0)) {
      throw new Error('price must be positive for limit orders');
    }
    if (orderData.price && orderData.price.toString().split('.')[1]?.length > 8) {
      throw new Error('price precision cannot exceed 8 decimal places');
    }
    if (orderData.quantity.toString().split('.')[1]?.length > 8) {
      throw new Error('quantity precision cannot exceed 8 decimal places');
    }
  }

  async _updatePositions(trade) {
    try {
      // Get buy and sell orders to determine client IDs
      const buyOrder = await postgres.getOrder(trade.buy_order_id);
      const sellOrder = await postgres.getOrder(trade.sell_order_id);

      if (buyOrder) {
        await postgres.updateClientPosition(
          buyOrder.client_id,
          trade.instrument,
          trade.quantity,
          trade.price
        );
      }

      if (sellOrder) {
        await postgres.updateClientPosition(
          sellOrder.client_id,
          trade.instrument,
          -trade.quantity,
          trade.price
        );
      }
    } catch (error) {
      logger.error('Error updating positions', { error: error.message });
    }
  }

  async getClientPositions(clientId) {
    return await postgres.getClientPositions(clientId);
  }

  async getTradeAnalytics(instrument, startTime, endTime, intervalMinutes = 1) {
    return await postgres.getTradeAggregates(instrument, startTime, endTime, intervalMinutes);
  }

  async shutdown() {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }
    
    // Save final snapshots
    for (const [instrument, engine] of this.engines.entries()) {
      try {
        const snapshot = engine.getOrderBookSnapshot(20);
        await postgres.saveOrderBookSnapshot(instrument, snapshot);
      } catch (error) {
        logger.error('Error saving final snapshot', { instrument, error: error.message });
      }
    }
  }
}

export default new ExchangeService();
