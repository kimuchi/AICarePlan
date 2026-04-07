/** API client for backend calls */

const BASE = '';

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = '/auth/google';
    throw new Error('Authentication required');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Auth ──

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: 'admin' | 'user';
}

export async function getMe(): Promise<{ user: SessionUser } | null> {
  try {
    return await request('/auth/me');
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

// ── Users ──

export interface UserFolder {
  id: string;
  name: string;
  folderName: string;
  folderId: string;
  hasConfidential: boolean;
  modifiedTime: string;
}

export async function getUsers(): Promise<{ users: UserFolder[] }> {
  return request('/api/users');
}

// ── Sources ──

export interface SourceFile {
  id: string;
  name: string;
  category: string;
  date: string;
  mimeType: string;
  icon: string;
  isConfidential: boolean;
  folderId: string;
}

export async function getUserSources(folderId: string, folderName?: string): Promise<{ sources: SourceFile[] }> {
  const params = folderName ? `?folderName=${encodeURIComponent(folderName)}` : '';
  return request(`/api/sources/users/${folderId}/sources${params}`);
}

export async function fetchSourceContents(
  fileIds: string[],
  mimeTypes: Record<string, string>
): Promise<{ contents: Record<string, { type: string; content: string }> }> {
  return request('/api/sources/fetch', {
    method: 'POST',
    body: JSON.stringify({ fileIds, mimeTypes }),
  });
}

// ── Analysis ──

export interface GeneratedPlan {
  id: string;
  label: string;
  summary: string;
  table1: {
    userWishes: string;
    familyWishes: string;
    assessmentResult: string;
    committeeOpinion: string;
    totalPolicy: string;
    livingSupportReason: string;
  };
  table2: Array<{
    need: string;
    goals: Array<{
      longGoal: string;
      longPeriod: string;
      shortGoal: string;
      shortPeriod: string;
      services: Array<{
        content: string;
        insurance: string;
        type: string;
        provider: string;
        frequency: string;
        period: string;
      }>;
    }>;
  }>;
  table3: {
    schedule: Array<{
      day: string;
      startHour: number;
      startMin: number;
      endHour: number;
      endMin: number;
      label: string;
    }>;
    dailyActivities: Array<{ time: string; activity: string }>;
    weeklyService: string;
  };
}

export type BusinessMode = 'kyotaku' | 'shoki';

export async function analyzeSources(
  user: any,
  sourceContents: Record<string, string>,
  mode: BusinessMode,
  facilityId?: string
): Promise<{ plans: GeneratedPlan[] }> {
  return request('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ user, sourceContents, mode, facilityId }),
  });
}

// ── Export ──

export async function exportToSheets(
  user: any,
  plan: GeneratedPlan,
  meta: any,
  mode: BusinessMode
): Promise<{ url: string; spreadsheetId: string }> {
  return request('/api/export', {
    method: 'POST',
    body: JSON.stringify({ user, plan, meta, mode }),
  });
}

export async function saveDraft(
  userName: string,
  planJson: string,
  mode: BusinessMode
): Promise<{ ok: boolean }> {
  return request('/api/export/draft', {
    method: 'POST',
    body: JSON.stringify({ userName, planJson, mode }),
  });
}

// ── Settings ──

export async function getGeneralSettings(): Promise<{ settings: Record<string, string> }> {
  return request('/api/settings/general');
}

export async function updateGeneralSettings(settings: Record<string, string>): Promise<void> {
  await request('/api/settings/general', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export async function getPrompts(): Promise<{ prompts: Array<{ id: string; title: string; body: string }> }> {
  return request('/api/settings/prompts');
}

export async function updatePrompts(prompts: Array<{ id: string; title: string; body: string }>): Promise<void> {
  await request('/api/settings/prompts', {
    method: 'PUT',
    body: JSON.stringify({ prompts }),
  });
}

export async function getAllowlist(): Promise<{ allowlist: Array<{ email: string; role: string; name: string }> }> {
  return request('/api/settings/allowlist');
}

export async function updateAllowlist(allowlist: Array<{ email: string; role: string; name: string }>): Promise<void> {
  await request('/api/settings/allowlist', {
    method: 'PUT',
    body: JSON.stringify({ allowlist }),
  });
}

export async function getHistory(): Promise<{ history: Array<{ userId: string; userName: string; mode: string; exportedUrl: string; exportedAt: string }> }> {
  return request('/api/settings/history');
}

export async function initSettings(): Promise<void> {
  await request('/api/settings/init', { method: 'POST' });
}

// ── Facilities ──

export interface Facility {
  id: string;
  name: string;
  address: string;
  managerName: string;
}

export async function getFacilities(): Promise<{ facilities: Facility[] }> {
  return request('/api/settings/facilities');
}

export async function updateFacilities(facilities: Facility[]): Promise<void> {
  await request('/api/settings/facilities', {
    method: 'PUT',
    body: JSON.stringify({ facilities }),
  });
}

// ── AI Models (read-only from .env) ──

export async function getModels(): Promise<{ generate: string; analyze: string }> {
  return request('/api/settings/models');
}

// ── User Defaults (per-client facility) ──

export async function getUserDefaults(): Promise<{ defaults: Record<string, string> }> {
  return request('/api/settings/user-defaults');
}

export async function setUserDefault(clientFolderId: string, facilityId: string): Promise<void> {
  await request('/api/settings/user-defaults', {
    method: 'PUT',
    body: JSON.stringify({ clientFolderId, facilityId }),
  });
}
