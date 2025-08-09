import { Job, LogContent, WorkflowRun } from './types';
export declare class GitHubClient {
    private octokit;
    private owner;
    private repo;
    constructor(token: string);
    /**
     * Get workflow run by ID or current run
     */
    getWorkflowRun(runId?: string): Promise<WorkflowRun>;
    /**
     * Get all jobs for a workflow run
     */
    getWorkflowJobs(runId: number): Promise<Job[]>;
    /**
     * Download logs for a specific job
     */
    getJobLogs(jobId: number, jobName: string): Promise<LogContent>;
    /**
     * Download logs for all jobs in a workflow run
     */
    getAllWorkflowLogs(runId: number): Promise<LogContent[]>;
}
