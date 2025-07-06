# Secure Build Log Uploader GitHub Action

A secure GitHub Action that authenticates with an API, uploads build logs to AWS S3 using temporary credentials, and notifies the backend about successful uploads. Built with SOLID design principles and comprehensive error handling.

## ✨ Features

- 🔐 **API Authentication**: Secure login with username/password credentials
- 📥 **Log Download**: Automatically fetches logs from GitHub workflow runs
- ☁️ **Temporary S3 Credentials**: Uses temporary AWS credentials from API for enhanced security
- 📤 **Secure Upload**: Uploads logs to S3 with encryption and organized structure
- 📢 **Upload Notification**: Notifies backend API about successful uploads
- 🔄 **Retry Logic**: Automatic retry with exponential backoff for failed operations
- 🎯 **Error Handling**: Comprehensive error handling and detailed logging
- 🏗️ **SOLID Design**: Modular architecture with dependency injection

## 🚀 Quick Start

### 1. Prerequisites

- API endpoint supporting the authentication and upload workflow
- GitHub repository with Actions enabled
- Required secrets configured in your repository

### 2. Required Secrets

Add these secrets to your repository settings:

```
UPLOAD_USERNAME         # Username for API authentication
UPLOAD_PASSWORD         # Password for API authentication
API_ENDPOINT           # Base URL for the API (e.g., https://api.example.com)
```

### 3. Basic Usage

```yaml
name: Upload Build Logs

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  upload-logs:
    runs-on: ubuntu-latest
    if: always() # Run even if other jobs fail
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Upload Build Logs
        uses: ./
        with:
          username: ${{ secrets.UPLOAD_USERNAME }}
          password: ${{ secrets.UPLOAD_PASSWORD }}
          api-endpoint: ${{ secrets.API_ENDPOINT }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## 📋 Inputs

| Input             | Description                                    | Required | Default               |
| ----------------- | ---------------------------------------------- | -------- | --------------------- |
| `username`        | Username for API authentication                | ✅       |                       |
| `password`        | Password for API authentication                | ✅       |                       |
| `api-endpoint`    | Base URL for the API endpoints                 | ✅       |                       |
| `github-token`    | GitHub token for accessing workflow runs       | ✅       | `${{ github.token }}` |
| `workflow-run-id` | Specific workflow run ID to analyze            | ❌       | Current run           |
| `retry-attempts`  | Number of retry attempts for failed operations | ❌       | `3`                   |
| `retry-delay`     | Initial delay between retries in seconds       | ❌       | `2`                   |

## 📤 Outputs

| Output                | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `s3-url`              | S3 URL where logs were uploaded                       |
| `upload-status`       | Status of the upload process (success, failed)        |
| `files-uploaded`      | Number of files uploaded                              |
| `auth-status`         | Authentication status (success, failed)               |
| `user-info`           | JSON string containing authenticated user information |
| `notification-status` | Status of the upload notification (success, failed)   |

## 🔄 Workflow Process

The action follows this secure workflow:

1. **Authentication** 🔐
   - Authenticates with API using username/password
   - Receives and stores authentication token

2. **Credential Fetching** ☁️
   - Fetches temporary AWS S3 credentials from API
   - Validates credential expiration

3. **Log Download** 📥
   - Downloads all logs from GitHub workflow run
   - Processes individual job logs

4. **S3 Upload** 📤
   - Uploads logs using temporary credentials
   - Creates consolidated log file
   - Implements retry logic with exponential backoff

5. **Notification** 📢
   - Notifies API about successful upload
   - Includes file details and build information

## 🔧 API Endpoints

The action expects these API endpoints:

### Authentication

```
POST /api/auth/login
```

**Request:**

```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**

```json
{
  "token": "string",
  "type": "string",
  "username": "string",
  "roles": ["string"]
}
```

### Cloud Credentials

```
GET /api/upload/cloud/credentials
```

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "secretAccessKey": "string",
  "accessKeyId": "string",
  "sessionToken": "string",
  "expiration": "string",
  "bucket": "string"
}
```

### Upload Notification

```
POST /api/upload/uploaded
```

**Headers:** `Authorization: Bearer <token>`

**Request:**

```json
{
  "files": [
    {
      "filename": "string",
      "fileType": "LOG",
      "bucketName": "string"
    }
  ],
  "buildDetails": {
    "folder": "string",
    "jobName": "string",
    "buildNumber": 0
  },
  "serverDetails": {
    "serverAddress": "string"
  }
}
```

## 🗂️ S3 Organization Structure

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

## 🔄 Error Handling & Retry Logic

The action implements comprehensive error handling:

### Retry Configuration

- **Max Attempts**: Configurable (default: 3)
- **Initial Delay**: Configurable (default: 2 seconds)
- **Max Delay**: 30 seconds
- **Backoff Factor**: 2x (exponential backoff)

### Error Types Handled

- ✅ Network timeouts and connection issues
- ✅ Authentication token expiration
- ✅ AWS credential expiration
- ✅ Rate limiting (429 errors)
- ✅ Transient server errors (5xx)

### Non-Retryable Errors

- ❌ Invalid credentials (401)
- ❌ Insufficient permissions (403)
- ❌ Invalid request format (400)
- ❌ Resource not found (404)

## 🏗️ SOLID Design Principles

The action follows SOLID principles:

### Single Responsibility

- `AuthClient`: Handles authentication only
- `CredentialsClient`: Manages cloud credentials
- `S3Uploader`: Handles S3 uploads
- `NotificationClient`: Manages API notifications

### Open/Closed

- Extensible through dependency injection
- Interface-based design allows easy swapping of implementations

### Liskov Substitution

- All clients implement consistent interfaces
- Mock implementations available for testing

### Interface Segregation

- Small, focused interfaces per responsibility
- `HttpClient`, `TokenStorage`, `S3Client` interfaces

### Dependency Inversion

- External dependencies injected via constructor
- Easy to test and extend

## 🛠️ Development

### Setup

1. Clone the repository

```bash
git clone <repository-url>
cd secure-build-log-uploader
```

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
│   ├── auth-client.ts        # Authentication logic
│   ├── credentials-client.ts # Cloud credentials management
│   ├── github-client.ts      # GitHub API client
│   ├── s3-uploader.ts        # S3 upload logic
│   └── notification-client.ts # Upload notification logic
├── tests/
│   └── *.test.ts             # Unit tests
├── action.yml                # GitHub Action configuration
└── package.json              # Dependencies and scripts
```

## 🔍 Troubleshooting

### Common Issues

**Authentication Failed**

- ✅ Verify username and password are correct
- ✅ Check API endpoint URL
- ✅ Ensure API service is running

**Upload Failed**

- ✅ Check network connectivity
- ✅ Verify temporary credentials are valid
- ✅ Ensure S3 bucket exists and is accessible

**Notification Failed**

- ✅ Verify authentication token is still valid
- ✅ Check notification endpoint availability
- ✅ Ensure proper permissions for upload notifications

### Debug Information

The action provides detailed logging:

- 📊 Authentication status and user information
- ☁️ Cloud credentials expiration times
- 📤 Upload progress and file counts
- 📢 Notification payload details

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For issues and questions:

1. Check the [troubleshooting section](#-troubleshooting)
2. Review the action logs for detailed error messages
3. Open an issue in the repository
