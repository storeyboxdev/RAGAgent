import { Router } from 'express';
import { observe, Laminar } from '@lmnr-ai/lmnr';
import { tool } from '@lmstudio/sdk';
import { z } from 'zod';
import { createSupabaseClient } from '../lib/supabase.js';
import { getLlmModel } from '../lib/lmstudio.js';
import { searchDocuments } from '../lib/retrieval.js';

const router = Router();

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions using the user's uploaded documents.

IMPORTANT RULES:
1. When the user asks a question, use the search_documents tool to find relevant information. Call it with just the "query" parameter — only add "metadata_filter" if the user explicitly mentions a document type or topic to filter by.
2. After receiving search results, answer ONLY based on the actual text returned. Do NOT add information from your own knowledge.
3. Quote relevant passages directly from the retrieved text to support your answer.
4. If the search results don't contain enough information to answer, say so — do not make up an answer.
5. Keep your response concise and directly answer the question asked.`;

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
          { role: 'system', content: SYSTEM_PROMPT },
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
            metadata_filter: z.object({
              topic: z.string().optional().describe('Filter by topic (partial match)'),
              document_type: z.enum([
                'article', 'report', 'tutorial', 'documentation',
                'email', 'memo', 'legal', 'academic', 'other',
              ]).optional().describe('Filter by document type'),
            }).optional().describe('Optional metadata filters to narrow search'),
          },
          implementation: async ({ query, metadata_filter }) => {
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

        // Get the LLM model handle
        const model = await getLlmModel();

        // Accumulate full assistant content across all rounds
        let assistantContent = '';

        // Run .act() — handles tool call loop automatically
        await model.act(messages, [searchTool], {
          onPredictionFragment: (fragment) => {
            if (fragment.content) {
              assistantContent += fragment.content;
              res.write(`data: ${JSON.stringify({ type: 'text_delta', content: fragment.content })}\n\n`);
            }
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

export default router;
