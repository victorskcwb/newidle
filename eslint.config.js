import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tools/**', '**/*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/client/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // The engine is pure and deterministic: no randomness, clocks, I/O or platform globals.
    files: ['packages/engine/src/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Engine time comes from ticks, never from the clock.' },
        { name: 'performance', message: 'Engine time comes from ticks, never from the clock.' },
        { name: 'setTimeout', message: 'The engine has no timers.' },
        { name: 'setInterval', message: 'The engine has no timers.' },
        { name: 'window', message: 'The engine must not touch the DOM.' },
        { name: 'document', message: 'The engine must not touch the DOM.' },
        { name: 'process', message: 'The engine must not touch Node APIs.' },
        { name: 'fetch', message: 'The engine has no I/O.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the engine RNG (rng.ts).' },
        {
          object: 'Math',
          property: 'pow',
          message: 'Not guaranteed identical across engines; use integer math.',
        },
        { object: 'Math', property: 'exp', message: 'Not guaranteed identical across engines.' },
        { object: 'Math', property: 'log', message: 'Not guaranteed identical across engines.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'crypto'], message: 'The engine is pure logic.' },
          ],
        },
      ],
    },
  },
);
