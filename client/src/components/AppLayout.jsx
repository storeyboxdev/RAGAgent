import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageSquare, FileText, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ModelSelector from './ModelSelector';

export default function AppLayout({ view, onViewChange, children }) {
  const { signOut, user } = useAuth();

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="h-12 border-b flex items-center justify-between px-4 shrink-0">
        <nav className="flex gap-1">
          <Button
            variant={view === 'chat' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('chat')}
            className={cn('gap-2')}
          >
            <MessageSquare className="h-4 w-4" />
            Chat
          </Button>
          <Button
            variant={view === 'documents' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('documents')}
            className={cn('gap-2')}
          >
            <FileText className="h-4 w-4" />
            Documents
          </Button>
        </nav>
        <div className="flex items-center gap-3">
          <ModelSelector />
          <span className="text-xs text-muted-foreground">{user?.email}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
