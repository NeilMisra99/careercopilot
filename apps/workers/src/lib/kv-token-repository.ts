import type { KVNamespace } from '@cloudflare/workers-types';
import type { TokenData, TokenRepository } from './token-repository';

/**
 * An implementation of TokenRepository that uses Cloudflare KV for storage.
 */
export class KvTokenRepository implements TokenRepository {
	private kv: KVNamespace;
	private keyPrefix = 'tokens:'; // To namespace keys within KV

	constructor(kv: KVNamespace) {
		if (!kv) {
			throw new Error('KvTokenRepository: KVNamespace is required.');
		}
		this.kv = kv;
	}

	private getKey(userId: string, provider: string): string {
		return `${this.keyPrefix}${userId}:${provider}`;
	}

	async get(userId: string, provider: string): Promise<TokenData | null> {
		const key = this.getKey(userId, provider);
		const storedValue = await this.kv.get(key);

		if (storedValue === null) {
			return null;
		}

		try {
			return JSON.parse(storedValue) as TokenData;
		} catch (e) {
			console.error(`KvTokenRepository: Failed to parse TokenData from KV for key ${key}`, e);
			// Optionally delete the corrupted key or handle appropriately
			// await this.kv.delete(key);
			return null;
		}
	}

	async put(userId: string, provider: string, tokenData: TokenData): Promise<void> {
		const key = this.getKey(userId, provider);
		// KV expects a string or ArrayBuffer. We'll store as a JSON string.
		// Expiration can be set via metadata if needed, or rely on access_token_expires_at within the object.
		// For simplicity, we won't set KV-level TTL here but it's an option.
		await this.kv.put(key, JSON.stringify(tokenData));
	}

	async delete(userId: string, provider: string): Promise<void> {
		const key = this.getKey(userId, provider);
		await this.kv.delete(key);
	}
}
