import puppeteer, { type Browser, type Page } from '@cloudflare/puppeteer';
import type { KVNamespace } from '@cloudflare/workers-types';

export interface ScrapedJobData {
	companyName?: string;
	jobTitle?: string;
	location?: string;
	salary?: string;
	description?: string;
	requirements?: string[];
	benefits?: string[];
	jobType?: string; // Full-time, Part-time, Contract, etc.
	remote?: boolean;
	applicationUrl?: string;
}

export interface ScrapingResult {
	success: boolean;
	data?: ScrapedJobData;
	error?: string;
	source: string;
	cached?: boolean;
}

// Rate limiting - max 1 scrape per domain per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const rateLimitMap = new Map<string, number>();

function isRateLimited(domain: string): boolean {
	const now = Date.now();
	const lastScrape = rateLimitMap.get(domain);

	if (lastScrape && now - lastScrape < RATE_LIMIT_WINDOW) {
		return true;
	}

	rateLimitMap.set(domain, now);
	return false;
}

// Helper to safely extract text content
async function safeExtract(page: Page, selector: string): Promise<string | null> {
	return page.$eval(selector, (el) => el?.textContent?.trim() || null).catch(() => null);
}

// Helper to extract multiple text elements
async function safeExtractAll(page: Page, selector: string): Promise<string[]> {
	return page.$$eval(selector, (els) => els.map((el) => el?.textContent?.trim()).filter(Boolean)).catch(() => []);
}

// LinkedIn Job Scraper
async function scrapeLinkedIn(page: Page, url: string): Promise<ScrapedJobData> {
	console.log('[scraper] Starting LinkedIn scraping for:', url);

	// Wait for content to load
	await page.waitForSelector('[data-test-id="job-title"]', { timeout: 10000 }).catch(() => {});

	const data: ScrapedJobData = {};

	// Job title
	const jobTitle =
		(await safeExtract(page, '[data-test-id="job-title"]')) ||
		(await safeExtract(page, '.top-card-layout__title')) ||
		(await safeExtract(page, 'h1'));
	if (jobTitle) data.jobTitle = jobTitle;

	// Company name
	const companyName =
		(await safeExtract(page, '[data-test-id="job-details-company-name"]')) ||
		(await safeExtract(page, '.top-card-layout__card .top-card-layout__second-subline a')) ||
		(await safeExtract(page, '[data-test-id="company-name"]'));
	if (companyName) data.companyName = companyName;

	// Location
	const location =
		(await safeExtract(page, '[data-test-id="job-details-location"]')) ||
		(await safeExtract(page, '.top-card-layout__card .top-card-layout__third-subline'));
	if (location) data.location = location;

	// Job type and remote info
	const jobInsights = await safeExtractAll(page, '[data-test-id="job-details-job-insight"]');
	for (const insight of jobInsights) {
		if (insight.toLowerCase().includes('remote')) {
			data.remote = true;
		}
		if (insight.includes('Full-time') || insight.includes('Part-time') || insight.includes('Contract')) {
			data.jobType = insight;
		}
	}

	// Description
	const description =
		(await safeExtract(page, '[data-test-id="job-details-description"]')) || (await safeExtract(page, '.description__text'));
	if (description) data.description = description;

	// Salary (if available)
	const salary = await safeExtract(page, '[data-test-id="job-salary-info"]');
	if (salary) data.salary = salary;

	console.log('[scraper] LinkedIn scraping completed:', data);
	return data;
}

// Indeed Job Scraper
async function scrapeIndeed(page: Page, url: string): Promise<ScrapedJobData> {
	console.log('[scraper] Starting Indeed scraping for:', url);

	// Wait for content to load
	await page.waitForSelector('[data-testid="jobTitle"]', { timeout: 10000 }).catch(() => {});

	const data: ScrapedJobData = {};

	// Job title
	const jobTitle =
		(await safeExtract(page, '[data-testid="jobTitle"]')) ||
		(await safeExtract(page, 'h1[data-testid="jobTitle"]')) ||
		(await safeExtract(page, '.jobTitle h1'));
	if (jobTitle) data.jobTitle = jobTitle;

	// Company name
	const companyName =
		(await safeExtract(page, '[data-testid="companyName"]')) ||
		(await safeExtract(page, '.companyName a')) ||
		(await safeExtract(page, '[data-testid="company-name"]'));
	if (companyName) data.companyName = companyName;

	// Location
	const location = (await safeExtract(page, '[data-testid="jobLocation"]')) || (await safeExtract(page, '.companyLocation'));
	if (location) data.location = location;

	// Salary
	const salary =
		(await safeExtract(page, '[data-testid="salary-snippet"]')) ||
		(await safeExtract(page, '.salaryOnly')) ||
		(await safeExtract(page, '.salary-snippet'));
	if (salary) data.salary = salary;

	// Job type
	const jobType = await safeExtract(page, '[data-testid="job-type"]');
	if (jobType) data.jobType = jobType;

	// Description
	const description = (await safeExtract(page, '[data-testid="jobDescription"]')) || (await safeExtract(page, '#jobDescriptionText'));
	if (description) data.description = description;

	console.log('[scraper] Indeed scraping completed:', data);
	return data;
}

// Glassdoor Job Scraper
async function scrapeGlassdoor(page: Page, url: string): Promise<ScrapedJobData> {
	console.log('[scraper] Starting Glassdoor scraping for:', url);

	// Wait for content to load
	await page.waitForSelector('[data-test="job-title"]', { timeout: 10000 }).catch(() => {});

	const data: ScrapedJobData = {};

	// Job title
	const jobTitle = (await safeExtract(page, '[data-test="job-title"]')) || (await safeExtract(page, 'h1[data-test="job-title"]'));
	if (jobTitle) data.jobTitle = jobTitle;

	// Company name
	const companyName = (await safeExtract(page, '[data-test="employer-name"]')) || (await safeExtract(page, '[data-test="company-name"]'));
	if (companyName) data.companyName = companyName;

	// Location
	const location = (await safeExtract(page, '[data-test="job-location"]')) || (await safeExtract(page, '[data-test="location"]'));
	if (location) data.location = location;

	// Salary
	const salary = (await safeExtract(page, '[data-test="salary"]')) || (await safeExtract(page, '.salary'));
	if (salary) data.salary = salary;

	// Description
	const description = (await safeExtract(page, '[data-test="job-description"]')) || (await safeExtract(page, '.jobDescription'));
	if (description) data.description = description;

	console.log('[scraper] Glassdoor scraping completed:', data);
	return data;
}

// Generic Company Career Page Scraper
async function scrapeGeneric(page: Page, url: string): Promise<ScrapedJobData> {
	console.log('[scraper] Starting generic scraping for:', url);

	const data: ScrapedJobData = {};

	// Try common patterns for job titles
	const jobTitle =
		(await safeExtract(page, 'h1')) ||
		(await safeExtract(page, '[class*="job-title"]')) ||
		(await safeExtract(page, '[class*="position"]')) ||
		(await safeExtract(page, 'title'));
	if (jobTitle) data.jobTitle = jobTitle;

	// Try to extract company name from various sources
	const companyName =
		(await safeExtract(page, '[class*="company"]')) ||
		(await safeExtract(page, '[class*="employer"]')) ||
		(await safeExtract(page, 'meta[property="og:site_name"]')) ||
		(await page
			.$eval('title', (el) => {
				const title = el.textContent || '';
				// Extract company from title like "Software Engineer - Company Name"
				const parts = title.split(' - ');
				return parts.length > 1 ? parts[parts.length - 1] : null;
			})
			.catch(() => null));
	if (companyName) data.companyName = companyName;

	// Try common patterns for location
	const location =
		(await safeExtract(page, '[class*="location"]')) ||
		(await safeExtract(page, '[class*="city"]')) ||
		(await safeExtract(page, '[class*="address"]'));
	if (location) data.location = location;

	// Try common patterns for salary
	const salary =
		(await safeExtract(page, '[class*="salary"]')) ||
		(await safeExtract(page, '[class*="compensation"]')) ||
		(await safeExtract(page, '[class*="pay"]'));
	if (salary) data.salary = salary;

	// Try to get job description
	const description =
		(await safeExtract(page, '[class*="description"]')) ||
		(await safeExtract(page, '[class*="summary"]')) ||
		(await safeExtract(page, 'main p'));
	if (description) data.description = description;

	// Check for remote work indicators
	const pageText = await page.content();
	if (pageText.toLowerCase().includes('remote') || pageText.toLowerCase().includes('work from home')) {
		data.remote = true;
	}

	console.log('[scraper] Generic scraping completed:', data);
	return data;
}

// Main scraping function
export async function scrapeJobUrl(browser: Browser, url: string, cacheKV?: KVNamespace): Promise<ScrapingResult> {
	const urlObj = new URL(url);
	const domain = urlObj.hostname.toLowerCase();

	console.log(`[scraper] Starting job scraping for domain: ${domain}`);

	// Check rate limiting
	if (isRateLimited(domain)) {
		console.log(`[scraper] Rate limited for domain: ${domain}`);
		return {
			success: false,
			error: 'Rate limited - please wait before scraping this domain again',
			source: domain,
		};
	}

	// Check cache first
	if (cacheKV) {
		const cacheKey = `scrape:${btoa(url)}`;
		const cached = await cacheKV.get(cacheKey);
		if (cached) {
			console.log(`[scraper] Cache hit for: ${url}`);
			return {
				success: true,
				data: JSON.parse(cached),
				source: domain,
				cached: true,
			};
		}
	}

	let page: Page | null = null;

	try {
		page = await browser.newPage();

		// Set reasonable viewport and user agent
		await page.setViewport({ width: 1280, height: 720 });
		await page.setUserAgent(
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		);

		// Navigate to the page
		await page.goto(url, {
			waitUntil: 'domcontentloaded',
			timeout: 30000,
		});

		// Wait a bit for dynamic content
		await page.waitForTimeout(2000);

		let scrapedData: ScrapedJobData;

		// Route to appropriate scraper based on domain
		if (domain.includes('linkedin.com')) {
			scrapedData = await scrapeLinkedIn(page, url);
		} else if (domain.includes('indeed.com')) {
			scrapedData = await scrapeIndeed(page, url);
		} else if (domain.includes('glassdoor.com')) {
			scrapedData = await scrapeGlassdoor(page, url);
		} else {
			scrapedData = await scrapeGeneric(page, url);
		}

		// Clean up and validate data
		const cleanedData = cleanScrapedData(scrapedData);

		// Cache the result for 1 hour
		if (cacheKV && cleanedData.companyName) {
			const cacheKey = `scrape:${btoa(url)}`;
			await cacheKV.put(cacheKey, JSON.stringify(cleanedData), { expirationTtl: 3600 });
		}

		return {
			success: true,
			data: cleanedData,
			source: domain,
		};
	} catch (error: any) {
		console.error(`[scraper] Error scraping ${url}:`, error.message);
		return {
			success: false,
			error: `Failed to scrape job page: ${error.message}`,
			source: domain,
		};
	} finally {
		if (page) {
			await page.close().catch(console.error);
		}
	}
}

// Helper to clean and validate scraped data
function cleanScrapedData(data: ScrapedJobData): ScrapedJobData {
	const cleaned: ScrapedJobData = {};

	// Clean company name
	if (data.companyName) {
		cleaned.companyName = data.companyName
			.replace(/\s+/g, ' ')
			.replace(/^[-\s]+|[-\s]+$/g, '')
			.trim();
	}

	// Clean job title
	if (data.jobTitle) {
		cleaned.jobTitle = data.jobTitle
			.replace(/\s+/g, ' ')
			.replace(/^[-\s]+|[-\s]+$/g, '')
			.trim();
	}

	// Clean location
	if (data.location) {
		cleaned.location = data.location.replace(/\s+/g, ' ').trim();
	}

	// Clean salary
	if (data.salary) {
		cleaned.salary = data.salary.replace(/\s+/g, ' ').trim();
	}

	// Clean description (truncate if too long)
	if (data.description) {
		cleaned.description = data.description.replace(/\s+/g, ' ').trim().substring(0, 1000); // Limit description length
	}

	// Copy other fields
	cleaned.requirements = data.requirements;
	cleaned.benefits = data.benefits;
	cleaned.jobType = data.jobType;
	cleaned.remote = data.remote;
	cleaned.applicationUrl = data.applicationUrl;

	return cleaned;
}
