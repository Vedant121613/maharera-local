/**
 * Basic client-side sanity checks only — extension/size/emptiness.
 * This does NOT make the file "safe": real validation (SQL parsing,
 * schema checks, sanitization) must happen on the backend. The frontend
 * only prevents obviously wrong uploads before spending a network round trip.
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_FILE_SIZE_MB = 200;

export function validateUploadFile(file: File, allowedExtensions: string[]): FileValidationResult {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;

  if (!allowedExtensions.includes(ext)) {
    return { valid: false, error: `Unsupported file type. Expected: ${allowedExtensions.join(', ')}` };
  }
  if (file.size === 0) {
    return { valid: false, error: 'The selected file is empty.' };
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { valid: false, error: `File exceeds the ${MAX_FILE_SIZE_MB}MB limit.` };
  }
  return { valid: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
