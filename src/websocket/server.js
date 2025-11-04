import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import exchangeService from '../services/ExchangeService.js';
import redis from '../db/redis.js';
import { Order } from '../models/Order.js';
import config from '../config/index.js';

class ExchangeWebSocketServer {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/stream' });
    this.clients = new Map(); // client_id -> Set of WebSocket connections
    this.subscriptions = new Map(); // ws -> Set of channels
    this.redisSubscribers = new Map(); // channel -> Redis subscriber
  }

  initialize() {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      ws.id = clientId;
      ws.isAlive = true;

      logger.info('WebSocket client connected', { clientId, ip: req.socket.remoteAddress });

      // Handle pong
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle messages
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
        } catch (error) {
          logger.error('Error handling WebSocket message', { error: error.message });
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle close
      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error', { clientId, error: error.message });
        this.handleDisconnect(ws);
      });

      // Send welcome message
      this.send(ws, {
        type: 'connected',
        client_id: clientId,
        timestamp: new Date().toISOString(),
      });
    });

    // Ping clients every 30 seconds
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    logger.info('WebSocket server initialized');
  }

  async handleMessage(ws, message) {
    const { type, ...data } = message;

    switch (type) {
      case 'subscribe':
        await this.handleSubscribe(ws, data);
        break;
      case 'unsubscribe':
        await this.handleUnsubscribe(ws, data);
        break;
      case 'order':
        await this.handleOrder(ws, data);
        break;
      default:
        this.sendError(ws, `Unknown message type: ${type}`);
    }
  }

  async handleSubscribe(ws, data) {
    const { channels = [] } = data;
    const instrument = data.instrument || config.matching.defaultInstrument;

    if (!this.subscriptions.has(ws)) {
      this.subscriptions.set(ws, new Set());
    }

    for (const channel of channels) {
      const fullChannel = `${channel}:${instrument}`;
      this.subscriptions.get(ws).add(fullChannel);

      // Subscribe to Redis pub/sub
      await this.subscribeToRedis(fullChannel);
    }

    this.send(ws, {
      type: 'subscribed',
      channels,
      instrument,
      timestamp: new Date().toISOString(),
    });
  }

  async handleUnsubscribe(ws, data) {
    const { channels = [] } = data;
    const instrument = data.instrument || config.matching.defaultInstrument;

    if (this.subscriptions.has(ws)) {
      for (const channel of channels) {
        const fullChannel = `${channel}:${instrument}`;
        this.subscriptions.get(ws).delete(fullChannel);
      }
    }

    this.send(ws, {
      type: 'unsubscribed',
      channels,
      instrument,
      timestamp: new Date().toISOString(),
    });
  }

  async handleOrder(ws, data) {
    try {
      const {
        idempotency_key,
        order_id,
        client_id,
        instrument,
        side,
        type,
        price,
        quantity,
      } = data;

      const orderData = {
        order_id: order_id || uuidv4(),
        client_id: client_id || `ws_${ws.id}`,
        instrument: instrument || config.matching.defaultInstrument,
        side,
        type,
        price: price ? parseFloat(price) : null,
        quantity: parseFloat(quantity),
      };

      const result = await exchangeService.submitOrder(orderData, idempotency_key);

      this.send(ws, {
        type: 'order_accepted',
        order: result.order.toJSON(),
        trades: result.trades.map(t => t.toJSON()),
        orderbook: result.orderbook,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error handling WebSocket order', { error: error.message });
      this.sendError(ws, error.message);
    }
  }

  async subscribeToRedis(channel) {
    if (this.redisSubscribers.has(channel)) {
      return; // Already subscribed
    }

    try {
      const subscriber = await redis.subscribe(channel, (message) => {
        // Broadcast to all WebSocket clients subscribed to this channel
        this.broadcast(channel, message);
      });

      if (subscriber) {
        this.redisSubscribers.set(channel, subscriber);
        logger.info(`Subscribed to Redis channel: ${channel}`);
      }
    } catch (error) {
      logger.error('Error subscribing to Redis channel', { channel, error: error.message });
    }
  }

  broadcast(channel, message) {
    let broadcastCount = 0;

    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN && this.subscriptions.has(ws)) {
        if (this.subscriptions.get(ws).has(channel)) {
          this.send(ws, {
            type: channel.split(':')[0], // 'trades', 'orders', 'orderbook'
            channel,
            data: message,
            timestamp: new Date().toISOString(),
          });
          broadcastCount++;
        }
      }
    });

    if (broadcastCount > 0) {
      logger.debug(`Broadcasted to ${broadcastCount} clients`, { channel });
    }
  }

  handleDisconnect(ws) {
    logger.info('WebSocket client disconnected', { clientId: ws.id });
    
    if (this.subscriptions.has(ws)) {
      this.subscriptions.delete(ws);
    }
  }

  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, error) {
    this.send(ws, {
      type: 'error',
      error,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastToAll(message) {
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
      }
    });
  }
}

export default ExchangeWebSocketServer;

