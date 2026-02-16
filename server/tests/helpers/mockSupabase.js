import { vi } from 'vitest';

/**
 * Create a chainable query mock that resolves with `result`.
 * Supports .select(), .insert(), .update(), .delete(), .eq(), .in(), .order(), .single(), .maybeSingle(), and bare await.
 */
export function createQueryChain(result) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve) => resolve(result),
  };
  return chain;
}

/**
 * Create a mock Supabase client with `.from()` and `.storage.from()`.
 */
export function createMockSupabaseClient() {
  return {
    from: vi.fn(),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        download: vi.fn().mockResolvedValue({ data: { text: vi.fn().mockResolvedValue('') }, error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
}
