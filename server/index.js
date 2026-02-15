import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Laminar is initialized in env.js (preloaded via --import)
// to ensure it instruments OpenAI before any imports resolve.

import { requireAuth } from './middleware/auth.js';
import threadsRouter from './routes/threads.js';
import chatRouter from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes
app.use('/api/threads', requireAuth, threadsRouter);
app.use('/api/chat', requireAuth, chatRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
