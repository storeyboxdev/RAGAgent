import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryChain } from '../helpers/mockSupabase.js';

// Mock external dependencies
vi.mock('@lmnr-ai/lmnr', () => ({
  observe: vi.fn((_, cb) => cb()),
  Laminar: { initialize: vi.fn(), setSpanOutput: vi.fn() },
}));

vi.mock('@lmstudio/sdk', () => ({
  tool: vi.fn((def) => def),
  LMStudioClient: vi.fn(() => ({})),
}));

const mockUserClient = { from: vi.fn() };
const mockAdminStorage = {
  from: vi.fn().mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
    download: vi.fn().mockResolvedValue({ data: { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(11)) }, error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  }),
};
const mockAdminFrom = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  createSupabaseClient: vi.fn(() => mockUserClient),
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
    from: mockAdminFrom,
    storage: mockAdminStorage,
    rpc: vi.fn(),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((req, res, next) => {
    req.user = { id: 'test-user-uuid-1234', email: 'test@example.com' };
    req.accessToken = 'test-bearer-token';
    next();
  }),
}));

vi.mock('../../lib/lmstudio.js', () => ({
  lmstudioClient: {},
  EMBEDDING_MODEL: 'test-model',
  EMBEDDING_DIMENSIONS: 768,
  getActiveLlmModelId: vi.fn(),
  setActiveLlmModelId: vi.fn(),
  getLlmModel: vi.fn(),
  listDownloadedLlmModels: vi.fn(),
  listLoadedLlmModels: vi.fn(),
  listDownloadedEmbeddingModels: vi.fn(),
  listLoadedEmbeddingModels: vi.fn(),
}));

vi.mock('../../lib/embeddings.js', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  generateEmbedding: vi.fn(),
}));

vi.mock('../../lib/retrieval.js', () => ({
  searchDocuments: vi.fn(),
}));

const mockExtractMetadata = vi.fn();
vi.mock('../../lib/metadata.js', () => ({
  extractMetadata: (...args) => mockExtractMetadata(...args),
}));

const mockParseDocument = vi.fn().mockResolvedValue('parsed content');
vi.mock('../../lib/parsing.js', () => ({
  parseDocument: (...args) => mockParseDocument(...args),
  SUPPORTED_EXTENSIONS: ['.txt', '.md', '.pdf', '.docx', '.html', '.htm'],
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../app.js');

describe('Ingestion API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseDocument.mockResolvedValue('parsed content');
    // Reset the admin storage mock
    mockAdminStorage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      download: vi.fn().mockResolvedValue({ data: { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(11)) }, error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    });
    // Admin from chain for background processing
    mockAdminFrom.mockReturnValue(createQueryChain({ data: null, error: null }));
  });

  /**
   * Helper: set up mockUserClient.from to return different chains per call.
   * Each entry in `chains` corresponds to one `.from()` call in order.
   */
  function mockUserFromSequence(chains) {
    let callIndex = 0;
    mockUserClient.from.mockImplementation(() => {
      const chain = chains[callIndex] || chains[chains.length - 1];
      callIndex++;
      return chain;
    });
  }

  describe('POST /api/ingestion/upload', () => {
    it('returns 201 with document on successful upload', async () => {
      const doc = { id: 'doc-1', filename: 'test.txt', status: 'pending' };

      // Call sequence: 1) hash check (no dup), 2) filename check (no dup), 3) insert
      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: doc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, insertChain]);

      const res = await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello world'), 'test.txt');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
    });

    it('returns 400 with no file', async () => {
      const res = await request(app).post('/api/ingestion/upload');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No file provided');
    });

    it('returns 500 on storage error', async () => {
      mockAdminStorage.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: { message: 'Storage full' } }),
      });

      // Hash check + name check both return no match
      const noMatch = createQueryChain({ data: null, error: null });
      mockUserFromSequence([noMatch, noMatch]);

      const res = await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello'), 'test.txt');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Storage full');
    });
  });

  describe('GET /api/ingestion/documents', () => {
    it('returns 200 with array of documents', async () => {
      const docs = [{ id: '1', filename: 'a.txt' }];
      mockUserClient.from.mockReturnValue(createQueryChain({ data: docs, error: null }));

      const res = await request(app).get('/api/ingestion/documents');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(docs);
    });

    it('returns 500 on error', async () => {
      mockUserClient.from.mockReturnValue(createQueryChain({ data: null, error: { message: 'Query failed' } }));

      const res = await request(app).get('/api/ingestion/documents');
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/ingestion/documents/:id', () => {
    it('returns 200 with success true', async () => {
      const fetchChain = createQueryChain({ data: { storage_path: 'user/doc/file.txt' }, error: null });
      const deleteChain = createQueryChain({ error: null });
      mockUserFromSequence([fetchChain, deleteChain]);

      const res = await request(app).delete('/api/ingestion/documents/doc-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when document not found', async () => {
      mockUserClient.from.mockReturnValue(createQueryChain({ data: null, error: { message: 'not found' } }));

      const res = await request(app).delete('/api/ingestion/documents/missing');
      expect(res.status).toBe(404);
    });
  });

  describe('Record Manager', () => {
    it('returns 200 with duplicate flag when same content already exists', async () => {
      const existingDoc = { id: 'doc-existing', filename: 'test.txt', status: 'completed', content_hash: 'abc123' };

      // Hash check returns existing doc
      const hashCheckChain = createQueryChain({ data: existingDoc, error: null });
      mockUserFromSequence([hashCheckChain]);

      const res = await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello world'), 'test.txt');

      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
      expect(res.body.id).toBe('doc-existing');
      // Storage upload should NOT have been called
      expect(mockAdminStorage.from().upload).not.toHaveBeenCalled();
    });

    it('deletes old doc and creates new one on re-upload with different content', async () => {
      const oldDoc = { id: 'doc-old', filename: 'test.txt', status: 'completed', storage_path: 'user/old/test.txt', content_hash: 'oldhash' };
      const newDoc = { id: 'doc-new', filename: 'test.txt', status: 'pending', content_hash: 'newhash' };

      // 1) hash check → no match, 2) name check → old doc found, 3) delete old, 4) insert new
      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: oldDoc, error: null });
      const deleteChain = createQueryChain({ error: null });
      const insertChain = createQueryChain({ data: newDoc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, deleteChain, insertChain]);

      const res = await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('New content'), 'test.txt');

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('doc-new');
      // Verify old storage file was removed
      expect(mockAdminStorage.from).toHaveBeenCalledWith('documents');
    });

    it('includes content_hash in insert payload for new uploads', async () => {
      const doc = { id: 'doc-1', filename: 'test.txt', status: 'pending', content_hash: 'somehash' };

      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: doc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, insertChain]);

      await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello world'), 'test.txt');

      // The insert chain's insert method should have been called with content_hash
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ content_hash: expect.any(String) })
      );
    });

    it('chunk rows include content_hash field', async () => {
      // This tests processDocument indirectly via the admin mock.
      // We verify the chunk insert call includes content_hash.
      const doc = { id: 'doc-1', filename: 'test.txt', status: 'pending' };

      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: doc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, insertChain]);

      // Set up admin mock to capture chunk inserts
      const chunkInsertChain = createQueryChain({ data: null, error: null });
      const adminChains = [
        createQueryChain({ data: null, error: null }), // status → processing
        chunkInsertChain, // chunk insert
        createQueryChain({ data: null, error: null }), // status → extracting
        createQueryChain({ data: null, error: null }), // status → completed
      ];
      let adminCallIndex = 0;
      mockAdminFrom.mockImplementation(() => {
        const chain = adminChains[adminCallIndex] || adminChains[adminChains.length - 1];
        adminCallIndex++;
        return chain;
      });

      mockExtractMetadata.mockResolvedValue({ topic: 'test' });

      await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello world'), 'test.txt');

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 100));

      // The second admin .from() call is the chunk insert
      expect(chunkInsertChain.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content_hash: expect.any(String) }),
        ])
      );
    });
  });

  describe('Metadata Extraction', () => {
    it('calls extractMetadata and includes metadata in final update', async () => {
      const doc = { id: 'doc-1', filename: 'test.txt', status: 'pending' };
      const metadata = { topic: 'Testing', document_type: 'tutorial', key_entities: [], summary: 'A test', language: 'English' };

      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: doc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, insertChain]);

      // Admin calls: processing, chunk insert, extracting, completed
      const completedChain = createQueryChain({ data: null, error: null });
      const adminChains = [
        createQueryChain({ data: null, error: null }), // status → processing
        createQueryChain({ data: null, error: null }), // chunk insert
        createQueryChain({ data: null, error: null }), // status → extracting
        completedChain, // status → completed
      ];
      let adminCallIndex = 0;
      mockAdminFrom.mockImplementation(() => {
        const chain = adminChains[adminCallIndex] || adminChains[adminChains.length - 1];
        adminCallIndex++;
        return chain;
      });

      mockExtractMetadata.mockResolvedValue(metadata);

      await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello world'), 'test.txt');

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 100));

      expect(mockExtractMetadata).toHaveBeenCalled();
      // The final update should include metadata
      expect(completedChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', metadata })
      );
    });

    it('extraction failure is non-fatal — document still completes with metadata: null', async () => {
      const doc = { id: 'doc-1', filename: 'test.txt', status: 'pending' };

      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: doc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, insertChain]);

      // Admin calls: processing, chunk insert, extracting, completed
      const completedChain = createQueryChain({ data: null, error: null });
      const adminChains = [
        createQueryChain({ data: null, error: null }), // status → processing
        createQueryChain({ data: null, error: null }), // chunk insert
        createQueryChain({ data: null, error: null }), // status → extracting
        completedChain, // status → completed
      ];
      let adminCallIndex = 0;
      mockAdminFrom.mockImplementation(() => {
        const chain = adminChains[adminCallIndex] || adminChains[adminChains.length - 1];
        adminCallIndex++;
        return chain;
      });

      mockExtractMetadata.mockRejectedValue(new Error('LLM failed'));

      await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello world'), 'test.txt');

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 100));

      // Document should still complete with metadata: null
      expect(completedChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', metadata: null })
      );
    });

    it('status transitions include extracting', async () => {
      const doc = { id: 'doc-1', filename: 'test.txt', status: 'pending' };

      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: doc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, insertChain]);

      // Admin calls: processing, chunk insert, extracting, completed
      const processingChain = createQueryChain({ data: null, error: null });
      const extractingChain = createQueryChain({ data: null, error: null });
      const adminChains = [
        processingChain, // status → processing
        createQueryChain({ data: null, error: null }), // chunk insert
        extractingChain, // status → extracting
        createQueryChain({ data: null, error: null }), // status → completed
      ];
      let adminCallIndex = 0;
      mockAdminFrom.mockImplementation(() => {
        const chain = adminChains[adminCallIndex] || adminChains[adminChains.length - 1];
        adminCallIndex++;
        return chain;
      });

      mockExtractMetadata.mockResolvedValue({ topic: 'test' });

      await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('Hello world'), 'test.txt');

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 100));

      // Verify status transitions
      expect(processingChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processing' })
      );
      expect(extractingChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'extracting' })
      );
    });
  });

  describe('Multi-Format Support', () => {
    it('uploads PDF and calls parseDocument with correct args', async () => {
      const doc = { id: 'doc-pdf', filename: 'report.pdf', status: 'pending' };

      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: doc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, insertChain]);

      mockExtractMetadata.mockResolvedValue({ topic: 'test' });

      const res = await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('fake pdf bytes'), 'report.pdf');

      expect(res.status).toBe(201);

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 100));

      // parseDocument should have been called with buffer, filename, and mimetype
      expect(mockParseDocument).toHaveBeenCalledWith(
        expect.any(Buffer),
        'report.pdf',
        'application/pdf'
      );
    });

    it('parsing failure sets document status to error', async () => {
      const doc = { id: 'doc-fail', filename: 'bad.pdf', status: 'pending' };

      const hashCheckChain = createQueryChain({ data: null, error: null });
      const nameCheckChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: doc, error: null });
      mockUserFromSequence([hashCheckChain, nameCheckChain, insertChain]);

      // Admin calls: processing, then error update
      const errorChain = createQueryChain({ data: null, error: null });
      const adminChains = [
        createQueryChain({ data: null, error: null }), // status → processing
        errorChain, // status → error
      ];
      let adminCallIndex = 0;
      mockAdminFrom.mockImplementation(() => {
        const chain = adminChains[adminCallIndex] || adminChains[adminChains.length - 1];
        adminCallIndex++;
        return chain;
      });

      mockParseDocument.mockRejectedValue(new Error('Docling-serve unavailable'));

      const res = await request(app)
        .post('/api/ingestion/upload')
        .attach('file', Buffer.from('bad pdf'), 'bad.pdf');

      expect(res.status).toBe(201);

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 100));

      // Document should be set to error status
      expect(errorChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error_message: 'Docling-serve unavailable',
        })
      );
    });
  });
});
