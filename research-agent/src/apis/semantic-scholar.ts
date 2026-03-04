import { SearchResult } from "../types.js";
import { getConfig } from "../config.js";
import { RateLimiter } from "../rate-limiter.js";

const BASE_URL = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "paperId,title,abstract,authors,year,citationCount,venue,externalIds,isOpenAccess,tldr";

const limiterWithKey = new RateLimiter(10, 10);
const limiterWithoutKey = new RateLimiter(1, 1);

function getLimiter(): RateLimiter {
  const config = getConfig();
  return config.semanticScholarApiKey ? limiterWithKey : limiterWithoutKey;
}

function getHeaders(): Record<string, string> {
  const config = getConfig();
  const headers: Record<string, string> = {
    "Accept": "application/json",
  };
  if (config.semanticScholarApiKey) {
    headers["x-api-key"] = config.semanticScholarApiKey;
  }
  return headers;
}

interface SearchPapersOptions {
  maxResults?: number;
  yearFrom?: number;
  yearTo?: number;
  fieldOfStudy?: string;
}

interface PaperData {
  paperId: string;
  title: string;
  abstract?: string;
  authors?: Array<{ name: string }>;
  year?: number;
  citationCount?: number;
  venue?: string;
  externalIds?: Record<string, string>;
  isOpenAccess?: boolean;
  tldr?: { text: string };
}

function mapPaperToResult(paper: PaperData): SearchResult {
  return {
    id: `ss_${paper.paperId}`,
    title: paper.title || "Untitled",
    url: `https://www.semanticscholar.org/paper/${paper.paperId}`,
    snippet: paper.tldr?.text || paper.abstract || "",
    source: "semantic_scholar",
    metadata: {
      authors: paper.authors?.map((a) => a.name),
      year: paper.year,
      citationCount: paper.citationCount,
      venue: paper.venue || undefined,
      doi: paper.externalIds?.DOI,
      openAccess: paper.isOpenAccess,
      tldr: paper.tldr?.text,
    },
    raw: paper,
  };
}

export async function searchPapers(
  query: string,
  options?: SearchPapersOptions,
): Promise<SearchResult[]> {
  const maxResults = options?.maxResults ?? 10;

  try {
    await getLimiter().acquire();

    const params = new URLSearchParams({
      query,
      limit: String(maxResults),
      fields: FIELDS,
    });

    if (options?.yearFrom || options?.yearTo) {
      const from = options.yearFrom ?? "";
      const to = options.yearTo ?? "";
      params.set("year", `${from}-${to}`);
    }

    if (options?.fieldOfStudy) {
      params.set("fieldsOfStudy", options.fieldOfStudy);
    }

    const url = `${BASE_URL}/paper/search?${params.toString()}`;
    const response = await fetch(url, { headers: getHeaders() });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[semantic-scholar] Search failed (${response.status}): ${body}`);
      return [];
    }

    const data = (await response.json()) as { data?: PaperData[] };
    const papers = data.data ?? [];

    return papers.map(mapPaperToResult);
  } catch (error) {
    console.error("[semantic-scholar] Search error:", error);
    return [];
  }
}

export async function getCitations(
  paperId: string,
  direction: "citations" | "references",
  maxResults?: number,
): Promise<SearchResult[]> {
  const limit = maxResults ?? 10;

  try {
    await getLimiter().acquire();

    const params = new URLSearchParams({
      fields: FIELDS,
      limit: String(limit),
    });

    const url = `${BASE_URL}/paper/${encodeURIComponent(paperId)}/${direction}?${params.toString()}`;
    const response = await fetch(url, { headers: getHeaders() });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[semantic-scholar] getCitations failed (${response.status}): ${body}`);
      return [];
    }

    const data = (await response.json()) as {
      data?: Array<{ citingPaper?: PaperData; citedPaper?: PaperData }>;
    };

    const items = data.data ?? [];
    return items
      .map((item) => {
        const paper = direction === "citations" ? item.citingPaper : item.citedPaper;
        if (!paper) return null;
        return mapPaperToResult(paper);
      })
      .filter((r): r is SearchResult => r !== null);
  } catch (error) {
    console.error("[semantic-scholar] getCitations error:", error);
    return [];
  }
}
