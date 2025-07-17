import { AuthClient } from './auth-client';
import { BuildDetails, HttpClient, S3UploadResult, ServerDetails, UploadedFile, WorkflowRun } from './types';
/**
 * Client for notifying the API after successful upload
 * Follows Single Responsibility Principle by handling only upload notifications
 */
export declare class NotificationClient {
    private baseUrl;
    private authClient;
    private httpClient;
    constructor(baseUrl: string, authClient: AuthClient, httpClient: HttpClient);
    /**
     * Notify the API about successful upload completion
     * @param uploadResults - Array of S3 upload results
     * @param workflowRun - GitHub workflow run information
     * @param bucketName - S3 bucket name where files were uploaded
     * @returns Promise<void>
     * @throws Error if notification fails
     */
    notifyUploadComplete(uploadResults: S3UploadResult[], workflowRun: WorkflowRun, bucketName: string): Promise<void>;
    /**
     * Build the notification payload from upload results and workflow information
     * @param uploadResults - Array of S3 upload results
     * @param workflowRun - GitHub workflow run information
     * @param bucketName - S3 bucket name
     * @returns UploadNotificationRequest
     */
    private buildNotificationPayload;
    /**
     * Extract filename from S3 key
     * @param key - S3 object key
     * @returns filename
     */
    private extractFilenameFromKey;
    /**
     * Generate build folder name from workflow run
     * @param workflowRun - GitHub workflow run information
     * @returns folder name
     */
    private generateBuildFolder;
    /**
     * Notify about specific files with custom build details
     * @param files - Array of uploaded files
     * @param buildDetails - Custom build details
     * @param serverDetails - Server details
     * @returns Promise<void>
     */
    notifyCustomUpload(files: UploadedFile[], buildDetails: BuildDetails, serverDetails: ServerDetails): Promise<void>;
    /**
     * Handle notification errors with detailed messaging
     * @param error - The error to handle
     * @throws Error - Always throws with appropriate error message
     */
    private handleNotificationError;
}
