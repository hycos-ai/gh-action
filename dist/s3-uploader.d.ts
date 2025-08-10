import { CloudCredentialsResponse, LogContent, RetryOptions, S3UploadResult } from './types';
/**
 * S3 Uploader with temporary credentials, retry logic, and memory optimization
 *
 * This class handles secure upload of GitHub Actions logs to S3 using temporary
 * credentials with comprehensive retry logic, adaptive concurrency, and memory
 * management to handle large log files efficiently.
 *
 * @example
 * ```typescript
 * const uploader = new S3Uploader(cloudCredentials, retryOptions);
 * const results = await uploader.uploadAllLogs(logs, runId, workflowName);
 * ```
 *
 * @since 1.0.0
 */
export declare class S3Uploader {
    private s3Client;
    private credentials;
    private retryOptions;
    /**
     * Initialize S3 uploader with temporary credentials
     * @param credentials - Temporary AWS credentials from Hycos API
     * @param retryOptions - Optional retry configuration for failed uploads
     */
    constructor(credentials: CloudCredentialsResponse, retryOptions?: RetryOptions);
    /**
     * Generate S3 key for log file
     */
    private generateS3Key;
    /**
     * Execute operation with retry logic
     */
    private executeWithRetry;
    /**
     * Check if error is related to credentials
     */
    private isCredentialsError;
    /**
     * Sleep for specified milliseconds
     */
    private sleep;
    /**
     * Upload a single log file to S3
     */
    uploadLogFile(logContent: LogContent, workflowRunId: number, workflowName: string, s3LogPath?: string): Promise<S3UploadResult>;
    /**
     * Upload all logs to S3 with adaptive concurrency and memory management
     */
    uploadAllLogs(logs: LogContent[], workflowRunId: number, workflowName: string, s3LogPath?: string): Promise<S3UploadResult[]>;
    /**
     * Get available memory in bytes (rough estimate)
     */
    private getAvailableMemory;
    /**
     * Create a consolidated log file and upload it
     */
    uploadConsolidatedLogs(logs: LogContent[], workflowRunId: number, workflowName: string, s3LogPath?: string): Promise<S3UploadResult>;
    /**
     * Get current bucket name
     */
    getBucket(): string;
}
