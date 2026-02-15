import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import ThreadList from '@/components/ThreadList';
import ChatMessages from '@/components/ChatMessages';
import ChatInput from '@/components/ChatInput';

export default function ChatPage() {
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const threadListRef = useRef(null);

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      const res = await apiFetch(`/chat/${activeThreadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    };

    loadMessages();
  }, [activeThreadId]);

  const handleSelectThread = useCallback((threadId) => {
    setActiveThreadId(threadId);
  }, []);

  const handleSend = useCallback(async (content) => {
    if (!activeThreadId || streaming) return;

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setStreaming(true);

    // Add placeholder assistant message
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ threadId: activeThreadId, message: content }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'text_delta') {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, content: last.content + data.content };
              return updated;
            });
          } else if (data.type === 'done') {
            // Refresh thread list to show updated title
            if (data.title) {
              threadListRef.current?.refresh();
            }
          } else if (data.type === 'error') {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: `Error: ${data.content}`,
              };
              return updated;
            });
          }
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Error: ${error.message}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [activeThreadId, streaming]);

  return (
    <div className="h-screen flex bg-background text-foreground">
      <ThreadList
        ref={threadListRef}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
      />
      <div className="flex-1 flex flex-col">
        {activeThreadId ? (
          <>
            <ChatMessages messages={messages} />
            <ChatInput onSend={handleSend} disabled={streaming} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Select or create a thread to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
