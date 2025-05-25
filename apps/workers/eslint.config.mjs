import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
	{
		ignores: ['node_modules/**', '.wrangler/**', 'dist/**', 'build/**', 'worker-configuration.d.ts', 'test/**'],
	},
	js.configs.recommended,
	{
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.json',
			},
			globals: {
				...globals.webworker,
				...globals.es2021,
				// Additional Cloudflare Workers specific globals
				CryptoKey: 'readonly',
				ScheduledController: 'readonly',
				ExecutionContext: 'readonly',
				KVNamespace: 'readonly',
				Queue: 'readonly',
				Fetcher: 'readonly',
				Hyperdrive: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': typescriptEslint,
		},
		rules: {
			...typescriptEslint.configs.recommended.rules,
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/ban-ts-comment': 'warn',
			'no-console': 'off',
			'no-empty': 'warn',
		},
	},
];
