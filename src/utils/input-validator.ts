import { ValidationError } from './error-handler';
import { ActionInputs } from '../types';

/**
 * Comprehensive input validation with security checks
 */
export class InputValidator {
  /**
   * Validate all action inputs
   */
  static validateInputs(inputs: Partial<ActionInputs>): ActionInputs {
    const validatedInputs: ActionInputs = {
      apiKey: this.validateApiKey(inputs.apiKey),
      apiEndpoint: this.validateApiEndpoint(inputs.apiEndpoint),
      githubToken: this.validateGithubToken(inputs.githubToken),
      workflowRunId: this.validateWorkflowRunId(inputs.workflowRunId),
      retryAttempts: this.validateRetryAttempts(inputs.retryAttempts),
      retryDelay: this.validateRetryDelay(inputs.retryDelay),
      s3LogPath: this.validateS3LogPath(inputs.s3LogPath),
    };

    return validatedInputs;
  }

  /**
   * Validate API key format and security requirements
   */
  private static validateApiKey(apiKey?: string): string {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new ValidationError('API key is required and must be a string', 'api-key');
    }

    const trimmedKey = apiKey.trim();
    
    if (trimmedKey.length === 0) {
      throw new ValidationError('API key cannot be empty', 'api-key');
    }

    if (trimmedKey.length < 10) {
      throw new ValidationError('API key appears to be too short (minimum 10 characters)', 'api-key');
    }

    if (trimmedKey.length > 500) {
      throw new ValidationError('API key appears to be too long (maximum 500 characters)', 'api-key');
    }

    // Check for common patterns that might indicate test/dummy keys
    const forbiddenPatterns = [
      /^test/i,
      /^demo/i,
      /^sample/i,
      /^example/i,
      /^dummy/i,
      /^fake/i,
      /^placeholder/i,
      /123456/,
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(trimmedKey)) {
        throw new ValidationError(
          'API key appears to be a test/dummy key. Please use a valid API key',
          'api-key'
        );
      }
    }

    return trimmedKey;
  }

  /**
   * Validate API endpoint URL format and security
   */
  private static validateApiEndpoint(apiEndpoint?: string): string {
    if (!apiEndpoint || typeof apiEndpoint !== 'string') {
      throw new ValidationError('API endpoint is required and must be a string', 'api-endpoint');
    }

    const trimmedEndpoint = apiEndpoint.trim();

    if (trimmedEndpoint.length === 0) {
      throw new ValidationError('API endpoint cannot be empty', 'api-endpoint');
    }

    try {
      const url = new URL(trimmedEndpoint);
      
      // Security checks
      if (url.protocol !== 'https:') {
        throw new ValidationError('API endpoint must use HTTPS for security', 'api-endpoint');
      }

      // Check for suspicious localhost/private IPs in production
      const suspiciousHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
      if (suspiciousHosts.includes(url.hostname.toLowerCase())) {
        // Only allow localhost in development/testing environments
        const isTestEnv = process.env.NODE_ENV === 'development' || 
                          process.env.NODE_ENV === 'test' ||
                          process.env.ACT === 'true';
        
        if (!isTestEnv) {
          throw new ValidationError(
            'Localhost endpoints are not allowed in production', 
            'api-endpoint'
          );
        }
      }

      return trimmedEndpoint;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Invalid API endpoint URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'api-endpoint'
      );
    }
  }

  /**
   * Validate GitHub token format
   */
  private static validateGithubToken(githubToken?: string): string {
    if (!githubToken || typeof githubToken !== 'string') {
      throw new ValidationError('GitHub token is required and must be a string', 'github-token');
    }

    const trimmedToken = githubToken.trim();

    if (trimmedToken.length === 0) {
      throw new ValidationError('GitHub token cannot be empty', 'github-token');
    }

    // GitHub tokens have specific format patterns
    const validPatterns = [
      /^ghp_[a-zA-Z0-9]{36}$/, // Personal access token
      /^gho_[a-zA-Z0-9]{36}$/, // OAuth token  
      /^ghu_[a-zA-Z0-9]{36}$/, // User-to-server token
      /^ghs_[a-zA-Z0-9]{36}$/, // Server-to-server token
      /^ghr_[a-zA-Z0-9]{76}$/, // Refresh token
    ];

    const isValidFormat = validPatterns.some(pattern => pattern.test(trimmedToken));
    if (!isValidFormat) {
      // Don't be too strict as GitHub might introduce new formats
      // Just warn about suspicious patterns
      if (trimmedToken.length < 20) {
        throw new ValidationError(
          'GitHub token appears to be too short. Please verify the token format',
          'github-token'
        );
      }
    }

    return trimmedToken;
  }

  /**
   * Validate workflow run ID format
   */
  private static validateWorkflowRunId(workflowRunId?: string): string | undefined {
    if (workflowRunId === undefined || workflowRunId === '') {
      return undefined;
    }

    if (typeof workflowRunId !== 'string') {
      throw new ValidationError('Workflow run ID must be a string', 'workflow-run-id');
    }

    const trimmedId = workflowRunId.trim();

    if (!/^\d+$/.test(trimmedId)) {
      throw new ValidationError('Workflow run ID must be a numeric string', 'workflow-run-id');
    }

    const numericId = parseInt(trimmedId, 10);
    if (numericId <= 0) {
      throw new ValidationError('Workflow run ID must be a positive number', 'workflow-run-id');
    }

    if (numericId > Number.MAX_SAFE_INTEGER) {
      throw new ValidationError('Workflow run ID is too large', 'workflow-run-id');
    }

    return trimmedId;
  }

  /**
   * Validate retry attempts with reasonable limits
   */
  private static validateRetryAttempts(retryAttempts?: number | string): number {
    let attempts: number;

    if (retryAttempts === undefined || retryAttempts === '') {
      return 3; // Default value
    }

    if (typeof retryAttempts === 'string') {
      const parsed = parseInt(retryAttempts.trim(), 10);
      if (isNaN(parsed)) {
        throw new ValidationError('Retry attempts must be a valid number', 'retry-attempts');
      }
      attempts = parsed;
    } else if (typeof retryAttempts === 'number') {
      attempts = retryAttempts;
    } else {
      throw new ValidationError('Retry attempts must be a number', 'retry-attempts');
    }

    if (attempts < 1) {
      throw new ValidationError('Retry attempts must be at least 1', 'retry-attempts');
    }

    if (attempts > 10) {
      throw new ValidationError('Retry attempts cannot exceed 10 (to prevent infinite loops)', 'retry-attempts');
    }

    return attempts;
  }

  /**
   * Validate retry delay with reasonable limits
   */
  private static validateRetryDelay(retryDelay?: number | string): number {
    let delay: number;

    if (retryDelay === undefined || retryDelay === '') {
      return 2; // Default value in seconds
    }

    if (typeof retryDelay === 'string') {
      const parsed = parseInt(retryDelay.trim(), 10);
      if (isNaN(parsed)) {
        throw new ValidationError('Retry delay must be a valid number', 'retry-delay');
      }
      delay = parsed;
    } else if (typeof retryDelay === 'number') {
      delay = retryDelay;
    } else {
      throw new ValidationError('Retry delay must be a number', 'retry-delay');
    }

    if (delay < 1) {
      throw new ValidationError('Retry delay must be at least 1 second', 'retry-delay');
    }

    if (delay > 60) {
      throw new ValidationError('Retry delay cannot exceed 60 seconds', 'retry-delay');
    }

    return delay;
  }

  /**
   * Validate S3 log path for security and format
   */
  private static validateS3LogPath(s3LogPath?: string): string {
    if (!s3LogPath || typeof s3LogPath !== 'string') {
      return 'logs'; // Default value
    }

    const trimmedPath = s3LogPath.trim();

    if (trimmedPath.length === 0) {
      return 'logs'; // Default value
    }

    // Security checks for path traversal
    if (trimmedPath.includes('..')) {
      throw new ValidationError('S3 log path cannot contain path traversal sequences (..))', 's3-log-path');
    }

    if (trimmedPath.startsWith('/')) {
      throw new ValidationError('S3 log path cannot start with forward slash', 's3-log-path');
    }

    // Check for invalid characters
    const invalidChars = ['<', '>', ':', '"', '|', '?', '*', '\\'];
    for (const char of invalidChars) {
      if (trimmedPath.includes(char)) {
        throw new ValidationError(
          `S3 log path contains invalid character: ${char}`, 
          's3-log-path'
        );
      }
    }

    // Check length
    if (trimmedPath.length > 200) {
      throw new ValidationError('S3 log path cannot exceed 200 characters', 's3-log-path');
    }

    return trimmedPath;
  }
}