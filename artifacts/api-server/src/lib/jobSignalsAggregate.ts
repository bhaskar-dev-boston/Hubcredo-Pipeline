// Groups raw job_signal_raw_postings rows (one per scrape per source) into
// deduped "signals" the UI renders — days-open, reposted, sources[], etc.
// This is where §16's dedup logic lives, done on read rather than in n8n.

export interface RawPosting {
  id: string;
  source: "linkedin" | "indeed";
  company_name: string;
  company_domain: string | null;
  role_title: string;
  location: string | null;
  work_model: string | null;
  salary_min: number | null;
  salary_max: number | null;
  scraped_at: string;
}

export interface JobSignal {
  id: string; // fingerprint — stable across scrapes, used for dismiss/pitch/add-to-pipeline
  company_name: string;
  company_domain: string | null;
  role_title: string;
  role_location: string | null;
  work_model: string | null;
  salary_min: number | null;
  salary_max: number | null;
  days_open: number;
  reposted: boolean;
  roles_open_at_company: number;
  sources: ("linkedin" | "indeed")[];
  first_seen_at: string;
  last_seen_at: string;
}

const ACTIVE_WINDOW_DAYS = 14; // matches §17's absolute cutoff
const REPOST_GAP_DAYS = 5;     // gap between scrapes big enough to call it "went away and came back"

function normaliseDomain(domainOrCompany: string | null): string {
  if (!domainOrCompany) return "";
  return domainOrCompany
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*/, "")
    .trim();
}

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^sr\.?\s+/, "senior ")
    .replace(/\bsr\.?\b/, "senior")
    .replace(/\bswe\b/, "software engineer")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseLocation(location: string | null): string {
  return (location || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function computeFingerprint(row: Pick<RawPosting, "company_domain" | "company_name" | "role_title" | "location">): string {
  const domain = normaliseDomain(row.company_domain) || normaliseDomain(row.company_name);
  return [domain, normaliseTitle(row.role_title), normaliseLocation(row.location)].join("::");
}

export function aggregateSignals(rawRows: RawPosting[]): JobSignal[] {
  const groups = new Map<string, RawPosting[]>();
  for (const row of rawRows) {
    const fp = computeFingerprint(row);
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp)!.push(row);
  }

  const now = Date.now();
  const activeCutoff = now - ACTIVE_WINDOW_DAYS * 86_400_000;

  // First pass: build signals, filtering out anything not seen within the active window (§17)
  const signals: JobSignal[] = [];
  for (const [fingerprint, rows] of groups) {
    rows.sort((a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime());
    const lastSeenMs = new Date(rows[rows.length - 1].scraped_at).getTime();
    if (lastSeenMs < activeCutoff) continue; // stale, drop from default feed

    const firstSeenMs = new Date(rows[0].scraped_at).getTime();
    const daysOpen = Math.max(0, Math.floor((now - firstSeenMs) / 86_400_000));

    // Reposted: any gap between consecutive scrapes bigger than REPOST_GAP_DAYS
    let reposted = false;
    for (let i = 1; i < rows.length; i++) {
      const gapDays = (new Date(rows[i].scraped_at).getTime() - new Date(rows[i - 1].scraped_at).getTime()) / 86_400_000;
      if (gapDays > REPOST_GAP_DAYS) { reposted = true; break; }
    }

    const latest = rows[rows.length - 1];
    const sources = Array.from(new Set(rows.map(r => r.source)));

    signals.push({
      id: fingerprint,
      company_name: latest.company_name,
      company_domain: latest.company_domain,
      role_title: latest.role_title,
      role_location: latest.location,
      work_model: latest.work_model,
      salary_min: latest.salary_min,
      salary_max: latest.salary_max,
      days_open: daysOpen,
      reposted,
      roles_open_at_company: 0, // filled in second pass below
      sources,
      first_seen_at: rows[0].scraped_at,
      last_seen_at: latest.scraped_at,
    });
  }

  // Second pass: roles_open_at_company needs every other signal for the same domain
  const countByDomain = new Map<string, number>();
  for (const s of signals) {
    const key = normaliseDomain(s.company_domain) || normaliseDomain(s.company_name);
    countByDomain.set(key, (countByDomain.get(key) ?? 0) + 1);
  }
  for (const s of signals) {
    const key = normaliseDomain(s.company_domain) || normaliseDomain(s.company_name);
    s.roles_open_at_company = countByDomain.get(key) ?? 1;
  }

  return signals.sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());
}