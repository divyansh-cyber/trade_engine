import pg from 'pg';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

class PostgresAdapter {
  constructor() {
    this.pool = null;
    this.connected = false;
  }

  async connect() {
    try {
      this.pool = new Pool({
        host: config.postgres.host,
        port: config.postgres.port,
        user: config.postgres.user,
        password: config.postgres.password,
        database: config.postgres.database,
        max: config.postgres.max,
        idleTimeoutMillis: config.postgres.idleTimeoutMillis,
        connectionTimeoutMillis: config.postgres.connectionTimeoutMillis,
      });

      // Test connection
      await this.pool.query('SELECT NOW()');
      this.connected = true;
      logger.info('PostgreSQL connected successfully');

      // Set up error handling
      this.pool.on('error', (err) => {
        logger.error('PostgreSQL pool error', { error: err.message });
        this.connected = false;
      });

      return true;
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL', { error: error.message });
      this.connected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
      logger.info('PostgreSQL disconnected');
    }
  }

  async query(text, params = []) {
    if (!this.connected) {
      await this.connect();
    }

    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const result = await this.pool.query(text, params);
        return result;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          logger.error('PostgreSQL query failed after retries', {
            error: error.message,
            query: text,
          });
          throw error;
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
        
        // Try to reconnect
        if (!this.connected) {
          await this.connect();
        }
      }
    }
  }

  async saveOrder(order) {
    const query = `
      INSERT INTO orders (
        order_id, client_id, instrument, side, type, price, quantity,
        filled_quantity, status, idempotency_key, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (order_id) DO UPDATE SET
        filled_quantity = EXCLUDED.filled_quantity,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `;
    
    const values = [
      order.order_id,
      order.client_id,
      order.instrument,
      order.side,
      order.type,
      order.price,
      order.quantity,
      order.filled_quantity,
      order.status,
      order.idempotency_key,
      order.created_at,
      order.updated_at,
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getOrder(orderId) {
    const query = 'SELECT * FROM orders WHERE order_id = $1';
    const result = await this.query(query, [orderId]);
    return result.rows[0] || null;
  }

  async getOrderByIdempotencyKey(idempotencyKey) {
    const query = 'SELECT * FROM orders WHERE idempotency_key = $1';
    const result = await this.query(query, [idempotencyKey]);
    return result.rows[0] || null;
  }

  async saveTrade(trade) {
    const query = `
      INSERT INTO trades (
        trade_id, buy_order_id, sell_order_id, instrument, price, quantity, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      trade.trade_id,
      trade.buy_order_id,
      trade.sell_order_id,
      trade.instrument,
      trade.price,
      trade.quantity,
      trade.timestamp,
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getRecentTrades(instrument, limit = 50) {
    const query = `
      SELECT * FROM trades
      WHERE instrument = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;
    const result = await this.query(query, [instrument, limit]);
    return result.rows;
  }

  async saveOrderEvent(event) {
    const query = `
      INSERT INTO order_events (order_id, event_type, event_data, timestamp)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const values = [
      event.order_id,
      event.event_type,
      JSON.stringify(event.event_data),
      event.timestamp || new Date(),
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async saveOrderBookSnapshot(instrument, snapshotData) {
    const query = `
      INSERT INTO order_book_snapshots (instrument, snapshot_data, timestamp)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const values = [
      instrument,
      JSON.stringify(snapshotData),
      new Date(),
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getLatestOrderBookSnapshot(instrument) {
    const query = `
      SELECT * FROM order_book_snapshots
      WHERE instrument = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    const result = await this.query(query, [instrument]);
    return result.rows[0] || null;
  }

  async getOpenOrders(instrument) {
    const query = `
      SELECT * FROM orders
      WHERE instrument = $1
      AND status IN ('open', 'partially_filled')
      ORDER BY created_at ASC
    `;
    const result = await this.query(query, [instrument]);
    return result.rows;
  }

  async updateClientPosition(clientId, instrument, quantity, price) {
    const query = `
      INSERT INTO client_positions (client_id, instrument, net_quantity, total_cost, last_updated)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (client_id, instrument) DO UPDATE SET
        net_quantity = client_positions.net_quantity + $3,
        total_cost = client_positions.total_cost + $4,
        last_updated = $5
      RETURNING *
    `;
    
    const cost = quantity * price;
    const values = [
      clientId,
      instrument,
      quantity,
      cost,
      new Date(),
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getClientPositions(clientId) {
    const query = `
      SELECT * FROM client_positions
      WHERE client_id = $1
    `;
    const result = await this.query(query, [clientId]);
    return result.rows;
  }

  async getTradeAggregates(instrument, startTime, endTime, intervalMinutes = 1) {
    const query = `
      SELECT
        DATE_TRUNC('minute', timestamp) + 
        (FLOOR(EXTRACT(MINUTE FROM timestamp) / $1) * INTERVAL '1 minute') AS time_bucket,
        COUNT(*) AS trade_count,
        SUM(quantity) AS total_quantity,
        AVG(price) AS avg_price,
        MIN(price) AS min_price,
        MAX(price) AS max_price,
        SUM(price * quantity) AS total_volume,
        SUM(price * quantity) / NULLIF(SUM(quantity), 0) AS vwap
      FROM trades
      WHERE instrument = $2
        AND timestamp >= $3
        AND timestamp <= $4
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    
    const result = await this.query(query, [intervalMinutes, instrument, startTime, endTime]);
    return result.rows;
  }
}

export default new PostgresAdapter();

