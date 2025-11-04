# Quick Start Guide

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development only)
- Git

## Quick Start with Docker Compose

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd Fedex

# Copy environment file
cp .env.example .env
```

### 2. Start Services

```bash
# Start all services (Postgres, Redis, Kafka, Exchange Service)
docker-compose up -d

# Or use the start script
chmod +x scripts/start.sh
./scripts/start.sh
```

### 3. Verify Service is Running

```bash
# Check health
curl http://localhost:3000/healthz

# Check metrics
curl http://localhost:3000/metrics
```

### 4. Submit Your First Order

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "test-order-1",
    "client_id": "client-A",
    "instrument": "BTC-USD",
    "side": "buy",
    "type": "limit",
    "price": 70000,
    "quantity": 0.25
  }'
```

### 5. View Order Book

```bash
curl http://localhost:3000/market/orderbook?instrument=BTC-USD&levels=20
```

### 6. View Recent Trades

```bash
curl http://localhost:3000/market/trades?instrument=BTC-USD&limit=50
```

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Dependencies

```bash
# Start only infrastructure services
docker-compose up -d postgres redis zookeeper kafka

# Run migrations
psql -h localhost -U postgres -d exchange -f migrations/001_init.sql
```

### 3. Start the Service

```bash
# Development mode with auto-reload
npm run dev

# Or production mode
npm start
```

## Testing

### Run Tests

```bash
# Unit tests
npm test

# With coverage
npm run test:coverage

# Integration tests
npm test -- --testPathPattern=integration
```

### Generate Test Fixtures

```bash
npm run generate-fixtures
```

### Run Load Test

```bash
# Start the service first
npm start

# In another terminal, run load test
npm run load-test

# Or with custom parameters
BASE_URL=http://localhost:3000 \
CONCURRENT_REQUESTS=100 \
TOTAL_REQUESTS=2000 \
DURATION_SECONDS=60 \
node load-test/index.js
```

## WebSocket Testing

### Connect to WebSocket

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/stream');

ws.on('open', () => {
  console.log('Connected');
  
  // Subscribe to channels
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['trades', 'orders', 'orderbook'],
    instrument: 'BTC-USD'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Received:', message);
});
```

### Submit Order via WebSocket

```javascript
ws.send(JSON.stringify({
  type: 'order',
  client_id: 'client-A',
  instrument: 'BTC-USD',
  side: 'buy',
  type: 'limit',
  price: 70000,
  quantity: 1.0,
  idempotency_key: 'ws-order-1'
}));
```

## Common Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f exchange-service
```

### Stop Services

```bash
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Restart Service

```bash
docker-compose restart exchange-service
```

### Check Service Status

```bash
docker-compose ps
```

### Access Database

```bash
# PostgreSQL
docker exec -it exchange-postgres psql -U postgres -d exchange

# Redis
docker exec -it exchange-redis redis-cli
```

## Troubleshooting

### Service Won't Start

1. Check if ports are available:
   ```bash
   # Check if ports are in use
   lsof -i :3000
   lsof -i :5432
   lsof -i :6379
   lsof -i :9092
   ```

2. Check logs:
   ```bash
   docker-compose logs exchange-service
   ```

3. Restart services:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Database Connection Issues

1. Check if PostgreSQL is running:
   ```bash
   docker-compose ps postgres
   ```

2. Check connection:
   ```bash
   docker exec exchange-postgres pg_isready -U postgres
   ```

3. Reset database:
   ```bash
   docker-compose down -v
   docker-compose up -d postgres
   # Wait for it to start, then run migrations
   ```

### Kafka Connection Issues

1. Check if Kafka is running:
   ```bash
   docker-compose ps kafka
   ```

2. Check Kafka logs:
   ```bash
   docker-compose logs kafka
   ```

### Service Health Check Fails

1. Check health endpoint:
   ```bash
   curl http://localhost:3000/healthz
   ```

2. Check individual service health:
   - PostgreSQL: `docker exec exchange-postgres pg_isready -U postgres`
   - Redis: `docker exec exchange-redis redis-cli ping`
   - Kafka: Check logs

## Next Steps

1. **Read the Documentation**
   - [README.md](README.md) - Complete project documentation
   - [DESIGN.md](DESIGN.md) - Architecture and design decisions
   - [API_EXAMPLES.md](API_EXAMPLES.md) - API usage examples

2. **Import Postman Collection**
   - Import `postman_collection.json` into Postman
   - Set `base_url` variable to `http://localhost:3000`

3. **Run Load Tests**
   - Generate test fixtures: `npm run generate-fixtures`
   - Run load test: `npm run load-test`

4. **Explore the Code**
   - Matching engine: `src/matching/MatchingEngine.js`
   - API routes: `src/routes/`
   - Services: `src/services/`

## Support

For issues or questions:
1. Check the documentation
2. Review logs: `docker-compose logs -f`
3. Check health endpoint: `curl http://localhost:3000/healthz`
4. Review metrics: `curl http://localhost:3000/metrics`

