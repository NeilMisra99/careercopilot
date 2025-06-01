import type { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import type { Env, ScrapingResult } from '../types';

// Import scraping utilities (assuming these exist)
declare const puppeteer: any;
declare function scrapeJobUrlUtil(browser: any, url: string, cacheKV: any, ai: any): Promise<ScrapingResult>;

/**
 * Smart URL scraping endpoint
 */
export async function handleJobScraping(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user) {
		console.error('User not authenticated for /api/job-boards/scrape:', userError);
		return c.json({ error: 'User not authenticated' }, 401);
	}

	const url = c.req.query('url');
	if (!url) {
		return c.json({ error: 'URL parameter is required' }, 400);
	}

	try {
		// Validate URL format
		new URL(url);
	} catch {
		return c.json({ error: 'Invalid URL format' }, 400);
	}

	console.log(`[worker] Smart URL scraping requested for: ${url} by user ${user.id}`);

	let browser: any = null;

	try {
		// Launch browser using Browser Rendering API
		browser = await puppeteer.launch(c.env.BROWSER);
		console.log(`[worker] Browser launched for scraping: ${url}`);

		// Use the job board scraper with AI enhancement
		const scrapingResult: ScrapingResult = await scrapeJobUrlUtil(browser, url, c.env.SCRAPING_CACHE_KV, c.env.AI);

		if (!scrapingResult.success) {
			console.error(`[worker] Scraping failed for ${url}:`, scrapingResult.error);
			return c.json(
				{
					success: false,
					error: scrapingResult.error || 'Failed to scrape job URL',
					source: scrapingResult.source,
					message: 'Unable to extract job details. Please enter them manually.',
				},
				400,
			);
		}

		console.log(`[worker] Smart URL scraping completed for: ${url}`, scrapingResult.data);

		// Create appropriate success message based on extraction method
		let message = 'Job details extracted successfully';
		if (scrapingResult.cached) {
			message += ' (cached)';
		} else if (scrapingResult.extractionMethod === 'hybrid') {
			message += ' (AI-enhanced)';
		} else if (scrapingResult.extractionMethod === 'ai-enhanced') {
			message += ' (AI-powered)';
		}

		return c.json({
			success: true,
			data: {
				companyName: scrapingResult.data?.companyName,
				jobTitle: scrapingResult.data?.jobTitle,
				location: scrapingResult.data?.location,
				salary: scrapingResult.data?.salary,
			},
			message,
			source: scrapingResult.source,
			cached: scrapingResult.cached,
			extractionMethod: scrapingResult.extractionMethod,
		});
	} catch (error: any) {
		console.error(`[worker] Error during smart URL scraping for ${url}:`, error.message);
		return c.json(
			{
				success: false,
				error: 'Failed to scrape job URL',
				details: error.message,
				message: 'Unable to extract job details. Please enter them manually.',
			},
			500,
		);
	} finally {
		// Always close browser to free resources
		if (browser) {
			try {
				await browser.close();
				console.log(`[worker] Browser closed after scraping: ${url}`);
			} catch (closeError: any) {
				console.error(`[worker] Error closing browser:`, closeError.message);
			}
		}
	}
}
