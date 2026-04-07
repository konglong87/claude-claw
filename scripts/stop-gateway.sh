#!/bin/bash
# scripts/stop-gateway.sh

PORT=$(grep "port:" config.yaml | head -1 | awk '{print $2}')
echo "Stopping Gateway on port $PORT..."

./scripts/kill-ports.sh $PORT

echo "✓ Gateway stopped"