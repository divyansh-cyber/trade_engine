import { Kafka } from 'kafkajs';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class KafkaProducer {
  constructor() {
    this.producer = null;
    this.connected = false;
  }

  async connect() {
    try {
      const kafka = new Kafka({
        clientId: config.kafka.clientId,
        brokers: config.kafka.brokers,
        retry: {
          retries: 8,
          initialRetryTime: 100,
          multiplier: 2,
          maxRetryTime: 30000,
        },
      });

      this.producer = kafka.producer({
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
      });

      await this.producer.connect();
      this.connected = true;
      logger.info('Kafka producer connected');

      // Handle disconnection
      this.producer.on('producer.disconnect', () => {
        logger.warn('Kafka producer disconnected');
        this.connected = false;
      });

      return true;
    } catch (error) {
      logger.error('Failed to connect Kafka producer', { error: error.message });
      this.connected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.producer && this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      logger.info('Kafka producer disconnected');
    }
  }

  async sendMessage(topic, message, partition = null) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const messages = [{
        value: JSON.stringify(message),
        timestamp: Date.now().toString(),
      }];

      const record = {
        topic,
        messages,
      };

      if (partition !== null) {
        record.messages[0].partition = partition;
      }

      const result = await this.producer.send(record);
      return result;
    } catch (error) {
      logger.error('Kafka send error', { topic, error: error.message });
      throw error;
    }
  }

  async sendOrder(order) {
    return this.sendMessage(config.kafka.topics.orders, {
      type: 'order',
      order: order.toJSON(),
      timestamp: new Date().toISOString(),
    });
  }

  async sendTrade(trade) {
    return this.sendMessage(config.kafka.topics.trades, {
      type: 'trade',
      trade: trade.toJSON(),
      timestamp: new Date().toISOString(),
    });
  }

  async sendOrderBookUpdate(instrument, snapshot) {
    return this.sendMessage(config.kafka.topics.orderbookUpdates, {
      type: 'orderbook_update',
      instrument,
      snapshot,
      timestamp: new Date().toISOString(),
    });
  }

  async sendOrderEvent(event) {
    return this.sendMessage(config.kafka.topics.orderEvents, {
      type: 'order_event',
      event,
      timestamp: new Date().toISOString(),
    });
  }
}

export default new KafkaProducer();

