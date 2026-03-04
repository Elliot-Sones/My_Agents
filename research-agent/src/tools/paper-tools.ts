import type { ToolDef } from "../types.js";
import { searchPapers, getCitations } from "../apis/semantic-scholar.js";

export function paperTools(): ToolDef[] {
  return [
    {
      name: "paper_search",
      description:
        "Search academic papers via Semantic Scholar (214M+ papers). Returns titles, abstracts, citation counts, venues, DOIs, open access status, and TLDRs. Use this for literature review, finding prior work, or exploring a research area.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for academic papers." },
          maxResults: { type: "number", description: "Maximum results to return (default 10, max 100)." },
          yearFrom: { type: "number", description: "Filter papers published from this year." },
          yearTo: { type: "number", description: "Filter papers published up to this year." },
          fieldOfStudy: {
            type: "string",
            description:
              "Filter by field: Computer Science, Medicine, Biology, Physics, Mathematics, etc.",
          },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const results = await searchPapers(query, {
          maxResults: params.maxResults as number | undefined,
          yearFrom: params.yearFrom as number | undefined,
          yearTo: params.yearTo as number | undefined,
          fieldOfStudy: params.fieldOfStudy as string | undefined,
        });
        return {
          source: "semantic_scholar",
          query,
          resultCount: results.length,
          results,
        };
      },
    },
    {
      name: "paper_citations",
      description:
        "Explore the citation graph for a paper. Get papers that cite it (forward citations) or papers it references (backward references). Use Semantic Scholar paper IDs from paper_search results.",
      inputSchema: {
        type: "object",
        properties: {
          paperId: {
            type: "string",
            description: "Semantic Scholar paper ID (from paper_search results, without the ss_ prefix).",
          },
          direction: {
            type: "string",
            description: '"citations" for papers citing this one, "references" for papers this one cites.',
            enum: ["citations", "references"],
          },
          maxResults: { type: "number", description: "Maximum results to return (default 10)." },
        },
        required: ["paperId", "direction"],
      },
      handler: async (params) => {
        const paperId = params.paperId as string;
        const direction = params.direction as "citations" | "references";
        const results = await getCitations(paperId, direction, params.maxResults as number | undefined);
        return {
          source: "semantic_scholar",
          paperId,
          direction,
          resultCount: results.length,
          results,
        };
      },
    },
  ];
}
