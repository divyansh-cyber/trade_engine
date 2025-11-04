import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * Price-Time Priority Order Book
 * Bids: sorted by price DESC, then by time ASC
 * Asks: sorted by price ASC, then by time ASC
 */
class OrderBook {
  constructor(instrument) {
    this.instrument = instrument;
    this.bids = new Map(); // price -> Array of orders (sorted by time)
    this.bidPrices = []; // sorted descending
    this.asks = new Map(); // price -> Array of orders (sorted by time)
    this.askPrices = []; // sorted ascending
    this.orders = new Map(); // order_id -> order
  }

  addOrder(order) {
    this.orders.set(order.order_id, order);
    
    if (order.side === 'buy') {
      this.addBid(order);
    } else {
      this.addAsk(order);
    }
  }

  addBid(order) {
    const price = order.price;
    
    if (!this.bids.has(price)) {
      this.bids.set(price, []);
      this.bidPrices.push(price);
      this.bidPrices.sort((a, b) => b - a); // descending
    }
    
    this.bids.get(price).push(order);
  }

  addAsk(order) {
    const price = order.price;
    
    if (!this.asks.has(price)) {
      this.asks.set(price, []);
      this.askPrices.push(price);
      this.askPrices.sort((a, b) => a - b); // ascending
    }
    
    this.asks.get(price).push(order);
  }

  removeOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) return;

    this.orders.delete(orderId);
    
    if (order.side === 'buy') {
      this.removeBid(order);
    } else {
      this.removeAsk(order);
    }
  }

  removeBid(order) {
    const price = order.price;
    const priceLevel = this.bids.get(price);
    
    if (priceLevel) {
      const index = priceLevel.findIndex(o => o.order_id === order.order_id);
      if (index !== -1) {
        priceLevel.splice(index, 1);
        
        if (priceLevel.length === 0) {
          this.bids.delete(price);
          this.bidPrices = this.bidPrices.filter(p => p !== price);
        }
      }
    }
  }

  removeAsk(order) {
    const price = order.price;
    const priceLevel = this.asks.get(price);
    
    if (priceLevel) {
      const index = priceLevel.findIndex(o => o.order_id === order.order_id);
      if (index !== -1) {
        priceLevel.splice(index, 1);
        
        if (priceLevel.length === 0) {
          this.asks.delete(price);
          this.askPrices = this.askPrices.filter(p => p !== price);
        }
      }
    }
  }

  getBestBid() {
    if (this.bidPrices.length === 0) return null;
    const bestPrice = this.bidPrices[0];
    const priceLevel = this.bids.get(bestPrice);
    return priceLevel && priceLevel.length > 0 ? priceLevel[0] : null;
  }

  getBestAsk() {
    if (this.askPrices.length === 0) return null;
    const bestPrice = this.askPrices[0];
    const priceLevel = this.asks.get(bestPrice);
    return priceLevel && priceLevel.length > 0 ? priceLevel[0] : null;
  }

  getSnapshot(levels = 20) {
    const bids = [];
    const asks = [];
    
    let bidTotal = 0;
    for (let i = 0; i < Math.min(levels, this.bidPrices.length); i++) {
      const price = this.bidPrices[i];
      const priceLevel = this.bids.get(price);
      const quantity = priceLevel.reduce((sum, order) => sum + order.remaining_quantity, 0);
      bidTotal += quantity;
      bids.push({
        price,
        quantity,
        cumulative: bidTotal,
      });
    }
    
    let askTotal = 0;
    for (let i = 0; i < Math.min(levels, this.askPrices.length); i++) {
      const price = this.askPrices[i];
      const priceLevel = this.asks.get(price);
      const quantity = priceLevel.reduce((sum, order) => sum + order.remaining_quantity, 0);
      askTotal += quantity;
      asks.push({
        price,
        quantity,
        cumulative: askTotal,
      });
    }
    
    return { bids, asks };
  }
}

/**
 * Matching Engine with Price-Time Priority
 */
export class MatchingEngine {
  constructor(instrument = 'BTC-USD') {
    this.instrument = instrument;
    this.orderBook = new OrderBook(instrument);
    this.trades = [];
    this.lock = false;
    this.pendingOrders = [];
  }

  /**
   * Process order through matching engine
   * Uses a simple lock to ensure single-threaded matching
   */
  async processOrder(order, onTrade, onOrderUpdate) {
    // Queue order if engine is locked
    if (this.lock) {
      this.pendingOrders.push({ order, onTrade, onOrderUpdate });
      return;
    }

    this.lock = true;

    try {
      await this._matchOrder(order, onTrade, onOrderUpdate);
      
      // Process pending orders
      while (this.pendingOrders.length > 0) {
        const pending = this.pendingOrders.shift();
        await this._matchOrder(pending.order, pending.onTrade, pending.onOrderUpdate);
      }
    } finally {
      this.lock = false;
    }
  }

  async _matchOrder(order, onTrade, onOrderUpdate) {
    if (order.type === 'market') {
      await this._matchMarketOrder(order, onTrade, onOrderUpdate);
    } else if (order.type === 'limit') {
      await this._matchLimitOrder(order, onTrade, onOrderUpdate);
    }

    // If order is still open, add it to the book
    if (order.is_open) {
      this.orderBook.addOrder(order);
      onOrderUpdate?.(order);
    }
  }

  async _matchMarketOrder(order, onTrade, onOrderUpdate) {
    const remainingQuantity = order.remaining_quantity;
    
    if (order.side === 'buy') {
      // Match against asks
      while (order.remaining_quantity > 0 && this.orderBook.askPrices.length > 0) {
        const bestAsk = this.orderBook.getBestAsk();
        if (!bestAsk) break;

        const tradeQuantity = Math.min(order.remaining_quantity, bestAsk.remaining_quantity);
        const tradePrice = bestAsk.price;

        await this._executeTrade(order, bestAsk, tradePrice, tradeQuantity, onTrade, onOrderUpdate);
      }
    } else {
      // Match against bids
      while (order.remaining_quantity > 0 && this.orderBook.bidPrices.length > 0) {
        const bestBid = this.orderBook.getBestBid();
        if (!bestBid) break;

        const tradeQuantity = Math.min(order.remaining_quantity, bestBid.remaining_quantity);
        const tradePrice = bestBid.price;

        await this._executeTrade(bestBid, order, tradePrice, tradeQuantity, onTrade, onOrderUpdate);
      }
    }

    // If market order couldn't be fully filled, reject it
    if (order.remaining_quantity > 0) {
      order.reject('Insufficient liquidity');
      onOrderUpdate?.(order);
    }
  }

  async _matchLimitOrder(order, onTrade, onOrderUpdate) {
    if (order.side === 'buy') {
      // Match against asks
      while (order.remaining_quantity > 0 && this.orderBook.askPrices.length > 0) {
        const bestAsk = this.orderBook.getBestAsk();
        if (!bestAsk || bestAsk.price > order.price) break;

        const tradeQuantity = Math.min(order.remaining_quantity, bestAsk.remaining_quantity);
        const tradePrice = bestAsk.price; // Price-time priority: take the ask price

        await this._executeTrade(order, bestAsk, tradePrice, tradeQuantity, onTrade, onOrderUpdate);
      }
    } else {
      // Match against bids
      while (order.remaining_quantity > 0 && this.orderBook.bidPrices.length > 0) {
        const bestBid = this.orderBook.getBestBid();
        if (!bestBid || bestBid.price < order.price) break;

        const tradeQuantity = Math.min(order.remaining_quantity, bestBid.remaining_quantity);
        const tradePrice = bestBid.price; // Price-time priority: take the bid price

        await this._executeTrade(bestBid, order, tradePrice, tradeQuantity, onTrade, onOrderUpdate);
      }
    }
  }

  async _executeTrade(buyOrder, sellOrder, price, quantity, onTrade, onOrderUpdate) {
    // Fill both orders
    buyOrder.fill(quantity);
    sellOrder.fill(quantity);

    // Create trade record
    const trade = new Trade({
      trade_id: uuidv4(),
      buy_order_id: buyOrder.order_id,
      sell_order_id: sellOrder.order_id,
      instrument: this.instrument,
      price,
      quantity,
      timestamp: new Date(),
    });

    this.trades.push(trade);

    // Remove filled orders from book
    if (buyOrder.is_filled) {
      this.orderBook.removeOrder(buyOrder.order_id);
    }
    if (sellOrder.is_filled) {
      this.orderBook.removeOrder(sellOrder.order_id);
    }

    // Notify callbacks
    onTrade?.(trade);
    onOrderUpdate?.(buyOrder);
    onOrderUpdate?.(sellOrder);

    logger.info('Trade executed', {
      trade_id: trade.trade_id,
      price,
      quantity,
      buy_order: buyOrder.order_id,
      sell_order: sellOrder.order_id,
    });
  }

  cancelOrder(orderId) {
    const order = this.orderBook.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    order.cancel();
    this.orderBook.removeOrder(orderId);
    
    return order;
  }

  getOrderBookSnapshot(levels = 20) {
    return this.orderBook.getSnapshot(levels);
  }

  getOrder(orderId) {
    return this.orderBook.orders.get(orderId);
  }

  getRecentTrades(limit = 50) {
    return this.trades.slice(-limit).reverse();
  }
}

