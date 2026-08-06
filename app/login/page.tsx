"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "../../lib/auth-client";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "register") {
        const session = await signUp(email.trim(), password);
        if (!session.access_token) {
          setMessage("Konto utworzone. Sprawdź e-mail i potwierdź rejestrację, jeśli Supabase tego wymaga.");
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }

      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => undefined);

      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.replace(next.startsWith("/") ? next : "/");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Nie udało się zalogować.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div>
          <p className="eyebrow">Logowanie Supabase</p>
          <h1>{mode === "login" ? "Zaloguj się" : "Utwórz konto"}</h1>
          <p className="subtitle">
            Po zalogowaniu zobaczysz tylko swoje rozmowy, dokumenty i profil.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>E-mail</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="np. jan@test.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            <span>Hasło</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="minimum 6 znaków"
              required
              type="password"
              value={password}
            />
          </label>

          {error ? <div className="error-box">{error}</div> : null}
          {message ? <div className="success-box">{message}</div> : null}

          <button type="submit" disabled={loading}>
            {loading
              ? "Pracuję..."
              : mode === "login"
                ? "Zaloguj się"
                : "Zarejestruj się"}
          </button>
        </form>

        <button
          className="login-toggle"
          type="button"
          onClick={() => {
            setMode((current) => (current === "login" ? "register" : "login"));
            setError("");
            setMessage("");
          }}
        >
          {mode === "login"
            ? "Nie masz konta? Zarejestruj się"
            : "Masz konto? Zaloguj się"}
        </button>
      </section>
    </main>
  );
}
