import Link from "next/link";
import { washGoServices } from "../../lib/washgo-data";

const heroStats = [
  { value: "24h", label: "szybka odpowiedź na zapytania" },
  { value: "30", label: "dni do przodu w kalendarzu demo" },
  { value: "10%", label: "maksymalny rabat agenta w MVP" },
];

const processSteps = [
  "Opisujesz auto i cel wizyty",
  "Agent dobiera usługę i termin",
  "Właściciel akceptuje propozycję",
  "Klient dostaje potwierdzenie",
];

const reviews = [
  {
    name: "Anna",
    text: "Auto po praniu tapicerki wyglądało i pachniało jak nowe. Konkretna obsługa i szybki termin.",
  },
  {
    name: "Marek",
    text: "Przygotowali samochód do sprzedaży. Zdjęcia wyszły dużo lepiej, a wnętrze było bez porównania.",
  },
  {
    name: "Kasia",
    text: "Duży plus za podejście do auta po psie. Sierść z bagażnika w końcu zniknęła.",
  },
];

export default function WashSitePage() {
  return (
    <main className="wash-site">
      <nav className="wash-site-nav" aria-label="Nawigacja strony myjni">
        <Link href="/wash-site" className="brand-link">
          <img src="/images/washgo-logo.png" alt="Wash&Go" />
          <span>Wash&Go</span>
        </Link>
        <div>
          <a href="#uslugi">Usługi</a>
          <a href="#cennik">Cennik</a>
          <a href="#kontakt">Kontakt</a>
          <Link href="/fewshot">Słownik AI</Link>
          <Link href="/format">Formater</Link>
          <Link href="/generate">Grafiki</Link>
          <Link className="nav-cta" href="/wash-booking">
            Zapytaj agenta
          </Link>
        </div>
      </nav>

      <section className="wash-hero">
        <div className="wash-hero-copy">
          <p className="eyebrow">Ręczna pielęgnacja samochodów · Goleniów</p>
          <h1>Myjnia, detailing i pranie tapicerki bez zgadywania</h1>
          <p>
            Wash&Go pomaga szybko dobrać usługę do auta, zabrudzeń i celu:
            sprzedaż, odświeżenie po zimie, sierść po zwierzętach albo pełne
            przygotowanie wnętrza.
          </p>
          <div className="wash-actions">
            <Link href="/wash-booking" className="primary-action">
              Uruchom agenta rezerwacji
            </Link>
            <a href="#cennik" className="secondary-action">
              Zobacz orientacyjne ceny
            </a>
          </div>
          <div className="wash-stats">
            {heroStats.map((stat) => (
              <article key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="wash-hero-visual" aria-label="Logo Wash&Go">
          <img src="/images/washgo-logo.png" alt="Logo Wash&Go" />
        </div>
      </section>

      <section className="wash-band" id="uslugi">
        <div className="section-heading">
          <p className="eyebrow">Oferta</p>
          <h2>Usługi dopasowane do stanu auta</h2>
          <p>
            Ceny są orientacyjne. Dokładna wycena zależy od wielkości auta,
            poziomu zabrudzenia, sierści, plam i zakresu pracy.
          </p>
        </div>

        <div className="wash-service-grid">
          {washGoServices.map((service) => (
            <article key={service.name}>
              <h3>{service.name}</h3>
              <p>{service.bestFor}</p>
              <div>
                <span>{service.duration}</span>
                <strong>{service.price}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="wash-split">
        <div>
          <p className="eyebrow">AI demo</p>
          <h2>Strona połączona z agentem obsługi klienta</h2>
          <p>
            To testowa strona WWW dla pracy domowej. Klient może opisać auto,
            a agent dobierze usługę, poda orientacyjny czas, widełki ceny i
            zaproponuje wolny termin.
          </p>
          <Link href="/wash-booking" className="primary-action">
            Przetestuj obsługę klienta
          </Link>
        </div>

        <div className="process-list">
          {processSteps.map((step, index) => (
            <article key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wash-band compact" id="cennik">
        <div className="section-heading">
          <p className="eyebrow">Cennik demo</p>
          <h2>Najczęstsze scenariusze</h2>
        </div>

        <div className="pricing-rows">
          <article>
            <span>Auto po zimie</span>
            <strong>mycie kompleksowe + ozonowanie</strong>
            <p>około 2 godziny · od 230 zł</p>
          </article>
          <article>
            <span>Auto do sprzedaży</span>
            <strong>wnętrze + tapicerka + wosk</strong>
            <p>4-6 godzin · od 490 zł</p>
          </article>
          <article>
            <span>Sierść po zwierzętach</span>
            <strong>sprzątanie + usuwanie sierści</strong>
            <p>2-3 godziny · od 180 zł</p>
          </article>
        </div>
      </section>

      <section className="wash-band compact">
        <div className="section-heading">
          <p className="eyebrow">Opinie testowe</p>
          <h2>Co klienci cenią najbardziej</h2>
        </div>
        <div className="review-grid">
          {reviews.map((review) => (
            <article key={review.name}>
              <p>“{review.text}”</p>
              <strong>{review.name}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="wash-contact" id="kontakt">
        <div>
          <p className="eyebrow">Kontakt</p>
          <h2>Umów auto bez długiego pisania</h2>
          <p>
            W wersji produkcyjnej ten formularz może łączyć się z kalendarzem,
            SMS, WhatsAppem, Google Business Profile i n8n.
          </p>
        </div>
        <Link href="/wash-booking" className="primary-action">
          Opisz auto agentowi
        </Link>
      </section>
    </main>
  );
}
