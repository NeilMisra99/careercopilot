import type { GmailApiMessage, GmailApiMessagePayloadPart } from './types';
import { GMAIL_API_BASE_URL } from './types';

/**
 * Decode base64url string (Gmail API uses base64url encoding)
 */
export function base64UrlDecode(input: string): string {
	let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
	// Pad with '=' characters if necessary
	while (base64.length % 4) {
		base64 += '=';
	}
	try {
		return atob(base64);
	} catch (e: any) {
		console.error(
			'[gmail-api] base64UrlDecode: Failed to decode base64url string (atob failed):',
			e.message,
			'Input was:',
			input.substring(0, 100),
		);
		try {
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		} catch (e2: any) {
			console.error('[gmail-api] base64UrlDecode: UTF-8 decoding fallback also failed:', e2.message);
			return '';
		}
	}
}

/**
 * Fetch email attachment content from Gmail API
 */
export async function fetchAttachment(messageId: string, attachmentId: string, accessToken: string): Promise<string | null> {
	try {
		console.log(`[gmail-api] fetchAttachment: Fetching attachment ${attachmentId} for message ${messageId}`);

		const attachmentUrl = `${GMAIL_API_BASE_URL}/me/messages/${messageId}/attachments/${attachmentId}`;
		const response = await fetch(attachmentUrl, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			console.error(`[gmail-api] fetchAttachment: Failed to fetch attachment ${attachmentId}:`, response.status, response.statusText);
			return null;
		}

		const attachmentData = (await response.json()) as { data?: string; size?: number; attachmentId?: string };
		if (attachmentData.data) {
			const content = base64UrlDecode(attachmentData.data);
			console.log(`[gmail-api] fetchAttachment: Successfully fetched attachment content (${content.length} characters)`);
			return content;
		} else {
			console.warn(`[gmail-api] fetchAttachment: Attachment ${attachmentId} has no data field`);
			return null;
		}
	} catch (error) {
		console.error(`[gmail-api] fetchAttachment: Error fetching attachment ${attachmentId}:`, error);
		return null;
	}
}

/**
 * Extract email body parts (text and HTML) from Gmail API message payload
 * Enhanced extractor that handles both inline data and attachment-based content
 */
export async function extractBodyParts(
	payload: any,
	messageId: string,
	accessToken: string,
): Promise<{ text: string | null; html: string | null }> {
	let textBody: string | null = null;
	let htmlBody: string | null = null;

	console.log('[gmail-api] extractBodyParts: Starting extraction for message', messageId);
	console.log(
		'[gmail-api] extractBodyParts: Payload structure:',
		JSON.stringify(
			{
				mimeType: payload.mimeType,
				hasParts: !!payload.parts,
				partsCount: payload.parts?.length || 0,
				hasBody: !!payload.body,
				bodyHasData: !!payload.body?.data,
				bodyHasAttachmentId: !!payload.body?.attachmentId,
				bodySize: payload.body?.size || 0,
			},
			null,
			2,
		),
	);

	const parts = payload.parts;
	if (parts) {
		console.log(`[gmail-api] extractBodyParts: Payload has ${parts.length} parts.`);
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			console.log(
				`[gmail-api] extractBodyParts: Part ${i}:`,
				JSON.stringify(
					{
						mimeType: part.mimeType,
						hasData: !!part.body?.data,
						hasAttachmentId: !!part.body?.attachmentId,
						bodySize: part.body?.size || 0,
						filename: part.filename || '(no filename)',
						hasParts: !!part.parts,
						partsCount: part.parts?.length || 0,
					},
					null,
					2,
				),
			);

			if (part.mimeType === 'text/plain') {
				if (part.body?.data) {
					console.log('[gmail-api] extractBodyParts: Found text/plain part with inline data.');
					textBody = base64UrlDecode(part.body.data);
					console.log(`[gmail-api] extractBodyParts: Decoded text/plain content length: ${textBody.length}`);
				} else if (part.body?.attachmentId) {
					console.log('[gmail-api] extractBodyParts: Found text/plain part with attachmentId, fetching...');
					const attachmentContent = await fetchAttachment(messageId, part.body.attachmentId, accessToken);
					if (attachmentContent) {
						textBody = attachmentContent;
						console.log(`[gmail-api] extractBodyParts: Fetched text/plain attachment content length: ${textBody.length}`);
					}
				} else {
					console.log('[gmail-api] extractBodyParts: text/plain part has no data or attachmentId');
				}
			} else if (part.mimeType === 'text/html') {
				if (part.body?.data) {
					console.log('[gmail-api] extractBodyParts: Found text/html part with inline data.');
					htmlBody = base64UrlDecode(part.body.data);
					console.log(`[gmail-api] extractBodyParts: Decoded text/html content length: ${htmlBody.length}`);
				} else if (part.body?.attachmentId) {
					console.log('[gmail-api] extractBodyParts: Found text/html part with attachmentId, fetching...');
					const attachmentContent = await fetchAttachment(messageId, part.body.attachmentId, accessToken);
					if (attachmentContent) {
						htmlBody = attachmentContent;
						console.log(`[gmail-api] extractBodyParts: Fetched text/html attachment content length: ${htmlBody.length}`);
					}
				} else {
					console.log('[gmail-api] extractBodyParts: text/html part has no data or attachmentId');
				}
			} else if (part.mimeType.startsWith('multipart/') && part.parts) {
				console.log('[gmail-api] extractBodyParts: Found multipart, recursing.');
				const nestedParts = await extractBodyParts(part, messageId, accessToken);
				if (nestedParts.text && !textBody) {
					textBody = nestedParts.text;
					console.log(`[gmail-api] extractBodyParts: Got text from nested multipart: ${textBody.length} chars`);
				}
				if (nestedParts.html && !htmlBody) {
					htmlBody = nestedParts.html;
					console.log(`[gmail-api] extractBodyParts: Got HTML from nested multipart: ${htmlBody.length} chars`);
				}
			}
		}
	} else if (payload.body) {
		console.log(`[gmail-api] extractBodyParts: Payload has no 'parts', checking direct body with mimeType: ${payload.mimeType}`);
		if (payload.mimeType === 'text/plain') {
			if (payload.body.data) {
				textBody = base64UrlDecode(payload.body.data);
				console.log(`[gmail-api] extractBodyParts: Decoded direct text/plain content length: ${textBody.length}`);
			} else if (payload.body.attachmentId) {
				console.log('[gmail-api] extractBodyParts: Direct body has attachmentId, fetching...');
				const attachmentContent = await fetchAttachment(messageId, payload.body.attachmentId, accessToken);
				if (attachmentContent) {
					textBody = attachmentContent;
					console.log(`[gmail-api] extractBodyParts: Fetched direct text/plain attachment content length: ${textBody.length}`);
				}
			}
		} else if (payload.mimeType === 'text/html') {
			if (payload.body.data) {
				htmlBody = base64UrlDecode(payload.body.data);
				console.log(`[gmail-api] extractBodyParts: Decoded direct text/html content length: ${htmlBody.length}`);
			} else if (payload.body.attachmentId) {
				console.log('[gmail-api] extractBodyParts: Direct body has attachmentId, fetching...');
				const attachmentContent = await fetchAttachment(messageId, payload.body.attachmentId, accessToken);
				if (attachmentContent) {
					htmlBody = attachmentContent;
					console.log(`[gmail-api] extractBodyParts: Fetched direct text/html attachment content length: ${htmlBody.length}`);
				}
			}
		}
	} else {
		console.log('[gmail-api] extractBodyParts: Payload has no body or parts!');
	}

	// Log a sample of the content for debugging
	if (textBody) {
		console.log(`[gmail-api] extractBodyParts: Text body sample (first 200 chars): ${textBody.substring(0, 200)}...`);
	}
	if (htmlBody) {
		console.log(`[gmail-api] extractBodyParts: HTML body sample (first 200 chars): ${htmlBody.substring(0, 200)}...`);
	}

	console.log(
		`[gmail-api] extractBodyParts: Finished. Text found: ${!!textBody} (${textBody?.length || 0} chars), HTML found: ${!!htmlBody} (${htmlBody?.length || 0} chars)`,
	);
	return { text: textBody, html: htmlBody };
}

/**
 * Get email header value by name (case-insensitive)
 */
export function getEmailHeader(headers: { name: string; value: string }[] | undefined, name: string): string | undefined {
	return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}
