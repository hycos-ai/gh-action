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

const DEFAULT_API_BASE_URL = 'https://api.hycos.ai';

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
 * Generic helper to print a boxed section with a title and content lines
 * Creates a visually appealing box around content for better log readability
 * @param title - The title to display at the top of the box
 * @param lines - Array of content lines to display in the box
 * @example
 * ```typescript
 * printBox('Analysis Results', [
 *   'Status: Complete',
 *   'Issues Found: 3',
 *   'Time: 2.5 seconds'
 * ]);
 * ```
 */
function printBox(title: string, lines: string[]): void {
  const allLines = [title, ...lines];
  const boxWidth = Math.max(
    60,
    ...allLines.map(l => l.length + 2) // extra padding
  );

  const horizontal = '═'.repeat(boxWidth);

  const pad = (text: string): string => {
    return text.padEnd(boxWidth, ' ');
  };

  const titlePadLeft = Math.floor((boxWidth - title.length) / 2);
  const titleLine =
    ' '.repeat(titlePadLeft) + title + ' '.repeat(boxWidth - title.length - titlePadLeft);

  core.info(`╔${horizontal}╗`);
  core.info(`║${titleLine}║`);
  core.info(`╠${horizontal}╣`);
  lines.forEach(l => {
    core.info(`║${pad(l)}║`);
  });
  core.info(`╚${horizontal}╝`);
}

/**
 * Display the analysis link in logs and GitHub job summary
 * @param link - The analysis URL to display
 * @throws {Error} If writing to job summary fails
 * @example
 * ```typescript
 * await displayAnalysisLink('https://app.hycos.ai/ci-analysis/12345');
 * ```
 */
async function displayAnalysisLink(link: string): Promise<void> {
  core.startGroup('🔗 HycosAI Analysis');
  printBox(' HycosAI Analysis ', [`👉  ${link}`]);
  core.endGroup();

  // Job summary section
  try {
    await core.summary
      .addHeading('HycosAI Analysis')
      .addLink('Open in HycosAI', link)
      .addEOL()
      .write();
  } catch (err) {
    core.debug(`Failed to write summary: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Output variable
  core.setOutput('analysis-url', link);
}

/**
 * Collect and display useful build metadata from GitHub environment variables
 * @param workflowRun - The workflow run object containing basic information
 * @param workflowRun.id - The workflow run ID
 * @param workflowRun.name - The workflow name  
 * @param workflowRun.repository - Repository information
 * @throws {Error} If writing to job summary fails
 * @example
 * ```typescript
 * await displayBuildMetadata({
 *   id: 12345,
 *   name: 'CI Build',
 *   repository: {
 *     full_name: 'owner/repo',
 *     html_url: 'https://github.com/owner/repo'
 *   }
 * });
 * ```
 */
async function displayBuildMetadata(workflowRun: {
  id: number;
  name: string;
  repository: { full_name: string; html_url: string };
}): Promise<void> {
  const env = process.env;

  const metadata: Record<string, string | undefined> = {
    Repository: workflowRun.repository.full_name,
    Workflow: workflowRun.name,
    'Run ID': workflowRun.id.toString(),
    'Run Number': env.GITHUB_RUN_NUMBER,
    'Run Attempt': env.GITHUB_RUN_ATTEMPT,
    'Commit SHA': env.GITHUB_SHA,
    Ref: env.GITHUB_REF,
    Branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME,
    Actor: env.GITHUB_ACTOR,
    Event: env.GITHUB_EVENT_NAME,
    Job: env.GITHUB_JOB,
  };

  // Prepare formatted lines and print inside a box
  const metaLines = Object.entries(metadata)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);

  core.startGroup('📦 Build Metadata');
  printBox(' Build Metadata ', metaLines);
  core.endGroup();

  // Add to job summary
  try {
    const tableRows = Object.entries(metadata)
      .filter(([, v]) => v)
      .map(([k, v]) => [k, v as string]);

    await core.summary.addHeading('Build Metadata').addTable(tableRows).addEOL().write();
  } catch (err) {
    core.debug(
      `Failed to write build metadata summary: ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
    core.startGroup('🔍 Server Registration');
    core.info(`📡 Registering server: ${serverAddress}`);
    core.info(`📡 Server type: ${serverType}`);
    core.endGroup();

    const payload: ServerRegistrationRequest = {
      serverAddress,
      type: serverType,
    };

    const response = await httpClient.post<ServerRegistrationResponse>(
      '/build/server',
      payload,
      { headers: HttpClient.createAuthHeaders(apiKey) }
    );

    core.info('✅ Server registration successful');
    if (response.serverId) {
      core.info(`📋 Server ID: ${response.serverId}`);
    }

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
    core.info('🔑 Requesting temporary cloud credentials');

    const response = await httpClient.get<CloudCredentialsResponse>(
      '/api/upload/cloud/credentials',
      { headers: HttpClient.createAuthHeaders(apiKey) }
    );

    // Log success without exposing credentials
    core.info('✅ Cloud credentials received successfully');
    core.info(`  - Bucket configured: ${response.bucket ? 'Yes' : 'No'}`);
    if (response.bucket) {
      core.info(`  - Bucket name: ${response.bucket}`);
    }
    core.info(`  - Credentials expire: ${response.expiration ? 'Yes' : 'No'}`);
    
    // Validate that bucket is provided
    if (!response.bucket || response.bucket.trim() === '') {
      throw new ApiError('Cloud credentials response missing required bucket name');
    }

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
    core.startGroup('📢 Upload Notification');
    core.info(`📡 Notifying API about ${uploadedFiles.length} uploaded files`);
    core.info(`📡 Build: ${buildDetails.metadata.jobName}`);
    core.info(`📡 Repository: ${buildDetails.metadata.repository}`);
    core.endGroup();

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

    core.info('✅ Upload notification sent successfully');
    core.info(`📋 Analysis ID: ${response.id}`);
    core.info(`📋 Analysis Name: ${response.name}`);
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

    // Step 1: Parse and validate inputs with comprehensive validation
    core.startGroup('📝 Input Validation');
    const inputs = getActionInputs();
    core.info('✅ All action inputs validated successfully');
    core.info(`  - API Endpoint: ${inputs.apiEndpoint}`);
    core.info(`  - Retry Attempts: ${inputs.retryAttempts}`);
    core.info(`  - Retry Delay: ${inputs.retryDelay}s`);
    core.info(`  - S3 Log Path: ${inputs.s3LogPath}`);
    core.endGroup();

    // Step 2: Initialize HTTP client with timeout and retry logic
    const httpClient = new HttpClient({
      baseURL: inputs.apiEndpoint,
      timeout: 30000, // 30 seconds
      retries: inputs.retryAttempts,
      retryDelay: inputs.retryDelay * 1000,
      maxRetryDelay: 30000,
    });

    // Step 3: Setup retry options for S3
    const retryOptions: RetryOptions = {
      maxAttempts: inputs.retryAttempts,
      initialDelay: inputs.retryDelay * 1000,
      maxDelay: 30000,
      backoffFactor: 2,
    };

    // Step 4: Register CI server with Hycos API
    const serverAddress = process.env.GITHUB_SERVER_URL || 'https://github.com';
    await registerServer(
      httpClient,
      inputs.apiEndpoint,
      inputs.apiKey,
      serverAddress,
      'GITHUB_ACTIONS'
    );

    // Step 5: Validate API key with cloud credentials
    await getCloudCredentials(httpClient, inputs.apiKey);

    // Step 6: Initialize GitHub client
    core.startGroup('🐙 Initializing GitHub client');
    const githubClient = new GitHubClient(inputs.githubToken);
    core.info('✅ GitHub client initialized successfully');
    core.endGroup();

    // Step 7: Get workflow information
    core.startGroup('📋 Fetching workflow information');
    const workflowRun = await githubClient.getWorkflowRun(inputs.workflowRunId);
    core.info(`Workflow: ${workflowRun.name}`);
    core.info(`Run ID: ${workflowRun.id}`);
    core.info(`Status: ${workflowRun.status || 'Unknown'}`);
    core.info(`Conclusion: ${workflowRun.conclusion || 'N/A'}`);
    core.endGroup();

    // Check if we're in act environment for testing
    const isActEnvironment = process.env.ACT === 'true';

    // Exit early only when the run completed without failures
    const nonFailureConclusions = ['success', 'neutral', 'skipped'];
    if (
      !isActEnvironment &&
      workflowRun.conclusion &&
      nonFailureConclusions.includes(workflowRun.conclusion)
    ) {
      core.info('🏁 Workflow concluded without failures – skipping log upload.');
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

    if (isActEnvironment) {
      core.info('🧪 Act environment detected – proceeding with full flow for testing');
    }

    // Display extra metadata (will include env vars only present on real GitHub runners)
    await displayBuildMetadata(workflowRun);

    // Step 7: Download GitHub logs
    core.startGroup('📥 Downloading build logs');
    const logs = await githubClient.getAllWorkflowLogs(workflowRun.id);

    if (logs.length === 0) {
      core.warning('No logs found for this workflow run');
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

    core.info(`📄 Downloaded ${logs.length} log files`);
    const totalLogSize = logs.reduce((sum, log) => sum + log.content.length, 0);
    core.info(`📊 Total log size: ${(totalLogSize / 1024 / 1024).toFixed(2)} MB`);
    core.endGroup();

    // Step 8: Get cloud credentials and upload logs to S3
    core.startGroup('☁️ Getting cloud credentials and uploading to S3');
    const cloudCredentials = await getCloudCredentials(httpClient, inputs.apiKey);

    const s3Uploader = new S3Uploader(cloudCredentials, retryOptions);
    const uploadResults = await s3Uploader.uploadAllLogs(
      logs,
      workflowRun.id,
      workflowRun.name,
      inputs.s3LogPath
    );

    if (uploadResults.length === 0) {
      throw new Error('Failed to upload any logs to S3');
    }

    uploadStatus = 'success';
    filesUploaded = uploadResults.length;
    s3Url = uploadResults[0]?.location || '';

    core.info(`✅ Successfully uploaded ${uploadResults.length} files to S3`);
    core.info(`📍 Primary S3 URL: ${s3Url}`);
    core.endGroup();

    // Step 9: Notify API about successful upload
    core.startGroup('📢 Notifying API about upload completion');

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

    // Handle new API response format (id and name fields)
    analysisId = notificationResponse.id.toString();
    analysisUrl = `https://app.hycos.ai/ci-analysis/${notificationResponse.id}`;

    core.info('✅ Successfully notified API about upload completion');
    core.info(`🔍 Analysis ID: ${analysisId}`);
    core.endGroup();

    // Display the analysis UI link
    await displayAnalysisLink(analysisUrl);

    // Step 10: Set success outputs
    setActionOutputs({
      analysisUrl,
      analysisId,
      s3Url,
      uploadStatus,
      filesUploaded,
      notificationStatus,
    });

    core.info('🎉 Secure Build Log Uploader completed successfully!');
    core.info(`📊 Summary: ${filesUploaded} files uploaded and API notified`);
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
