/** Shared output-encoding helpers. Use at every HTML/CSV sink. */

export function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  // Neutralize spreadsheet formula injection: values starting with = + - @
  // (or tab/CR) would execute as formulas when the CSV is opened in Excel.
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return text.includes(",") || text.includes('"') || text.includes("\n") || text.startsWith("'")
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function downloadCsv(csvContent: string, fileName: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
