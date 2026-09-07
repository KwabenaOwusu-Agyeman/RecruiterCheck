# MyRecruiterCheck

Think like a recruiter before you apply.

MyRecruiterCheck analyses a candidate's CV against a job description and returns
a recruiter style score with feedback. Working on this repository as an agent?
Read `CLAUDE.md` first; it is binding, not advisory.

## Stack

- React 18, TypeScript and Vite, SPA with SSR prerender
- Tailwind CSS and React Router
- Supabase for auth, Postgres, Storage and Edge Functions
- Stripe for payments
- Vercel for hosting

## What is in here

- `src/` the MyRecruiterCheck web application
- `admin/` the Control Centre, a separate Next.js application with its own
  `package.json`, build and Vercel project
- `supabase/` migrations and Edge Functions
- `recruitercheck-extension/` the browser extension
- `CLAUDE.md`, `COCKPIT.md`, `memory/` engineering rules, current status and
  durable lessons

## Development

```bash
npm install
npm run dev
```

The Control Centre runs separately:

```bash
cd admin && npm install && npm run dev
```

## Build

```bash
npm run build
```

## Checks

`npm run checks` reads the diff and names the checks a change actually needs.

## Project structure

```
src/
  components/     Shared UI components
  features/       Feature-specific modules
  pages/          Route-level page components
  layouts/        Page layout wrappers
  hooks/          Reusable React hooks
  services/       API and external service clients
  types/          Shared TypeScript types
  utils/          Utility functions
  lib/            App constants and configuration
```
