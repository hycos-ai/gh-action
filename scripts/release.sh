#!/bin/bash

# Hycos AI GitHub Action Release Script
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [[ ! -f "action.yml" ]]; then
    print_error "Must be run from the GitHub Action root directory (where action.yml exists)"
    exit 1
fi

# Check if git is clean
if [[ -n $(git status --porcelain) ]]; then
    print_error "Git working directory is not clean. Please commit or stash changes first."
    git status --short
    exit 1
fi

# Check if we're on main/master branch
current_branch=$(git branch --show-current)
if [[ "$current_branch" != "main" && "$current_branch" != "master" ]]; then
    print_warning "You're not on main/master branch (current: $current_branch)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get current version from package.json
current_version=$(node -p "require('./package.json').version")
print_status "Current version: $current_version"

# Determine version bump type
version_type=${1:-patch}
if [[ ! "$version_type" =~ ^(patch|minor|major)$ ]]; then
    print_error "Invalid version type. Use: patch, minor, or major"
    exit 1
fi

print_status "Bumping $version_type version..."

# Update version in package.json
npm version $version_type --no-git-tag-version

# Get new version
new_version=$(node -p "require('./package.json').version")
print_success "Version bumped to: $new_version"

# Update version in action.yml (if it has a version field)
if grep -q "version:" action.yml; then
    sed -i.bak "s/version: .*/version: '$new_version'/" action.yml
    rm action.yml.bak
    print_status "Updated version in action.yml"
fi

print_status "Installing dependencies..."
npm ci --no-audit --no-fund

print_status "Running tests..."
npm test

print_status "Running linter..."
npm run lint

print_status "Building action..."
npm run build

print_status "Packaging action..."
npm run package

# Commit changes
print_status "Committing changes..."
git add package.json package-lock.json action.yml dist/
git commit -m "chore: release v$new_version

- Bump version to $new_version
- Update dist/ with latest build
- Ready for release"

# Create tag
print_status "Creating git tag v$new_version..."
git tag -a "v$new_version" -m "Release v$new_version

$(git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo "")..HEAD | head -10)"

# Extract major version (e.g., v1.2.3 -> v1)
major_version="v$(echo $new_version | cut -d. -f1)"

print_status "Updating major version tag $major_version..."
# Force update the major version tag
git tag -f "$major_version" "v$new_version"

# Show what will be pushed
echo ""
print_status "Ready to push:"
echo "  - Commit: $(git log --oneline -1)"
echo "  - Tags: v$new_version, $major_version"
echo ""

# Ask for confirmation
read -p "Push to origin? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Pushing to origin..."
    git push origin $current_branch
    git push origin "v$new_version"
    git push -f origin "$major_version"
    
    print_success "Release v$new_version pushed successfully!"
    echo ""
    print_status "Next steps:"
    echo "  1. Go to GitHub and create a release from tag v$new_version"
    echo "  2. Add release notes describing the changes"
    echo "  3. Action will be automatically available in GitHub Marketplace"
    echo ""
    print_status "Users can now use:"
    echo "  uses: hycos-ai/github-action@v$new_version"
    echo "  uses: hycos-ai/github-action@$major_version"
else
    print_warning "Push cancelled. You can push manually later with:"
    echo "  git push origin $current_branch"
    echo "  git push origin v$new_version"
    echo "  git push -f origin $major_version"
fi

print_success "Release process completed!"