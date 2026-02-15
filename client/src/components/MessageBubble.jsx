import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3 py-4', isUser ? 'flex-row-reverse' : '')}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(
          'text-xs font-medium',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}>
          {isUser ? 'U' : 'AI'}
        </AvatarFallback>
      </Avatar>
      <div className={cn(
        'rounded-lg px-4 py-2 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap',
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted'
      )}>
        {message.content}
      </div>
    </div>
  );
}
