/**
 * Content Processing Utilities
 * Functions for cleaning and processing email content
 */

/**
 * Clean HTML content and extract meaningful text
 * Handles quoted-printable encoding, removes HTML tags, and extracts meaningful content
 */
export function cleanHtmlContent(html: string): string {
	try {
		// Step 1: Decode quoted-printable encoding
		let cleaned = html
			.replace(/=\r?\n/g, '') // Remove soft line breaks
			.replace(/=([0-9A-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16))) // Decode =XX
			.replace(/=3D/g, '=') // Common quoted-printable sequences
			.replace(/=20/g, ' ')
			.replace(/=2E/g, '.')
			.replace(/=2C/g, ',');

		// Step 2: Remove HTML tags but preserve text content
		cleaned = cleaned
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style blocks
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script blocks
			.replace(/<!--[\s\S]*?-->/g, '') // Remove HTML comments
			.replace(/<[^>]+>/g, ' ') // Remove all HTML tags
			.replace(/&nbsp;/g, ' ') // Convert HTML entities
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");

		// Step 3: Clean up whitespace and formatting
		cleaned = cleaned
			.replace(/\s+/g, ' ') // Multiple spaces to single space
			.replace(/\n\s*\n/g, '\n') // Multiple newlines to single
			.trim();

		// Step 4: Extract meaningful content (remove headers, footers, etc.)
		// Look for common email content patterns
		const lines = cleaned.split('\n');
		const meaningfulLines = lines.filter((line) => {
			const trimmed = line.trim();
			// Skip empty lines, very short lines, or lines that look like headers/footers
			if (trimmed.length < 10) return false;
			// Skip lines that are just URLs or email addresses
			if (/^https?:\/\//.test(trimmed) || /^[\w.-]+@[\w.-]+\.\w+$/.test(trimmed)) return false;
			// Skip lines that are clearly navigation or footer content
			if (/privacy|unsubscribe|click here|facebook|linkedin|instagram/i.test(trimmed)) return false;
			return true;
		});

		const result = meaningfulLines.join('\n').trim();

		// Log the cleaning result for debugging
		console.log(`[queue-consumer] HTML cleaned: ${html.length} chars -> ${result.length} chars`);
		if (result.length < html.length * 0.1) {
			// If we cleaned too aggressively, fall back to basic HTML stripping
			console.log(`[queue-consumer] Cleaning too aggressive, using basic HTML stripping`);
			return html
				.replace(/<[^>]+>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
		}

		return result;
	} catch (error) {
		console.warn(`[queue-consumer] Error cleaning HTML, using original:`, error);
		return html;
	}
}
