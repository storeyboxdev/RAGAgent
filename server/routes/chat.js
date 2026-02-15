import { Router } from 'express';
import { Laminar, observe } from '@lmnr-ai/lmnr';
import { createSupabaseClient } from '../lib/supabase.js';
import openai from '../lib/openai.js';

const router = Router();

// POST /api/chat — SSE streaming chat
router.post('/', async (req, res) => {
  const { threadId, message } = req.body;

  if (!threadId || !message) {
    return res.status(400).json({ error: 'threadId and message are required' });
  }

  const supabase = createSupabaseClient(req.accessToken);

  // Fetch thread to get previous_response_id
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
      input: { message, threadId, hasPreviousContext: !!thread.openai_response_id },
    },
    async () => {
      try {
        const responseParams = {
          model: 'gpt-4o-mini',
          input: message,
          stream: true,
        };

        if (thread.openai_response_id) {
          responseParams.previous_response_id = thread.openai_response_id;
        }

        // Wrap the OpenAI call in its own span since auto-instrumentation
        // doesn't support the Responses API
        const { assistantContent, responseId, usage } = await observe(
          {
            name: 'openai.responses.create',
            spanType: 'LLM',
            input: { model: responseParams.model, message, previous_response_id: responseParams.previous_response_id ?? null },
          },
          async () => {
            const stream = await openai.responses.create(responseParams);

            let assistantContent = '';
            let responseId = null;
            let usage = null;

            for await (const event of stream) {
              if (event.type === 'response.output_text.delta') {
                assistantContent += event.delta;
                res.write(`data: ${JSON.stringify({ type: 'text_delta', content: event.delta })}\n\n`);
              } else if (event.type === 'response.completed') {
                responseId = event.response.id;
                usage = event.response.usage;
              }
            }

            const result = { assistantContent, responseId, usage };

            // Manually set span output and LLM attributes
            Laminar.setSpanOutput(assistantContent);
            if (usage) {
              Laminar.setSpanAttributes({
                'llm.usage.prompt_tokens': usage.input_tokens,
                'llm.usage.completion_tokens': usage.output_tokens,
                'gen_ai.request.model': responseParams.model,
                'gen_ai.response.model': responseParams.model,
              });
            }

            return result;
          }
        );

        // Update thread with new response ID and cached messages
        const currentMessages = thread.messages || [];
        const updatedMessages = [
          ...currentMessages,
          { role: 'user', content: message },
          { role: 'assistant', content: assistantContent },
        ];

        // Auto-title from first user message
        const updateData = {
          openai_response_id: responseId,
          messages: updatedMessages,
        };

        if (currentMessages.length === 0) {
          updateData.title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
        }

        await supabase
          .from('threads')
          .update(updateData)
          .eq('id', threadId);

        Laminar.setSpanOutput({ assistantContent, responseId });

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
