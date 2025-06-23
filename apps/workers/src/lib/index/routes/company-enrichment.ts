import type { Context } from 'hono';
import { getSupabase } from '../../../middleware/auth.middleware';
import type { Env } from '../types';

/**
 * Store company enrichment data
 */
export async function storeCompanyEnrichment(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const enrichmentData = await c.req.json();

		const {
			companyName,
			normalizedName,
			domain,
			logoUrl,
			description,
			industry,
			companySize,
			foundedYear,
			headquarters,
			website,
			linkedinUrl,
			fundingInfo,
			newsData,
			confidenceScore,
			dataSources,
			groundingMetadata,
			enrichmentType,
			quickEnrichedAt,
			comprehensiveEnrichedAt,
		} = enrichmentData;

		if (!companyName || !normalizedName) {
			return c.json({ error: 'Company name and normalized name are required' }, 400);
		}

		// Upsert company enrichment data
		const result = await db`
			INSERT INTO public.company_enrichment (
				company_name,
				normalized_name,
				domain,
				logo_url,
				description,
				industry,
				company_size,
				founded_year,
				headquarters,
				website,
				linkedin_url,
				funding_info,
				news_data,
				confidence_score,
				data_sources,
				grounding_metadata,
				enrichment_type,
				quick_enriched_at,
				comprehensive_enriched_at,
				last_enriched_at,
				created_at,
				updated_at
			) VALUES (
				${companyName},
				${normalizedName},
				${domain || null},
				${logoUrl || null},
				${description || null},
				${industry || null},
				${companySize || null},
				${foundedYear || null},
				${headquarters || null},
				${website || null},
				${linkedinUrl || null},
				${fundingInfo ? JSON.stringify(fundingInfo) : null},
				${newsData ? JSON.stringify(newsData) : null},
				${confidenceScore || 0.5},
				${dataSources ? JSON.stringify(dataSources) : null},
				${groundingMetadata ? JSON.stringify(groundingMetadata) : null},
				${enrichmentType || null},
				${quickEnrichedAt || null},
				${comprehensiveEnrichedAt || null},
				NOW(),
				NOW(),
				NOW()
			)
			ON CONFLICT (normalized_name) 
			DO UPDATE SET
				company_name = EXCLUDED.company_name,
				domain = EXCLUDED.domain,
				logo_url = EXCLUDED.logo_url,
				description = EXCLUDED.description,
				industry = EXCLUDED.industry,
				company_size = EXCLUDED.company_size,
				founded_year = EXCLUDED.founded_year,
				headquarters = EXCLUDED.headquarters,
				website = EXCLUDED.website,
				linkedin_url = EXCLUDED.linkedin_url,
				funding_info = EXCLUDED.funding_info,
				news_data = EXCLUDED.news_data,
				confidence_score = EXCLUDED.confidence_score,
				data_sources = EXCLUDED.data_sources,
				grounding_metadata = EXCLUDED.grounding_metadata,
				enrichment_type = EXCLUDED.enrichment_type,
				quick_enriched_at = EXCLUDED.quick_enriched_at,
				comprehensive_enriched_at = EXCLUDED.comprehensive_enriched_at,
				last_enriched_at = NOW(),
				updated_at = NOW()
			RETURNING *
		`;

		if (result.count === 0) {
			return c.json({ error: 'Failed to store enrichment data' }, 500);
		}

		return c.json({
			success: true,
			data: result[0],
			message: 'Company enrichment data stored successfully',
		});
	} catch (err: any) {
		if (err instanceof SyntaxError && err.message.includes('JSON')) {
			return c.json({ error: 'Invalid JSON in request body' }, 400);
		}
		return c.json({ error: 'Failed to store enrichment data', details: err.message }, 500);
	}
}

/**
 * Get company enrichment data by name or get all companies
 */
export async function getCompanyEnrichment(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const companyName = c.req.query('company');

		// If company name is provided, get specific company data
		if (companyName) {
			const normalizedName = companyName.toLowerCase().trim();

			const result = await db`
				SELECT * FROM public.company_enrichment
				WHERE normalized_name = ${normalizedName}
				ORDER BY last_enriched_at DESC
				LIMIT 1
			`;

			if (result.count === 0) {
				return c.json({ error: 'No enrichment data found for this company' }, 404);
			}

			// Transform database fields from snake_case to camelCase for frontend
			const transformedData = transformDatabaseToFrontend(result[0]);

			return c.json({
				success: true,
				data: transformedData,
				cached: true,
			});
		} else {
			// Otherwise, return all companies with pagination
			const limit = parseInt(c.req.query('limit') || '50');
			const offset = parseInt(c.req.query('offset') || '0');

			const result = await db`
				SELECT id, company_name, normalized_name, domain, logo_url, industry, 
					   company_size, founded_year, headquarters, confidence_score, 
					   last_enriched_at, created_at
				FROM public.company_enrichment
				ORDER BY last_enriched_at DESC
				LIMIT ${limit}
				OFFSET ${offset}
			`;

			// Transform all records
			const transformedData = result.map(transformDatabaseToFrontend);

			return c.json({
				success: true,
				data: transformedData,
				count: result.length,
				limit,
				offset,
			});
		}
	} catch (err: any) {
		console.error('Error fetching company enrichment data:', err.message);
		return c.json({ error: 'Failed to fetch enrichment data', details: err.message }, 500);
	}
}

/**
 * Transform database fields (snake_case) to frontend format (camelCase)
 */
function transformDatabaseToFrontend(dbRecord: any): any {
	return {
		id: dbRecord.id,
		companyName: dbRecord.company_name,
		normalizedName: dbRecord.normalized_name,
		domain: dbRecord.domain,
		logoUrl: dbRecord.logo_url,
		description: dbRecord.description,
		industry: dbRecord.industry,
		companySize: dbRecord.company_size,
		foundedYear: dbRecord.founded_year,
		headquarters: dbRecord.headquarters,
		website: dbRecord.website,
		linkedinUrl: dbRecord.linkedin_url,
		fundingInfo: dbRecord.funding_info ? JSON.parse(dbRecord.funding_info) : null,
		newsData: dbRecord.news_data ? JSON.parse(dbRecord.news_data) : null,
		confidenceScore: dbRecord.confidence_score,
		dataSources: dbRecord.data_sources ? JSON.parse(dbRecord.data_sources) : null,
		groundingMetadata: dbRecord.grounding_metadata ? JSON.parse(dbRecord.grounding_metadata) : null,
		enrichmentType: dbRecord.enrichment_type,
		quickEnrichedAt: dbRecord.quick_enriched_at,
		comprehensiveEnrichedAt: dbRecord.comprehensive_enriched_at,
		lastEnrichedAt: dbRecord.last_enriched_at,
		createdAt: dbRecord.created_at,
		updatedAt: dbRecord.updated_at,
	};
}

/**
 * Delete company enrichment data
 */
export async function deleteCompanyEnrichment(c: Context<Env>) {
	const supabase = getSupabase(c);
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	const db = c.var.db;

	if (authError || !user) return c.json({ error: 'Not authenticated', details: authError?.message }, 401);
	if (!db) return c.json({ error: 'Database not available' }, 500);

	try {
		const companyId = c.req.param('id');

		if (!companyId) {
			return c.json({ error: 'Company ID is required' }, 400);
		}

		const result = await db`
			DELETE FROM public.company_enrichment
			WHERE id = ${companyId}
			RETURNING id, company_name
		`;

		if (result.count === 0) {
			return c.json({ error: 'Company enrichment data not found' }, 404);
		}

		return c.json({
			success: true,
			message: `Company enrichment data for "${result[0].company_name}" deleted successfully`,
		});
	} catch (err: any) {
		console.error('Error deleting company enrichment data:', err.message);
		return c.json({ error: 'Failed to delete enrichment data', details: err.message }, 500);
	}
}
