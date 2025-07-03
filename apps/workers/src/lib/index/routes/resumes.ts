import { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import type { Env } from '../types';

// === Get Resumes ===
export async function getResumes(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();
		const db = c.var.db;

		if (authError || !user) {
			return c.json({ error: 'Authentication required', details: authError?.message }, 401);
		}
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		// Get all resumes for user
		const resumes = await db`
			SELECT * FROM public.resumes 
			WHERE user_id = ${user.id}
			ORDER BY created_at DESC
		`;

		if (resumes.length === 0) {
			return c.json({
				success: true,
				data: [],
			});
		}

		// Get all resume IDs for bulk fetching
		const resumeIds = resumes.map((r) => r.id);

		// Get all related data in parallel for all resumes
		const [allExperiences, allEducation, allSkills, allProjects, allCertifications] = await Promise.all([
			db`
				SELECT * FROM public.resume_experiences 
				WHERE resume_id = ANY(${resumeIds}) 
				ORDER BY resume_id, display_order ASC
			`,
			db`
				SELECT * FROM public.resume_education 
				WHERE resume_id = ANY(${resumeIds}) 
				ORDER BY resume_id, display_order ASC
			`,
			db`
				SELECT * FROM public.resume_skills 
				WHERE resume_id = ANY(${resumeIds})
				ORDER BY resume_id
			`,
			db`
				SELECT * FROM public.resume_projects 
				WHERE resume_id = ANY(${resumeIds}) 
				ORDER BY resume_id, display_order ASC
			`,
			db`
				SELECT * FROM public.resume_certifications 
				WHERE resume_id = ANY(${resumeIds})
				ORDER BY resume_id
			`,
		]);

		// Group related data by resume_id
		const experiencesByResumeId = allExperiences.reduce(
			(acc, exp) => {
				if (!acc[exp.resume_id]) acc[exp.resume_id] = [];
				acc[exp.resume_id].push(exp);
				return acc;
			},
			{} as Record<string, any[]>,
		);

		const educationByResumeId = allEducation.reduce(
			(acc, edu) => {
				if (!acc[edu.resume_id]) acc[edu.resume_id] = [];
				acc[edu.resume_id].push(edu);
				return acc;
			},
			{} as Record<string, any[]>,
		);

		const skillsByResumeId = allSkills.reduce(
			(acc, skill) => {
				if (!acc[skill.resume_id]) acc[skill.resume_id] = [];
				acc[skill.resume_id].push(skill);
				return acc;
			},
			{} as Record<string, any[]>,
		);

		const projectsByResumeId = allProjects.reduce(
			(acc, project) => {
				if (!acc[project.resume_id]) acc[project.resume_id] = [];
				acc[project.resume_id].push(project);
				return acc;
			},
			{} as Record<string, any[]>,
		);

		const certificationsByResumeId = allCertifications.reduce(
			(acc, cert) => {
				if (!acc[cert.resume_id]) acc[cert.resume_id] = [];
				acc[cert.resume_id].push(cert);
				return acc;
			},
			{} as Record<string, any[]>,
		);

		// Combine resumes with their detailed data
		const resumesWithDetails = resumes.map((resume) => ({
			...resume,
			experiences: experiencesByResumeId[resume.id] || [],
			education: educationByResumeId[resume.id] || [],
			skills: skillsByResumeId[resume.id] || [],
			projects: projectsByResumeId[resume.id] || [],
			certifications: certificationsByResumeId[resume.id] || [],
			// Add counts for backward compatibility with UI
			experiences_count: (experiencesByResumeId[resume.id] || []).length,
			skills_count: (skillsByResumeId[resume.id] || []).length,
			education_count: (educationByResumeId[resume.id] || []).length,
		}));

		return c.json({
			success: true,
			data: resumesWithDetails,
		});
	} catch (error: any) {
		return c.json(
			{
				error: 'Failed to fetch resumes',
				details: error.message,
			},
			500,
		);
	}
}

// === Get Resume Details ===
export async function getResumeDetails(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();
		const db = c.var.db;

		if (authError || !user) {
			return c.json({ error: 'Authentication required', details: authError?.message }, 401);
		}
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		const resumeId = c.req.param('id');
		if (!resumeId) {
			return c.json({ error: 'Resume ID is required' }, 400);
		}

		// Get resume basic info and verify ownership
		const resume = await db`
			SELECT * FROM public.resumes 
			WHERE id = ${resumeId} AND user_id = ${user.id}
		`;

		if (resume.length === 0) {
			return c.json({ error: 'Resume not found' }, 404);
		}

		// Get all related data in parallel
		const [experiences, education, skills, projects, certifications] = await Promise.all([
			db`
				SELECT * FROM public.resume_experiences 
				WHERE resume_id = ${resumeId} 
				ORDER BY display_order ASC
			`,
			db`
				SELECT * FROM public.resume_education 
				WHERE resume_id = ${resumeId} 
				ORDER BY display_order ASC
			`,
			db`
				SELECT * FROM public.resume_skills 
				WHERE resume_id = ${resumeId}
			`,
			db`
				SELECT * FROM public.resume_projects 
				WHERE resume_id = ${resumeId} 
				ORDER BY display_order ASC
			`,
			db`
				SELECT * FROM public.resume_certifications 
				WHERE resume_id = ${resumeId}
			`,
		]);

		const resumeDetail = {
			...resume[0],
			experiences: experiences || [],
			education: education || [],
			skills: skills || [],
			projects: projects || [],
			certifications: certifications || [],
		};

		return c.json({
			success: true,
			data: resumeDetail,
		});
	} catch (error: any) {
		return c.json(
			{
				error: 'Failed to fetch resume details',
				details: error.message,
			},
			500,
		);
	}
}

// === Set Primary Resume ===
export async function setPrimaryResume(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();
		const db = c.var.db;

		if (authError || !user) {
			return c.json({ error: 'Authentication required', details: authError?.message }, 401);
		}
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		const resumeId = c.req.param('id');
		if (!resumeId) {
			return c.json({ error: 'Resume ID is required' }, 400);
		}

		// Verify resume belongs to user
		const resume = await db`
			SELECT id FROM public.resumes 
			WHERE id = ${resumeId} AND user_id = ${user.id}
		`;

		if (resume.length === 0) {
			return c.json({ error: 'Resume not found' }, 404);
		}

		// Update primary status - first unset all, then set the new one
		await db.begin(async (tx) => {
			await tx`
				UPDATE public.resumes 
				SET is_primary = FALSE 
				WHERE user_id = ${user.id}
			`;

			await tx`
				UPDATE public.resumes 
				SET is_primary = TRUE 
				WHERE id = ${resumeId}
			`;
		});

		return c.json({
			success: true,
			message: 'Primary resume updated successfully',
		});
	} catch (error: any) {
		return c.json(
			{
				error: 'Failed to set primary resume',
				details: error.message,
			},
			500,
		);
	}
}

// === Delete Resume ===
export async function deleteResume(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();
		const db = c.var.db;

		if (authError || !user) {
			return c.json({ error: 'Authentication required', details: authError?.message }, 401);
		}
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		const resumeId = c.req.param('id');
		if (!resumeId) {
			return c.json({ error: 'Resume ID is required' }, 400);
		}

		// Get resume details and verify ownership
		const resume = await db`
			SELECT id, file_path FROM public.resumes 
			WHERE id = ${resumeId} AND user_id = ${user.id}
		`;

		if (resume.length === 0) {
			return c.json({ error: 'Resume not found' }, 404);
		}

		// Delete the resume (cascade will handle related records)
		await db`
			DELETE FROM public.resumes 
			WHERE id = ${resumeId}
		`;

		// Note: File deletion from storage would need to be handled separately
		// as we don't have access to Supabase storage from workers

		return c.json({
			success: true,
			message: 'Resume deleted successfully',
		});
	} catch (error: any) {
		return c.json(
			{
				error: 'Failed to delete resume',
				details: error.message,
			},
			500,
		);
	}
}

// === Get Resume Content for AI Processing ===
export async function getResumeContent(c: Context<Env>) {
	try {
		const supabase = getSupabase(c);
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();
		const db = c.var.db;

		if (authError || !user) {
			return c.json({ error: 'Authentication required', details: authError?.message }, 401);
		}
		if (!db) {
			return c.json({ error: 'Database not available' }, 500);
		}

		const resumeId = c.req.param('id');
		if (!resumeId) {
			return c.json({ error: 'Resume ID is required' }, 400);
		}

		// Get resume with parsed_data and verify ownership
		const resume = await db`
			SELECT id, parsed_data, parsing_status
			FROM public.resumes 
			WHERE id = ${resumeId} AND user_id = ${user.id}
		`;

		if (resume.length === 0) {
			return c.json({ error: 'Resume not found' }, 404);
		}

		const resumeData = resume[0];

		if (resumeData.parsing_status !== 'completed') {
			return c.json({ error: 'Resume parsing not completed yet' }, 400);
		}

		if (!resumeData.parsed_data) {
			return c.json({ error: 'No parsed data available for this resume' }, 400);
		}

		return c.json({
			success: true,
			data: {
				resumeId: resumeData.id,
				parsedData: resumeData.parsed_data,
			},
		});
	} catch (error: any) {
		return c.json(
			{
				error: 'Failed to fetch resume content',
				details: error.message,
			},
			500,
		);
	}
}
