import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Represents the core token data that needs to be stored and retrieved.
 */
export interface TokenData {
  refreshTokenEncrypted: string | null;
  accessTokenEncrypted: string;
  accessTokenExpiresAt: string; // ISO string format
  scopes: string[] | null;
}

/**
 * Interface for a repository that handles storing and retrieving OAuth token data.
 */
export interface TokenRepository {
  /**
   * Retrieves token data for a given user and provider.
   * @param userId The ID of the user.
   * @param provider The name of the OAuth provider (e.g., 'gmail').
   * @returns A Promise that resolves to TokenData if found, otherwise null.
   */
  get(userId: string, provider: string): Promise<TokenData | null>;

  /**
   * Stores or updates token data for a given user and provider.
   * @param userId The ID of the user.
   * @param provider The name of the OAuth provider.
   * @param tokenData The token data to store.
   * @returns A Promise that resolves when the operation is complete.
   */
  put(userId: string, provider: string, tokenData: TokenData): Promise<void>;

  /**
   * Deletes token data for a given user and provider.
   * @param userId The ID of the user.
   * @param provider The name of the OAuth provider.
   * @returns A Promise that resolves when the operation is complete.
   */
  delete(userId: string, provider: string): Promise<void>;
}

/**
 * Supabase implementation of TokenRepository for Trigger.dev tasks.
 *
 * Features:
 * - Uses Supabase client instead of raw postgres
 * - Proper UPSERT logic for token storage
 * - Maintains same encryption security standards
 * - Transaction-safe operations
 * - Compatible with Trigger.dev service role client
 */
export class SupabaseTokenRepository implements TokenRepository {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    if (!supabase) {
      throw new Error("SupabaseTokenRepository: Supabase client is required.");
    }
    this.supabase = supabase;
  }

  async get(userId: string, provider: string): Promise<TokenData | null> {
    const { data, error } = await this.supabase
      .from("user_email_integrations")
      .select(
        "refresh_token_encrypted, access_token_encrypted, access_token_expires_at, scopes",
      )
      .eq("user_id", userId)
      .eq("provider", provider)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned - this is expected, not an error
        return null;
      }
      throw new Error(`Failed to retrieve token data: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      refreshTokenEncrypted: data.refresh_token_encrypted,
      accessTokenEncrypted: data.access_token_encrypted,
      accessTokenExpiresAt: data.access_token_expires_at,
      scopes: data.scopes, // Already parsed by Supabase (jsonb column)
    };
  }

  async put(
    userId: string,
    provider: string,
    tokenData: TokenData,
  ): Promise<void> {
    // Use UPSERT to handle both new integrations and token updates
    const { error } = await this.supabase
      .from("user_email_integrations")
      .upsert(
        {
          user_id: userId,
          provider: provider,
          refresh_token_encrypted: tokenData.refreshTokenEncrypted,
          access_token_encrypted: tokenData.accessTokenEncrypted,
          access_token_expires_at: tokenData.accessTokenExpiresAt,
          scopes: tokenData.scopes,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id, provider", // Assuming composite unique constraint
        },
      );

    if (error) {
      throw new Error(`Failed to store token data: ${error.message}`);
    }
  }

  async delete(userId: string, provider: string): Promise<void> {
    // Nullify token fields while preserving integration metadata
    const { error } = await this.supabase
      .from("user_email_integrations")
      .update({
        refresh_token_encrypted: null,
        access_token_encrypted: null,
        access_token_expires_at: null,
        scopes: null,
        sync_status: "disabled", // Mark as disabled when tokens are removed
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", provider);

    if (error) {
      throw new Error(`Failed to delete token data: ${error.message}`);
    }
  }

  /**
   * Helper method to check if a user has valid tokens for a provider
   */
  async hasValidTokens(userId: string, provider: string): Promise<boolean> {
    const tokenData = await this.get(userId, provider);
    if (!tokenData || !tokenData.accessTokenEncrypted) {
      return false;
    }

    // Check if access token is expired
    const expiresAt = new Date(tokenData.accessTokenExpiresAt);
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    return expiresAt.getTime() - now.getTime() > bufferTime;
  }

  /**
   * Helper method to update only specific token fields
   */
  async updateTokens(
    userId: string,
    provider: string,
    updates: Partial<TokenData>,
  ): Promise<void> {
    const updateData: {
      updated_at: string;
      access_token_encrypted?: string;
      refresh_token_encrypted?: string | null;
      access_token_expires_at?: string;
      scopes?: string[] | null;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (updates.accessTokenEncrypted !== undefined) {
      updateData.access_token_encrypted = updates.accessTokenEncrypted;
    }
    if (updates.refreshTokenEncrypted !== undefined) {
      updateData.refresh_token_encrypted = updates.refreshTokenEncrypted;
    }
    if (updates.accessTokenExpiresAt !== undefined) {
      updateData.access_token_expires_at = updates.accessTokenExpiresAt;
    }
    if (updates.scopes !== undefined) {
      updateData.scopes = updates.scopes;
    }

    const { error } = await this.supabase
      .from("user_email_integrations")
      .update(updateData)
      .eq("user_id", userId)
      .eq("provider", provider);

    if (error) {
      throw new Error(`Failed to update token data: ${error.message}`);
    }
  }
}
