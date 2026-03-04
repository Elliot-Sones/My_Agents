import { getConfig } from "../config.js";

const BASE_URL = "https://api.perplexity.ai/chat/completions";

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  citations?: string[];
}

export interface PerplexityResult {
  answer: string;
  citations: string[];
}

export async function askPerplexity(
  query: string,
  model?: "sonar" | "sonar-pro",
): Promise<PerplexityResult> {
  const config = getConfig();
  const selectedModel = model ?? "sonar";

  try {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.perplexityApiKey || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: "user",
            content: query,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[perplexity] Request failed (${response.status}): ${text}`);
      return { answer: "", citations: [] };
    }

    const data = (await response.json()) as PerplexityResponse;
    const answer = data.choices?.[0]?.message?.content ?? "";
    const citations = data.citations ?? [];

    return { answer, citations };
  } catch (error) {
    console.error("[perplexity] Request error:", error);
    return { answer: "", citations: [] };
  }
}
