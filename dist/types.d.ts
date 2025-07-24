/**
 * Configuration interface for the action inputs
 */
export interface ActionInputs {
    username: string;
    password: string;
    apiEndpoint: string;
    githubToken: string;
    workflowRunId?: string;
    retryAttempts: number;
    retryDelay: number;
}
/**
 * Authentication request payload
 */
export interface AuthLoginRequest {
    username: string;
    password: string;
}
/**
 * Authentication response from login API
 */
export interface AuthLoginResponse {
    token: string;
    type: string;
    username: string;
    roles: string[];
}
/**
 * Cloud credentials response from API
 */
export interface CloudCredentialsResponse {
    secretAccessKey: string;
    accessKeyId: string;
    sessionToken: string;
    expiration: string;
    bucket: string;
}
/**
 * File upload information for notification
 */
export interface UploadedFile {
    filename: string;
    fileType: 'LOG';
    bucketName: string;
}
/**
 * Build details for notification
 */
export interface BuildDetails {
    folder: string;
    jobName: string;
    buildNumber: number;
}
/**
 * Server details for notification
 */
export interface ServerDetails {
    serverAddress: string;
    type: string;
}
/**
 * Upload notification request payload
 */
export interface UploadNotificationRequest {
    files: UploadedFile[];
    buildDetails: BuildDetails;
    serverDetails: ServerDetails;
}
/**
 * API Error response structure
 */
export interface ApiErrorResponse {
    error: string;
    message: string;
    statusCode: number;
    timestamp?: string;
    path?: string;
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
    repository: {
        full_name: string;
        html_url: string;
    };
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
    uploadStatus: string;
    filesUploaded: number;
    authStatus: string;
    userInfo: string;
    notificationStatus: string;
}
/**
 * Retry configuration options
 */
export interface RetryOptions {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
}
/**
 * HTTP client interface for dependency injection
 */
export interface HttpClient {
    get<T>(url: string, config?: any): Promise<T>;
    post<T>(url: string, data?: any, config?: any): Promise<T>;
    put<T>(url: string, data?: any, config?: any): Promise<T>;
    delete<T>(url: string, config?: any): Promise<T>;
}
/**
 * S3 client interface for dependency injection
 */
export interface S3Client {
    upload(params: any): Promise<S3UploadResult>;
}
/**
 * Token storage interface
 */
export interface TokenStorage {
    getToken(): string | null;
    setToken(token: string): void;
    clearToken(): void;
    isTokenValid(): boolean;
}
/**
 * Upload notification response from API
 */
export interface UploadNotificationResponse {
    success: boolean;
    analysisId: string;
    analysisUrl?: string;
    message?: string;
}
/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
    data: T;
    status: number;
    message?: string;
}
//# sourceMappingURL=types.d.ts.map