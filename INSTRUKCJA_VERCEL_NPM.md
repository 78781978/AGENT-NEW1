# Vie AI — poprawne wdrożenie Vercel (npm)

Ta paczka jest kompletnym projektem i używa wyłącznie npm.

## GitHub

1. Usuń z repozytorium stare pliki `pnpm-lock.yaml` i `pnpm-workspace.yaml`.
2. Wgraj całą zawartość paczki `vie-ai-vercel-npm-final.zip` do głównego katalogu repozytorium.
3. Sprawdź, że `package.json`, `package-lock.json` i `vercel.json` znajdują się bezpośrednio w katalogu głównym.

## Vercel

- Framework Preset: `Next.js`
- Root Directory: pozostaw puste (`./`), jeśli pliki są w katalogu głównym repozytorium
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: pozostaw puste

Po usunięciu plików pnpm Vercel nie będzie próbował parsować `pnpm-lock.yaml`.
