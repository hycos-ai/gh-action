import { AuthClient } from './auth-client';
import { AnalysisResult, LogContent, S3UploadResult } from './types';
export declare class AnalysisClient {
    private apiEndpoint;
    private timeout;
    private authClient;
    constructor(apiEndpoint: string, timeout?: number, authClient?: AuthClient);
    /**
     * Set authentication client
     */
    setAuthClient(authClient: AuthClient): void;
    /**
     * Show progress indication while analysis is running
     */
    private showAnalysisProgress;
    /**
     * Call API endpoint for log analysis with authentication
     */
    analyzeLogsWithAPI(logs: LogContent[], workflowInfo: {
        runId: number;
        name: string;
        repository: string;
    }, s3Results: S3UploadResult[]): Promise<AnalysisResult>;
    /**
     * Handle API errors and fallback to mock analysis
     */
    private handleAnalysisError;
    /**
     * Create a mock analysis result for demonstration or fallback
     */
    private createMockAnalysisResult;
    /**
     * Create timeout result
     */
    private createTimeoutResult;
    /**
     * Format and display analysis results
     */
    displayResults(result: AnalysisResult): void;
    private getSeverityEmoji;
}
