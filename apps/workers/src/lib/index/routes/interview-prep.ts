import type { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import type { Env } from '../types';

/**
 * Get user's interview sessions
 */
export async function getInterviewSessions(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const sessions = await db`
			SELECT 
				is_.*,
				a.id as application_id,
				a.company_name,
				a.role,
				r.id as resume_id,
				r.name as resume_name
			FROM public.interview_sessions is_
			JOIN public.applications a ON a.id = is_.application_id
			JOIN public.resumes r ON r.id = is_.resume_id
			WHERE is_.user_id = ${user.id}
			ORDER BY is_.created_at DESC
		`;

		// Transform to match expected structure
		const transformedSessions = sessions.map(session => ({
			id: session.id,
			session_name: session.session_name,
			session_type: session.session_type,
			status: session.status,
			created_at: session.created_at,
			updated_at: session.updated_at,
			application_id: session.application_id,
			resume_id: session.resume_id,
			applications: {
				id: session.application_id,
				company_name: session.company_name,
				role: session.role
			},
			resumes: {
				id: session.resume_id,
				name: session.resume_name
			}
		}));

		return c.json({
			success: true,
			data: transformedSessions,
		});
	} catch (error: any) {
		console.error('Unexpected error in getInterviewSessions:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Create new interview session
 */
export async function createInterviewSession(c: Context<Env>) {
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
		const { sessionName, sessionType, applicationId, resumeId } = body;

		if (!sessionName || !sessionType || !applicationId || !resumeId) {
			return c.json({
				success: false,
				error: 'Missing required fields: sessionName, sessionType, applicationId, resumeId',
			}, 400);
		}

		const session = await db`
			INSERT INTO public.interview_sessions (
				user_id, session_name, session_type, application_id, resume_id, status
			) VALUES (
				${user.id}, ${sessionName}, ${sessionType}, ${applicationId}, ${resumeId}, 'preparing'
			)
			RETURNING id, session_name, session_type, status, created_at
		`;

		if (!session || session.length === 0) {
			return c.json({ success: false, error: 'Failed to create session' }, 500);
		}

		return c.json({
			success: true,
			data: session[0],
			message: 'Interview session created successfully',
		});
	} catch (error: any) {
		console.error('Unexpected error in createInterviewSession:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Get interview session details
 */
export async function getInterviewSessionDetails(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const sessionId = c.req.param('sessionId');

		const session = await db`
			SELECT 
				is_.*,
				a.id as application_id,
				a.company_name,
				a.role,
				a.job_description,
				r.id as resume_id,
				r.name as resume_name
			FROM public.interview_sessions is_
			JOIN public.applications a ON a.id = is_.application_id
			JOIN public.resumes r ON r.id = is_.resume_id
			WHERE is_.id = ${sessionId} AND is_.user_id = ${user.id}
		`;

		if (!session || session.length === 0) {
			return c.json({ success: false, error: 'Session not found' }, 404);
		}

		// Transform to match expected structure
		const transformedSession = {
			id: session[0].id,
			session_name: session[0].session_name,
			session_type: session[0].session_type,
			status: session[0].status,
			created_at: session[0].created_at,
			updated_at: session[0].updated_at,
			application_id: session[0].application_id,
			resume_id: session[0].resume_id,
			applications: {
				id: session[0].application_id,
				company_name: session[0].company_name,
				role: session[0].role,
				job_description: session[0].job_description
			},
			resumes: {
				id: session[0].resume_id,
				name: session[0].resume_name
			}
		};

		return c.json({
			success: true,
			data: transformedSession,
		});
	} catch (error: any) {
		console.error('Unexpected error in getInterviewSessionDetails:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Get complete session data (session + questions + brief + star stories) for detail page
 */
export async function getCompleteSessionData(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const sessionId = c.req.param('sessionId');

		// Fetch session details, questions, brief, and star stories in parallel
		const [sessionResult, questionsResult, briefResult, starStoriesResult] = await Promise.all([
			// Session details
			db`
				SELECT 
					is_.*,
					a.id as application_id,
					a.company_name,
					a.role,
					a.job_description,
					r.id as resume_id,
					r.name as resume_name
				FROM public.interview_sessions is_
				JOIN public.applications a ON a.id = is_.application_id
				JOIN public.resumes r ON r.id = is_.resume_id
				WHERE is_.id = ${sessionId} AND is_.user_id = ${user.id}
			`,
			// Questions
			db`
				SELECT * FROM public.interview_questions 
				WHERE session_id = ${sessionId}
				ORDER BY order_index ASC
			`,
			// Brief
			db`
				SELECT * FROM public.interview_briefs 
				WHERE session_id = ${sessionId}
			`,
			// Interview STAR stories for this session
			db`
				SELECT * FROM public.interview_star_stories 
				WHERE session_id = ${sessionId}
				ORDER BY relevance_score DESC, confidence_score DESC
			`
		]);

		if (!sessionResult || sessionResult.length === 0) {
			return c.json({ success: false, error: 'Session not found' }, 404);
		}

		// Transform session data
		const session = {
			id: sessionResult[0].id,
			session_name: sessionResult[0].session_name,
			session_type: sessionResult[0].session_type,
			status: sessionResult[0].status,
			created_at: sessionResult[0].created_at,
			updated_at: sessionResult[0].updated_at,
			application_id: sessionResult[0].application_id,
			resume_id: sessionResult[0].resume_id,
			question_generation_status: sessionResult[0].question_generation_status,
			brief_generation_status: sessionResult[0].brief_generation_status,
			generation_progress: sessionResult[0].generation_progress,
			generation_metadata: sessionResult[0].generation_metadata,
			applications: {
				id: sessionResult[0].application_id,
				company_name: sessionResult[0].company_name,
				role: sessionResult[0].role,
				job_description: sessionResult[0].job_description
			},
			resumes: {
				id: sessionResult[0].resume_id,
				name: sessionResult[0].resume_name
			}
		};

		return c.json({
			success: true,
			data: {
				session,
				questions: questionsResult || [],
				brief: briefResult && briefResult.length > 0 ? briefResult[0] : null,
				starStories: starStoriesResult || []
			},
		});
	} catch (error: any) {
		console.error('Unexpected error in getCompleteSessionData:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Update interview session
 */
export async function updateInterviewSession(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const sessionId = c.req.param('sessionId');
		const body = await c.req.json();
		const { sessionName, status } = body;

		const updateFields = [];
		const updateValues = [];
		
		if (sessionName) {
			updateFields.push('session_name = $' + (updateValues.length + 2));
			updateValues.push(sessionName);
		}
		if (status) {
			updateFields.push('status = $' + (updateValues.length + 2));
			updateValues.push(status);
		}

		if (updateFields.length === 0) {
			return c.json({ success: false, error: 'No fields to update' }, 400);
		}

		const query = `
			UPDATE public.interview_sessions 
			SET ${updateFields.join(', ')}, updated_at = NOW()
			WHERE id = $1 AND user_id = $${updateValues.length + 2}
			RETURNING id, session_name, session_type, status, updated_at
		`;

		const session = await db.unsafe(query, [sessionId, ...updateValues, user.id]);

		if (!session || session.length === 0) {
			return c.json({ success: false, error: 'Session not found or not authorized' }, 404);
		}

		return c.json({
			success: true,
			data: session[0],
			message: 'Session updated successfully',
		});
	} catch (error: any) {
		console.error('Unexpected error in updateInterviewSession:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Delete interview session
 */
export async function deleteInterviewSession(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const sessionId = c.req.param('sessionId');

		const result = await db`
			DELETE FROM public.interview_sessions 
			WHERE id = ${sessionId} AND user_id = ${user.id}
		`;

		return c.json({
			success: true,
			message: 'Session deleted successfully',
		});
	} catch (error: any) {
		console.error('Unexpected error in deleteInterviewSession:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Get questions for an interview session
 */
export async function getInterviewQuestions(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const sessionId = c.req.param('sessionId');

		// Verify session belongs to user
		const session = await db`
			SELECT id FROM public.interview_sessions 
			WHERE id = ${sessionId} AND user_id = ${user.id}
		`;

		if (!session || session.length === 0) {
			return c.json({ success: false, error: 'Session not found' }, 404);
		}

		const questions = await db`
			SELECT * FROM public.interview_questions 
			WHERE session_id = ${sessionId}
			ORDER BY order_index ASC
		`;

		return c.json({
			success: true,
			data: questions || [],
		});
	} catch (error: any) {
		console.error('Unexpected error in getInterviewQuestions:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Get interview brief for a session
 */
export async function getInterviewBrief(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const sessionId = c.req.param('sessionId');

		// Verify session belongs to user
		const session = await db`
			SELECT id FROM public.interview_sessions 
			WHERE id = ${sessionId} AND user_id = ${user.id}
		`;

		if (!session || session.length === 0) {
			return c.json({ success: false, error: 'Session not found' }, 404);
		}

		const brief = await db`
			SELECT * FROM public.interview_briefs 
			WHERE session_id = ${sessionId}
		`;

		return c.json({
			success: true,
			data: brief.length > 0 ? brief[0] : null,
		});
	} catch (error: any) {
		console.error('Unexpected error in getInterviewBrief:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Get interview STAR stories for a session
 */
export async function getInterviewStarStories(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const sessionId = c.req.param('sessionId');

		// Verify session belongs to user
		const session = await db`
			SELECT id FROM public.interview_sessions 
			WHERE id = ${sessionId} AND user_id = ${user.id}
		`;

		if (!session || session.length === 0) {
			return c.json({ success: false, error: 'Session not found' }, 404);
		}

		const stories = await db`
			SELECT * FROM public.interview_star_stories 
			WHERE session_id = ${sessionId}
			ORDER BY relevance_score DESC, confidence_score DESC
		`;

		return c.json({
			success: true,
			data: stories || [],
		});
	} catch (error: any) {
		console.error('Unexpected error in getInterviewStarStories:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Get all user's STAR stories across all sessions (for backward compatibility)
 */
export async function getAllStarStories(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		// Get all star stories for user's sessions
		const stories = await db`
			SELECT iss.*, is_.session_name, is_.application_id, a.company_name, a.role
			FROM public.interview_star_stories iss
			JOIN public.interview_sessions is_ ON iss.session_id = is_.id
			JOIN public.applications a ON is_.application_id = a.id
			WHERE is_.user_id = ${user.id}
			ORDER BY iss.relevance_score DESC, iss.confidence_score DESC
		`;

		return c.json({
			success: true,
			data: stories || [],
		});
	} catch (error: any) {
		console.error('Unexpected error in getAllStarStories:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Update interview STAR story
 */
export async function updateInterviewStarStory(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const storyId = c.req.param('storyId');
		const body = await c.req.json();
		const { title, situation, task, action, result, skillsDemonstrated, storyCategory, usageCount } = body;

		// Verify the story belongs to a session owned by the user
		const storyCheck = await db`
			SELECT iss.id FROM public.interview_star_stories iss
			JOIN public.interview_sessions is_ ON iss.session_id = is_.id
			WHERE iss.id = ${storyId} AND is_.user_id = ${user.id}
		`;

		if (!storyCheck || storyCheck.length === 0) {
			return c.json({ success: false, error: 'STAR story not found or not authorized' }, 404);
		}

		const updateFields = [];
		const updateValues = [];
		
		if (title) {
			updateFields.push('title = $' + (updateValues.length + 2));
			updateValues.push(title);
		}
		if (situation) {
			updateFields.push('situation = $' + (updateValues.length + 2));
			updateValues.push(situation);
		}
		if (task) {
			updateFields.push('task = $' + (updateValues.length + 2));
			updateValues.push(task);
		}
		if (action) {
			updateFields.push('action = $' + (updateValues.length + 2));
			updateValues.push(action);
		}
		if (result) {
			updateFields.push('result = $' + (updateValues.length + 2));
			updateValues.push(result);
		}
		if (skillsDemonstrated) {
			updateFields.push('skills_demonstrated = $' + (updateValues.length + 2));
			updateValues.push(skillsDemonstrated);
		}
		if (storyCategory) {
			updateFields.push('story_category = $' + (updateValues.length + 2));
			updateValues.push(storyCategory);
		}
		if (usageCount !== undefined) {
			updateFields.push('usage_count = $' + (updateValues.length + 2));
			updateValues.push(usageCount);
		}

		if (updateFields.length === 0) {
			return c.json({ success: false, error: 'No fields to update' }, 400);
		}

		const query = `
			UPDATE public.interview_star_stories 
			SET ${updateFields.join(', ')}, updated_at = NOW()
			WHERE id = $1
			RETURNING *
		`;

		const story = await db.unsafe(query, [storyId, ...updateValues]);

		if (!story || story.length === 0) {
			return c.json({ success: false, error: 'Failed to update STAR story' }, 500);
		}

		return c.json({
			success: true,
			data: story[0],
			message: 'STAR story updated successfully',
		});
	} catch (error: any) {
		console.error('Unexpected error in updateInterviewStarStory:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * Delete interview STAR story
 */
export async function deleteInterviewStarStory(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const storyId = c.req.param('storyId');

		// Verify the story belongs to a session owned by the user before deleting
		const storyCheck = await db`
			SELECT iss.id FROM public.interview_star_stories iss
			JOIN public.interview_sessions is_ ON iss.session_id = is_.id
			WHERE iss.id = ${storyId} AND is_.user_id = ${user.id}
		`;

		if (!storyCheck || storyCheck.length === 0) {
			return c.json({ success: false, error: 'STAR story not found or not authorized' }, 404);
		}

		const result = await db`
			DELETE FROM public.interview_star_stories 
			WHERE id = ${storyId}
		`;

		return c.json({
			success: true,
			message: 'STAR story deleted successfully',
		});
	} catch (error: any) {
		console.error('Unexpected error in deleteInterviewStarStory:', error);
		return c.json({ success: false, error: 'Internal server error', details: error.message }, 500);
	}
}