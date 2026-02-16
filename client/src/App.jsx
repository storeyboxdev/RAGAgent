import { useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AuthPage from '@/pages/AuthPage';
import ChatPage from '@/pages/ChatPage';
import IngestionPage from '@/pages/IngestionPage';
import AppLayout from '@/components/AppLayout';

function AppContent() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('chat');

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <AppLayout view={view} onViewChange={setView}>
      {view === 'chat' && <ChatPage />}
      {view === 'documents' && <IngestionPage />}
    </AppLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App
