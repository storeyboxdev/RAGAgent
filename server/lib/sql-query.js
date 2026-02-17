import { supabaseAdmin } from './supabase.js';

const ALLOWED_TABLES = ['documents', 'document_chunks'];

const DANGEROUS_KEYWORDS = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|execute|exec)\b/i;

/**
 * Validate and rewrite a SQL query to enforce safety constraints.
 * - SELECT-only
 * - Block dangerous keywords
 * - Whitelist tables
 * - Auto-inject user_id filter
 */
export function validateAndRewriteQuery(sql, userId) {
  // Normalize: trim and strip trailing semicolons
  let normalized = sql.trim().replace(/;+$/, '');

  // SELECT-only enforcement
  if (!/^select\s/i.test(normalized)) {
    return { valid: false, error: 'Only SELECT statements are allowed' };
  }

  // Block dangerous keywords
  if (DANGEROUS_KEYWORDS.test(normalized)) {
    return { valid: false, error: 'Statement contains disallowed keywords' };
  }

  // Table whitelist — extract table references from FROM and JOIN clauses
  const tablePattern = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi;
  let match;
  while ((match = tablePattern.exec(normalized)) !== null) {
    const table = match[1].toLowerCase();
    if (!ALLOWED_TABLES.includes(table)) {
      return { valid: false, error: `Table "${match[1]}" is not allowed. Allowed tables: ${ALLOWED_TABLES.join(', ')}` };
    }
  }

  // Auto-inject user_id filter if not already present
  if (!/user_id/i.test(normalized)) {
    if (/\bwhere\b/i.test(normalized)) {
      // Add to existing WHERE clause
      normalized = normalized.replace(/\bwhere\b/i, `WHERE documents.user_id = '${userId}' AND`);
    } else {
      // Check if there's a GROUP BY, ORDER BY, LIMIT, etc. to insert WHERE before
      const clauseMatch = normalized.match(/\b(group\s+by|order\s+by|limit|having)\b/i);
      if (clauseMatch) {
        const idx = normalized.indexOf(clauseMatch[0]);
        normalized = normalized.slice(0, idx) + `WHERE documents.user_id = '${userId}' ` + normalized.slice(idx);
      } else {
        normalized += ` WHERE documents.user_id = '${userId}'`;
      }
    }
  }

  return { valid: true, rewrittenSql: normalized };
}

/**
 * Returns a schema description string for the LLM system prompt.
 */
export function getSchemaDescription() {
  return `Available tables for SQL queries:

TABLE: documents
  - id (uuid, primary key)
  - filename (text) — original file name
  - file_type (text) — MIME type
  - status (text) — 'processing', 'ready', 'error', 'duplicate'
  - metadata (jsonb) — extracted metadata with fields: title, summary, topic, document_type, key_entities
  - created_at (timestamptz)
  - updated_at (timestamptz)

TABLE: document_chunks
  - id (uuid, primary key)
  - document_id (uuid, foreign key → documents.id)
  - content (text) — chunk text content
  - chunk_index (integer) — position in document
  - content_hash (text) — SHA-256 hash of content
  - created_at (timestamptz)

You can JOIN these tables on document_chunks.document_id = documents.id.
Do NOT reference user_id — it is automatically filtered for security.`;
}

/**
 * Validate, rewrite, and execute a SQL query via the RPC function.
 */
export async function executeQuery(sql, userId) {
  const validation = validateAndRewriteQuery(sql, userId);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const { data, error } = await supabaseAdmin.rpc('execute_readonly_query', {
    query_text: validation.rewrittenSql,
    query_user_id: userId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = data || [];
  return { rows, rowCount: rows.length, sql: validation.rewrittenSql };
}
