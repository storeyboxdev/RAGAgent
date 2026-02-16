import { useState } from 'react';
import FileUpload from '@/components/FileUpload';
import DocumentList from '@/components/DocumentList';

export default function IngestionPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploaded = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">Upload text files to make them searchable in chat.</p>
        </div>
        <FileUpload onUploaded={handleUploaded} />
        <DocumentList refreshKey={refreshKey} />
      </div>
    </div>
  );
}
