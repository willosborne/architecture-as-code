export interface AuthPlugin {
    getAuthHeaders(url: string, requestBody: any): Promise<Record<string, string>>;
}