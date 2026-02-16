import { supabase } from './supabase';

export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = { ...options.headers };

  // Only set Content-Type to JSON if not explicitly overridden (e.g., for FormData)
  if (!options.body || !(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  return response;
}
