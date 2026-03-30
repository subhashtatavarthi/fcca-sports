/**
 * GitHub API helpers for committing schedule files directly from the browser.
 * Uses a Personal Access Token (PAT) stored in localStorage.
 *
 * Required PAT scopes: repo (or public_repo for public repos)
 */

const GITHUB_OWNER = 'subhashtatavarthi';
const GITHUB_REPO  = 'fcca-sports';
const LS_TOKEN_KEY = 'fcca_gh_token';

export function getStoredToken(): string {
  try { return localStorage.getItem(LS_TOKEN_KEY) ?? ''; } catch { return ''; }
}
export function setStoredToken(token: string) {
  try { localStorage.setItem(LS_TOKEN_KEY, token.trim()); } catch {}
}
export function clearStoredToken() {
  try { localStorage.removeItem(LS_TOKEN_KEY); } catch {}
}

interface GHFile {
  content: string; // base64
  sha?: string;
}

async function getFileSha(path: string, token: string): Promise<string | undefined> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
  );
  if (!res.ok) return undefined;
  const data = await res.json();
  return data.sha;
}

async function putFile(path: string, content: string, message: string, token: string): Promise<void> {
  const sha = await getFileSha(path, token);
  const body: any = { message, content, branch: 'main' };
  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `GitHub API error ${res.status}`);
  }
}

export interface ManifestEntry {
  id: string;
  file: string;      // e.g. "April2026_Schedule.json"
  label: string;     // e.g. "April 2026"
  addedAt: string;   // human readable date
}

export interface Manifest {
  schedules: ManifestEntry[];
}

async function fetchManifest(token: string): Promise<Manifest> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/schedules/manifest.json`,
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
  );
  if (!res.ok) return { schedules: [] };
  const data = await res.json();
  const decoded = atob(data.content.replace(/\s/g, ''));
  return JSON.parse(decoded) as Manifest;
}

/**
 * Commit a schedule (as JSON) to the repo and update manifest.json.
 * This triggers GitHub Actions to redeploy — everyone sees the schedule in ~2 min.
 */
export async function commitSchedule(
  token: string,
  slug: string,          // e.g. "April2026_Schedule"
  label: string,         // e.g. "April 2026"
  rows: Record<string, any>[],
  columns: string[],
): Promise<void> {
  const fileName = `${slug}.json`;
  const filePath = `public/schedules/${fileName}`;

  // 1. Commit the data as JSON
  const jsonContent = JSON.stringify({ columns, rows }, null, 2);
  const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));
  await putFile(filePath, base64Content, `add schedule: ${label}`, token);

  // 2. Update manifest.json
  const manifest = await fetchManifest(token);
  const existingIdx = manifest.schedules.findIndex(e => e.file === fileName);
  const entry: ManifestEntry = {
    id: Date.now().toString(),
    file: fileName,
    label,
    addedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  };
  if (existingIdx >= 0) {
    manifest.schedules[existingIdx] = entry;
  } else {
    manifest.schedules.unshift(entry);
  }
  const manifestBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(manifest, null, 2) + '\n')));
  await putFile('public/schedules/manifest.json', manifestBase64, `update manifest: ${label}`, token);
}
