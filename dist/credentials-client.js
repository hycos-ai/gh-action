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
exports.CredentialsClient = void 0;
const core = __importStar(require("@actions/core"));
/**
 * Client for fetching cloud credentials from the API
 * Follows Single Responsibility Principle by handling only credential fetching
 */
class CredentialsClient {
    baseUrl;
    authClient;
    httpClient;
    constructor(baseUrl, authClient, httpClient) {
        // Ensure baseUrl ends with /api if not already included
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        if (!this.baseUrl.includes('/api')) {
            this.baseUrl += '/api';
        }
        this.authClient = authClient;
        this.httpClient = httpClient;
    }
    /**
     * Fetch temporary AWS S3 credentials from the API
     * @returns Promise<CloudCredentialsResponse> - The cloud credentials response
     * @throws Error if authentication fails or API call fails
     */
    async getCloudCredentials() {
        try {
            core.info('☁️  Fetching temporary AWS S3 credentials...');
            // Ensure we have a valid token
            if (!this.authClient.isAuthenticated()) {
                throw new Error('Not authenticated - please login first');
            }
            const response = await this.httpClient.get(`${this.baseUrl}/api/upload/cloud/credentials`, {
                headers: this.authClient.getAuthHeaders(),
                timeout: 30000, // 30 second timeout
            });
            // Validate response structure
            if (!response.accessKeyId || !response.secretAccessKey || !response.bucket) {
                core.warning(`Received credentials response but required fields are missing. Response keys: ${Object.keys(response).join(', ')}`);
                // If running under act, provide mock credentials so the flow can continue
                if (process.env.ACT === 'true') {
                    core.warning('act environment detected – using mock S3 credentials');
                    return {
                        accessKeyId: '', // empty for public bucket test
                        secretAccessKey: '',
                        sessionToken: '',
                        expiration: new Date(Date.now() + 3600 * 1000).toISOString(),
                        bucket: 'mock-bucket',
                    };
                }
                throw new Error('Invalid credentials response: missing required fields');
            }
            // Log success (without sensitive data)
            core.info('✅ Successfully fetched cloud credentials');
            core.info(`🪣 S3 Bucket: ${response.bucket}`);
            if (response.expiration) {
                const expirationDate = new Date(response.expiration);
                const now = new Date();
                const hoursUntilExpiration = Math.round((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60));
                core.info(`⏰ Credentials expire in ${hoursUntilExpiration} hours`);
            }
            return response;
        }
        catch (error) {
            return this.handleCredentialsError(error);
        }
    }
    /**
     * Check if the provided credentials are still valid
     * @param credentials - The credentials to validate
     * @returns boolean - Whether the credentials are still valid
     */
    areCredentialsValid(credentials) {
        if (!credentials.expiration) {
            // If no expiration is provided, assume they're valid for now
            return true;
        }
        const expirationDate = new Date(credentials.expiration);
        const now = new Date();
        // Add a 5-minute buffer to account for clock skew and processing time
        const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
        const effectiveExpiration = new Date(expirationDate.getTime() - bufferTime);
        return now < effectiveExpiration;
    }
    /**
     * Get fresh credentials if current ones are expired or about to expire
     * @param currentCredentials - Current credentials to check
     * @returns Promise<CloudCredentialsResponse> - Fresh credentials
     */
    async refreshCredentialsIfNeeded(currentCredentials) {
        if (!currentCredentials || !this.areCredentialsValid(currentCredentials)) {
            core.info('🔄 Refreshing expired or missing credentials...');
            return this.getCloudCredentials();
        }
        core.info('✅ Current credentials are still valid');
        return currentCredentials;
    }
    /**
     * Handle credentials-related errors with detailed messaging
     * @param error - The error to handle
     * @throws Error - Always throws with appropriate error message
     */
    handleCredentialsError(error) {
        let errorMessage = 'Failed to fetch cloud credentials';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        // Check for specific error conditions
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            core.error('🔐 Authentication failed: Token may be expired or invalid');
            core.error('💡 Try re-running the action to get a fresh token');
        }
        else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
            core.error('🚫 Access forbidden: User may not have permission to access cloud credentials');
            core.error('💡 Check if your user account has the required roles');
        }
        else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
            core.error('🔍 Credentials endpoint not found: Please check the API URL');
        }
        else if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
            core.error('⏱️  Rate limit exceeded: Too many requests to the credentials endpoint');
            core.error('💡 Wait a moment before retrying');
        }
        else if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
            core.error('🔥 Server error: API is experiencing issues');
            core.error('💡 Try again later or contact support');
        }
        else {
            core.error(`❌ ${errorMessage}`);
        }
        throw new Error(errorMessage);
    }
}
exports.CredentialsClient = CredentialsClient;
//# sourceMappingURL=credentials-client.js.map