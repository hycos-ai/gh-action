# Build Log Analyzer GitHub Action

A powerful GitHub Action that automatically downloads build logs, uploads them securely to AWS S3, and analyzes them for issues and optimization opportunities.

## ✨ Features

- 📥 **Download Logs**: Automatically fetches logs from GitHub workflow runs
- ☁️ **Secure S3 Upload**: Uploads logs to AWS S3 with encryption and organized structure
- 🔍 **Log Analysis**: Analyzes logs for common issues, errors, and improvement opportunities
- 🎯 **Issue Detection**: Identifies build failures, warnings, deprecated features, and more
- 💡 **Solution Recommendations**: Provides actionable solutions for discovered issues
- 📊 **Progress Tracking**: Shows real-time progress during analysis
- 🔌 **API Integration**: Supports custom analysis API endpoints (commented out by default)
- 🎨 **Rich Output**: Beautiful, organized results with emojis and severity levels

## 🚀 Quick Start

### 1. Prerequisites

- AWS S3 bucket for log storage
- GitHub repository with Actions enabled
- Required secrets configured in your repository

### 2. Required Secrets

Add these secrets to your repository settings:

```
AWS_ACCESS_KEY_ID        # Your AWS access key
AWS_SECRET_ACCESS_KEY    # Your AWS secret key  
S3_BUCKET_NAME          # Name of your S3 bucket
ANALYSIS_API_ENDPOINT   # (Optional) Custom analysis API endpoint
```

### 3. Basic Usage

```yaml
name: Build Log Analysis

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  analyze-logs:
    runs-on: ubuntu-latest
    if: always() # Run even if other jobs fail
    steps:
      - uses: your-username/build-log-analyzer-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: 'us-east-1'
          s3-bucket: ${{ secrets.S3_BUCKET_NAME }}
```

## 📋 Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for accessing workflow runs | ✅ | |
| `aws-access-key-id` | AWS Access Key ID for S3 upload | ✅ | |
| `aws-secret-access-key` | AWS Secret Access Key for S3 upload | ✅ | |
| `aws-region` | AWS region for S3 bucket | ✅ | `us-east-1` |
| `s3-bucket` | S3 bucket name for log storage | ✅ | |
| `s3-key-prefix` | S3 key prefix for organizing logs | ❌ | `build-logs` |
| `workflow-run-id` | Specific workflow run ID to analyze | ❌ | Current run |
| `analysis-api-endpoint` | Custom API endpoint for analysis | ❌ | |
| `analysis-timeout` | Analysis timeout in seconds | ❌ | `300` |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `s3-url` | S3 URL where logs were uploaded |
| `analysis-status` | Status of the analysis (success, failed, timeout) |
| `issues-found` | Number of issues found in the analysis |
| `analysis-results` | JSON string containing detailed analysis results |

## 🔧 Advanced Configuration

### Custom API Integration

To use your own analysis API, uncomment and modify the relevant sections in `src/analysis-client.ts`:

```typescript
// Uncomment and modify this section:
const requestPayload = {
  workflowInfo,
  logs: logs.map(log => ({
    jobName: log.jobName,
    jobId: log.jobId,
    timestamp: log.timestamp,
    s3Url: s3Results.find(result => 
      result.key.includes(log.jobName.replace(/[^a-zA-Z0-9-_]/g, '_'))
    )?.location,
  })),
  metadata: {
    repository: workflowInfo.repository,
    timestamp: new Date().toISOString(),
    s3Bucket: s3Results[0]?.bucket,
  }
};

const response = await axios.post(this.apiEndpoint, requestPayload, {
  timeout: this.timeout,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.API_TOKEN}`,
  },
});
```

### S3 Organization Structure

Logs are organized in S3 as follows:
```
s3://your-bucket/
├── build-logs/
│   ├── 2024-01-15/
│   │   ├── 12345678/          # Workflow Run ID
│   │   │   ├── build_*.log    # Individual job logs
│   │   │   └── consolidated_*.log  # Combined log file
│   │   └── 12345679/
│   └── 2024-01-16/
```

## 🎯 Issue Detection

The action automatically detects various types of issues:

### 🔴 Critical Issues
- Build failures
- Deployment errors
- Security vulnerabilities

### 🟠 High Priority
- Test failures
- Compilation errors
- Missing dependencies

### 🟡 Medium Priority  
- Build warnings
- Performance issues
- Code quality concerns

### 🟢 Low Priority
- Deprecated feature usage
- Style/formatting issues
- Minor optimizations

## 🛠️ Development

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the action:
   ```bash
   npm run build
   ```

4. Package for distribution:
   ```bash
   npm run package
   ```

### Testing

Run tests with:
```bash
npm test
```

Run linting:
```bash
npm run lint
```

Format code:
```bash
npm run format
```

### Project Structure

```
├── src/
│   ├── index.ts              # Main entry point
│   ├── types.ts              # TypeScript interfaces
│   ├── github-client.ts      # GitHub API client
│   ├── s3-uploader.ts        # AWS S3 upload logic
│   └── analysis-client.ts    # Analysis and API integration
├── .github/workflows/
│   └── example-usage.yml     # Example workflow
├── dist/                     # Compiled output
├── action.yml               # Action metadata
├── package.json
└── README.md
```

## 🔐 Security

- All AWS credentials are handled securely through GitHub secrets
- S3 uploads use server-side encryption (AES256)
- No sensitive data is logged or exposed
- API calls include proper authentication headers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♀️ Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/your-username/build-log-analyzer-action/issues) page
2. Create a new issue with detailed information
3. Include your workflow configuration and error logs

## 🎉 Examples

### Complete Workflow with PR Comments

```yaml
name: Build and Analyze

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm test

  analyze:
    runs-on: ubuntu-latest
    needs: [build]
    if: always()
    steps:
      - uses: your-username/build-log-analyzer-action@v1
        id: analysis
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: 'us-east-1'
          s3-bucket: ${{ secrets.S3_BUCKET_NAME }}
          
      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const results = JSON.parse(`${{ steps.analysis.outputs.analysis-results }}`);
            const issuesFound = ${{ steps.analysis.outputs.issues-found }};
            
            const body = issuesFound > 0 
              ? `🔍 Found ${issuesFound} issues in build logs. [View details](${{ steps.analysis.outputs.s3-url }})`
              : `✅ No issues found in build logs!`;
              
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

---

Made with ❤️ for better CI/CD workflows 