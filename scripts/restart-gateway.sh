#!/bin/bash
# scripts/restart-gateway.sh

echo "Restarting Gateway..."
./scripts/stop-gateway.sh
sleep 1
./scripts/start-gateway.sh