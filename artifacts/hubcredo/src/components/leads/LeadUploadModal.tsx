import { useState, useRef, useCallback } from "react";
import { Upload, X, FileSpreadsheet, ChevronDown, Loader2, CheckCircle2, AlertCircle, Eye, Trash2, Plus, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

interface ParsedLead {
  first_name?: string;
  last_name?: string;
  email?: string;
  linkedin_url?: string;
  job_title?: string;
  company_name?: string;
  company_domain?: string;
  company_size?: string;
  industry?: string;
  hq_country?: string;
  hq_city?: string;
  seniority?: string;
  department?: string;
  custom_fields?: Record<string, string>;
  [key: string]: string | Record<string, string> | undefined;
}

interface LeadUploadModalProps {
  onClose: () => void;
  onSuccess: (listId: string, listLabel: string, count: number) => void;
}

// Standard field aliases for auto-mapping
const FIELD_MAP: Record<string, string[]> = {
  first_name:     ["first_name", "firstname", "first name", "given name", "fname", "contact name", "name"],
  last_name:      ["last_name", "lastname", "last name", "surname", "family name", "lname"],
  email:          ["email", "email address", "e-mail", "emailaddress", "work email"],
  linkedin_url:   ["linkedin_url", "linkedin", "linkedin url", "linkedin profile", "profile url"],
  job_title:      ["job_title", "title", "job title", "position", "role", "jobtitle"],
  company_name:   ["company_name", "company", "company name", "organization", "employer"],
  company_domain: ["company_domain", "domain", "website", "company website", "company domain", "website/company url"],
  company_size:   ["company_size", "company size", "employees", "headcount", "employee count"],
  industry:       ["industry", "sector", "vertical"],
  hq_country:     ["hq_country", "country", "location country", "headquarters country"],
  hq_city:        ["hq_city", "city", "location city", "headquarters city"],
  seniority:      ["seniority", "seniority level", "level"],
  department:     ["department", "function", "team"],
};

const FIELD_LABELS: Record<string, string> = {
  first_name:     "First Name",
  last_name:      "Last Name",
  email:          "Email",
  linkedin_url:   "LinkedIn URL",
  job_title:      "Job Title",
  company_name:   "Company",
  company_domain: "Company Domain",
  company_size:   "Company Size",
  industry:       "Industry",
  hq_country:     "Country",
  hq_city:        "City",
  seniority:      "Seniority",
  department:     "Department",
};

/** Convert any string to camelCase for use as a template variable */
function toCamelCase(str: string): string {
  return str
    .trim()
    .toLowerCase() // normalise first so ALL-CAPS words become lowercase before camelCasing
    .replace(/[^a-z0-9]+(.)?/g, (_, ch) => (ch ? ch.toUpperCase() : ""))
    .replace(/^[^a-zA-Z]/, "_"); // ensure starts with letter or _
}

/**
 * Sanitize a variable key to only contain word characters (\w+).
 * Matches the server-side validation in the upload route.
 */
function sanitizeVarKey(raw: string): string {
  // Strip any character that isn't a word char; collapse runs of _ or digits at start
  return raw.trim().replace(/[^\w]/g, "").replace(/^[0-9_]+/, "") || "";
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim()) lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length === 0) return { headers: [], rows: [] };

  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let cell = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  const headers = splitRow(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });

  return { headers, rows };
}

function autoMapColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    for (const alias of aliases) {
      const idx = lowerHeaders.indexOf(alias.toLowerCase());
      if (idx !== -1) { mapping[field] = headers[idx]; break; }
    }
  }
  return mapping;
}

export function LeadUploadModal({ onClose, onSuccess }: LeadUploadModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [listName, setListName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; list_label: string; list_id: string } | null>(null);
  const [previewPage, setPreviewPage] = useState(0);

  // Custom field state: csvHeader → variable name used in {{varName}} templates
  const [customFieldKeys, setCustomFieldKeys] = useState<Record<string, string>>({});
  // csvHeaders to exclude from custom fields
  const [excludedCustomFields, setExcludedCustomFields] = useState<Set<string>>(new Set());

  // Derive which headers are currently mapped to standard fields
  const mappedHeaderSet = new Set(Object.values(columnMap).filter(Boolean));
  const unmappedHeaders = headers.filter((h) => !mappedHeaderSet.has(h));

  const toggleExclude = (header: string) => {
    setExcludedCustomFields((prev) => {
      const next = new Set(prev);
      if (next.has(header)) next.delete(header);
      else next.add(header);
      return next;
    });
  };

  const parseFile = useCallback(async (file: File) => {
    setFileName(file.name);

    const initCustomFields = (h: string[]) => {
      const cfKeys: Record<string, string> = {};
      h.forEach((hdr) => { cfKeys[hdr] = toCamelCase(hdr); });
      setCustomFieldKeys(cfKeys);
      setExcludedCustomFields(new Set()); // reset exclusions
    };

    if (file.name.endsWith(".csv") || file.type === "text/csv") {
      const text = await file.text();
      const { headers: h, rows } = parseCSV(text);
      if (h.length === 0) { toast({ title: "Empty file", description: "No data found in the CSV.", variant: "destructive" }); return; }
      const mapped = autoMapColumns(h);
      setHeaders(h);
      setRawRows(rows);
      setColumnMap(mapped);
      setListName(file.name.replace(/\.[^.]+$/, ""));
      initCustomFields(h);
      setStep("map");
    } else if (file.name.match(/\.xlsx?$/) || file.type.includes("spreadsheet") || file.type.includes("excel")) {
      try {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        if (jsonData.length === 0) { toast({ title: "Empty file", description: "No data found in the Excel file.", variant: "destructive" }); return; }
        const h = Object.keys(jsonData[0]);
        const rows = jsonData.map((row) => {
          const r: Record<string, string> = {};
          h.forEach((k) => { r[k] = String(row[k] ?? ""); });
          return r;
        });
        const mapped = autoMapColumns(h);
        setHeaders(h);
        setRawRows(rows);
        setColumnMap(mapped);
        setListName(file.name.replace(/\.[^.]+$/, ""));
        initCustomFields(h);
        setStep("map");
      } catch {
        toast({ title: "Excel parse error", description: "Could not read the Excel file. Try saving as CSV.", variant: "destructive" });
      }
    } else {
      toast({ title: "Unsupported file", description: "Please upload a CSV (.csv) or Excel (.xlsx, .xls) file.", variant: "destructive" });
    }
  }, [toast]);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  /** Returns duplicate variable keys among included custom fields (for validation UI) */
  const duplicateCustomKeys = (() => {
    const seen = new Map<string, number>();
    for (const header of unmappedHeaders) {
      if (excludedCustomFields.has(header)) continue;
      const varKey = sanitizeVarKey(customFieldKeys[header] || toCamelCase(header));
      if (!varKey) continue;
      seen.set(varKey, (seen.get(varKey) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  })();

  function getMappedLeads(): ParsedLead[] {
    return rawRows.map((row) => {
      const lead: ParsedLead = {};
      // Standard fields
      for (const [field, col] of Object.entries(columnMap)) {
        if (col && row[col] !== undefined) lead[field] = row[col] || undefined;
      }
      // Custom fields — skip duplicates (last writer wins would silently drop data)
      const cf: Record<string, string> = {};
      const usedKeys = new Set<string>();
      for (const header of unmappedHeaders) {
        if (excludedCustomFields.has(header)) continue;
        const varKey = sanitizeVarKey(customFieldKeys[header] || toCamelCase(header));
        if (!varKey || usedKeys.has(varKey)) continue; // skip blank/duplicate keys
        usedKeys.add(varKey);
        const val = row[header];
        if (val && val.trim()) cf[varKey] = val.trim();
      }
      if (Object.keys(cf).length > 0) lead.custom_fields = cf;
      return lead;
    }).filter((l) => l.email || l.linkedin_url || l.first_name);
  }

  async function handleUpload() {
    const leads = getMappedLeads();
    if (leads.length === 0) {
      toast({ title: "No valid leads", description: "Make sure at least First Name, Email, or LinkedIn URL is mapped.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/leads/upload-manual`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ list_name: listName || fileName, leads }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(data);
      setStep("done");
      onSuccess(data.list_id, data.list_label, data.inserted);
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "An error occurred.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const previewLeads = getMappedLeads();
  const PAGE_SIZE = 5;
  const pageLeads = previewLeads.slice(previewPage * PAGE_SIZE, (previewPage + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(previewLeads.length / PAGE_SIZE);

  const includedCustomCount = unmappedHeaders.filter((h) => !excludedCustomFields.has(h)).length;

  const inputClass = "w-full px-3 py-2 bg-white border border-[rgba(107,78,255,.15)] rounded-lg text-sm text-[#1E1B4B] focus:outline-none focus:border-[#6B4EFF] transition-colors";

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(107,78,255,0.1)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#F5F3FF] border border-[rgba(107,78,255,0.2)] flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-[#6B4EFF]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1E1B4B]">Upload Leads</p>
                <p className="text-xs text-[#9CA3AF]">CSV or Excel file</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F5F3FF] text-[#9CA3AF] hover:text-[#6B4EFF] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-[rgba(107,78,255,0.08)]">
            {["upload", "map", "preview", "done"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s ? "bg-[#6B4EFF] text-white" :
                  ["upload","map","preview","done"].indexOf(step) > i ? "bg-emerald-500 text-white" :
                  "bg-[#F5F3FF] text-[#9CA3AF]"
                }`}>{["upload","map","preview","done"].indexOf(step) > i ? "✓" : i + 1}</div>
                <span className={`text-xs font-medium ${step === s ? "text-[#6B4EFF]" : "text-[#9CA3AF]"}`}>
                  {s === "upload" ? "File" : s === "map" ? "Map Columns" : s === "preview" ? "Preview" : "Done"}
                </span>
                {i < 3 && <div className="w-8 h-px bg-[#E5E7EB]" />}
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Step 1: Upload */}
            {step === "upload" && (
              <div className="space-y-4">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                    dragging ? "border-[#6B4EFF] bg-[#F5F3FF]" : "border-[rgba(107,78,255,0.2)] hover:border-[#6B4EFF] hover:bg-[#FAFAFE]"
                  }`}
                >
                  <Upload className="w-10 h-10 text-[#C4B5FD] mx-auto mb-3" />
                  <p className="text-sm font-semibold text-[#1E1B4B] mb-1">Drop your file here or click to browse</p>
                  <p className="text-xs text-[#9CA3AF]">Supports CSV (.csv) and Excel (.xlsx, .xls)</p>
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
                </div>

                <div className="bg-[#F8F7FF] border border-[rgba(107,78,255,0.12)] rounded-xl p-4">
                  <p className="text-xs font-semibold text-[#1E1B4B] mb-2">Standard fields (auto-detected)</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {["First Name", "Last Name", "Email", "LinkedIn URL", "Job Title", "Company", "Industry", "Country"].map((col) => (
                      <span key={col} className="text-xs px-2 py-0.5 bg-white border border-[rgba(107,78,255,0.15)] rounded-md text-[#6B7280] font-mono">{col}</span>
                    ))}
                  </div>
                  <p className="text-xs text-[#9CA3AF]">
                    Any other columns become <span className="font-semibold text-[#6B4EFF]">custom fields</span> — usable as{" "}
                    <code className="font-mono bg-[#EDE9FF] px-1 rounded">{"{{varName}}"}</code> in email templates.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Map columns */}
            {step === "map" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-700 truncate">{fileName}</p>
                    <p className="text-xs text-emerald-600">{rawRows.length} rows detected</p>
                  </div>
                  <button onClick={() => { setStep("upload"); setHeaders([]); setRawRows([]); }} className="text-emerald-600 hover:text-emerald-800">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1E1B4B] mb-1.5">List name</label>
                  <input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="My Lead List" className={inputClass} />
                </div>

                {/* Standard fields */}
                <div>
                  <p className="text-sm font-medium text-[#1E1B4B] mb-3">Standard fields</p>
                  <div className="space-y-2">
                    {Object.entries(FIELD_LABELS).map(([field, label]) => (
                      <div key={field} className="flex items-center gap-3">
                        <div className="w-32 shrink-0">
                          <span className="text-xs font-medium text-[#1E1B4B]">{label}</span>
                          {(field === "email" || field === "first_name") && (
                            <span className="text-[10px] text-[#6B4EFF] ml-1">rec.</span>
                          )}
                        </div>
                        <div className="relative flex-1">
                          <select
                            value={columnMap[field] ?? ""}
                            onChange={(e) => setColumnMap((prev) => ({ ...prev, [field]: e.target.value }))}
                            className="w-full appearance-none px-3 py-1.5 bg-white border border-[rgba(107,78,255,.15)] rounded-lg text-sm text-[#1E1B4B] focus:outline-none focus:border-[#6B4EFF] pr-7"
                          >
                            <option value="">— not mapped —</option>
                            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                        </div>
                        {columnMap[field] && (
                          <span className="text-xs text-[#9CA3AF] w-24 truncate shrink-0">{rawRows[0]?.[columnMap[field]] || "—"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom fields section */}
                {unmappedHeaders.length > 0 && (
                  <div className="pt-4 border-t border-[rgba(107,78,255,0.1)]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-[#1E1B4B]">Custom fields</p>
                      {includedCustomCount > 0 && (
                        <span className="text-xs bg-[#EDE9FF] text-[#6B4EFF] px-2 py-0.5 rounded-full font-medium">
                          {includedCustomCount} included
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#9CA3AF] mb-3">
                      Columns not mapped above. Use{" "}
                      <code className="font-mono bg-[#EDE9FF] text-[#6B4EFF] px-1 rounded">{"{{varName}}"}</code>{" "}
                      in email templates to personalise with these values.
                    </p>
                    <div className="space-y-2">
                      {unmappedHeaders.map((header) => {
                        const excluded = excludedCustomFields.has(header);
                        const varKey = (customFieldKeys[header] ?? toCamelCase(header));
                        const sampleVal = rawRows[0]?.[header] || "—";
                        return (
                          <div key={header} className={`flex items-center gap-2 rounded-lg p-2 transition-colors ${excluded ? "opacity-40" : "bg-[#F8F7FF] border border-[rgba(107,78,255,0.08)]"}`}>
                            {/* Toggle button */}
                            <button
                              onClick={() => toggleExclude(header)}
                              title={excluded ? "Include this column" : "Exclude this column"}
                              className={`w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors ${
                                excluded
                                  ? "bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#E5E7EB]"
                                  : "bg-[#6B4EFF] text-white hover:bg-[#5B3FE0]"
                              }`}
                            >
                              {excluded ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            </button>

                            {/* CSV column name */}
                            <div className="w-32 shrink-0">
                              <span className="text-xs text-[#6B7280] truncate block" title={header}>{header}</span>
                            </div>

                            {/* Editable variable key */}
                            <div className="flex-1">
                              <input
                                disabled={excluded}
                                value={varKey}
                                onChange={(e) => {
                                  // Allow typing freely; sanitization shown as preview
                                  setCustomFieldKeys((prev) => ({ ...prev, [header]: e.target.value }));
                                }}
                                onBlur={(e) => {
                                  // On blur, snap to valid key
                                  const clean = sanitizeVarKey(e.target.value) || toCamelCase(header);
                                  setCustomFieldKeys((prev) => ({ ...prev, [header]: clean }));
                                }}
                                placeholder="variableName"
                                className={`w-full px-2 py-1 bg-white border rounded-md text-xs text-[#1E1B4B] font-mono focus:outline-none disabled:opacity-40 ${
                                  !excluded && duplicateCustomKeys.has(sanitizeVarKey(varKey))
                                    ? "border-amber-400 focus:border-amber-500"
                                    : "border-[rgba(107,78,255,.15)] focus:border-[#6B4EFF]"
                                }`}
                              />
                              {!excluded && duplicateCustomKeys.has(sanitizeVarKey(varKey)) && (
                                <p className="text-[10px] text-amber-600 mt-0.5">Duplicate key — rename to avoid data loss</p>
                              )}
                            </div>

                            {/* Template var preview */}
                            {!excluded && (
                              <code className="text-[10px] text-[#6B4EFF] bg-[#EDE9FF] px-1.5 py-0.5 rounded font-mono shrink-0 whitespace-nowrap">
                                {`{{${sanitizeVarKey(varKey) || "…"}}}`}
                              </code>
                            )}

                            {/* Sample value */}
                            <span className="text-[10px] text-[#9CA3AF] w-20 truncate shrink-0" title={sampleVal}>{sampleVal}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Preview */}
            {step === "preview" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[#1E1B4B]">{previewLeads.length} leads ready to import</p>
                  <div className="flex items-center gap-2">
                    <button disabled={previewPage === 0} onClick={() => setPreviewPage(p => p - 1)} className="px-2 py-1 text-xs border border-[rgba(107,78,255,0.2)] rounded-lg disabled:opacity-40 hover:bg-[#F5F3FF]">←</button>
                    <span className="text-xs text-[#9CA3AF]">{previewPage + 1}/{totalPages}</span>
                    <button disabled={previewPage >= totalPages - 1} onClick={() => setPreviewPage(p => p + 1)} className="px-2 py-1 text-xs border border-[rgba(107,78,255,0.2)] rounded-lg disabled:opacity-40 hover:bg-[#F5F3FF]">→</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {pageLeads.map((lead, i) => (
                    <div key={i} className="bg-[#F8F7FF] border border-[rgba(107,78,255,0.1)] rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-full bg-[#6B4EFF] text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {(lead.first_name?.[0] || lead.email?.[0] || "?").toUpperCase()}
                        </div>
                        <p className="text-sm font-medium text-[#1E1B4B]">
                          {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || "Unknown"}
                        </p>
                        {lead.email && <span className="text-xs text-[#6B7280]">{lead.email}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-9">
                        {lead.job_title && <span className="text-xs text-[#6B7280]">{lead.job_title as string}</span>}
                        {lead.company_name && <span className="text-xs text-[#6B7280]">· {lead.company_name as string}</span>}
                        {lead.hq_country && <span className="text-xs text-[#9CA3AF]">· {lead.hq_country as string}</span>}
                      </div>
                      {/* Custom fields preview */}
                      {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
                        <div className="pl-9 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          {Object.entries(lead.custom_fields).slice(0, 4).map(([k, v]) => (
                            <span key={k} className="text-[10px] text-[#6B4EFF]">
                              <span className="font-mono opacity-60">{`{{${k}}}`}</span>{" "}
                              <span className="text-[#6B7280]">{v}</span>
                            </span>
                          ))}
                          {Object.keys(lead.custom_fields).length > 4 && (
                            <span className="text-[10px] text-[#9CA3AF]">+{Object.keys(lead.custom_fields).length - 4} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {previewLeads.length === 0 && (
                  <div className="text-center py-8">
                    <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm text-[#6B7280]">No valid leads found. Make sure at least one of First Name, Email, or LinkedIn URL is mapped.</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Done */}
            {step === "done" && result && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-lg font-bold text-[#1E1B4B] mb-1">Upload complete!</p>
                <p className="text-sm text-[#6B7280] mb-4">
                  <span className="font-semibold text-[#6B4EFF]">{result.inserted} leads</span> imported into <span className="font-semibold">"{result.list_label}"</span>
                </p>
                <button onClick={onClose} className="px-6 py-2.5 bg-[#6B4EFF] text-white text-sm font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors">
                  View Leads
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          {step !== "done" && (
            <div className="px-6 py-4 border-t border-[rgba(107,78,255,0.1)] flex items-center justify-between">
              <button
                onClick={() => {
                  if (step === "upload") onClose();
                  else if (step === "map") setStep("upload");
                  else if (step === "preview") setStep("map");
                }}
                className="px-4 py-2 text-sm text-[#6B7280] border border-[rgba(107,78,255,0.15)] rounded-lg hover:bg-[#F5F3FF] transition-colors"
              >
                {step === "upload" ? "Cancel" : "Back"}
              </button>
              <div className="flex items-center gap-3">
                {step === "map" && (
                  <span className="text-xs text-[#9CA3AF]">{getMappedLeads().length} leads will be imported</span>
                )}
                <button
                  onClick={() => {
                    if (step === "map") { setPreviewPage(0); setStep("preview"); }
                    else if (step === "preview") handleUpload();
                  }}
                  disabled={(step === "preview" && previewLeads.length === 0) || uploading || (step === "map" && duplicateCustomKeys.size > 0)}
                  title={step === "map" && duplicateCustomKeys.size > 0 ? "Resolve duplicate custom field keys first" : undefined}
                  className="flex items-center gap-2 px-5 py-2 bg-[#6B4EFF] text-white text-sm font-semibold rounded-lg hover:bg-[#5B3FE0] transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {step === "map" ? "Preview" : uploading ? "Uploading…" : "Import Leads"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
