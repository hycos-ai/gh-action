import * as core from '@actions/core';
import axios from 'axios';
import { AuthClient } from './auth-client';
import { CredentialsClient } from './credentials-client';
import { GitHubClient } from './github-client';
import { NotificationClient } from './notification-client';
import { S3Uploader } from './s3-uploader';
import { ActionInputs, ActionOutputs, RetryOptions } from './types';

/**
 * Parse action inputs from environment variables
 */
function getActionInputs(): ActionInputs {
  return {
    username: core.getInput('username', { required: true }),
    password: core.getInput('password', { required: true }),
    apiEndpoint: core.getInput('api-endpoint', { required: true }),
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

    await notificationClient.notifyUploadComplete(
      uploadResults,
      workflowRun,
      s3Uploader.getBucket()
    );

    notificationStatus = 'success';
    core.info('✅ Successfully notified API about upload completion');
    core.endGroup();

    // 🔗 Generate and display a mock analysis UI link
    const shortAnalysisId = Math.random().toString(36).substring(2, 8);
    const uiBaseUrl = inputs.apiEndpoint.replace(/\/api\/?$/, '');
    const analysisLink = `${uiBaseUrl}/analysis/${shortAnalysisId}`;
    core.info(`🔗 Analysis UI: ${analysisLink}`);

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
