#!/bin/bash
set -e

echo "=== IBC Setup Script ==="

# Check if chains are ready
until curl -s http://localhost:26657/status > /dev/null 2>&1; do
    echo "Waiting for wdk-chain..."
    sleep 2
done

until curl -s http://localhost:26658/status > /dev/null 2>&1; do
    echo "Waiting for wdk-chain2..."
    sleep 2
done

echo "Both chains are running!"

# Relayer mnemonic (dedicated relayer account)
RELAYER_MNEMONIC="thumb subway until asthma diesel visa supply brush relief control amused bonus grace great flavor initial drum loud circle crowd topple box novel biology"

# Add keys to Hermes (delete existing keys first)
echo "Adding relayer keys to Hermes..."

docker exec hermes hermes keys delete --chain wdkdev --key-name relayer 2>/dev/null || true
docker exec hermes hermes keys delete --chain wdkdev2 --key-name relayer 2>/dev/null || true

docker exec -i hermes hermes keys add --chain wdkdev --mnemonic-file /dev/stdin <<< "$RELAYER_MNEMONIC" --key-name relayer
docker exec -i hermes hermes keys add --chain wdkdev2 --mnemonic-file /dev/stdin <<< "$RELAYER_MNEMONIC" --key-name relayer

# Create clients
echo "Creating IBC clients..."
docker exec hermes hermes create client --host-chain wdkdev --reference-chain wdkdev2

docker exec hermes hermes create client --host-chain wdkdev2 --reference-chain wdkdev

# Create connection
echo "Creating IBC connection..."
docker exec hermes hermes create connection --a-chain wdkdev --b-chain wdkdev2

# Create transfer channel
echo "Creating IBC transfer channel..."
docker exec hermes hermes create channel --a-chain wdkdev --a-connection connection-0 --a-port transfer --b-port transfer

echo ""
echo "=== IBC Setup Complete ==="
echo "Channel created between wdkdev and wdkdev2"
echo ""
echo "To test IBC transfer from wdk-chain:"
echo "docker exec wdk-chain wdkdevd tx ibc-transfer transfer transfer channel-0 <recipient> 1000stake --from alice --chain-id wdkdev -y"
