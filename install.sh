#!/bin/bash
# Creator: ThanhTrung

echo "Checking for Node.js..."
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "Installing dependencies..."
npm install

echo "Building server..."
npm run build:server

echo "Building application..."
npm run build

echo "Creating executable..."
npm run dist

echo "Installation complete!"
echo "Check the 'release_v4' directory for your installer."
