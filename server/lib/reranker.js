import { observe } from '@lmnr-ai/lmnr';
import { z } from 'zod';
import { getLlmModel } from './lmstudio.js';

const MAX_CHUNK_CHARS = 1000;
const RERANK_TIMEOUT_MS = 30_000;

const ScoresSchema = z.array(
  z.object({
    index: z.number().int().min(0),
    score: z.number().min(0).max(1),
  })
);

/**
 * Rerank chunks using LLM-based relevance scoring.
 * All chunks are scored in a single batched LLM call.
 * Returns chunks sorted by rerank_score descending, sliced to limit.
 */
export async function rerankChunks(query, chunks, limit = 5) {
  return observe(
    { name: 'rerank_chunks', input: { query, chunkCount: chunks?.length ?? 0, limit } },
    async () => {
      if (!chunks || chunks.length === 0) return [];

      const model = await getLlmModel();

      // Build batched prompt with all chunks
      let prompt = `You are a relevance scoring assistant. Rate how relevant each document chunk is to the query.
Respond with ONLY a valid JSON array (no markdown, no explanation):
[{"index": 0, "score": 0.0}, {"index": 1, "score": 0.0}, ...]

Where score ranges from 0.0 (completely irrelevant) to 1.0 (perfectly relevant).

Query: ${query}
`;

      chunks.forEach((chunk, i) => {
        const truncated = chunk.content.slice(0, MAX_CHUNK_CHARS);
        prompt += `\nChunk ${i}:\n${truncated}\n`;
      });

      try {
        const prediction = model.respond(
          [{ role: 'user', content: prompt }],
          { temperature: 0.0 }
        );

        const response = await Promise.race([
          prediction,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Rerank scoring timed out')), RERANK_TIMEOUT_MS)
          ),
        ]);

        let rawText;
        if (typeof response === 'string') {
          rawText = response;
        } else if (response?.content != null) {
          rawText = response.content;
        } else if (response?.text != null) {
          rawText = response.text;
        } else {
          rawText = String(response);
        }

        // Strip <think>...</think> blocks
        rawText = rawText.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
        // Strip LMStudio special tokens like <|begin_of_sentence|>
        rawText = rawText.replace(/<\|[^|]*\|>/g, '');
        // Strip markdown code fences
        rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        rawText = rawText.trim();

        const parsed = JSON.parse(rawText);
        const scores = ScoresSchema.parse(parsed);

        // Build a map of index -> score
        const scoreMap = new Map();
        for (const { index, score } of scores) {
          scoreMap.set(index, score);
        }

        const scored = chunks.map((chunk, i) => ({
          ...chunk,
          rerank_score: scoreMap.get(i) ?? 0,
        }));

        return scored
          .sort((a, b) => b.rerank_score - a.rerank_score)
          .slice(0, limit);
      } catch (err) {
        console.error('Rerank scoring failed:', err.message);
        // Fallback: assign score 0 to all chunks
        return chunks.slice(0, limit).map((chunk) => ({ ...chunk, rerank_score: 0 }));
      }
    }
  );
}
