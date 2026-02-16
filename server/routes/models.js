import { Router } from 'express';
import {
  getActiveLlmModelId,
  setActiveLlmModelId,
  listDownloadedLlmModels,
  listLoadedLlmModels,
  listDownloadedEmbeddingModels,
  listLoadedEmbeddingModels,
} from '../lib/lmstudio.js';

const router = Router();

function formatModel(model, loadedKeys) {
  return {
    modelKey: model.modelKey,
    displayName: model.displayName,
    sizeBytes: model.sizeBytes,
    architecture: model.architecture,
    maxContextLength: model.maxContextLength,
    paramsString: model.paramsString,
    isLoaded: loadedKeys.has(model.modelKey),
  };
}

// GET /api/models/llm — list downloaded LLM models with loaded status
router.get('/llm', async (req, res) => {
  try {
    const [downloaded, loaded] = await Promise.all([
      listDownloadedLlmModels(),
      listLoadedLlmModels(),
    ]);

    const loadedKeys = new Set(loaded.map(m => m.modelKey));
    const models = downloaded.map(m => formatModel(m, loadedKeys));

    res.json({ models, activeModel: getActiveLlmModelId() });
  } catch (error) {
    console.error('Error listing LLM models:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/models/embedding — list downloaded embedding models with loaded status
router.get('/embedding', async (req, res) => {
  try {
    const [downloaded, loaded] = await Promise.all([
      listDownloadedEmbeddingModels(),
      listLoadedEmbeddingModels(),
    ]);

    const loadedKeys = new Set(loaded.map(m => m.modelKey));
    const models = downloaded.map(m => formatModel(m, loadedKeys));

    res.json({ models, activeModel: null });
  } catch (error) {
    console.error('Error listing embedding models:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/models/active — set active LLM model
router.put('/active', async (req, res) => {
  const { modelId } = req.body;

  if (!modelId) {
    return res.status(400).json({ error: 'modelId is required' });
  }

  setActiveLlmModelId(modelId);
  res.json({ activeModel: getActiveLlmModelId() });
});

export default router;
