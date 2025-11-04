import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/stream');

ws.on('open', () => {
  console.log('Connected to WebSocket');
  
  // Subscribe to order book updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'orderbook',
    instrument: 'BTC-USD'
  }));
  
  // Subscribe to trade updates
  ws.send(JSON.stringify({
    type: 'subscribe', 
    channel: 'trades',
    instrument: 'BTC-USD'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Received:', JSON.stringify(message, null, 2));
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

// Keep the connection alive for 30 seconds
setTimeout(() => {
  ws.close();
}, 30000);