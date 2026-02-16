import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function ModelSelector() {
  const [models, setModels] = useState([]);
  const [activeModel, setActiveModel] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    fetchModels();
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function fetchModels() {
    try {
      const res = await apiFetch('/models/llm');
      if (res.ok) {
        const data = await res.json();
        setModels(data.models);
        setActiveModel(data.activeModel);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setLoading(false);
    }
  }

  async function selectModel(modelKey) {
    setActiveModel(modelKey);
    setOpen(false);
    try {
      await apiFetch('/models/active', {
        method: 'PUT',
        body: JSON.stringify({ modelId: modelKey }),
      });
    } catch (err) {
      console.error('Failed to set active model:', err);
    }
  }

  // Derive display name for the active model
  const activeDisplay = models.find(m => m.modelKey === activeModel)?.displayName
    || activeModel
    || 'No model';

  if (loading) return null;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-xs font-normal text-muted-foreground hover:text-foreground max-w-48 truncate"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{activeDisplay}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </Button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-64 max-h-80 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {models.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No models found</div>
          )}
          {models.map((model) => (
            <button
              key={model.modelKey}
              className="flex items-center gap-2 w-full rounded-sm px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground text-left"
              onClick={() => selectModel(model.modelKey)}
            >
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${model.isLoaded ? 'bg-green-500' : 'bg-gray-400'}`}
              />
              <span className="flex-1 truncate">{model.displayName || model.modelKey}</span>
              {model.modelKey === activeModel && (
                <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
