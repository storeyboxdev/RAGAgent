import { LMStudioClient } from '@lmstudio/sdk';

// Shared client instance
export const lmstudioClient = new LMStudioClient();

// Constants re-exported for use across modules
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text-v1.5';
export const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10);

// Active LLM model ID - initialized from env, nullable (falls back to whatever's loaded)
let activeLlmModelId = process.env.LLM_MODEL || null;

export function getActiveLlmModelId() {
  return activeLlmModelId;
}

export function setActiveLlmModelId(id) {
  activeLlmModelId = id;
}

/**
 * Get an LLM model handle from LMStudio.
 * If modelId is provided, uses that. Otherwise uses the active model.
 * If no active model is set, uses whatever model is currently loaded.
 */
export async function getLlmModel(modelId) {
  const id = modelId || activeLlmModelId;
  if (id) {
    return await lmstudioClient.llm.model(id);
  }
  // No specific model requested - get whatever is loaded
  return await lmstudioClient.llm.model();
}

/**
 * List all downloaded LLM models.
 */
export async function listDownloadedLlmModels() {
  return await lmstudioClient.system.listDownloadedModels('llm');
}

/**
 * List currently loaded LLM models.
 */
export async function listLoadedLlmModels() {
  return await lmstudioClient.llm.listLoaded();
}

/**
 * List all downloaded embedding models.
 */
export async function listDownloadedEmbeddingModels() {
  return await lmstudioClient.system.listDownloadedModels('embedding');
}

/**
 * List currently loaded embedding models.
 */
export async function listLoadedEmbeddingModels() {
  return await lmstudioClient.embedding.listLoaded();
}
