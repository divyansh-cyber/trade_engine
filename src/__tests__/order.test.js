import { Order } from '../models/Order.js';

describe('Order', () => {
  test('should create order with correct properties', () => {
    const order = new Order({
      order_id: 'order-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    expect(order.order_id).toBe('order-1');
    expect(order.client_id).toBe('client-1');
    expect(order.instrument).toBe('BTC-USD');
    expect(order.side).toBe('buy');
    expect(order.type).toBe('limit');
    expect(order.price).toBe(70000);
    expect(order.quantity).toBe(1.0);
    expect(order.filled_quantity).toBe(0);
    expect(order.status).toBe('open');
    expect(order.remaining_quantity).toBe(1.0);
    expect(order.is_open).toBe(true);
  });

  test('should fill order correctly', () => {
    const order = new Order({
      order_id: 'order-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    order.fill(0.5);
    
    expect(order.filled_quantity).toBe(0.5);
    expect(order.status).toBe('partially_filled');
    expect(order.remaining_quantity).toBe(0.5);
    expect(order.is_open).toBe(true);

    order.fill(0.5);
    
    expect(order.filled_quantity).toBe(1.0);
    expect(order.status).toBe('filled');
    expect(order.is_filled).toBe(true);
    expect(order.is_open).toBe(false);
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

    order.cancel();
    
    expect(order.status).toBe('cancelled');
    expect(order.is_open).toBe(false);
  });

  test('should reject order', () => {
    const order = new Order({
      order_id: 'order-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    order.reject('Invalid order');
    
    expect(order.status).toBe('rejected');
    expect(order.is_open).toBe(false);
  });

  test('should create order from DB row', () => {
    const dbRow = {
      order_id: 'order-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: '70000.50',
      quantity: '1.5',
      filled_quantity: '0.5',
      status: 'partially_filled',
      idempotency_key: 'key-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const order = Order.fromDB(dbRow);
    
    expect(order.order_id).toBe('order-1');
    expect(order.price).toBe(70000.50);
    expect(order.quantity).toBe(1.5);
    expect(order.filled_quantity).toBe(0.5);
    expect(order.status).toBe('partially_filled');
  });

  test('should serialize to JSON', () => {
    const order = new Order({
      order_id: 'order-1',
      client_id: 'client-1',
      instrument: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      price: 70000,
      quantity: 1.0,
    });

    const json = order.toJSON();
    
    expect(json.order_id).toBe('order-1');
    expect(json.client_id).toBe('client-1');
    expect(json.instrument).toBe('BTC-USD');
    expect(json.side).toBe('buy');
    expect(json.type).toBe('limit');
    expect(json.price).toBe(70000);
    expect(json.quantity).toBe(1.0);
  });
});

