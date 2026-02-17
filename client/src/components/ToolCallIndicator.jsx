import { useState } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';

function SearchModeBadge({ searchMode, reranked }) {
  if (!searchMode) return null;

  const labels = { hybrid: 'Hybrid', vector: 'Vector', keyword: 'Keyword' };
  const label = labels[searchMode] || searchMode;

  return (
    <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}{reranked && ' + Reranked'}
    </span>
  );
}

export default function ToolCallIndicator({ toolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 mx-auto max-w-3xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Search className="h-3 w-3" />
        <span>
          {toolCall.chunks
            ? <>
                Found {toolCall.chunks.length} relevant chunk{toolCall.chunks.length !== 1 ? 's' : ''}
                <SearchModeBadge searchMode={toolCall.search_mode} reranked={toolCall.reranked} />
              </>
            : <>
                Searching documents...
                {toolCall.arguments?.metadata_filter && (
                  <span className="ml-1 text-muted-foreground/70">
                    ({Object.entries(toolCall.arguments.metadata_filter).map(([k, v]) => `${k}: ${v}`).join(', ')})
                  </span>
                )}
              </>}
        </span>
        {toolCall.chunks && (
          expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {expanded && toolCall.chunks && (
        <div className="mt-2 space-y-2 pl-5">
          {toolCall.chunks.map((chunk, i) => (
            <div key={i} className="text-xs bg-muted/50 rounded p-2 border">
              <p className="text-muted-foreground whitespace-pre-wrap">{chunk.content}</p>
              <p className="text-muted-foreground/60 mt-1">
                {toolCall.reranked && chunk.rerank_score != null
                  ? `Relevance: ${(chunk.rerank_score * 100).toFixed(1)}%`
                  : `Similarity: ${(chunk.similarity * 100).toFixed(1)}%`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
