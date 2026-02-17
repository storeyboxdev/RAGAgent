import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}));

const { supabaseAdmin } = await import('../../lib/supabase.js');
const { validateAndRewriteQuery, getSchemaDescription, executeQuery } = await import('../../lib/sql-query.js');

const TEST_USER_ID = 'user-123-abc';

describe('sql-query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateAndRewriteQuery', () => {
    it('accepts valid SELECT statements', () => {
      const result = validateAndRewriteQuery('SELECT * FROM documents', TEST_USER_ID);
      expect(result.valid).toBe(true);
      expect(result.rewrittenSql).toBeDefined();
    });

    it('rejects INSERT statements', () => {
      const result = validateAndRewriteQuery("INSERT INTO documents VALUES ('test')", TEST_USER_ID);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/SELECT/i);
    });

    it('rejects UPDATE statements', () => {
      const result = validateAndRewriteQuery("UPDATE documents SET filename = 'x'", TEST_USER_ID);
      expect(result.valid).toBe(false);
    });

    it('rejects DELETE statements', () => {
      const result = validateAndRewriteQuery('DELETE FROM documents', TEST_USER_ID);
      expect(result.valid).toBe(false);
    });

    it('rejects DROP statements', () => {
      const result = validateAndRewriteQuery('DROP TABLE documents', TEST_USER_ID);
      expect(result.valid).toBe(false);
    });

    it('rejects SELECT with dangerous keywords embedded', () => {
      const result = validateAndRewriteQuery('SELECT * FROM documents; DROP TABLE documents', TEST_USER_ID);
      expect(result.valid).toBe(false);
    });

    it('rejects disallowed tables (auth.users)', () => {
      const result = validateAndRewriteQuery('SELECT * FROM auth.users', TEST_USER_ID);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/not allowed/);
    });

    it('rejects disallowed tables (threads)', () => {
      const result = validateAndRewriteQuery('SELECT * FROM threads', TEST_USER_ID);
      expect(result.valid).toBe(false);
    });

    it('rejects disallowed tables (storage.objects)', () => {
      const result = validateAndRewriteQuery('SELECT * FROM storage.objects', TEST_USER_ID);
      expect(result.valid).toBe(false);
    });

    it('allows documents table', () => {
      const result = validateAndRewriteQuery('SELECT filename FROM documents', TEST_USER_ID);
      expect(result.valid).toBe(true);
    });

    it('allows document_chunks table', () => {
      const result = validateAndRewriteQuery('SELECT content FROM document_chunks', TEST_USER_ID);
      expect(result.valid).toBe(true);
    });

    it('allows JOIN of both tables', () => {
      const result = validateAndRewriteQuery(
        'SELECT d.filename, dc.content FROM documents d JOIN document_chunks dc ON dc.document_id = d.id',
        TEST_USER_ID
      );
      expect(result.valid).toBe(true);
    });

    it('injects user_id filter when missing', () => {
      const result = validateAndRewriteQuery('SELECT * FROM documents', TEST_USER_ID);
      expect(result.valid).toBe(true);
      expect(result.rewrittenSql).toContain(`user_id = '${TEST_USER_ID}'`);
    });

    it('preserves user_id filter when already present', () => {
      const sql = `SELECT * FROM documents WHERE user_id = '${TEST_USER_ID}'`;
      const result = validateAndRewriteQuery(sql, TEST_USER_ID);
      expect(result.valid).toBe(true);
      // Should not double-inject
      const matches = result.rewrittenSql.match(/user_id/g);
      expect(matches.length).toBe(1);
    });

    it('strips trailing semicolons', () => {
      const result = validateAndRewriteQuery('SELECT * FROM documents;', TEST_USER_ID);
      expect(result.valid).toBe(true);
      expect(result.rewrittenSql).not.toContain(';');
    });

    it('handles case-insensitive SELECT', () => {
      const result = validateAndRewriteQuery('select * from documents', TEST_USER_ID);
      expect(result.valid).toBe(true);
    });

    it('injects user_id before GROUP BY clause', () => {
      const result = validateAndRewriteQuery('SELECT status, COUNT(*) FROM documents GROUP BY status', TEST_USER_ID);
      expect(result.valid).toBe(true);
      expect(result.rewrittenSql).toMatch(/user_id.*GROUP BY/i);
    });
  });

  describe('getSchemaDescription', () => {
    it('returns schema string with documents and document_chunks tables', () => {
      const schema = getSchemaDescription();
      expect(schema).toContain('documents');
      expect(schema).toContain('document_chunks');
      expect(schema).toContain('filename');
      expect(schema).toContain('content');
      // Schema should not list user_id as a column, but may mention it in instructions
      expect(schema).not.toMatch(/- user_id/);
    });
  });

  describe('executeQuery', () => {
    it('calls RPC with rewritten SQL', async () => {
      supabaseAdmin.rpc.mockResolvedValue({
        data: [{ filename: 'test.pdf' }],
        error: null,
      });

      const result = await executeQuery('SELECT filename FROM documents', TEST_USER_ID);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('execute_readonly_query', {
        query_text: expect.stringContaining('user_id'),
        query_user_id: TEST_USER_ID,
      });
      expect(result.rows).toEqual([{ filename: 'test.pdf' }]);
      expect(result.rowCount).toBe(1);
    });

    it('throws on invalid SQL', async () => {
      await expect(executeQuery('DROP TABLE documents', TEST_USER_ID))
        .rejects.toThrow();
    });

    it('throws on RPC error', async () => {
      supabaseAdmin.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC failed' },
      });

      await expect(executeQuery('SELECT * FROM documents', TEST_USER_ID))
        .rejects.toThrow('RPC failed');
    });
  });
});
