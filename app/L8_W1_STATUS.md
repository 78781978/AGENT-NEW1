# Lekcja 8 - Warsztat 1: E-mail Triage

Status: wykonane

## Co dodano

- Strona `/email-triage`.
- Endpoint `/api/email-triage`.
- Analiza wielu maili wklejonych jako tekst.
- Kategoryzacja maili: zapytanie ofertowe, reklamacja, spam, informacja, prośba o spotkanie.
- Priorytety: wysoki, średni, niski, spam.
- Draft odpowiedzi dla każdego maila.
- Kolorowe karty wyników.
- Podsumowanie liczby maili według priorytetu.
- Przycisk kopiowania draftu.
- Link `E-mail Triage` w nawigacji.

## Test

- `npm run build` zakończony poprawnie.
- `/email-triage` zwraca status 200.
- `/api/email-triage` zwraca analizę testowego maila.

## Pliki zmienione

- `app/api/email-triage/route.ts`
- `app/email-triage/page.tsx`
- `components/AppNav.tsx`
- `app/globals.css`
