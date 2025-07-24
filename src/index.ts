import * as core from '@actions/core';
import axios from 'axios';
import { AuthClient } from './auth-client';
import { CredentialsClient } from './credentials-client';
import { GitHubClient } from './github-client';
import { NotificationClient } from './notification-client';
import { S3Uploader } from './s3-uploader';
import { ActionInputs, ActionOutputs, RetryOptions } from './types';

const DEFAULT_API_BASE_URL = 'https://55k1jx7y6e.execute-api.us-east-1.amazonaws.com/dev/api';

/**
 * Parse action inputs from environment variables
 */
function getActionInputs(): ActionInputs {
  return {
    username: core.getInput('username', { required: true }),
    password: core.getInput('password', { required: true }),
    apiEndpoint: core.getInput('api-endpoint', { required: false }) || DEFAULT_API_BASE_URL,
    githubToken: core.getInput('github-token', { required: true }),
    workflowRunId: core.getInput('workflow-run-id') || undefined,
    retryAttempts: parseInt(core.getInput('retry-attempts') || '3', 10),
    retryDelay: parseInt(core.getInput('retry-delay') || '2', 10),
  };
}

/**
 * Set action outputs
 */
function setActionOutputs(outputs: ActionOutputs): void {
  core.setOutput('s3-url', outputs.s3Url);
  core.setOutput('upload-status', outputs.uploadStatus);
  core.setOutput('files-uploaded', outputs.filesUploaded.toString());
  core.setOutput('auth-status', outputs.authStatus);
  core.setOutput('user-info', outputs.userInfo);
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
 * Main action execution following the specified flow
 */
async function run(): Promise<void> {
  let authStatus = 'failed';
  let userInfo = '';
  let uploadStatus = 'failed';
  let filesUploaded = 0;
  let notificationStatus = 'failed';
  let s3Url = '';

  try {
    core.info('🚀 Starting Secure Build Log Uploader Action');

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

    // Step 3: Initialize HTTP client wrapper
    const httpClient = {
      get: async <T>(url: string, config?: any): Promise<T> => {
        const response = await axios.get<T>(url, config);
        return response.data;
      },
      post: async <T>(url: string, data?: any, config?: any): Promise<T> => {
        const response = await axios.post<T>(url, data, config);
        return response.data;
      },
      put: async <T>(url: string, data?: any, config?: any): Promise<T> => {
        const response = await axios.put<T>(url, data, config);
        return response.data;
      },
      delete: async <T>(url: string, config?: any): Promise<T> => {
        const response = await axios.delete<T>(url, config);
        return response.data;
      },
    };

    // Step 4: Authenticate with the API
    core.startGroup('🔐 Authenticating with API');
    const authClient = new AuthClient(inputs.apiEndpoint, undefined, httpClient, retryOptions);

    const authResponse = await authClient.login(inputs.username, inputs.password);
    authStatus = 'success';
    userInfo = JSON.stringify({
      username: authResponse.username,
      roles: authResponse.roles,
      type: authResponse.type,
    });

    // Log full auth request path and mock status code for visibility
    const authRequestUrl = `${inputs.apiEndpoint.replace(/\/?$/, '')}/api/auth/login`;
    core.info(`🛰️  Auth request URL: ${authRequestUrl} – response status 200`);

    core.info(`✅ Successfully authenticated as: ${authResponse.username}`);
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
    
    // Exit early if the run was successful or neutral (unless in act environment for testing)
    const nonFailureConclusions = ['success', 'neutral', 'skipped'];
    if (!isActEnvironment && (!workflowRun.conclusion || nonFailureConclusions.includes(workflowRun.conclusion))) {
      core.info('🏁 Workflow concluded without failures – skipping log upload.');
      setActionOutputs({
        s3Url: '',
        uploadStatus: 'skipped',
        filesUploaded: 0,
        authStatus,
        userInfo,
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
        s3Url: '',
        uploadStatus: 'failed',
        filesUploaded: 0,
        authStatus,
        userInfo,
        notificationStatus: 'not-attempted',
      });
      return;
    }

    core.info(`📄 Downloaded ${logs.length} log files`);
    const totalLogSize = logs.reduce((sum, log) => sum + log.content.length, 0);
    core.info(`📊 Total log size: ${(totalLogSize / 1024 / 1024).toFixed(2)} MB`);
    core.endGroup();

    // Step 8: Initialize credentials client and S3 uploader
    core.startGroup('☁️ Setting up S3 upload');
    const credentialsClient = new CredentialsClient(inputs.apiEndpoint, authClient, httpClient);
    const s3Uploader = new S3Uploader(credentialsClient, retryOptions);
    core.info('✅ S3 uploader initialized');
    core.endGroup();

    // Step 9: Upload logs to S3
    core.startGroup('📤 Uploading logs to S3');
    const uploadResults = await s3Uploader.uploadAllLogs(logs, workflowRun.id, workflowRun.name);

    if (uploadResults.length === 0) {
      throw new Error('Failed to upload any logs to S3');
    }

    // Also create a consolidated log file
    const consolidatedResult = await s3Uploader.uploadConsolidatedLogs(
      logs,
      workflowRun.id,
      workflowRun.name
    );
    uploadResults.push(consolidatedResult);

    uploadStatus = 'success';
    filesUploaded = uploadResults.length;
    s3Url = uploadResults[0]?.location || '';

    core.info(`✅ Successfully uploaded ${uploadResults.length} files to S3`);
    core.info(`📍 Primary S3 URL: ${s3Url}`);
    core.endGroup();

    // Step 10: Notify API about successful upload
    core.startGroup('📢 Notifying API about upload completion');
    const notificationClient = new NotificationClient(inputs.apiEndpoint, authClient, httpClient);

    const analysisId = await notificationClient.notifyUploadComplete(
      uploadResults,
      workflowRun,
      s3Uploader.getBucket()
    );

    notificationStatus = 'success';
    core.info('✅ Successfully notified API about upload completion');
    core.endGroup();

    // 🔗 Generate and display the analysis UI link (using actual analysis ID)
    const uiBaseUrl = inputs.apiEndpoint.replace(/\/api\/?$/, '');
    const analysisLink = `https://app.hycos.ai/analysis/${analysisId}`;
    await displayAnalysisLink(analysisLink);

    // Step 11: Set success outputs
    setActionOutputs({
      s3Url,
      uploadStatus,
      filesUploaded,
      authStatus,
      userInfo,
      notificationStatus,
    });

    core.info('🎉 Secure Build Log Uploader completed successfully!');
    core.info(`📊 Summary: ${filesUploaded} files uploaded and API notified`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Action failed: ${errorMessage}`);

    // Set failure outputs
    setActionOutputs({
      s3Url,
      uploadStatus,
      filesUploaded,
      authStatus,
      userInfo,
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
    core.info('• Username and password are valid');
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
