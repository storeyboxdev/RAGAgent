import { lmstudioClient, EMBEDDING_MODEL } from './lmstudio.js';

let embeddingModel = null;

async function getModel() {
  if (!embeddingModel) {
    embeddingModel = await lmstudioClient.embedding.model(EMBEDDING_MODEL);
  }
  return embeddingModel;
}

/**
 * Generate embeddings for multiple texts.
 * Returns an array of float arrays in the same order as input.
 */
export async function generateEmbeddings(texts) {
  const model = await getModel();
  const results = [];
  for (const text of texts) {
    const { embedding } = await model.embed(text);
    results.push(embedding);
  }
  return results;
}

/**
 * Generate a single embedding vector.
 */
export async function generateEmbedding(text) {
  const model = await getModel();
  const { embedding } = await model.embed(text);
  return embedding;
}
