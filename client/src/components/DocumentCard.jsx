import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Trash2, FileText, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const statusVariant = {
  pending: 'secondary',
  processing: 'outline',
  completed: 'default',
  error: 'destructive',
  duplicate: 'secondary',
};

export default function DocumentCard({ document, onDeleted }) {
  const handleDelete = async () => {
    const res = await apiFetch(`/ingestion/documents/${document.id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeleted?.(document.id);
    }
  };

  return (
    <Card className="p-4 flex items-center gap-3">
      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{document.filename}</p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant={statusVariant[document.status] || 'secondary'} className="gap-1">
            {document.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
            {document.status}
          </Badge>
          {document.chunk_count > 0 && (
            <span className="text-xs text-muted-foreground">{document.chunk_count} chunks</span>
          )}
          {document.error_message && (
            <span className="text-xs text-destructive truncate">{document.error_message}</span>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </Card>
  );
}
