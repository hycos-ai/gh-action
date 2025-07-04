import * as core from '@actions/core';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { ApiErrorResponse, AuthLoginRequest, AuthLoginResponse } from './types';

export class AuthClient {
  private baseUrl: string;
  private token: string | null = null;
  private userInfo: AuthLoginResponse['user'] | null = null;
  private tokenExpiry: Date | null = null;

  constructor(baseUrl: string) {
    // Ensure baseUrl ends with /api if not already included
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (!this.baseUrl.includes('/api')) {
      this.baseUrl += '/api';
    }
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

      const response: AxiosResponse<AuthLoginResponse> = await axios.post(
        `${this.baseUrl}/auth/login`,
        loginRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'GitHub-Action-Log-Analyzer/1.0',
          },
          timeout: 30000, // 30 second timeout for auth
        }
      );

      if (response.status !== 200) {
        throw new Error(`Authentication failed with status ${response.status}`);
      }

      const authResponse = response.data;

      // Validate response structure
      if (!authResponse.token || !authResponse.user) {
        throw new Error('Invalid authentication response: missing token or user data');
      }

      // Store authentication data
      this.token = authResponse.token;
      this.userInfo = authResponse.user;

      // Parse token expiry if provided
      if (authResponse.expiresAt) {
        this.tokenExpiry = new Date(authResponse.expiresAt);
      }

      core.info(`✅ Successfully authenticated as: ${authResponse.user.username}`);
      if (authResponse.user.name) {
        core.info(`👤 User: ${authResponse.user.name}`);
      }
      if (authResponse.user.roles && authResponse.user.roles.length > 0) {
        core.info(`🏷️  Roles: ${authResponse.user.roles.join(', ')}`);
      }

      return authResponse;
    } catch (error) {
      return this.handleAuthError(error, 'login');
    }
  }

  /**
   * Get the current authentication token
   */
  getToken(): string | null {
    if (!this.token) {
      return null;
    }

    // Check if token is expired
    if (this.tokenExpiry && new Date() > this.tokenExpiry) {
      core.warning('⚠️  Authentication token has expired');
      this.token = null;
      this.userInfo = null;
      this.tokenExpiry = null;
      return null;
    }

    return this.token;
  }

  /**
   * Get current user information
   */
  getUserInfo(): AuthLoginResponse['user'] | null {
    return this.userInfo;
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null;
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
      'User-Agent': 'GitHub-Action-Log-Analyzer/1.0',
    };
  }

  /**
   * Clear authentication data (logout)
   */
  logout(): void {
    this.token = null;
    this.userInfo = null;
    this.tokenExpiry = null;
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

      // Make a simple request to validate token
      const response = await axios.get(`${this.baseUrl}/auth/validate`, {
        headers: this.getAuthHeaders(),
        timeout: 10000,
      });

      return response.status === 200;
    } catch (error) {
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

    // Log additional debugging information
    core.debug(`API Base URL: ${this.baseUrl}`);
    core.debug(`Operation: ${operation}`);
    core.debug(`Status Code: ${statusCode}`);
    core.debug(`Error Details: ${JSON.stringify(error, null, 2)}`);

    throw new Error(`Authentication ${operation} failed: ${errorMessage}`);
  }
}
