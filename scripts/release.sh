#!/bin/bash

# FTP Sync Manager - Release Script
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get version type (default: patch)
VERSION_TYPE=${1:-patch}

echo -e "${GREEN}🚀 FTP Sync Manager Release Script${NC}"
echo ""

# Check if git is clean
if [[ -n $(git status -s) ]]; then
    echo -e "${RED}❌ Git working directory is not clean!${NC}"
    echo "Please commit or stash your changes first."
    exit 1
fi

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${YELLOW}⚠️  Warning: You are not on main branch (current: $CURRENT_BRANCH)${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${YELLOW}v$CURRENT_VERSION${NC}"

# Bump version
echo -e "${GREEN}Bumping $VERSION_TYPE version...${NC}"
npm version $VERSION_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "New version: ${GREEN}v$NEW_VERSION${NC}"

# Commit version bump
git add package.json package-lock.json
git commit -m "chore: bump version to v$NEW_VERSION"

# Create and push tag
echo -e "${GREEN}Creating tag v$NEW_VERSION...${NC}"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo -e "${GREEN}✅ Version bumped and tagged!${NC}"
echo ""
echo "Next steps:"
echo "1. Review the changes: git log -1"
echo "2. Push to GitHub: git push origin main --tags"
echo "3. GitHub Actions will automatically build and release"
echo ""
echo "Or run: git push origin main --tags"
