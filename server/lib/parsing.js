const DOCLING_SERVE_URL = process.env.DOCLING_SERVE_URL || 'http://localhost:5001';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.html', '.htm'];

const DIRECT_TEXT_EXTENSIONS = new Set(['.txt', '.md']);

const DOCLING_EXTENSIONS = new Set(['.pdf', '.docx', '.html', '.htm']);

function getExtension(filename) {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function extractTextFromDoclingResponse(json) {
  // Handle known docling-serve response shapes
  if (typeof json.document?.md_content === 'string') return json.document.md_content;
  if (typeof json.md_content === 'string') return json.md_content;
  if (typeof json.content === 'string') return json.content;
  if (typeof json.text === 'string') return json.text;
  if (typeof json.markdown === 'string') return json.markdown;
  if (typeof json.result === 'string') return json.result;
  throw new Error('Unexpected docling-serve response shape: ' + JSON.stringify(json).slice(0, 200));
}

/**
 * Parse a document buffer into plain text.
 * - .txt/.md: direct UTF-8 decode (no external call)
 * - .pdf/.docx/.html/.htm: sent to docling-serve for conversion
 * - Unknown: fallback to direct text with warning
 */
export async function parseDocument(buffer, filename, mimeType) {
  const ext = getExtension(filename);

  // Direct text path
  if (DIRECT_TEXT_EXTENSIONS.has(ext) || mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return buffer.toString('utf-8');
  }

  // Docling path
  if (DOCLING_EXTENSIONS.has(ext) || mimeType === 'application/pdf' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'text/html') {
    const formData = new FormData();
    formData.append('files', new Blob([buffer]), filename);

    const response = await fetch(`${DOCLING_SERVE_URL}/v1/convert/file`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Docling-serve error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    return extractTextFromDoclingResponse(json);
  }

  // Fallback — unknown type, attempt direct text
  console.warn(`[parsing] Unknown file type (ext=${ext}, mime=${mimeType}), attempting direct text decode`);
  return buffer.toString('utf-8');
}
