import type { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import { getKeyMaterial } from '../../crypto';
import { getValidGmailAccessToken } from '../auth/utils';
import type { Env, GmailMessageMetadata } from '../types';

/**
 * Fetch Gmail messages
 */
export async function getGmailMessages(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return c.json({ error: 'User not authenticated' }, 401);
	}

	const tokenEncryptionKeyString = c.env.TOKEN_ENCRYPTION_KEY;
	if (!tokenEncryptionKeyString) {
		return c.json({ error: 'Server configuration error: Missing encryption key.' }, 500);
	}

	try {
		const cryptoKey = await getKeyMaterial(tokenEncryptionKeyString);
		const accessToken = await getValidGmailAccessToken(c, user.id, cryptoKey);

		if (!accessToken) {
			if (c.res.status === 404) return c.json({ error: 'Gmail integration not found.' }, 404);
			if (c.res.status === 401) return c.json({ error: 'Re-authentication required for Gmail.' }, 401);
			return c.json({ error: 'Failed to get Gmail access token.' }, (c.res.status || 500) as any);
		}

		// Fetch the integrated Gmail address
		let integratedGmailAddress: string | null = null;
		const db = c.var.db;
		if (db) {
			try {
				const integrationResult = await db<any[]>`
					SELECT email_address FROM user_email_integrations
					WHERE user_id = ${user.id} AND provider = 'gmail' LIMIT 1;
				`;
				if (integrationResult && integrationResult.length > 0 && integrationResult[0].email_address) {
					integratedGmailAddress = integrationResult[0].email_address;
				}
			} catch (dbError: any) {}
		}

		// List last 10 messages (excluding social/promotions)
		const listMessagesResponse = await fetch(
			`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=-category:social -category:promotions -category:forums`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);

		if (!listMessagesResponse.ok) {
			const errorData = await listMessagesResponse.json();
			return c.json({ error: 'Failed to list Gmail messages.', details: errorData }, listMessagesResponse.status as any);
		}

		const listData = (await listMessagesResponse.json()) as {
			messages?: { id: string; threadId: string }[];
			nextPageToken?: string;
			resultSizeEstimate?: number;
		};

		if (!listData.messages || listData.messages.length === 0) {
			return c.json({ messages: [], message: 'No messages found or no new messages matching criteria.' });
		}

		// Helper to extract header value
		const getHeader = (headers: { name: string; value: string }[], name: string) => headers.find((h) => h.name === name)?.value || '';

		// Fetch details for each message
		const messageDetailsPromises = listData.messages.map(async (msg) => {
			const detailResponse = await fetch(
				`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
				{ headers: { Authorization: `Bearer ${accessToken}` } },
			);
			if (!detailResponse.ok) {
				return { id: msg.id, error: `Failed to fetch details (${detailResponse.status})` };
			}
			const detailData = (await detailResponse.json()) as GmailMessageMetadata;

			return {
				id: detailData.id,
				threadId: detailData.threadId,
				snippet: detailData.snippet,
				subject: getHeader(detailData.payload.headers, 'Subject'),
				from: getHeader(detailData.payload.headers, 'From'),
				date: getHeader(detailData.payload.headers, 'Date'),
			};
		});

		const messages = await Promise.all(messageDetailsPromises);

		return c.json({ messages, integratedGmailAddress });
	} catch (error: any) {
		return c.json({ error: 'An unexpected error occurred while fetching emails.', details: error.message }, 500);
	}
}

/**
 * Get failed emails for review
 */
export async function getFailedEmails(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return c.json({ error: 'Not authenticated' }, 401);
	}

	try {
		const db = c.var.db;
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		// Fetch failed emails for the current user
		const failedEmails = await db`
			SELECT 
				id, email_id, email_thread_id, email_subject, email_from, 
				email_date, email_snippet, email_body, failure_reason,
				failure_count, failed_at, needs_review, reviewed_at
			FROM public.failed_email_reviews 
			WHERE user_id = ${user.id} AND needs_review = TRUE
			ORDER BY failed_at DESC
			LIMIT 50
		`;

		return c.json({
			failedEmails: failedEmails || [],
			message:
				failedEmails?.length > 0
					? `Found ${failedEmails.length} failed emails that need review`
					: 'No failed emails found - all your emails were processed successfully!',
		});
	} catch (error: any) {
		return c.json({ error: 'Failed to fetch failed emails', details: error.message }, 500);
	}
}

/**
 * Process failed email manually
 */
export async function processFailedEmail(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return c.json({ error: 'Not authenticated' }, 401);
	}

	try {
		const { emailId, companyName, jobTitle, status, notes } = await c.req.json();

		if (!emailId || !companyName) {
			return c.json({ error: 'Email ID and company name are required' }, 400);
		}

		const db = c.var.db;
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		// Create application from manually provided data
		const applicationDate = new Date().toISOString().split('T')[0];

		const result = await db`
			INSERT INTO public.applications (
				user_id, company_name, role, status, application_date, notes,
				source_email_id, manual_entry
			)
			VALUES (
				${user.id}, 
				${companyName}, 
				${jobTitle || 'Unknown Role'},
				${status || 'Applied'},
				${applicationDate}::date,
				${notes || 'Manually entered from failed email parsing'},
				${emailId},
				TRUE
			)
			ON CONFLICT (user_id, dedupe_key) DO UPDATE
			SET
				role = EXCLUDED.role,
				status = EXCLUDED.status,
				notes = EXCLUDED.notes,
				updated_at = NOW()
			RETURNING *;
		`;

		if (result && result.count > 0) {
			return c.json({
				success: true,
				message: 'Application created from failed email',
				application: result[0],
			});
		} else {
			return c.json({ error: 'Failed to create application' }, 500);
		}
	} catch (error: any) {
		return c.json({ error: 'Failed to process email', details: error.message }, 500);
	}
}
