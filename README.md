# theLastVikingClan

Private eFootball Mobile clan management & competition platform (VIK Clan).

- **App:** `app/` — React + TypeScript + Vite PWA + Supabase
- **Spec:** `PROJECT_SPECIFICATION.md`

## Develop

```bash
cd app
cp .env.example .env   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev     # http://127.0.0.1:5173
npm test        # vitest
npm run build
```

## Deploy (Netlify)

- Base directory: `app`
- Build command: `npm run build`
- Publish directory: `dist`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
