/**
 * Configuration interface for the action inputs
 */
export interface ActionInputs {
  githubToken: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  s3Bucket: string;
  s3KeyPrefix: string;
  workflowRunId?: string;
  analysisApiEndpoint?: string;
  analysisTimeout: number;
}

/**
 * GitHub workflow run data
 */
export interface WorkflowRun {
  id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

/**
 * Job information from workflow run
 */
export interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string | null;
  html_url: string | null;
}

/**
 * Log content structure
 */
export interface LogContent {
  jobName: string;
  jobId: number;
  content: string;
  timestamp: string;
}

/**
 * S3 upload result
 */
export interface S3UploadResult {
  location: string;
  bucket: string;
  key: string;
  etag: string;
}

/**
 * Solution object for issues
 */
export interface Solution {
  description: string;
  action: string;
  confidence: number;
  category: 'fix' | 'optimization' | 'best-practice';
}

/**
 * Issue object found in analysis
 */
export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  lineNumber?: number;
  jobName: string;
  solutions: Solution[];
}

/**
 * Analysis result from API
 */
export interface AnalysisResult {
  status: 'success' | 'failed' | 'timeout';
  issues: Issue[];
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
  };
  processingTime: number;
  recommendations: string[];
}

/**
 * Action outputs
 */
export interface ActionOutputs {
  s3Url: string;
  analysisStatus: string;
  issuesFound: number;
  analysisResults: string;
}
