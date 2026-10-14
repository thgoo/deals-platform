// Shared ESLint config for the Bun apps (api, ai, crawler, messaging).
// Usage in an app's eslint.config.mjs:
//   export { default } from '@bargah/config/eslint';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        Bun: false,
      },
    },
    plugins: {
      '@stylistic': stylistic,
      perfectionist,
    },
    rules: {
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/linebreak-style': ['error', 'unix'],
      '@stylistic/max-len': ['error', { code: 120 }],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
      '@stylistic/no-trailing-spaces': ['error'],
      '@stylistic/quote-props': ['error', 'consistent-as-needed'],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/semi': ['error', 'always'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-undef': ['error'],
      'no-console': ['warn'],
      'perfectionist/sort-imports': ['error', {
        groups: [
          ['builtin', 'external'],
          ['parent-type', 'sibling-type', 'internal-type', 'index-type'],
          'internal',
          'object',
          'unknown',
          ['parent', 'sibling', 'index'],
          'style',
        ],
        newlinesBetween: 'never',
        environment: 'bun',
      }],
    },
    settings: {
      perfectionist: {
        type: 'natural',
      },
    },
  },
  {
    // The logger implementations are the one place allowed to write to the console.
    files: ['**/logger/console-logger.ts', '**/middleware/request-logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
