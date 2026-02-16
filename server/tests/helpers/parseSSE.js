/**
 * Parse SSE response text into an array of parsed event objects.
 */
export function parseSSEEvents(text) {
  return text
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => {
      const json = block.replace('data: ', '');
      return JSON.parse(json);
    });
}
