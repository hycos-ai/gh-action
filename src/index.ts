import * as core from '@actions/core';
import axios from 'axios';
import { GitHubClient } from './github-client';
import { S3Uploader } from './s3-uploader';
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
 * Parse action inputs from environment variables
 */
function getActionInputs(): ActionInputs {
  return {
    apiKey: core.getInput('api-key', { required: true }),
    apiEndpoint: core.getInput('api-endpoint', { required: false }) || DEFAULT_API_BASE_URL,
    githubToken: core.getInput('github-token', { required: true }),
    workflowRunId: core.getInput('workflow-run-id') || undefined,
    retryAttempts: parseInt(core.getInput('retry-attempts') || '3', 10),
    retryDelay: parseInt(core.getInput('retry-delay') || '2', 10),
    s3LogPath: core.getInput('s3-log-path') || 'logs',
  };
}

/**
 * Set action outputs
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
 * Print analysis link in logs and job summary, and set as output
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
 * Collect and display useful build metadata from GitHub environment variables and the workflowRun object
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
 */
async function registerServer(
  apiEndpoint: string,
  apiKey: string,
  serverAddress: string,
  serverType: 'GITHUB_ACTIONS'
): Promise<ServerRegistrationResponse> {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const payload: ServerRegistrationRequest = {
    serverAddress,
    type: serverType,
  };

  const url = `${apiEndpoint}/build/server`;

  // Redact sensitive data in logs
  core.startGroup('🔍 Server Registration Request');
  core.info(`📡 Request Method: POST`);
  core.info(`📡 Request URL: ${url}`);
  core.endGroup();

  try {
    const response = await axios.post<ServerRegistrationResponse>(url, payload, { headers });

    core.startGroup('🔍 Server Registration Response');
    core.info(`📡 Response Status: ${response.status}`);
    core.info(`📡 Response Status Text: ${response.statusText}`);
    core.endGroup();

    return response.data;
  } catch (error: any) {
    core.startGroup('🔍 Server Registration Error');
    core.error(`📡 Server registration failed: ${error.message}`);
    if (error.response) {
      core.error(`📡 Error Status: ${error.response.status}`);
      core.error(`📡 Error Data: [redacted]`);
    }
    core.endGroup();
    throw error;
  }
}

/**
 * Get cloud credentials from Hycos API using API key
 */
async function getCloudCredentials(
  apiEndpoint: string,
  apiKey: string
): Promise<CloudCredentialsResponse> {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const url = `${apiEndpoint}/api/upload/cloud/credentials`;
  core.info(`🌐 Making API call to: ${url}`);
  // Do not print API keys

  const response = await axios.get<CloudCredentialsResponse>(url, { headers });

  core.info(`📡 API Response status: ${response.status}`);
  core.info(`📡 API Response data: ${JSON.stringify(response.data, null, 2)}`);

  return response.data;
}

/**
 * Notify Hycos API about upload completion using API key
 */
async function notifyUploadComplete(
  apiEndpoint: string,
  apiKey: string,
  uploadedFiles: UploadedFile[],
  buildDetails: BuildDetails,
  serverDetails: ServerDetails
): Promise<UploadNotificationResponse | number | string> {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const payload: UploadNotificationRequest = {
    files: uploadedFiles,
    buildDetails,
    serverDetails,
  };

  const url = `${apiEndpoint}/api/upload/uploaded`;

  // Redact sensitive request data
  core.startGroup('🔍 Upload Notification Request');
  core.info(`📡 Request Method: POST`);
  core.info(`📡 Request URL: ${url}`);
  core.endGroup();

  try {
    const response = await axios.post<UploadNotificationResponse>(url, payload, {
      headers,
      // Add response interceptor for full debugging
      transformResponse: [
        data => {
          // Parse if possible; avoid logging raw data
          try {
            return JSON.parse(data);
          } catch {
            const numericId = parseInt(data);
            return isNaN(numericId) ? data : numericId;
          }
        },
      ],
    });

    // Minimal response logging
    core.info(`📡 Response Status: ${response.status}`);

    // Check if response has expected structure
    if (typeof response.data === 'object' && response.data !== null) {
      core.info(`📡 Response Properties:`);
      Object.keys(response.data).forEach(key => {
        core.info(`  - ${key}: ${JSON.stringify((response.data as any)[key])}`);
      });
    }

    // Special handling for HTTP 201 status (Java endpoint)
    if (response.status === 201) {
      core.info(`📡 HTTP 201 detected - Java endpoint response`);
      const locationHeader = response.headers['location'] || response.headers['Location'];
      if (locationHeader) {
        core.info(`📡 Location header: ${locationHeader}`);
        // Extract ID from Location header like "/api/upload/build/12345"
        const idMatch = locationHeader.match(/\/(\d+)$/);
        if (idMatch) {
          const extractedId = idMatch[1];
          core.info(`📡 Extracted ID from Location header: ${extractedId}`);
          (response as any).data = parseInt(extractedId);
          core.info(`📡 Converted response data to numeric ID: ${response.data}`);
        }
      }
    }

    core.endGroup();

    return response.data;
  } catch (error: any) {
    core.startGroup('🔍 VERBOSE DEBUG - Upload Notification Error');
    core.error(`📡 Error Type: ${error.constructor.name}`);
    core.error(`📡 Error Message: ${error.message}`);

    if (error.response) {
      core.error(`📡 Error Response Status: ${error.response.status}`);
      core.error(`📡 Error Response Status Text: ${error.response.statusText}`);
      core.error(`📡 Error Response Headers:`);
      Object.entries(error.response.headers || {}).forEach(([key, value]) => {
        core.error(`  ${key}: ${value}`);
      });
      core.error(`📡 Error Response Data Type: ${typeof error.response.data}`);
      core.error(`📡 Error Response Data: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      core.error(`📡 Request was made but no response received`);
      core.error(`📡 Request details: ${JSON.stringify(error.request, null, 2)}`);
    } else {
      core.error(`📡 Error in request setup: ${error.message}`);
    }

    if (error.config) {
      core.error(`📡 Request Config:`);
      core.error(`  URL: ${error.config.url}`);
      core.error(`  Method: ${error.config.method}`);
      core.error(`  Headers: ${JSON.stringify(error.config.headers, null, 2)}`);
      core.error(`  Data: ${JSON.stringify(error.config.data, null, 2)}`);
    }
    core.endGroup();

    throw error;
  }
}

/**
 * Main action execution following the specified flow
 */
async function run(): Promise<void> {
  let uploadStatus = 'failed';
  let filesUploaded = 0;
  let notificationStatus = 'failed';
  let s3Url = '';
  let analysisUrl = '';
  let analysisId = '';

  try {
    core.info('🚀 Starting Hycos AI Build Log Uploader Action');

    // Step 1: Parse and validate inputs
    const inputs = getActionInputs();
    core.info('✅ Action inputs validated');

    // Step 2: Setup retry options
    const retryOptions: RetryOptions = {
      maxAttempts: inputs.retryAttempts,
      initialDelay: inputs.retryDelay * 1000, // Convert to milliseconds
      maxDelay: 30000, // 30 seconds max delay
      backoffFactor: 2,
    };

    // Step 3: Register CI server with Hycos API
    core.startGroup('🏗️ Registering CI server');
    try {
      const serverAddress = process.env.GITHUB_SERVER_URL || 'https://github.com';
      const registrationResponse = await registerServer(
        inputs.apiEndpoint,
        inputs.apiKey,
        serverAddress,
        'GITHUB_ACTIONS'
      );
      core.info('✅ CI server registered successfully');
      if (registrationResponse.serverId) {
        core.info(`📋 Server ID: ${registrationResponse.serverId}`);
      }
    } catch (error) {
      throw new Error(
        `Server registration failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    core.endGroup();

    // Step 4: Validate API key with cloud credentials
    core.startGroup('🔐 Validating API key');
    try {
      await getCloudCredentials(inputs.apiEndpoint, inputs.apiKey);
      core.info('✅ API key validated successfully');
    } catch (error) {
      throw new Error(
        `API key validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    core.endGroup();

    // Step 5: Initialize GitHub client
    core.startGroup('🐙 Initializing GitHub client');
    const githubClient = new GitHubClient(inputs.githubToken);
    core.info('✅ GitHub client initialized');
    core.endGroup();

    // Step 6: Get workflow information
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
    const cloudCredentials = await getCloudCredentials(inputs.apiEndpoint, inputs.apiKey);

    // Debug: Print credentials details (safely)
    core.info(`🔑 Received temporary cloud credentials`);
    core.info(`  - Bucket: ${cloudCredentials.bucket ? '[redacted]' : 'undefined'}`);
    core.info(`  - Expiration: ${cloudCredentials.expiration ? '[redacted]' : 'undefined'}`);

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
      inputs.apiEndpoint,
      inputs.apiKey,
      uploadedFiles,
      buildDetails,
      serverDetails
    );

    notificationStatus = 'success';

    // Handle different response types from the backend
    if (typeof notificationResponse === 'number') {
      // Java backend returns numeric buildDetailsId
      analysisId = notificationResponse.toString();
      analysisUrl = `https://app.hycos.ai/ci-analysis/${notificationResponse}`;
      core.info(`📡 Constructed analysis URL from numeric ID: ${analysisUrl}`);
    } else if (typeof notificationResponse === 'object' && notificationResponse !== null) {
      // Standard JSON response format
      const responseObj = notificationResponse as UploadNotificationResponse;
      analysisId = responseObj.analysisId || '';
      analysisUrl = responseObj.analysisUrl || '';
    } else {
      // Fallback for other response types
      core.warning(`📡 Unexpected response type: ${typeof notificationResponse}`);
      analysisId = 'unknown';
      analysisUrl = '';
    }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
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

    // Log error details for debugging
    core.error(`❌ Action failed with error: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      core.debug(`Error stack: ${error.stack}`);
    }

    // Provide helpful troubleshooting information
    core.startGroup('🔍 Troubleshooting Information');
    core.info('Please check the following:');
    core.info('• API endpoint is correct and accessible');
    core.info('• API key is valid and has proper permissions');
    core.info('• GitHub token has necessary permissions');
    core.info('• Network connectivity is stable');
    core.info('• API service is operational');
    core.endGroup();

    throw error;
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
