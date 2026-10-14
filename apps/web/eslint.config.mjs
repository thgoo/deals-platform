import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import perfectionist from 'eslint-plugin-perfectionist';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintPluginPrettierRecommended,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    // Formatting is Prettier's job (.prettierrc.json); ESLint only keeps the
    // import order, which Prettier doesn't handle. Mixing @stylistic formatting
    // rules with Prettier made `eslint --fix` loop on conflicting fixes.
    plugins: {
      perfectionist,
    },
    rules: {
      // Flags useAlerts / usePriceHistory, which set state in effects on purpose
      // (localStorage read on mount, reset on key change). Kept visible as a
      // warning; worth revisiting with SWR (already a dependency) later.
      'react-hooks/set-state-in-effect': 'warn',
      'perfectionist/sort-imports': [
        'error',
        {
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
        },
      ],
    },
  },
]);

export default eslintConfig;
