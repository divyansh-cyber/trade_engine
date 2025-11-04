export class Trade {
  constructor({
    trade_id,
    buy_order_id,
    sell_order_id,
    instrument,
    price,
    quantity,
    timestamp,
  }) {
    this.trade_id = trade_id;
    this.buy_order_id = buy_order_id;
    this.sell_order_id = sell_order_id;
    this.instrument = instrument;
    this.price = price;
    this.quantity = quantity;
    this.timestamp = timestamp || new Date();
  }

  toJSON() {
    return {
      trade_id: this.trade_id,
      buy_order_id: this.buy_order_id,
      sell_order_id: this.sell_order_id,
      instrument: this.instrument,
      price: this.price,
      quantity: this.quantity,
      timestamp: this.timestamp,
    };
  }

  static fromDB(row) {
    return new Trade({
      trade_id: row.trade_id,
      buy_order_id: row.buy_order_id,
      sell_order_id: row.sell_order_id,
      instrument: row.instrument,
      price: parseFloat(row.price),
      quantity: parseFloat(row.quantity),
      timestamp: row.timestamp,
    });
  }
}

