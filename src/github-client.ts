import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { Job, LogContent, WorkflowRun } from './types';

export class GitHubClient {
  private octokit: ReturnType<typeof getOctokit>;
  private owner: string;
  private repo: string;

  constructor(token: string) {
    // Align with GitHub Docs API versioning
    this.octokit = getOctokit(token, {
      request: {
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
          Accept: 'application/vnd.github+json',
        },
      },
    });

    // Get repository info from environment
    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository) {
      throw new Error('GITHUB_REPOSITORY environment variable not found');
    }

    const parts = repository.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid repository format: ${repository}`);
    }

    this.owner = parts[0]!;
    this.repo = parts[1]!;
  }

  /**
   * Get workflow run by ID or current run
   */
  async getWorkflowRun(runId?: string): Promise<WorkflowRun> {
    try {
      const currentRunId = runId || process.env.GITHUB_RUN_ID;
      if (!currentRunId) {
        throw new Error('No workflow run ID provided and GITHUB_RUN_ID not found');
      }

      core.info(`Fetching workflow run: ${currentRunId}`);

      const { data: run } = await this.octokit.rest.actions.getWorkflowRun({
        owner: this.owner,
        repo: this.repo,
        run_id: parseInt(currentRunId, 10),
      });

      return {
        id: run.id,
        name: run.name || 'Unknown Workflow',
        status: run.status || null,
        conclusion: run.conclusion,
        created_at: run.created_at,
        updated_at: run.updated_at,
        html_url: run.html_url,
        repository: {
          full_name: `${this.owner}/${this.repo}`,
          html_url: `https://github.com/${this.owner}/${this.repo}`,
        },
      };
    } catch (error) {
      // When running locally with `act` there may be no real run ID – fall back to a mock.
      if (process.env.ACT === 'true') {
        core.warning('act environment detected – returning mock workflow run');
        const now = new Date().toISOString();
        return {
          id: 0,
          name: 'local-act-run',
          status: 'completed',
          conclusion: 'success',
          created_at: now,
          updated_at: now,
          html_url: '',
          repository: {
            full_name: `${this.owner}/${this.repo}`,
            html_url: `https://github.com/${this.owner}/${this.repo}`,
          },
        };
      }

      const envRunId = runId || process.env.GITHUB_RUN_ID;
      const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
      const workflowName = process.env.GITHUB_WORKFLOW || 'Unknown Workflow';
      const now = new Date().toISOString();

      if (!envRunId) {
        throw new Error(
          `Failed to fetch workflow run and no fallback run ID available: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      core.warning(
        `Could not fetch workflow run from API; continuing with environment-based metadata: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      return {
        id: parseInt(envRunId, 10),
        name: workflowName,
        status: null,
        conclusion: null,
        created_at: now,
        updated_at: now,
        html_url: `${serverUrl}/${this.owner}/${this.repo}/actions/runs/${envRunId}`,
        repository: {
          full_name: `${this.owner}/${this.repo}`,
          html_url: `${serverUrl}/${this.owner}/${this.repo}`,
        },
      };
    }
  }

  /**
   * Get all jobs for a workflow run
   */
  async getWorkflowJobs(runId: number): Promise<Job[]> {
    try {
      core.info(`Fetching jobs for workflow run: ${runId}`);

      const { data } = await this.octokit.rest.actions.listJobsForWorkflowRun({
        owner: this.owner,
        repo: this.repo,
        run_id: runId,
      });

      return data.jobs.map(job => ({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        started_at: job.started_at,
        completed_at: job.completed_at,
        html_url: job.html_url || null,
      }));
    } catch (error) {
      core.warning(
        `Could not list jobs for workflow run ${runId}; continuing without job details: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Download logs for a specific job
   */
  async getJobLogs(jobId: number, jobName: string): Promise<LogContent> {
    try {
      core.info(`Downloading logs for job: ${jobName} (${jobId})`);

      const response = await this.octokit.rest.actions.downloadJobLogsForWorkflowRun({
        owner: this.owner,
        repo: this.repo,
        job_id: jobId,
      });

      // The response is a redirect URL to the actual logs
      const logsResponse = await fetch(response.url);
      if (!logsResponse.ok) {
        throw new Error(`Failed to download logs: ${logsResponse.statusText}`);
      }

      const logContent = await logsResponse.text();

      return {
        jobName,
        jobId,
        content: logContent,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      core.warning(
        `Failed to download logs for job ${jobName}; continuing without logs: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Return empty content instead of failing completely
      return {
        jobName,
        jobId,
        content: 'Log content unavailable',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Download logs for all jobs in a workflow run
   */
  async getAllWorkflowLogs(runId: number): Promise<LogContent[]> {
    try {
      // Shortcut for act – create a single mock log and return.
      if (process.env.ACT === 'true') {
        core.warning('act environment detected – returning mock workflow logs');
        return [
          {
            jobName: 'local-act-job',
            jobId: 0,
            content: 'This is a mock log generated during an act run.',
            timestamp: new Date().toISOString(),
          },
        ];
      }

      const jobs = await this.getWorkflowJobs(runId);
      core.info(`Found ${jobs.length} jobs to download logs for`);

      const logPromises = jobs.map(job => this.getJobLogs(job.id, job.name));

      const logs = await Promise.all(logPromises);
      const successfulLogs = logs.filter(log => !log.content.startsWith('Failed to download logs'));

      core.info(`Successfully downloaded logs for ${successfulLogs.length}/${jobs.length} jobs`);
      return logs;
    } catch (error) {
      core.error(`Failed to download workflow logs: ${error}`);
      throw new Error(
        `Failed to download workflow logs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
