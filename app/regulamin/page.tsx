import Link from "next/link";

export const metadata = { title: "Regulamin | Vie AI" };

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <Link className="legal-back" href="/">← Wróć do Vie AI</Link>
        <p className="legal-eyebrow">DOKUMENTY PRAWNE</p>
        <h1>Regulamin Vie AI</h1>
        <p className="legal-updated">Obowiązuje od 6 sierpnia 2026 r.</p>
        <section><h2>1. Zakres usługi</h2><p>Vie AI udostępnia narzędzia oparte na sztucznej inteligencji, w tym rozmowy z agentem, analizę dokumentów, generowanie treści i automatyzacje. Korzystanie z serwisu oznacza akceptację niniejszego regulaminu.</p></section>
        <section><h2>2. Konto użytkownika</h2><p>Użytkownik odpowiada za poprawność podanych danych, ochronę danych logowania oraz działania wykonane na swoim koncie. Zabronione jest udostępnianie konta w sposób naruszający bezpieczeństwo serwisu.</p></section>
        <section><h2>3. Zasady korzystania</h2><p>Nie wolno używać Vie AI do działań niezgodnych z prawem, naruszania praw innych osób, rozpowszechniania złośliwego oprogramowania ani prób obchodzenia zabezpieczeń. Użytkownik musi posiadać prawa do przesyłanych treści i dokumentów.</p></section>
        <section><h2>4. Odpowiedzi AI</h2><p>Odpowiedzi mogą zawierać błędy i nie zastępują porady prawnej, medycznej, podatkowej ani finansowej. Przed podjęciem istotnej decyzji użytkownik powinien zweryfikować informacje w niezależnym, wiarygodnym źródle.</p></section>
        <section><h2>5. Dostępność i zmiany</h2><p>Usługa może być czasowo niedostępna z powodu aktualizacji, awarii lub prac technicznych. Funkcje i regulamin mogą być zmieniane; o istotnych zmianach użytkownicy zostaną poinformowani w serwisie.</p></section>
        <section><h2>6. Odpowiedzialność</h2><p>Operator nie odpowiada za szkody wynikające z wykorzystania niezweryfikowanej odpowiedzi AI, działania usług zewnętrznych ani treści przesłanych przez użytkownika, w zakresie dozwolonym przez obowiązujące prawo.</p></section>
        <section><h2>7. Rezygnacja</h2><p>Użytkownik może zaprzestać korzystania z usługi oraz zażądać usunięcia konta i danych. Obowiązki wynikające z przepisów prawa mogą wymagać zachowania części danych przez określony czas.</p></section>
        <section><h2>8. Kontakt</h2><p>Pytania dotyczące regulaminu można przekazać administratorowi Vie AI poprzez dane kontaktowe wskazane w serwisie lub panelu użytkownika.</p></section>
      </article>
    </main>
  );
}
