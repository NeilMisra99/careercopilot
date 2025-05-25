import type { Ai } from '@cloudflare/workers-types';
import { z } from 'zod';
import { createWorkersAI } from 'workers-ai-provider';
import { generateObject } from 'ai';

// Define Zod schema for a recipe
const RecipeResponseSchema = z.object({
	recipe: z.object({
		name: z.string().describe('The name of the pasta dish.'),
		ingredients: z
			.array(
				z.object({
					name: z.string().describe('Name of the ingredient.'),
					amount: z.string().describe("Amount of the ingredient (e.g., '1 cup', '200g')."),
				}),
			)
			.describe('An array of ingredients for the recipe.'),
		steps: z.array(z.string()).describe('An array of steps to prepare the dish.'),
	}),
});

type RecipeResponse = z.infer<typeof RecipeResponseSchema>;

// Original PoemResponseSchema - can be removed if no longer used, or kept for other tests
const PoemResponseSchema = z.object({
	poem: z.string().describe('The four-line poem about Cloudflare Workers.'),
	author: z.string().describe('The attributed author of the poem.'),
});
type PoemResponse = z.infer<typeof PoemResponseSchema>; // Keep or remove based on usage

// Remove PoemResponseJsonSchema as generateObject uses Zod schema directly
// const PoemResponseJsonSchema = { ... };

export async function runAiPoemTest(aiBinding: Ai): Promise<RecipeResponse | null> {
	// Renamed for clarity
	if (!aiBinding) {
		console.error('[ai-test] AI binding is not available.');
		return null;
	}

	const workersai = createWorkersAI({ binding: aiBinding as any });
	// Using the model specified by the user in their local changes
	const model = workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any);

	const userPromptContent = 'Generate a recipe for a delicious pasta dish.';

	console.log(`[ai-test] Sending prompt to model: "${userPromptContent}" using generateObject for a recipe`);

	try {
		const result = await generateObject({
			model: model, // Using the initialized model variable
			schema: RecipeResponseSchema,
			prompt: userPromptContent,
		});

		console.log('[ai-test] Raw AI Response from generateObject:', JSON.stringify(result, null, 2));

		if (result && result.object) {
			console.log('[ai-test] Parsed Recipe Response:', result.object);
			return result.object;
		} else {
			console.error('[ai-test] AI response did not contain the expected object. Full response logged above.');
			return null;
		}
	} catch (error: any) {
		console.error('[ai-test] Error running AI model with generateObject:', error.message, error.stack ? error.stack : '');
		if (error instanceof z.ZodError) {
			console.error('[ai-test] Zod validation error:', error.errors);
		}
		return null;
	}
}

// If you still need the poem test, it can be kept as a separate function
// export async function runAiPoemTest(aiBinding: Ai): Promise<PoemResponse | null> { ... }
