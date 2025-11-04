import Redis from 'ioredis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class RedisAdapter {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retryStrategy: config.redis.retryStrategy,
        maxRetriesPerRequest: 3,
      });

      this.client.on('connect', () => {
        logger.info('Redis connected');
        this.connected = true;
      });

      this.client.on('error', (error) => {
        logger.error('Redis error', { error: error.message });
        this.connected = false;
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.connected = false;
      });

      // Test connection
      await this.client.ping();
      this.connected = true;

      return true;
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      this.connected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      logger.info('Redis disconnected');
    }
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error', { key, error: error.message });
      return null;
    }
  }

  async set(key, value, ttl = null) {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Redis set error', { key, error: error.message });
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis del error', { key, error: error.message });
      return false;
    }
  }

  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists error', { key, error: error.message });
      return false;
    }
  }

  async setIfNotExists(key, value, ttl = null) {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        const result = await this.client.set(key, serialized, 'EX', ttl, 'NX');
        return result === 'OK';
      } else {
        const result = await this.client.set(key, serialized, 'NX');
        return result === 'OK';
      }
    } catch (error) {
      logger.error('Redis setIfNotExists error', { key, error: error.message });
      return false;
    }
  }

  async incr(key) {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error('Redis incr error', { key, error: error.message });
      return null;
    }
  }

  async hget(key, field) {
    try {
      const value = await this.client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis hget error', { key, field, error: error.message });
      return null;
    }
  }

  async hset(key, field, value) {
    try {
      const serialized = JSON.stringify(value);
      await this.client.hset(key, field, serialized);
      return true;
    } catch (error) {
      logger.error('Redis hset error', { key, field, error: error.message });
      return false;
    }
  }

  async publish(channel, message) {
    try {
      const serialized = JSON.stringify(message);
      await this.client.publish(channel, serialized);
      return true;
    } catch (error) {
      logger.error('Redis publish error', { channel, error: error.message });
      return false;
    }
  }

  async subscribe(channel, callback) {
    try {
      const subscriber = this.client.duplicate();
      await subscriber.subscribe(channel);
      subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          try {
            const parsed = JSON.parse(message);
            callback(parsed);
          } catch (error) {
            logger.error('Error parsing Redis message', { error: error.message });
          }
        }
      });
      return subscriber;
    } catch (error) {
      logger.error('Redis subscribe error', { channel, error: error.message });
      return null;
    }
  }

  // Idempotency key management
  async setIdempotencyKey(key, orderId, ttl = 3600) {
    return this.setIfNotExists(`idempotency:${key}`, orderId, ttl);
  }

  async getIdempotencyKey(key) {
    return this.get(`idempotency:${key}`);
  }

  // Rate limiting
  async checkRateLimit(identifier, maxRequests, windowMs) {
    const key = `ratelimit:${identifier}`;
    const windowSeconds = Math.ceil(windowMs / 1000);
    
    try {
      const count = await this.incr(key);
      if (count === 1) {
        await this.client.expire(key, windowSeconds);
      }
      
      const ttl = await this.client.ttl(key);
      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - count),
        reset: ttl,
      };
    } catch (error) {
      logger.error('Redis rate limit error', { identifier, error: error.message });
      return { allowed: true, remaining: maxRequests, reset: windowSeconds };
    }
  }
}

export default new RedisAdapter();

