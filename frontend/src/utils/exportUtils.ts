import * as XLSX from 'xlsx';

// These helpers generate the file client-side ONLY because there is no
// backend yet (see src/api/*Api.ts). Once the export endpoints exist,
// these should be replaced with a redirect/download of the backend's
// generated file — components should not need to change, only the
// exportX() api functions.

export function downloadAsExcel<T extends object>(rows: T[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, filename);
}

export function downloadAsCsv<T extends object>(rows: T[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-IN');
}
