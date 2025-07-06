import * as core from '@actions/core';
import axios, { AxiosError, AxiosResponse } from 'axios';
import {
  ApiErrorResponse,
  AuthLoginRequest,
  AuthLoginResponse,
  HttpClient,
  RetryOptions,
  TokenStorage,
} from './types';

/**
 * Simple in-memory token storage implementation
 */
class MemoryTokenStorage implements TokenStorage {
  private token: string | null = null;
  private expiry: Date | null = null;

  getToken(): string | null {
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

  setToken(token: string): void {
    this.token = token;
    // Set expiry to 1 hour from now if not specified
    this.expiry = new Date(Date.now() + 60 * 60 * 1000);
  }

  clearToken(): void {
    this.token = null;
    this.expiry = null;
  }

  isTokenValid(): boolean {
    return this.getToken() !== null;
  }
}

/**
 * HTTP client wrapper with retry logic
 */
class HttpClientWithRetry implements HttpClient {
  private retryOptions: RetryOptions;

  constructor(retryOptions: RetryOptions) {
    this.retryOptions = retryOptions;
  }

  async get<T>(url: string, config?: any): Promise<T> {
    return this.executeWithRetry(() => axios.get<T>(url, config));
  }

  async post<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.executeWithRetry(() => axios.post<T>(url, data, config));
  }

  async put<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.executeWithRetry(() => axios.put<T>(url, data, config));
  }

  async delete<T>(url: string, config?: any): Promise<T> {
    return this.executeWithRetry(() => axios.delete<T>(url, config));
  }

  private async executeWithRetry<T>(operation: () => Promise<AxiosResponse<T>>): Promise<T> {
    let lastError: any;
    let delay = this.retryOptions.initialDelay;

    for (let attempt = 1; attempt <= this.retryOptions.maxAttempts; attempt++) {
      try {
        const response = await operation();
        return response.data;
      } catch (error) {
        lastError = error;

        if (attempt === this.retryOptions.maxAttempts) {
          break;
        }

        // Check if error is retryable
        if (axios.isAxiosError(error)) {
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Authentication client following SOLID principles
 */
export class AuthClient {
  private baseUrl: string;
  private tokenStorage: TokenStorage;
  private httpClient: HttpClient;
  private userInfo: { username: string; roles: string[] } | null = null;

  constructor(
    baseUrl: string,
    tokenStorage?: TokenStorage,
    httpClient?: HttpClient,
    retryOptions?: RetryOptions
  ) {
    // Ensure baseUrl ends with /api if not already included
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (!this.baseUrl.includes('/api')) {
      this.baseUrl += '/api';
    }

    this.tokenStorage = tokenStorage || new MemoryTokenStorage();
    this.httpClient =
      httpClient ||
      new HttpClientWithRetry(
        retryOptions || {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 5000,
          backoffFactor: 2,
        }
      );
  }

  /**
   * Login with username and password to get authentication token
   */
  async login(username: string, password: string): Promise<AuthLoginResponse> {
    try {
      core.info('🔐 Attempting to authenticate with API...');

      const loginRequest: AuthLoginRequest = {
        username,
        password,
      };

      const response = await this.httpClient.post<AuthLoginResponse>(
        `${this.baseUrl}/auth/login`,
        loginRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'GitHub-Action-Secure-Log-Uploader/1.0',
          },
          timeout: 30000, // 30 second timeout for auth
        }
      );

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
    } catch (error) {
      return this.handleAuthError(error, 'login');
    }
  }

  /**
   * Get the current authentication token
   */
  getToken(): string | null {
    return this.tokenStorage.getToken();
  }

  /**
   * Get current user information
   */
  getUserInfo(): { username: string; roles: string[] } | null {
    return this.userInfo;
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return this.tokenStorage.isTokenValid();
  }

  /**
   * Get authentication headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
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
  logout(): void {
    this.tokenStorage.clearToken();
    this.userInfo = null;
    core.info('🔓 Logged out successfully');
  }

  /**
   * Test the authentication token with a simple API call
   */
  async validateToken(): Promise<boolean> {
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
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
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
  private handleAuthError(error: unknown, operation: string): never {
    let errorMessage = `Authentication ${operation} failed`;
    let statusCode = 0;

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      statusCode = axiosError.response?.status || 0;

      if (axiosError.response?.data) {
        const errorData = axiosError.response.data;
        errorMessage = errorData.message || errorData.error || errorMessage;
      } else if (axiosError.message) {
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
    } else if (error instanceof Error) {
      errorMessage = error.message;
      core.error(`❌ ${errorMessage}`);
    } else {
      core.error(`❌ Unknown error during ${operation}: ${String(error)}`);
    }

    throw new Error(errorMessage);
  }
}
