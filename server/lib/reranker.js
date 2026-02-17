import { z } from 'zod';
import { getLlmModel } from './lmstudio.js';

const MAX_CHUNK_CHARS = 1000;
const RERANK_TIMEOUT_MS = 30_000;

const ScoreSchema = z.object({
  score: z.number().min(0).max(1),
});

const RERANK_PROMPT = `You are a relevance scoring assistant. Rate how relevant the following document chunk is to the user's query.
Respond with ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{"score": 0.0 to 1.0}

Where 0.0 = completely irrelevant and 1.0 = perfectly relevant.

Query: `;

/**
 * Rerank chunks using LLM-based relevance scoring.
 * Each chunk is scored in parallel. Failed chunks get score=0.
 * Returns chunks sorted by rerank_score descending, sliced to limit.
 */
export async function rerankChunks(query, chunks, limit = 5) {
  if (!chunks || chunks.length === 0) return [];

  const model = await getLlmModel();

  const scored = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const truncatedContent = chunk.content.slice(0, MAX_CHUNK_CHARS);
        const prompt = RERANK_PROMPT + query + '\n\nDocument chunk:\n' + truncatedContent;

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
        // Strip markdown code fences
        rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

        const parsed = JSON.parse(rawText);
        const { score } = ScoreSchema.parse(parsed);

        return { ...chunk, rerank_score: score };
      } catch (err) {
        console.error('Rerank scoring failed for chunk:', err.message);
        return { ...chunk, rerank_score: 0 };
      }
    })
  );

  return scored
    .sort((a, b) => b.rerank_score - a.rerank_score)
    .slice(0, limit);
}
