// Root ESLint flat config. Prettier owns formatting; ESLint owns correctness.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'raw/**',
      '**/coverage/**',
      '**/routeTree.gen.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TanStack Router file routes export `Route` next to their component by design.
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true, allowExportNames: ['Route'] },
      ],
      // `throw redirect(...)` / `throw notFound()` is the router's documented control flow.
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            {
              from: 'package',
              package: '@tanstack/react-router',
              name: ['Redirect', 'NotFoundError'],
            },
            {
              from: 'package',
              package: '@tanstack/router-core',
              name: ['Redirect', 'NotFoundError'],
            },
          ],
        },
      ],
    },
  },
  {
    // The Vercel function lives outside apps/web/src and has its own Node-typed tsconfig.
    files: ['apps/web/api/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: 'apps/web/tsconfig.api.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Config files aren't part of any tsconfig project; lint them without type info.
    files: ['*.{js,mjs,ts}', '**/*.config.{js,mjs,ts}'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
