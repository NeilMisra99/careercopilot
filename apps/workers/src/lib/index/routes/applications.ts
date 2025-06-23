import type { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import type { Env, ApplicationUpdateRequest, ApplicationCreateRequest, ApplicationReviewAction } from '../types';
import { VALID_APPLICATION_STATUSES } from '../types';

/**
 * Get applications pending review
 */
export async function getApplicationsPendingReview(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const pendingApplications = await db`
			SELECT id, company_name, role, status, applied_at, 
				   ai_suggested, ai_confidence, ai_reasoning, needs_user_review,
				   source_email_id, source_thread_id, job_url, location, salary_range, notes
			FROM public.applications 
			WHERE user_id = ${user.id} 
			AND needs_user_review = TRUE 
			ORDER BY applied_at DESC
		`;

		return c.json({ data: pendingApplications });
	} catch (err: any) {
		console.error('Error fetching pending review applications:', err.message);
		return c.json({ error: 'Failed to fetch pending applications', details: err.message }, 500);
	}
}

/**
 * Review application (approve or delete)
 */
export async function reviewApplication(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const applicationId = c.req.param('id');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!applicationId) return c.json({ error: 'Application ID is required' }, 400);

	try {
		const { action }: { action: ApplicationReviewAction } = await c.req.json();

		if (!action || !['approve', 'delete'].includes(action)) {
			return c.json({ error: 'Invalid action. Must be approve or delete.' }, 400);
		}

		if (action === 'approve') {
			// Approve: Keep the AI-suggested status and remove review flag
			const result = await db`
				UPDATE public.applications
				SET 
					needs_user_review = FALSE,
					updated_at = NOW()
				WHERE id = ${applicationId} AND user_id = ${user.id} AND needs_user_review = TRUE
				RETURNING *;
			`;

			if (result.count === 0) {
				return c.json({ error: 'Application not found or not pending review.' }, 404);
			}

			return c.json({ data: result[0], message: 'Application approved successfully' });
		} else {
			// Delete: Remove the application entirely
			const result = await db`
				DELETE FROM public.applications
				WHERE id = ${applicationId} AND user_id = ${user.id} AND needs_user_review = TRUE
				RETURNING id;
			`;

			if (result.count === 0) {
				return c.json({ error: 'Application not found or not pending review.' }, 404);
			}

			return c.json({ message: 'Application deleted successfully' });
		}
	} catch (err: any) {
		console.error(`Error reviewing application ${applicationId}:`, err.message);
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body.' }, 400);
		}
		return c.json({ error: 'Failed to review application', details: err.message }, 500);
	}
}

/**
 * Get all applications for user
 */
export async function getApplications(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const applications =
			await db`SELECT id, company_name, role, status, applied_at, order_in_column FROM applications WHERE user_id = ${user.id} AND (needs_user_review = FALSE OR needs_user_review IS NULL) ORDER BY order_in_column ASC, applied_at DESC`;
		return c.json({ data: applications });
	} catch (err: any) {
		return c.json({ error: 'Failed to fetch applications', details: err.message }, 500);
	}
}

/**
 * Update an application
 */
export async function updateApplication(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const applicationId = c.req.param('id');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!applicationId) return c.json({ error: 'Application ID is required' }, 400);

	try {
		const requestData: ApplicationUpdateRequest = await c.req.json();
		const { status, notes, companyName, jobTitle, applicationDate, jobUrl, location, salary } = requestData;

		// Validate status if provided
		if (status && !VALID_APPLICATION_STATUSES.includes(status as any)) {
			return c.json({ error: 'Invalid status value' }, 400);
		}

		// Validate application date if provided
		if (applicationDate) {
			const appDate = new Date(applicationDate);
			if (isNaN(appDate.getTime())) {
				return c.json({ error: 'Invalid application date' }, 400);
			}
		}

		// Create update object with only provided fields
		const updateData: Record<string, any> = {};
		if (status) updateData.status = status;
		if (notes !== undefined) updateData.notes = notes;
		if (companyName) updateData.company_name = companyName.trim();
		if (jobTitle) updateData.role = jobTitle.trim();
		if (applicationDate) {
			const appDate = new Date(applicationDate);
			updateData.application_date = appDate.toISOString().split('T')[0];
			updateData.applied_at = appDate.toISOString();
		}
		if (jobUrl !== undefined) updateData.job_url = jobUrl?.trim() || null;
		if (location !== undefined) updateData.location = location?.trim() || null;
		if (salary !== undefined) updateData.salary_range = salary?.trim() || null;

		// Only update if there's something to update
		if (Object.keys(updateData).length === 0) {
			return c.json({ error: 'No update data provided' }, 400);
		}

		// Add updated_at timestamp
		updateData.updated_at = new Date().toISOString();

		// Update the application
		const result = await db`
			UPDATE applications
			SET ${db(updateData)}
			WHERE id = ${applicationId} AND user_id = ${user.id}
			RETURNING id, company_name, role, status, applied_at, application_date, 
					  notes, job_url, location, salary_range, updated_at
		`;

		if (result.count === 0) {
			return c.json({ error: 'Application not found or not authorized to update' }, 404);
		}

		return c.json({ data: result[0], message: 'Application updated successfully' });
	} catch (err: any) {
		console.error(`Error updating application ${applicationId}:`, err.message);
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body' }, 400);
		}
		return c.json({ error: 'Failed to update application', details: err.message }, 500);
	}
}

/**
 * Create a new application
 */
export async function createApplication(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const requestData: ApplicationCreateRequest = await c.req.json();
		const { companyName, jobTitle, status = 'Applied', applicationDate, jobUrl, location, salary, notes } = requestData;

		// Validate required fields
		if (!companyName || !jobTitle) {
			return c.json({ error: 'Company name and job title are required' }, 400);
		}

		// Validate status
		if (!VALID_APPLICATION_STATUSES.includes(status as any)) {
			return c.json({ error: 'Invalid status value' }, 400);
		}

		// Parse and validate application date
		const appDate = applicationDate ? new Date(applicationDate) : new Date();
		if (isNaN(appDate.getTime())) {
			return c.json({ error: 'Invalid application date' }, 400);
		}

		// Prepare application data
		const applicationData = {
			user_id: user.id,
			company_name: companyName.trim(),
			role: jobTitle.trim(),
			status: status,
			application_date: appDate.toISOString().split('T')[0],
			applied_at: appDate.toISOString(),
			job_url: jobUrl?.trim() || null,
			location: location?.trim() || null,
			salary_range: salary?.trim() || null,
			notes: notes?.trim() || null,
			manual_entry: true,
		};

		// Insert the application
		const result = await db`
			INSERT INTO public.applications (
				user_id, company_name, role, status, application_date, applied_at,
				job_url, location, salary_range, notes, manual_entry
			)
			VALUES (
				${applicationData.user_id},
				${applicationData.company_name},
				${applicationData.role},
				${applicationData.status},
				${applicationData.application_date}::date,
				${applicationData.applied_at}::timestamptz,
				${applicationData.job_url},
				${applicationData.location},
				${applicationData.salary_range},
				${applicationData.notes},
				${applicationData.manual_entry}
			)
			ON CONFLICT (user_id, dedupe_key) DO UPDATE
			SET
				role = EXCLUDED.role,
				status = EXCLUDED.status,
				job_url = EXCLUDED.job_url,
				location = EXCLUDED.location,
				salary_range = EXCLUDED.salary_range,
				notes = EXCLUDED.notes,
				updated_at = NOW()
			RETURNING id, company_name, role, status, application_date, applied_at, job_url, location, salary_range, notes;
		`;

		if (result && result.count > 0) {
			return c.json({
				success: true,
				data: result[0],
				message: 'Application created successfully',
			});
		} else {
			return c.json({ error: 'Failed to create application' }, 500);
		}
	} catch (err: any) {
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body' }, 400);
		}
		return c.json({ error: 'Failed to create application', details: err.message }, 500);
	}
}

/**
 * Get application sources (email history)
 */
export async function getApplicationSources(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const applicationId = c.req.param('id');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!applicationId) return c.json({ error: 'Application ID is required' }, 400);

	try {
		// First verify the application belongs to the user
		const application = await db`
			SELECT id, company_name, role FROM public.applications 
			WHERE id = ${applicationId} AND user_id = ${user.id} 
			LIMIT 1
		`;

		if (!application || application.length === 0) {
			return c.json({ error: 'Application not found or not authorized' }, 404);
		}

		// Fetch all email sources for this application
		const emailSources = await db`
			SELECT 
				id, source_email_id, source_thread_id, source_notes, created_at,
				source_type
			FROM public.application_sources 
			WHERE application_id = ${applicationId} 
			AND source_type = 'email'
			AND source_email_id IS NOT NULL
			ORDER BY created_at ASC
		`;

		// Also get the primary source email from the application table
		const primarySource = await db`
			SELECT source_email_id, source_thread_id 
			FROM public.applications 
			WHERE id = ${applicationId} AND user_id = ${user.id}
			AND source_email_id IS NOT NULL
		`;

		const allSources = [];

		// Add primary source if it exists
		if (primarySource && primarySource.length > 0 && primarySource[0].source_email_id) {
			allSources.push({
				id: 'primary',
				source_email_id: primarySource[0].source_email_id,
				source_thread_id: primarySource[0].source_thread_id,
				source_type: 'email',
				source_notes: 'Primary application email',
				is_primary: true,
				created_at: application[0].created_at || new Date().toISOString(),
			});
		}

		// Add additional sources, avoiding duplicates
		const primaryEmailId = primarySource?.[0]?.source_email_id;
		for (const source of emailSources) {
			if (source.source_email_id !== primaryEmailId) {
				allSources.push({
					...source,
					is_primary: false,
				});
			}
		}

		return c.json({
			data: {
				application: application[0],
				email_sources: allSources,
			},
		});
	} catch (err: any) {
		return c.json({ error: 'Failed to fetch email sources', details: err.message }, 500);
	}
}
