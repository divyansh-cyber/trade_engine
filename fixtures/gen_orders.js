import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate realistic order data for testing
 */
function generateLimitOrders(count, priceRange, quantityRange) {
  const orders = [];
  const basePrice = priceRange.min + (priceRange.max - priceRange.min) / 2;
  
  for (let i = 0; i < count; i++) {
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    const price = basePrice + (Math.random() - 0.5) * (priceRange.max - priceRange.min) * 0.2;
    const quantity = quantityRange.min + Math.random() * (quantityRange.max - quantityRange.min);
    
    orders.push({
      order_id: `order-${i + 1}`,
      client_id: `client-${Math.floor(Math.random() * 100) + 1}`,
      instrument: 'BTC-USD',
      side,
      type: 'limit',
      price: parseFloat(price.toFixed(2)),
      quantity: parseFloat(quantity.toFixed(8)),
      idempotency_key: `idempotency-${i + 1}`,
    });
  }
  
  return orders;
}

function generateMarketOrders(count, quantityRange) {
  const orders = [];
  
  for (let i = 0; i < count; i++) {
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    const quantity = quantityRange.min + Math.random() * (quantityRange.max - quantityRange.min);
    
    orders.push({
      order_id: `market-order-${i + 1}`,
      client_id: `client-${Math.floor(Math.random() * 100) + 1}`,
      instrument: 'BTC-USD',
      side,
      type: 'market',
      quantity: parseFloat(quantity.toFixed(8)),
      idempotency_key: `market-idempotency-${i + 1}`,
    });
  }
  
  return orders;
}

function generateBurstOrders(count, quantityRange) {
  const orders = [];
  
  // Generate a burst of market orders
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 'buy' : 'sell';
    const quantity = quantityRange.min + Math.random() * (quantityRange.max - quantityRange.min);
    
    orders.push({
      order_id: `burst-order-${i + 1}`,
      client_id: `client-${Math.floor(Math.random() * 10) + 1}`,
      instrument: 'BTC-USD',
      side,
      type: 'market',
      quantity: parseFloat(quantity.toFixed(8)),
      idempotency_key: `burst-idempotency-${i + 1}`,
    });
  }
  
  return orders;
}

async function main() {
  const outputDir = path.join(__dirname, 'output');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('Generating order fixtures...');
  
  // Generate 100k limit orders
  const limitOrders = generateLimitOrders(100000, {
    min: 60000,
    max: 80000,
  }, {
    min: 0.001,
    max: 10.0,
  });
  
  fs.writeFileSync(
    path.join(outputDir, 'limit_orders.json'),
    JSON.stringify(limitOrders, null, 2)
  );
  console.log(`Generated ${limitOrders.length} limit orders`);
  
  // Generate market orders
  const marketOrders = generateMarketOrders(1000, {
    min: 0.01,
    max: 5.0,
  });
  
  fs.writeFileSync(
    path.join(outputDir, 'market_orders.json'),
    JSON.stringify(marketOrders, null, 2)
  );
  console.log(`Generated ${marketOrders.length} market orders`);
  
  // Generate burst orders
  const burstOrders = generateBurstOrders(500, {
    min: 0.1,
    max: 2.0,
  });
  
  fs.writeFileSync(
    path.join(outputDir, 'burst_orders.json'),
    JSON.stringify(burstOrders, null, 2)
  );
  console.log(`Generated ${burstOrders.length} burst orders`);
  
  // Generate CSV for easy import
  const csvLines = ['order_id,client_id,instrument,side,type,price,quantity,idempotency_key'];
  limitOrders.forEach(order => {
    csvLines.push(
      `${order.order_id},${order.client_id},${order.instrument},${order.side},${order.type},${order.price || ''},${order.quantity},${order.idempotency_key}`
    );
  });
  
  fs.writeFileSync(
    path.join(outputDir, 'limit_orders.csv'),
    csvLines.join('\n')
  );
  console.log('Generated CSV file');
  
  console.log('\nAll fixtures generated successfully!');
  console.log(`Output directory: ${outputDir}`);
}

main().catch(console.error);

