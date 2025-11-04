#!/bin/bash

# Test script for the exchange service

echo "Running tests..."

# Run unit tests
echo "Running unit tests..."
npm test

if [ $? -ne 0 ]; then
    echo "✗ Unit tests failed"
    exit 1
fi

# Run integration tests
echo "Running integration tests..."
npm test -- --testPathPattern=integration

if [ $? -ne 0 ]; then
    echo "✗ Integration tests failed"
    exit 1
fi

echo "✓ All tests passed!"

