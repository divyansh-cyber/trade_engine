export class Order {
  constructor({
    order_id,
    client_id,
    instrument,
    side,
    type,
    price,
    quantity,
    filled_quantity = 0,
    status = 'open',
    idempotency_key,
    created_at,
    updated_at,
  }) {
    this.order_id = order_id;
    this.client_id = client_id;
    this.instrument = instrument;
    this.side = side; // 'buy' or 'sell'
    this.type = type; // 'limit' or 'market'
    this.price = price;
    this.quantity = quantity;
    this.filled_quantity = filled_quantity;
    this.status = status;
    this.idempotency_key = idempotency_key;
    this.created_at = created_at || new Date();
    this.updated_at = updated_at || new Date();
  }

  get remaining_quantity() {
    return this.quantity - this.filled_quantity;
  }

  get is_filled() {
    return this.filled_quantity >= this.quantity;
  }

  get is_open() {
    return this.status === 'open' || this.status === 'partially_filled';
  }

  fill(quantity) {
    this.filled_quantity += quantity;
    
    if (this.is_filled) {
      this.status = 'filled';
    } else if (this.filled_quantity > 0) {
      this.status = 'partially_filled';
    }
    
    this.updated_at = new Date();
  }

  cancel() {
    if (!this.is_open) {
      throw new Error(`Cannot cancel order ${this.order_id}: status is ${this.status}`);
    }
    this.status = 'cancelled';
    this.updated_at = new Date();
  }

  reject(reason) {
    this.status = 'rejected';
    this.updated_at = new Date();
  }

  toJSON() {
    return {
      order_id: this.order_id,
      client_id: this.client_id,
      instrument: this.instrument,
      side: this.side,
      type: this.type,
      price: this.price,
      quantity: this.quantity,
      filled_quantity: this.filled_quantity,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  static fromDB(row) {
    return new Order({
      order_id: row.order_id,
      client_id: row.client_id,
      instrument: row.instrument,
      side: row.side,
      type: row.type,
      price: row.price ? parseFloat(row.price) : null,
      quantity: parseFloat(row.quantity),
      filled_quantity: parseFloat(row.filled_quantity),
      status: row.status,
      idempotency_key: row.idempotency_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }
}

