import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import noUnencodedSqlParam from './eslint-rules/no-unencoded-sql-param.mjs';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/.turbo/**'],
  },
  {
    // Type-aware block, scoped to the packages that talk to the database.
    // Enabling the project service everywhere would slow the lint job down for
    // no benefit — this rule needs types, and only these two touch drizzle.
    files: ['apps/api/src/**/*.ts', 'apps/workers/src/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { forgemsg: { rules: { 'no-unencoded-sql-param': noUnencodedSqlParam } } },
    rules: {
      'forgemsg/no-unencoded-sql-param': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
