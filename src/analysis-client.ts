import * as core from '@actions/core';
import axios from 'axios';
import { AnalysisResult, LogContent, S3UploadResult } from './types';

export class AnalysisClient {
  private apiEndpoint: string;
  private timeout: number;

  constructor(apiEndpoint: string, timeout: number = 300) {
    this.apiEndpoint = apiEndpoint;
    this.timeout = timeout * 1000; // Convert to milliseconds
  }

  /**
   * Show progress indication while analysis is running
   */
  private showAnalysisProgress(): NodeJS.Timeout {
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
   * Call custom API endpoint for log analysis
   * Currently commented out as requested - uncomment and modify as needed
   */
  async analyzeLogsWithAPI(
    logs: LogContent[],
    workflowInfo: {
      runId: number;
      name: string;
      repository: string;
    },
    s3Results: S3UploadResult[]
  ): Promise<AnalysisResult> {
    const progressInterval = this.showAnalysisProgress();

    try {
      core.info(`🚀 Starting analysis with custom API endpoint`);
      core.info(`📊 Analyzing ${logs.length} log files from workflow: ${workflowInfo.name}`);

      /*
      // CUSTOM API INTEGRATION - UNCOMMENT AND MODIFY AS NEEDED
      const requestPayload = {
        workflowInfo,
        logs: logs.map(log => ({
          jobName: log.jobName,
          jobId: log.jobId,
          timestamp: log.timestamp,
          // Send S3 URLs instead of full content for better performance
          s3Url: s3Results.find(result => 
            result.key.includes(log.jobName.replace(/[^a-zA-Z0-9-_]/g, '_'))
          )?.location,
          // Uncomment below to send content directly (may hit API limits)
          // content: log.content
        })),
        metadata: {
          repository: workflowInfo.repository,
          timestamp: new Date().toISOString(),
          s3Bucket: s3Results[0]?.bucket,
        }
      };

      const response: AxiosResponse<AnalysisResult> = await axios.post(
        this.apiEndpoint,
        requestPayload,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'GitHub-Action-Log-Analyzer/1.0',
            // Add authentication headers as needed
            // 'Authorization': `Bearer ${process.env.API_TOKEN}`,
            // 'X-API-Key': process.env.API_KEY,
          },
        }
      );

      clearInterval(progressInterval);
      
      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }

      const analysisResult = response.data;
      */

      // MOCK ANALYSIS RESULT - REPLACE WITH ACTUAL API CALL ABOVE
      const analysisResult: AnalysisResult = await this.createMockAnalysisResult(logs);

      clearInterval(progressInterval);

      core.info(`✅ Analysis completed successfully!`);
      core.info(`📋 Found ${analysisResult.issues.length} issues total`);
      core.info(`🔴 Critical: ${analysisResult.summary.criticalIssues}`);
      core.info(`🟠 High: ${analysisResult.summary.highIssues}`);
      core.info(`🟡 Medium: ${analysisResult.summary.mediumIssues}`);
      core.info(`🟢 Low: ${analysisResult.summary.lowIssues}`);

      return analysisResult;
    } catch (error) {
      clearInterval(progressInterval);

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          core.error(`⏰ Analysis timed out after ${this.timeout / 1000} seconds`);
          return this.createTimeoutResult();
        }

        core.error(`🔥 API request failed: ${error.message}`);
        if (error.response) {
          core.error(`Response status: ${error.response.status}`);
          core.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
      } else {
        core.error(`🔥 Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a mock analysis result for demonstration
   * Replace this with actual API integration
   */
  private async createMockAnalysisResult(logs: LogContent[]): Promise<AnalysisResult> {
    // Simulate API processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    const issues = logs.flatMap((log, index) => {
      const mockIssues = [];

      // Simulate finding common CI/CD issues
      if (log.content.toLowerCase().includes('error')) {
        mockIssues.push({
          id: `error-${log.jobId}-${index}`,
          title: 'Build Error Detected',
          description: `Found error in job "${log.jobName}". This may indicate a build failure or configuration issue.`,
          severity: 'high' as const,
          category: 'build-failure',
          jobName: log.jobName,
          solutions: [
            {
              description: 'Check the error message and fix the underlying issue',
              action: 'Review the specific error in the logs and address the root cause',
              confidence: 0.9,
              category: 'fix' as const,
            },
            {
              description: 'Verify dependencies and environment configuration',
              action: 'Ensure all required dependencies are properly installed and configured',
              confidence: 0.7,
              category: 'best-practice' as const,
            },
          ],
        });
      }

      // Add critical security or system failure issues
      if (
        log.content.toLowerCase().includes('fatal') ||
        log.content.toLowerCase().includes('security')
      ) {
        mockIssues.push({
          id: `critical-${log.jobId}-${index}`,
          title: 'Critical System Issue',
          description: `Critical issue detected in job "${log.jobName}". Immediate attention required.`,
          severity: 'critical' as const,
          category: 'system-failure',
          jobName: log.jobName,
          solutions: [
            {
              description: 'Immediate investigation and resolution required',
              action: 'Review logs and system state immediately',
              confidence: 0.95,
              category: 'fix' as const,
            },
          ],
        });
      }

      if (log.content.toLowerCase().includes('warning')) {
        mockIssues.push({
          id: `warning-${log.jobId}-${index}`,
          title: 'Build Warning Found',
          description: `Warning detected in job "${log.jobName}". While not critical, this should be addressed.`,
          severity: 'medium' as const,
          category: 'build-warning',
          jobName: log.jobName,
          solutions: [
            {
              description: 'Address the warning to improve code quality',
              action: 'Review and fix the warning-causing code',
              confidence: 0.8,
              category: 'optimization' as const,
            },
          ],
        });
      }

      if (log.content.includes('deprecated')) {
        mockIssues.push({
          id: `deprecated-${log.jobId}-${index}`,
          title: 'Deprecated Feature Usage',
          description: `Deprecated feature usage detected in job "${log.jobName}".`,
          severity: 'low' as const,
          category: 'deprecated',
          jobName: log.jobName,
          solutions: [
            {
              description: 'Update to use the latest recommended approach',
              action: 'Replace deprecated features with their modern equivalents',
              confidence: 0.95,
              category: 'best-practice' as const,
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
  private createTimeoutResult(): AnalysisResult {
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
  displayResults(result: AnalysisResult): void {
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
    } else {
      core.info(`\n📋 Summary:`);
      core.info(`  Total Issues: ${result.summary.totalIssues}`);
      if (result.summary.criticalIssues > 0)
        core.info(`  🔴 Critical: ${result.summary.criticalIssues}`);
      if (result.summary.highIssues > 0) core.info(`  🟠 High: ${result.summary.highIssues}`);
      if (result.summary.mediumIssues > 0) core.info(`  🟡 Medium: ${result.summary.mediumIssues}`);
      if (result.summary.lowIssues > 0) core.info(`  🟢 Low: ${result.summary.lowIssues}`);

      // Display issues grouped by severity
      const severityOrder = ['critical', 'high', 'medium', 'low'] as const;

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

  private getSeverityEmoji(severity: string): string {
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
