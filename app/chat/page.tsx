"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { clearSession } from "../../lib/auth-client";

type ChatMode = "casual" | "expert" | "creative";
type ModelChoice = "flash" | "pro";
type StoredMessage = { id: string; role: "user" | "assistant"; content: string };

const modes: Array<{
  id: ChatMode;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "casual",
    label: "Casual",
    icon: "💬",
    description: "krótko, prosto i po ludzku",
  },
  {
    id: "expert",
    label: "Ekspert",
    icon: "🎓",
    description: "analitycznie, formalnie i z rekomendacją",
  },
  {
    id: "creative",
    label: "Kreatywny",
    icon: "🎨",
    description: "nieszablonowo, z analogiami i inspiracją",
  },
];

const models: Array<{
  id: ModelChoice;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "flash",
    label: "Flash",
    icon: "⚡",
    description: "szybki model do codziennych pytań",
  },
  {
    id: "pro",
    label: "Pro",
    icon: "🧠",
    description: "zaawansowany model do złożonych analiz",
  },
];

const sampleQuestions = [
  "Jak zaplanować pierwszą automatyzację AI dla małego sklepu WooCommerce?",
  "Jakie dane mogę bezpiecznie wysyłać do AI, a jakich nie powinnam?",
  "Jak zbudować prostego chatbota do obsługi pytań klientów?",
  "Porównaj n8n, Make i Zapier dla początkującej osoby.",
];

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function splitSourceLine(text: string) {
  const lines = text.split("\n");
  const sourceIndex = lines.findIndex((line) =>
    /^📎\s*Źródł[oa]:/i.test(line.trim()),
  );

  if (sourceIndex === -1) {
    return { body: text, source: "" };
  }

  return {
    body: lines.filter((_, index) => index !== sourceIndex).join("\n").trim(),
    source: lines[sourceIndex].trim().replace(/^📎\s*/, ""),
  };
}

function estimateTokens(messages: UIMessage[]) {
  const characters = messages.reduce(
    (sum, message) => sum + messageText(message).length,
    0,
  );
  return Math.ceil(characters / 4);
}

function buildConversationMemory(messages: StoredMessage[]) {
  return messages
    .slice(-10)
    .map((message) => {
      const author = message.role === "user" ? "Wioletta" : "Vie";
      return `${author}: ${message.content}`.slice(0, 700);
    })
    .join("\n");
}

function buildConversationMemoryFromUi(messages: UIMessage[]) {
  return buildConversationMemory(
    messages.map((message) => ({
      id: message.id,
      role: message.role as "user" | "assistant",
      content: messageText(message),
    })),
  );
}

function isAuthTokenError(message: string) {
  return /jwt issued at future|jwt|token|sesja|zaloguj|pgrst303/i.test(message);
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Serwer zwrócił niepełną odpowiedź. Odśwież stronę i spróbuj ponownie.");
  }
}

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("casual");
  const [model, setModel] = useState<ModelChoice>("flash");
  const [assistantModes, setAssistantModes] = useState<Record<string, ChatMode>>(
    {},
  );
  const [assistantModels, setAssistantModels] = useState<
    Record<string, ModelChoice>
  >({});
  const [lastPrompt, setLastPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [persistenceError, setPersistenceError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [preferences, setPreferences] = useState<Record<string, string>>({});
  const [lastConversationMemory, setLastConversationMemory] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const lastConversationMemoryRef = useRef("");
  const pendingModeRef = useRef<ChatMode>("casual");
  const pendingModelRef = useRef<ModelChoice>("flash");

  function handleAuthTokenError(message: string) {
    if (!isAuthTokenError(message)) {
      return false;
    }

    clearSession();
    setPersistenceError(
      "Sesja logowania była nieaktualna albo zegar komputera jest przesunięty. Wyczyściłam sesję - zaloguj się ponownie.",
    );
    window.setTimeout(() => router.replace("/login"), 1200);
    return true;
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest({ messages, body }) {
          const visibleMemory = buildConversationMemoryFromUi(messages);
          const requestBody = body as
            | { userProfile?: { name?: string | null; preferences?: Record<string, string> } }
            | undefined;

          return {
            body: {
              ...body,
              messages,
              mode,
              model,
              userProfile: requestBody?.userProfile || { name: userName || null, preferences },
              longTermMemory: visibleMemory || lastConversationMemory,
            },
          };
        },
      }),
    [mode, model, userName, preferences, lastConversationMemory],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    error,
    clearError,
  } = useChat({
    transport,
    onFinish({ message }) {
      const responseMode = pendingModeRef.current;
      const responseModel = pendingModelRef.current;
      setAssistantModes((current) => ({
        ...current,
        [message.id]: responseMode,
      }));
      setAssistantModels((current) => ({
        ...current,
        [message.id]: responseModel,
      }));
      const activeConversationId = conversationIdRef.current;
      const content = messageText(message);
      if (activeConversationId && content) void saveMessage(activeConversationId, "assistant", content);
    },
  });

  const activeMode = modes.find((item) => item.id === mode) ?? modes[0];
  const activeModel = models.find((item) => item.id === model) ?? models[0];
  const isLoading = status === "submitted" || status === "streaming";
  const tokenCount = estimateTokens(messages);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      const savedMemory = localStorage.getItem("vie_last_conversation_memory") ?? "";
      setLastConversationMemory(savedMemory);
      lastConversationMemoryRef.current = savedMemory;
    } catch {
      setLastConversationMemory("");
      lastConversationMemoryRef.current = "";
    }
  }, []);

  useEffect(() => {
    if (!messages.length) return;
    const memory = buildConversationMemoryFromUi(messages);
    setLastConversationMemory(memory);
    lastConversationMemoryRef.current = memory;
    try {
      localStorage.setItem("vie_last_conversation_memory", memory);
    } catch {
      // Lokalna pamięć jest dodatkiem. Jeśli przeglądarka ją zablokuje, czat nadal działa.
    }
  }, [messages]);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const selectedConversation = new URLSearchParams(window.location.search).get("conversationId");
        const response = await fetch(selectedConversation ? `/api/conversations?id=${encodeURIComponent(selectedConversation)}` : "/api/conversations");
        const data = await readJsonResponse(response);
        if (!response.ok) throw new Error(data.error || "Nie udało się wczytać historii.");
        if (!active) return;
        if (data.conversation) {
          const loadedMessages = data.messages as StoredMessage[];
          const memory = buildConversationMemory(loadedMessages);
          setConversationId(data.conversation.id);
          conversationIdRef.current = data.conversation.id;
          setLastConversationMemory(memory);
          lastConversationMemoryRef.current = memory;
          try {
            localStorage.setItem("vie_last_conversation_memory", memory);
          } catch {}
          setMessages(loadedMessages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: [{ type: "text" as const, text: message.content }],
          })));
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Błąd historii.";
        if (active && !handleAuthTokenError(message)) setPersistenceError(message);
      } finally {
        if (active) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => { active = false; };
  }, [setMessages]);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        let response = await fetch("/api/profile", { cache: "no-store" });
        let data = await readJsonResponse(response);
        if (!response.ok) throw new Error(data.error || "Nie udało się pobrać profilu.");
        if (!data.profile) {
          response = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          data = await readJsonResponse(response);
          if (!response.ok) throw new Error(data.error || "Nie udało się utworzyć profilu.");
        }
        if (active) {
          setUserName(data.profile.name || "");
          setPreferences(data.profile.preferences || {});
        }
    } catch (profileError) {
      const message = profileError instanceof Error ? profileError.message : "";
      if (!handleAuthTokenError(message)) {
        console.warn("Profil nie został wczytany, ale czat działa dalej.", profileError);
      }
      } finally {
        if (active) setProfileLoading(false);
      }
    }
    void loadProfile();
    return () => { active = false; };
  }, []);

  async function updateProfile(update: { name?: string; preference?: { key: string; value: string } }) {
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Nie udało się zapisać profilu.");
      setUserName(data.profile.name || "");
      setPreferences(data.profile.preferences || {});
      return data.profile as { name?: string | null; preferences?: Record<string, string> };
    } catch (profileError) {
      const message = profileError instanceof Error ? profileError.message : "";
      if (!handleAuthTokenError(message)) {
        console.warn("Profil nie został zapisany, ale wiadomość zostanie wysłana.", profileError);
      }
      return null;
    }
  }

  function profileDetails(text: string) {
    const nameMatch = text.match(/(?:mam na imi[eę]|nazywam si[eę]|jestem)\s+([a-ząćęłńóśźż-]+)/i);
    const singleName = !userName && /^[a-ząćęłńóśźż-]{2,30}$/i.test(text.trim()) ? text.trim() : "";
    const preferenceMatch = text.match(/lubi[eę]\s+(.{2,80})/i);
    const cityMatch = text.match(/mieszkam w\s+([a-ząćęłńóśźż -]{2,50})/i);
    return {
      name: nameMatch?.[1] || singleName || undefined,
      preference: cityMatch
        ? { key: "miasto", value: cityMatch[1].trim() }
        : preferenceMatch
          ? { key: "lubię", value: preferenceMatch[1].trim() }
          : undefined,
    };
  }

  async function createConversation(title = "Nowa rozmowa") {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.slice(0, 50) }),
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Nie udało się utworzyć rozmowy.");
    setConversationId(data.conversation.id);
    conversationIdRef.current = data.conversation.id;
    return data.conversation.id as string;
  }

  async function saveMessage(id: string, role: "user" | "assistant", content: string) {
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, role, content }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Nie udało się zapisać wiadomości.");
      setPersistenceError("");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Błąd zapisu historii.";
      if (!handleAuthTokenError(message)) setPersistenceError(message);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    setInput("");
    setLastPrompt(trimmed);
    pendingModeRef.current = mode;
    pendingModelRef.current = model;
    setPersistenceError("");

    try {
      const details = profileDetails(trimmed);
      let profileForMessage = {
        name: userName || null,
        preferences,
      };

      if (details.name || details.preference) {
        const savedProfile = await updateProfile(details);
        profileForMessage = {
          name: savedProfile?.name || details.name || userName || null,
          preferences: savedProfile?.preferences || preferences,
        };
      }

      const activeConversationId = conversationId ?? (await createConversation(trimmed));
      await saveMessage(activeConversationId, "user", trimmed);
      await sendMessage(
        { text: trimmed },
        {
          body: {
            mode,
            model,
            userProfile: profileForMessage,
          },
        },
      );
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : "Nie udało się wysłać wiadomości.";
      if (!handleAuthTokenError(message)) setPersistenceError(message);
      setInput(trimmed);
    }
  }

  async function retryLastPrompt() {
    const trimmed = lastPrompt.trim();

    if (!trimmed || isLoading) {
      return;
    }

    clearError();
    pendingModeRef.current = mode;
    pendingModelRef.current = model;

    try {
      await sendMessage(
        { text: trimmed },
        {
          body: {
            mode,
            model,
          },
        },
      );
    } catch {
      setInput(trimmed);
    }
  }

  function friendlyErrorMessage(message?: string) {
    if (!message || message === "An error occurred.") {
      return "Wystąpił chwilowy błąd połączenia z modelem AI. Kliknij „Spróbuj ponownie” albo wyślij wiadomość jeszcze raz.";
    }

    if (message.toLowerCase().includes("quota")) {
      return "Model AI zgłasza limit lub problem z rozliczeniem API. Sprawdź limit klucza albo użyj tańszego modelu Flash.";
    }

    if (message.toLowerCase().includes("api key")) {
      return "Aplikacja nie widzi poprawnego klucza API. Sprawdź plik .env.local i uruchom serwer ponownie.";
    }

    return message;
  }

  async function exportConversation() {
    const content = messages
      .map((message) => {
        const author = message.role === "user" ? "Użytkownik" : "Agent";
        return `${author}: ${messageText(message)}`;
      })
      .join("\n\n");

    await navigator.clipboard.writeText(content || "Rozmowa jest pusta.");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function startNewConversation() {
    clearError();
    const memory = messages.length
      ? buildConversationMemoryFromUi(messages)
      : lastConversationMemoryRef.current;
    setMessages([]);
    setAssistantModes({});
    setAssistantModels({});
    setCopied(false);
    setPersistenceError("");
    setLastConversationMemory(memory);
    lastConversationMemoryRef.current = memory;
    try {
      localStorage.setItem("vie_last_conversation_memory", memory);
    } catch {}
    try {
      await createConversation();
    } catch (newConversationError) {
      const message =
        newConversationError instanceof Error
          ? newConversationError.message
          : "Nie udało się utworzyć rozmowy.";
      if (!handleAuthTokenError(message)) setPersistenceError(message);
    }
  }

  function useSampleQuestion(question: string) {
    setInput(question);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card" aria-label="Vie Agent AI">
        <AppNav active="/chat" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Warsztaty 1-4</p>
            <h1>🤖 Vie — ekspertka automatyzacji AI</h1>
            <p className="subtitle">
              Ekspert od automatyzacji AI, e-commerce, WordPress i WooCommerce.
              Zapytaj mnie o chatboty, procesy, API, n8n, Make i bezpieczne
              wdrożenia.
            </p>
            <div className="sample-questions" aria-label="Przykładowe pytania">
              {sampleQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => useSampleQuestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
          <div className="header-pills">
            <div className={`mode-pill ${mode}`}>
              {activeMode.icon} {activeMode.label}
            </div>
            <div className={`model-pill ${model}`}>
              {activeModel.icon} {activeModel.label}
            </div>
          </div>
        </header>

        <section className="memory-panel" aria-label="Kontekst rozmowy">
          <button
            className="memory-toggle"
            type="button"
            onClick={() => setContextOpen((value) => !value)}
          >
            Kontekst rozmowy
            <span>{contextOpen ? "Ukryj" : "Pokaż"}</span>
          </button>

          {contextOpen && (
            <div className="memory-content">
              <p>
                Wiadomości: <strong>{messages.length}</strong> | ~Tokeny:{" "}
                <strong>{tokenCount}</strong>
              </p>
              <div className="memory-actions">
                <button type="button" onClick={startNewConversation}>
                  🗑 Nowa rozmowa
                </button>
                <button type="button" onClick={exportConversation}>
                  📋 Eksportuj rozmowę
                </button>
                {copied && <span className="copied">Skopiowano!</span>}
              </div>
            </div>
          )}
        </section>

        <section className="messages" aria-live="polite">
          {!profileLoading && (
            <div className="empty-state" role="status">
              <p>{userName ? `Cześć, ${userName}! Miło Cię znowu widzieć.` : "Cześć! Jestem Vie. Nie znamy się jeszcze — jak masz na imię?"}</p>
            </div>
          )}
          {historyLoading && <div className="empty-state" role="status"><p>Wczytuję ostatnią rozmowę...</p></div>}
          {!historyLoading && messages.length === 0 && (
            <div className="empty-state">
              <p>
                Cześć, jestem Vie. Zapytaj mnie o automatyzacje AI,
                WooCommerce, chatboty albo plan wdrożenia dla małej firmy.
              </p>
            </div>
          )}

          {messages.map((message) => {
            const { body, source } = splitSourceLine(messageText(message));

            return (
            <article
              className={`message ${message.role}`}
              key={message.id}
              aria-label={message.role === "user" ? "Użytkownik" : "Agent AI"}
            >
              {message.role === "assistant" &&
                (() => {
                  const messageMode = assistantModes[message.id] ?? mode;
                  const messageModeData =
                    modes.find((item) => item.id === messageMode) ?? modes[0];
                  const messageModel = assistantModels[message.id] ?? model;
                  const messageModelData =
                    models.find((item) => item.id === messageModel) ??
                    models[0];
                  return (
                    <div className="badge-row">
                      <span className={`badge ${messageMode}`}>
                        {messageModeData.icon} {messageMode}
                      </span>
                      <span className={`model-badge ${messageModel}`}>
                        {messageModelData.icon} {messageModel}
                      </span>
                    </div>
                  );
                })()}
              <div className="bubble">{body}</div>
              {source ? <div className="message-source">{source}</div> : null}
            </article>
            );
          })}

          {isLoading && (
            <article className="message assistant">
              <span className={`badge ${mode}`}>
                {activeMode.icon} {mode}
              </span>
              <div className="bubble thinking">Myślę...</div>
            </article>
          )}

          <div ref={bottomRef} />
        </section>

        {error && (
          <div className="error-box">
            <p>{friendlyErrorMessage(error.message)}</p>
            <div className="error-actions">
              {lastPrompt && (
                <button type="button" onClick={retryLastPrompt}>
                  Spróbuj ponownie
                </button>
              )}
              <button type="button" onClick={clearError}>
                Zamknij
              </button>
            </div>
          </div>
        )}

        {persistenceError && <div className="error-box"><p>Historia rozmowy: {persistenceError}</p></div>}

        <section className="mode-switcher" aria-label="Tryb rozmowy">
          {modes.map((item) => (
            <button
              className={item.id === mode ? "active" : ""}
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              title={item.description}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </section>

        <section className="model-switcher" aria-label="Model AI">
          {models.map((item) => (
            <button
              className={item.id === model ? "active" : ""}
              key={item.id}
              type="button"
              onClick={() => setModel(item.id)}
              title={item.description}
            >
              <span>{item.icon}</span>
              {item.label}
              <small>{item.description}</small>
            </button>
          ))}
        </section>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Wiadomość do agenta"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Napisz wiadomość..."
            value={input}
          />
          {isLoading ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={isLoading || !input.trim()}>
              Wyślij
            </button>
          )}
        </form>
      </section>
    </main>
  );
}





