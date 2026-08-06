export type VieLanguage = "pl" | "en";

export function getRequestLanguage(request: Request): VieLanguage {
  return request.headers.get("x-vie-language")?.toLowerCase() === "en" ? "en" : "pl";
}

export function withResponseLanguage(request: Request, prompt: string): string {
  if (getRequestLanguage(request) !== "en") return prompt;
  return `${prompt}\n\nLANGUAGE REQUIREMENT: Respond entirely in natural English. Translate labels, headings, explanations, tool summaries and follow-up questions into English. Do not answer in Polish unless the user explicitly asks for Polish in the current message.`;
}
