import { z } from 'zod';
import { getLlmModel } from './lmstudio.js';

export const MAX_EXTRACTION_CHARS = 4000;

export const DocumentMetadataSchema = z.object({
  topic: z.string().describe('Primary topic or subject of the document'),
  document_type: z.enum([
    'article', 'report', 'tutorial', 'documentation',
    'email', 'memo', 'legal', 'academic', 'other',
  ]).describe('Type of document'),
  key_entities: z.array(z.string()).max(10).describe('Key people, orgs, technologies, or concepts'),
  summary: z.string().max(500).describe('1-3 sentence summary'),
  language: z.string().describe('Primary language of the document'),
});

const EXTRACTION_PROMPT = `You are a metadata extraction assistant. Analyze the following document text and extract structured metadata. Respond with ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:

{
  "topic": "primary topic/subject",
  "document_type": "one of: article, report, tutorial, documentation, email, memo, legal, academic, other",
  "key_entities": ["entity1", "entity2"],
  "summary": "1-3 sentence summary (max 500 chars)",
  "language": "primary language"
}

Document text:
`;

const EXTRACTION_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Extract structured metadata from document text using LLM.
 * Truncates input to MAX_EXTRACTION_CHARS before sending.
 */
export async function extractMetadata(text) {
  const truncated = text.slice(0, MAX_EXTRACTION_CHARS);
  const model = await getLlmModel();

  console.log('[metadata] Starting LLM extraction...');

  const prediction = model.respond(
    [{ role: 'user', content: EXTRACTION_PROMPT + truncated }],
    { temperature: 0.1 }
  );

  // Race against timeout — local reasoning models can hang on long think phases
  const response = await Promise.race([
    prediction,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Metadata extraction timed out')), EXTRACTION_TIMEOUT_MS)
    ),
  ]);

  console.log('[metadata] LLM responded, parsing result...');

  // Handle response — may be string or have .content property
  let rawText;
  if (typeof response === 'string') {
    rawText = response;
  } else if (response?.content != null) {
    rawText = response.content;
  } else if (response?.text != null) {
    rawText = response.text;
  } else {
    // Last resort: stringify and try to extract
    rawText = String(response);
  }

  console.log('[metadata] Raw response (first 200 chars):', rawText.slice(0, 200));

  // Strip <think>...</think> blocks (chain-of-thought from reasoning models)
  rawText = rawText.replace(/<think>[\s\S]*?<\/think>\s*/g, '');

  // Strip markdown code fences if present
  rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  const parsed = JSON.parse(rawText);
  return DocumentMetadataSchema.parse(parsed);
}
