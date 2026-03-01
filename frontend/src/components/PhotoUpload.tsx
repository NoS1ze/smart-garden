import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/jpeg',
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')); };
    img.src = objectUrl;
  });
}

interface Props {
  currentUrl: string | null;
  onUrlChange: (url: string | null) => void;
}

export function PhotoUpload({ currentUrl, onUrlChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    try {
      // Compress image to JPEG, resizing if needed
      let blob: Blob;
      try {
        blob = await compressImage(file);
      } catch {
        // Fallback to original file if compression fails
        blob = file;
      }

      if (blob.size > MAX_UPLOAD_SIZE) {
        throw new Error(`Photo too large (${(blob.size / 1024 / 1024).toFixed(1)}MB). Try a smaller image.`);
      }

      const uid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const path = `${uid}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(path, blob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('plant-photos')
        .getPublicUrl(path);

      URL.revokeObjectURL(localUrl);
      setPreview(data.publicUrl);
      onUrlChange(data.publicUrl);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setPreview(currentUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUrlChange(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="photo-upload">
      {preview && (
        <img
          src={preview}
          alt="Plant photo"
          style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}
        />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <label className="btn-small btn-secondary" style={{ cursor: 'pointer' }}>
          {uploading ? 'Uploading...' : preview ? 'Change Photo' : 'Upload Photo'}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
        {preview && (
          <button type="button" className="btn-small delete-btn" onClick={handleRemove}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="status error" style={{ fontSize: '0.85rem', marginTop: 4 }}>{error}</p>}
    </div>
  );
}
