import * as core from '@actions/core';
import { AnalysisClient } from './analysis-client';
import { GitHubClient } from './github-client';
import { S3Uploader } from './s3-uploader';
import { ActionInputs, ActionOutputs } from './types';

/**
 * Parse action inputs from environment variables
 */
function getActionInputs(): ActionInputs {
  const workflowRunIdInput = core.getInput('workflow-run-id');
  const analysisApiEndpointInput = core.getInput('analysis-api-endpoint');

  return {
    githubToken: core.getInput('github-token', { required: true }),
    awsAccessKeyId: core.getInput('aws-access-key-id', { required: true }),
    awsSecretAccessKey: core.getInput('aws-secret-access-key', { required: true }),
    awsRegion: core.getInput('aws-region', { required: true }),
    s3Bucket: core.getInput('s3-bucket', { required: true }),
    s3KeyPrefix: core.getInput('s3-key-prefix') || 'build-logs',
    workflowRunId: workflowRunIdInput || undefined,
    analysisApiEndpoint: analysisApiEndpointInput || undefined,
    analysisTimeout: parseInt(core.getInput('analysis-timeout') || '300', 10),
  };
}

/**
 * Set action outputs
 */
function setActionOutputs(outputs: ActionOutputs): void {
  core.setOutput('s3-url', outputs.s3Url);
  core.setOutput('analysis-status', outputs.analysisStatus);
  core.setOutput('issues-found', outputs.issuesFound);
  core.setOutput('analysis-results', outputs.analysisResults);
}

/**
 * Main action execution
 */
async function run(): Promise<void> {
  try {
    core.info('🚀 Starting Build Log Analyzer Action');

    // Parse inputs
    const inputs = getActionInputs();

    // Validate required inputs
    if (!inputs.githubToken) {
      throw new Error('GitHub token is required');
    }
    if (!inputs.s3Bucket) {
      throw new Error('S3 bucket name is required');
    }

    core.info('✅ All required inputs validated');

    // Initialize clients
    core.info('🔧 Initializing clients...');
    const githubClient = new GitHubClient(inputs.githubToken);
    const s3Uploader = new S3Uploader(
      inputs.awsAccessKeyId,
      inputs.awsSecretAccessKey,
      inputs.awsRegion,
      inputs.s3Bucket,
      inputs.s3KeyPrefix
    );

    // Step 1: Get workflow information
    core.startGroup('📋 Fetching Workflow Information');
    const workflowRun = await githubClient.getWorkflowRun(inputs.workflowRunId);
    core.info(`Workflow: ${workflowRun.name}`);
    core.info(`Run ID: ${workflowRun.id}`);
    core.info(`Status: ${workflowRun.status || 'Unknown'}`);
    core.info(`Conclusion: ${workflowRun.conclusion || 'N/A'}`);
    core.endGroup();

    // Step 2: Download logs
    core.startGroup('📥 Downloading Build Logs');
    const logs = await githubClient.getAllWorkflowLogs(workflowRun.id);

    if (logs.length === 0) {
      core.warning('No logs found for this workflow run');
      setActionOutputs({
        s3Url: '',
        analysisStatus: 'failed',
        issuesFound: 0,
        analysisResults: JSON.stringify({ error: 'No logs found' }),
      });
      return;
    }

    core.info(`📄 Downloaded ${logs.length} log files`);
    const totalLogSize = logs.reduce((sum, log) => sum + log.content.length, 0);
    core.info(`📊 Total log size: ${(totalLogSize / 1024 / 1024).toFixed(2)} MB`);
    core.endGroup();

    // Step 3: Upload logs to S3
    core.startGroup('☁️ Uploading Logs to S3');
    const s3Results = await s3Uploader.uploadAllLogs(logs, workflowRun.id, workflowRun.name);

    if (s3Results.length === 0) {
      throw new Error('Failed to upload any logs to S3');
    }

    // Also create a consolidated log file
    const consolidatedResult = await s3Uploader.uploadConsolidatedLogs(
      logs,
      workflowRun.id,
      workflowRun.name
    );

    core.info(`✅ Uploaded ${s3Results.length} individual log files`);
    core.info(`✅ Created consolidated log file: ${consolidatedResult.location}`);
    core.endGroup();

    // Step 4: Analyze logs
    core.startGroup('🔍 Analyzing Logs');
    let analysisResult;
    let analysisStatus = 'success';

    try {
      // Create analysis client (even if endpoint is not provided for mock analysis)
      const analysisClient = new AnalysisClient(
        inputs.analysisApiEndpoint || 'mock-endpoint',
        inputs.analysisTimeout
      );

      const repository = process.env.GITHUB_REPOSITORY || 'unknown/unknown';

      analysisResult = await analysisClient.analyzeLogsWithAPI(
        logs,
        {
          runId: workflowRun.id,
          name: workflowRun.name,
          repository,
        },
        s3Results
      );

      // Display results
      analysisClient.displayResults(analysisResult);

      analysisStatus = analysisResult.status;
    } catch (error) {
      core.error(`Analysis failed: ${error}`);
      analysisStatus = 'failed';
      analysisResult = {
        status: 'failed' as const,
        issues: [],
        summary: {
          totalIssues: 0,
          criticalIssues: 0,
          highIssues: 0,
          mediumIssues: 0,
          lowIssues: 0,
        },
        processingTime: 0,
        recommendations: ['Analysis failed. Check action logs for details.'],
      };
    }
    core.endGroup();

    // Step 5: Set outputs
    core.startGroup('📤 Setting Outputs');
    const outputs: ActionOutputs = {
      s3Url: consolidatedResult.location,
      analysisStatus,
      issuesFound: analysisResult.issues.length,
      analysisResults: JSON.stringify(analysisResult, null, 2),
    };

    setActionOutputs(outputs);

    // Summary
    core.info('\n🎉 Action completed successfully!');
    core.info(`📊 Analysis Status: ${analysisStatus}`);
    core.info(`🔍 Issues Found: ${analysisResult.issues.length}`);
    core.info(`☁️  S3 URL: ${consolidatedResult.location}`);

    if (analysisResult.issues.length > 0) {
      const criticalCount = analysisResult.summary.criticalIssues;
      const highCount = analysisResult.summary.highIssues;

      if (criticalCount > 0 || highCount > 0) {
        core.warning(`⚠️  Found ${criticalCount} critical and ${highCount} high severity issues`);
      }
    }

    core.endGroup();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Action failed: ${errorMessage}`);

    // Set failure outputs
    setActionOutputs({
      s3Url: '',
      analysisStatus: 'failed',
      issuesFound: 0,
      analysisResults: JSON.stringify({ error: errorMessage }),
    });
  }
}

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  core.error(`Unhandled promise rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', error => {
  core.error(`Uncaught exception: ${error.message}`);
  core.error(error.stack || '');
  process.exit(1);
});

// Run the action
if (require.main === module) {
  run();
}

export { run };
