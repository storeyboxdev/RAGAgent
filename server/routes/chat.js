import { Router } from 'express';
import { observe, Laminar } from '@lmnr-ai/lmnr';
import { tool } from '@lmstudio/sdk';
import { z } from 'zod';
import { createSupabaseClient } from '../lib/supabase.js';
import { getLlmModel } from '../lib/lmstudio.js';
import { searchDocuments } from '../lib/retrieval.js';
import { getSchemaDescription, executeQuery } from '../lib/sql-query.js';
import { isWebSearchEnabled, webSearch } from '../lib/web-search.js';

const router = Router();

function buildSystemPrompt() {
  const schemaDesc = getSchemaDescription();
  const webSearchEnabled = isWebSearchEnabled();

  let prompt = `You are a helpful assistant that answers questions using the user's uploaded documents.

RULES:
1. Use search_documents to find information in documents. Only pass "query" — only add "topic" or "document_type" if the user explicitly mentions them.
2. Answer ONLY based on retrieved text. Quote relevant passages. If results are insufficient, say so.
3. Use query_database for analytical questions (how many documents, list filenames, statistics). Write SELECT queries only.

TOOL ROUTING:
- Document content questions → search_documents
- Collection/analytical questions (counts, lists, stats) → query_database

DATABASE SCHEMA:
${schemaDesc}

Results limited to 50 rows.`;

  if (webSearchEnabled) {
    prompt += `

WEB SEARCH TOOL:
If the user's documents don't contain the answer and the question is about general knowledge, current events, or topics not covered in their documents, use the web_search tool as a fallback. Always cite the source URLs when using web search results.`;
  }

  return prompt;
}

// POST /api/chat — SSE streaming chat
router.post('/', async (req, res) => {
  const { threadId, message } = req.body;

  if (!threadId || !message) {
    return res.status(400).json({ error: 'threadId and message are required' });
  }

  const supabase = createSupabaseClient(req.accessToken);

  // Fetch thread
  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('*')
    .eq('id', threadId)
    .single();

  if (threadError || !thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  await observe(
    {
      name: 'chat_handler',
      sessionId: threadId,
      userId: req.user.id,
      input: { message, threadId },
    },
    async () => {
      try {
        // Build messages array from thread history (user + assistant only)
        const currentMessages = thread.messages || [];
        const messages = [
          { role: 'system', content: buildSystemPrompt() },
          ...currentMessages,
          { role: 'user', content: message },
        ];

        // Capture the user ID for the tool closure
        const userId = req.user.id;

        // Define search tool using LMStudio SDK tool() helper
        const searchTool = tool({
          name: 'search_documents',
          description: 'Search the user\'s uploaded documents for relevant information. Use this when the user asks about content that might be in their documents. You can optionally filter by metadata to narrow results.',
          parameters: {
            query: z.string().describe('The search query to find relevant document chunks'),
            topic: z.string().optional().describe('Optional: filter by topic (partial match)'),
            document_type: z.enum([
              'article', 'report', 'tutorial', 'documentation',
              'email', 'memo', 'legal', 'academic', 'other',
            ]).optional().describe('Optional: filter by document type'),
          },
          implementation: async ({ query, topic, document_type }) => {
            // Reconstruct metadata_filter from flat params for the retrieval layer
            const metadata_filter = (topic || document_type) ? { topic, document_type } : undefined;
            return observe(
              { name: 'tool:search_documents', input: { query, metadata_filter } },
              async () => {
                // Emit tool_call SSE event
                res.write(`data: ${JSON.stringify({ type: 'tool_call', name: 'search_documents', arguments: { query, metadata_filter } })}\n\n`);

                const chunks = await searchDocuments(query, userId, { metadata_filter });
                const searchMeta = chunks._searchMeta || { search_mode: 'vector', reranked: false };

                // Emit tool_result SSE event
                res.write(`data: ${JSON.stringify({ type: 'tool_result', name: 'search_documents', chunks, search_mode: searchMeta.search_mode, reranked: searchMeta.reranked })}\n\n`);

                return JSON.stringify(chunks);
              }
            );
          },
        });

        // Define query_database tool
        const queryDatabaseTool = tool({
          name: 'query_database',
          description: 'Run a SQL query against the user\'s document collection. Use this for analytical questions like counting documents, listing filenames, finding documents by metadata, or aggregating information across the collection.',
          parameters: {
            sql: z.string().describe('A SELECT SQL query to run against the documents and document_chunks tables'),
          },
          implementation: async ({ sql }) => {
            return observe(
              { name: 'tool:query_database', input: { sql } },
              async () => {
                res.write(`data: ${JSON.stringify({ type: 'tool_call', name: 'query_database', arguments: { sql } })}\n\n`);

                try {
                  const result = await executeQuery(sql, userId);
                  res.write(`data: ${JSON.stringify({ type: 'tool_result', name: 'query_database', rows: result.rows, rowCount: result.rowCount, sql: result.sql })}\n\n`);
                  return JSON.stringify(result);
                } catch (error) {
                  const errorResult = { error: error.message, rows: [], rowCount: 0 };
                  res.write(`data: ${JSON.stringify({ type: 'tool_result', name: 'query_database', ...errorResult })}\n\n`);
                  return JSON.stringify(errorResult);
                }
              }
            );
          },
        });

        // Build dynamic tools array
        const tools = [searchTool, queryDatabaseTool];

        // Add web_search tool only when enabled
        if (isWebSearchEnabled()) {
          const webSearchTool = tool({
            name: 'web_search',
            description: 'Search the web for information not found in the user\'s documents. Use this as a fallback when document search doesn\'t have the answer, especially for general knowledge or current events.',
            parameters: {
              query: z.string().describe('The search query to find information on the web'),
            },
            implementation: async ({ query }) => {
              return observe(
                { name: 'tool:web_search', input: { query } },
                async () => {
                  res.write(`data: ${JSON.stringify({ type: 'tool_call', name: 'web_search', arguments: { query } })}\n\n`);

                  const results = await webSearch(query);
                  res.write(`data: ${JSON.stringify({ type: 'tool_result', name: 'web_search', results })}\n\n`);

                  return JSON.stringify(results);
                }
              );
            },
          });
          tools.push(webSearchTool);
        }

        // Get the LLM model handle
        const model = await getLlmModel();

        // Accumulate full assistant content across all rounds
        let assistantContent = '';

        // Run .act() — handles tool call loop automatically
        await model.act(messages, tools, {
          onPredictionFragment: (fragment) => {
            if (fragment.content) {
              assistantContent += fragment.content;
              res.write(`data: ${JSON.stringify({ type: 'text_delta', content: fragment.content })}\n\n`);
            }
          },
          // Gracefully handle malformed tool calls instead of crashing
          handleInvalidToolRequest: (error, request) => {
            const toolName = request?.name || 'unknown';
            console.warn(`Invalid tool call request (${toolName}):`, error.message);

            // Trace the failed attempt so it appears in Laminar
            observe(
              { name: `tool:${toolName}:failed`, input: { error: error.message, rawContent: error.rawContent } },
              () => {
                Laminar.setSpanOutput({ error: error.message });
              }
            );

            if (request) {
              // Tool was identified but args failed to parse — return error to model
              res.write(`data: ${JSON.stringify({ type: 'tool_call', name: toolName, arguments: request.args || {} })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'tool_result', name: toolName, error: `Tool call failed: ${error.message}` })}\n\n`);
              return `Tool call failed: ${error.message}. Please try again with simpler parameters (avoid nested objects like metadata_filter).`;
            }
            // Complete parse failure — SDK can't accept a return value here,
            // so return undefined. The model will start a fresh prediction round.
          },
          temperature: 0.7,
          maxPredictionRounds: 5,
        });

        Laminar.setSpanOutput(assistantContent);

        // Store only user + assistant messages in thread history
        const newMessages = [
          { role: 'user', content: message },
          { role: 'assistant', content: assistantContent },
        ];

        const updatedMessages = [...currentMessages, ...newMessages];
        const updateData = { messages: updatedMessages };

        if (currentMessages.length === 0) {
          updateData.title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
        }

        await supabase
          .from('threads')
          .update(updateData)
          .eq('id', threadId);

        res.write(`data: ${JSON.stringify({ type: 'done', title: updateData.title })}\n\n`);
        res.end();
      } catch (error) {
        console.error('Chat error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
        res.end();
      }
    }
  );
});

// GET /api/chat/:threadId/messages — get cached messages
router.get('/:threadId/messages', async (req, res) => {
  const supabase = createSupabaseClient(req.accessToken);

  const { data: thread, error } = await supabase
    .from('threads')
    .select('messages')
    .eq('id', req.params.threadId)
    .single();

  if (error || !thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  res.json(thread.messages || []);
});

export { buildSystemPrompt };
export default router;
