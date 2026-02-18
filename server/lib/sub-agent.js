import { observe } from '@lmnr-ai/lmnr';
import { tool } from '@lmstudio/sdk';
import { z } from 'zod';
import { supabaseAdmin } from './supabase.js';
import { getLlmModel } from './lmstudio.js';
import { searchDocuments } from './retrieval.js';

const MAX_CONTENT_LENGTH = 50_000;
const MAX_CHUNKS = 50;

/**
 * Run an isolated sub-agent that analyzes a single document in depth.
 * The sub-agent gets the full document text in its context and can search within it.
 */
export async function runSubAgent({ document_id, task, userId, res }) {
  return observe(
    { name: 'sub_agent', input: { document_id, task } },
    async () => {
      // 1. Fetch document metadata
      const { data: doc, error: docError } = await supabaseAdmin
        .from('documents')
        .select('id, filename, metadata')
        .eq('id', document_id)
        .eq('user_id', userId)
        .single();

      if (docError || !doc) {
        throw new Error(`Document not found: ${document_id}`);
      }

      // 2. Fetch all chunks ordered by chunk_index
      const { data: chunks, error: chunksError } = await supabaseAdmin
        .from('document_chunks')
        .select('content, chunk_index')
        .eq('document_id', document_id)
        .order('chunk_index', { ascending: true })
        .limit(MAX_CHUNKS);

      if (chunksError) {
        throw new Error(`Failed to fetch document chunks: ${chunksError.message}`);
      }

      // 3. Assemble full text with truncation
      let fullText = (chunks || []).map((c) => c.content).join('\n\n');
      let truncated = false;
      if (fullText.length > MAX_CONTENT_LENGTH) {
        fullText = fullText.slice(0, MAX_CONTENT_LENGTH);
        truncated = true;
      }

      const documentContent = truncated
        ? `${fullText}\n\n[Document truncated due to length]`
        : fullText;

      // 4. Build isolated messages
      const systemMessage = `You are a document analysis assistant. You have been given the full text of "${doc.filename}" to analyze.

DOCUMENT CONTENT:
${documentContent}

TASK: ${task}

Answer the task using the document content above. If you need to find specific passages, use the search_within_document tool. Be thorough and cite specific parts of the document.`;

      const messages = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: task },
      ];

      // 5. Define search_within_document tool
      const searchWithinDocumentTool = tool({
        name: 'search_within_document',
        description: 'Search within the current document for specific passages matching a query.',
        parameters: {
          query: z.string().describe('The search query to find relevant passages within this document'),
        },
        implementation: async ({ query }) => {
          return observe(
            { name: 'tool:search_within_document', input: { query, document_id } },
            async () => {
              res.write(`data: ${JSON.stringify({ type: 'subagent_tool_call', name: 'search_within_document', arguments: { query } })}\n\n`);

              const results = await searchDocuments(query, userId, { document_id, limit: 5 });

              res.write(`data: ${JSON.stringify({ type: 'subagent_tool_result', name: 'search_within_document', chunks: results, count: results.length })}\n\n`);

              return JSON.stringify(results);
            }
          );
        },
      });

      // 6. Run model.act() with isolated context
      const model = await getLlmModel();
      let subAgentContent = '';

      await model.act(messages, [searchWithinDocumentTool], {
        onPredictionFragment: (fragment) => {
          if (fragment.content) {
            subAgentContent += fragment.content;
            res.write(`data: ${JSON.stringify({ type: 'subagent_text_delta', content: fragment.content })}\n\n`);
          }
        },
        temperature: 0.3,
        maxPredictionRounds: 3,
      });

      return subAgentContent;
    }
  );
}
