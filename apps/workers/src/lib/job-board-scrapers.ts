import puppeteer, { type Browser, type Page } from '@cloudflare/puppeteer';
import type { KVNamespace, Ai } from '@cloudflare/workers-types';
import { createWorkersAI } from 'workers-ai-provider';
import { generateText } from 'ai';
import { z } from 'zod';

// === Zod Schema for AI Job Extraction ===
const AIJobExtractionSchema = z.object({
	companyName: z.string().nullable().describe('The name of the company offering the job.'),
	jobTitle: z.string().nullable().describe('The job title or position name.'),
	location: z.string().nullable().describe('Job location (city, state, "Remote", etc.).'),
	salary: z.string().nullable().describe('Salary range or compensation mentioned (e.g., "$80k - $120k", "Competitive").'),
	jobType: z.string().nullable().describe('Employment type (Full-time, Part-time, Contract, Internship, etc.).'),
	experienceLevel: z.string().nullable().describe('Required experience level (Entry-level, Mid-level, Senior, etc.).'),
	department: z.string().nullable().describe('Department or team (Engineering, Marketing, Sales, etc.).'),
	remote: z.boolean().nullable().describe('Whether the job allows remote work.'),
	description: z.string().nullable().describe('Brief job description or summary (max 200 words).'),
	requirements: z.array(z.string()).describe('List of key requirements or qualifications mentioned.'),
	benefits: z.array(z.string()).describe('List of benefits or perks mentioned.'),
	skills: z.array(z.string()).describe('List of technical skills or technologies mentioned.'),
});

export type AIJobExtractionData = z.infer<typeof AIJobExtractionSchema>;

// === Helper: Create AI Extraction Prompt ===
function createAIJobExtractionPrompt(pageContent: string, url: string): string {
	return `You are an expert at extracting structured job posting data from web page content. Extract comprehensive job details from this job posting page.

URL: ${url}

PAGE CONTENT:
${pageContent}

EXTRACTION GUIDELINES:

COMPANY NAME:
- Look for the company name in headers, logos, or "About [Company]" sections
- Clean up formatting: "Stripe, Inc." not "Stripe Inc"
- Avoid job board names (LinkedIn, Indeed) - find the actual hiring company
- Common patterns: "[Company] is hiring", "Join [Company]", "About [Company]"

JOB TITLE:
- Extract the specific position title
- Keep original formatting: "Senior Software Engineer", "Product Manager - AI"
- Avoid generic terms like "Job Opening" or "Career Opportunity"

LOCATION:
- Look for city, state, country, or "Remote"
- Common patterns: "San Francisco, CA", "New York, NY", "Remote - US", "London, UK"
- Use "Remote" if remote work is mentioned

SALARY:
- Extract any compensation mentioned: "$100k - $150k", "$80/hour", "Competitive"
- Include equity, bonuses if mentioned: "$120k + equity"
- Use null if no salary information is found

JOB TYPE:
- Full-time, Part-time, Contract, Internship, Temporary, etc.
- Look for employment classification in the posting

EXPERIENCE LEVEL:
- Entry-level, Mid-level, Senior, Lead, Principal, etc.
- Look for "years of experience" requirements
- Junior, Associate, Senior, Staff, Principal levels

DEPARTMENT:
- Engineering, Product, Marketing, Sales, Operations, Design, etc.
- Look for team or department mentions

REMOTE:
- true if remote work is allowed/mentioned
- false if explicitly office-only
- null if not specified

DESCRIPTION:
- Brief summary of the role (max 200 words)
- Focus on what the person will be doing
- Extract the essence, not the full text

REQUIREMENTS:
- Key qualifications, skills, experience needed
- Education requirements if mentioned
- Must-have items, not nice-to-haves

BENEFITS:
- Health insurance, 401k, PTO, etc.
- Perks like free food, gym, etc.
- Stock options, equity, bonuses

SKILLS:
- Technical skills: "React", "Python", "AWS", "Figma"
- Soft skills: "Leadership", "Communication"
- Tools and technologies mentioned

IMPORTANT:
- Be conservative - use null if information is unclear
- Extract exactly as written in the content
- Focus on factual information, not marketing language
- Company name and job title are most critical

Return ONLY valid JSON wrapped in <json>...</json> tags.

EXAMPLE OUTPUTS:

<json>
{
  "companyName": "Stripe",
  "jobTitle": "Senior Software Engineer",
  "location": "San Francisco, CA",
  "salary": "$150k - $220k + equity",
  "jobType": "Full-time",
  "experienceLevel": "Senior",
  "department": "Engineering",
  "remote": true,
  "description": "Build and maintain payment infrastructure used by millions of businesses worldwide. Work on distributed systems, APIs, and developer tools.",
  "requirements": ["5+ years software engineering experience", "Strong backend development skills", "Experience with distributed systems"],
  "benefits": ["Health insurance", "401k matching", "Unlimited PTO", "Stock options"],
  "skills": ["Python", "Go", "JavaScript", "PostgreSQL", "Kubernetes"]
}
</json>

<json>
{
  "companyName": "Anthropic",
  "jobTitle": "AI Safety Researcher",
  "location": "Remote - US",
  "salary": "Competitive",
  "jobType": "Full-time",
  "experienceLevel": "Mid-level",
  "department": "Research",
  "remote": true,
  "description": "Conduct research on AI safety and alignment. Develop techniques to make AI systems more reliable, interpretable, and beneficial.",
  "requirements": ["PhD in ML/AI or equivalent experience", "Research experience in AI safety", "Strong publication record"],
  "benefits": ["Health insurance", "Research budget", "Conference travel"],
  "skills": ["Machine Learning", "Python", "PyTorch", "Research methodologies"]
}
</json>

Now extract data from the job posting above:`;
}

// === AI-Enhanced Job Extraction ===
async function extractJobDataWithAI(page: Page, url: string, aiBinding: Ai): Promise<AIJobExtractionData | null> {
	console.log('[ai-scraper] Starting AI-enhanced job extraction for:', url);

	try {
		// Get clean page content for AI analysis
		const pageContent = await page.evaluate(() => {
			// Remove noisy elements
			// @ts-ignore js code to run in the browser context
			const elementsToRemove = document.querySelectorAll(
				'script, style, nav, header, footer, .advertisement, .ads, .sidebar, .navigation, .menu, .social-media',
			);
			elementsToRemove.forEach((el: Element) => el.remove());

			// Get main content - try common content selectors first
			const contentSelectors = [
				'main',
				'[role="main"]',
				'.main-content',
				'.job-description',
				'.job-details',
				'article',
				'.content',
				'body',
			];

			let content = '';
			for (const selector of contentSelectors) {
				// @ts-ignore js code to run in the browser context
				const element = document.querySelector(selector);
				if (element && element.textContent && element.textContent.trim().length > 200) {
					content = element.textContent;
					break;
				}
			}

			// Fallback to body if no main content found
			if (!content) {
				// @ts-ignore js code to run in the browser context
				content = document.body.textContent || '';
			}

			// Clean up whitespace and limit size for AI context
			return content.replace(/\s+/g, ' ').trim().substring(0, 8000); // Limit to ~8k chars for AI context
		});

		if (!pageContent || pageContent.length < 100) {
			console.warn('[ai-scraper] Page content too short for AI analysis:', pageContent.length);
			return null;
		}

		console.log(`[ai-scraper] Extracted ${pageContent.length} characters of page content for AI analysis`);

		// Use Workers AI to extract structured data
		const workersai = createWorkersAI({ binding: aiBinding as any });
		const model = workersai('@cf/meta/llama-3.1-8b-instruct-fp8' as any); // Same model as ai-extractor

		const extractionPrompt = createAIJobExtractionPrompt(pageContent, url);
		console.log('[ai-scraper] Generating AI extraction...');

		// Add timeout protection for AI calls (same as ai-extractor)
		const aiPromise = generateText({
			model: model,
			prompt: extractionPrompt,
		});

		// 45-second timeout (same as ai-extractor)
		const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI job extraction timeout (45s)')), 45000));

		const result = (await Promise.race([aiPromise, timeoutPromise])) as { text: string };

		console.log('[ai-scraper] Raw AI Response from generateText:', result.text);

		// Parse JSON from <json>...</json> tags (same approach as ai-extractor)
		const rawText = result.text;
		const jsonStartTag = '<json>';
		const jsonEndTag = '</json>';

		const startIndex = rawText.indexOf(jsonStartTag);
		const endIndex = rawText.indexOf(jsonEndTag);

		if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
			const jsonString = rawText.substring(startIndex + jsonStartTag.length, endIndex).trim();
			console.log('[ai-scraper] Extracted JSON string:', jsonString);

			try {
				const parsedJson = JSON.parse(jsonString);
				// Validate with Zod schema
				const validatedData = AIJobExtractionSchema.parse(parsedJson);
				console.log('[ai-scraper] Successfully parsed and validated JSON from AI response:', validatedData);
				return validatedData;
			} catch (parseOrValidationError: any) {
				console.error('[ai-scraper] Failed to parse or validate the extracted JSON string:', parseOrValidationError.message);
				if (parseOrValidationError instanceof z.ZodError) {
					console.error('[ai-scraper] Zod validation errors:', parseOrValidationError.errors);
				}
				console.error('[ai-scraper] Original string that failed parsing/validation:', jsonString);
				return null;
			}
		} else {
			console.error('[ai-scraper] Could not find <json>...</json> tags in AI response. Raw text logged above.');
			return null;
		}
	} catch (error: any) {
		console.error(`[ai-scraper] Error during AI job extraction for ${url}:`, error.message, error.stack || '');

		// Same error handling as ai-extractor
		if (error.name === 'AI_NoObjectGeneratedError' || error.name === 'AI_TypeValidationError') {
			console.error('[ai-scraper] AI SDK Error Details:');
			if (error.text) console.error('[ai-scraper] AI Raw Output Text:', error.text);
			if (error.finishReason) console.error('[ai-scraper] AI Finish Reason:', error.finishReason);
			if (error.response) console.error('[ai-scraper] AI Full Response Object:', JSON.stringify(error.response, null, 2));
		}

		if (error instanceof z.ZodError) {
			console.error('[ai-scraper] Zod validation error:', error.errors);
		}
		if (error.cause) {
			console.error('[ai-scraper] Cause of error:', error.cause);
		}
		return null;
	}
}

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
	extractionMethod?: 'traditional' | 'ai-enhanced' | 'hybrid'; // Track which method was used
}

// === Helper: Convert AI data to ScrapedJobData format ===
function convertAIDataToScrapedData(aiData: AIJobExtractionData): ScrapedJobData {
	return {
		companyName: aiData.companyName || undefined,
		jobTitle: aiData.jobTitle || undefined,
		location: aiData.location || undefined,
		salary: aiData.salary || undefined,
		description: aiData.description || undefined,
		requirements: aiData.requirements.length > 0 ? aiData.requirements : undefined,
		benefits: aiData.benefits.length > 0 ? aiData.benefits : undefined,
		jobType: aiData.jobType || undefined,
		remote: aiData.remote || undefined,
		// Note: applicationUrl is not extracted by AI, would need to be found separately
	};
}

// === Helper: Check if traditional scraping is incomplete ===
function isScrapingIncomplete(data: ScrapedJobData): boolean {
	// Consider scraping incomplete if missing core fields
	return !data.companyName || !data.jobTitle;
}

// === Helper: Merge traditional and AI data ===
function mergeScrapingResults(traditional: ScrapedJobData, ai: ScrapedJobData): ScrapedJobData {
	return {
		// Prefer traditional scraping for basic fields (usually more accurate for known sites)
		companyName: traditional.companyName || ai.companyName,
		jobTitle: traditional.jobTitle || ai.jobTitle,
		location: traditional.location || ai.location,
		salary: traditional.salary || ai.salary,

		// Prefer AI for rich content (AI is better at extracting from text)
		description: ai.description || traditional.description,
		requirements: ai.requirements || traditional.requirements,
		benefits: ai.benefits || traditional.benefits,
		jobType: ai.jobType || traditional.jobType,
		remote: ai.remote !== undefined ? ai.remote : traditional.remote,

		// Keep traditional applicationUrl (AI doesn't extract this)
		applicationUrl: traditional.applicationUrl,
	};
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

// Main scraping function with AI enhancement
export async function scrapeJobUrl(
	browser: Browser,
	url: string,
	cacheKV?: KVNamespace,
	aiBinding?: Ai, // Added AI binding parameter
): Promise<ScrapingResult> {
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
		let extractionMethod: 'traditional' | 'ai-enhanced' | 'hybrid' = 'traditional';

		// Step 1: Try traditional scraping first
		console.log(`[scraper] Starting traditional extraction for domain: ${domain}`);

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

		console.log(`[scraper] Traditional extraction completed:`, scrapedData);

		// Step 2: If traditional scraping is incomplete and AI is available, enhance with AI
		if (aiBinding && isScrapingIncomplete(scrapedData)) {
			console.log(
				`[scraper] Traditional scraping incomplete (missing: ${!scrapedData.companyName ? 'companyName ' : ''}${!scrapedData.jobTitle ? 'jobTitle ' : ''}). Trying AI enhancement...`,
			);

			try {
				const aiData = await extractJobDataWithAI(page, url, aiBinding);

				if (aiData) {
					const aiScrapedData = convertAIDataToScrapedData(aiData);
					scrapedData = mergeScrapingResults(scrapedData, aiScrapedData);
					extractionMethod = 'hybrid';
					console.log(`[scraper] AI enhancement successful. Merged data:`, scrapedData);
				} else {
					console.log(`[scraper] AI enhancement failed - using traditional data only`);
				}
			} catch (aiError: any) {
				console.error(`[scraper] AI enhancement error:`, aiError.message);
				// Continue with traditional data only
			}
		} else if (aiBinding) {
			console.log(`[scraper] Traditional scraping complete - AI enhancement not needed`);
		} else {
			console.log(`[scraper] AI binding not provided - using traditional scraping only`);
		}

		// Step 3: Clean up and validate data
		const cleanedData = cleanScrapedData(scrapedData);

		// Cache the result for 1 hour if we have a company name
		if (cacheKV && cleanedData.companyName) {
			const cacheKey = `scrape:${btoa(url)}`;
			await cacheKV.put(cacheKey, JSON.stringify(cleanedData), { expirationTtl: 3600 });
		}

		return {
			success: true,
			data: cleanedData,
			source: domain,
			extractionMethod,
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
