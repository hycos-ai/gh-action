import * as core from '@actions/core';

/**
 * Custom error types for better error categorization
 */
export class ValidationError extends Error {
  public field?: string;
  
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class ApiError extends Error {
  public status?: number;
  public response?: unknown;
  
  constructor(message: string, status?: number, response?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
  }
}

export class NetworkError extends Error {
  public cause?: Error;
  
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export class S3Error extends Error {
  public operation?: string;
  
  constructor(message: string, operation?: string) {
    super(message);
    this.name = 'S3Error';
    this.operation = operation;
  }
}

/**
 * Centralized error handler with consistent logging and categorization
 */
export class ErrorHandler {
  /**
   * Handle and log errors consistently
   */
  static handleError(error: unknown, context: string): never {
    const errorInfo = this.extractErrorInfo(error);
    
    core.startGroup(`❌ Error in ${context}`);
    core.error(`Error Type: ${errorInfo.type}`);
    core.error(`Error Message: ${errorInfo.message}`);
    
    if (errorInfo.details) {
      core.error(`Error Details: ${errorInfo.details}`);
    }
    
    if (errorInfo.stack) {
      core.debug(`Stack Trace: ${errorInfo.stack}`);
    }
    
    // Provide contextual troubleshooting information
    this.provideTroubleshootingInfo(errorInfo.type);
    
    core.endGroup();
    
    throw new Error(`${context}: ${errorInfo.message}`);
  }

  /**
   * Extract structured information from any error type
   */
  private static extractErrorInfo(error: unknown): {
    type: string;
    message: string;
    details?: string;
    stack?: string;
  } {
    if (error instanceof ValidationError) {
      return {
        type: 'Validation Error',
        message: error.message,
        details: error.field ? `Field: ${error.field}` : undefined,
        stack: error.stack,
      };
    }

    if (error instanceof ApiError) {
      return {
        type: 'API Error',
        message: error.message,
        details: error.status ? `HTTP Status: ${error.status}` : undefined,
        stack: error.stack,
      };
    }

    if (error instanceof NetworkError) {
      return {
        type: 'Network Error',
        message: error.message,
        details: error.cause?.message,
        stack: error.stack,
      };
    }

    if (error instanceof S3Error) {
      return {
        type: 'S3 Error',
        message: error.message,
        details: error.operation ? `Operation: ${error.operation}` : undefined,
        stack: error.stack,
      };
    }

    if (error instanceof Error) {
      return {
        type: 'Unknown Error',
        message: error.message,
        stack: error.stack,
      };
    }

    return {
      type: 'Unknown Error',
      message: String(error),
    };
  }

  /**
   * Provide contextual troubleshooting information
   */
  private static provideTroubleshootingInfo(errorType: string): void {
    switch (errorType) {
      case 'Validation Error':
        core.info('💡 Check input parameters and their format');
        break;
      case 'API Error':
        core.info('💡 Check API endpoint and authentication credentials');
        core.info('💡 Verify API service is operational');
        break;
      case 'Network Error':
        core.info('💡 Check network connectivity');
        core.info('💡 Verify firewall/proxy settings');
        break;
      case 'S3 Error':
        core.info('💡 Check S3 credentials and bucket permissions');
        core.info('💡 Verify bucket exists and is accessible');
        break;
      default:
        core.info('💡 Check logs above for more details');
        break;
    }
  }

  /**
   * Safely sanitize error data for logging (remove sensitive information)
   */
  static sanitizeForLogging(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sensitiveKeys = [
      'password',
      'token',
      'key',
      'secret',
      'authorization',
      'x-api-key',
      'accesskeyid',
      'secretaccesskey',
      'sessiontoken',
    ];

    const sanitized = { ...data };
    
    for (const [key, value] of Object.entries(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        // eslint-disable-next-line security/detect-object-injection
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        // eslint-disable-next-line security/detect-object-injection
        sanitized[key] = this.sanitizeForLogging(value);
      }
    }

    return sanitized;
  }
}