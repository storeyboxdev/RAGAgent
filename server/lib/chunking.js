/**
 * Split text into overlapping chunks.
 * Strategy: split on paragraph boundaries (\n\n), fall back to sentence boundaries, then character count.
 */
export function chunkText(text, { chunkSize = 512, chunkOverlap = 50 } = {}) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  const chunks = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, finalize current chunk
    if (currentChunk && (currentChunk.length + paragraph.length + 2) > chunkSize) {
      chunks.push({ content: currentChunk.trim(), chunkIndex: chunkIndex++ });

      // Start next chunk with overlap from end of previous
      if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
        currentChunk = currentChunk.slice(-chunkOverlap) + '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
    } else if (!currentChunk && paragraph.length > chunkSize) {
      // Single paragraph exceeds chunk size — split by sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+\s*/g) || [paragraph];
      let sentenceChunk = '';

      for (const sentence of sentences) {
        if (sentenceChunk && (sentenceChunk.length + sentence.length) > chunkSize) {
          chunks.push({ content: sentenceChunk.trim(), chunkIndex: chunkIndex++ });
          if (chunkOverlap > 0 && sentenceChunk.length > chunkOverlap) {
            sentenceChunk = sentenceChunk.slice(-chunkOverlap) + sentence;
          } else {
            sentenceChunk = sentence;
          }
        } else {
          sentenceChunk += sentence;
        }
      }
      currentChunk = sentenceChunk;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({ content: currentChunk.trim(), chunkIndex: chunkIndex++ });
  }

  return chunks;
}
