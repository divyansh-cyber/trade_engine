// Load Test Script for FedEx Exchange
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const CONCURRENT_USERS = 10;
const ORDERS_PER_USER = 50;

class LoadTester {
  constructor() {
    this.results = {
      totalOrders: 0,
      successfulOrders: 0,
      failedOrders: 0,
      totalTime: 0,
      averageLatency: 0,
      errors: []
    };
  }

  async placeOrder(clientId, orderIndex) {
    const order = {
      client_id: `load-test-${clientId}`,
      instrument: 'BTC-USD',
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      type: 'limit',
      price: 70000 + Math.random() * 2000 - 1000, // ±1000 from 70000
      quantity: 0.01 + Math.random() * 0.09 // 0.01-0.1
    };

    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${BASE_URL}/orders`, order, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      const latency = Date.now() - startTime;
      this.results.successfulOrders++;
      this.results.totalTime += latency;
      
      return { success: true, latency, orderId: response.data.order.order_id };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.results.failedOrders++;
      this.results.errors.push({
        clientId,
        orderIndex,
        error: error.message,
        latency
      });
      
      return { success: false, latency, error: error.message };
    }
  }

  async runUserSimulation(userId) {
    console.log(`🤖 User ${userId} starting simulation...`);
    const results = [];
    
    for (let i = 0; i < ORDERS_PER_USER; i++) {
      const result = await this.placeOrder(userId, i);
      results.push(result);
      
      // Small delay between orders (1-10ms)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 1));
    }
    
    console.log(`✅ User ${userId} completed ${results.length} orders`);
    return results;
  }

  async runLoadTest() {
    console.log('🚀 Starting Load Test...');
    console.log(`👥 Concurrent Users: ${CONCURRENT_USERS}`);
    console.log(`📝 Orders per User: ${ORDERS_PER_USER}`);
    console.log(`📊 Total Orders: ${CONCURRENT_USERS * ORDERS_PER_USER}`);
    console.log('-'.repeat(50));

    const startTime = Date.now();
    
    // Run all users concurrently
    const userPromises = Array.from({ length: CONCURRENT_USERS }, (_, i) => 
      this.runUserSimulation(i + 1)
    );
    
    await Promise.all(userPromises);
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    this.results.totalOrders = this.results.successfulOrders + this.results.failedOrders;
    this.results.averageLatency = this.results.totalTime / this.results.successfulOrders;
    
    this.printResults(totalDuration);
  }

  printResults(totalDuration) {
    console.log('\n📊 LOAD TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`📈 Total Orders: ${this.results.totalOrders}`);
    console.log(`✅ Successful: ${this.results.successfulOrders}`);
    console.log(`❌ Failed: ${this.results.failedOrders}`);
    console.log(`📊 Success Rate: ${((this.results.successfulOrders / this.results.totalOrders) * 100).toFixed(2)}%`);
    console.log(`🚀 Orders/sec: ${(this.results.totalOrders / (totalDuration / 1000)).toFixed(2)}`);
    console.log(`⚡ Avg Latency: ${this.results.averageLatency.toFixed(2)}ms`);
    
    if (this.results.errors.length > 0) {
      console.log(`\n❌ ERRORS (${this.results.errors.length}):`);
      this.results.errors.slice(0, 5).forEach((error, i) => {
        console.log(`  ${i + 1}. User ${error.clientId}, Order ${error.orderIndex}: ${error.error}`);
      });
      if (this.results.errors.length > 5) {
        console.log(`  ... and ${this.results.errors.length - 5} more errors`);
      }
    }
  }
}

// Run the load test
const tester = new LoadTester();
tester.runLoadTest().catch(console.error);