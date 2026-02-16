import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { requireAuth } from './middleware/auth.js';
import threadsRouter from './routes/threads.js';
import chatRouter from './routes/chat.js';
import ingestionRouter from './routes/ingestion.js';
import modelsRouter from './routes/models.js';

const app = express();

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
app.use('/api/ingestion', requireAuth, ingestionRouter);
app.use('/api/models', requireAuth, modelsRouter);

export default app;
