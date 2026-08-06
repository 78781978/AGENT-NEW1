export const washGoBusinessContext = {
  brandName: "Wash&Go",
  agentName: "Wash&Go Revenue Agent",
  location: "Goleniów i okolice",
  tone:
    "konkretnie, lokalnie, energicznie, profesjonalnie, bez przesadnego wciskania usług",
  openingHours: "poniedziałek-piątek, 8:00-18:00; sobota, 8:00-14:00",
  phone: "000 000 000",
  mainGoal:
    "maksymalizować liczbę rezerwacji i powracających klientów myjni ręcznej",
};

export const washGoServices = [
  {
    name: "Mycie zewnętrzne",
    duration: "45 minut",
    price: "60-120 zł",
    bestFor: "szybkie odświeżenie auta, brud po trasie, kurz, owady",
  },
  {
    name: "Sprzątanie wnętrza",
    duration: "60-90 minut",
    price: "100-180 zł",
    bestFor: "odkurzanie, plastiki, bagażnik, bieżące uporządkowanie auta",
  },
  {
    name: "Mycie kompleksowe",
    duration: "90 minut",
    price: "160-280 zł",
    bestFor: "auto po zimie, przed sprzedażą, przed wyjazdem, regularna pielęgnacja",
  },
  {
    name: "Pranie tapicerki",
    duration: "3-5 godzin",
    price: "250-600 zł",
    bestFor: "plamy, nieprzyjemny zapach, dzieci, zwierzęta, przygotowanie auta do sprzedaży",
  },
  {
    name: "Usuwanie sierści",
    duration: "30-90 minut",
    price: "50-180 zł jako dopłata",
    bestFor: "auta po psie lub kocie, fotele materiałowe, bagażnik",
  },
  {
    name: "Ozonowanie",
    duration: "30 minut",
    price: "70-120 zł",
    bestFor: "zapach wilgoci, klimatyzacja, auto po paleniu, odświeżenie wnętrza",
  },
  {
    name: "Woskowanie",
    duration: "60 minut",
    price: "120-250 zł",
    bestFor: "ochrona lakieru, połysk, auto po myciu kompleksowym",
  },
  {
    name: "Dekontaminacja lakieru",
    duration: "2-4 godziny",
    price: "250-500 zł",
    bestFor: "smoła, osady metaliczne, przygotowanie pod wosk lub powłokę",
  },
  {
    name: "Powłoka ceramiczna",
    duration: "1-2 dni",
    price: "od 1200 zł, wycena indywidualna",
    bestFor: "długotrwała ochrona lakieru, auta premium, nowe auta",
  },
];

export const washGoVehicleRules = [
  "Auto miejskie: standardowy czas i cena bazowa.",
  "Kombi: zwykle +10-15% czasu przy sprzątaniu wnętrza i praniu.",
  "SUV: zwykle +20-30% czasu przy myciu kompleksowym, praniu i sierści.",
  "Van/bus: wycena indywidualna, bo czas może być znacznie dłuższy.",
  "Silne zabrudzenia, błoto, sierść, piasek po wakacjach albo plamy po dzieciach wymagają oględzin lub zdjęć.",
];

export const washGoBusinessRules = [
  "SUV, van i duże auta wymagają dłuższego czasu usługi.",
  "Sierść po psie lub kocie wymaga dodatkowego czasu i może zwiększyć cenę.",
  "Nie obiecuj dokładnej ceny bez obejrzenia auta, jeśli zakres zabrudzeń jest nieznany.",
  "Podawaj cenę jako widełki albo orientacyjną wycenę, dopóki nie ma zdjęć lub oględzin auta.",
  "Reklamacje przekazuj człowiekowi. Agent może przeprosić i zebrać informacje, ale nie przyznaje zwrotów.",
  "Nie rezerwuj dwóch aut na ten sam termin.",
  "Rezerwacje przyjmuj tylko w godzinach pracy: poniedziałek-piątek 8:00-18:00 oraz sobota 8:00-14:00.",
  "Nie proponuj rezerwacji w niedzielę.",
  "Nie proponuj terminów dalej niż miesiąc do przodu.",
  "Powłoka ceramiczna wymaga dłuższej rezerwacji i wcześniejszej konsultacji.",
  "Agent nie może sam przyznać rabatu większego niż 10%.",
  "Posty do grup lokalnych muszą być dopasowane do regulaminu grupy i nie mogą wyglądać jak spam.",
  "Każda publikacja w social mediach wymaga akceptacji właściciela w MVP.",
  "Jeśli klient chce przygotować auto do sprzedaży, rekomenduj pakiet zwiększający efekt wizualny i zapachowy, ale wyjaśnij dlaczego.",
];

function formatBookingDate(date: Date) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function generateAvailableSlots() {
  const augustSlots = [
    ["2026-08-01", "08:00"],
    ["2026-08-03", "10:00"],
    ["2026-08-04", "12:00"],
    ["2026-08-05", "14:00"],
    ["2026-08-06", "16:00"],
    ["2026-08-07", "08:00"],
    ["2026-08-08", "10:00"],
    ["2026-08-10", "12:00"],
    ["2026-08-11", "14:00"],
    ["2026-08-12", "16:00"],
  ];

  return augustSlots.map(([date, hour]) => `${formatBookingDate(new Date(`${date}T12:00:00`))}, ${hour}`);
}

export const washGoMockData = {
  weather: "lekki deszcz, 14°C",
  bookingWindow: "rezerwacje do miesiąca do przodu",
  availableSlots: generateAvailableSlots(),
  seasonContext:
    "po deszczu klienci często odkładają mycie zewnętrzne, ale dobrze reagują na pranie tapicerki, ozonowanie i przygotowanie auta do sprzedaży",
  localGroups: [
    "Goleniów ogłoszenia lokalne",
    "Motoryzacja Goleniów i okolice",
    "Usługi Goleniów",
    "Kierowcy Zachodniopomorskie",
    "Goleniów kupię sprzedam usługi",
  ],
};

export function formatWashGoKnowledge() {
  const services = washGoServices
    .map(
      (service) =>
        `- ${service.name}: czas ${service.duration}, cena ${service.price}, najlepsze dla: ${service.bestFor}`,
    )
    .join("\n");

  const rules = washGoBusinessRules.map((rule) => `- ${rule}`).join("\n");
  const vehicleRules = washGoVehicleRules.map((rule) => `- ${rule}`).join("\n");
  const groups = washGoMockData.localGroups.map((group) => `- ${group}`).join("\n");
  const slots = washGoMockData.availableSlots.map((slot) => `- ${slot}`).join("\n");

  return `
## Dane firmy
- Nazwa: ${washGoBusinessContext.brandName}
- Lokalizacja: ${washGoBusinessContext.location}
- Godziny otwarcia: ${washGoBusinessContext.openingHours}
- Telefon testowy: ${washGoBusinessContext.phone}
- Ton marki: ${washGoBusinessContext.tone}
- Cel agenta: ${washGoBusinessContext.mainGoal}

## Usługi
${services}

## Reguły biznesowe
${rules}

## Reguły wielkości auta i dopłat
${vehicleRules}

## Mockowane dane operacyjne
- Pogoda: ${washGoMockData.weather}
- Kontekst sezonowy: ${washGoMockData.seasonContext}
- Wolne terminy:
${slots}

## Mockowane grupy lokalne
${groups}
`;
}
