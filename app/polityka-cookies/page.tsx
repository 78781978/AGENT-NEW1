import Link from "next/link";

export const metadata = { title: "Polityka cookies | Vie AI" };

export default function CookiesPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <Link className="legal-back" href="/">← Wróć do Vie AI</Link>
        <p className="legal-eyebrow">DOKUMENTY PRAWNE</p>
        <h1>Polityka plików cookies</h1>
        <p className="legal-updated">Obowiązuje od 6 sierpnia 2026 r.</p>
        <section><h2>1. Czym są cookies</h2><p>Cookies to niewielkie informacje zapisywane w przeglądarce. Vie AI wykorzystuje również podobne mechanizmy pamięci lokalnej, które pomagają zachować ustawienia aplikacji.</p></section>
        <section><h2>2. Niezbędne mechanizmy</h2><p>Serwis używa niezbędnych danych sesyjnych do logowania, ochrony konta, utrzymania sesji i prawidłowego działania funkcji. Bez nich korzystanie z panelu użytkownika może być niemożliwe.</p></section>
        <section><h2>3. Ustawienia interfejsu</h2><p>W pamięci przeglądarki może być zapisany wybrany motyw jasny lub ciemny oraz inne ustawienia poprawiające wygodę korzystania z aplikacji.</p></section>
        <section><h2>4. Analityka i marketing</h2><p>Jeżeli w przyszłości zostaną włączone opcjonalne narzędzia analityczne lub marketingowe, będą uruchamiane zgodnie z wymaganiami prawa, po uzyskaniu zgody, gdy jest ona wymagana.</p></section>
        <section><h2>5. Zarządzanie cookies</h2><p>Cookies można usuwać i blokować w ustawieniach przeglądarki. Zablokowanie mechanizmów niezbędnych może spowodować wylogowanie lub brak dostępu do części funkcji.</p></section>
        <section><h2>6. Zmiany polityki</h2><p>Polityka może być aktualizowana wraz ze zmianą funkcji serwisu lub przepisów. Aktualna wersja jest zawsze publikowana na tej stronie.</p></section>
      </article>
    </main>
  );
}
