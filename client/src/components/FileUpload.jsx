import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

export default function FileUpload({ onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    const file = files[0];
    if (!file) return;

    const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.html', '.htm'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      alert(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch('/ingestion/upload', {
        method: 'POST',
        headers: {}, // Let browser set multipart boundary
        body: formData,
      });

      if (res.ok) {
        const doc = await res.json();
        if (doc.duplicate) {
          alert('File already uploaded (identical content).');
        }
        onUploaded?.(doc);
      } else {
        const err = await res.json();
        alert(`Upload failed: ${err.error}`);
      }
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
      )}
    >
      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {uploading ? 'Uploading...' : 'Drop a file here or click to upload (PDF, DOCX, TXT, MD, HTML)'}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf,.docx,.html,.htm"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
