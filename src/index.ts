import * as core from '@actions/core';
import { GitHubClient } from './github-client';
import { S3Uploader } from './s3-uploader';
import { HttpClient } from './utils/http-client';
import { InputValidator } from './utils/input-validator';
import { ErrorHandler, ValidationError, ApiError } from './utils/error-handler';
import {
  ActionInputs,
  ActionOutputs,
  BuildDetails,
  CloudCredentialsResponse,
  RetryOptions,
  ServerDetails,
  ServerRegistrationRequest,
  ServerRegistrationResponse,
  UploadedFile,
  UploadNotificationRequest,
  UploadNotificationResponse,
} from './types';

const DEFAULT_API_BASE_URL = 'https://grgikf0un8.execute-api.us-east-1.amazonaws.com/dev2';

/**
 * Parse and validate action inputs from environment variables
 * @returns Validated action inputs
 */
function getActionInputs(): ActionInputs {
  try {
    const rawInputs: Partial<ActionInputs> = {
      apiKey: core.getInput('api-key'),
      apiEndpoint: core.getInput('api-endpoint') || DEFAULT_API_BASE_URL,
      githubToken: core.getInput('github-token'),
      workflowRunId: core.getInput('workflow-run-id') || undefined,
      retryAttempts: parseInt(core.getInput('retry-attempts') || '3', 10),
      retryDelay: parseInt(core.getInput('retry-delay') || '2', 10),
      s3LogPath: core.getInput('s3-log-path'),
    };

    return InputValidator.validateInputs(rawInputs);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Failed to parse action inputs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Set GitHub Action outputs for downstream consumption
 * @param outputs - The action outputs to set
 * @example
 * ```typescript
 * setActionOutputs({
 *   analysisUrl: 'https://app.hycos.ai/ci-analysis/12345',
 *   analysisId: '12345',
 *   uploadStatus: 'success',
 *   filesUploaded: 3,
 *   s3Url: 's3://bucket/path/to/logs',
 *   notificationStatus: 'success'
 * });
 * ```
 */
function setActionOutputs(outputs: ActionOutputs): void {
  core.setOutput('analysis-url', outputs.analysisUrl);
  core.setOutput('analysis-id', outputs.analysisId);
  core.setOutput('upload-status', outputs.uploadStatus);
  core.setOutput('files-uploaded', outputs.filesUploaded.toString());
  core.setOutput('s3-url', outputs.s3Url);
  core.setOutput('notification-status', outputs.notificationStatus);
}

/**
 * Display content in a simple format
 */
function displayInfo(title: string, content: string): void {
  core.info(`🔍 ${title}: ${content}`);
}

/**
 * Display the analysis link in logs and GitHub job summary
 */
async function displayAnalysisLink(link: string): Promise<void> {
  core.info(`🔗 HycosAI Analysis: ${link}`);

  // Job summary section
  try {
    await core.summary
      .addHeading('HycosAI Analysis')
      .addLink('Open in HycosAI', link)
      .write();
  } catch (err) {
    core.debug(`Failed to write summary: ${err instanceof Error ? err.message : String(err)}`);
  }

  core.setOutput('analysis-url', link);
}

/**
 * Display build metadata
 */
async function displayBuildMetadata(workflowRun: {
  id: number;
  name: string;
  repository: { full_name: string; html_url: string };
}): Promise<void> {
  const env = process.env;
  core.info(`📦 Repository: ${workflowRun.repository.full_name}`);
  core.info(`📦 Workflow: ${workflowRun.name} (Run ${env.GITHUB_RUN_NUMBER || workflowRun.id})`);
  core.info(`📦 Commit: ${env.GITHUB_SHA?.slice(0, 8) || 'unknown'}`);
  core.info(`📦 Branch: ${env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || 'unknown'}`);
}

/**
 * Register CI server with Hycos API using API key
 * @param httpClient - HTTP client instance
 * @param apiEndpoint - API base endpoint
 * @param apiKey - API authentication key  
 * @param serverAddress - Server address
 * @param serverType - Type of CI server
 * @returns Server registration response
 */
async function registerServer(
  httpClient: HttpClient,
  apiEndpoint: string,
  apiKey: string,
  serverAddress: string,
  serverType: 'GITHUB_ACTIONS'
): Promise<ServerRegistrationResponse> {
  try {
    core.info('🔍 Registering CI server');

    const payload: ServerRegistrationRequest = {
      serverAddress,
      type: serverType,
    };

    const response = await httpClient.post<ServerRegistrationResponse>(
      '/build/server',
      payload,
      { headers: HttpClient.createAuthHeaders(apiKey) }
    );

    core.info('✅ Server registered successfully');
    return response;
  } catch (error) {
    throw new ApiError(
      `Server registration failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof ApiError ? error.status : undefined
    );
  }
}

/**
 * Get cloud credentials from Hycos API using API key
 * @param httpClient - HTTP client instance
 * @param apiKey - API authentication key
 * @returns Cloud credentials response
 */
async function getCloudCredentials(
  httpClient: HttpClient,
  apiKey: string
): Promise<CloudCredentialsResponse> {
  try {
    core.info('🔑 Getting cloud credentials');

    const response = await httpClient.get<CloudCredentialsResponse>(
      '/api/upload/cloud/credentials',
      { headers: HttpClient.createAuthHeaders(apiKey) }
    );

    if (!response.bucket || response.bucket.trim() === '') {
      throw new ApiError('Cloud credentials response missing required bucket name');
    }

    core.info('✅ Cloud credentials received');
    return response;
  } catch (error) {
    throw new ApiError(
      `Failed to get cloud credentials: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof ApiError ? error.status : undefined
    );
  }
}

/**
 * Notify Hycos API about upload completion using API key
 * @param httpClient - HTTP client instance
 * @param apiKey - API authentication key
 * @param uploadedFiles - List of uploaded files
 * @param buildDetails - Build metadata
 * @param serverDetails - Server information
 * @returns Upload notification response
 */
async function notifyUploadComplete(
  httpClient: HttpClient,
  apiKey: string,
  uploadedFiles: UploadedFile[],
  buildDetails: BuildDetails,
  serverDetails: ServerDetails
): Promise<UploadNotificationResponse> {
  try {
    core.info(`📡 Notifying API about ${uploadedFiles.length} uploaded files`);

    const payload: UploadNotificationRequest = {
      files: uploadedFiles,
      buildDetails,
      serverDetails,
    };

    const response = await httpClient.post<UploadNotificationResponse>(
      '/api/upload/uploaded',
      payload,
      { headers: HttpClient.createAuthHeaders(apiKey) }
    );

    core.info(`✅ Notification sent - Analysis ID: ${response.id}`);
    return response;
  } catch (error) {
    throw new ApiError(
      `Upload notification failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof ApiError ? error.status : undefined
    );
  }
}

/**
 * Main action execution with comprehensive error handling and security
 */
export async function run(): Promise<void> {
  let uploadStatus = 'failed';
  let filesUploaded = 0;
  let notificationStatus = 'failed';
  let s3Url = '';
  let analysisUrl = '';
  let analysisId = '';

  try {
    core.info('🚀 Starting Hycos AI Build Log Uploader Action');

    // Parse and validate inputs
    const inputs = getActionInputs();
    core.info('✅ Inputs validated');

    // Initialize HTTP client
    const httpClient = new HttpClient({
      baseURL: inputs.apiEndpoint,
      timeout: 30000,
      retries: inputs.retryAttempts,
      retryDelay: inputs.retryDelay * 1000,
      maxRetryDelay: 30000,
    });

    // Setup retry options for S3
    const retryOptions: RetryOptions = {
      maxAttempts: inputs.retryAttempts,
      initialDelay: inputs.retryDelay * 1000,
      maxDelay: 30000,
      backoffFactor: 2,
    };

    // Register CI server and validate credentials
    const serverAddress = process.env.GITHUB_SERVER_URL || 'https://github.com';
    await registerServer(httpClient, inputs.apiEndpoint, inputs.apiKey, serverAddress, 'GITHUB_ACTIONS');
    await getCloudCredentials(httpClient, inputs.apiKey);

    // Initialize GitHub client and get workflow info
    const githubClient = new GitHubClient(inputs.githubToken);
    const workflowRun = await githubClient.getWorkflowRun(inputs.workflowRunId);
    core.info(`📋 Workflow: ${workflowRun.name} (${workflowRun.conclusion || workflowRun.status || 'running'})`);

    // Check if we're in act environment for testing
    const isActEnvironment = process.env.ACT === 'true';

    // Skip log upload for successful runs (unless testing)
    const nonFailureConclusions = ['success', 'neutral', 'skipped'];
    if (
      !isActEnvironment &&
      workflowRun.conclusion &&
      nonFailureConclusions.includes(workflowRun.conclusion)
    ) {
      core.info('🏁 Workflow succeeded - skipping log upload');
      setActionOutputs({
        analysisUrl: '',
        analysisId: '',
        s3Url: '',
        uploadStatus: 'skipped',
        filesUploaded: 0,
        notificationStatus: 'skipped',
      });
      return;
    }

    // Display build metadata
    await displayBuildMetadata(workflowRun);

    // Download workflow logs
    const logs = await githubClient.getAllWorkflowLogs(workflowRun.id);
    if (logs.length === 0) {
      core.warning('No logs found for workflow run');
      setActionOutputs({
        analysisUrl: '',
        analysisId: '',
        s3Url: '',
        uploadStatus: 'failed',
        filesUploaded: 0,
        notificationStatus: 'not-attempted',
      });
      return;
    }

    const totalLogSize = logs.reduce((sum, log) => sum + log.content.length, 0);
    core.info(`📄 Processing ${logs.length} log files (${(totalLogSize / 1024 / 1024).toFixed(2)} MB)`);

    // Upload logs to secure storage
    const cloudCredentials = await getCloudCredentials(httpClient, inputs.apiKey);

    const s3Uploader = new S3Uploader(cloudCredentials, retryOptions);
    const uploadResults = await s3Uploader.uploadAllLogs(
      logs,
      workflowRun.id,
      workflowRun.name,
      inputs.s3LogPath
    );

    if (uploadResults.length === 0) {
      throw new Error('Failed to upload any logs');
    }

    uploadStatus = 'success';
    filesUploaded = uploadResults.length;
    s3Url = uploadResults[0]?.location || '';

    core.info(`✅ Uploaded ${uploadResults.length} files`);

    const uploadedFiles: UploadedFile[] = uploadResults.map(result => ({
      filename: result.key,
      fileType: 'LOG' as const,
      bucketName: result.bucket,
    }));

    const buildDetails: BuildDetails = {
      metadata: {
        jobName: workflowRun.name,
        buildNumber: workflowRun.id.toString(),
        repository: workflowRun.repository.full_name,
        branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || 'unknown',
        commit: process.env.GITHUB_SHA || 'unknown',
        buildUrl: workflowRun.html_url,
        triggeredBy: process.env.GITHUB_ACTOR || 'unknown',
        buildStatus: workflowRun.conclusion || 'unknown',
      },
    };

    const serverDetails: ServerDetails = {
      serverAddress: process.env.GITHUB_SERVER_URL || 'https://github.com',
      type: 'GITHUB_ACTIONS' as const,
    };

    const notificationResponse = await notifyUploadComplete(
      httpClient,
      inputs.apiKey,
      uploadedFiles,
      buildDetails,
      serverDetails
    );

    notificationStatus = 'success';

    // Generate analysis URL and display
    analysisId = notificationResponse.id.toString();
    analysisUrl = `https://app.hycos.ai/ci-analysis/${notificationResponse.id}`;

    await displayAnalysisLink(analysisUrl);

    setActionOutputs({
      analysisUrl,
      analysisId,
      s3Url,
      uploadStatus,
      filesUploaded,
      notificationStatus,
    });

    core.info('🎉 Analysis complete!');
  } catch (error) {
    // Use centralized error handling
    try {
      ErrorHandler.handleError(error, 'Action execution');
    } catch (handledError) {
      const errorMessage = handledError instanceof Error ? handledError.message : 'Unknown error';
      core.setFailed(`Action failed: ${errorMessage}`);

      // Set failure outputs
      setActionOutputs({
        analysisUrl,
        analysisId,
        s3Url,
        uploadStatus,
        filesUploaded,
        notificationStatus,
      });

      throw handledError;
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  core.error(`Unhandled promise rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  core.error(`Uncaught exception: ${error.message}`);
  if (error.stack) {
    core.debug(`Exception stack: ${error.stack}`);
  }
  process.exit(1);
});

// Run the action
if (require.main === module) {
  run().catch(error => {
    core.setFailed(`Action execution failed: ${error.message}`);
    process.exit(1);
  });
}
