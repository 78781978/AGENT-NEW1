import Link from "next/link";

export const metadata = { title: "Polityka prywatności | Vie AI" };

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <Link className="legal-back" href="/">← Wróć do Vie AI</Link>
        <p className="legal-eyebrow">DOKUMENTY PRAWNE</p>
        <h1>Polityka prywatności</h1>
        <p className="legal-updated">Obowiązuje od 6 sierpnia 2026 r.</p>
        <section><h2>1. Administrator danych</h2><p>Administratorem danych jest operator serwisu Vie AI. Aktualne dane identyfikacyjne i kontaktowe administratora są udostępniane w serwisie oraz panelu użytkownika.</p></section>
        <section><h2>2. Zakres danych</h2><p>Możemy przetwarzać adres e-mail, identyfikator konta, dane techniczne, historię aktywności, treść rozmów oraz dokumenty przesłane przez użytkownika. Nie należy przesyłać danych, które nie są potrzebne do realizacji zadania.</p></section>
        <section><h2>3. Cele i podstawy przetwarzania</h2><p>Dane są używane do utworzenia i obsługi konta, realizacji funkcji AI, zabezpieczenia usługi, rozliczeń, obsługi zgłoszeń i wypełnienia obowiązków prawnych. Podstawą jest wykonanie umowy, uzasadniony interes, obowiązek prawny lub zgoda — zależnie od celu.</p></section>
        <section><h2>4. Dostawcy</h2><p>W realizacji usługi mogą uczestniczyć dostawcy hostingu, bazy danych i uwierzytelniania (w tym Supabase), infrastruktury wdrożeniowej oraz modeli AI. Otrzymują wyłącznie dane konieczne do wykonania powierzonych zadań.</p></section>
        <section><h2>5. Przekazywanie danych</h2><p>Niektórzy dostawcy mogą przetwarzać dane poza Europejskim Obszarem Gospodarczym. W takim przypadku stosowane są wymagane prawem mechanizmy ochrony, w szczególności standardowe klauzule umowne.</p></section>
        <section><h2>6. Okres przechowywania</h2><p>Dane przechowujemy przez okres korzystania z konta, a następnie przez czas konieczny do obsługi roszczeń i obowiązków prawnych. Użytkownik może usuwać rozmowy i dokumenty, jeżeli dana funkcja jest dostępna.</p></section>
        <section><h2>7. Prawa użytkownika</h2><p>Użytkownik może żądać dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przeniesienia oraz wnieść sprzeciw. Może także wycofać zgodę i złożyć skargę do Prezesa UODO.</p></section>
        <section><h2>8. Bezpieczeństwo</h2><p>Stosujemy kontrolę dostępu, separację danych użytkowników i techniczne zabezpieczenia transmisji. Żaden system nie gwarantuje jednak całkowitego wyeliminowania ryzyka.</p></section>
      </article>
    </main>
  );
}
