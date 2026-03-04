import { getConfig } from "../config.js";

const BASE_URL = "https://api.x.ai/v1/chat/completions";

interface XaiResponse {
  choices?: Array<{
    message: {
      content: string;
    };
  }>;
  results?: Array<{
    url?: string;
    title?: string;
    text?: string;
    author?: string;
  }>;
}

export interface XSearchResult {
  answer: string;
  posts: string[];
}

export async function searchX(
  query: string,
  maxResults?: number,
): Promise<XSearchResult> {
  const config = getConfig();

  try {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.xaiApiKey || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content:
              "Search X/Twitter for relevant posts and discussions. Return the most relevant posts with their authors and links.",
          },
          {
            role: "user",
            content: query,
          },
        ],
        search_parameters: {
          mode: "on",
          sources: [{ type: "x" }],
          max_search_results: maxResults ?? 10,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[xai] Search failed (${response.status}): ${text}`);
      return { answer: "", posts: [] };
    }

    const data = (await response.json()) as XaiResponse;
    const answer = data.choices?.[0]?.message?.content ?? "";

    // Extract structured post data if available
    const posts: string[] = [];
    if (data.results && Array.isArray(data.results)) {
      for (const result of data.results) {
        const parts: string[] = [];
        if (result.author) parts.push(`@${result.author}`);
        if (result.text) parts.push(result.text);
        if (result.url) parts.push(result.url);
        if (parts.length > 0) {
          posts.push(parts.join(" — "));
        }
      }
    }

    return { answer, posts };
  } catch (error) {
    console.error("[xai] Search error:", error);
    return { answer: "", posts: [] };
  }
}
