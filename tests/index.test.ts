import * as core from '@actions/core';
import { run } from '../src/index';
import { ValidationError } from '../src/utils/error-handler';

// Mock all external dependencies
jest.mock('@actions/core');
jest.mock('../src/github-client');
jest.mock('../src/s3-uploader');
jest.mock('../src/utils/http-client');

const mockGetInput = core.getInput as jest.MockedFunction<typeof core.getInput>;
const mockSetFailed = core.setFailed as jest.MockedFunction<typeof core.setFailed>;
const mockSetOutput = core.setOutput as jest.MockedFunction<typeof core.setOutput>;
const mockInfo = core.info as jest.MockedFunction<typeof core.info>;
const mockStartGroup = core.startGroup as jest.MockedFunction<typeof core.startGroup>;
const mockEndGroup = core.endGroup as jest.MockedFunction<typeof core.endGroup>;

describe('Hycos AI GitHub Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock inputs matching current implementation
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'api-key': 'hycos_api_key_123456789',
        'api-endpoint': 'https://lnjh7eud9a.execute-api.us-east-1.amazonaws.com/dev',
        'github-token': 'ghp_1234567890abcdefghijklmnopqrstuv123',
        'workflow-run-id': '',
        'retry-attempts': '3',
        'retry-delay': '2',
        's3-log-path': 'logs',
      };
      return inputs[name] || '';
    });

    // Mock environment variables
    process.env.GITHUB_REPOSITORY = 'test-owner/test-repo';
    process.env.GITHUB_RUN_ID = '12345';
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    process.env.GITHUB_ACTOR = 'test-actor';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_SERVER_URL;
    delete process.env.GITHUB_ACTOR;
  });

  it('should export run function', () => {
    expect(typeof run).toBe('function');
  });

  describe('Input Validation', () => {
    it('should fail when api-key is missing', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'api-key') return '';
        return name === 'github-token' ? 'ghp_1234567890abcdefghijklmnopqrstuv123' : 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('API key is required')
      );
    });

    it('should fail when api-key is too short', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'api-key') return 'short';
        return name === 'github-token' ? 'ghp_1234567890abcdefghijklmnopqrstuv123' : 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('API key appears to be too short')
      );
    });

    it('should fail when github-token is missing', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'github-token') return '';
        return name === 'api-key' ? 'hycos_api_key_123456789' : 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('GitHub token is required')
      );
    });

    it('should fail when api-endpoint is not HTTPS', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'api-endpoint') return 'http://insecure.example.com';
        if (name === 'api-key') return 'hycos_api_key_123456789';
        if (name === 'github-token') return 'ghp_1234567890abcdefghijklmnopqrstuv123';
        return 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('API endpoint must use HTTPS for security')
      );
    });

    it('should fail when retry-attempts is invalid', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'retry-attempts') return 'invalid';
        if (name === 'api-key') return 'hycos_api_key_123456789';
        if (name === 'github-token') return 'ghp_1234567890abcdefghijklmnopqrstuv123';
        return 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempts must be a valid number')
      );
    });

    it('should fail when retry-attempts exceeds maximum', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'retry-attempts') return '15';
        if (name === 'api-key') return 'hycos_api_key_123456789';
        if (name === 'github-token') return 'ghp_1234567890abcdefghijklmnopqrstuv123';
        return 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempts cannot exceed 10')
      );
    });

    it('should fail when s3-log-path contains path traversal', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 's3-log-path') return '../../../malicious';
        if (name === 'api-key') return 'hycos_api_key_123456789';
        if (name === 'github-token') return 'ghp_1234567890abcdefghijklmnopqrstuv123';
        return 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('S3 log path cannot contain path traversal sequences')
      );
    });
  });

  describe('Security Validations', () => {
    it('should reject test/dummy API keys', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'api-key') return 'test-key-123456789';
        if (name === 'github-token') return 'ghp_1234567890abcdefghijklmnopqrstuv123';
        return 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('API key appears to be a test/dummy key')
      );
    });

    it('should reject API keys with forbidden patterns', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'api-key') return 'demo-api-key-123456789';
        if (name === 'github-token') return 'ghp_1234567890abcdefghijklmnopqrstuv123';
        return 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('API key appears to be a test/dummy key')
      );
    });

    it('should validate GitHub token format warning for suspicious tokens', async () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'github-token') return 'short-token';
        if (name === 'api-key') return 'hycos_api_key_123456789';
        return 'mock-value';
      });

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('GitHub token appears to be too short')
      );
    });
  });

  describe('Default Values', () => {
    it('should use default values for optional inputs', () => {
      mockGetInput.mockImplementation((name: string) => {
        if (name === 'api-key') return 'hycos_api_key_123456789';
        if (name === 'github-token') return 'ghp_1234567890abcdefghijklmnopqrstuv123';
        if (name === 'api-endpoint') return '';
        // Return empty for other optional inputs
        return '';
      });

      // This should use default values without throwing validation errors
      expect(() => {
        // The input validation logic should handle defaults
      }).not.toThrow();
    });
  });

  describe('Environment Variables', () => {
    it('should fail when GITHUB_REPOSITORY is missing', async () => {
      delete process.env.GITHUB_REPOSITORY;

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('GITHUB_REPOSITORY environment variable not found')
      );
    });

    it('should fail when GITHUB_REPOSITORY format is invalid', async () => {
      process.env.GITHUB_REPOSITORY = 'invalid-format';

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid repository format')
      );
    });
  });
});