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
