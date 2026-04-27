import { AuthPlugin } from "./auth-plugin";

export class NoAuthPlugin implements AuthPlugin {
    async getAuthHeaders(url: string, requestBody: any): Promise<Record<string, string>> {
        return {};
    }
}