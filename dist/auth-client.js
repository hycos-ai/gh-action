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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthClient = void 0;
const core = __importStar(require("@actions/core"));
const axios_1 = __importDefault(require("axios"));
/**
 * Simple in-memory token storage implementation
 */
class MemoryTokenStorage {
    token = null;
    expiry = null;
    getToken() {
        if (!this.token) {
            return null;
        }
        // Check if token is expired
        if (this.expiry && new Date() > this.expiry) {
            this.clearToken();
            return null;
        }
        return this.token;
    }
    setToken(token) {
        this.token = token;
        // Set expiry to 1 hour from now if not specified
        this.expiry = new Date(Date.now() + 60 * 60 * 1000);
    }
    clearToken() {
        this.token = null;
        this.expiry = null;
    }
    isTokenValid() {
        return this.getToken() !== null;
    }
}
/**
 * HTTP client wrapper with retry logic
 */
class HttpClientWithRetry {
    retryOptions;
    constructor(retryOptions) {
        this.retryOptions = retryOptions;
    }
    async get(url, config) {
        return this.executeWithRetry(() => axios_1.default.get(url, config));
    }
    async post(url, data, config) {
        return this.executeWithRetry(() => axios_1.default.post(url, data, config));
    }
    async put(url, data, config) {
        return this.executeWithRetry(() => axios_1.default.put(url, data, config));
    }
    async delete(url, config) {
        return this.executeWithRetry(() => axios_1.default.delete(url, config));
    }
    async executeWithRetry(operation) {
        let lastError;
        let delay = this.retryOptions.initialDelay;
        for (let attempt = 1; attempt <= this.retryOptions.maxAttempts; attempt++) {
            try {
                const response = await operation();
                return response.data;
            }
            catch (error) {
                lastError = error;
                if (attempt === this.retryOptions.maxAttempts) {
                    break;
                }
                // Check if error is retryable
                if (axios_1.default.isAxiosError(error)) {
                    const status = error.response?.status || 0;
                    // Don't retry on client errors (4xx) except for 429 (rate limit)
                    if (status >= 400 && status < 500 && status !== 429) {
                        break;
                    }
                }
                core.warning(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
                await this.sleep(delay);
                delay = Math.min(delay * this.retryOptions.backoffFactor, this.retryOptions.maxDelay);
            }
        }
        throw lastError;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
/**
 * Authentication client following SOLID principles
 */
class AuthClient {
    baseUrl;
    tokenStorage;
    httpClient;
    userInfo = null;
    constructor(baseUrl, tokenStorage, httpClient, retryOptions) {
        // Ensure baseUrl ends with /api if not already included
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        if (!this.baseUrl.includes('/api')) {
            this.baseUrl += '/api';
        }
        this.tokenStorage = tokenStorage || new MemoryTokenStorage();
        this.httpClient =
            httpClient ||
                new HttpClientWithRetry(retryOptions || {
                    maxAttempts: 3,
                    initialDelay: 1000,
                    maxDelay: 5000,
                    backoffFactor: 2,
                });
    }
    /**
     * Login with username and password to get authentication token
     */
    async login(username, password) {
        try {
            core.info('🔐 Attempting to authenticate with API...');
            const loginRequest = {
                username,
                password,
            };
            const response = await this.httpClient.post(`${this.baseUrl}/auth/login`, loginRequest, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'GitHub-Action-Secure-Log-Uploader/1.0',
                },
                timeout: 30000, // 30 second timeout for auth
            });
            // Validate response structure
            if (!response.token || !response.username) {
                throw new Error('Invalid authentication response: missing token or username');
            }
            // Store authentication data
            this.tokenStorage.setToken(response.token);
            this.userInfo = {
                username: response.username,
                roles: response.roles || [],
            };
            core.info(`✅ Successfully authenticated as: ${response.username}`);
            if (response.roles && response.roles.length > 0) {
                core.info(`🏷️  Roles: ${response.roles.join(', ')}`);
            }
            return response;
        }
        catch (error) {
            return this.handleAuthError(error, 'login');
        }
    }
    /**
     * Get the current authentication token
     */
    getToken() {
        return this.tokenStorage.getToken();
    }
    /**
     * Get current user information
     */
    getUserInfo() {
        return this.userInfo;
    }
    /**
     * Check if currently authenticated
     */
    isAuthenticated() {
        return this.tokenStorage.isTokenValid();
    }
    /**
     * Get authentication headers for API requests
     */
    getAuthHeaders() {
        const token = this.getToken();
        if (!token) {
            throw new Error('No valid authentication token available');
        }
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'GitHub-Action-Secure-Log-Uploader/1.0',
        };
    }
    /**
     * Clear authentication data (logout)
     */
    logout() {
        this.tokenStorage.clearToken();
        this.userInfo = null;
        core.info('🔓 Logged out successfully');
    }
    /**
     * Test the authentication token with a simple API call
     */
    async validateToken() {
        try {
            if (!this.isAuthenticated()) {
                return false;
            }
            // Make a simple request to validate token - using the cloud credentials endpoint
            // as it's the next step in the flow and will validate the token
            await this.httpClient.get(`${this.baseUrl}/upload/cloud/credentials`, {
                headers: this.getAuthHeaders(),
                timeout: 10000,
            });
            return true;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response?.status === 401) {
                // Token is invalid, clear it
                this.logout();
            }
            core.warning('⚠️  Token validation failed');
            return false;
        }
    }
    /**
     * Handle authentication errors with detailed messaging
     */
    handleAuthError(error, operation) {
        let errorMessage = `Authentication ${operation} failed`;
        let statusCode = 0;
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            statusCode = axiosError.response?.status || 0;
            if (axiosError.response?.data) {
                const errorData = axiosError.response.data;
                errorMessage = errorData.message || errorData.error || errorMessage;
            }
            else if (axiosError.message) {
                errorMessage = axiosError.message;
            }
            // Handle specific HTTP status codes
            switch (statusCode) {
                case 401:
                    core.error('🔐 Authentication failed: Invalid username or password');
                    break;
                case 403:
                    core.error('🚫 Access forbidden: User may not have required permissions');
                    break;
                case 404:
                    core.error('🔍 Authentication endpoint not found: Please check the API URL');
                    break;
                case 429:
                    core.error('⏱️  Rate limit exceeded: Too many login attempts');
                    break;
                case 500:
                    core.error('🔥 Server error: API is experiencing issues');
                    break;
                default:
                    core.error(`❌ HTTP ${statusCode}: ${errorMessage}`);
            }
        }
        else if (error instanceof Error) {
            errorMessage = error.message;
            core.error(`❌ ${errorMessage}`);
        }
        else {
            core.error(`❌ Unknown error during ${operation}: ${String(error)}`);
        }
        throw new Error(errorMessage);
    }
}
exports.AuthClient = AuthClient;
//# sourceMappingURL=auth-client.js.map