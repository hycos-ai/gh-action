import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import * as core from '@actions/core';
import { ApiError, NetworkError, ErrorHandler } from './error-handler';

/**
 * Configuration for HTTP client
 */
export interface HttpClientConfig {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
}

/**
 * Secure HTTP client with timeout, retry logic, and sanitized logging
 */
export class HttpClient {
  private client: AxiosInstance;
  private config: Required<HttpClientConfig>;

  constructor(config: HttpClientConfig = {}) {
    this.config = {
      baseURL: config.baseURL || '',
      timeout: config.timeout || 30000, // 30 seconds default
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000, // 1 second
      maxRetryDelay: config.maxRetryDelay || 10000, // 10 seconds
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'HycosAI-GitHub-Action/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      // Security configurations
      maxRedirects: 5,
      maxContentLength: 50 * 1024 * 1024, // 50MB max
      maxBodyLength: 50 * 1024 * 1024, // 50MB max
      validateStatus: (status) => status < 500, // Don't throw for 4xx errors
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor for sanitized logging
    this.client.interceptors.request.use(
      (config) => {
        const sanitizedConfig = {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          timeout: config.timeout,
        };

        core.debug(`🌐 HTTP Request: ${JSON.stringify(sanitizedConfig)}`);
        return config;
      },
      (error) => {
        core.error(`❌ Request setup error: ${error.message}`);
        return Promise.reject(error);
      }
    );

    // Response interceptor for sanitized logging
    this.client.interceptors.response.use(
      (response) => {
        const sanitizedResponse = {
          status: response.status,
          statusText: response.statusText,
          url: response.config.url,
          dataType: typeof response.data,
          dataKeys: response.data && typeof response.data === 'object' 
            ? Object.keys(response.data) 
            : undefined,
        };

        core.debug(`✅ HTTP Response: ${JSON.stringify(sanitizedResponse)}`);
        return response;
      },
      (error) => {
        // Don't log the actual error here - let the retry logic handle it
        return Promise.reject(error);
      }
    );
  }

  /**
   * Execute HTTP request with retry logic and error handling
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    operation: string
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.config.retryDelay;

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        const response = await requestFn();
        
        // Handle HTTP error status codes
        if (response.status >= 400) {
          throw new ApiError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            ErrorHandler.sanitizeForLogging(response.data)
          );
        }

        return response.data;
      } catch (error) {
        lastError = this.transformError(error, operation);

        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          core.warning(`❌ Non-retryable error in ${operation}: ${lastError.message}`);
          throw lastError;
        }

        if (attempt === this.config.retries) {
          core.error(`❌ ${operation} failed after ${this.config.retries} attempts`);
          break;
        }

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 1000;
        const totalDelay = Math.min(delay + jitter, this.config.maxRetryDelay);

        core.warning(
          `⏳ ${operation} attempt ${attempt}/${this.config.retries} failed, retrying in ${Math.round(totalDelay)}ms`
        );

        await this.sleep(totalDelay);
        delay = Math.min(delay * 2, this.config.maxRetryDelay);
      }
    }

    throw lastError || new Error('Unknown error occurred during retry');
  }

  /**
   * Transform axios errors to our custom error types
   */
  private transformError(error: unknown, operation: string): Error {
    if (error instanceof AxiosError) {
      if (error.response) {
        return new ApiError(
          `${operation} failed: ${error.response.status} ${error.response.statusText}`,
          error.response.status,
          ErrorHandler.sanitizeForLogging(error.response.data)
        );
      } else if (error.request) {
        return new NetworkError(
          `${operation} failed: Network error - ${error.message}`,
          error
        );
      } else {
        return new NetworkError(
          `${operation} failed: Request setup error - ${error.message}`,
          error
        );
      }
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error(`${operation} failed: ${String(error)}`);
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof AxiosError && error.response) {
      const status = error.response.status;
      // Don't retry client errors (4xx) except for specific cases
      const retryable4xx = [408, 429]; // Timeout, Rate limit
      return status >= 400 && status < 500 && !retryable4xx.includes(status);
    }
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * GET request with retry logic
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.executeWithRetry(
      () => this.client.get<T>(url, config),
      `GET ${url}`
    );
  }

  /**
   * POST request with retry logic
   */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.executeWithRetry(
      () => this.client.post<T>(url, data, config),
      `POST ${url}`
    );
  }

  /**
   * PUT request with retry logic
   */
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.executeWithRetry(
      () => this.client.put<T>(url, data, config),
      `PUT ${url}`
    );
  }

  /**
   * DELETE request with retry logic
   */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.executeWithRetry(
      () => this.client.delete<T>(url, config),
      `DELETE ${url}`
    );
  }

  /**
   * Create request headers with API key
   */
  static createAuthHeaders(apiKey: string): Record<string, string> {
    return {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    };
  }
}