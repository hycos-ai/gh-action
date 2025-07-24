import { CredentialsClient } from './credentials-client';
import { LogContent, RetryOptions, S3UploadResult } from './types';
/**
 * S3 Uploader with temporary credentials and retry logic
 * Follows SOLID principles with dependency injection
 */
export declare class S3Uploader {
    private s3Client;
    private credentials;
    private credentialsClient;
    private retryOptions;
    constructor(credentialsClient: CredentialsClient, retryOptions?: RetryOptions);
    /**
     * Initialize or refresh S3 client with current credentials
     */
    private initializeS3Client;
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
    uploadLogFile(logContent: LogContent, workflowRunId: number, workflowName: string): Promise<S3UploadResult>;
    /**
     * Upload all logs to S3 with controlled concurrency
     */
    uploadAllLogs(logs: LogContent[], workflowRunId: number, workflowName: string): Promise<S3UploadResult[]>;
    /**
     * Create a consolidated log file and upload it
     */
    uploadConsolidatedLogs(logs: LogContent[], workflowRunId: number, workflowName: string): Promise<S3UploadResult>;
    /**
     * Get current bucket name
     */
    getBucket(): string;
}
//# sourceMappingURL=s3-uploader.d.ts.map