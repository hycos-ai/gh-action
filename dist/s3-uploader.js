"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Uploader = void 0;
const core = __importStar(require("@actions/core"));
const client_s3_1 = require("@aws-sdk/client-s3");
const lib_storage_1 = require("@aws-sdk/lib-storage");
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
class S3Uploader {
    s3Client;
    credentials;
    retryOptions;
    /**
     * Initialize S3 uploader with temporary credentials
     * @param credentials - Temporary AWS credentials from Hycos API
     * @param retryOptions - Optional retry configuration for failed uploads
     */
    constructor(credentials, retryOptions) {
        this.credentials = credentials;
        this.retryOptions = retryOptions || {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2,
        };
        this.s3Client = new client_s3_1.S3Client({
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
    generateS3Key(workflowRunId, jobName, timestamp, s3LogPath) {
        const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
        const sanitizedJobName = jobName.replace(/[^a-zA-Z0-9-_]/g, '_');
        const timestampSuffix = new Date(timestamp).getTime();
        return `${s3LogPath}/${date}/${workflowRunId}/${sanitizedJobName}_${timestampSuffix}.log`;
    }
    /**
     * Execute operation with retry logic
     */
    async executeWithRetry(operation, operationName) {
        let lastError;
        let delay = this.retryOptions.initialDelay;
        for (let attempt = 1; attempt <= this.retryOptions.maxAttempts; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt === this.retryOptions.maxAttempts) {
                    break;
                }
                // Log credential errors but don't try to refresh (we have static credentials)
                if (this.isCredentialsError(error)) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    core.warning(`Credentials error detected (attempt ${attempt}): ${errorMessage}`);
                }
                core.warning(`${operationName} failed (attempt ${attempt}/${this.retryOptions.maxAttempts}), retrying in ${delay}ms...`);
                await this.sleep(delay);
                delay = Math.min(delay * this.retryOptions.backoffFactor, this.retryOptions.maxDelay);
            }
        }
        throw lastError;
    }
    /**
     * Check if error is related to credentials
     */
    isCredentialsError(error) {
        const errorMessage = error?.message || error?.toString() || '';
        return (errorMessage.includes('InvalidAccessKeyId') ||
            errorMessage.includes('SignatureDoesNotMatch') ||
            errorMessage.includes('TokenRefreshRequired') ||
            errorMessage.includes('ExpiredToken') ||
            errorMessage.includes('Forbidden'));
    }
    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Upload a single log file to S3
     */
    async uploadLogFile(logContent, workflowRunId, workflowName, s3LogPath = 'logs') {
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
            const upload = new lib_storage_1.Upload({
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
            const s3Result = {
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
     * Upload all logs to S3 with adaptive concurrency and memory management
     */
    async uploadAllLogs(logs, workflowRunId, workflowName, s3LogPath = 'logs') {
        if (logs.length === 0) {
            core.warning('No logs to upload');
            return [];
        }
        core.info(`Starting upload of ${logs.length} log files to S3`);
        try {
            // Calculate adaptive concurrency based on file sizes and available memory
            const totalLogSize = logs.reduce((sum, log) => sum + log.content.length, 0);
            const avgLogSize = totalLogSize / logs.length;
            const availableMemory = this.getAvailableMemory();
            // Adaptive concurrency: smaller files = higher concurrency, larger files = lower concurrency
            let concurrencyLimit = 3; // Default
            if (avgLogSize > 10 * 1024 * 1024) { // > 10MB average
                concurrencyLimit = 1;
            }
            else if (avgLogSize > 1024 * 1024) { // > 1MB average
                concurrencyLimit = 2;
            }
            else if (availableMemory > 1024 * 1024 * 1024) { // > 1GB available memory
                concurrencyLimit = 5;
            }
            core.info(`Using adaptive concurrency limit: ${concurrencyLimit} (avg file size: ${Math.round(avgLogSize / 1024)}KB)`);
            const results = [];
            const errors = [];
            // Process logs in batches with memory-aware batching
            for (let i = 0; i < logs.length; i += concurrencyLimit) {
                const batch = logs.slice(i, i + concurrencyLimit);
                // Log memory usage before each batch
                const memUsage = process.memoryUsage();
                core.debug(`Memory before batch ${Math.floor(i / concurrencyLimit) + 1}: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used, ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB total`);
                const batchPromises = batch.map(async (log) => {
                    try {
                        const result = await this.uploadLogFile(log, workflowRunId, workflowName, s3LogPath);
                        // Clear log content from memory after successful upload to reduce memory pressure
                        log.content = '[UPLOADED - Content cleared to save memory]';
                        return result;
                    }
                    catch (error) {
                        errors.push(`${log.jobName}: ${error instanceof Error ? error.message : String(error)}`);
                        return null;
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults.filter(result => result !== null));
                // Force garbage collection between batches if available (Node.js with --expose-gc)
                if (global.gc && i % (concurrencyLimit * 2) === 0) {
                    global.gc();
                }
                // Small delay between batches to allow memory cleanup
                if (i + concurrencyLimit < logs.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            if (errors.length > 0) {
                core.warning(`Failed to upload ${errors.length} log files:`);
                errors.slice(0, 5).forEach(error => core.warning(`  - ${error}`));
                if (errors.length > 5) {
                    core.warning(`  ... and ${errors.length - 5} more errors`);
                }
            }
            core.info(`✅ Successfully uploaded ${results.length}/${logs.length} log files to S3`);
            // Final memory check
            const finalMemUsage = process.memoryUsage();
            core.debug(`Final memory usage: ${Math.round(finalMemUsage.heapUsed / 1024 / 1024)}MB used`);
            return results;
        }
        catch (error) {
            core.error(`Batch upload failed: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Batch S3 upload failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Get available memory in bytes (rough estimate)
     */
    getAvailableMemory() {
        try {
            const memUsage = process.memoryUsage();
            // Estimate available memory as 80% of heap limit minus current usage
            const heapLimit = 1.4 * 1024 * 1024 * 1024; // Rough estimate of Node.js heap limit (1.4GB)
            return Math.max(0, heapLimit * 0.8 - memUsage.heapUsed);
        }
        catch {
            return 512 * 1024 * 1024; // 512MB fallback
        }
    }
    /**
     * Create a consolidated log file and upload it
     */
    async uploadConsolidatedLogs(logs, workflowRunId, workflowName, s3LogPath = 'logs') {
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
            const consolidatedLog = {
                jobName: 'consolidated',
                jobId: 0,
                content: consolidatedContent,
                timestamp: new Date().toISOString(),
            };
            return await this.uploadLogFile(consolidatedLog, workflowRunId, workflowName, s3LogPath);
        }
        catch (error) {
            core.error(`Failed to create consolidated log: ${error}`);
            throw new Error(`Consolidated log creation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Get current bucket name
     */
    getBucket() {
        return this.credentials.bucket;
    }
}
exports.S3Uploader = S3Uploader;
//# sourceMappingURL=s3-uploader.js.map