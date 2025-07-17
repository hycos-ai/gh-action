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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
class GitHubClient {
    octokit;
    owner;
    repo;
    constructor(token) {
        this.octokit = (0, github_1.getOctokit)(token);
        // Get repository info from environment
        const repository = process.env.GITHUB_REPOSITORY;
        if (!repository) {
            throw new Error('GITHUB_REPOSITORY environment variable not found');
        }
        const parts = repository.split('/');
        if (parts.length !== 2) {
            throw new Error(`Invalid repository format: ${repository}`);
        }
        this.owner = parts[0];
        this.repo = parts[1];
    }
    /**
     * Get workflow run by ID or current run
     */
    async getWorkflowRun(runId) {
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
        }
        catch (error) {
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
            core.error(`Failed to fetch workflow run: ${error}`);
            throw new Error(`Failed to fetch workflow run: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Get all jobs for a workflow run
     */
    async getWorkflowJobs(runId) {
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
        }
        catch (error) {
            core.error(`Failed to fetch workflow jobs: ${error}`);
            throw new Error(`Failed to fetch workflow jobs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Download logs for a specific job
     */
    async getJobLogs(jobId, jobName) {
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
        }
        catch (error) {
            core.warning(`Failed to download logs for job ${jobName}: ${error}`);
            // Return empty content instead of failing completely
            return {
                jobName,
                jobId,
                content: `Failed to download logs: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date().toISOString(),
            };
        }
    }
    /**
     * Download logs for all jobs in a workflow run
     */
    async getAllWorkflowLogs(runId) {
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
        }
        catch (error) {
            core.error(`Failed to download workflow logs: ${error}`);
            throw new Error(`Failed to download workflow logs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.GitHubClient = GitHubClient;
//# sourceMappingURL=github-client.js.map