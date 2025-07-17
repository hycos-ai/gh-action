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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Uploader = void 0;
const core = __importStar(require("@actions/core"));
const client_s3_1 = require("@aws-sdk/client-s3");
const lib_storage_1 = require("@aws-sdk/lib-storage");
/**
 * S3 Uploader with temporary credentials and retry logic
 * Follows SOLID principles with dependency injection
 */
class S3Uploader {
    s3Client = null;
    credentials = null;
    credentialsClient;
    retryOptions;
    constructor(credentialsClient, retryOptions) {
        this.credentialsClient = credentialsClient;
        this.retryOptions = retryOptions || {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2,
        };
    }
    /**
     * Initialize or refresh S3 client with current credentials
     */
    async initializeS3Client() {
        try {
            // Get fresh credentials if needed
            this.credentials = await this.credentialsClient.refreshCredentialsIfNeeded(this.credentials || undefined);
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
            core.info('✅ S3 client initialized with temporary credentials');
        }
        catch (error) {
            core.error(`Failed to initialize S3 client: ${error}`);
            throw new Error(`S3 client initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Generate S3 key for log file
     */
    generateS3Key(workflowRunId, jobName, timestamp) {
        const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
        const sanitizedJobName = jobName.replace(/[^a-zA-Z0-9-_]/g, '_');
        const timestampSuffix = new Date(timestamp).getTime();
        return `build-logs/${date}/${workflowRunId}/${sanitizedJobName}_${timestampSuffix}.log`;
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
                // Check if credentials need refreshing
                if (this.isCredentialsError(error)) {
                    core.warning(`Credentials may be expired, refreshing... (attempt ${attempt})`);
                    await this.initializeS3Client();
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
    async uploadLogFile(logContent, workflowRunId, workflowName) {
        return this.executeWithRetry(async () => {
            // Ensure S3 client is initialized with valid credentials
            if (!this.s3Client || !this.credentials) {
                await this.initializeS3Client();
            }
            if (!this.s3Client || !this.credentials) {
                throw new Error('Failed to initialize S3 client');
            }
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
     * Upload all logs to S3 with controlled concurrency
     */
    async uploadAllLogs(logs, workflowRunId, workflowName) {
        if (logs.length === 0) {
            core.warning('No logs to upload');
            return [];
        }
        core.info(`Starting upload of ${logs.length} log files to S3`);
        try {
            // Upload logs in parallel with controlled concurrency (max 3 at a time)
            const concurrencyLimit = 3;
            const results = [];
            const errors = [];
            for (let i = 0; i < logs.length; i += concurrencyLimit) {
                const batch = logs.slice(i, i + concurrencyLimit);
                const batchPromises = batch.map(log => this.uploadLogFile(log, workflowRunId, workflowName).catch(error => {
                    errors.push(`${log.jobName}: ${error.message}`);
                    return null;
                }));
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults.filter(result => result !== null));
            }
            if (errors.length > 0) {
                core.warning(`Failed to upload ${errors.length} log files:`);
                errors.forEach(error => core.warning(`  - ${error}`));
            }
            core.info(`✅ Successfully uploaded ${results.length}/${logs.length} log files to S3`);
            return results;
        }
        catch (error) {
            core.error(`Batch upload failed: ${error}`);
            throw new Error(`Batch S3 upload failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Create a consolidated log file and upload it
     */
    async uploadConsolidatedLogs(logs, workflowRunId, workflowName) {
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
            return await this.uploadLogFile(consolidatedLog, workflowRunId, workflowName);
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
        if (!this.credentials) {
            throw new Error('No credentials available - please initialize S3 client first');
        }
        return this.credentials.bucket;
    }
}
exports.S3Uploader = S3Uploader;
//# sourceMappingURL=s3-uploader.js.map