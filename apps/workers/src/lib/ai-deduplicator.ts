import { createWorkersAI } from 'workers-ai-provider';
import { generateText } from 'ai';
import { z } from 'zod';
import type { Ai } from '@cloudflare/workers-types';
import type { EmailToParse } from './types';

// Zod schema for AI duplicate detection response
const DuplicateDetectionSchema = z.object({
	isDuplicate: z.boolean().describe('True if the applications appear to be for the same job at the same company'),
	confidence: z.number().min(0).max(1).describe('Confidence score from 0 to 1, where 1 is completely certain'),
	reasoning: z.string().describe('Brief explanation of why these are or are not duplicates'),
	suggestedAction: z.enum(['merge', 'keep_separate', 'needs_review']).describe('Recommended action to take'),
	mergeStrategy: z
		.object({
			primarySource: z.enum(['existing', 'new']).describe('Which application should be considered primary'),
			fieldsToUpdate: z.array(z.string()).describe('List of fields that should be updated from the other application'),
			notesToAdd: z.string().nullable().describe('Additional notes to append about the merge'),
		})
		.nullable()
		.describe('Merge strategy if isDuplicate is true'),
});

export type DuplicateDetectionResult = z.infer<typeof DuplicateDetectionSchema>;

// Interface for application data to compare
export interface ApplicationForComparison {
	id?: string;
	company_name: string;
	role: string;
	status: string;
	application_date: string;
	job_url?: string | null;
	location?: string | null;
	salary_range?: string | null;
	notes?: string | null;
	source_email_id?: string | null;
	source_thread_id?: string | null;
	manual_entry?: boolean;
}

// Create AI prompt for duplicate detection
function createDuplicateDetectionPrompt(
	existingApp: ApplicationForComparison,
	newApp: ApplicationForComparison,
	emailContext?: EmailToParse,
): string {
	return `You are an expert at detecting duplicate job applications. Analyze these two applications to determine if they represent the same job application.

**IMPORTANT GUIDELINES:**
- Applications to the SAME COMPANY with SIMILAR ROLES are very likely duplicates
- Different email sources (LinkedIn, company direct, etc.) often create duplicates for the same application
- Similar application dates (within a few days) suggest the same application process
- Be AGGRESSIVE in detecting duplicates - it's better to merge similar applications than create duplicates
- Even if job titles are slightly different, they might be the same role described differently

**Existing Application:**
Company: ${existingApp.company_name}
Role: ${existingApp.role}
Status: ${existingApp.status}
Application Date: ${existingApp.application_date}
Job URL: ${existingApp.job_url || 'N/A'}
Location: ${existingApp.location || 'N/A'}
Salary: ${existingApp.salary_range || 'N/A'}
Notes: ${existingApp.notes || 'N/A'}
Source Email: ${existingApp.source_email_id || 'N/A'}

**New Application:**
Company: ${newApp.company_name}
Role: ${newApp.role}
Status: ${newApp.status}
Application Date: ${newApp.application_date}
Job URL: ${newApp.job_url || 'N/A'}
Location: ${newApp.location || 'N/A'}
Salary: ${newApp.salary_range || 'N/A'}
Notes: ${newApp.notes || 'N/A'}
Source Email: ${newApp.source_email_id || 'N/A'}

${
	emailContext
		? `**Email Context for New Application:**
Subject: ${emailContext.gmailMessage.subject || 'N/A'}
From: ${emailContext.gmailMessage.from || 'N/A'}
Snippet: ${emailContext.gmailMessage.snippet || 'N/A'}
`
		: ''
}

**DECISION CRITERIA:**
- If SAME COMPANY + SIMILAR ROLE + SIMILAR DATE (within 7 days) → VERY LIKELY DUPLICATE
- If SAME COMPANY + EXACT ROLE → ALMOST CERTAINLY DUPLICATE  
- If SAME COMPANY + DIFFERENT ROLES → Check if roles could be the same position described differently
- Different companies → Usually not duplicates unless they're subsidiaries/related

Respond with JSON in <json></json> tags with this exact structure:

{
  "isDuplicate": boolean,
  "confidence": number (0.0 to 1.0),
  "reasoning": "detailed explanation of your decision",
  "suggestedAction": "merge" | "keep_separate",
  "mergeStrategy": {
    "primarySource": "existing" | "new",
    "fieldsToUpdate": ["field1", "field2"],
    "notesToAdd": "additional notes to append"
  } | null
}

**Examples:**

<json>
{
  "isDuplicate": true,
  "confidence": 0.95,
  "reasoning": "Same company 'Borrowell' and exact role 'Full Stack Developer' with same application date. One from LinkedIn confirmation, one from company direct - classic duplicate scenario.",
  "suggestedAction": "merge",
  "mergeStrategy": {
    "primarySource": "existing",
    "fieldsToUpdate": ["notes"],
    "notesToAdd": "Also received LinkedIn confirmation email"
  }
}
</json>

<json>
{
  "isDuplicate": false,
  "confidence": 0.3,
  "reasoning": "While both are at tech companies, 'Stripe' vs 'Square' are different companies entirely, despite similar roles.",
  "suggestedAction": "keep_separate",
  "mergeStrategy": null
}
</json>

Now analyze the applications above:`;
}

// Main function to detect duplicates using AI
export async function detectDuplicateApplication(
	existingApp: ApplicationForComparison,
	newApp: ApplicationForComparison,
	aiBinding: Ai,
	emailContext?: EmailToParse,
): Promise<DuplicateDetectionResult | null> {
	try {
		const workersai = createWorkersAI({ binding: aiBinding as any });
		const model = workersai('@cf/meta/llama-3.1-8b-instruct-fp8' as any);

		const prompt = createDuplicateDetectionPrompt(existingApp, newApp, emailContext);

		console.log(
			`[ai-deduplicator] Analyzing potential duplicate: ${existingApp.company_name} (${existingApp.role}) vs ${newApp.company_name} (${newApp.role})`,
		);

		// Add timeout protection for AI calls
		const aiPromise = generateText({
			model: model,
			prompt: prompt,
		});

		// 30-second timeout for AI duplicate detection
		const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI duplicate detection timeout (30s)')), 30000));

		const result = (await Promise.race([aiPromise, timeoutPromise])) as { text: string };

		console.log('[ai-deduplicator] Raw AI Response from generateText:', result.text);

		const rawText = result.text;
		const jsonStartTag = '<json>';
		const jsonEndTag = '</json>';

		const startIndex = rawText.indexOf(jsonStartTag);
		const endIndex = rawText.indexOf(jsonEndTag);

		if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
			const jsonString = rawText.substring(startIndex + jsonStartTag.length, endIndex).trim();
			console.log('[ai-deduplicator] Extracted JSON string:', jsonString);
			try {
				const parsedJson = JSON.parse(jsonString);
				// Now validate with Zod schema
				const validatedData = DuplicateDetectionSchema.parse(parsedJson);
				console.log('[ai-deduplicator] Successfully parsed and validated JSON from AI response:', validatedData);

				console.log(`[ai-deduplicator] Duplicate analysis result:`, {
					isDuplicate: validatedData.isDuplicate,
					confidence: validatedData.confidence,
					suggestedAction: validatedData.suggestedAction,
					reasoning: validatedData.reasoning?.substring(0, 100) + '...',
				});

				return validatedData;
			} catch (parseOrValidationError: any) {
				console.error('[ai-deduplicator] Failed to parse or validate the extracted JSON string:', parseOrValidationError.message);
				if (parseOrValidationError instanceof z.ZodError) {
					console.error('[ai-deduplicator] Zod validation errors:', parseOrValidationError.errors);
				}
				console.error('[ai-deduplicator] Original string that failed parsing/validation:', jsonString);
				return null;
			}
		} else {
			console.error('[ai-deduplicator] Could not find <json>...</json> tags in AI response. Raw text logged above.');
			return null;
		}
	} catch (error: any) {
		console.error('[ai-deduplicator] Error in duplicate detection:', error.message);
		if (error instanceof z.ZodError) {
			console.error('[ai-deduplicator] Zod validation error:', error.errors);
		}
		if (error.cause) {
			console.error('[ai-deduplicator] Cause of error:', error.cause);
		}
		return null;
	}
}

// Function to find potential duplicates in existing applications
export async function findPotentialDuplicates(
	newApp: ApplicationForComparison,
	existingApps: ApplicationForComparison[],
	aiBinding: Ai,
	emailContext?: EmailToParse,
): Promise<Array<{ app: ApplicationForComparison; analysis: DuplicateDetectionResult }>> {
	const potentialDuplicates: Array<{ app: ApplicationForComparison; analysis: DuplicateDetectionResult }> = [];

	// First, do a quick filter based on company name similarity to reduce AI calls
	const candidateApps = existingApps.filter((app) => {
		// More robust string normalization to handle encoding issues
		const normalizeCompanyName = (name: string): string => {
			return name
				.toLowerCase()
				.trim()
				.replace(/\s+/g, ' ') // Normalize multiple spaces to single space
				.replace(/[^\w\s-]/g, '') // Remove special characters except hyphens and spaces
				.replace(/\s*-\s*/g, '-'); // Normalize hyphens (remove spaces around them)
		};

		const newCompany = normalizeCompanyName(newApp.company_name);
		const existingCompany = normalizeCompanyName(app.company_name);

		// Debug logging to understand why exact matches are failing
		console.log(`[ai-deduplicator] Comparing companies: "${newCompany}" vs "${existingCompany}"`);
		console.log(`[ai-deduplicator] Original names: "${newApp.company_name}" vs "${app.company_name}"`);

		// Check for obvious matches or partial matches
		// Be more aggressive for exact company matches
		if (newCompany === existingCompany) {
			console.log(`[ai-deduplicator] ✅ EXACT MATCH found: "${newCompany}" === "${existingCompany}"`);
			return true; // Always check exact company matches
		}

		// Failsafe: Check original names without normalization too
		if (newApp.company_name.toLowerCase().trim() === app.company_name.toLowerCase().trim()) {
			console.log(`[ai-deduplicator] ✅ EXACT MATCH (original): "${newApp.company_name}" === "${app.company_name}"`);
			return true;
		}

		// Check for partial matches (one contains the other)
		if (newCompany.includes(existingCompany) || existingCompany.includes(newCompany)) {
			console.log(`[ai-deduplicator] ✅ PARTIAL MATCH found: "${newCompany}" includes "${existingCompany}"`);
			return true;
		}

		// Additional check: If company names are similar, also check role similarity
		const maxLength = Math.max(newCompany.length, existingCompany.length);
		const companyThreshold = Math.min(maxLength * 0.4, 5);
		const companyDistance = levenshteinDistance(newCompany, existingCompany);

		if (companyDistance <= companyThreshold) {
			// Company names are similar, check if roles are also similar
			const newRole = newApp.role.toLowerCase().trim();
			const existingRole = app.role.toLowerCase().trim();
			const roleDistance = levenshteinDistance(newRole, existingRole);
			const roleThreshold = Math.min(Math.max(newRole.length, existingRole.length) * 0.5, 8);

			if (roleDistance <= roleThreshold) {
				console.log(
					`[ai-deduplicator] ✅ COMPANY+ROLE MATCH found: "${newCompany}" vs "${existingCompany}" (company distance: ${companyDistance}) + "${newRole}" vs "${existingRole}" (role distance: ${roleDistance})`,
				);
				return true;
			}
		}

		// Use Levenshtein distance for fuzzy matching (more lenient threshold)
		const distance = levenshteinDistance(newCompany, existingCompany);

		if (distance <= companyThreshold) {
			console.log(
				`[ai-deduplicator] ✅ FUZZY MATCH found: "${newCompany}" vs "${existingCompany}" (distance: ${distance}, threshold: ${companyThreshold})`,
			);
			return true;
		}

		console.log(
			`[ai-deduplicator] ❌ NO MATCH: "${newCompany}" vs "${existingCompany}" (distance: ${distance}, threshold: ${companyThreshold})`,
		);
		return false;
	});

	console.log(`[ai-deduplicator] Found ${candidateApps.length} candidate applications for duplicate analysis`);

	if (candidateApps.length > 0) {
		console.log(
			`[ai-deduplicator] Candidates:`,
			candidateApps.map((app) => `${app.company_name} - ${app.role} (${app.application_date})`),
		);
	} else {
		console.log(
			`[ai-deduplicator] No candidates found. Checked against:`,
			existingApps.map((app) => `${app.company_name} - ${app.role}`),
		);
		console.log(`[ai-deduplicator] New app: ${newApp.company_name} - ${newApp.role}`);
	}

	// Analyze each candidate with AI
	for (const candidate of candidateApps) {
		const analysis = await detectDuplicateApplication(candidate, newApp, aiBinding, emailContext);

		if (analysis && analysis.isDuplicate && analysis.confidence > 0.7) {
			potentialDuplicates.push({ app: candidate, analysis });
		}
	}

	// Sort by confidence (highest first)
	potentialDuplicates.sort((a, b) => b.analysis.confidence - a.analysis.confidence);

	return potentialDuplicates;
}

// Simple Levenshtein distance function for quick filtering
function levenshteinDistance(str1: string, str2: string): number {
	const matrix = Array(str2.length + 1)
		.fill(null)
		.map(() => Array(str1.length + 1).fill(null));

	for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
	for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

	for (let j = 1; j <= str2.length; j++) {
		for (let i = 1; i <= str1.length; i++) {
			const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
			matrix[j][i] = Math.min(
				matrix[j][i - 1] + 1, // deletion
				matrix[j - 1][i] + 1, // insertion
				matrix[j - 1][i - 1] + indicator, // substitution
			);
		}
	}

	return matrix[str2.length][str1.length];
}

// Function to merge application data based on AI analysis
export function mergeApplicationData(
	primaryApp: ApplicationForComparison,
	secondaryApp: ApplicationForComparison,
	mergeStrategy: DuplicateDetectionResult['mergeStrategy'],
): ApplicationForComparison {
	if (!mergeStrategy) return primaryApp;

	const merged = { ...primaryApp };

	// Update fields based on merge strategy
	for (const field of mergeStrategy.fieldsToUpdate) {
		const secondaryValue = (secondaryApp as any)[field];
		if (
			secondaryValue &&
			(!merged[field as keyof ApplicationForComparison] || merged[field as keyof ApplicationForComparison] === 'Unknown Role')
		) {
			(merged as any)[field] = secondaryValue;
		}
	}

	// Merge notes if both have content
	if (mergeStrategy.notesToAdd) {
		const existingNotes = merged.notes || '';
		const separator = existingNotes ? '\n\n' : '';
		merged.notes = existingNotes + separator + mergeStrategy.notesToAdd;
	}

	// Always use the more recent application date
	if (new Date(secondaryApp.application_date) > new Date(primaryApp.application_date)) {
		merged.application_date = secondaryApp.application_date;
	}

	return merged;
}
