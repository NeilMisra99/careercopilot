import createClient from "./create-client";
import { decryptTokenWithEnvKey, encryptTokenWithEnvKey } from "./crypto";
import { SupabaseTokenRepository, type TokenData } from "./token-repository";

/**
 * Token Manager for Trigger.dev Gmail Integration
 *
 * Handles secure token storage, retrieval, and refresh operations
 * for Gmail API integration within Trigger.dev tasks.
 *
 * Features:
 * - Automatic encryption/decryption using environment key
 * - Token refresh with OAuth2 flow
 * - Supabase integration with service role permissions
 * - Error handling and validation
 */
export class TokenManager {
  private repository: SupabaseTokenRepository;

  constructor() {
    const supabase = createClient();
    this.repository = new SupabaseTokenRepository(supabase);
  }

  /**
   * Store encrypted tokens for a user
   */
  async storeTokens(
    userId: string,
    provider: string,
    accessToken: string,
    refreshToken: string | null,
    expiresAt: Date,
    scopes: string[] | null = null,
  ): Promise<void> {
    const encryptedAccessToken = await encryptTokenWithEnvKey(accessToken);
    const encryptedRefreshToken = refreshToken
      ? await encryptTokenWithEnvKey(refreshToken)
      : null;

    const tokenData: TokenData = {
      accessTokenEncrypted: encryptedAccessToken,
      refreshTokenEncrypted: encryptedRefreshToken,
      accessTokenExpiresAt: expiresAt.toISOString(),
      scopes: scopes,
    };

    await this.repository.put(userId, provider, tokenData);
  }

  /**
   * Retrieve and decrypt access token for a user
   * Returns null if no valid tokens exist
   */
  async getAccessToken(
    userId: string,
    provider: string,
  ): Promise<string | null> {
    const tokenData = await this.repository.get(userId, provider);
    if (!tokenData) {
      return null;
    }

    // Check if token is expired
    const expiresAt = new Date(tokenData.accessTokenExpiresAt);
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    if (expiresAt.getTime() - now.getTime() <= bufferTime) {
      // Token is expired or about to expire, try to refresh
      const refreshedToken = await this.refreshAccessToken(userId, provider);
      return refreshedToken;
    }

    // Token is still valid
    return await decryptTokenWithEnvKey(tokenData.accessTokenEncrypted);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    userId: string,
    provider: string,
  ): Promise<string | null> {
    const tokenData = await this.repository.get(userId, provider);
    if (!tokenData?.refreshTokenEncrypted) {
      throw new Error(
        `No refresh token available for user ${userId}, provider ${provider}`,
      );
    }

    const refreshToken = await decryptTokenWithEnvKey(
      tokenData.refreshTokenEncrypted,
    );

    // Make OAuth2 refresh request
    const refreshResponse = await this.makeRefreshRequest(refreshToken);

    if (!refreshResponse.access_token) {
      throw new Error(
        "Failed to refresh access token: no access_token in response",
      );
    }

    // Store new tokens
    const expiresAt = new Date(Date.now() + refreshResponse.expires_in * 1000);
    const newRefreshToken = refreshResponse.refresh_token || refreshToken; // Some providers don't return new refresh token

    await this.storeTokens(
      userId,
      provider,
      refreshResponse.access_token,
      newRefreshToken,
      expiresAt,
      tokenData.scopes,
    );

    return refreshResponse.access_token;
  }

  /**
   * Make OAuth2 token refresh request to Google
   */
  private async makeRefreshRequest(refreshToken: string): Promise<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required",
      );
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errorData}`);
    }

    return await response.json();
  }

  /**
   * Check if user has valid tokens
   */
  async hasValidTokens(userId: string, provider: string): Promise<boolean> {
    return await this.repository.hasValidTokens(userId, provider);
  }

  /**
   * Remove tokens for a user (e.g., on disconnect)
   */
  async removeTokens(userId: string, provider: string): Promise<void> {
    await this.repository.delete(userId, provider);
  }

  /**
   * Get user's email integrations with token validation
   */
  async getUserIntegrations(userId: string): Promise<
    {
      id: string;
      provider: string;
      email_address: string;
      sync_status: string;
      hasValidTokens: boolean;
      scopes: string[] | null;
    }[]
  > {
    const supabase = createClient();

    const { data: integrations, error } = await supabase
      .from("user_email_integrations")
      .select("id, provider, email_address, sync_status, scopes")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Failed to retrieve user integrations: ${error.message}`);
    }

    // Check token validity for each integration
    const results = await Promise.all(
      integrations.map(async (integration) => ({
        ...integration,
        hasValidTokens: await this.hasValidTokens(userId, integration.provider),
      })),
    );

    return results;
  }
}
