import http from 'http';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT_REQUESTS || '100', 10);
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '2000', 10);
const DURATION_SECONDS = parseInt(process.env.DURATION_SECONDS || '60', 10);

const stats = {
  total: 0,
  success: 0,
  errors: 0,
  latencies: [],
  startTime: null,
  endTime: null,
};

function makeRequest(orderData) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const postData = JSON.stringify(orderData);
    
    const options = {
      hostname: new URL(BASE_URL).hostname,
      port: new URL(BASE_URL).port || 3000,
      path: '/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const latency = Date.now() - startTime;
        stats.latencies.push(latency);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          stats.success++;
          resolve({ success: true, latency, statusCode: res.statusCode });
        } else {
          stats.errors++;
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      stats.errors++;
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

function generateOrder() {
  const side = Math.random() > 0.5 ? 'buy' : 'sell';
  const type = Math.random() > 0.7 ? 'market' : 'limit';
  const price = type === 'limit' ? 60000 + Math.random() * 20000 : null;
  
  return {
    client_id: `client-${Math.floor(Math.random() * 100) + 1}`,
    instrument: 'BTC-USD',
    side,
    type,
    price,
    quantity: 0.001 + Math.random() * 5.0,
    idempotency_key: uuidv4(),
  };
}

async function runLoadTest() {
  console.log('Starting load test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Concurrent requests: ${CONCURRENT_REQUESTS}`);
  console.log(`Total requests: ${TOTAL_REQUESTS}`);
  console.log(`Duration: ${DURATION_SECONDS} seconds\n`);
  
  stats.startTime = Date.now();
  const endTime = stats.startTime + DURATION_SECONDS * 1000;
  
  const requests = [];
  let completed = 0;
  
  // Create a pool of concurrent requests
  async function executeRequest() {
    while (Date.now() < endTime && stats.total < TOTAL_REQUESTS) {
      const order = generateOrder();
      stats.total++;
      
      try {
        await makeRequest(order);
      } catch (error) {
        // Error already counted in makeRequest
      }
      
      completed++;
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  // Start concurrent request workers
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    requests.push(executeRequest());
  }
  
  // Wait for all requests to complete
  await Promise.all(requests);
  
  stats.endTime = Date.now();
  
  // Calculate statistics
  const duration = (stats.endTime - stats.startTime) / 1000;
  const throughput = stats.total / duration;
  const successRate = (stats.success / stats.total) * 100;
  
  // Sort latencies for percentile calculation
  stats.latencies.sort((a, b) => a - b);
  
  const p50 = stats.latencies[Math.floor(stats.latencies.length * 0.5)];
  const p95 = stats.latencies[Math.floor(stats.latencies.length * 0.95)];
  const p99 = stats.latencies[Math.floor(stats.latencies.length * 0.99)];
  const avg = stats.latencies.reduce((sum, l) => sum + l, 0) / stats.latencies.length;
  const min = stats.latencies[0] || 0;
  const max = stats.latencies[stats.latencies.length - 1] || 0;
  
  // Print results
  console.log('\n=== Load Test Results ===');
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Total requests: ${stats.total}`);
  console.log(`Successful: ${stats.success} (${successRate.toFixed(2)}%)`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Throughput: ${throughput.toFixed(2)} requests/sec`);
  console.log('\n=== Latency Statistics (ms) ===');
  console.log(`Min: ${min.toFixed(2)}`);
  console.log(`Max: ${max.toFixed(2)}`);
  console.log(`Average: ${avg.toFixed(2)}`);
  console.log(`P50 (Median): ${p50.toFixed(2)}`);
  console.log(`P95: ${p95.toFixed(2)}`);
  console.log(`P99: ${p99.toFixed(2)}`);
  
  // Check if targets are met
  console.log('\n=== Performance Targets ===');
  const targetThroughput = 2000;
  const targetLatency = 100;
  
  console.log(`Target throughput: ${targetThroughput} req/sec`);
  console.log(`Actual throughput: ${throughput.toFixed(2)} req/sec ${throughput >= targetThroughput ? '✓' : '✗'}`);
  console.log(`Target median latency: ${targetLatency}ms`);
  console.log(`Actual median latency: ${p50.toFixed(2)}ms ${p50 <= targetLatency ? '✓' : '✗'}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nLoad test interrupted');
  process.exit(0);
});

runLoadTest().catch(console.error);

