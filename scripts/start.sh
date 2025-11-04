#!/bin/bash

# Start script for the exchange service

echo "Starting TwoCents Capital Exchange Service..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Start dependencies
echo "Starting dependencies (Postgres, Redis, Kafka)..."
docker-compose up -d postgres redis zookeeper kafka

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 10

# Check if PostgreSQL is ready
echo "Checking PostgreSQL..."
until docker exec exchange-postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

# Run migrations
echo "Running database migrations..."
docker exec -i exchange-postgres psql -U postgres -d exchange < migrations/001_init.sql

# Start the service
echo "Starting exchange service..."
docker-compose up -d exchange-service

# Wait for service to be ready
echo "Waiting for service to be ready..."
sleep 5

# Check health
echo "Checking service health..."
curl -f http://localhost:3000/healthz > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✓ Service is healthy!"
    echo ""
    echo "Service is running at:"
    echo "  - HTTP API: http://localhost:3000"
    echo "  - WebSocket: ws://localhost:3000/stream"
    echo "  - Health Check: http://localhost:3000/healthz"
    echo "  - Metrics: http://localhost:3000/metrics"
    echo ""
    echo "View logs with: docker-compose logs -f exchange-service"
else
    echo "✗ Service health check failed. Check logs with: docker-compose logs exchange-service"
    exit 1
fi

