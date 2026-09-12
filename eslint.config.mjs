import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import noUnencodedSqlParam from './eslint-rules/no-unencoded-sql-param.mjs';
import requireOrgScope from './eslint-rules/require-org-scope.mjs';

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
    // Its own block rather than an addition to the one above, so the existing
    // rule keeps the exact file set it had. This one needs no type information
    // and deliberately skips tests: fixtures there span two tenants on purpose,
    // which is the thing under test rather than a mistake to report.
    files: ['apps/api/src/**/*.ts', 'apps/workers/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/integration/**', '**/test-support/**'],
    plugins: { forgemsgOrg: { rules: { 'require-org-scope': requireOrgScope } } },
    rules: {
      // 'warn' on purpose for this round: the rule is being measured, not
      // enforced. Nothing is fixed yet and the build must not go red on a
      // backlog nobody has triaged.
      'forgemsgOrg/require-org-scope': 'warn',
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
