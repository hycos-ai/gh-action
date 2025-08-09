import { CloudCredentialsResponse, LogContent, RetryOptions, S3UploadResult } from './types';
/**
 * S3 Uploader with temporary credentials and retry logic
 * Follows SOLID principles with dependency injection
 */
export declare class S3Uploader {
    private s3Client;
    private credentials;
    private retryOptions;
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
     * Upload all logs to S3 with controlled concurrency
     */
    uploadAllLogs(logs: LogContent[], workflowRunId: number, workflowName: string, s3LogPath?: string): Promise<S3UploadResult[]>;
    /**
     * Create a consolidated log file and upload it
     */
    uploadConsolidatedLogs(logs: LogContent[], workflowRunId: number, workflowName: string, s3LogPath?: string): Promise<S3UploadResult>;
    /**
     * Get current bucket name
     */
    getBucket(): string;
}
//# sourceMappingURL=s3-uploader.d.ts.map