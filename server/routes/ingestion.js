import { Router } from 'express';
import multer from 'multer';
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase.js';
import { chunkText } from '../lib/chunking.js';
import { generateEmbeddings } from '../lib/embeddings.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/ingestion/upload — upload a file for ingestion
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const supabase = createSupabaseClient(req.accessToken);
  const userId = req.user.id;
  const { originalname, mimetype, size, buffer } = req.file;

  // Create document record
  const docId = crypto.randomUUID();
  const storagePath = `${userId}/${docId}/${originalname}`;

  // Upload to Supabase Storage
  const { error: storageError } = await supabaseAdmin.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: mimetype });

  if (storageError) {
    return res.status(500).json({ error: `Storage upload failed: ${storageError.message}` });
  }

  // Insert document row
  const { data: doc, error: insertError } = await supabase
    .from('documents')
    .insert({
      id: docId,
      user_id: userId,
      filename: originalname,
      file_type: mimetype,
      file_size: size,
      storage_path: storagePath,
      status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: `Failed to create document: ${insertError.message}` });
  }

  // Kick off async processing (don't await)
  processDocument(docId, userId, storagePath).catch((err) => {
    console.error(`Document processing failed for ${docId}:`, err);
  });

  res.status(201).json(doc);
});

// GET /api/ingestion/documents — list user's documents
router.get('/documents', async (req, res) => {
  const supabase = createSupabaseClient(req.accessToken);

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// DELETE /api/ingestion/documents/:id — delete a document + storage file
router.delete('/documents/:id', async (req, res) => {
  const supabase = createSupabaseClient(req.accessToken);

  // Fetch document to get storage path
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Delete storage file
  await supabaseAdmin.storage.from('documents').remove([doc.storage_path]);

  // Delete document (cascades to chunks)
  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', req.params.id);

  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  res.json({ success: true });
});

/**
 * Async document processing pipeline:
 * 1. Update status → processing
 * 2. Download file from storage
 * 3. Chunk the text
 * 4. Generate embeddings
 * 5. Store chunks with embeddings
 * 6. Update status → completed (or error)
 */
async function processDocument(docId, userId, storagePath) {
  try {
    // Update status to processing
    await supabaseAdmin
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', docId);

    // Download file
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(storagePath);

    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

    const text = await fileData.text();

    // Chunk the text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error('No content to process');
    }

    // Generate embeddings in batches
    const batchSize = 50;
    const allEmbeddings = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await generateEmbeddings(batch.map((c) => c.content));
      allEmbeddings.push(...embeddings);
    }

    // Store chunks with embeddings
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: docId,
      user_id: userId,
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      embedding: JSON.stringify(allEmbeddings[i]),
    }));

    const { error: chunkError } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunkRows);

    if (chunkError) throw new Error(`Chunk insert failed: ${chunkError.message}`);

    // Update status to completed
    await supabaseAdmin
      .from('documents')
      .update({ status: 'completed', chunk_count: chunks.length })
      .eq('id', docId);
  } catch (error) {
    console.error(`Processing error for document ${docId}:`, error);
    await supabaseAdmin
      .from('documents')
      .update({ status: 'error', error_message: error.message })
      .eq('id', docId);
  }
}

export default router;
