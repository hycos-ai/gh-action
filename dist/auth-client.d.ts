import { AuthLoginResponse, HttpClient, RetryOptions, TokenStorage } from './types';
/**
 * Authentication client following SOLID principles
 */
export declare class AuthClient {
    private baseUrl;
    private tokenStorage;
    private httpClient;
    private userInfo;
    constructor(baseUrl: string, tokenStorage?: TokenStorage, httpClient?: HttpClient, retryOptions?: RetryOptions);
    /**
     * Login with username and password to get authentication token
     */
    login(username: string, password: string): Promise<AuthLoginResponse>;
    /**
     * Get the current authentication token
     */
    getToken(): string | null;
    /**
     * Get current user information
     */
    getUserInfo(): {
        username: string;
        roles: string[];
    } | null;
    /**
     * Check if currently authenticated
     */
    isAuthenticated(): boolean;
    /**
     * Get authentication headers for API requests
     */
    getAuthHeaders(): Record<string, string>;
    /**
     * Clear authentication data (logout)
     */
    logout(): void;
    /**
     * Test the authentication token with a simple API call
     */
    validateToken(): Promise<boolean>;
    /**
     * Handle authentication errors with detailed messaging
     */
    private handleAuthError;
}
//# sourceMappingURL=auth-client.d.ts.map