"use client";

import { useEffect, useState, type ReactNode } from "react";

const translations: Record<string, string> = {
  "Zaloguj się": "Sign in", "Wyloguj": "Sign out", "Odśwież": "Refresh", "Odświeżam": "Refreshing",
  "Twój inteligentny copilot": "Your intelligent copilot", "Agent AI, który zna": "The AI agent that knows",
  "Twój biznes.": "Your business.", "Zacznij za darmo": "Start for free", "Zobacz, jak działa": "See how it works",
  "✓ Bez karty": "✓ No card required", "✓ Start w 30 sekund": "✓ Start in 30 seconds", "✓ Prywatna przestrzeń": "✓ Private workspace",
  "WIĘCEJ NIŻ CHATBOT": "MORE THAN A CHATBOT", "Twoja wiedza. Twój kontekst.": "Your knowledge. Your context.", "Twój agent.": "Your agent.",
  "Pamięta Twoje rozmowy": "Remembers your conversations", "Zna dokumenty Twojej firmy": "Knows your company documents",
  "Prywatne dane per user": "Private data for every user", "Pracuje 24/7": "Works 24/7",
  "Odpowiedzi oparte na faktach": "Answers grounded in facts", "GOTOWY NA WŁASNEGO AGENTA?": "READY FOR YOUR OWN AGENT?",
  "Zacznij w 30 sekund.": "Start in 30 seconds.", "Stwórz konto": "Create account",
  "Twój biznes. Twoja wiedza. Twój agent.": "Your business. Your knowledge. Your agent.",
  "Regulamin": "Terms", "Prywatność": "Privacy", "Cookies": "Cookies", "DOKUMENTY PRAWNE": "LEGAL DOCUMENTS",
  "Regulamin Vie AI": "Vie AI Terms of Service", "Polityka prywatności": "Privacy Policy", "Polityka plików cookies": "Cookie Policy",
  "Wróć do Vie AI": "Back to Vie AI", "Dashboard": "Dashboard", "Statystyki użycia": "Usage statistics",
  "Chat Vie": "Vie Chat", "Agent": "Agent", "Podróże": "Travel", "Myślenie": "Reasoning", "Słownik AI": "AI Dictionary",
  "Formater": "Formatter", "Szukaj": "Search", "Grafiki": "Images", "Raporty": "Reports", "Briefingi": "Briefings",
  "Bezpieczeństwo": "Security", "Konkurencja": "Competitors", "Oferta AI": "AI Proposal", "Historia": "History",
  "Baza wiedzy": "Knowledge Base", "Podgląd wiedzy": "Knowledge Preview", "Nowa rozmowa": "New conversation",
  "Jak mogę Ci pomóc?": "How can I help?", "Zadaj kolejne pytanie…": "Ask another question…",
  "Pamięć aktywna": "Memory active", "Źródło znalezione": "Source found", "Ładowanie danych": "Loading data",
  "Dzień dobry": "Good morning", "Dobrego popołudnia": "Good afternoon", "Dobry wieczór": "Good evening",
  "Mój Agent": "My Agent", "panel pracy": "workspace", "Pogoda": "Weather", "Waluty": "Currencies",
  "Najbliższe święta": "Upcoming holidays", "Szybkie akcje": "Quick actions", "Usuń": "Delete", "Anuluj": "Cancel",
  "Zapisz": "Save", "Wyślij": "Send", "Generuj": "Generate", "Kopiuj": "Copy", "Skopiowano": "Copied",
  "Wczytuję…": "Loading…", "Brak danych": "No data", "Błąd": "Error", "Spróbuj ponownie": "Try again",
  "Nawigacja strony głównej": "Main navigation", "Vie AI — strona główna": "Vie AI — home page", "Logo Vie AI Agent": "Vie AI Agent logo",
  "Vie łączy rozmowy, firmową wiedzę i automatyzacje w jednym bezpiecznym miejscu — żeby szybciej zamieniać pytania w decyzje.": "Vie brings conversations, company knowledge and automations together in one secure place — helping you turn questions into decisions faster.",
  "Podgląd interfejsu Vie AI": "Vie AI interface preview", "NOWA ROZMOWA": "NEW CONVERSATION",
  "Jaki jest aktualny cennik pakietu Premium?": "What is the current price of the Premium plan?",
  "Pakiet Premium kosztuje": "The Premium plan costs", "499 zł miesięcznie": "PLN 499 per month",
  ". Obejmuje pełną bazę wiedzy, automatyczne briefingi i nielimitowane rozmowy.": ". It includes the complete knowledge base, automated briefings and unlimited conversations.",
  "Źródło: Cennik_2026.pdf · strona 3": "Source: Pricing_2026.pdf · page 3",
  "12 rozmów w kontekście": "12 conversations in context", "Odpowiedź z Twoich danych": "Answer based on your data",
  "Wracaj do tematów bez powtarzania kontekstu. Vie porządkuje historię i kontynuuje tam, gdzie skończyliście.": "Return to any topic without repeating the context. Vie organizes the history and continues exactly where you left off.",
  "Cenniki, procedury i FAQ stają się prywatną bazą wiedzy, z której agent przygotowuje konkretne odpowiedzi.": "Price lists, procedures and FAQs become a private knowledge base that the agent uses to prepare precise answers.",
  "Każde konto ma oddzielne rozmowy, dokumenty i profil. Twoja wiedza zostaje przypisana wyłącznie do Ciebie.": "Every account has separate conversations, documents and a profile. Your knowledge remains assigned exclusively to you.",
  "Automatyczne briefingi i zadania cykliczne działają także wtedy, gdy nie masz otwartej aplikacji.": "Automated briefings and recurring tasks keep working even when the application is closed.",
  "Zapytaj o cennik.": "Ask about pricing.", "Vie odpowie z": "Vie will answer using", "Twoich dokumentów.": "your documents.",
  "Każda odpowiedź wskazuje źródło, więc wiesz nie tylko": "Every answer identifies its source, so you know not only",
  "co": "what", "mówi agent, ale także": "the agent says, but also", "skąd": "where", "to wie.": "the information comes from.",
  "Wyszukiwanie semantyczne w bazie wiedzy": "Semantic search across the knowledge base",
  "Cytowanie dokumentu i konkretnej strony": "Document and page-level citations",
  "Odpowiedzi w Twoim stylu i tonie marki": "Answers in your style and brand voice",
  "Zaindeksowano 2 min temu": "Indexed 2 minutes ago", "PAKIET PREMIUM": "PREMIUM PLAN", "499 zł / miesiąc": "PLN 499 / month",
  "Pełna baza wiedzy · Briefingi · Bez limitu": "Complete knowledge base · Briefings · Unlimited",
  "98% dopasowania": "98% match", "Fragment użyty w odpowiedzi agenta": "Passage used in the agent's answer",
  "Dodaj pierwsze dokumenty i porozmawiaj z agentem, który naprawdę zna Twój biznes.": "Add your first documents and talk to an agent that truly understands your business.",
  "Dokumenty prawne": "Legal documents",
  "Logowanie Supabase": "Supabase Auth", "E-mail": "Email", "Utwórz konto": "Create account",
  "Po zalogowaniu zobaczysz tylko swoje rozmowy, dokumenty i profil.": "After signing in, you will only see your own conversations, documents and profile.",
  "Hasło": "Password", "minimum 6 znaków": "at least 6 characters", "Pracuję...": "Working...",
  "Zarejestruj się": "Create account", "Nie masz konta? Zarejestruj się": "Don't have an account? Create one",
  "Masz konto? Zaloguj się": "Already have an account? Sign in", "Nie udało się zalogować.": "Sign-in failed.",
  "Konto utworzone. Sprawdź e-mail i potwierdź rejestrację, jeśli Supabase tego wymaga.": "Account created. Check your email and confirm registration if required by Supabase.",
  "np. jan@test.com": "e.g. john@test.com",
};

const originals = new WeakMap<Node, string>();

function translatePage(language: "pl" | "en") {
  document.documentElement.lang = language;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(parent.tagName)) continue;
    if (!originals.has(node)) originals.set(node, node.textContent ?? "");
    const original = originals.get(node) ?? "";
    if (language === "pl") { node.textContent = original; continue; }
    const trimmed = original.trim();
    const translated = translations[trimmed];
    if (translated) node.textContent = original.replace(trimmed, translated);
  }

  document.querySelectorAll<HTMLElement>("[placeholder],[aria-label],[title]").forEach((element) => {
    ["placeholder", "aria-label", "title"].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const key = `vieOriginal${attribute.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`;
      if (!element.dataset[key]) element.dataset[key] = value;
      const original = element.dataset[key] ?? value;
      element.setAttribute(attribute, language === "en" ? translations[original] ?? original : original);
    });
  });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<"pl" | "en">("pl");

  useEffect(() => {
    const saved = localStorage.getItem("vie-language") === "en" ? "en" : "pl";
    setLanguage(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("vie-language", language);
    translatePage(language);
    const observer = new MutationObserver(() => translatePage(language));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("/api/") && !url.startsWith(`${window.location.origin}/api/`)) return nativeFetch(input, init);
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("x-vie-language", language);
      return nativeFetch(input, { ...init, headers });
    };
    return () => { window.fetch = nativeFetch; };
  }, [language]);

  return <>
    {children}
    <button className="language-toggle" type="button" onClick={() => setLanguage((value) => value === "pl" ? "en" : "pl")} aria-label={language === "pl" ? "Switch to English" : "Przełącz na polski"}>
      {language === "pl" ? "EN" : "PL"}
    </button>
  </>;
}
