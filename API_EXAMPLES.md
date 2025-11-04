# API Examples

This document provides curl examples for all major API endpoints.

## Order Management

### Submit a Limit Order

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "order-123",
    "order_id": "order-1",
    "client_id": "client-A",
    "instrument": "BTC-USD",
    "side": "buy",
    "type": "limit",
    "price": 70150.5,
    "quantity": 0.25
  }'
```

### Submit a Market Order

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "market-order-123",
    "client_id": "client-B",
    "instrument": "BTC-USD",
    "side": "sell",
    "type": "market",
    "quantity": 0.5
  }'
```

### Cancel an Order

```bash
curl -X POST http://localhost:3000/orders/order-1/cancel?instrument=BTC-USD
```

### Get Order Details

```bash
curl http://localhost:3000/orders/order-1
```

## Market Data

### Get Order Book

```bash
# Get top 20 levels
curl http://localhost:3000/market/orderbook?instrument=BTC-USD&levels=20

# Get top 50 levels
curl http://localhost:3000/market/orderbook?instrument=BTC-USD&levels=50
```

### Get Recent Trades

```bash
# Get last 50 trades
curl http://localhost:3000/market/trades?instrument=BTC-USD&limit=50

# Get last 100 trades
curl http://localhost:3000/market/trades?instrument=BTC-USD&limit=100
```

### Get Trade Analytics

```bash
# Get 1-minute aggregates for last 24 hours
curl "http://localhost:3000/market/analytics?instrument=BTC-USD&start_time=2024-01-01T00:00:00Z&end_time=2024-01-01T23:59:59Z&interval=1"

# Get 5-minute aggregates
curl "http://localhost:3000/market/analytics?instrument=BTC-USD&start_time=2024-01-01T00:00:00Z&end_time=2024-01-01T23:59:59Z&interval=5"
```

### Get Client Positions

```bash
curl http://localhost:3000/market/positions/client-A
```

### Request Order Book Snapshot

```bash
curl -X POST http://localhost:3000/market/orderbook/snapshot?instrument=BTC-USD
```

## Admin Endpoints

### Health Check

```bash
curl http://localhost:3000/healthz
```

### Get Metrics

```bash
curl http://localhost:3000/metrics
```

## WebSocket Examples

### Connect and Subscribe

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

ws.on('error', (error) => {
  console.error('Error:', error);
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

## Python Examples

### Submit Order

```python
import requests
import json

url = "http://localhost:3000/orders"
headers = {"Content-Type": "application/json"}
data = {
    "idempotency_key": "order-123",
    "client_id": "client-A",
    "instrument": "BTC-USD",
    "side": "buy",
    "type": "limit",
    "price": 70150.5,
    "quantity": 0.25
}

response = requests.post(url, headers=headers, json=data)
print(response.json())
```

### Get Order Book

```python
import requests

url = "http://localhost:3000/market/orderbook"
params = {
    "instrument": "BTC-USD",
    "levels": 20
}

response = requests.get(url, params=params)
print(response.json())
```

## Load Testing Examples

### Submit Multiple Orders

```bash
# Submit 100 orders
for i in {1..100}; do
  curl -X POST http://localhost:3000/orders \
    -H "Content-Type: application/json" \
    -d "{
      \"idempotency_key\": \"load-test-$i\",
      \"client_id\": \"client-$(($i % 10))\",
      \"instrument\": \"BTC-USD\",
      \"side\": \"$(if [ $((i % 2)) -eq 0 ]; then echo 'buy'; else echo 'sell'; fi)\",
      \"type\": \"limit\",
      \"price\": $((70000 + (i % 1000))),
      \"quantity\": $(echo "scale=8; $RANDOM/100000" | bc)
    }" &
done
wait
```

## Error Handling

### Invalid Order (Missing Fields)

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-A",
    "side": "buy"
  }'
```

**Response:**
```json
{
  "errors": [
    {
      "msg": "type must be limit or market",
      "param": "type",
      "location": "body"
    },
    {
      "msg": "quantity must be positive",
      "param": "quantity",
      "location": "body"
    }
  ]
}
```

### Duplicate Order (Idempotency)

```bash
# Submit same order twice with same idempotency_key
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "unique-key-123",
    "client_id": "client-A",
    "instrument": "BTC-USD",
    "side": "buy",
    "type": "limit",
    "price": 70000,
    "quantity": 1.0
  }'

# Second submission returns same result
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "unique-key-123",
    "client_id": "client-A",
    "instrument": "BTC-USD",
    "side": "buy",
    "type": "limit",
    "price": 70000,
    "quantity": 1.0
  }'
```

Both requests return the same order (no duplicate matching).

