import * as core from '@actions/core';
import { run } from '../src/index';

// Mock the inputs
const mockGetInput = core.getInput as jest.MockedFunction<typeof core.getInput>;
const mockSetFailed = core.setFailed as jest.MockedFunction<typeof core.setFailed>;

describe('Build Log Analyzer Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock inputs
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-token': 'mock-token',
        'aws-access-key-id': 'mock-access-key',
        'aws-secret-access-key': 'mock-secret-key',
        'aws-region': 'us-east-1',
        's3-bucket': 'mock-bucket',
        's3-key-prefix': 'build-logs',
        'analysis-timeout': '300',
      };
      return inputs[name] || '';
    });
  });

  it('should export run function', () => {
    expect(typeof run).toBe('function');
  });

  it('should fail when required inputs are missing', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 'github-token') return '';
      return 'mock-value';
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('GitHub token is required'));
  });

  it('should fail when S3 bucket is missing', async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === 's3-bucket') return '';
      if (name === 'github-token') return 'mock-token';
      return 'mock-value';
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(
      expect.stringContaining('S3 bucket name is required')
    );
  });

  // Note: More comprehensive tests would require mocking the GitHub API and AWS SDK
  // which is beyond the scope of this basic setup
});
