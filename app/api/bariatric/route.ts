import { google } from "@ai-sdk/google";
import {
  assertDailyTokenBudget,
  estimateTextTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";
import { generateText, stepCountIs } from "ai";

export const maxDuration = 60;

type BariatricBody = {
  stage?: unknown;
  goal?: unknown;
  notes?: unknown;
};

type Intent =
  | "visit"
  | "diet-stage"
  | "hydration-protein"
  | "diary"
  | "red-flags"
  | "report"
  | "meal-idea"
  | "motivation"
  | "general";

const sourceNotes = `
Źródła bezpieczeństwa użyte w scenariuszu:
- Narodowe Centrum Edukacji Żywieniowej: zalecenia żywieniowe po operacji bariatrycznej, w tym etapy adaptacji, małe porcje, nawodnienie, odstęp między płynami a posiłkiem i odpowiednia ilość białka.
- leczotylosc.pl: rola konsultacji dietetycznej przed i po zabiegu, analiza wywiadu żywieniowego i chorobowego, praca nad nawykami oraz monitorowanie redukcji masy ciała.
- ASMBS: życie po operacji bariatrycznej i konieczność długoterminowej opieki specjalistycznej.
- NICE NG246/QS212: minimum 2 lata opieki pooperacyjnej w zespole bariatrycznym oraz późniejsza co najmniej coroczna kontrola w modelu opieki współdzielonej.
- Mayo Clinic: dieta po operacji zwykle przechodzi etapami od płynów do pokarmów papkowatych, miękkich i stałych; ważne jest powolne jedzenie, małe porcje i picie między posiłkami.
- BOMSS: po operacji potrzebna jest długoterminowa kontrola żywieniowa, monitorowanie niedoborów i współpraca z zespołem bariatrycznym.
`;

const knowledgeRules = `
Reguły wiedzy, które możesz stosować edukacyjnie:
- Etapy diety i tempo rozszerzania zależą od procedury, ośrodka i tolerancji pacjenta, więc nie wolno obiecywać konkretnego terminu przejścia do kolejnego etapu.
- Pierwsze tygodnie po operacji są okresem adaptacji i gojenia; pacjent powinien trzymać się zaleceń zespołu.
- Płyny zwykle przyjmuje się często i małymi łykami; powszechna zasada edukacyjna to oddzielanie płynów od posiłków, ale szczegóły ma ustalić prowadzący specjalista.
- Białko jest ważne dla regeneracji, ale indywidualny cel musi wynikać z zaleceń lekarza lub dietetyka.
- W wielu materiałach edukacyjnych po operacji pojawia się orientacyjny cel płynów około 1,5-1,9 l dziennie, czyli około 64 oz, jeśli lekarz nie zaleci inaczej. Nie traktuj tego jako indywidualnego zlecenia medycznego.
- W materiałach edukacyjnych często pojawia się białko jako priorytet po operacji, np. minimum około 60 g dziennie lub 60-100 g dziennie zależnie od programu i pacjenta. Indywidualny cel ustala specjalista.
- Dzienniczek powinien zapisywać: godzinę, płyny, posiłek, konsystencję, tolerancję, objawy, leki/suplementy zgodnie z zaleceniami, pytania na wizytę.
- Jeśli pacjent prosi o tabelę na cały dzień, rozpisz pełną tabelę od rana do wieczora, z kolumną sumy płynów narastająco i miejscem na białko. Nie dawaj urwanego przykładu z wielokropkiem.
- Po operacji ważna jest długoterminowa kontrola, badania i monitorowanie niedoborów; nie jest to jednorazowa opieka.
- Przy objawach alarmowych odpowiedź ma być krótka i kierować do pilnego kontaktu, bez długiej edukacji.
`;

const systemPrompt = `
Jesteś BariCare AI, edukacyjnym asystentem pacjenta przed i po operacji bariatrycznej.

Zawsze odpowiadasz po polsku, prosto i spokojnie.

Najważniejsza zasada:
- odpowiedź musi być dopasowana do konkretnego pytania użytkownika, etapu pacjenta i notatek.
- nie powtarzaj za każdym razem tej samej ogólnej checklisty.
- jeśli użytkownik pyta o pytania do lekarza, skup się na pytaniach.
- jeśli pyta o dzienniczek, zrób dzienniczek.
- jeśli pyta o nawodnienie lub białko, skup się na monitorowaniu i bezpiecznych zasadach.
- jeśli pyta o objawy, wyraźnie oddziel objawy alarmowe od obserwacji do omówienia na wizycie.
- jeśli pyta o raport, przygotuj gotowy tekst do dietetyka lub lekarza.
- jeśli pyta o przykładowy jadłospis lub posiłek, nie układaj terapii; podaj bezpieczny szablon do omówienia ze specjalistą, zależny od etapu.
- jeśli pyta emocjonalnie, wesprzyj spokojnie i zaproponuj mały następny krok.

Granice bezpieczeństwa:
- Nie jesteś lekarzem ani dietetykiem klinicznym.
- Nie diagnozujesz, nie leczysz, nie zmieniasz zaleceń lekarza i nie dobierasz leków ani suplementów.
- Nie podajesz indywidualnych dawek leków ani suplementów.
- Nie obiecujesz efektów leczenia.
- Przy niepokojących objawach kierujesz do lekarza, zespołu bariatrycznego albo pilnej pomocy medycznej.

Objawy alarmowe:
- narastający ból brzucha,
- uporczywe wymioty,
- objawy odwodnienia,
- gorączka,
- duszność,
- omdlenia,
- krwawienie,
- niemożność przyjmowania płynów,
- szybkie pogorszenie samopoczucia.

Format odpowiedzi:
# BariCare AI - odpowiedź dla pacjenta

## 1. Krótka odpowiedź
[odpowiedz konkretnie na pytanie użytkownika]

## 2. Co zrobić teraz
[3-6 praktycznych kroków dopasowanych do pytania]

## 3. Lista / tabela pomocnicza
[lista pytań, tabela dzienniczka, plan rozmowy albo checklista - wybierz tylko to, co pasuje]

## 4. Kiedy skontaktować się ze specjalistą
[krótko, bez straszenia]

## 5. Źródła
[wypisz krótko źródła: NCEŻ, leczotylosc.pl, ASMBS]
`;

function intentLabel(intent: Intent) {
  const labels: Record<Intent, string> = {
    visit: "przygotowanie do wizyty",
    "diet-stage": "etap diety",
    "hydration-protein": "nawodnienie i białko",
    diary: "dzienniczek pacjenta",
    "red-flags": "objawy alarmowe",
    report: "raport dla specjalisty",
    "meal-idea": "pomysł posiłków do omówienia",
    motivation: "wsparcie emocjonalne i organizacyjne",
    general: "ogólne wsparcie pacjenta",
  };

  return labels[intent];
}

function detectIntent(goal: string, notes: string): Intent {
  const text = `${goal} ${notes}`.toLowerCase();

  if (/(raport|podsumowanie|wiadomość|wiadomosc|wysłać|wyslac|dietetyka|lekarza)/.test(text)) {
    return "report";
  }

  if (/(dzienniczek|tabela|cały dzień|caly dzien|całodni|calodni|notować|notowac|monitor|zapisywać|zapisywac|płynów|plynow|posiłków|posilkow|objaw|tolerancj)/.test(text)) {
    return "diary";
  }

  if (/(nawodn|płyn|plyn|woda|białk|bialk|protein)/.test(text)) {
    return "hydration-protein";
  }

  if (/(alarm|pilnie|ból|bol|wymiot|gorącz|goracz|odwodn|duszno|omdlen|krwaw)/.test(text)) {
    return "red-flags";
  }

  if (/(etap|płynn|plynn|papkow|miękk|miekk|stał|stal|rozszerz)/.test(text)) {
    return "diet-stage";
  }

  if (/(jadłospis|jadlospis|menu|posiłek|posilek|śniadanie|sniadanie|obiad|kolacja|co jeść|co jesc|przykład jedzenia)/.test(text)) {
    return "meal-idea";
  }

  if (/(boję|boje|stres|panik|motyw|nie daję|nie daje|trudno|załam|zalam|wsparcie|emocj)/.test(text)) {
    return "motivation";
  }

  if (/(wizy|konsult|pytan|chirurg|dietetyk|przygotowa)/.test(text)) {
    return "visit";
  }

  return "general";
}

function introForStage(stage: string) {
  const normalized = stage.toLowerCase();

  if (normalized.includes("przed")) {
    return "Jesteś na etapie przygotowania do zabiegu. Najważniejsze jest zebranie informacji, uporządkowanie pytań i omówienie zaleceń z zespołem prowadzącym.";
  }

  if (normalized.includes("płyn") || normalized.includes("plyn")) {
    return "Jesteś na bardzo wczesnym etapie pooperacyjnym. Priorytetem jest bezpieczeństwo, tolerancja płynów i szybki kontakt ze specjalistą przy objawach alarmowych.";
  }

  if (normalized.includes("papkow")) {
    return "Jesteś na etapie papkowatym. Ważne jest spokojne rozszerzanie diety zgodnie z zaleceniami, obserwacja tolerancji i unikanie pośpiechu.";
  }

  if (normalized.includes("miękk") || normalized.includes("miekk")) {
    return "Jesteś na etapie miękkich produktów. Warto obserwować tolerancję konsystencji, tempo jedzenia i reakcję organizmu po posiłkach.";
  }

  if (normalized.includes("stał") || normalized.includes("stal")) {
    return "Wracasz do stałych posiłków. Kluczowe jest jedzenie małych porcji, uważna obserwacja tolerancji i regularne kontrole.";
  }

  return "Jesteś na etapie długoterminowej opieki po operacji. Najważniejsze są regularne kontrole, monitorowanie nawyków, nawodnienia, białka i samopoczucia.";
}

function intentContent(intent: Intent, stage: string, goal: string, notes: string) {
  if (intent === "visit") {
    return [
      "## 2. Co zrobić teraz",
      "- Spisz aktualny etap, masę ciała, leki, suplementy i choroby współistniejące.",
      "- Zanotuj, co jesz i pijesz przez 1-2 dni przed wizytą.",
      "- Wypisz objawy po jedzeniu: nudności, ból, zgaga, wymioty, nietolerancje, osłabienie.",
      "- Zaznacz, czego najbardziej się obawiasz i czego nie rozumiesz w zaleceniach.",
      "- Zabierz wyniki badań i zalecenia po poprzednich konsultacjach.",
      "",
      "## 3. Pytania na wizytę",
      "1. Jaki jest mój aktualny etap diety i kiedy mogę przejść dalej?",
      "2. Jak mam rozpoznać, że produkt albo konsystencja mi nie służy?",
      "3. Jak monitorować nawodnienie w mojej sytuacji?",
      "4. Jak mam kontrolować ilość białka bez przekraczania zaleceń?",
      "5. Jakie objawy są alarmowe, a jakie mogę obserwować do kolejnej wizyty?",
      "6. Jak często powinnam/powinienem mieć kontrolę dietetyczną?",
      "7. Co zrobić, jeśli mam trudność z jedzeniem, piciem albo regularnością posiłków?",
    ].join("\n");
  }

  if (intent === "diary") {
    return [
      "## 2. Co zrobić teraz",
      "- Potraktuj tabelę jako edukacyjny wzór do omówienia z dietetykiem lub zespołem bariatrycznym.",
      "- Jeśli nie masz indywidualnego limitu płynów, przyjmij roboczy cel kontroli: około 1500-1900 ml płynów dziennie, małymi łykami. Dokładny cel potwierdź ze specjalistą.",
      "- Płyny zapisuj oddzielnie od posiłków. W wielu zaleceniach edukacyjnych pojawia się zasada około 30 minut przerwy przed i po posiłku.",
      "- Białko wpisuj zgodnie z zaleceniem specjalisty. W materiałach edukacyjnych często pojawia się minimum około 60 g/dobę albo 60-100 g/dobę zależnie od pacjenta i programu.",
      "- Jeśli pojawią się objawy alarmowe, nie czekaj do kolejnej wizyty.",
      "",
      "## 3. Dzienniczek na cały dzień",
      "| Godzina | Płyny - małymi łykami | Suma płynów | Posiłek / etap / konsystencja | Białko - do wpisania | Objawy i tolerancja |",
      "|---|---:|---:|---|---|---|",
      "| 07:00 | 100 ml wody niegazowanej | 100 ml | - | - | samopoczucie po przebudzeniu |",
      "| 08:00 | 100 ml lekkiej herbaty lub wody | 200 ml | posiłek zgodny z etapem, np. płynny/papkowaty/miękki według zaleceń | wpisz produkt białkowy lub zalecony preparat | tolerancja po posiłku |",
      "| 09:30 | 150 ml wody | 350 ml | - | - | czy występują nudności, ból, zgaga |",
      "| 10:30 | 100 ml płynu bez cukru | 450 ml | mała porcja zgodna z etapem | wpisz białko, jeśli było | tolerancja |",
      "| 12:00 | 150 ml wody | 600 ml | - | - | energia, pragnienie, suchość w ustach |",
      "| 13:00 | 100 ml płynu między posiłkami | 700 ml | mała porcja obiadowa zgodna z etapem | wpisz białko, jeśli było | objawy po posiłku |",
      "| 14:30 | 150 ml wody | 850 ml | - | - | tolerancja płynów |",
      "| 15:30 | 100 ml płynu bez cukru | 950 ml | mała porcja zgodna z etapem | wpisz białko, jeśli było | tolerancja |",
      "| 17:00 | 150 ml wody | 1100 ml | - | - | samopoczucie |",
      "| 18:00 | 100 ml płynu między posiłkami | 1200 ml | mała kolacja zgodna z etapem | wpisz białko, jeśli było | objawy po posiłku |",
      "| 19:30 | 150 ml wody lub lekkiego naparu | 1350 ml | - | - | tolerancja płynów |",
      "| 21:00 | 150 ml wody | 1500 ml | - | podsumuj białko z dnia | czy cel płynów był realny |",
      "| 22:00 opcjonalnie | 100-200 ml, jeśli specjalista pozwala i dobrze tolerujesz | 1600-1700 ml | - | - | tylko jeśli nie powoduje dyskomfortu |",
      "",
      "## 3a. Podsumowanie dnia do pokazania dietetykowi",
      "| Obszar | Wynik dnia | Pytanie do specjalisty |",
      "|---|---|---|",
      "| Płyny | wpisz sumę: np. 1500 ml / 1700 ml / 1900 ml | czy mój cel płynów jest właściwy? |",
      "| Białko | wpisz ilość według etykiet lub zaleceń | czy realizuję swój indywidualny cel? |",
      "| Tolerancja | wpisz produkty tolerowane i nietolerowane | co mogę bezpiecznie zmienić? |",
      "| Objawy | wpisz nudności, ból, wymioty, zgagę, osłabienie | czy wymaga to kontroli? |",
    ].join("\n");
  }

  if (intent === "hydration-protein") {
    return [
      "## 2. Co zrobić teraz",
      "- Sprawdź, czy masz indywidualny cel płynów i białka od lekarza lub dietetyka.",
      "- Zapisuj płyny małymi porcjami w ciągu dnia, zamiast próbować nadrobić wszystko naraz.",
      "- Przy białku zapisuj produkt, porcję i tolerancję, ale nie zmieniaj zaleceń bez konsultacji.",
      "- Obserwuj objawy odwodnienia: osłabienie, zawroty głowy, bardzo mało moczu, suchość w ustach.",
      "",
      "## 3. Prosty licznik do kontroli",
      "| Obszar | Co sprawdzić | Co pokazać specjaliście |",
      "|---|---|---|",
      "| Nawodnienie | ile i jak często piję | czy mam trudność z przyjmowaniem płynów |",
      "| Białko | jakie produkty toleruję | czy realizuję zalecenia od dietetyka |",
      "| Objawy | nudności, wymioty, ból, zgaga | kiedy się pojawiają i po czym |",
    ].join("\n");
  }

  if (intent === "red-flags") {
    return [
      "## 2. Co zrobić teraz",
      "- Jeśli objawy są silne, narastają albo uniemożliwiają picie, skontaktuj się pilnie z lekarzem lub pomocą medyczną.",
      "- Nie próbuj samodzielnie dobierać leków ani suplementów.",
      "- Zapisz godzinę wystąpienia objawu, jego nasilenie i co było wcześniej jedzone lub pite.",
      "",
      "## 3. Objawy wymagające pilnego kontaktu",
      "| Objaw | Dlaczego ważny | Co zrobić |",
      "|---|---|---|",
      "| Narastający ból brzucha | może wymagać pilnej oceny | kontakt z lekarzem / pilna pomoc |",
      "| Uporczywe wymioty | ryzyko odwodnienia i powikłań | pilny kontakt ze specjalistą |",
      "| Niemożność picia | wysokie ryzyko odwodnienia | nie czekać do kolejnej wizyty |",
      "| Gorączka, duszność, omdlenie, krwawienie | objawy alarmowe | pilna pomoc medyczna |",
    ].join("\n");
  }

  if (intent === "report") {
    return [
      "## 2. Co zrobić teraz",
      "- Uzupełnij raport o konkretne ilości płynów, posiłki i objawy.",
      "- Wyślij go dietetykowi albo pokaż na wizycie.",
      "- Nie traktuj raportu jako zaleceń. To materiał do rozmowy ze specjalistą.",
      "",
      "## 3. Gotowy raport dla specjalisty",
      `Dzień dobry, jestem na etapie: ${stage}.`,
      `Mój główny cel/pytanie: ${goal}.`,
      `Moje notatki: ${notes || "nie mam jeszcze szczegółowych notatek"}.`,
      "Proszę o ocenę, czy mój sposób jedzenia i picia jest odpowiedni na tym etapie, co powinnam/powinienem poprawić oraz jakie objawy powinny wymagać szybkiego kontaktu.",
    ].join("\n");
  }

  if (intent === "meal-idea") {
    return [
      "## 2. Co zrobić teraz",
      "- Najpierw sprawdź, jaki etap diety zalecił Twój zespół bariatryczny.",
      "- Nie przechodź do twardszej konsystencji tylko dlatego, że czujesz się lepiej.",
      "- Każdy nowy produkt testuj ostrożnie i zapisuj tolerancję.",
      "- Jeśli masz ból, wymioty albo nie możesz pić, nie testuj nowych produktów i skontaktuj się ze specjalistą.",
      "",
      "## 3. Bezpieczny szablon posiłków do omówienia",
      "| Etap | Pomysł organizacyjny | Co koniecznie potwierdzić |",
      "|---|---|---|",
      "| Płynny | małe porcje płynów zgodnych z zaleceniami | rodzaj płynów, ilość i odstępy |",
      "| Papkowaty | gładka konsystencja bez grudek | produkty dozwolone przez dietetyka |",
      "| Miękki | miękkie produkty jedzone bardzo wolno | wielkość porcji i tolerancja |",
      "| Stałe posiłki | małe porcje, dokładne gryzienie, obserwacja objawów | kiedy rozszerzać dietę dalej |",
      "",
      "To nie jest indywidualny jadłospis medyczny. To rama rozmowy z dietetykiem, żeby łatwiej ustalić bezpieczny plan.",
    ].join("\n");
  }

  if (intent === "motivation") {
    return [
      "## 2. Co zrobić teraz",
      "- Zatrzymaj się na jednym najbliższym kroku, zamiast próbować ogarnąć cały proces naraz.",
      "- Zapisz jedno pytanie do specjalisty i jedną rzecz, która dziś sprawia największą trudność.",
      "- Jeżeli problem dotyczy objawów fizycznych, traktuj ciało priorytetowo i skontaktuj się z zespołem prowadzącym.",
      "- Jeżeli problem dotyczy stresu, poproś bliską osobę albo specjalistę o wsparcie w przygotowaniu do wizyty.",
      "",
      "## 3. Mini-plan na dziś",
      "| Krok | Co zrobić | Efekt |",
      "|---|---|---|",
      "| 1 | zapisz aktualne objawy albo obawy | łatwiej opowiedzieć o nich na wizycie |",
      "| 2 | przygotuj 3 pytania do specjalisty | rozmowa będzie spokojniejsza |",
      "| 3 | zanotuj płyny i posiłki | dietetyk dostanie konkretne dane |",
    ].join("\n");
  }

  if (intent === "diet-stage") {
    return [
      "## 2. Co zrobić teraz",
      "- Trzymaj się etapu diety zaleconego przez zespół prowadzący.",
      "- Nie przechodź szybciej do kolejnej konsystencji tylko dlatego, że czujesz się lepiej.",
      "- Obserwuj tolerancję: ból, nudności, uczucie zalegania, wymioty, zgaga.",
      "- Zapisz produkty, które przechodzą dobrze i te, które powodują objawy.",
      "",
      "## 3. Checklista przejścia między etapami",
      "| Pytanie | Tak/Nie | Uwagi |",
      "|---|---|---|",
      "| Czy specjalista pozwolił przejść dalej? |  |  |",
      "| Czy toleruję aktualną konsystencję? |  |  |",
      "| Czy mogę pić bez nudności i wymiotów? |  |  |",
      "| Czy wiem, jakie produkty są dozwolone na kolejnym etapie? |  |  |",
    ].join("\n");
  }

  return [
    "## 2. Co zrobić teraz",
    "- Doprecyzuj, czy chodzi o wizytę, dzienniczek, etap diety, nawodnienie, białko czy objawy.",
    "- Zapisz swoje pytania i objawy w prostych punktach.",
    "- Omów decyzje medyczne z lekarzem lub dietetykiem prowadzącym.",
    "",
    "## 3. Szybka karta pacjenta",
    "| Informacja | Co wpisać |",
    "|---|---|",
    "| Etap | przed operacją / etap pooperacyjny |",
    "| Cel | pytania / dzienniczek / raport / objawy |",
    "| Największa trudność | np. picie, jedzenie, objawy, organizacja dnia |",
  ].join("\n");
}

function localBariatricPlan(stage: string, goal: string, notes: string) {
  const intent = detectIntent(goal, notes);
  const stageIntro = introForStage(stage);
  const content = intentContent(intent, stage, goal, notes);

  return [
    "# BariCare AI - odpowiedź dla pacjenta",
    "",
    "## 1. Krótka odpowiedź",
    `${stageIntro} Rozpoznałam typ sprawy: ${intentLabel(intent)}. Dlatego odpowiedź skupia się na Twoim konkretnym pytaniu: ${goal}.`,
    "",
    content,
    "",
    "## 4. Kiedy skontaktować się ze specjalistą",
    "Pilnie skontaktuj się z lekarzem, zespołem bariatrycznym albo pomocą medyczną, jeśli pojawi się narastający ból brzucha, uporczywe wymioty, gorączka, duszność, omdlenia, krwawienie, objawy odwodnienia, niemożność przyjmowania płynów albo szybkie pogorszenie samopoczucia.",
    "",
    "## 5. Źródła",
    "- Narodowe Centrum Edukacji Żywieniowej: zalecenia żywieniowe po operacji bariatrycznej.",
    "- leczotylosc.pl: konsultacja dietetyczna i opieka nad pacjentem z otyłością.",
    "- ASMBS: ogólne informacje o życiu po operacji bariatrycznej.",
    "- NICE NG246/QS212: opieka pooperacyjna i długoterminowe monitorowanie po zabiegu.",
    "- Mayo Clinic: staged diet after bariatric surgery, hydration, small portions and gradual progression.",
    "- BOMSS: monitorowanie żywieniowe i niedoborów po operacji bariatrycznej.",
  ].join("\n");
}

function isTooGeneric(text: string, intent: Intent) {
  const lower = text.toLowerCase();
  const intentSignals: Record<Intent, string[]> = {
    visit: ["pytania", "wizy"],
    "diet-stage": ["etap", "konsystenc"],
    "hydration-protein": ["nawod", "białk", "bialk", "płyn", "plyn"],
    diary: ["dzienniczek", "godzina", "toleranc"],
    "red-flags": ["pilnie", "alarm", "wymiot", "ból", "bol"],
    report: ["raport", "dzień dobry", "specjalist"],
    "meal-idea": ["posił", "posil", "konsystenc", "jadłospis", "jesc", "jeść"],
    motivation: ["krok", "spokoj", "wspar"],
    general: ["bari", "pacjent"],
  };

  const signals = intentSignals[intent] ?? [];
  const hasSignal = signals.some((signal) => lower.includes(signal));
  const hasRequiredStructure = lower.includes("## 1.") && lower.includes("## 2.");

  return text.length < 700 || !hasSignal || !hasRequiredStructure;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const body = (await request.json().catch(() => null)) as BariatricBody | null;
  const stage = typeof body?.stage === "string" ? body.stage.trim() : "";
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const intent = detectIntent(goal, notes);

  if (!stage || !goal) {
    return Response.json(
      { error: "Wybierz etap pacjenta i wpisz cel wsparcia." },
      { status: 400 },
    );
  }

  if (
    intent === "diary" &&
    /tabela|cały dzień|caly dzien|całodni|calodni|wody|płyn|plyn/.test(`${goal} ${notes}`.toLowerCase())
  ) {
    return new Response(localBariatricPlan(stage, goal, notes), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  try {
    const tokenBudget = await assertDailyTokenBudget(user);

    if (!tokenBudget.ok) {
      return new Response(tokenBudget.message, {
        status: 429,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: withResponseLanguage(request, `${systemPrompt}\n\n${sourceNotes}\n\n${knowledgeRules}`),
      prompt: [
        `Etap pacjenta: ${stage}`,
        `Cel wsparcia: ${goal}`,
        `Notatki/dzienniczek pacjenta: ${notes || "brak"}`,
        `Rozpoznany typ zadania: ${intent} (${intentLabel(intent)})`,
        `Wzór logiczny dla tego typu zadania:\n${intentContent(intent, stage, goal, notes)}`,
        "",
        "Przygotuj odpowiedź dopasowaną do tego konkretnego typu zadania. Nie kopiuj ogólnego szablonu. Jeżeli używasz wzoru logicznego, rozwiń go naturalnie, ale nie zmieniaj go w wykład medyczny.",
      ].join("\n"),
      stopWhen: stepCountIs(6),
    });

    await logApiUsage({
      userId: user.id,
      usage: result.usage,
      inputEstimate: estimateTextTokens(JSON.stringify({ stage, goal, notes, intent })),
      model: "gemini-3.1-flash-lite",
      endpoint: "/api/bariatric",
    });

    const answer = result.text?.trim() || "";
    const finalAnswer = isTooGeneric(answer, intent) ? localBariatricPlan(stage, goal, notes) : answer;

    return new Response(finalAnswer, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  } catch {
    return new Response(localBariatricPlan(stage, goal, notes), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
}
