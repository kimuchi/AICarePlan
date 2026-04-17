import { google, drive_v3 } from 'googleapis';

/** Create an authenticated Drive client using user's access token */
function getDriveClient(accessToken: string): drive_v3.Drive {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth });
}

/** List subfolders under a given folder ID */
export async function listSubfolders(
  accessToken: string,
  parentFolderId: string
): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  const drive = getDriveClient(accessToken);
  const results: Array<{ id: string; name: string; modifiedTime: string }> = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken, files(id, name, modifiedTime)',
      orderBy: 'name',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (res.data.files) {
      for (const f of res.data.files) {
        results.push({
          id: f.id!,
          name: f.name!,
          modifiedTime: f.modifiedTime || '',
        });
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return results;
}

/** List files in a folder, optionally filtering by MIME type */
export async function listFilesInFolder(
  accessToken: string,
  folderId: string,
  mimeTypeFilter?: string
): Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime: string }>> {
  const drive = getDriveClient(accessToken);
  const results: Array<{ id: string; name: string; mimeType: string; modifiedTime: string }> = [];
  let pageToken: string | undefined;

  let q = `'${folderId}' in parents and trashed = false`;
  if (mimeTypeFilter) {
    q += ` and mimeType = '${mimeTypeFilter}'`;
  }

  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (res.data.files) {
      for (const f of res.data.files) {
        results.push({
          id: f.id!,
          name: f.name!,
          mimeType: f.mimeType!,
          modifiedTime: f.modifiedTime || '',
        });
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return results;
}

/** Recursively list all files under a folder */
export async function listFilesRecursive(
  accessToken: string,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime: string; parentName: string }>> {
  const drive = getDriveClient(accessToken);
  const allFiles: Array<{ id: string; name: string; mimeType: string; modifiedTime: string; parentName: string }> = [];

  async function walk(currentFolderId: string, parentName: string) {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${currentFolderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      if (res.data.files) {
        for (const f of res.data.files) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            await walk(f.id!, f.name!);
          } else {
            allFiles.push({
              id: f.id!,
              name: f.name!,
              mimeType: f.mimeType!,
              modifiedTime: f.modifiedTime || '',
              parentName,
            });
          }
        }
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
  }

  await walk(folderId, '');
  return allFiles;
}

/** Get file content as base64 (for PDFs, etc.) */
export async function getFileContentBase64(
  accessToken: string,
  fileId: string
): Promise<string> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer).toString('base64');
}

/** Get Google Docs content as plain text */
export async function getDocContent(
  accessToken: string,
  fileId: string
): Promise<string> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.export({
    fileId,
    mimeType: 'text/plain',
  });
  return res.data as string;
}

/** Get JSON file content */
export async function getJsonFileContent(
  accessToken: string,
  fileId: string
): Promise<any> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'json' }
  );
  return res.data;
}

/** Get spreadsheet content (latest ★ tab data) */
export async function getSpreadsheetStarTab(
  accessToken: string,
  fileId: string
): Promise<{ tabName: string; data: any[][] } | null> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const sheets = google.sheets({ version: 'v4', auth });

  // Get all sheet names
  const meta = await sheets.spreadsheets.get({ spreadsheetId: fileId });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title || '') || [];

  // Find latest ★ tab
  const starTabs = sheetNames
    .filter(n => n.startsWith('★'))
    .sort()
    .reverse();

  if (starTabs.length === 0) return null;

  const tabName = starTabs[0];
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: fileId,
    range: `'${tabName}'`,
  });

  return {
    tabName,
    data: res.data.values || [],
  };
}

/** Find a subfolder by name within a parent */
export async function findSubfolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string
): Promise<string | null> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || null;
}

/**
 * マイドライブの直下から、指定した名前のフォルダを検索する。
 *
 * Autofiler-CarePlanningの機密文書配置仕様:
 *   マイドライブ直下 → 利用者フォルダルート（privateFolderName）→ {氏名}様/ → サブフォルダ
 *
 * Drive API では 'root' を parentId に使うことでマイドライブ直下を検索できる。
 * ただし 'root' は実行ユーザー本人のマイドライブなので、
 * 他人のマイドライブには絶対にアクセスされない。
 */
export async function findMyDriveFolder(
  accessToken: string,
  folderName: string
): Promise<string | null> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: `'root' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    // マイドライブ検索なので共有ドライブフラグは不要
  });
  return res.data.files?.[0]?.id || null;
}

/** Create a file in a Drive folder (used for export) */
export async function createSpreadsheetInFolder(
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<string> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return res.data.id!;
}
