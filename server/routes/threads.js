import { Router } from 'express';
import { createSupabaseClient } from '../lib/supabase.js';

const router = Router();

// GET /api/threads — list user's threads
router.get('/', async (req, res) => {
  const supabase = createSupabaseClient(req.accessToken);
  const { data, error } = await supabase
    .from('threads')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/threads — create thread
router.post('/', async (req, res) => {
  const supabase = createSupabaseClient(req.accessToken);
  const { data, error } = await supabase
    .from('threads')
    .insert({ user_id: req.user.id, title: req.body.title || 'New Chat' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/threads/:id — update title
router.patch('/:id', async (req, res) => {
  const supabase = createSupabaseClient(req.accessToken);
  const { data, error } = await supabase
    .from('threads')
    .update({ title: req.body.title })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/threads/:id — delete thread
router.delete('/:id', async (req, res) => {
  const supabase = createSupabaseClient(req.accessToken);
  const { error } = await supabase
    .from('threads')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

export default router;
