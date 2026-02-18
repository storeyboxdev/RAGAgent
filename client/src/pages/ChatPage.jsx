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
        // Filter to only user/assistant messages for display (skip tool/system messages)
        const displayMessages = data.filter(
          (m) => m.role === 'user' || (m.role === 'assistant' && m.content)
        );
        setMessages(displayMessages);
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

    try {
      const res = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ threadId: activeThreadId, message: content }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasAssistantMessage = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'tool_call') {
            // Add a tool call indicator
            setMessages((prev) => [
              ...prev,
              { type: 'tool_call', name: data.name, arguments: data.arguments },
            ]);
          } else if (data.type === 'tool_result') {
            // Update the last tool call with results (generic merge)
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].type === 'tool_call' && updated[i].name === data.name && !updated[i].completed) {
                  const { type, name, ...resultData } = data;
                  updated[i] = { ...updated[i], ...resultData, completed: true };
                  break;
                }
              }
              return updated;
            });
            // Keep hasAssistantMessage true so subsequent text_deltas
            // append to the same assistant message bubble
          } else if (data.type === 'text_delta') {
            if (!hasAssistantMessage) {
              // Add new assistant message placeholder
              setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
              hasAssistantMessage = true;
            } else {
              setMessages((prev) => {
                const updated = [...prev];
                // Find last assistant message (may not be the last element due to tool_call entries)
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].role === 'assistant') {
                    updated[i] = { ...updated[i], content: updated[i].content + data.content };
                    break;
                  }
                }
                return updated;
              });
            }
          } else if (data.type === 'subagent_text_delta') {
            // Append sub-agent text to the last analyze_document tool call
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].type === 'tool_call' && updated[i].name === 'analyze_document') {
                  updated[i] = {
                    ...updated[i],
                    subAgentText: (updated[i].subAgentText || '') + data.content,
                  };
                  break;
                }
              }
              return updated;
            });
          } else if (data.type === 'subagent_tool_call') {
            // Add nested tool call to the last analyze_document tool call
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].type === 'tool_call' && updated[i].name === 'analyze_document') {
                  const subAgentToolCalls = [...(updated[i].subAgentToolCalls || [])];
                  subAgentToolCalls.push({ name: data.name, arguments: data.arguments });
                  updated[i] = { ...updated[i], subAgentToolCalls };
                  break;
                }
              }
              return updated;
            });
          } else if (data.type === 'subagent_tool_result') {
            // Merge result into the last unresolved subagent tool call
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].type === 'tool_call' && updated[i].name === 'analyze_document') {
                  const subAgentToolCalls = [...(updated[i].subAgentToolCalls || [])];
                  for (let j = subAgentToolCalls.length - 1; j >= 0; j--) {
                    if (subAgentToolCalls[j].name === data.name && !subAgentToolCalls[j].completed) {
                      subAgentToolCalls[j] = { ...subAgentToolCalls[j], ...data, completed: true };
                      break;
                    }
                  }
                  updated[i] = { ...updated[i], subAgentToolCalls };
                  break;
                }
              }
              return updated;
            });
          } else if (data.type === 'done') {
            if (data.title) {
              threadListRef.current?.refresh();
            }
          } else if (data.type === 'error') {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: `Error: ${data.content}` },
            ]);
          }
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${error.message}` },
      ]);
    } finally {
      setStreaming(false);
    }
  }, [activeThreadId, streaming]);

  return (
    <div className="h-full flex bg-background text-foreground">
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
