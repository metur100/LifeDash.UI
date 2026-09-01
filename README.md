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
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID for login, Drive, and Gmail | `your-client-id.apps.googleusercontent.com` |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser-restricted key for travel maps and Places | `AIza...` |
| `VITE_BASE` | Build-time sub-path, GitHub Pages project sites only | `/lifedash/` |

Vite inlines these at build time - rebuild after changing them.

For `VITE_GOOGLE_MAPS_API_KEY`, create a browser key restricted to the production
site origin and local development origin, then restrict its API access to Maps
JavaScript API and Places API. Do not use a server key in the frontend.

## Deploy to Cloudflare Pages

1. Cloudflare dashboard -> Workers & Pages -> Create -> Pages -> connect your repo.
2. Build command `npm run build`, output directory `dist`, root directory `frontend`.
3. Settings -> Environment variables -> add `VITE_API_URL` for Production and Preview.
4. Client-side routes are handled by Wrangler's SPA fallback (`assets.not_found_handling = "single-page-application"`).

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
