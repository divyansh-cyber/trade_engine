-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(255) PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL,
    instrument VARCHAR(50) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
    type VARCHAR(10) NOT NULL CHECK (type IN ('limit', 'market')),
    price DECIMAL(20, 8),
    quantity DECIMAL(20, 8) NOT NULL,
    filled_quantity DECIMAL(20, 8) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled', 'rejected')),
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
    trade_id VARCHAR(255) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    buy_order_id VARCHAR(255) NOT NULL,
    sell_order_id VARCHAR(255) NOT NULL,
    instrument VARCHAR(50) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    quantity DECIMAL(20, 8) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buy_order_id) REFERENCES orders(order_id),
    FOREIGN KEY (sell_order_id) REFERENCES orders(order_id)
);

-- Order events table (for event sourcing)
CREATE TABLE IF NOT EXISTS order_events (
    event_id BIGSERIAL PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- Order book snapshots table
CREATE TABLE IF NOT EXISTS order_book_snapshots (
    snapshot_id BIGSERIAL PRIMARY KEY,
    instrument VARCHAR(50) NOT NULL,
    snapshot_data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Client positions table (for settlement)
CREATE TABLE IF NOT EXISTS client_positions (
    client_id VARCHAR(255) NOT NULL,
    instrument VARCHAR(50) NOT NULL,
    net_quantity DECIMAL(20, 8) DEFAULT 0,
    total_cost DECIMAL(20, 8) DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (client_id, instrument)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_instrument ON orders(instrument);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_timestamp ON order_events(timestamp DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

