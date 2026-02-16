import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import MessageBubble from './MessageBubble';
import ToolCallIndicator from './ToolCallIndicator';

export default function ChatMessages({ messages }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Send a message to start the conversation</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="max-w-3xl mx-auto py-4">
        {messages.map((msg, i) =>
          msg.type === 'tool_call' ? (
            <ToolCallIndicator key={`tool-${i}`} toolCall={msg} />
          ) : (
            <MessageBubble key={i} message={msg} />
          )
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
