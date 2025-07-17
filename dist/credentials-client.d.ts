import { AuthClient } from './auth-client';
import { CloudCredentialsResponse, HttpClient } from './types';
/**
 * Client for fetching cloud credentials from the API
 * Follows Single Responsibility Principle by handling only credential fetching
 */
export declare class CredentialsClient {
    private baseUrl;
    private authClient;
    private httpClient;
    constructor(baseUrl: string, authClient: AuthClient, httpClient: HttpClient);
    /**
     * Fetch temporary AWS S3 credentials from the API
     * @returns Promise<CloudCredentialsResponse> - The cloud credentials response
     * @throws Error if authentication fails or API call fails
     */
    getCloudCredentials(): Promise<CloudCredentialsResponse>;
    /**
     * Check if the provided credentials are still valid
     * @param credentials - The credentials to validate
     * @returns boolean - Whether the credentials are still valid
     */
    areCredentialsValid(credentials: CloudCredentialsResponse): boolean;
    /**
     * Get fresh credentials if current ones are expired or about to expire
     * @param currentCredentials - Current credentials to check
     * @returns Promise<CloudCredentialsResponse> - Fresh credentials
     */
    refreshCredentialsIfNeeded(currentCredentials?: CloudCredentialsResponse): Promise<CloudCredentialsResponse>;
    /**
     * Handle credentials-related errors with detailed messaging
     * @param error - The error to handle
     * @throws Error - Always throws with appropriate error message
     */
    private handleCredentialsError;
}
