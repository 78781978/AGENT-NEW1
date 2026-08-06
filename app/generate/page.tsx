"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useState } from "react";

const samplePrompts = [
  "Minimalistyczne logo kawiarni w stylu japońskim",
  "Post na Instagram: kawa latte art, ciepłe światło, widok z góry",
  "Kreacja reklamowa: wyprzedaż letnia -50%, nowoczesny design",
  "Ikona aplikacji: robot AI, gradient fioletowo-niebieski, flat design",
  "Infografika: 5 kroków do produktywności, pastelowe kolory",
  "Zdjęcie produktowe: elegancki zegarek na ciemnym tle",
];

type GenerateImageResult = {
  image: string;
  text: string;
  model?: string;
  provider?: string;
};

export default function GeneratePage() {
  const [prompt, setPrompt] = useState(samplePrompts[0]);
  const [result, setResult] = useState<GenerateImageResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function generateImage(nextPrompt = prompt) {
    const trimmed = nextPrompt.trim();

    if (!trimmed || isLoading) {
      return;
    }

    setPrompt(trimmed);
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: trimmed,
          provider: "google",
        }),
      });

      const data = (await response.json()) as Partial<GenerateImageResult> & {
        error?: string;
      };

      if (!response.ok || !data.image) {
        throw new Error(data.error || "Nie udało się wygenerować obrazu.");
      }

      setResult({
        image: data.image,
        model: data.model,
        provider: data.provider,
        text: data.text || "Obraz został wygenerowany.",
      });
    } catch (caughtError) {
      setResult(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nieznany błąd podczas generowania obrazu.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function downloadImage() {
    if (!result?.image) {
      return;
    }

    const link = document.createElement("a");
    link.href = result.image;
    link.download = "ai-generated.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Generator grafik AI">
        <AppNav active="/generate" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 3 · Warsztat 2</p>
            <h1>🎨 Generator grafik AI</h1>
            <p className="subtitle">
              Opisz co chcesz - AI stworzy obraz w kilka sekund. Możesz robić
              logo, posty social media, grafiki reklamowe, ikony i mockupy.
            </p>
            <div className="sample-questions" aria-label="Przykładowe prompty">
              {samplePrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPrompt(item)}
                  disabled={isLoading}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="generator-grid">
          <form
            className="generator-panel"
            onSubmit={(event) => {
              event.preventDefault();
              void generateImage();
            }}
          >
            <label htmlFor="image-prompt">Opis obrazu</label>
            <div className="provider-switcher single" aria-label="Generator grafik">
              <div className="provider-option active">
                Google
                <small>Gemini API</small>
              </div>
            </div>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Opisz obraz który chcesz wygenerować..."
              rows={8}
            />
            <button type="submit" disabled={!prompt.trim() || isLoading}>
              🎨 Generuj
            </button>
          </form>

          <div className="generator-result" aria-live="polite">
            {isLoading && (
              <div className="image-loading">
                <div />
                <p>Generuję... (5-15 sekund)</p>
              </div>
            )}

            {!isLoading && error && (
              <div className="error-box">
                <p>{error}</p>
              </div>
            )}

            {!isLoading && !error && !result && (
              <div className="empty-state">
                <p>
                  Tutaj pojawi się wygenerowana grafika. Zacznij od jednego z
                  przykładów albo wpisz własny opis.
                </p>
              </div>
            )}

            {!isLoading && result && (
              <article className="image-card">
                <img src={result.image} alt="Wygenerowana grafika AI" />
                {(result.provider || result.model) && (
                  <span className="image-provider">
                    {result.provider || "Generator"} · {result.model || "model testowy"}
                  </span>
                )}
                <p>{result.text}</p>
                <div className="generate-actions">
                  <button type="button" onClick={downloadImage}>
                    💾 Pobierz
                  </button>
                  <button type="button" onClick={() => void generateImage()}>
                    🔄 Ponownie
                  </button>
                </div>
              </article>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}



