#!/bin/bash

# Quick build and test script for development
# Usage: ./scripts/build.sh

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔨 Building Hycos AI GitHub Action...${NC}"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --no-audit --no-fund

# Run tests
echo "🧪 Running tests..."
npm test

# Lint code
echo "🔍 Linting code..."
npm run lint

# Build TypeScript
echo "🏗️  Building TypeScript..."
npm run build

# Package for distribution
echo "📦 Packaging for distribution..."
npm run package

# Check if dist is up to date
if [[ -n $(git diff --name-only dist/) ]]; then
    echo -e "${BLUE}ℹ️  dist/ folder has been updated${NC}"
    echo "   Run 'git add dist/' to include in your next commit"
else
    echo "✅ dist/ folder is up to date"
fi

echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo ""
echo "🧪 To test locally:"
echo "   act -W .github/workflows/local-test.yml --secret-file .secrets"
echo ""
echo "🚀 To release:"
echo "   ./scripts/release.sh [patch|minor|major]"