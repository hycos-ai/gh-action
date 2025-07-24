import * as core from '@actions/core';
import { AuthClient } from './auth-client';
import {
  BuildDetails,
  HttpClient,
  S3UploadResult,
  ServerDetails,
  UploadNotificationRequest,
  UploadNotificationResponse,
  UploadedFile,
  WorkflowRun,
} from './types';

/**
 * Client for notifying the API after successful upload
 * Follows Single Responsibility Principle by handling only upload notifications
 */
export class NotificationClient {
  private baseUrl: string;
  private authClient: AuthClient;
  private httpClient: HttpClient;

  constructor(baseUrl: string, authClient: AuthClient, httpClient: HttpClient) {
    // Ensure baseUrl ends with /api if not already included
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (!this.baseUrl.includes('/api')) {
      this.baseUrl += '/api';
    }

    this.authClient = authClient;
    this.httpClient = httpClient;
  }

  /**
   * Notify the API about successful upload completion
   * @param uploadResults - Array of S3 upload results
   * @param workflowRun - GitHub workflow run information
   * @param bucketName - S3 bucket name where files were uploaded
   * @returns Promise<string> - Analysis ID for tracking
   * @throws Error if notification fails
   */
  async notifyUploadComplete(
    uploadResults: S3UploadResult[],
    workflowRun: WorkflowRun,
    bucketName: string
  ): Promise<string> {
    try {
      core.info('📢 Notifying API about successful upload completion...');

      // Ensure we have a valid token
      if (!this.authClient.isAuthenticated()) {
        throw new Error('Not authenticated - please login first');
      }

      if (uploadResults.length === 0) {
        core.warning('No upload results to notify about');
        return 'no-upload-' + Math.random().toString(36).substring(2, 8);
      }

      // Prepare notification payload
      const notificationPayload = this.buildNotificationPayload(
        uploadResults,
        workflowRun,
        bucketName
      );

      // Make API call to notify about upload completion
      const response = await this.httpClient.post<UploadNotificationResponse>(`${this.baseUrl}/api/upload/uploaded`, notificationPayload, {
        headers: this.authClient.getAuthHeaders(),
        timeout: 30000, // 30 second timeout
      });

      core.info('✅ Successfully notified API about upload completion');
      core.info(`📁 Notified about ${uploadResults.length} uploaded files`);
      
      // Display analysis link
      const analysisId = response.analysisId || 'mock-analysis-' + Math.random().toString(36).substring(2, 8);
      const analysisUrl = response.analysisUrl || `https://app.hycos.ai/analysis/${analysisId}`;
      
      core.info('🔗 Analysis Link:');
      core.info(`   ${analysisUrl}`);
      core.info('');
      core.info('📊 View your build analysis results at the link above');
      
      return analysisId;
    } catch (error) {
      return this.handleNotificationError(error);
    }
  }

  /**
   * Build the notification payload from upload results and workflow information
   * @param uploadResults - Array of S3 upload results
   * @param workflowRun - GitHub workflow run information
   * @param bucketName - S3 bucket name
   * @returns UploadNotificationRequest
   */
  private buildNotificationPayload(
    uploadResults: S3UploadResult[],
    workflowRun: WorkflowRun,
    bucketName: string
  ): UploadNotificationRequest {
    // Convert S3 upload results to uploaded files
    const files: UploadedFile[] = uploadResults.map(result => ({
      filename: this.extractFilenameFromKey(result.key),
      fileType: 'LOG' as const,
      bucketName: bucketName,
    }));

    // Build details from workflow run
    const buildDetails: BuildDetails = {
      folder: this.generateBuildFolder(workflowRun),
      jobName: workflowRun.name,
      buildNumber: workflowRun.id,
    };

    // Server details from repository information
    const serverDetails: ServerDetails = {
      serverAddress: workflowRun.repository?.html_url || workflowRun.html_url,
      type: 'github',
    };

    return {
      files,
      buildDetails,
      serverDetails,
    };
  }

  /**
   * Extract filename from S3 key
   * @param key - S3 object key
   * @returns filename
   */
  private extractFilenameFromKey(key: string): string {
    const parts = key.split('/');
    return parts[parts.length - 1] || key;
  }

  /**
   * Generate build folder name from workflow run
   * @param workflowRun - GitHub workflow run information
   * @returns folder name
   */
  private generateBuildFolder(workflowRun: WorkflowRun): string {
    const date = new Date(workflowRun.created_at).toISOString().split('T')[0];
    const repoName = workflowRun.repository?.full_name || 'unknown-repo';
    return `${repoName}/${date}/${workflowRun.id}`;
  }

  /**
   * Notify about specific files with custom build details
   * @param files - Array of uploaded files
   * @param buildDetails - Custom build details
   * @param serverDetails - Server details
   * @returns Promise<string> - Analysis ID for tracking
   */
  async notifyCustomUpload(
    files: UploadedFile[],
    buildDetails: BuildDetails,
    serverDetails: ServerDetails
  ): Promise<string> {
    try {
      core.info('📢 Notifying API about custom upload...');

      // Ensure we have a valid token
      if (!this.authClient.isAuthenticated()) {
        throw new Error('Not authenticated - please login first');
      }

      if (files.length === 0) {
        core.warning('No files to notify about');
        return 'no-files-' + Math.random().toString(36).substring(2, 8);
      }

      const notificationPayload: UploadNotificationRequest = {
        files,
        buildDetails,
        serverDetails,
      };

      // Make API call
      const response = await this.httpClient.post<UploadNotificationResponse>(`${this.baseUrl}/api/upload/uploaded`, notificationPayload, {
        headers: this.authClient.getAuthHeaders(),
        timeout: 30000,
      });

      core.info('✅ Successfully notified API about custom upload');
      core.info(`📁 Notified about ${files.length} uploaded files`);
      
      // Display analysis link
      const analysisId = response.analysisId || 'mock-custom-' + Math.random().toString(36).substring(2, 8);
      const analysisUrl = response.analysisUrl || `https://app.hycos.ai/analysis/${analysisId}`;
      
      core.info('🔗 Analysis Link:');
      core.info(`   ${analysisUrl}`);
      core.info('');
      core.info('📊 View your build analysis results at the link above');
      
      return analysisId;
    } catch (error) {
      return this.handleNotificationError(error);
    }
  }

  /**
   * Handle notification errors with detailed messaging
   * @param error - The error to handle
   * @throws Error - Always throws with appropriate error message
   */
  private handleNotificationError(error: unknown): never {
    let errorMessage = 'Failed to notify API about upload completion';

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Check for specific error conditions
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      core.error('🔐 Authentication failed: Token may be expired or invalid');
      core.error('💡 Try re-running the action to get a fresh token');
    } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      core.error('🚫 Access forbidden: User may not have permission to send notifications');
      core.error('💡 Check if your user account has the required roles for upload notifications');
    } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      core.error('🔍 Notification endpoint not found: Please check the API URL');
    } else if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
      core.error('⏱️  Rate limit exceeded: Too many requests to the notification endpoint');
      core.error('💡 Wait a moment before retrying');
    } else if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
      core.error('🔥 Server error: API is experiencing issues');
      core.error('💡 Try again later or contact support');
    } else {
      core.error(`❌ ${errorMessage}`);
    }

    // Log detailed information for debugging
    core.debug(`Notification error details: ${JSON.stringify(error, null, 2)}`);

    throw new Error(errorMessage);
  }
}
