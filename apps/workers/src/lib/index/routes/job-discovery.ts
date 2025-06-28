import { Context } from 'hono';
import { z } from 'zod';
import { Env } from '../types';
import { getSupabase } from '../../../middleware/auth.middleware';
import crypto from 'node:crypto';

// ═══════════════════════════════════════════════════════════════════════════
// Schemas
// ═══════════════════════════════════════════════════════════════════════════

const UpdateJobStatusSchema = z.object({
	status: z.enum(['discovered', 'saved', 'ignored', 'applied', 'auto_saved']),
	notes: z.string().optional(),
});

// Phase 1: Job Discovery Preferences Schema
const JobDiscoveryPreferencesSchema = z.object({
	target_roles: z.array(z.string()).default([]),
	target_companies: z.array(z.string()).default([]),
	target_locations: z.array(z.string()).default([]),
	excluded_companies: z.array(z.string()).default([]),
	excluded_keywords: z.array(z.string()).default([]),
	salary_min: z.number().nullable().optional(),
	salary_max: z.number().nullable().optional(),
	remote_preference: z.enum(['remote_only', 'hybrid', 'on_site', 'any']).default('any'),
	job_types: z.array(z.string()).default([]),
	experience_levels: z.array(z.string()).default([]),
	auto_save_discovered_jobs: z.boolean().default(false),
	is_active: z.boolean().default(true),
});

// Coresignal Credit Usage Schema
const CoresignalUsageSchema = z.object({
	user_id: z.string(),
	usage_month: z.string(),
	search_credits: z.number(),
	collect_credits: z.number(),
	total_credits: z.number(),
});

// ═══════════════════════════════════════════════════════════════════════════
// CRUD API Endpoints
// ═══════════════════════════════════════════════════════════════════════════

export async function getJobDiscoveryJobs(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();

		if (authError || !user) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		// Parse query parameters with pagination support
		const url = new URL(c.req.url);
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100); // Max 100 per page
		const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
		const status = url.searchParams.get('status') || 'discovered';
		const offset = (page - 1) * limit;

		// Advanced filter and sorting parameters have been removed to simplify the API.
		// Clients now receive jobs ordered by discovery date (newest first) only.

		// Fetch Universal Jobs (primary source)
		const universalJobs = await supabase
			.from('user_jobs')
			.select(
				`
				job_id,
				status,
				notes,
				discovered_at,
				status_updated_at,
				discovery_run_id,
				jobs (
					id,
					external_job_id,
					source_vendor,
					title,
					company,
					location,
					description,
					job_url,
					posted_at,
					salary_json,
					applicants,
					employment_type,
					experience_level,
					company_url,
					company_logo,
					country_code,
					seniority_level,
					job_function,
					industries,
					apply_link,
					salary_min,
					salary_max,
					salary_currency,
					salary_period,
					extra_data
				)
			`,
			)
			.eq('user_id', user.id)
			.eq('status', status)
			.order('discovered_at', { ascending: false });

		// Fetch opportunity applications (treated as discovered jobs)
		const opportunityApps =
			status === 'discovered'
				? await supabase
						.from('applications')
						.select(
							`
							*,
							opportunity_insights
						`,
						)
						.eq('user_id', user.id)
						.eq('status', 'Opportunity')
						.eq('needs_user_review', true)
						.eq('auto_discovered', true)
						.order('opportunity_discovered_at', { ascending: false })
				: { data: [], error: null };

		if (universalJobs.error) {
			console.error('Universal jobs error:', universalJobs.error);
			return c.json({ error: 'Failed to fetch universal jobs' }, 500);
		}

		if (opportunityApps.error) {
			console.error('Opportunity apps error:', opportunityApps.error);
			return c.json({ error: 'Failed to fetch opportunity applications' }, 500);
		}

		// Transform Universal jobs (all vendors) with UI 2.0 normalized fields
		const transformedUniversalJobs = (universalJobs.data || []).map((item: any) => ({
			jobId: item.jobs?.external_job_id || item.jobs?.id || item.job_id,
			status: item.status,
			notes: item.notes,
			discoveredAt: item.discovered_at,
			statusUpdatedAt: item.status_updated_at,
			title: item.jobs?.title || 'Unknown Title',
			company: item.jobs?.company || 'Unknown Company',
			location: item.jobs?.location,
			jobUrl: item.jobs?.job_url,
			postedAt: item.jobs?.posted_at,
			searchKeywords: item.jobs?.extra_data?.searchKeywords,
			searchLocation: item.jobs?.location,
			// Vendor-specific fields
			companyProfileUrl: item.jobs?.company_url,
			// Phase 2: Enhanced data from universal jobs
			salary_json: item.jobs?.salary_json,
			applicants: item.jobs?.applicants,
			employment_type: item.jobs?.employment_type,
			experience_level: item.jobs?.experience_level,
			discovery_source: item.jobs?.source_vendor || 'unknown',
			// UI 2.0 normalized fields
			company_url: item.jobs?.company_url,
			company_logo: item.jobs?.company_logo,
			country_code: item.jobs?.country_code,
			seniority_level: item.jobs?.seniority_level,
			job_function: item.jobs?.job_function,
			industries: item.jobs?.industries,
			apply_link: item.jobs?.apply_link,
			salary_min: item.jobs?.salary_min,
			salary_max: item.jobs?.salary_max,
			salary_currency: item.jobs?.salary_currency,
			salary_period: item.jobs?.salary_period,
			// Opportunity scoring has been removed
			opportunity_insights: null,
		}));

		// Transform opportunity applications with Phase 2 intelligence
		const transformedOpportunityApps = (opportunityApps.data || []).map((app: any) => ({
			jobId: app.id, // Use application ID as jobId for opportunities
			status: 'discovered',
			notes: app.notes,
			discoveredAt: app.opportunity_discovered_at || app.created_at,
			statusUpdatedAt: app.updated_at,
			title: app.role || 'Unknown Title',
			company: app.company_name || 'Unknown Company',
			location: app.location,
			jobUrl: app.job_url,
			salaryRange: app.salary_range,
			employmentType: app.employment_type,
			experienceLevel: app.experience_level,
			postedAt: app.posted_at,
			searchKeywords: app.search_keywords,
			searchLocation: app.location,
			// ScrapingDog fields (not available for opportunity applications)
			companyProfileUrl: null,
			companyLogoUrl: null,

			// Phase 2: Enhanced data fields (from applications table)
			salary_json: app.salary_json,
			applicants: app.applicants,
			employment_type: app.employment_type,
			experience_level: app.experience_level,
			discovery_source: app.discovery_source || 'serper',

			// Opportunity scoring has been removed

			// Personalized insights (AI-powered analysis against user's resume)
			opportunity_insights: app.opportunity_insights,
		}));

		// Combine and apply client-side sorting/filtering for mixed results
		let allJobs = [...transformedUniversalJobs, ...transformedOpportunityApps];

		// Apply pagination
		const paginatedJobs = allJobs.slice(offset, offset + limit);

		// Get total counts for the filtered results
		const totalCount = allJobs.length;

		return c.json({
			jobs: paginatedJobs,
			pagination: {
				page,
				limit,
				total: totalCount,
				totalPages: Math.ceil(totalCount / limit),
				hasMore: offset + limit < totalCount,
			},
		});
	} catch (error) {
		console.error('Error in getJobDiscoveryJobs:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
}

export async function updateJobDiscoveryJobStatus(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const jobId = c.req.param('jobId');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!jobId) return c.json({ error: 'Job ID is required' }, 400);

	try {
		// Parse and validate request body
		const body = await c.req.json();
		const validatedData = UpdateJobStatusSchema.parse(body);

		// First try to update in the universal jobs system
		let result: any[] = [];

		// Try to find the job in universal jobs system by external_job_id or UUID
		const universalJobResult = await db`
			UPDATE user_jobs 
			SET 
				status = ${validatedData.status},
				notes = ${validatedData.notes || null},
				status_updated_at = NOW()
			WHERE user_id = ${user.id} 
			AND job_id IN (
				SELECT id FROM jobs 
				WHERE external_job_id = ${jobId} OR id::text = ${jobId}
			)
			RETURNING 
				job_id,
				status,
				notes,
				status_updated_at,
				'universal' as source
		`;

		if (universalJobResult.length > 0) {
			result = universalJobResult;
		} else {
			// Fallback: try the legacy user_linkedin_jobs table for backward compatibility
			const legacyResult = await db`
				UPDATE user_linkedin_jobs 
				SET 
					status = ${validatedData.status},
					notes = ${validatedData.notes || null},
					status_updated_at = NOW()
				WHERE user_id = ${user.id} AND job_id = ${jobId}
				RETURNING job_id, status, notes, status_updated_at, 'legacy' as source
			`;

			if (legacyResult.length > 0) {
				result = legacyResult;
			}
		}

		// If no job found in either system, try opportunity application
		if (result.length === 0) {
			// For opportunity applications, we need to handle status mapping
			let applicationStatus: string;
			let needsUserReview = true;

			// Map discovery statuses to application statuses
			if (validatedData.status === 'saved') {
				applicationStatus = 'Opportunity'; // Keep as Opportunity but mark as reviewed
				needsUserReview = false;
			} else if (validatedData.status === 'applied') {
				applicationStatus = 'Applied';
				needsUserReview = false;
			} else if (validatedData.status === 'ignored') {
				applicationStatus = 'Rejected'; // Mark as rejected
				needsUserReview = false;
			} else {
				applicationStatus = 'Opportunity'; // Default to Opportunity
			}

			result = await db`
				UPDATE applications 
				SET 
					status = ${applicationStatus},
					notes = ${validatedData.notes || null},
					needs_user_review = ${needsUserReview},
					updated_at = NOW()
				WHERE user_id = ${user.id} AND id = ${jobId} AND status = 'Opportunity'
				RETURNING id as job_id, status, notes, updated_at as status_updated_at, 'opportunity' as source
			`;
		}

		if (result.length === 0) {
			return c.json({ error: 'Job not found or access denied' }, 404);
		}

		return c.json({
			success: true,
			message: 'Job status updated successfully',
			job: {
				jobId: result[0].job_id,
				status:
					result[0].source === 'opportunity'
						? validatedData.status // Return the original discovery status for UI consistency
						: result[0].status,
				notes: result[0].notes,
				statusUpdatedAt: result[0].status_updated_at,
				source: result[0].source,
			},
		});
	} catch (error) {
		console.error('Failed to update job status:', error);
		return c.json(
			{
				error: 'Failed to update job status',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500,
		);
	}
}

export async function getJobDiscoveryRuns(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const page = parseInt(c.req.query('page') || '1');
		const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
		const offset = (page - 1) * limit;

		// Get scrape runs for user
		const runs = await db`
			SELECT 
				id,
				keywords,
				location,
				geo_id,
				pages_requested,
				pages_fetched,
				jobs_found,
				status,
				error,
				started_at,
				completed_at,
				created_at
			FROM linkedin_scrape_runs
			WHERE user_id = ${user.id}
			ORDER BY created_at DESC
			LIMIT ${limit} OFFSET ${offset}
		`;

		// Get total count
		const countResult = await db`
			SELECT COUNT(*) as total
			FROM linkedin_scrape_runs
			WHERE user_id = ${user.id}
		`;
		const total = parseInt(countResult[0]?.total || '0');

		return c.json({
			runs: runs.map((run: any) => ({
				id: run.id,
				keywords: run.keywords,
				location: run.location,
				geoId: run.geo_id,
				pagesRequested: run.pages_requested,
				pagesFetched: run.pages_fetched,
				jobsFound: run.jobs_found,
				status: run.status,
				error: run.error,
				startedAt: run.started_at,
				completedAt: run.completed_at,
				createdAt: run.created_at,
			})),
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
				hasNext: page * limit < total,
				hasPrev: page > 1,
			},
		});
	} catch (error) {
		console.error('Failed to get scrape runs:', error);
		return c.json(
			{
				error: 'Failed to retrieve scrape runs',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500,
		);
	}
}

export async function saveJobToApplications(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const jobId = c.req.param('jobId');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!jobId) return c.json({ error: 'Job ID is required' }, 400);

	try {
		// Get job details from universal jobs system first
		let jobResult = await db`
			SELECT 
				j.*,
				uj.status
			FROM jobs j
			JOIN user_jobs uj ON j.id = uj.job_id
			WHERE uj.user_id = ${user.id} 
			AND (j.external_job_id = ${jobId} OR j.id::text = ${jobId})
		`;

		// Fallback to legacy linkedin_jobs table if not found in universal system
		if (jobResult.length === 0) {
			jobResult = await db`
				SELECT lj.*, ulj.status
				FROM linkedin_jobs lj
				JOIN user_linkedin_jobs ulj ON lj.job_id = ulj.job_id
				WHERE ulj.user_id = ${user.id} AND ulj.job_id = ${jobId}
			`;
		}

		if (jobResult.length === 0) {
			return c.json({ error: 'Job not found or access denied' }, 404);
		}

		const job = jobResult[0];

		// Helper to parse relative date strings e.g., "2 days ago"
		function parseRelativeDateString(raw: string): string | null {
			if (!raw) return null;
			const lower = raw.trim().toLowerCase();
			// absolute iso?
			const abs = new Date(lower);
			if (!Number.isNaN(abs.getTime())) return abs.toISOString();

			const now = new Date();
			const numMatch = lower.match(/(\d+)/);
			if (!numMatch) return null;
			const amount = parseInt(numMatch[1], 10);
			if (isNaN(amount)) return null;

			let millis = 0;
			if (lower.includes('hour')) {
				millis = amount * 60 * 60 * 1000;
			} else if (lower.includes('day')) {
				millis = amount * 24 * 60 * 60 * 1000;
			} else if (lower.includes('week')) {
				millis = amount * 7 * 24 * 60 * 60 * 1000;
			} else if (lower.includes('month')) {
				millis = amount * 30 * 24 * 60 * 60 * 1000;
			} else if (lower.includes('year')) {
				millis = amount * 365 * 24 * 60 * 60 * 1000;
			} else {
				return null;
			}

			return new Date(now.getTime() - millis).toISOString();
		}

		// Normalize posted_at to ISO string or null
		const normalizedPostedAt: string | null = parseRelativeDateString(job.posted_at);

		// If the job was auto-saved earlier just return success
		if (job.status === 'saved' || job.status === 'auto_saved') {
			// Try to find the existing application to return its ID
			const existingApp = await db`
				SELECT id FROM applications 
				WHERE user_id = ${user.id} 
				AND (job_url = ${job.job_url} OR job_fingerprint = ${job.fingerprint || ''})
				LIMIT 1
			`;
			return c.json({
				success: true,
				message: 'Job already saved to applications',
				applicationId: existingApp.length ? existingApp[0].id : undefined,
			});
		}

		// Compute deterministic fingerprint for deduplication
		const fingerprint = crypto
			.createHash('md5')
			.update(`${job.company.toLowerCase()}|${job.title.toLowerCase()}|${(job.location || '').toLowerCase()}`.replace(/[^\w\s|]/g, ''))
			.digest('hex');

		// Insert into applications table with job data and fingerprint
		const applicationResult = await db`
			INSERT INTO applications (
				user_id,
				company_name,
				role,
				status,
				application_date,
				job_url,
				location,
				notes,
				manual_entry,
				job_fingerprint,
				salary_min,
				salary_max,
				salary_currency,
				employment_type,
				experience_level,
				company_url,
				country_code,
				seniority_level,
				job_function,
				industries,
				apply_link,
				job_description,
				salary_json,
				applicants,
				salary_period,
				posted_at
			)
			VALUES (
				${user.id},
				${job.company},
				${job.title},
				${'Opportunity'},
				${new Date().toISOString().split('T')[0]}::date,
				${job.job_url},
				${job.location},
				${`Imported from job discovery. Source: ${job.source_vendor || 'unknown'}. Posted: ${job.posted_at || 'Unknown'}`},
				${false},
				${fingerprint},
				${job.salary_min},
				${job.salary_max},
				${job.salary_currency},
				${job.employment_type},
				${job.experience_level},
				${job.company_url},
				${job.country_code},
				${job.seniority_level},
				${job.job_function},
				${job.industries},
				${job.apply_link},
				${job.description},
				${job.salary_json},
				${job.applicants},
				${job.salary_period},
				${normalizedPostedAt}
			)
			ON CONFLICT (user_id, job_fingerprint) DO NOTHING
			RETURNING id
		`;

		// Update job status to "saved" in the appropriate table
		if (job.source_vendor) {
			// Universal jobs system
			await db`
				UPDATE user_jobs 
				SET status = 'saved', status_updated_at = NOW() 
				WHERE user_id = ${user.id} 
				AND job_id IN (
					SELECT id FROM jobs 
					WHERE external_job_id = ${jobId} OR id::text = ${jobId}
				)
			`;
		} else {
			// Legacy linkedin_jobs system
			await db`
				UPDATE user_linkedin_jobs 
				SET status = 'saved', status_updated_at = NOW() 
				WHERE user_id = ${user.id} AND job_id = ${jobId}
			`;
		}

		return c.json({
			success: true,
			message: 'Job saved to applications successfully',
			applicationId: applicationResult[0]?.id,
		});
	} catch (error) {
		console.error('Failed to save job to applications:', error);
		return c.json(
			{
				error: 'Failed to save job',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500,
		);
	}
}

export async function getJobDiscoveryStats(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();

		if (authError || !user) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		// Get stats from universal jobs system
		const universalStats = await supabase
			.from('user_jobs')
			.select(
				`
				status,
				jobs!inner (
					source_vendor
				)
			`,
			)
			.eq('user_id', user.id);

		// Get stats from opportunity applications (only those needing review)
		const opportunityStats = await supabase
			.from('applications')
			.select('status, discovery_source')
			.eq('user_id', user.id)
			.eq('status', 'Opportunity')
			.eq('needs_user_review', true)
			.eq('auto_discovered', true);

		if (universalStats.error) {
			console.error('Universal stats error:', universalStats.error);
			return c.json({ error: 'Failed to fetch universal job stats' }, 500);
		}

		if (opportunityStats.error) {
			console.error('Opportunity stats error:', opportunityStats.error);
			return c.json({ error: 'Failed to fetch opportunity stats' }, 500);
		}

		// Process universal jobs stats
		const universalJobsData = universalStats.data || [];
		const opportunityData = opportunityStats.data || [];

		// Combine stats from both sources
		const stats = {
			discovered: 0,
			saved: 0,
			ignored: 0,
			applied: 0,
			auto_saved: 0,
			total: 0,
			// Vendor breakdown
			vendors: {
				linkedin: { discovered: 0, saved: 0, ignored: 0, applied: 0, auto_saved: 0 },
				serper: { discovered: 0, saved: 0, ignored: 0, applied: 0, auto_saved: 0 },
				coresignal: { discovered: 0, saved: 0, ignored: 0, applied: 0, auto_saved: 0 },
			},
		};

		// Process universal jobs
		universalJobsData.forEach((item: any) => {
			const status = item.status;
			const vendor = item.jobs?.source_vendor || 'unknown';

			// Update overall stats
			if (status === 'discovered') stats.discovered++;
			else if (status === 'saved') stats.saved++;
			else if (status === 'ignored') stats.ignored++;
			else if (status === 'applied') stats.applied++;
			else if (status === 'auto_saved') stats.auto_saved++;

			// Update vendor-specific stats
			if (vendor in stats.vendors) {
				const vendorStats = stats.vendors[vendor as keyof typeof stats.vendors];
				if (status === 'discovered') vendorStats.discovered++;
				else if (status === 'saved') vendorStats.saved++;
				else if (status === 'ignored') vendorStats.ignored++;
				else if (status === 'applied') vendorStats.applied++;
				else if (status === 'auto_saved') vendorStats.auto_saved++;
			}
		});

		// Process opportunity applications (count as discovered)
		opportunityData.forEach((item: any) => {
			stats.discovered++;

			// Map discovery_source to vendor
			const source = item.discovery_source || 'serper';
			if (source in stats.vendors) {
				stats.vendors[source as keyof typeof stats.vendors].discovered++;
			}
		});

		// Calculate total
		stats.total = stats.discovered + stats.saved + stats.ignored + stats.applied + stats.auto_saved;

		// ✨  Return camel-case structure expected by the Next.js dashboard
		const responseBody = {
			totalJobs: stats.total,
			discoveredJobs: stats.discovered,
			autoSavedJobs: stats.auto_saved,
			manuallySavedJobs: stats.saved,
			savedJobs: stats.auto_saved + stats.saved, // Combined for backward compatibility
			ignoredJobs: stats.ignored,
			appliedJobs: stats.applied,
			vendorStats: stats.vendors,
			lastUpdated: new Date().toISOString(),
		};

		return c.json(responseBody);
	} catch (error) {
		console.error('Error in getJobDiscoveryStats:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1: Job Discovery Preferences Management
// ═══════════════════════════════════════════════════════════════════════════

export async function getJobDiscoveryPreferences(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		// Get user preferences and subscription tier
		const result = await db`
			SELECT 
				ujdp.*,
				p.subscription_tier
			FROM user_job_discovery_preferences ujdp
			LEFT JOIN profiles p ON p.id = ujdp.user_id
			WHERE ujdp.user_id = ${user.id}
		`;

		// Get subscription tier even if no preferences exist
		const profileResult = await db`
			SELECT subscription_tier FROM profiles WHERE id = ${user.id}
		`;

		const subscriptionTier = profileResult[0]?.subscription_tier || 'free';

		if (result.length === 0) {
			// Return default preferences if none exist
			return c.json({
				target_roles: [],
				target_companies: [],
				target_locations: [],
				excluded_companies: [],
				excluded_keywords: [],
				salary_min: null,
				salary_max: null,
				remote_preference: 'any',
				job_types: [],
				experience_levels: [],
				auto_save_discovered_jobs: false,
				is_active: true,
				last_discovery_at: null,
				subscription_tier: subscriptionTier,
			});
		}

		const prefs = result[0];
		return c.json({
			target_roles: prefs.target_roles || [],
			target_companies: prefs.target_companies || [],
			target_locations: prefs.target_locations || [],
			excluded_companies: prefs.excluded_companies || [],
			excluded_keywords: prefs.excluded_keywords || [],
			salary_min: prefs.salary_min,
			salary_max: prefs.salary_max,
			remote_preference: prefs.remote_preference || 'any',
			job_types: prefs.job_types || [],
			experience_levels: prefs.experience_levels || [],
			auto_save_discovered_jobs: prefs.auto_save_discovered_jobs ?? false,
			is_active: prefs.is_active,
			last_discovery_at: prefs.last_discovery_at,
			subscription_tier: prefs.subscription_tier || subscriptionTier,
		});
	} catch (error) {
		console.error('Failed to get job discovery preferences:', error);
		return c.json(
			{
				error: 'Failed to retrieve preferences',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500,
		);
	}
}

export async function updateJobDiscoveryPreferences(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const body = await c.req.json();
		const validatedData = JobDiscoveryPreferencesSchema.parse(body);

		// Upsert preferences
		const result = await db`
			INSERT INTO user_job_discovery_preferences (
				user_id,
				target_roles,
				target_companies,
				target_locations,
				excluded_companies,
				excluded_keywords,
				salary_min,
				salary_max,
				remote_preference,
				job_types,
				experience_levels,
				auto_save_discovered_jobs,
				is_active,
				updated_at
			)
			VALUES (
				${user.id},
				${validatedData.target_roles},
				${validatedData.target_companies},
				${validatedData.target_locations},
				${validatedData.excluded_companies},
				${validatedData.excluded_keywords},
				${validatedData.salary_min || null},
				${validatedData.salary_max || null},
				${validatedData.remote_preference},
				${validatedData.job_types},
				${validatedData.experience_levels},
				${validatedData.auto_save_discovered_jobs},
				${validatedData.is_active},
				NOW()
			)
			ON CONFLICT (user_id) DO UPDATE SET
				target_roles = EXCLUDED.target_roles,
				target_companies = EXCLUDED.target_companies,
				target_locations = EXCLUDED.target_locations,
				excluded_companies = EXCLUDED.excluded_companies,
				excluded_keywords = EXCLUDED.excluded_keywords,
				salary_min = EXCLUDED.salary_min,
				salary_max = EXCLUDED.salary_max,
				remote_preference = EXCLUDED.remote_preference,
				job_types = EXCLUDED.job_types,
				experience_levels = EXCLUDED.experience_levels,
				auto_save_discovered_jobs = EXCLUDED.auto_save_discovered_jobs,
				is_active = EXCLUDED.is_active,
				updated_at = EXCLUDED.updated_at
			RETURNING *
		`;

		return c.json({
			success: true,
			message: 'Job discovery preferences updated successfully',
			preferences: {
				target_roles: result[0].target_roles || [],
				target_companies: result[0].target_companies || [],
				target_locations: result[0].target_locations || [],
				excluded_companies: result[0].excluded_companies || [],
				excluded_keywords: result[0].excluded_keywords || [],
				salary_min: result[0].salary_min,
				salary_max: result[0].salary_max,
				remote_preference: result[0].remote_preference,
				job_types: result[0].job_types || [],
				experience_levels: result[0].experience_levels || [],
				auto_save_discovered_jobs: result[0].auto_save_discovered_jobs || false,
				is_active: result[0].is_active,
				last_discovery_at: result[0].last_discovery_at,
			},
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return c.json(
				{
					error: 'Validation failed',
					details: error.errors,
				},
				400,
			);
		}

		console.error('Failed to update job discovery preferences:', error);
		return c.json(
			{
				error: 'Failed to update preferences',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500,
		);
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// JSearch Quota Management
// ═══════════════════════════════════════════════════════════════════════════

export async function getJSearchQuotaStatus(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();

		if (authError || !user) {
			return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
		}

		const { data: quotaData, error: quotaError } = await supabase.rpc('get_jsearch_quota_status', {
			p_user_id: user.id,
		});

		if (quotaError) {
			console.error('Failed to get JSearch quota status:', quotaError);
			return c.json({ error: 'Failed to check quota status' }, 500);
		}

		const status = quotaData[0];

		// Calculate time until reset (first day of next month)
		const now = new Date();
		const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

		return c.json({
			tier: status.tier,
			requestsUsed: status.requests_used,
			requestsLimit: status.requests_limit,
			costUnitsUsed: status.cost_units_used,
			maxPagesPerRequest: status.max_pages_per_request,
			enabled: status.enabled,
			resetAt: nextMonth.toISOString(),
			utilizationPercentage: status.usage_percentage || 0,
			remainingRequests: Math.max(0, status.requests_limit - status.requests_used),
		});
	} catch (error) {
		console.error('Error in getJSearchQuotaStatus:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
}

export async function checkJSearchUsageLimits(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();

		if (authError || !user) {
			return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
		}

		// Get required requests from query param, default to 1
		const requiredRequestsParam = c.req.query('requiredRequests');
		const requiredRequests = requiredRequestsParam ? parseInt(requiredRequestsParam) : 1;

		if (isNaN(requiredRequests) || requiredRequests < 1) {
			return c.json({ error: 'Invalid requiredRequests parameter' }, 400);
		}

		const { data: usageData, error: usageError } = await supabase.rpc('check_jsearch_usage_limits', {
			p_user_id: user.id,
			p_required_requests: requiredRequests,
		});

		if (usageError) {
			console.error('Failed to check JSearch usage limits:', usageError);
			return c.json({ error: 'Failed to check usage limits' }, 500);
		}

		const limits = usageData[0];

		// Calculate time until reset (first day of next month)
		const now = new Date();
		const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

		return c.json({
			canProceed: limits.can_proceed,
			requestsUsed: limits.requests_used,
			requestsLimit: limits.requests_limit,
			resetAt: nextMonth.toISOString(),
			// Additional metadata for frontend
			utilizationPercentage: limits.requests_limit > 0 ? Math.round((limits.requests_used / limits.requests_limit) * 100) : 0,
			remainingRequests: Math.max(0, limits.requests_limit - limits.requests_used),
			requiredRequests,
		});
	} catch (error) {
		console.error('Error in checkJSearchUsageLimits:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
}
