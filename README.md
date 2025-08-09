# Hycos AI GitHub Action

Automatically upload your GitHub Actions build logs to Hycos AI for intelligent analysis and debugging insights.

## 🚀 Features

- **Automatic Log Upload**: Securely uploads build logs to S3 when builds fail
- **AI-Powered Analysis**: Get intelligent insights about build failures
- **Zero Configuration**: Works out of the box with minimal setup
- **Secure**: Uses temporary AWS credentials and API key authentication
- **Rich Integration**: Displays analysis links in job summaries and outputs

## 📋 Quick Start

1. **Get your Hycos AI API key** from [app.hycos.ai](https://app.hycos.ai)

2. **Add API key to repository secrets**: 
   - Go to Settings → Secrets → Actions
   - Add secret named `HYCOS_API_KEY`

3. **Add to your workflow**:

```yaml
name: Build and Test
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and Test
        run: |
          # Your build commands here
          npm ci
          npm run build
          npm test
      
      # Add Hycos AI analysis (runs on failure)
      - name: Hycos AI Analysis
        if: always() # Run even if previous steps failed
        uses: hycos-ai/github-action@v1
        with:
          api-key: ${{ secrets.HYCOS_API_KEY }}
```

## 🔧 Configuration

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | Hycos AI API key | ✅ Yes | - |
| `api-endpoint` | API endpoint URL | ❌ No | `https://api.hycos.ai` |
| `github-token` | GitHub token | ❌ No | `${{ github.token }}` |
| `workflow-run-id` | Specific run ID to analyze | ❌ No | Current run |
| `retry-attempts` | Number of retry attempts | ❌ No | `3` |
| `retry-delay` | Retry delay in seconds | ❌ No | `2` |
| `s3-log-path` | Custom S3 path prefix | ❌ No | `logs` |

### Outputs

| Output | Description |
|--------|-------------|
| `analysis-url` | Direct link to analysis: `https://app.hycos.ai/ci-analysis/{id}` |
| `analysis-id` | Unique analysis identifier |
| `upload-status` | Upload status (`success`/`failed`) |
| `files-uploaded` | Number of files uploaded |
| `s3-url` | S3 location of uploaded logs |
| `notification-status` | Notification status (`success`/`failed`) |

## 📊 Example with Outputs

```yaml
- name: Hycos AI Analysis
  id: hycos
  if: always()
  uses: hycos-ai/github-action@v1
  with:
    api-key: ${{ secrets.HYCOS_API_KEY }}

- name: Comment on PR
  if: failure() && github.event_name == 'pull_request'
  uses: actions/github-script@v6
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: '🔍 **Build Analysis Available**: ${{ steps.hycos.outputs.analysis-url }}'
      })
```

## 🛡️ Security

- **API Key**: Store in GitHub repository secrets
- **Temporary Credentials**: Uses short-lived AWS credentials
- **No Data Exposure**: No sensitive data logged or exposed
- **Secure Upload**: Server-side encryption (AES256)

## 🔍 How It Works

1. **Detects Build Status**: Only processes failed builds (unless forced)
2. **Downloads Logs**: Securely retrieves build logs via GitHub API
3. **Uploads to S3**: Uses temporary AWS credentials for secure upload
4. **Triggers Analysis**: Notifies Hycos AI backend to start analysis
5. **Displays Results**: Shows analysis link in job summary and outputs

## 💡 Advanced Usage

### Enterprise Setup
```yaml
- uses: hycos-ai/github-action@v1
  with:
    api-key: ${{ secrets.HYCOS_API_KEY }}
    api-endpoint: 'https://your-enterprise.hycos.ai'
    s3-log-path: 'enterprise-logs'
    retry-attempts: 5
```

### Conditional Analysis
```yaml
- uses: hycos-ai/github-action@v1
  if: failure() && github.ref == 'refs/heads/main'
  with:
    api-key: ${{ secrets.HYCOS_API_KEY }}
```

## 📚 Documentation

- [Setup Guide](https://docs.hycos.ai/github-actions)
- [API Documentation](https://docs.hycos.ai/api)
- [Troubleshooting](https://docs.hycos.ai/troubleshooting)

## 🐛 Issues & Support

Found a bug or need help? 
- [Create an issue](https://github.com/hycos-ai/github-action/issues)
- [Contact support](mailto:support@hycos.ai)

## 📄 License

[MIT License](LICENSE) - Copyright © Hycos AI