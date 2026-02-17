import { supabaseAdmin } from './supabase.js';
import { generateEmbedding } from './embeddings.js';

/**
 * Search document chunks by vector similarity.
 * Optionally filter by document metadata before vector search.
 * Returns matched chunks with similarity scores.
 */
export async function searchDocuments(query, userId, { limit = 5, threshold = 0.5, metadata_filter } = {}) {
  const embedding = await generateEmbedding(query);

  let filterDocumentIds = null;

  // If metadata_filter provided, find matching document IDs first
  if (metadata_filter && Object.keys(metadata_filter).length > 0) {
    try {
      let docQuery = supabaseAdmin
        .from('documents')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .not('metadata', 'is', null);

      if (metadata_filter.topic) {
        docQuery = docQuery.ilike('metadata->>topic', `%${metadata_filter.topic}%`);
      }
      if (metadata_filter.document_type) {
        docQuery = docQuery.eq('metadata->>document_type', metadata_filter.document_type);
      }

      const { data: matchingDocs, error: filterError } = await docQuery;

      if (filterError) {
        console.error('Metadata filter error:', filterError);
        // Fall through to unfiltered search
      } else if (matchingDocs && matchingDocs.length === 0) {
        return [];
      } else if (matchingDocs) {
        filterDocumentIds = matchingDocs.map((d) => d.id);
      }
    } catch (err) {
      console.error('Metadata filter error:', err);
      // Fall through to unfiltered search
    }
  }

  const rpcParams = {
    query_embedding: JSON.stringify(embedding),
    match_user_id: userId,
    match_count: limit,
    match_threshold: threshold,
  };

  if (filterDocumentIds) {
    rpcParams.filter_document_ids = filterDocumentIds;
  }

  const { data, error } = await supabaseAdmin.rpc('match_document_chunks', rpcParams);

  if (error) {
    console.error('Search error:', error);
    return [];
  }

  return data || [];
}
