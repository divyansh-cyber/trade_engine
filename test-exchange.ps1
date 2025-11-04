# Comprehensive FedEx Exchange Testing Script

# Function to make API calls
function Test-ExchangeAPI {
    param(
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Body = $null
    )
    
    $uri = "http://localhost:3000$Endpoint"
    
    try {
        if ($Body) {
            $jsonBody = $Body | ConvertTo-Json -Depth 3
            $response = Invoke-RestMethod -Uri $uri -Method $Method -ContentType "application/json" -Body $jsonBody
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method $Method
        }
        
        Write-Host "✅ $Method $Endpoint - SUCCESS" -ForegroundColor Green
        return $response
    } catch {
        Write-Host "❌ $Method $Endpoint - FAILED: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

Write-Host "🚀 Starting FedEx Exchange Comprehensive Testing" -ForegroundColor Cyan
Write-Host "=" * 50

# 1. Health Check
Write-Host "1. Testing Health Check..." -ForegroundColor Yellow
$health = Test-ExchangeAPI -Method "GET" -Endpoint "/healthz"
$health | ConvertTo-Json -Depth 2

# 2. Order Book Test
Write-Host "`n2. Testing Order Book..." -ForegroundColor Yellow
$orderbook = Test-ExchangeAPI -Method "GET" -Endpoint "/market/orderbook?instrument=BTC-USD"
Write-Host "Bids: $($orderbook.bids.Count), Asks: $($orderbook.asks.Count)"

# 3. Recent Trades Test
Write-Host "`n3. Testing Recent Trades..." -ForegroundColor Yellow
$trades = Test-ExchangeAPI -Method "GET" -Endpoint "/market/trades?instrument=BTC-USD&limit=5"
Write-Host "Recent trades count: $($trades.trades.Count)"

# 4. Different Order Types
Write-Host "`n4. Testing Different Order Types..." -ForegroundColor Yellow

# Limit Buy Order
$limitBuy = @{
    client_id = "test-client-1"
    instrument = "BTC-USD"
    side = "buy"
    type = "limit"
    price = 69000
    quantity = 0.2
}
Test-ExchangeAPI -Method "POST" -Endpoint "/orders" -Body $limitBuy

# Limit Sell Order
$limitSell = @{
    client_id = "test-client-2"
    instrument = "BTC-USD"
    side = "sell"
    type = "limit"
    price = 71000
    quantity = 0.15
}
Test-ExchangeAPI -Method "POST" -Endpoint "/orders" -Body $limitSell

# Market Buy Order
$marketBuy = @{
    client_id = "test-client-3"
    instrument = "BTC-USD"
    side = "buy"
    type = "market"
    quantity = 0.02
}
Test-ExchangeAPI -Method "POST" -Endpoint "/orders" -Body $marketBuy

# 5. Error Testing
Write-Host "`n5. Testing Error Handling..." -ForegroundColor Yellow

# Invalid order (missing required fields)
$invalidOrder = @{
    client_id = "test-client-4"
    side = "buy"
}
Test-ExchangeAPI -Method "POST" -Endpoint "/orders" -Body $invalidOrder

# Invalid instrument
$invalidInstrument = @{
    client_id = "test-client-5"
    instrument = "INVALID-PAIR"
    side = "buy"
    type = "limit"
    price = 100
    quantity = 1
}
Test-ExchangeAPI -Method "POST" -Endpoint "/orders" -Body $invalidInstrument

# 6. Performance Test
Write-Host "`n6. Performance Testing (10 rapid orders)..." -ForegroundColor Yellow
$startTime = Get-Date
for ($i = 1; $i -le 10; $i++) {
    $order = @{
        client_id = "perf-test-$i"
        instrument = "BTC-USD"
        side = if ($i % 2 -eq 0) { "buy" } else { "sell" }
        type = "limit"
        price = 70000 + ($i * 10)
        quantity = 0.01
    }
    Test-ExchangeAPI -Method "POST" -Endpoint "/orders" -Body $order | Out-Null
}
$endTime = Get-Date
$duration = ($endTime - $startTime).TotalMilliseconds
Write-Host "Performance: 10 orders in $duration ms (avg: $($duration/10) ms per order)"

# 7. Final Order Book State
Write-Host "`n7. Final Order Book State..." -ForegroundColor Yellow
$finalOrderbook = Test-ExchangeAPI -Method "GET" -Endpoint "/market/orderbook?instrument=BTC-USD&levels=15"
$finalOrderbook | ConvertTo-Json -Depth 3

Write-Host "`n🎉 Testing Complete!" -ForegroundColor Green
Write-Host "=" * 50