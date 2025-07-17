"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisClient = void 0;
const core = __importStar(require("@actions/core"));
const axios_1 = __importDefault(require("axios"));
class AnalysisClient {
    apiEndpoint;
    timeout;
    authClient = null;
    constructor(apiEndpoint, timeout = 300, authClient) {
        this.apiEndpoint = apiEndpoint;
        this.timeout = timeout * 1000; // Convert to milliseconds
        this.authClient = authClient || null;
    }
    /**
     * Set authentication client
     */
    setAuthClient(authClient) {
        this.authClient = authClient;
    }
    /**
     * Show progress indication while analysis is running
     */
    showAnalysisProgress() {
        let dots = 0;
        const maxDots = 3;
        const interval = setInterval(() => {
            dots = (dots + 1) % (maxDots + 1);
            const dotString = '.'.repeat(dots);
            const spaces = ' '.repeat(maxDots - dots);
            core.info(`🔍 Analysis in progress${dotString}${spaces}`);
        }, 1000);
        return interval;
    }
    /**
     * Call API endpoint for log analysis with authentication
     */
    async analyzeLogsWithAPI(logs, workflowInfo, s3Results) {
        const progressInterval = this.showAnalysisProgress();
        try {
            core.info(`🚀 Starting analysis with API endpoint: ${this.apiEndpoint}`);
            core.info(`📊 Analyzing ${logs.length} log files from workflow: ${workflowInfo.name}`);
            // If no auth client or not authenticated, use mock analysis
            if (!this.authClient || !this.authClient.isAuthenticated()) {
                core.warning('⚠️  No authentication available, using mock analysis');
                return await this.createMockAnalysisResult(logs, progressInterval);
            }
            // Prepare request payload for real API
            const requestPayload = {
                workflowInfo: {
                    runId: workflowInfo.runId,
                    name: workflowInfo.name,
                    repository: workflowInfo.repository,
                },
                logs: logs.map(log => ({
                    jobName: log.jobName,
                    jobId: log.jobId,
                    timestamp: log.timestamp,
                    // Send S3 URLs instead of full content for better performance
                    s3Url: s3Results.find(result => result.key.includes(log.jobName.replace(/[^a-zA-Z0-9-_]/g, '_')))?.location,
                    contentPreview: log.content.substring(0, 1000), // First 1000 chars for preview
                })),
                metadata: {
                    repository: workflowInfo.repository,
                    timestamp: new Date().toISOString(),
                    s3Bucket: s3Results[0]?.bucket,
                    totalLogs: logs.length,
                    totalSize: logs.reduce((sum, log) => sum + log.content.length, 0),
                },
                analysisOptions: {
                    includeCritical: true,
                    includeHigh: true,
                    includeMedium: true,
                    includeLow: true,
                    maxIssues: 100,
                },
            };
            core.info('📤 Sending analysis request to API...');
            const response = await axios_1.default.post(`${this.apiEndpoint}/analyze`, requestPayload, {
                timeout: this.timeout,
                headers: this.authClient.getAuthHeaders(),
            });
            clearInterval(progressInterval);
            if (response.status !== 200) {
                throw new Error(`API returned status ${response.status}: ${response.statusText}`);
            }
            const analysisResult = response.data;
            // Validate response structure
            if (!analysisResult.status || !analysisResult.issues || !analysisResult.summary) {
                throw new Error('Invalid analysis response structure');
            }
            core.info(`✅ Analysis completed successfully!`);
            core.info(`📋 Found ${analysisResult.issues.length} issues total`);
            core.info(`🔴 Critical: ${analysisResult.summary.criticalIssues}`);
            core.info(`🟠 High: ${analysisResult.summary.highIssues}`);
            core.info(`🟡 Medium: ${analysisResult.summary.mediumIssues}`);
            core.info(`🟢 Low: ${analysisResult.summary.lowIssues}`);
            return analysisResult;
        }
        catch (error) {
            clearInterval(progressInterval);
            return this.handleAnalysisError(error, logs);
        }
    }
    /**
     * Handle API errors and fallback to mock analysis
     */
    async handleAnalysisError(error, logs) {
        let errorMessage = 'Analysis failed';
        let shouldFallback = false;
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            const statusCode = axiosError.response?.status || 0;
            if (axiosError.response?.data) {
                const errorData = axiosError.response.data;
                errorMessage = errorData.message || errorData.error || errorMessage;
            }
            else if (axiosError.message) {
                errorMessage = axiosError.message;
            }
            // Handle specific error scenarios
            switch (statusCode) {
                case 401:
                    core.error('🔐 Authentication failed - token may be expired');
                    break;
                case 403:
                    core.error('🚫 Access forbidden - insufficient permissions');
                    break;
                case 404:
                    core.error('🔍 Analysis endpoint not found');
                    shouldFallback = true;
                    break;
                case 429:
                    core.error('⏱️  Rate limit exceeded');
                    break;
                case 500:
                    core.error('🔥 Server error during analysis');
                    shouldFallback = true;
                    break;
                default:
                    core.error(`❌ HTTP ${statusCode}: ${errorMessage}`);
                    shouldFallback = true;
            }
            if (axiosError.code === 'ECONNABORTED') {
                core.error(`⏰ Analysis timed out after ${this.timeout / 1000} seconds`);
                return this.createTimeoutResult();
            }
        }
        else if (error instanceof Error) {
            errorMessage = error.message;
            core.error(`❌ ${errorMessage}`);
            shouldFallback = true;
        }
        else {
            core.error(`❌ Unknown error during analysis: ${String(error)}`);
            shouldFallback = true;
        }
        // Fallback to mock analysis if appropriate
        if (shouldFallback) {
            core.warning('⚠️  Falling back to mock analysis due to API error');
            return await this.createMockAnalysisResult(logs);
        }
        // Return failed result
        return {
            status: 'failed',
            issues: [],
            summary: {
                totalIssues: 0,
                criticalIssues: 0,
                highIssues: 0,
                mediumIssues: 0,
                lowIssues: 0,
            },
            processingTime: 0,
            recommendations: [`Analysis failed: ${errorMessage}`],
        };
    }
    /**
     * Create a mock analysis result for demonstration or fallback
     */
    async createMockAnalysisResult(logs, progressInterval) {
        // Simulate API processing time
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        const issues = logs.flatMap((log, index) => {
            const mockIssues = [];
            // Simulate finding common CI/CD issues
            if (log.content.toLowerCase().includes('error')) {
                mockIssues.push({
                    id: `error-${log.jobId}-${index}`,
                    title: 'Build Error Detected',
                    description: `Found error in job "${log.jobName}". This may indicate a build failure or configuration issue.`,
                    severity: 'high',
                    category: 'build-failure',
                    jobName: log.jobName,
                    solutions: [
                        {
                            description: 'Check the error message and fix the underlying issue',
                            action: 'Review the specific error in the logs and address the root cause',
                            confidence: 0.9,
                            category: 'fix',
                        },
                        {
                            description: 'Verify dependencies and environment configuration',
                            action: 'Ensure all required dependencies are properly installed and configured',
                            confidence: 0.7,
                            category: 'best-practice',
                        },
                    ],
                });
            }
            // Add critical security or system failure issues
            if (log.content.toLowerCase().includes('fatal') ||
                log.content.toLowerCase().includes('security')) {
                mockIssues.push({
                    id: `critical-${log.jobId}-${index}`,
                    title: 'Critical System Issue',
                    description: `Critical issue detected in job "${log.jobName}". Immediate attention required.`,
                    severity: 'critical',
                    category: 'system-failure',
                    jobName: log.jobName,
                    solutions: [
                        {
                            description: 'Immediate investigation and resolution required',
                            action: 'Review logs and system state immediately',
                            confidence: 0.95,
                            category: 'fix',
                        },
                    ],
                });
            }
            if (log.content.toLowerCase().includes('warning')) {
                mockIssues.push({
                    id: `warning-${log.jobId}-${index}`,
                    title: 'Build Warning Found',
                    description: `Warning detected in job "${log.jobName}". While not critical, this should be addressed.`,
                    severity: 'medium',
                    category: 'build-warning',
                    jobName: log.jobName,
                    solutions: [
                        {
                            description: 'Address the warning to improve code quality',
                            action: 'Review and fix the warning-causing code',
                            confidence: 0.8,
                            category: 'optimization',
                        },
                    ],
                });
            }
            if (log.content.includes('deprecated')) {
                mockIssues.push({
                    id: `deprecated-${log.jobId}-${index}`,
                    title: 'Deprecated Feature Usage',
                    description: `Deprecated feature usage detected in job "${log.jobName}".`,
                    severity: 'low',
                    category: 'deprecated',
                    jobName: log.jobName,
                    solutions: [
                        {
                            description: 'Update to use the latest recommended approach',
                            action: 'Replace deprecated features with their modern equivalents',
                            confidence: 0.95,
                            category: 'best-practice',
                        },
                    ],
                });
            }
            return mockIssues;
        });
        const summary = {
            totalIssues: issues.length,
            criticalIssues: issues.filter(i => i.severity === 'critical').length,
            highIssues: issues.filter(i => i.severity === 'high').length,
            mediumIssues: issues.filter(i => i.severity === 'medium').length,
            lowIssues: issues.filter(i => i.severity === 'low').length,
        };
        return {
            status: 'success',
            issues,
            summary,
            processingTime: 2000,
            recommendations: [
                'Address all critical and high severity issues first',
                'Consider implementing automated testing to catch issues earlier',
                'Review and update deprecated dependencies regularly',
                'Monitor build performance and optimize where possible',
            ],
        };
    }
    /**
     * Create timeout result
     */
    createTimeoutResult() {
        return {
            status: 'timeout',
            issues: [],
            summary: {
                totalIssues: 0,
                criticalIssues: 0,
                highIssues: 0,
                mediumIssues: 0,
                lowIssues: 0,
            },
            processingTime: this.timeout,
            recommendations: [
                'Analysis timed out. Consider increasing the timeout value or optimizing the analysis process.',
            ],
        };
    }
    /**
     * Format and display analysis results
     */
    displayResults(result) {
        core.startGroup('📊 Analysis Results');
        if (result.status === 'timeout') {
            core.warning('⏰ Analysis timed out');
            return;
        }
        if (result.status === 'failed') {
            core.error('❌ Analysis failed');
            return;
        }
        if (result.issues.length === 0) {
            core.info('🎉 No issues found! Your build logs look clean.');
        }
        else {
            core.info(`\n📋 Summary:`);
            core.info(`  Total Issues: ${result.summary.totalIssues}`);
            if (result.summary.criticalIssues > 0)
                core.info(`  🔴 Critical: ${result.summary.criticalIssues}`);
            if (result.summary.highIssues > 0)
                core.info(`  🟠 High: ${result.summary.highIssues}`);
            if (result.summary.mediumIssues > 0)
                core.info(`  🟡 Medium: ${result.summary.mediumIssues}`);
            if (result.summary.lowIssues > 0)
                core.info(`  🟢 Low: ${result.summary.lowIssues}`);
            // Display issues grouped by severity
            const severityOrder = ['critical', 'high', 'medium', 'low'];
            severityOrder.forEach(severity => {
                const severityIssues = result.issues.filter(issue => issue.severity === severity);
                if (severityIssues.length > 0) {
                    core.info(`\n${this.getSeverityEmoji(severity)} ${severity.toUpperCase()} ISSUES:`);
                    severityIssues.forEach((issue, index) => {
                        core.info(`\n  ${index + 1}. ${issue.title} (${issue.jobName})`);
                        core.info(`     ${issue.description}`);
                        if (issue.solutions.length > 0) {
                            core.info(`     💡 Solutions:`);
                            issue.solutions.forEach((solution, sIndex) => {
                                core.info(`       ${sIndex + 1}. ${solution.description}`);
                                core.info(`          Action: ${solution.action}`);
                                core.info(`          Confidence: ${Math.round(solution.confidence * 100)}%`);
                            });
                        }
                    });
                }
            });
        }
        if (result.recommendations.length > 0) {
            core.info('\n💡 Recommendations:');
            result.recommendations.forEach((rec, index) => {
                core.info(`  ${index + 1}. ${rec}`);
            });
        }
        core.info(`\n⏱️  Processing time: ${result.processingTime}ms`);
        core.endGroup();
    }
    getSeverityEmoji(severity) {
        switch (severity) {
            case 'critical':
                return '🔴';
            case 'high':
                return '🟠';
            case 'medium':
                return '🟡';
            case 'low':
                return '🟢';
            default:
                return '⚪';
        }
    }
}
exports.AnalysisClient = AnalysisClient;
//# sourceMappingURL=analysis-client.js.map