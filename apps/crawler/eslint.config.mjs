import base from '@bargah/config/eslint';

export default [
  ...base,
  {
    // Interactive CLI that prompts for phone / code / password.
    files: ['src/setup.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
