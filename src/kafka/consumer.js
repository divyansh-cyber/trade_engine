import { Kafka } from 'kafkajs';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { Order } from '../models/Order.js';

class KafkaConsumer {
  constructor() {
    this.consumer = null;
    this.connected = false;
    this.handlers = new Map();
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

      this.consumer = kafka.consumer({
        groupId: config.kafka.groupId,
        allowAutoTopicCreation: true,
      });

      await this.consumer.connect();
      this.connected = true;
      logger.info('Kafka consumer connected');

      // Handle disconnection
      this.consumer.on('consumer.disconnect', () => {
        logger.warn('Kafka consumer disconnected');
        this.connected = false;
      });

      return true;
    } catch (error) {
      logger.error('Failed to connect Kafka consumer', { error: error.message });
      this.connected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.consumer && this.connected) {
      await this.consumer.disconnect();
      this.connected = false;
      logger.info('Kafka consumer disconnected');
    }
  }

  async subscribe(topic, handler) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.handlers.set(topic, handler);
      logger.info(`Subscribed to Kafka topic: ${topic}`);
    } catch (error) {
      logger.error('Failed to subscribe to topic', { topic, error: error.message });
      throw error;
    }
  }

  async run() {
    if (!this.connected) {
      await this.connect();
    }

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const handler = this.handlers.get(topic);
          if (!handler) {
            logger.warn(`No handler for topic: ${topic}`);
            return;
          }

          const value = message.value.toString();
          const data = JSON.parse(value);
          
          await handler(data, { topic, partition, offset: message.offset });
        } catch (error) {
          logger.error('Error processing Kafka message', {
            topic,
            partition,
            offset: message.offset,
            error: error.message,
          });
        }
      },
    });
  }

  // Subscribe to Binance WebSocket feed (simulated)
  async subscribeToBinanceFeed(instrument, handler) {
    // In a real implementation, this would connect to Binance WebSocket
    // For now, we'll simulate market orders from external feed
    logger.info(`Subscribed to Binance feed for ${instrument}`);
    
    // This would be implemented with actual Binance WebSocket client
    // For demo purposes, we'll handle it through the WebSocket handler
    return true;
  }
}

export default new KafkaConsumer();

