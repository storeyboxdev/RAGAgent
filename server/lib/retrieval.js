import { supabaseAdmin } from './supabase.js';
import { generateEmbedding } from './embeddings.js';

/**
 * Search document chunks by vector similarity.
 * Returns matched chunks with similarity scores.
 */
export async function searchDocuments(query, userId, { limit = 5, threshold = 0.5 } = {}) {
  const embedding = await generateEmbedding(query);

  const { data, error } = await supabaseAdmin.rpc('match_document_chunks', {
    query_embedding: JSON.stringify(embedding),
    match_user_id: userId,
    match_count: limit,
    match_threshold: threshold,
  });

  if (error) {
    console.error('Search error:', error);
    return [];
  }

  return data || [];
}
