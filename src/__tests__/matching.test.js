import { MatchingEngine } from '../matching/MatchingEngine.js';
import { Order } from '../models/Order.js';

describe('MatchingEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new MatchingEngine('BTC-USD');
  });

  test('should match limit buy order with limit sell order', async () => {
    const trades = [];
    const orderUpdates = [];

    // Create a sell order
    const sellOrder = new Order({
      order_id: 'sell-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'sell',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    // Create a buy order at the same price
    const buyOrder = new Order({
      order_id: 'buy-1',
      client_id: 'client-2',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    // Add sell order first
    await engine.processOrder(sellOrder, (trade) => trades.push(trade), (order) => orderUpdates.push(order));

    // Process buy order (should match)
    await engine.processOrder(buyOrder, (trade) => trades.push(trade), (order) => orderUpdates.push(order));

    expect(trades.length).toBe(1);
    expect(trades[0].price).toBe(70000);
    expect(trades[0].quantity).toBe(1.0);
    expect(buyOrder.is_filled).toBe(true);
    expect(sellOrder.is_filled).toBe(true);
  });

  test('should match market buy order with limit sell order', async () => {
    const trades = [];
    const orderUpdates = [];

    // Create a sell order
    const sellOrder = new Order({
      order_id: 'sell-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'sell',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    // Create a market buy order
    const buyOrder = new Order({
      order_id: 'buy-1',
      client_id: 'client-2',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'market',
      quantity: 1.0,
    });

    // Add sell order first
    await engine.processOrder(sellOrder, (trade) => trades.push(trade), (order) => orderUpdates.push(order));

    // Process market buy order (should match)
    await engine.processOrder(buyOrder, (trade) => trades.push(trade), (order) => orderUpdates.push(order));

    expect(trades.length).toBe(1);
    expect(trades[0].price).toBe(70000);
    expect(trades[0].quantity).toBe(1.0);
    expect(buyOrder.is_filled).toBe(true);
    expect(sellOrder.is_filled).toBe(true);
  });

  test('should handle partial fills', async () => {
    const trades = [];
    const orderUpdates = [];

    // Create a sell order
    const sellOrder = new Order({
      order_id: 'sell-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'sell',
      type: 'limit',
      price: 70000,
      quantity: 0.5,
    });

    // Create a larger buy order
    const buyOrder = new Order({
      order_id: 'buy-1',
      client_id: 'client-2',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    // Add sell order first
    await engine.processOrder(sellOrder, (trade) => trades.push(trade), (order) => orderUpdates.push(order));

    // Process buy order (should partially fill)
    await engine.processOrder(buyOrder, (trade) => trades.push(trade), (order) => orderUpdates.push(order));

    expect(trades.length).toBe(1);
    expect(trades[0].quantity).toBe(0.5);
    expect(sellOrder.is_filled).toBe(true);
    expect(buyOrder.status).toBe('partially_filled');
    expect(buyOrder.filled_quantity).toBe(0.5);
    expect(buyOrder.remaining_quantity).toBe(0.5);
  });

  test('should match orders by price-time priority', async () => {
    const trades = [];
    const orderUpdates = [];

    // Create multiple sell orders at the same price
    const sellOrder1 = new Order({
      order_id: 'sell-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'sell',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    const sellOrder2 = new Order({
      order_id: 'sell-2',
      client_id: 'client-2',
      instrument: 'BTC-USD',
      side: 'sell',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    // Add both sell orders
    await engine.processOrder(sellOrder1, (trade) => trades.push(trade), (order) => orderUpdates.push(order));
    await engine.processOrder(sellOrder2, (trade) => trades.push(trade), (order) => orderUpdates.push(order));

    // Create a buy order that should match the first sell order
    const buyOrder = new Order({
      order_id: 'buy-1',
      client_id: 'client-3',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    await engine.processOrder(buyOrder, (trade) => trades.push(trade), (order) => orderUpdates.push(order));

    expect(trades.length).toBe(1);
    expect(trades[0].sell_order_id).toBe('sell-1'); // Should match first order (time priority)
    expect(sellOrder1.is_filled).toBe(true);
    expect(sellOrder2.is_open).toBe(true);
  });

  test('should cancel order', () => {
    const order = new Order({
      order_id: 'order-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    engine.orderBook.addOrder(order);
    
    const cancelledOrder = engine.cancelOrder('order-1');
    
    expect(cancelledOrder.status).toBe('cancelled');
    expect(engine.getOrder('order-1')).toBeUndefined();
  });

  test('should return order book snapshot', () => {
    const order1 = new Order({
      order_id: 'order-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    const order2 = new Order({
      order_id: 'order-2',
      client_id: 'client-2',
      instrument: 'BTC-USD',
      side: 'sell',
      type: 'limit',
      price: 71000,
      quantity: 1.0,
    });

    engine.orderBook.addOrder(order1);
    engine.orderBook.addOrder(order2);

    const snapshot = engine.getOrderBookSnapshot(20);
    
    expect(snapshot.bids.length).toBeGreaterThan(0);
    expect(snapshot.asks.length).toBeGreaterThan(0);
    expect(snapshot.bids[0].price).toBe(70000);
    expect(snapshot.asks[0].price).toBe(71000);
  });
});

