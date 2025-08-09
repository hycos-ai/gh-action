import * as core from '@actions/core';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { CloudCredentialsResponse, LogContent, RetryOptions, S3UploadResult } from './types';

/**
 * S3 Uploader with temporary credentials and retry logic
 * Follows SOLID principles with dependency injection
 */
export class S3Uploader {
  private s3Client: S3Client;
  private credentials: CloudCredentialsResponse;
  private retryOptions: RetryOptions;

  constructor(credentials: CloudCredentialsResponse, retryOptions?: RetryOptions) {
    this.credentials = credentials;
    this.retryOptions = retryOptions || {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2,
    };
    
    this.s3Client = new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.credentials.accessKeyId,
        secretAccessKey: this.credentials.secretAccessKey,
        sessionToken: this.credentials.sessionToken,
      },
      maxAttempts: this.retryOptions.maxAttempts,
      retryMode: 'adaptive',
    });
    
    core.info('✅ S3 client initialized with cloud credentials');
  }


  /**
   * Generate S3 key for log file
   */
  private generateS3Key(workflowRunId: number, jobName: string, timestamp: string, s3LogPath: string): string {
    const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const sanitizedJobName = jobName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestampSuffix = new Date(timestamp).getTime();

    return `${s3LogPath}/${date}/${workflowRunId}/${sanitizedJobName}_${timestampSuffix}.log`;
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;
    let delay = this.retryOptions.initialDelay;

    for (let attempt = 1; attempt <= this.retryOptions.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === this.retryOptions.maxAttempts) {
          break;
        }

        // Log credential errors but don't try to refresh (we have static credentials)
        if (this.isCredentialsError(error)) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          core.warning(`Credentials error detected (attempt ${attempt}): ${errorMessage}`);
        }

        core.warning(
          `${operationName} failed (attempt ${attempt}/${this.retryOptions.maxAttempts}), retrying in ${delay}ms...`
        );
        await this.sleep(delay);
        delay = Math.min(delay * this.retryOptions.backoffFactor, this.retryOptions.maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Check if error is related to credentials
   */
  private isCredentialsError(error: any): boolean {
    const errorMessage = error?.message || error?.toString() || '';
    return (
      errorMessage.includes('InvalidAccessKeyId') ||
      errorMessage.includes('SignatureDoesNotMatch') ||
      errorMessage.includes('TokenRefreshRequired') ||
      errorMessage.includes('ExpiredToken') ||
      errorMessage.includes('Forbidden')
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Upload a single log file to S3
   */
  async uploadLogFile(
    logContent: LogContent,
    workflowRunId: number,
    workflowName: string,
    s3LogPath: string = 'logs'
  ): Promise<S3UploadResult> {
    return this.executeWithRetry(async () => {
      const s3Key = this.generateS3Key(workflowRunId, logContent.jobName, logContent.timestamp, s3LogPath);
      core.info(`Uploading log for job "${logContent.jobName}" to S3: ${s3Key}`);

      // Prepare metadata
      const metadata = {
        'workflow-run-id': workflowRunId.toString(),
        'workflow-name': workflowName,
        'job-name': logContent.jobName,
        'job-id': logContent.jobId.toString(),
        'upload-timestamp': new Date().toISOString(),
      };

      // Use multipart upload for better reliability with large files
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.credentials.bucket,
          Key: s3Key,
          Body: logContent.content,
          ContentType: 'text/plain',
          Metadata: metadata,
          ServerSideEncryption: 'AES256', // Enable server-side encryption
          ACL: 'bucket-owner-full-control',
        },
        // Configure multipart upload settings
        queueSize: 4,
        partSize: 1024 * 1024 * 5, // 5MB parts
        leavePartsOnError: false,
      });

      // Add progress tracking
      upload.on('httpUploadProgress', progress => {
        if (progress.total && progress.loaded !== undefined) {
          const percentage = Math.round((progress.loaded / progress.total) * 100);
          core.info(`Upload progress for ${logContent.jobName}: ${percentage}%`);
        }
      });

      const result = await upload.done();

      const s3Result: S3UploadResult = {
        location: result.Location || `https://${this.credentials.bucket}.s3.amazonaws.com/${s3Key}`,
        bucket: this.credentials.bucket,
        key: s3Key,
        etag: result.ETag || '',
      };

      core.info(`✅ Successfully uploaded log for job "${logContent.jobName}"`);
      return s3Result;
    }, `Upload log for job "${logContent.jobName}"`);
  }

  /**
   * Upload all logs to S3 with controlled concurrency
   */
  async uploadAllLogs(
    logs: LogContent[],
    workflowRunId: number,
    workflowName: string,
    s3LogPath: string = 'logs'
  ): Promise<S3UploadResult[]> {
    if (logs.length === 0) {
      core.warning('No logs to upload');
      return [];
    }

    core.info(`Starting upload of ${logs.length} log files to S3`);

    try {
      // Upload logs in parallel with controlled concurrency (max 3 at a time)
      const concurrencyLimit = 3;
      const results: S3UploadResult[] = [];
      const errors: string[] = [];

      for (let i = 0; i < logs.length; i += concurrencyLimit) {
        const batch = logs.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(log =>
          this.uploadLogFile(log, workflowRunId, workflowName, s3LogPath).catch(error => {
            errors.push(`${log.jobName}: ${error.message}`);
            return null;
          })
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...(batchResults.filter(result => result !== null) as S3UploadResult[]));
      }

      if (errors.length > 0) {
        core.warning(`Failed to upload ${errors.length} log files:`);
        errors.forEach(error => core.warning(`  - ${error}`));
      }

      core.info(`✅ Successfully uploaded ${results.length}/${logs.length} log files to S3`);
      return results;
    } catch (error) {
      core.error(`Batch upload failed: ${error}`);
      throw new Error(
        `Batch S3 upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a consolidated log file and upload it
   */
  async uploadConsolidatedLogs(
    logs: LogContent[],
    workflowRunId: number,
    workflowName: string,
    s3LogPath: string = 'logs'
  ): Promise<S3UploadResult> {
    try {
      core.info('Creating consolidated log file');

      // Create consolidated log content
      const consolidatedContent = logs
        .map(log => {
          const separator = '='.repeat(80);
          return [
            separator,
            `JOB: ${log.jobName} (ID: ${log.jobId})`,
            `TIMESTAMP: ${log.timestamp}`,
            separator,
            log.content,
            '', // Empty line for spacing
          ].join('\n');
        })
        .join('\n');

      const consolidatedLog: LogContent = {
        jobName: 'consolidated',
        jobId: 0,
        content: consolidatedContent,
        timestamp: new Date().toISOString(),
      };

      return await this.uploadLogFile(consolidatedLog, workflowRunId, workflowName, s3LogPath);
    } catch (error) {
      core.error(`Failed to create consolidated log: ${error}`);
      throw new Error(
        `Consolidated log creation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get current bucket name
   */
  getBucket(): string {
    return this.credentials.bucket;
  }
}
