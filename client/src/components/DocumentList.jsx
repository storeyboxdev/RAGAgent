import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import DocumentCard from './DocumentCard';

export default function DocumentList({ refreshKey }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const pollRef = useRef(null);

  const fetchDocuments = async () => {
    const res = await apiFetch('/ingestion/documents');
    if (res.ok) {
      const data = await res.json();
      setDocuments(data);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [refreshKey]);

  // Poll while any document is pending/processing
  useEffect(() => {
    const hasInProgress = documents.some(
      (d) => d.status === 'pending' || d.status === 'processing'
    );

    if (hasInProgress && !pollRef.current) {
      pollRef.current = setInterval(fetchDocuments, 2000);
    } else if (!hasInProgress && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [documents]);

  // Subscribe to Realtime updates on the documents table
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('documents-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setDocuments((prev) =>
            prev.map((d) => (d.id === payload.new.id ? { ...d, ...payload.new } : d))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'documents',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setDocuments((prev) => {
            if (prev.find((d) => d.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleDeleted = (id) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No documents uploaded yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} onDeleted={handleDeleted} />
      ))}
    </div>
  );
}
