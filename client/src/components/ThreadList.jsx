import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';

const ThreadList = forwardRef(function ThreadList({ activeThreadId, onSelectThread, onThreadsChange }, ref) {
  const [threads, setThreads] = useState([]);

  const fetchThreads = async () => {
    const res = await apiFetch('/threads');
    if (res.ok) {
      const data = await res.json();
      setThreads(data);
      onThreadsChange?.(data);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: fetchThreads,
  }));

  useEffect(() => {
    fetchThreads();
  }, []);

  const createThread = async () => {
    const res = await apiFetch('/threads', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Chat' }),
    });
    if (res.ok) {
      const thread = await res.json();
      setThreads((prev) => [thread, ...prev]);
      onSelectThread(thread.id);
      onThreadsChange?.([thread, ...threads]);
    }
  };

  const deleteThread = async (e, threadId) => {
    e.stopPropagation();
    const res = await apiFetch(`/threads/${threadId}`, { method: 'DELETE' });
    if (res.ok) {
      const updated = threads.filter((t) => t.id !== threadId);
      setThreads(updated);
      onThreadsChange?.(updated);
      if (activeThreadId === threadId) {
        onSelectThread(null);
      }
    }
  };

  return (
    <div className="w-64 border-r bg-sidebar-background flex flex-col h-full">
      <div className="p-4 flex items-center justify-between">
        <h2 className="font-semibold text-sm">Threads</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={createThread}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              className={cn(
                'flex items-center justify-between rounded-md px-3 py-2 text-sm cursor-pointer group',
                activeThreadId === thread.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
              )}
            >
              <span className="truncate flex-1">{thread.title}</span>
              <button
                onClick={(e) => deleteThread(e, thread.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {threads.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No threads yet
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

export default ThreadList;
