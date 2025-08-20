# Hycos AI GitHub Action

Automatically upload your GitHub Actions build logs to Hycos AI for intelligent analysis and debugging insights.

## 🚀 Features

- **Automatic Log Upload**: Securely uploads build logs to S3 when builds fail
- **AI-Powered Analysis**: Get intelligent insights about build failures
- **Zero Configuration**: Works out of the box with minimal setup
- **Secure**: Uses temporary AWS credentials and API key authentication
- **Rich Integration**: Displays analysis links in job summaries and outputs

## 📋 Quick Start

1. **Get your Hycos AI API key**:
   - Sign up at [app.hycos.ai](https://app.hycos.ai)
   - Navigate to Settings → API Keys
   - Generate a new API key for GitHub Actions

2. **Add API key to repository secrets**:
   - Go to your repository's Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `HYCOS_API_KEY`
   - Value: Your API key from step 1

3. **Add to your workflow**:

```yaml
name: CI Pipeline
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install Dependencies
        run: npm ci
      
      - name: Run Tests
        run: npm test
      
      - name: Build Project  
        run: npm run build
      
      # Hycos AI analysis runs automatically on failures
      - name: Hycos AI Analysis
        if: always()
        uses: hycos-ai/github-action@v2
        with:
          api-key: ${{ secrets.HYCOS_API_KEY }}
```

## 🔧 Configuration

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | Hycos AI API key from repository secrets | ✅ Yes | - |
| `api-endpoint` | API endpoint URL (for enterprise users) | ❌ No | Auto-configured |
| `github-token` | GitHub token for API access | ❌ No | `${{ github.token }}` |
| `workflow-run-id` | Specific workflow run ID to analyze | ❌ No | Current run |

### Outputs

| Output | Description |
|--------|-------------|
| `analysis-url` | Direct link to analysis: `https://app.hycos.ai/ci-analysis/{id}` |
| `analysis-id` | Unique analysis identifier |
| `upload-status` | Process status (`success`/`failed`) |
| `files-uploaded` | Number of files processed |

## 📊 Example with Outputs

```yaml
- name: Hycos AI Analysis
  id: hycos
  if: always()
  uses: hycos-ai/github-action@v2
  with:
    api-key: ${{ secrets.HYCOS_API_KEY }}

- name: Comment on PR
  if: failure() && github.event_name == 'pull_request'
  uses: actions/github-script@v7
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

- **API Key Protection**: Always store API keys in GitHub repository secrets, never in code
- **Secure Processing**: Uses secure cloud infrastructure for log analysis
- **Data Privacy**: No sensitive data is logged, exposed, or stored permanently
- **Encryption**: End-to-end encryption for all data transmission
- **Access Control**: Fine-grained permissions and audit logging
- **SOC 2 Compliance**: Meets enterprise security standards

## 🔍 How It Works

1. **Detects Build Status**: Only processes failed builds (unless forced)
2. **Retrieves Logs**: Securely accesses build logs via GitHub API
3. **Processes Data**: Sends logs to Hycos AI for intelligent analysis
4. **Triggers Analysis**: Initiates AI-powered log analysis
5. **Displays Results**: Shows analysis link in job summary and outputs

## 💡 Advanced Usage

### Enterprise Setup
```yaml
- uses: hycos-ai/github-action@v2
  with:
    api-key: ${{ secrets.HYCOS_API_KEY }}
    api-endpoint: 'https://your-enterprise.hycos.ai'
```

### Conditional Analysis
```yaml
# Only analyze failed builds on main branch
- uses: hycos-ai/github-action@v2
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