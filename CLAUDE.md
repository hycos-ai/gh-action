# Context for Claude - GitHub Actions Plugin

## Project Overview
This is a GitHub Action plugin for Hycos AI Log Analyzer that processes CI build logs and provides AI-powered analysis. The plugin is now PUBLIC and ready for external users with enterprise-grade security compliance.

## Recent Major Updates (v2.2.2)
- ✅ **CRITICAL SECURITY**: Removed exposed API keys from .secrets file
- ✅ **PUBLIC READY**: Updated README to remove internal AWS/S3 implementation details
- ✅ **SOC 2 COMPLIANCE**: Enhanced security features and input validation
- ✅ **CLEAN CODEBASE**: Removed unused build artifacts and internal references
- ✅ **DOCUMENTATION**: Simplified for public consumption, removed internal endpoints

## Current Status
- ✅ API key-only authentication implemented (no login flow)
- ✅ S3 upload with temporary credentials working (hidden from public docs)
- ✅ Upload notification working
- ✅ Analysis link display implemented
- ✅ Public documentation completed
- ✅ Security compliance audit passed
- ✅ Released v2.2.2 with all improvements

## Key Files
- `src/index.ts` - Main action implementation
- `src/types.ts` - TypeScript interfaces  
- `src/s3-uploader.ts` - S3 upload logic with retry and memory management
- `src/github-client.ts` - GitHub API client
- `src/utils/input-validator.ts` - Comprehensive input validation with security checks
- `src/utils/http-client.ts` - HTTP client with retry logic and sanitized logging
- `src/utils/error-handler.ts` - Centralized error handling with data sanitization
- `action.yml` - Action metadata (cleaned for public use)
- `README.md` - Public documentation (fully sanitized)

## Authentication Flow (Internal Implementation)
Uses X-API-Key header authentication:
1. Get S3 credentials: `GET /api/upload/cloud/credentials`
2. Upload logs to S3 using temporary credentials
3. Notify completion: `POST /api/upload/uploaded`
4. Display analysis URL: `https://app.hycos.ai/ci-analysis/{analysisId}`

## API Endpoints (Internal)
- Base URL: `https://grgikf0un8.execute-api.us-east-1.amazonaws.com/dev2`
- Credentials: `GET /api/upload/cloud/credentials` ✅
- Upload Notification: `POST /api/upload/uploaded` ✅

## Public Usage (v2.2.2)
```yaml
- name: Hycos AI Analysis
  uses: hycos-ai/github-action@v2.2.2
  with:
    api-key: ${{ secrets.HYCOS_API_KEY }}
```

## Security Features Implemented
- **Input Validation**: Comprehensive validation with security pattern detection
- **API Key Protection**: Validates format, rejects test/dummy keys
- **HTTPS Enforcement**: Only allows HTTPS endpoints
- **Data Sanitization**: Removes sensitive info from logs and errors
- **Error Handling**: Sanitized error messages prevent data leakage
- **Memory Management**: Adaptive concurrency and memory cleanup
- **Retry Logic**: Exponential backoff with jitter
- **Secure Headers**: Proper authentication and content-type headers

## Recent Releases
- **v2.2.2** (Latest) - Remove Internal References
- **v2.2.1** - Documentation Cleanup  
- **v2.2.0** - Enhanced Security & Public Visibility

## Development Commands
```bash
# Install dependencies
npm ci --no-audit --no-fund

# Build action
npm run package

# Run tests
npm test

# Lint code
npm run lint

# Create release
npm version [patch|minor|major]
git push --tags
gh release create v2.x.x --title "Release Title" --notes "Release notes"
```

## Important Notes for Continued Development
1. **Security First**: Always validate inputs and sanitize outputs
2. **Public Documentation**: Keep README free of internal implementation details
3. **No Secrets**: Never commit API keys or credentials
4. **Enterprise Standards**: Maintain SOC 2 compliance features
5. **User Experience**: Focus on simple, clear configuration for end users
6. **Versioning**: Use semantic versioning for releases

## Files to Never Commit
- `.secrets` (removed for security)
- Any files containing actual API keys or credentials
- Internal configuration files
- Debug logs with sensitive data

## Current Working State
- Main branch is clean and up-to-date
- All security issues resolved
- Public documentation complete
- Ready for external users
- v2.2.2 released and available on GitHub Marketplace

## Next Steps (If Needed)
- Monitor user feedback and issues
- Add any requested features while maintaining security
- Update documentation based on user needs  
- Maintain compatibility with GitHub Actions standards