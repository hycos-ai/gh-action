import * as core from '@actions/core';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { LogContent, S3UploadResult } from './types';

export class S3Uploader {
  private s3Client: S3Client;
  private bucket: string;
  private keyPrefix: string;

  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
    bucket: string,
    keyPrefix: string = 'build-logs'
  ) {
    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.bucket = bucket;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Generate S3 key for log file
   */
  private generateS3Key(workflowRunId: number, jobName: string, timestamp: string): string {
    const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const sanitizedJobName = jobName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestampSuffix = new Date(timestamp).getTime();

    return `${this.keyPrefix}/${date}/${workflowRunId}/${sanitizedJobName}_${timestampSuffix}.log`;
  }

  /**
   * Upload a single log file to S3
   */
  async uploadLogFile(
    logContent: LogContent,
    workflowRunId: number,
    workflowName: string
  ): Promise<S3UploadResult> {
    try {
      const s3Key = this.generateS3Key(workflowRunId, logContent.jobName, logContent.timestamp);
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
          Bucket: this.bucket,
          Key: s3Key,
          Body: logContent.content,
          ContentType: 'text/plain',
          Metadata: metadata,
          ServerSideEncryption: 'AES256', // Enable server-side encryption
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
        location: result.Location || `https://${this.bucket}.s3.amazonaws.com/${s3Key}`,
        bucket: this.bucket,
        key: s3Key,
        etag: result.ETag || '',
      };

      core.info(`✅ Successfully uploaded log for job "${logContent.jobName}"`);
      return s3Result;
    } catch (error) {
      core.error(`Failed to upload log for job "${logContent.jobName}": ${error}`);
      throw new Error(
        `S3 upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Upload all logs to S3
   */
  async uploadAllLogs(
    logs: LogContent[],
    workflowRunId: number,
    workflowName: string
  ): Promise<S3UploadResult[]> {
    if (logs.length === 0) {
      core.warning('No logs to upload');
      return [];
    }

    core.info(`Starting upload of ${logs.length} log files to S3`);

    try {
      // Upload logs in parallel with controlled concurrency
      const uploadPromises = logs.map(log => this.uploadLogFile(log, workflowRunId, workflowName));

      const results = await Promise.allSettled(uploadPromises);

      const successful: S3UploadResult[] = [];
      const failed: string[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successful.push(result.value);
        } else {
          failed.push(`${logs[index]?.jobName}: ${result.reason}`);
        }
      });

      if (failed.length > 0) {
        core.warning(`Failed to upload ${failed.length} log files:`);
        failed.forEach(failure => core.warning(`  - ${failure}`));
      }

      core.info(`✅ Successfully uploaded ${successful.length}/${logs.length} log files to S3`);
      return successful;
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
    workflowName: string
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

      return await this.uploadLogFile(consolidatedLog, workflowRunId, workflowName);
    } catch (error) {
      core.error(`Failed to create consolidated log: ${error}`);
      throw new Error(
        `Consolidated log creation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
