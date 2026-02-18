import { useState } from 'react';
import { Search, Database, Globe, FileText, ChevronDown, ChevronRight } from 'lucide-react';

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

function SearchToolView({ toolCall, expanded, onToggle }) {
  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Search className="h-3 w-3" />
        <span>
          {toolCall.completed
            ? <>
                Found {toolCall.chunks?.length || 0} relevant chunk{toolCall.chunks?.length !== 1 ? 's' : ''}
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
        {toolCall.completed && (
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
    </>
  );
}

function SqlToolView({ toolCall, expanded, onToggle }) {
  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Database className="h-3 w-3" />
        <span>
          {toolCall.error
            ? <span className="text-destructive">Query error: {toolCall.error}</span>
            : toolCall.completed
              ? `Returned ${toolCall.rowCount} row${toolCall.rowCount !== 1 ? 's' : ''}`
              : 'Querying database...'}
        </span>
        {toolCall.completed && (
          expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {expanded && toolCall.completed && (
        <div className="mt-2 pl-5 space-y-2">
          {toolCall.sql && (
            <pre className="text-xs bg-muted/50 rounded p-2 border overflow-x-auto">
              <code>{toolCall.sql}</code>
            </pre>
          )}
          {toolCall.rows && toolCall.rows.length > 0 && (
            <div className="text-xs overflow-x-auto border rounded">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    {Object.keys(toolCall.rows[0]).map((key) => (
                      <th key={key} className="px-2 py-1 text-left font-medium text-muted-foreground">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {toolCall.rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-2 py-1 text-muted-foreground">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function WebSearchToolView({ toolCall, expanded, onToggle }) {
  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Globe className="h-3 w-3" />
        <span>
          {toolCall.completed
            ? `Found ${toolCall.results?.length || 0} web result${toolCall.results?.length !== 1 ? 's' : ''}`
            : 'Searching the web...'}
        </span>
        {toolCall.completed && (
          expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {expanded && toolCall.results && (
        <div className="mt-2 space-y-2 pl-5">
          {toolCall.results.map((result, i) => (
            <div key={i} className="text-xs bg-muted/50 rounded p-2 border">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                {result.title}
              </a>
              <p className="text-muted-foreground mt-1">{result.snippet}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SubAgentView({ toolCall, expanded, onToggle }) {
  const hasError = toolCall.error;
  const isComplete = toolCall.completed;

  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <FileText className="h-3 w-3" />
        <span>
          {hasError
            ? <span className="text-destructive">Analysis error: {toolCall.error}</span>
            : isComplete
              ? 'Analysis complete'
              : 'Analyzing document...'}
        </span>
        {(isComplete || hasError) && (
          expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 pl-5 space-y-2">
          {toolCall.subAgentToolCalls && toolCall.subAgentToolCalls.length > 0 && (
            <div className="space-y-1">
              {toolCall.subAgentToolCalls.map((sub, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Search className="h-3 w-3" />
                  <span>
                    &quot;{sub.arguments?.query}&quot;
                    {sub.completed && ` — ${sub.count || sub.chunks?.length || 0} result${(sub.count || sub.chunks?.length || 0) !== 1 ? 's' : ''}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {toolCall.subAgentText && (
            <div className="text-xs bg-muted/50 rounded p-2 border text-muted-foreground whitespace-pre-wrap">
              {toolCall.subAgentText}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function ToolCallIndicator({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded(!expanded);

  const viewProps = { toolCall, expanded, onToggle: toggle };

  return (
    <div className="my-2 mx-auto max-w-3xl">
      {toolCall.name === 'analyze_document' ? (
        <SubAgentView {...viewProps} />
      ) : toolCall.name === 'query_database' ? (
        <SqlToolView {...viewProps} />
      ) : toolCall.name === 'web_search' ? (
        <WebSearchToolView {...viewProps} />
      ) : (
        <SearchToolView {...viewProps} />
      )}
    </div>
  );
}
