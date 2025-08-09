# Context for Claude - GitHub Actions Plugin

## Project Overview
This is a GitHub Action plugin for Hycos AI Log Analyzer that uploads CI build logs to S3 and provides AI-powered analysis. The plugin follows the specifications defined in the blueprint document located at `../CI_PLUGIN_BLUEPRINT.md`.

## Current Status
- ✅ API key-only authentication implemented (no login flow)
- ✅ Server registration step added as prerequisite
- ✅ S3 upload with temporary credentials working
- ✅ Upload notification working
- ✅ Analysis link display implemented
- 🔧 Server registration endpoint needs API Gateway configuration

## Key Files
- `src/index.ts` - Main action implementation
- `src/types.ts` - TypeScript interfaces
- `src/s3-uploader.ts` - S3 upload logic with retry
- `src/github-client.ts` - GitHub API client
- `action.yml` - Action metadata
- `.github/workflows/local-test.yml` - Local testing workflow
- `.secrets` - API keys for local testing

## Authentication Flow
Uses X-API-Key header authentication:
1. Register CI server: `POST /build/server`
2. Get S3 credentials: `GET /api/upload/cloud/credentials`
3. Upload logs to S3 using temporary credentials
4. Notify completion: `POST /api/upload/uploaded`
5. Display analysis URL: `https://app.hycos.ai/ci-analysis/{analysisId}`

## API Endpoints
- Base URL: `https://55k1jx7y6e.execute-api.us-east-1.amazonaws.com/dev`
- Server Registration: `POST /build/server` (needs API Gateway config)
- Credentials: `GET /api/upload/cloud/credentials` ✅
- Upload Notification: `POST /api/upload/uploaded` ✅

## Local Testing
```bash
# Install dependencies
npm ci --no-audit --no-fund

# Build action
npm run package

# Test with act
act -W .github/workflows/local-test.yml --secret-file .secrets
```

## Current Issue
Server registration endpoint returns 403 "Missing Authentication Token" - API Gateway needs configuration to accept X-API-Key header for `/build/server` endpoint.

## Blueprint Reference
This plugin implements the GitHub Actions section of `../CI_PLUGIN_BLUEPRINT.md` with the following key features:
- Job Summary integration
- Step outputs for downstream use
- Comprehensive error handling
- Secure credential management
- Retry logic with exponential backoff