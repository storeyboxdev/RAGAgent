import { Router } from 'express';
import { observe, Laminar } from '@lmnr-ai/lmnr';
import { tool } from '@lmstudio/sdk';
import { z } from 'zod';
import { createSupabaseClient } from '../lib/supabase.js';
import { getLlmModel } from '../lib/lmstudio.js';
import { searchDocuments } from '../lib/retrieval.js';

const router = Router();

const SYSTEM_PROMPT = `You are a helpful assistant. You have access to a document search tool that can find relevant information from the user's uploaded documents. When the user asks a question that might be answered by their documents, use the search_documents tool to find relevant information. Always cite information that comes from documents.`;

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
          description: 'Search the user\'s uploaded documents for relevant information. Use this when the user asks about content that might be in their documents.',
          parameters: {
            query: z.string().describe('The search query to find relevant document chunks'),
          },
          implementation: async ({ query }) => {
            // Emit tool_call SSE event
            res.write(`data: ${JSON.stringify({ type: 'tool_call', name: 'search_documents', arguments: { query } })}\n\n`);

            const chunks = await searchDocuments(query, userId);

            // Emit tool_result SSE event
            res.write(`data: ${JSON.stringify({ type: 'tool_result', name: 'search_documents', chunks })}\n\n`);

            return JSON.stringify(chunks);
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
