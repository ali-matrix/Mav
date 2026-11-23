import { cachedFetch } from "@/lib/client";

export type ReportCell = string | number;
export type ReportSection = {
  title: string;
  headers: string[];
  rows: ReportCell[][];
};

export function formatReportDateTime(value: string | null): string {
  if (!value) return "";
  const normalized = value.includes(" ") ? `${value.replace(" ", "T")}Z` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function escapeHtml(value: ReportCell): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function downloadHtmlReport(title: string, sections: ReportSection[], filename: string) {
  const content = sections.map((section) => {
    const body = section.rows.length
      ? section.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${section.headers.length}">No records</td></tr>`;
    return `<section><h2>${escapeHtml(section.title)}</h2><div class="table-wrap"><table><thead><tr>${section.headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></section>`;
  }).join("");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; color: #17212b; background: #f3f6f9; font: 14px/1.5 Arial, sans-serif; }
    main { max-width: 1200px; margin: 0 auto; padding: 32px; background: #fff; border: 1px solid #dce3e9; border-radius: 12px; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
    h1 { margin: 0; font-size: 26px; }
    header p { margin: 6px 0 0; color: #526170; }
    .print { flex: none; padding: 9px 14px; border: 1px solid #9aabb8; border-radius: 7px; background: #fff; color: #17212b; font: inherit; cursor: pointer; }
    section { margin-top: 26px; }
    h2 { margin: 0 0 10px; font-size: 17px; }
    .table-wrap { width: 100%; overflow-x: auto; overscroll-behavior-x: contain; }
    table { width: max-content; min-width: 100%; border-collapse: collapse; table-layout: auto; font-size: 13px; }
    th, td { min-width: 105px; max-width: 320px; padding: 9px 10px; border: 1px solid #dce3e9; text-align: left; vertical-align: top; overflow-wrap: break-word; word-break: normal; }
    th { background: #edf2f6; font-weight: 600; }
    tbody tr:nth-child(even) { background: #f7f9fb; }
    .empty { color: #687786; text-align: center; }
    @media (max-width: 700px) { body { padding: 0; } main { padding: 20px; border: 0; } header { flex-direction: column; } .table-wrap { margin-right: -20px; padding-right: 20px; width: calc(100% + 20px); } }
    @media print {
      @page { size: landscape; margin: 12mm; }
      body { padding: 0; background: #fff; }
      main { max-width: none; padding: 0; border: 0; border-radius: 0; }
      .print { display: none; }
      .table-wrap { overflow: visible; }
      table { width: 100%; min-width: 0; font-size: 9px; }
      th, td { min-width: 0; max-width: none; padding: 5px; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(new Date().toLocaleString("en-GB"))}</p></div>
      <button class="print" onclick="window.print()">Print / Save as PDF</button>
    </header>
    ${content}
  </main>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeFilename = filename.replace(/[^A-Za-z0-9_-]/g, "-");
  link.href = url;
  link.download = `${safeFilename}-${new Date().toISOString().slice(0, 10)}.html`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function fetchAllPages<T>(endpoint: string, params: Record<string, string> = {}): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let pages = 1;
  do {
    const query = new URLSearchParams({ ...params, page: String(page), pageSize: "100" });
    const response = await cachedFetch(`${endpoint}?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Couldn't load ${endpoint} for export.`);
    const result = await response.json() as { rows: T[]; pages: number };
    if (!Array.isArray(result.rows) || !Number.isInteger(result.pages) || result.pages < 1) {
      throw new Error(`The ${endpoint} export response was invalid.`);
    }
    rows.push(...result.rows);
    pages = result.pages;
    page += 1;
  } while (page <= pages);
  return rows;
}
