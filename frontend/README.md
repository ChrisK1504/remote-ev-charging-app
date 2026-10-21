# Charger frontend

React + TypeScript + Vite. Run with Node 22.13+ or Node 24.

```sh
npm install
npm run dev
npm run build
npm run lint
```

The API defaults to `http://localhost:3000`; override with `VITE_API_URL`.

## UI refresh — 2026-10-21

Added Tailwind CSS v4 through the Vite plugin and official shadcn/ui Button,
Input, Card, Badge, and Table source components. Components live in
`src/components/ui`, theme tokens in `src/index.css`, and page layouts in
`src/App.css`. `components.json` and the `@/` alias support adding components:

```sh
npx shadcn@latest add <component>
```

Login and charger monitoring now share a green theme, responsive layouts,
connection badges, network totals, and explicit empty/loading states. API
contracts, cookie authentication, two-second polling, and remote commands
are preserved. Command acceptance is separate from reported charging status.
Totals reflect the latest received snapshot; they can be stale after a polling
failure or charger disconnect.

Verification: production build and ESLint pass. A headless Chrome smoke check
with intercepted API fixtures verified login, meter readings, start and stop
URLs/payloads, disconnected controls, 390px layout without horizontal overflow,
empty state, and logout. Desktop and mobile screenshots were visually reviewed.
This does not verify a live backend or physical charger. No frontend test runner
is configured yet; the smoke script was temporary and is not regression coverage.
