import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Scope: this config declares browser globals and React plugins, so it
    // applies to the app and to the tsx-run test files. The paths below are
    // outside that domain and were previously linted by accident:
    //   dist, dist-ssr   build output
    //   .agents          vendored external agent skills, gitignored
    //   .scratch         local scratch artifacts, gitignored
    //   brand-concepts   design exploration, not application code
    //   review           archived audit folder. Verified unreachable from
    //                    production: nothing in src/ or supabase/functions/
    //                    imports it, it is outside tsconfig's `include` (src
    //                    only) and outside Vite's graph, it does not appear in
    //                    dist/ or dist-ssr/, and `supabase functions deploy`
    //                    only reads supabase/functions/<slug>/, so its flat
    //                    .ts files cannot be deployed. Its *.test.ts files are
    //                    Deno tests (remote URL imports, Deno.test, their own
    //                    `deno-lint-ignore` directives) that ESLint cannot
    //                    resolve or correctly interpret.
    //                    NOTE: it holds divergent drafts of live functions
    //                    (create-checkout-session, stripe-webhook,
    //                    request-refund). Excluded from lint, but do not treat
    //                    it as dead: price-config.ts contains the Stripe
    //                    test/live key guard that was never shipped.
    ignores: [
      'dist',
      'dist-ssr',
      '.agents/**',
      '.scratch/**',
      'brand-concepts/**',
      'review/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)
