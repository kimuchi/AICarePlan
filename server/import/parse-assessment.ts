/**
 * フェイスシート・アセスメント Excel パーサー（5シート）。
 * シート構成:
 *   - フェイスシート（基本情報・被保険者情報・認定情報・自立度・主治医・緊急連絡・家族・主訴・現サービス）
 *   - アセスメント（健康状態・ADL・IADL・認知・特記）
 *   - なんでもボックス（日付/カテゴリ/内容/ソース のリスト）
 *   - 主治医意見書（転記）
 *   - 認定調査票（転記）
 *
 * すべてラベルアンカー駆動。■ 見出しごとにブロックを切り出してから、
 * 各ブロック内でラベル/チェックボックスを抽出する。
 */

import ExcelJS from 'exceljs';
import {
  normalizeSheet,
  findLabel,
  findAllLabels,
  valueOf,
  parseSelectionGroup,
  parseEvidence,
  parseCategoryTag,
  parseDateRange,
  parseJapaneseDate,
  normLabel,
} from './excel-utils.js';
import type {
  ImportedAssessmentBundle,
  ImportedFaceSheet,
  ImportedAssessment,
  AssessmentSection,
  AssessmentItem,
  ImportedAnythingBox,
  AnythingBoxEntry,
  ImportedDoctorOpinion,
  DoctorOpinionSection,
  ImportedCertificationSurvey,
  CertificationSurveyGroup,
  CertificationSurveyItem,
  EmergencyContact,
  FamilyMember,
  FaceSheetSection,
  SelectionGroup,
} from '../types/imported.js';

function findSheet(wb: ExcelJS.Workbook, candidates: RegExp[]): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    for (const re of candidates) {
      if (re.test(ws.name)) return ws;
    }
  }
  return null;
}

/** ■ 見出し位置のリストを返し、それぞれの行範囲を [start, end) で記録（マージ展開で重複した行は除去） */
function splitByHeadings(grid: string[][], rowCount: number): Array<{ title: string; row: number; endRow: number }> {
  const headings = findAllLabels(grid, /^■\s+/);
  // 同じ行は重複しているので、最小列のみ採用
  const byRow = new Map<number, { row: number; col: number }>();
  for (const h of headings) {
    const cur = byRow.get(h.row);
    if (!cur || h.col < cur.col) byRow.set(h.row, h);
  }
  const uniq = Array.from(byRow.values()).sort((a, b) => a.row - b.row);
  const blocks: Array<{ title: string; row: number; endRow: number }> = [];
  for (let i = 0; i < uniq.length; i++) {
    const h = uniq[i];
    const next = uniq[i + 1];
    blocks.push({
      title: (grid[h.row][h.col] || '').replace(/^■\s*/, '').trim(),
      row: h.row,
      endRow: next ? next.row : rowCount + 1,
    });
  }
  return blocks;
}

function collectRawSections(grid: string[][], rowCount: number, colCount: number): FaceSheetSection[] {
  const blocks = splitByHeadings(grid, rowCount);
  const out: FaceSheetSection[] = [];
  for (const b of blocks) {
    const rows: string[][] = [];
    for (let r = b.row + 1; r < b.endRow; r++) {
      const row = grid[r];
      if (!row) continue;
      const arr: string[] = [];
      let any = false;
      for (let c = 1; c <= colCount; c++) {
        const v = row[c] || '';
        if (v) any = true;
        arr.push(v);
      }
      if (any) rows.push(arr);
    }
    out.push({ title: b.title, rows });
  }
  return out;
}

// ── フェイスシート ──

function parseFaceSheet(ws: ExcelJS.Worksheet, warnings: string[]): ImportedFaceSheet {
  const ns = normalizeSheet(ws);
  const g = ns.grid;

  const result: ImportedFaceSheet = {
    basic: {
      name: '',
      furigana: '',
      gender: '',
      birthDate: { raw: '' },
      address: '',
      tel: '',
    },
    insurance: {
      insuredNumber: '',
      insurerNumber: '',
      copaymentRatio: '',
      medicalInsurance: '',
      disabilityCert: '',
      welfare: '',
    },
    certification: {
      careLevel: '',
      certPeriod: { raw: '' },
      certDate: { raw: '' },
      kindGroup: { raw: '', selectedAll: [], options: [] },
      limitAmount: '',
      reason: '',
    },
    independence: {
      physical: { raw: '', selectedAll: [], options: [] },
      cognitive: { raw: '', selectedAll: [], options: [] },
    },
    medical: {
      doctor: '',
      diagnosis1: '',
      diagnosis2: '',
      onsetDate: '',
      stability: '',
      specialMedical: '',
      managementNeed: '',
      remarks: '',
    },
    emergencyContacts: [],
    family: [],
    familyNote: '',
    complaint: { userWishes: '', familyWishes: '' },
    currentServices: [],
    rawSections: collectRawSections(g, ns.rowCount, ns.colCount),
  };

  try {
    // 事業所ヘッダ (行2あたり: 「燦々ほーむあらかわ（小規模多機能型居宅介護）」)
    if (g[2]) {
      const header = g[2][1] || '';
      if (header) result.facilityHeader = header;
    }

    // 基本情報
    const nameAnchor = findLabel(g, '氏名', { partial: false });
    if (nameAnchor) result.basic.name = valueOf(g, nameAnchor, 'right');
    const furiAnchor = findLabel(g, 'フリガナ');
    if (furiAnchor) result.basic.furigana = valueOf(g, furiAnchor, 'right');
    const genderAnchor = findLabel(g, '性別');
    if (genderAnchor) {
      const v = valueOf(g, genderAnchor, 'right');
      // ここに生年月日が入ってしまう可能性があるので、性別キーワードのみ拾う
      const m = /男|女/.exec(v);
      if (m) result.basic.gender = m[0];
      else result.basic.gender = v;
    }
    // 生年月日: 「氏名」行の右端のセル等にある（独立ラベルがないケース）
    if (nameAnchor) {
      // 同じ行で「年月日」または「歳」を含むセルを拾う
      const row = g[nameAnchor.row] || [];
      for (let c = nameAnchor.col + 1; c < row.length; c++) {
        const v = row[c] || '';
        if (/年.*月.*日|歳/.test(v)) {
          const parsed = parseJapaneseDate(v);
          result.basic.birthDate = { raw: v, iso: parsed.iso, wareki: parsed.wareki, age: parsed.age };
          break;
        }
      }
    }
    const addrAnchor = findLabel(g, '住所');
    if (addrAnchor) result.basic.address = valueOf(g, addrAnchor, 'right');
    const telAnchor = findLabel(g, 'TEL');
    if (telAnchor) result.basic.tel = valueOf(g, telAnchor, 'right');

    // 被保険者情報
    const insuredAnchor = findLabel(g, '被保険者番号');
    if (insuredAnchor) result.insurance.insuredNumber = valueOf(g, insuredAnchor, 'right');
    const insurerAnchor = findLabel(g, '保険者番号');
    if (insurerAnchor) result.insurance.insurerNumber = valueOf(g, insurerAnchor, 'right');
    const copayAnchor = findLabel(g, '負担割合');
    if (copayAnchor) result.insurance.copaymentRatio = valueOf(g, copayAnchor, 'right');
    const medAnchor = findLabel(g, '医療保険');
    if (medAnchor) result.insurance.medicalInsurance = valueOf(g, medAnchor, 'right');
    const disAnchor = findLabel(g, '障害者手帳');
    if (disAnchor) result.insurance.disabilityCert = valueOf(g, disAnchor, 'right');
    const welAnchor = findLabel(g, '生活保護');
    if (welAnchor) result.insurance.welfare = valueOf(g, welAnchor, 'right');

    // 認定情報
    const careLevelAnchor = findLabel(g, '要介護度');
    if (careLevelAnchor) result.certification.careLevel = valueOf(g, careLevelAnchor, 'right');
    const certPeriodAnchor = findLabel(g, '認定期間');
    if (certPeriodAnchor) {
      const row = g[certPeriodAnchor.row] || [];
      // 行内に "認定日" など別ラベルが続くことがあるので、
      // ラベル右から「認定日/認定/支給」等が出てきたら停止する
      const parts: string[] = [];
      for (let c = certPeriodAnchor.col + 1; c < row.length; c++) {
        const v = (row[c] || '').trim();
        if (!v) continue;
        if (/^認定日|^認定の|^支給|^アセスメント/.test(v)) break;
        if (parts.length > 0 && parts[parts.length - 1] === v) continue;
        parts.push(v);
      }
      const combined = parts.join(' ');
      result.certification.certPeriod = parseDateRange(combined);
    }
    const certDateAnchor = findLabel(g, '認定日');
    if (certDateAnchor) {
      const v = valueOf(g, certDateAnchor, 'right');
      const parsed = parseJapaneseDate(v);
      result.certification.certDate = {
        raw: v,
        iso: parsed.iso,
        wareki: parsed.wareki,
        age: parsed.age,
      };
    }
    const kindAnchor = findLabel(g, '区分');
    if (kindAnchor) {
      const v = valueOf(g, kindAnchor, 'right');
      result.certification.kindGroup = parseSelectionGroup(v);
    }
    const limitAnchor = findLabel(g, '支給限度基準額');
    if (limitAnchor) result.certification.limitAmount = valueOf(g, limitAnchor, 'right');
    const reasonAnchor = findLabel(g, 'アセスメント理由');
    if (reasonAnchor) result.certification.reason = valueOf(g, reasonAnchor, 'right');

    // 自立度
    const physAnchor = findLabel(g, '障害高齢者');
    if (physAnchor) result.independence.physical = parseSelectionGroup(valueOf(g, physAnchor, 'right'));
    const cogAnchor = findLabel(g, '認知症高齢者');
    if (cogAnchor) result.independence.cognitive = parseSelectionGroup(valueOf(g, cogAnchor, 'right'));

    // 主治医ブロック
    const docAnchor = findLabel(g, '主治医', { partial: false });
    if (docAnchor) result.medical.doctor = valueOf(g, docAnchor, 'right');
    const dx1Anchor = findLabel(g, '診断名①');
    if (dx1Anchor) result.medical.diagnosis1 = valueOf(g, dx1Anchor, 'right');
    const dx2Anchor = findLabel(g, '診断名②');
    if (dx2Anchor) result.medical.diagnosis2 = valueOf(g, dx2Anchor, 'right');
    const onsetAnchor = findLabel(g, '発症日');
    if (onsetAnchor) result.medical.onsetDate = valueOf(g, onsetAnchor, 'right');
    const stabAnchor = findLabel(g, '症状の安定性');
    if (stabAnchor) result.medical.stability = valueOf(g, stabAnchor, 'right');
    const specMedAnchor = findLabel(g, '特別な医療');
    if (specMedAnchor) result.medical.specialMedical = valueOf(g, specMedAnchor, 'right');
    const mgmtAnchor = findLabel(g, '医学的管理の必要性');
    if (mgmtAnchor) result.medical.managementNeed = valueOf(g, mgmtAnchor, 'right');
    const remAnchor = findLabel(g, '備考');
    if (remAnchor) result.medical.remarks = valueOf(g, remAnchor, 'right');

    // 緊急連絡先テーブル
    const emHead = findLabel(g, '緊急連絡先');
    if (emHead) {
      // ヘッダ行はその直下: 氏名/続柄/TEL/備考
      const subHeaderRow = emHead.row + 1;
      // 各 No 行を読み取る
      for (let r = subHeaderRow + 1; r <= ns.rowCount; r++) {
        const row = g[r];
        if (!row) continue;
        const noStr = (row[1] || '').trim();
        if (/^■/.test(noStr) || normLabel(noStr).startsWith('家族構成')) break;
        if (!/^\d+$/.test(noStr)) continue;
        result.emergencyContacts.push({
          no: parseInt(noStr, 10),
          name: (row[2] || '').trim(),
          relation: (row[3] || '').trim(),
          tel: (row[4] || '').trim(),
          note: (row[5] || '').trim(),
        });
      }
    }

    // 家族構成テーブル
    const famHead = findLabel(g, '家族構成');
    if (famHead) {
      const subHeaderRow = famHead.row + 1;
      for (let r = subHeaderRow + 1; r <= ns.rowCount; r++) {
        const row = g[r];
        if (!row) continue;
        const noStr = (row[1] || '').trim();
        if (/^■/.test(noStr)) break;
        if (normLabel(noStr).includes('家族構成メモ')) break;
        if (!/^\d+$/.test(noStr)) continue;
        result.family.push({
          no: parseInt(noStr, 10),
          name: (row[2] || '').trim(),
          relation: (row[3] || '').trim(),
          age: (row[4] || '').trim(),
          liveWith: (row[5] || '').trim(),
          note: (row[6] || '').trim(),
        });
      }
    }
    const famNoteAnchor = findLabel(g, '家族構成メモ');
    if (famNoteAnchor) result.familyNote = valueOf(g, famNoteAnchor, 'right');

    // 主訴・相談内容
    const userWishAnchor = findLabel(g, '本人の希望');
    if (userWishAnchor) result.complaint.userWishes = valueOf(g, userWishAnchor, 'right');
    const famWishAnchor = findLabel(g, '家族の希望');
    if (famWishAnchor) result.complaint.familyWishes = valueOf(g, famWishAnchor, 'right');

    // 現在利用中のサービス
    const svcHead = findLabel(g, '現在利用中のサービス');
    if (svcHead) {
      for (let r = svcHead.row + 1; r <= ns.rowCount; r++) {
        const row = g[r];
        if (!row) continue;
        const v = (row[2] || '').trim();
        if (!v) continue;
        if (/^■/.test(v)) break;
        result.currentServices.push(v);
      }
    }
  } catch (e) {
    warnings.push(`フェイスシート parse 失敗: ${(e as Error).message}`);
  }

  return result;
}

// ── アセスメント ──

function parseAssessmentSection(
  grid: string[][],
  startRow: number,
  endRow: number,
  title: string
): AssessmentSection {
  const items: AssessmentItem[] = [];
  let freeText = '';
  for (let r = startRow + 1; r < endRow; r++) {
    const row = grid[r];
    if (!row) continue;
    // 行内に「項目ラベル」「選択肢」「根拠」が並ぶことを期待
    // 中島潔のサンプル: row[2]=ラベル, row[3]=選択肢, row[4]=根拠
    const label = (row[2] || row[1] || '').trim();
    const sel = (row[3] || '').trim();
    const evi = (row[4] || '').trim();
    if (label && sel) {
      items.push({
        label,
        selection: { ...parseSelectionGroup(sel) } as AssessmentItem['selection'],
        evidence: parseEvidence(evi),
      });
      continue;
    }
    // 自由記述行（「既往歴・現病歴」「服薬内容」「認知能力」等）
    if (label && !sel && (row[2] || '').trim()) {
      const v = (row[2] || '').trim();
      if (v) {
        if (freeText) freeText += '\n';
        freeText += `${label}: ${v}`;
      }
    } else if (!label && (row[1] || '').trim()) {
      const v = (row[1] || '').trim();
      const v2 = (row[2] || '').trim();
      if (v && v2) {
        if (freeText) freeText += '\n';
        freeText += `${v}: ${v2}`;
      }
    }
  }
  return { title, items, freeText: freeText || undefined };
}

function parseAssessment(ws: ExcelJS.Worksheet, warnings: string[]): ImportedAssessment {
  const ns = normalizeSheet(ws);
  const g = ns.grid;
  const blocks = splitByHeadings(g, ns.rowCount);
  const findBlock = (kw: string) => blocks.find((b) => b.title.includes(kw));

  const empty = (): AssessmentSection => ({ title: '', items: [] });
  const result: ImportedAssessment = {
    health: empty(),
    adl: empty(),
    iadl: empty(),
    cognition: empty(),
    remarks: empty(),
    rawSections: collectRawSections(g, ns.rowCount, ns.colCount),
  };

  try {
    const healthB = findBlock('健康状態');
    if (healthB) result.health = parseAssessmentSection(g, healthB.row, healthB.endRow, healthB.title);
    const adlB = findBlock('ADL');
    if (adlB) result.adl = parseAssessmentSection(g, adlB.row, adlB.endRow, adlB.title);
    const iadlB = findBlock('IADL');
    if (iadlB) result.iadl = parseAssessmentSection(g, iadlB.row, iadlB.endRow, iadlB.title);
    const cogB = findBlock('認知');
    if (cogB) result.cognition = parseAssessmentSection(g, cogB.row, cogB.endRow, cogB.title);
    const remB = findBlock('特記事項');
    if (remB) result.remarks = parseAssessmentSection(g, remB.row, remB.endRow, remB.title);
  } catch (e) {
    warnings.push(`アセスメント parse 失敗: ${(e as Error).message}`);
  }
  return result;
}

// ── なんでもボックス ──

function parseAnythingBox(ws: ExcelJS.Worksheet, warnings: string[]): ImportedAnythingBox {
  const out: AnythingBoxEntry[] = [];
  try {
    const ns = normalizeSheet(ws);
    const g = ns.grid;
    // ヘッダ行: 「日付 | カテゴリ | 内容 | ソース」
    const header = findLabel(g, '日付', { partial: false });
    if (!header) {
      warnings.push('なんでもボックス ヘッダ未検出');
      return out;
    }
    const dateCol = header.col;
    const catCol = dateCol + 1;
    const contCol = dateCol + 2;
    const srcCol = dateCol + 3;
    for (let r = header.row + 1; r <= ns.rowCount; r++) {
      const row = g[r];
      if (!row) continue;
      const d = (row[dateCol] || '').trim();
      const cat = (row[catCol] || '').trim();
      const cont = (row[contCol] || '').trim();
      const src = (row[srcCol] || '').trim();
      if (!d && !cat && !cont) continue;
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : parseJapaneseDate(d).iso;
      out.push({
        dateRaw: d,
        dateIso: parsed,
        category: parseCategoryTag(cat),
        content: cont,
        source: src,
      });
    }
  } catch (e) {
    warnings.push(`なんでもボックス parse 失敗: ${(e as Error).message}`);
  }
  return out;
}

// ── 主治医意見書 ──

function parseDoctorOpinion(ws: ExcelJS.Worksheet, warnings: string[]): ImportedDoctorOpinion {
  const ns = normalizeSheet(ws);
  const g = ns.grid;
  const result: ImportedDoctorOpinion = {
    header: {
      writtenDate: '',
      lastExamDate: '',
      opinionKind: { raw: '', selectedAll: [], options: [] },
      doctorName: '',
      clinic: '',
      tel: '',
    },
    sections: [],
  };
  try {
    // ヘッダ
    const writeAnchor = findLabel(g, '記入日');
    if (writeAnchor) result.header.writtenDate = valueOf(g, writeAnchor, 'right');
    const examAnchor = findLabel(g, '最終診察日');
    if (examAnchor) result.header.lastExamDate = valueOf(g, examAnchor, 'right');
    const opinionAnchor = findLabel(g, '意見書作成');
    if (opinionAnchor) result.header.opinionKind = parseSelectionGroup(valueOf(g, opinionAnchor, 'right'));
    const docAnchor = findLabel(g, '医師氏名');
    if (docAnchor) result.header.doctorName = valueOf(g, docAnchor, 'right');
    const clinAnchor = findLabel(g, '医療機関名');
    if (clinAnchor) result.header.clinic = valueOf(g, clinAnchor, 'right');
    const telAnchor = findLabel(g, 'TEL');
    if (telAnchor) result.header.tel = valueOf(g, telAnchor, 'right');

    // ■ 見出しごとに section を生成
    const blocks = splitByHeadings(g, ns.rowCount);
    for (const b of blocks) {
      const sec: DoctorOpinionSection = {
        title: b.title,
        fields: [],
        selections: [],
      };
      const freeTextLines: string[] = [];
      for (let r = b.row + 1; r < b.endRow; r++) {
        const row = g[r];
        if (!row) continue;
        // 行に複数のラベル/値ペアがある
        for (let c = 1; c < row.length; c++) {
          const cell = (row[c] || '').trim();
          if (!cell) continue;
          // ラベル候補かどうか: 次のセルがチェックボックスっぽい
          const next = (row[c + 1] || '').trim();
          if (next && /[■□]|【/.test(next) && !/[■□]|【/.test(cell)) {
            sec.selections.push({ label: cell, group: parseSelectionGroup(next) });
            c += 1;
            continue;
          }
          // ラベル + 自由値
          if (next && !/[■□]|【/.test(next) && /[:：]/.test(cell)) {
            const labelClean = cell.replace(/[:：]\s*$/, '').trim();
            sec.fields.push({ label: labelClean, value: next });
            c += 1;
            continue;
          }
          // 単独のチェックボックス群行
          if (/[■□]/.test(cell)) {
            sec.selections.push({ label: '', group: parseSelectionGroup(cell) });
            continue;
          }
          // それ以外は free text
          if (cell.length > 1) freeTextLines.push(cell);
        }
      }
      if (freeTextLines.length) sec.freeText = freeTextLines.join('\n');
      result.sections.push(sec);
    }
  } catch (e) {
    warnings.push(`主治医意見書 parse 失敗: ${(e as Error).message}`);
  }
  return result;
}

// ── 認定調査票 ──

function parseCertificationSurvey(ws: ExcelJS.Worksheet, warnings: string[]): ImportedCertificationSurvey {
  const ns = normalizeSheet(ws);
  const g = ns.grid;
  const result: ImportedCertificationSurvey = {
    overview: {
      surveyDate: '',
      surveyor: '',
      pastCert: { raw: '', selectedAll: [], options: [] },
      previousResult: '',
      currentLife: '',
      familyStatus: { raw: '', selectedAll: [], options: [] },
    },
    groups: [],
    remarks: '',
  };
  try {
    const sdAnchor = findLabel(g, '調査日');
    if (sdAnchor) result.overview.surveyDate = valueOf(g, sdAnchor, 'right');
    const sorAnchor = findLabel(g, '調査者');
    if (sorAnchor) result.overview.surveyor = valueOf(g, sorAnchor, 'right');
    const pastAnchor = findLabel(g, '過去の認定');
    if (pastAnchor) result.overview.pastCert = parseSelectionGroup(valueOf(g, pastAnchor, 'right'));
    const prevAnchor = findLabel(g, '前回結果');
    if (prevAnchor) result.overview.previousResult = valueOf(g, prevAnchor, 'right');
    const curAnchor = findLabel(g, '現在の生活状況');
    if (curAnchor) result.overview.currentLife = valueOf(g, curAnchor, 'right');
    const famAnchor = findLabel(g, '家族状況');
    if (famAnchor) result.overview.familyStatus = parseSelectionGroup(valueOf(g, famAnchor, 'right'));

    // 第N群: の見出しごとに項目を抽出
    const blocks = splitByHeadings(g, ns.rowCount);
    for (const b of blocks) {
      // 「概況調査」と「特記事項」はスキップ（または特記は別扱い）
      if (/特記事項/.test(b.title)) {
        // free text
        const lines: string[] = [];
        for (let r = b.row + 1; r < b.endRow; r++) {
          const row = g[r];
          if (!row) continue;
          for (let c = 1; c < row.length; c++) {
            const v = (row[c] || '').trim();
            if (v) {
              lines.push(v);
              break;
            }
          }
        }
        result.remarks = lines.join('\n');
        continue;
      }
      if (!/第\d群|第\s*\d\s*群/.test(b.title)) continue;
      const group: CertificationSurveyGroup = { title: b.title, items: [] };
      for (let r = b.row + 1; r < b.endRow; r++) {
        const row = g[r];
        if (!row) continue;
        // 1行に左右2セット（ラベル+選択肢）
        const pairs: Array<{ labelCol: number; valCol: number }> = [
          { labelCol: 1, valCol: 2 },
          { labelCol: 3, valCol: 4 },
        ];
        for (const p of pairs) {
          const lbl = (row[p.labelCol] || '').trim();
          const val = (row[p.valCol] || '').trim();
          if (!lbl) continue;
          // ラベル形式: "1-3 寝返り"
          const m = /^(\S+?)\s+(.+)$/.exec(lbl);
          const no = m ? m[1] : '';
          const labelName = m ? m[2] : lbl;
          if (val) {
            group.items.push({
              no,
              label: labelName,
              selection: parseSelectionGroup(val),
            });
          } else if (lbl) {
            // 値が空でも項目として記録
            group.items.push({
              no,
              label: labelName,
              selection: { raw: '', selectedAll: [], options: [] },
            });
          }
        }
      }
      if (group.items.length > 0) result.groups.push(group);
    }
  } catch (e) {
    warnings.push(`認定調査票 parse 失敗: ${(e as Error).message}`);
  }
  return result;
}

// ── エントリポイント ──

export async function parseAssessmentWorkbook(
  buffer: Buffer | ArrayBuffer,
  fileName: string
): Promise<ImportedAssessmentBundle> {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load((buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer) as any);
  const warnings: string[] = [];
  const sheetNames = wb.worksheets.map((w) => w.name);

  const wsFace = findSheet(wb, [/フェイスシート/]);
  const wsAss = findSheet(wb, [/^アセスメント/, /課題分析/]);
  const wsAny = findSheet(wb, [/なんでもボックス/, /なんでも/]);
  const wsDoc = findSheet(wb, [/主治医意見書/]);
  const wsCert = findSheet(wb, [/認定調査票/]);

  const faceSheet = wsFace ? parseFaceSheet(wsFace, warnings) : (warnings.push('フェイスシート未検出'), parseFaceSheetEmpty());
  const assessment = wsAss ? parseAssessment(wsAss, warnings) : (warnings.push('アセスメント未検出'), parseAssessmentEmpty());
  const anythingBox = wsAny ? parseAnythingBox(wsAny, warnings) : [];
  const doctorOpinion = wsDoc ? parseDoctorOpinion(wsDoc, warnings) : parseDoctorOpinionEmpty();
  const certificationSurvey = wsCert ? parseCertificationSurvey(wsCert, warnings) : parseCertSurveyEmpty();

  return {
    fileName,
    schemaVersion: 1,
    faceSheet,
    assessment,
    anythingBox,
    doctorOpinion,
    certificationSurvey,
    sheetNames,
    warnings,
  };
}

function parseFaceSheetEmpty(): ImportedFaceSheet {
  const empty = (): SelectionGroup => ({ raw: '', selectedAll: [], options: [] });
  return {
    basic: { name: '', furigana: '', gender: '', birthDate: { raw: '' }, address: '', tel: '' },
    insurance: { insuredNumber: '', insurerNumber: '', copaymentRatio: '', medicalInsurance: '', disabilityCert: '', welfare: '' },
    certification: { careLevel: '', certPeriod: { raw: '' }, certDate: { raw: '' }, kindGroup: empty(), limitAmount: '', reason: '' },
    independence: { physical: empty(), cognitive: empty() },
    medical: { doctor: '', diagnosis1: '', diagnosis2: '', onsetDate: '', stability: '', specialMedical: '', managementNeed: '', remarks: '' },
    emergencyContacts: [],
    family: [],
    familyNote: '',
    complaint: { userWishes: '', familyWishes: '' },
    currentServices: [],
    rawSections: [],
  };
}

function parseAssessmentEmpty(): ImportedAssessment {
  const empty = (): AssessmentSection => ({ title: '', items: [] });
  return {
    health: empty(),
    adl: empty(),
    iadl: empty(),
    cognition: empty(),
    remarks: empty(),
    rawSections: [],
  };
}

function parseDoctorOpinionEmpty(): ImportedDoctorOpinion {
  return {
    header: {
      writtenDate: '',
      lastExamDate: '',
      opinionKind: { raw: '', selectedAll: [], options: [] },
      doctorName: '',
      clinic: '',
      tel: '',
    },
    sections: [],
  };
}

function parseCertSurveyEmpty(): ImportedCertificationSurvey {
  return {
    overview: {
      surveyDate: '',
      surveyor: '',
      pastCert: { raw: '', selectedAll: [], options: [] },
      previousResult: '',
      currentLife: '',
      familyStatus: { raw: '', selectedAll: [], options: [] },
    },
    groups: [],
    remarks: '',
  };
}
