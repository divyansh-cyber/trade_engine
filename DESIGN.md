# Design Document

## Architecture Overview

### System Components

1. **API Layer** (Express.js)
   - HTTP REST API for order management
   - WebSocket server for real-time updates
   - Request validation and rate limiting

2. **Exchange Service**
   - Multi-instrument matching engine manager
   - Order processing orchestration
   - State management and recovery

3. **Matching Engine**
   - Price-time priority order book
   - Trade execution logic
   - Single-threaded matching loop

4. **Persistence Layer**
   - PostgreSQL: Orders, trades, events, snapshots
   - Redis: Caching, pub/sub, idempotency keys

5. **Messaging Layer**
   - Kafka: Event streaming and inter-service communication
   - Redis Pub/Sub: Real-time WebSocket broadcasting

6. **Observability**
   - Prometheus metrics
   - Structured logging (Winston)
   - Health checks

## Concurrency Model

### Matching Engine Lock

The matching engine uses a **lock-based approach** to ensure thread safety:

```javascript
class MatchingEngine {
  constructor() {
    this.lock = false;
    this.pendingOrders = [];
  }

  async processOrder(order, onTrade, onOrderUpdate) {
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
}
```

**Benefits:**
- Prevents race conditions in order matching
- Ensures price-time priority is maintained
- Prevents double fills
- Simple to reason about

**Trade-offs:**
- Single-threaded matching (sequential processing)
- Orders are queued when engine is locked
- May create latency spikes under high load

**Alternative Approaches Considered:**
1. **Optimistic Concurrency**: Use database transactions with version numbers
   - More complex, requires retry logic
   - Better for distributed systems

2. **Actor Model**: Each instrument has its own actor
   - Better isolation
   - More complex to implement

3. **Lock-Free Data Structures**: Use atomic operations
   - Very complex
   - Hard to maintain correctness

**Chosen Approach Justification:**
- Simplicity: Easy to understand and maintain
- Correctness: Guarantees no race conditions
- Performance: Sufficient for single-node (2k orders/sec target)
- Scalability: Can partition by instrument for multi-node

## Data Model

### Order States

```
open → partially_filled → filled
  ↓
cancelled
  ↓
rejected
```

### Order Book Structure

```
OrderBook
├── bids: Map<price, Order[]>
├── bidPrices: number[] (sorted DESC)
├── asks: Map<price, Order[]>
├── askPrices: number[] (sorted ASC)
└── orders: Map<order_id, Order>
```

### Database Schema

**Orders Table:**
- `order_id` (PK)
- `client_id`
- `instrument`
- `side` (buy/sell)
- `type` (limit/market)
- `price`
- `quantity`
- `filled_quantity`
- `status`
- `idempotency_key` (unique)
- `created_at`, `updated_at`

**Trades Table:**
- `trade_id` (PK)
- `buy_order_id` (FK)
- `sell_order_id` (FK)
- `instrument`
- `price`
- `quantity`
- `timestamp`

**Order Events Table (Event Sourcing):**
- `event_id` (PK)
- `order_id` (FK)
- `event_type`
- `event_data` (JSONB)
- `timestamp`

**Order Book Snapshots:**
- `snapshot_id` (PK)
- `instrument`
- `snapshot_data` (JSONB)
- `timestamp`

**Client Positions:**
- `client_id` (PK)
- `instrument` (PK)
- `net_quantity`
- `total_cost`
- `last_updated`

## Recovery Strategy

### On Startup

1. **Load Open Orders**
   ```sql
   SELECT * FROM orders
   WHERE instrument = 'BTC-USD'
   AND status IN ('open', 'partially_filled')
   ORDER BY created_at ASC
   ```

2. **Rebuild Order Book**
   - Reconstruct in-memory order book from persisted orders
   - Maintain price-time priority

3. **Start Periodic Snapshots**
   - Save order book snapshots every 1 minute
   - Can use latest snapshot for faster recovery

4. **Kafka Consumer (Optional)**
   - Replay events from Kafka if needed
   - Useful for disaster recovery

### Trade-offs

**Current Approach:**
- ✅ Simple and reliable
- ✅ Fast recovery (loads only open orders)
- ❌ May lose in-flight orders if server crashes

**Alternative: Event Sourcing**
- ✅ Complete audit trail
- ✅ Can replay all events
- ❌ Slower recovery (must replay all events)
- ❌ More complex

**Chosen Approach:**
- Hybrid: Store orders + events
- Fast recovery via open orders
- Full audit trail via events
- Snapshots for even faster recovery

## Idempotency

### Implementation

1. **Idempotency Key Check**
   ```javascript
   if (idempotencyKey) {
     const existingOrderId = await redis.getIdempotencyKey(idempotencyKey);
     if (existingOrderId) {
       const existingOrder = await postgres.getOrder(existingOrderId);
       if (existingOrder) {
         return existingOrder; // Return existing result
       }
     }
   }
   ```

2. **Store Idempotency Key**
   ```javascript
   await redis.setIdempotencyKey(idempotencyKey, order.order_id, 3600);
   ```

**Benefits:**
- Prevents duplicate order submission
- Returns same result for retries
- Client can safely retry failed requests

## Error Handling & Resilience

### Database Failures

1. **Connection Retry**
   - Exponential backoff
   - Max 3 retries
   - Log errors for monitoring

2. **Transaction Isolation**
   - Use database transactions for critical operations
   - Proper isolation levels (READ COMMITTED)

3. **Graceful Degradation**
   - If Redis is down, skip caching
   - If Kafka is down, log errors but continue processing

### Network Failures

1. **Kafka Producer**
   - Automatic retries with exponential backoff
   - Idempotent producer configuration

2. **Redis**
   - Connection retry with backoff
   - Fallback to database if Redis unavailable

## Performance Optimization

### Matching Engine

1. **In-Memory Order Book**
   - Fast lookups (O(log n) for price levels)
   - Periodic persistence to avoid data loss

2. **Batched Operations**
   - Batch Kafka messages when possible
   - Batch database writes for trades

3. **Connection Pooling**
   - PostgreSQL: 20 connections
   - Redis: Connection pooling built-in

### Caching Strategy

1. **Redis Caching**
   - Idempotency keys (1 hour TTL)
   - Rate limiting counters
   - Order book snapshots (optional)

2. **In-Memory Caching**
   - Active order book (always in memory)
   - Recent trades (last 1000)

## Scaling Considerations

### Single Node Limits

- **Throughput**: ~2,500 orders/sec
- **Latency**: <100ms median (P50)
- **Concurrent Clients**: 1000+

### Multi-Node Architecture

1. **Horizontal Scaling**
   - Partition by instrument
   - Each node handles specific instruments
   - Load balancer routes by instrument

2. **Shared State**
   - PostgreSQL: Shared database
   - Redis: Distributed cache (Redis Cluster)
   - Kafka: Event streaming between nodes

3. **Consistency**
   - Strong consistency within node
   - Eventual consistency across nodes
   - Use Kafka for cross-node synchronization

### Multi-Instrument Support

**Current Implementation:**
- Each instrument has its own matching engine
- Instrument-specific order books
- Per-instrument analytics

**Benefits:**
- Isolation between instruments
- Independent scaling per instrument
- No cross-instrument interference

## Security Considerations

### Input Validation

1. **Order Validation**
   - Price/quantity must be positive
   - Precision limits (8 decimal places)
   - Side/type must be valid values

2. **Rate Limiting**
   - Per-IP rate limiting
   - Per-client rate limiting (if API keys implemented)

3. **SQL Injection Prevention**
   - Parameterized queries
   - No raw SQL string concatenation

### Future Enhancements

1. **API Keys**
   - Role-based access control
   - Per-client rate limiting
   - Request signing

2. **Encryption**
   - TLS for all connections
   - Encrypt sensitive data at rest

3. **Audit Logging**
   - Log all order submissions
   - Track client activities
   - Compliance reporting

## Monitoring & Observability

### Metrics

**Prometheus Metrics:**
- `orders_received_total`: Total orders received
- `orders_matched_total`: Total orders matched
- `orders_rejected_total`: Total orders rejected
- `order_latency_seconds`: Order processing latency histogram
- `current_orderbook_depth`: Current order book depth
- `trades_total`: Total trades executed
- `trade_volume_total`: Total trade volume

### Logging

**Structured Logging (Winston):**
- Order submissions
- Trade executions
- Errors and warnings
- Performance metrics

### Health Checks

**Health Endpoint (`/healthz`):**
- PostgreSQL connection status
- Redis connection status
- Kafka connection status

## Testing Strategy

### Unit Tests

- Matching engine logic
- Order model operations
- Data validation

### Integration Tests

- API endpoints
- Database operations
- Kafka integration

### Load Tests

- Throughput testing (2k orders/sec)
- Latency testing (<100ms median)
- Concurrent request handling
- Database failure scenarios
- Idempotency testing

## Trade-offs Summary

| Aspect | Choice | Trade-off |
|--------|--------|-----------|
| **Concurrency** | Lock-based | Simple but sequential |
| **Persistence** | PostgreSQL + Redis | Reliable but complex |
| **Recovery** | Open orders + snapshots | Fast but may lose in-flight |
| **Matching** | In-memory | Fast but requires persistence |
| **Messaging** | Kafka + Redis | Reliable but adds latency |
| **Scaling** | Partition by instrument | Simple but requires coordination |

## Future Enhancements

1. **Advanced Order Types**
   - Stop-loss orders
   - Iceberg orders
   - Time-in-force (IOC, FOK)

2. **Settlement Service**
   - End-of-day position netting
   - Multi-currency support
   - Margin calculations

3. **Analytics**
   - Real-time dashboards
   - Advanced charting
   - Market depth analysis

4. **Multi-Exchange Support**
   - Connect to external exchanges
   - Order routing
   - Arbitrage detection

