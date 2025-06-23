import type { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import type { Env } from '../types';

// Helper functions to parse bullet-pointed strings from database
function parseStrengthsFromDatabase(strengthsText: string): string[] {
	if (!strengthsText || typeof strengthsText !== 'string') return [];

	// Split on bullet points and clean up
	return strengthsText
		.split('\n•')
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.map((s) => (s.startsWith('•') ? s.substring(1).trim() : s));
}

function parseGapsFromDatabase(weaknessesText: string): string[] {
	if (!weaknessesText || typeof weaknessesText !== 'string') return [];

	// Split on bullet points and clean up
	return weaknessesText
		.split('\n•')
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.map((s) => (s.startsWith('•') ? s.substring(1).trim() : s));
}

function parseRecommendationsFromDatabase(recommendationsText: string): string[] {
	if (!recommendationsText || typeof recommendationsText !== 'string') return [];

	// Split on bullet points and clean up
	return recommendationsText
		.split('\n•')
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.map((s) => (s.startsWith('•') ? s.substring(1).trim() : s));
}

// Helper function to convert decimal scores to percentages
function convertScoreToPercentage(score: number | null | undefined): number {
	if (score === null || score === undefined || isNaN(score)) return 0;

	// If score is already in percentage range (0-100), return as is
	if (score >= 1) return Math.round(score);

	// If score is in decimal range (0-1), convert to percentage
	return Math.round(score * 100);
}

/**
 * Get job-resume matches for user
 */
export async function getMatches(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		// Parse query parameters
		const url = new URL(c.req.url);
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const minScore = url.searchParams.get('minScore');
		const maxScore = url.searchParams.get('maxScore');
		const applicationId = url.searchParams.get('applicationId');
		const resumeId = url.searchParams.get('resumeId');
		const sortBy = url.searchParams.get('sortBy') || 'calculated_at';
		const sortOrder = url.searchParams.get('sortOrder') || 'desc';

		const offset = (page - 1) * limit;

		// Build base query with joins to get application and resume details
		let baseQuery = `
			SELECT 
				arm.*,
				a.company_name,
				a.role as job_title,
				a.status as application_status,
				a.application_date,
				a.location as job_location,
				a.salary_range,
				r.name as resume_name,
				r.is_primary as is_primary_resume,
				r.full_name as candidate_name
			FROM public.application_resume_matches arm
			JOIN public.applications a ON a.id = arm.application_id
			JOIN public.resumes r ON r.id = arm.resume_id
			WHERE arm.user_id = $1
		`;

		const queryParams = [user.id];
		let paramIndex = 2;

		// Apply filters
		// Note: Convert percentage scores from frontend (0-100) to decimal scores for database (0.0-1.0)
		if (minScore) {
			const minScoreDecimal = parseFloat(minScore) > 1 ? parseFloat(minScore) / 100 : parseFloat(minScore);
			baseQuery += ` AND arm.overall_fit_score >= $${paramIndex}`;
			queryParams.push(minScoreDecimal.toString());
			paramIndex++;
		}
		if (maxScore) {
			const maxScoreDecimal = parseFloat(maxScore) > 1 ? parseFloat(maxScore) / 100 : parseFloat(maxScore);
			baseQuery += ` AND arm.overall_fit_score <= $${paramIndex}`;
			queryParams.push(maxScoreDecimal.toString());
			paramIndex++;
		}
		if (applicationId) {
			baseQuery += ` AND arm.application_id = $${paramIndex}`;
			queryParams.push(applicationId);
			paramIndex++;
		}
		if (resumeId) {
			baseQuery += ` AND arm.resume_id = $${paramIndex}`;
			queryParams.push(resumeId);
			paramIndex++;
		}

		// Apply sorting
		const validSortColumns = ['calculated_at', 'overall_fit_score', 'company_name', 'job_title'];
		const actualSortBy = validSortColumns.includes(sortBy) ? sortBy : 'calculated_at';
		const actualSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
		baseQuery += ` ORDER BY ${actualSortBy} ${actualSortOrder}`;

		// Apply pagination
		baseQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
		queryParams.push(limit.toString(), offset.toString());

		// Execute main query
		const rawMatches = await db.unsafe(baseQuery, queryParams);

		// Enhanced transformation to include detailed insights
		const matches = (rawMatches || []).map((match: any) => {
			// Parse the database fields that contain bullet-pointed strings
			const strengths = parseStrengthsFromDatabase(match.strengths);
			const gaps = parseGapsFromDatabase(match.weaknesses);
			const recommendations = parseRecommendationsFromDatabase(match.recommendations);

			// Parse relevant experiences from JSON string
			let relevantExperiences = [];
			try {
				relevantExperiences = match.relevant_experiences ? JSON.parse(match.relevant_experiences) : [];
			} catch (e) {
				relevantExperiences = [];
			}

			// Convert scores from decimal (0.0-1.0) to percentage (0-100) for frontend display
			const overallFitScore = convertScoreToPercentage(match.overall_fit_score);
			const skillsMatchScore = convertScoreToPercentage(match.skills_match_score);
			const experienceMatchScore = convertScoreToPercentage(match.experience_match_score);
			const educationMatchScore = convertScoreToPercentage(match.education_match_score);

			return {
				...match,
				// Convert scores to percentages for frontend
				overall_fit_score: overallFitScore,
				skills_match_score: skillsMatchScore,
				experience_match_score: experienceMatchScore,
				education_match_score: educationMatchScore,
				// Enhanced match analysis with detailed fields
				match_analysis: {
					strengths,
					gaps,
					recommendations,
					// Add detailed insights
					matched_skills: match.matched_skills || [],
					missing_skills: match.missing_skills || [],
					relevant_experiences: relevantExperiences,
					job_requirements: {
						required_skills: match.job_required_skills || [],
						preferred_skills: match.job_preferred_skills || [],
						experience_level: match.job_experience_level || 'Unknown',
						education_requirements: match.job_education_requirements || [],
					},
					confidence_score: match.match_analysis_confidence || 0,
				},
			};
		});

		// Get total count for pagination
		let countQuery = `
			SELECT COUNT(*) as total
			FROM public.application_resume_matches arm
			WHERE arm.user_id = $1
		`;
		const countParams = [user.id];
		let countParamIndex = 2;

		// Apply same filters for count
		if (minScore) {
			const minScoreDecimal = parseFloat(minScore) > 1 ? parseFloat(minScore) / 100 : parseFloat(minScore);
			countQuery += ` AND arm.overall_fit_score >= $${countParamIndex}`;
			countParams.push(minScoreDecimal.toString());
			countParamIndex++;
		}
		if (maxScore) {
			const maxScoreDecimal = parseFloat(maxScore) > 1 ? parseFloat(maxScore) / 100 : parseFloat(maxScore);
			countQuery += ` AND arm.overall_fit_score <= $${countParamIndex}`;
			countParams.push(maxScoreDecimal.toString());
			countParamIndex++;
		}
		if (applicationId) {
			countQuery += ` AND arm.application_id = $${countParamIndex}`;
			countParams.push(applicationId);
			countParamIndex++;
		}
		if (resumeId) {
			countQuery += ` AND arm.resume_id = $${countParamIndex}`;
			countParams.push(resumeId);
			countParamIndex++;
		}

		const countResult = await db.unsafe(countQuery, countParams);
		const total = parseInt(countResult[0]?.total || '0');

		return c.json({
			success: true,
			data: {
				matches: matches || [],
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			},
		});
	} catch (err: any) {
		return c.json({ error: 'Failed to fetch matches', details: err.message }, 500);
	}
}

/**
 * Get detailed match analysis for a specific match
 */
export async function getMatchDetails(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const matchId = c.req.param('id');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!matchId) return c.json({ error: 'Match ID is required' }, 400);

	try {
		// Get match details with application and resume information
		const matchDetails = await db`
			SELECT 
				arm.*,
				a.company_name,
				a.role as job_title,
				a.status as application_status,
				a.application_date,
				a.location as job_location,
				a.salary_range,
				a.notes as job_description,
				r.name as resume_name,
				r.is_primary as is_primary_resume,
				r.full_name as candidate_name,
				r.summary as resume_summary
			FROM public.application_resume_matches arm
			JOIN public.applications a ON a.id = arm.application_id
			JOIN public.resumes r ON r.id = arm.resume_id
			WHERE arm.id = ${matchId} AND arm.user_id = ${user.id}
			LIMIT 1
		`;

		if (!matchDetails || matchDetails.length === 0) {
			return c.json({ error: 'Match not found or not authorized' }, 404);
		}

		const match = matchDetails[0];

		// Convert scores to percentages for frontend display
		const enhancedMatch = {
			...match,
			overall_fit_score: convertScoreToPercentage(match.overall_fit_score),
			skills_match_score: convertScoreToPercentage(match.skills_match_score),
			experience_match_score: convertScoreToPercentage(match.experience_match_score),
			education_match_score: convertScoreToPercentage(match.education_match_score),
		};

		// Get recommendations for this match
		const recommendations = await db`
			SELECT *
			FROM public.resume_recommendations
			WHERE user_id = ${user.id}
			AND (resume_id = ${match.resume_id} OR application_id = ${match.application_id})
			ORDER BY priority DESC, created_at DESC
			LIMIT 10
		`;

		return c.json({
			success: true,
			data: {
				match: enhancedMatch,
				recommendations: recommendations || [],
			},
		});
	} catch (err: any) {
		return c.json({ error: 'Failed to fetch match details', details: err.message }, 500);
	}
}

/**
 * Trigger job-resume matching analysis
 */
export async function triggerMatching(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const { applicationId, resumeId, forceRefresh } = await c.req.json();

		if (!applicationId || !resumeId) {
			return c.json({ error: 'applicationId and resumeId are required' }, 400);
		}

		// Verify user owns both the application and resume
		const [appCheck, resumeCheck] = await Promise.all([
			db`
				SELECT id, notes 
				FROM public.applications 
				WHERE id = ${applicationId} AND user_id = ${user.id}
				LIMIT 1
			`,
			db`
				SELECT id 
				FROM public.resumes 
				WHERE id = ${resumeId} AND user_id = ${user.id}
				LIMIT 1
			`,
		]);

		if (!appCheck || appCheck.length === 0 || !resumeCheck || resumeCheck.length === 0) {
			return c.json({ error: 'Application or resume not found' }, 404);
		}

		// Get job description from the application
		const jobDescription = appCheck[0].notes || '';

		if (!jobDescription.trim()) {
			return c.json({ error: 'No job description available for matching' }, 400);
		}

		// For now, return a placeholder response
		// TODO: Integrate with Trigger.dev task when available in workers
		return c.json({
			success: true,
			message: 'Matching analysis will be implemented with Trigger.dev integration',
			data: {
				applicationId,
				resumeId,
				status: 'pending',
				estimatedTime: '30-60 seconds',
			},
		});
	} catch (err: any) {
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body' }, 400);
		}
		return c.json({ error: 'Failed to trigger matching analysis', details: err.message }, 500);
	}
}

/**
 * Get user's match statistics
 */
export async function getMatchStats(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		// Get match statistics
		// Note: Database stores scores as decimals (0.0-1.0), so we use decimal thresholds
		const stats = await db`
			SELECT 
				COUNT(*) as total_matches,
				AVG(overall_fit_score) as avg_fit_score,
				COUNT(*) FILTER (WHERE overall_fit_score >= 0.8) as excellent_matches,
				COUNT(*) FILTER (WHERE overall_fit_score >= 0.6 AND overall_fit_score < 0.8) as good_matches,
				COUNT(*) FILTER (WHERE overall_fit_score < 0.6) as poor_matches,
				MAX(calculated_at) as last_calculated_at
			FROM public.application_resume_matches
			WHERE user_id = ${user.id}
		`;

		// Get recommendations count
		const recommendationStats = await db`
			SELECT 
				COUNT(*) as total_recommendations,
				COUNT(*) FILTER (WHERE is_applied = false) as pending_recommendations,
				COUNT(*) FILTER (WHERE priority >= 4) as high_priority_recommendations
			FROM public.resume_recommendations
			WHERE user_id = ${user.id}
		`;

		const matchStats = stats[0] || {};
		const recStats = recommendationStats[0] || {};

		// Get application and resume counts for stats
		const [appCount, resumeCount, recentMatches] = await Promise.all([
			db`SELECT COUNT(*) as count FROM public.applications WHERE user_id = ${user.id}`,
			db`SELECT COUNT(*) as count FROM public.resumes WHERE user_id = ${user.id}`,
			db`SELECT COUNT(*) as count FROM public.application_resume_matches 
			   WHERE user_id = ${user.id} AND calculated_at >= NOW() - INTERVAL '7 days'`,
		]);

		return c.json({
			success: true,
			data: {
				totalMatches: parseInt(matchStats.total_matches || '0'),
				averageFitScore: convertScoreToPercentage(parseFloat(matchStats.avg_fit_score || '0')),
				excellentMatches: parseInt(matchStats.excellent_matches || '0'),
				goodMatches: parseInt(matchStats.good_matches || '0'),
				poorMatches: parseInt(matchStats.poor_matches || '0'),
				recentMatches: parseInt(recentMatches[0]?.count || '0'),
				totalApplications: parseInt(appCount[0]?.count || '0'),
				totalResumes: parseInt(resumeCount[0]?.count || '0'),
			},
		});
	} catch (err: any) {
		return c.json({ error: 'Failed to fetch match statistics', details: err.message }, 500);
	}
}

/**
 * Get recommendations for a user
 */
export async function getRecommendations(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		// Parse query parameters
		const url = new URL(c.req.url);
		const resumeId = url.searchParams.get('resumeId');
		const applicationId = url.searchParams.get('applicationId');
		const type = url.searchParams.get('type');
		const onlyPending = url.searchParams.get('onlyPending') === 'true';

		let query = `
			SELECT rr.*, r.name as resume_name, a.company_name, a.role as job_title
			FROM public.resume_recommendations rr
			LEFT JOIN public.resumes r ON r.id = rr.resume_id
			LEFT JOIN public.applications a ON a.id = rr.application_id
			WHERE rr.user_id = $1
		`;

		const queryParams = [user.id];
		let paramIndex = 2;

		if (resumeId) {
			query += ` AND rr.resume_id = $${paramIndex}`;
			queryParams.push(resumeId);
			paramIndex++;
		}

		if (applicationId) {
			query += ` AND rr.application_id = $${paramIndex}`;
			queryParams.push(applicationId);
			paramIndex++;
		}

		if (type) {
			query += ` AND rr.recommendation_type = $${paramIndex}`;
			queryParams.push(type);
			paramIndex++;
		}

		if (onlyPending) {
			query += ` AND rr.is_applied = false`;
		}

		query += ` ORDER BY rr.priority DESC, rr.created_at DESC LIMIT 50`;

		const recommendations = await db.unsafe(query, queryParams);

		return c.json({
			success: true,
			data: recommendations || [],
		});
	} catch (err: any) {
		return c.json({ error: 'Failed to fetch recommendations', details: err.message }, 500);
	}
}

/**
 * Update recommendation status (mark as applied, add feedback)
 */
export async function updateRecommendation(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;
	const recommendationId = c.req.param('id');

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);
	if (!recommendationId) return c.json({ error: 'Recommendation ID is required' }, 400);

	try {
		const { isApplied, userFeedback } = await c.req.json();

		const updateData: Record<string, any> = {
			updated_at: new Date().toISOString(),
		};

		if (typeof isApplied === 'boolean') {
			updateData.is_applied = isApplied;
			if (isApplied) {
				updateData.applied_at = new Date().toISOString();
			}
		}

		if (userFeedback !== undefined) {
			updateData.user_feedback = userFeedback;
		}

		const result = await db`
			UPDATE public.resume_recommendations
			SET ${db(updateData)}
			WHERE id = ${recommendationId} AND user_id = ${user.id}
			RETURNING *
		`;

		if (!result || result.length === 0) {
			return c.json({ error: 'Recommendation not found or not authorized' }, 404);
		}

		return c.json({
			success: true,
			data: result[0],
			message: 'Recommendation updated successfully',
		});
	} catch (err: any) {
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body' }, 400);
		}
		return c.json({ error: 'Failed to update recommendation', details: err.message }, 500);
	}
}
