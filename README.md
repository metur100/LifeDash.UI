# Life Dashboard - Frontend

React 18 + TypeScript + Vite. No UI framework - a single hand-written design
system lives in `src/styles/app.css`.

## Run locally

    npm install
    cp .env.example .env      # set VITE_API_URL to your backend
    npm run dev               # http://localhost:5173

## Build

    npm run build             # output in dist/
    npm run preview

## Environment variables

| Variable | Purpose | Example |
|---|---|---|
| `VITE_API_URL` | Backend base URL, no trailing slash | `https://api.example.com` |
| `VITE_BASE` | Build-time sub-path, GitHub Pages project sites only | `/lifedash/` |

Vite inlines these at build time - rebuild after changing them.

## Deploy to Cloudflare Pages

1. Cloudflare dashboard -> Workers & Pages -> Create -> Pages -> connect your repo.
2. Build command `npm run build`, output directory `dist`, root directory `frontend`.
3. Settings -> Environment variables -> add `VITE_API_URL` for Production and Preview.
4. `public/_redirects` is already included, so client-side routes resolve correctly.

## Deploy to GitHub Pages

1. Repo -> Settings -> Pages -> Source: GitHub Actions.
2. Repo -> Settings -> Secrets and variables -> Actions -> Variables -> add `VITE_API_URL`.
3. Push to `main`. `.github/workflows/deploy-pages.yml` builds and publishes.

For a project site the app is served from `/<repo>/`; the workflow sets `VITE_BASE`
automatically and copies `index.html` to `404.html` so deep links work.

Whichever host you pick, add its origin to `Cors:AllowedOrigins` in the backend
`appsettings.json`, otherwise the browser blocks every request.

## Structure

    src/
      api/         client.ts (fetch wrapper, JWT, errors) + types.ts (mirrors the C# DTOs)
      components/  AuthContext, Layout, Horizon (the timeline), AlertRow, Ui primitives
      lib/         format.ts (dates, currency, countdown), useAsync.ts
      pages/       Dashboard, Family, Authorities, Finance, HomeItems, Travel, Documents, Tasks
      styles/      app.css - all design tokens are at the top of the file
