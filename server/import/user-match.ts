import { findMyDriveFolder, findSubfolder, listSubfolders, createFolder } from '../lib/drive.js';

export interface UserFolderLite { folderId: string; folderName: string; nameNorm: string; }

export function normalizeName(name: string): string {
  return (name || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/様$/, '')
    .trim();
}

export function matchUser(extracted: { name?: string; birthDate?: string; insuredNumber?: string }, users: Array<{ folderId: string; folderName: string; insuredNumber?: string; birthDate?: string }>) {
  if (extracted.insuredNumber) {
    const m = users.find(u => u.insuredNumber && u.insuredNumber === extracted.insuredNumber);
    if (m) return { status: 'matched' as const, folderId: m.folderId, folderName: m.folderName, candidates: [] };
  }
  if (extracted.name && extracted.birthDate) {
    const nn = normalizeName(extracted.name);
    const m = users.find(u => normalizeName(u.folderName) === nn && u.birthDate === extracted.birthDate);
    if (m) return { status: 'matched' as const, folderId: m.folderId, folderName: m.folderName, candidates: [] };
  }
  if (extracted.name) {
    const nn = normalizeName(extracted.name);
    const c = users.filter(u => normalizeName(u.folderName) === nn).map(u => ({ folderId: u.folderId, folderName: u.folderName }));
    if (c.length === 1) return { status: 'matched' as const, folderId: c[0].folderId, folderName: c[0].folderName, candidates: [] };
    if (c.length > 1) return { status: 'candidates' as const, candidates: c };
  }
  return { status: 'not_found' as const, candidates: [] };
}

export async function listUserFoldersForImport(token: string): Promise<Array<{ folderId: string; folderName: string }>> {
  const rootFolderId = process.env.USER_ROOT_FOLDER_ID || '';
  if (!rootFolderId) return [];
  const shared = await listSubfolders(token, rootFolderId);
  return shared.map(f => ({ folderId: f.id, folderName: f.name }));
}

export async function createUserFolderTree(token: string, name: string, isPrivate = false): Promise<{ folderId: string; folderName: string }> {
  const folderName = `${name.trim()}様`;
  let parentId = process.env.USER_ROOT_FOLDER_ID || '';
  if (isPrivate) {
    const privateName = process.env.PRIVATE_FOLDER_NAME || '';
    const privateRoot = privateName ? await findMyDriveFolder(token, privateName) : null;
    if (!privateRoot) throw new Error('private root not found');
    parentId = privateRoot;
  }
  const folderId = await createFolder(token, parentId, folderName);
  const children = ['01_居宅サービス計画書','02_主治医意見書','03_認定調査票','04_サービス担当者会議','05_アセスメントシート','99_実施記録・アーカイブ'];
  for (const ch of children) await createFolder(token, folderId, ch);
  return { folderId, folderName };
}
