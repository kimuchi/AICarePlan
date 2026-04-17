import React from 'react';
import { S } from '../../styles';
import type { GeneratedPlan, BusinessMode } from '../../api';

interface UserMeta {
  name: string;
  birthDate: string;
  address: string;
  careLevel: string;
  certDate: string;
  certPeriod: { start: string; end: string };
}

interface PlanMeta {
  creator: string;
  facility: string;
  facilityAddress: string;
  createDate: string;
  firstCreateDate: string;
}

interface Props {
  plan: GeneratedPlan;
  userMeta: UserMeta;
  planMeta: PlanMeta;
  mode: BusinessMode;
  onUpdateTable1: (table1: GeneratedPlan['table1']) => void;
  onUpdateUserMeta: (userMeta: UserMeta) => void;
  onUpdatePlanMeta: (planMeta: PlanMeta) => void;
}

const CARE_LEVELS = ['要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'];

const inS: React.CSSProperties = {
  width: '100%', border: 'none', background: 'transparent', padding: '4px 8px',
  fontSize: 13, fontFamily: 'Noto Sans JP', outline: 'none',
};
const taS: React.CSSProperties = {
  ...inS, resize: 'vertical', lineHeight: 1.7,
};

export default function Table1View({ plan, userMeta, planMeta, mode, onUpdateTable1, onUpdateUserMeta, onUpdatePlanMeta }: Props) {
  const t1 = plan.table1;
  const subtitle = mode === 'shoki' ? ' 兼小規模多機能型居宅介護計画書' : '';

  const setT1 = (field: keyof typeof t1, value: string) => onUpdateTable1({ ...t1, [field]: value });
  const setUM = (field: keyof UserMeta, value: any) => onUpdateUserMeta({ ...userMeta, [field]: value });
  const setPM = (field: keyof PlanMeta, value: string) => onUpdatePlanMeta({ ...planMeta, [field]: value });

  return (
    <div style={S.formSheet}>
      <div style={S.sheetHeader}>
        <span style={S.sheetTag}>第1表</span>
        <h3 style={S.sheetTitle}>
          居宅サービス計画書(1)
          {subtitle && <span style={{ fontSize: 12, fontWeight: 400 }}>{subtitle}</span>}
        </h3>
        <div style={S.sheetDate}>作成年月日 <input style={{ ...inS, width: 140, textAlign: 'right' }} value={planMeta.createDate} onChange={e => setPM('createDate', e.target.value)} /></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 4 }}>
        <span style={S.statusPill}>初回 ・ <strong>継続</strong></span>
        <span style={S.statusPill}><strong>認定済</strong> ・ 申請中</span>
      </div>

      <table style={{ ...S.formTable, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '48%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={S.tdLabel}>利用者名</td>
            <td style={{ ...S.tdValue, padding: 0 }}><input style={inS} value={userMeta.name} onChange={e => setUM('name', e.target.value)} /></td>
            <td style={S.tdLabel}>生年月日</td>
            <td style={{ ...S.tdValue, padding: 0 }}><input style={inS} value={userMeta.birthDate} onChange={e => setUM('birthDate', e.target.value)} placeholder="昭和○年○月○日" /></td>
          </tr>
          <tr>
            <td style={S.tdLabel}>住所</td>
            <td colSpan={3} style={{ ...S.tdValue, padding: 0 }}><input style={inS} value={userMeta.address} onChange={e => setUM('address', e.target.value)} /></td>
          </tr>
          <tr>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal' }}>居宅サービス計画<br />作成者氏名</td>
            <td colSpan={3} style={{ ...S.tdValue, padding: 0 }}><input style={inS} value={planMeta.creator} onChange={e => setPM('creator', e.target.value)} /></td>
          </tr>
          <tr>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal' }}>居宅介護支援事業者<br />・事業所名<br />および所在地</td>
            <td colSpan={3} style={{ ...S.tdValue, padding: 0 }}>
              <input style={inS} value={planMeta.facility} onChange={e => setPM('facility', e.target.value)} placeholder="事業所名" />
              <input style={{ ...inS, fontSize: 11, color: '#64748b' }} value={planMeta.facilityAddress} onChange={e => setPM('facilityAddress', e.target.value)} placeholder="所在地" />
            </td>
          </tr>
          <tr>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal' }}>居宅サービス計画<br />作成(変更)日</td>
            <td style={{ ...S.tdValue, padding: 0 }}><input style={inS} value={planMeta.createDate} onChange={e => setPM('createDate', e.target.value)} /></td>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal', fontSize: 11 }}>初回居宅サービス<br />計画作成日</td>
            <td style={{ ...S.tdValue, padding: 0 }}><input style={inS} value={planMeta.firstCreateDate} onChange={e => setPM('firstCreateDate', e.target.value)} /></td>
          </tr>
          <tr>
            <td style={S.tdLabel}>認定日</td>
            <td style={{ ...S.tdValue, padding: 0 }}><input style={inS} value={userMeta.certDate} onChange={e => setUM('certDate', e.target.value)} placeholder="令和○年○月○日" /></td>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal' }}>認定の<br />有効期間</td>
            <td style={{ ...S.tdValue, padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input style={{ ...inS, flex: 1 }} value={userMeta.certPeriod.start} onChange={e => setUM('certPeriod', { ...userMeta.certPeriod, start: e.target.value })} placeholder="令和○年○月○日" />
                <span style={{ fontSize: 12, color: '#64748b' }}>〜</span>
                <input style={{ ...inS, flex: 1 }} value={userMeta.certPeriod.end} onChange={e => setUM('certPeriod', { ...userMeta.certPeriod, end: e.target.value })} placeholder="令和○年○月○日" />
              </div>
            </td>
          </tr>
          <tr>
            <td style={S.tdLabel}>要介護状態区分</td>
            <td colSpan={3} style={{ ...S.tdValue, padding: '4px 8px' }}>
              <select style={{ ...inS, width: 'auto', padding: '4px 8px', border: '1px solid #d1d9e0', borderRadius: 4, background: '#fff' }}
                value={userMeta.careLevel}
                onChange={e => setUM('careLevel', e.target.value)}>
                <option value="">（未選択）</option>
                {CARE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <span style={{ marginLeft: 12, fontSize: 11, color: '#94a3b8' }}>
                {CARE_LEVELS.map((level, i) => {
                  const match = userMeta.careLevel === level;
                  return (
                    <span key={level}>
                      {i > 0 && ' ・ '}
                      {match ? <strong style={{ color: '#b45309' }}>{level}</strong> : <span>{level}</span>}
                    </span>
                  );
                })}
              </span>
            </td>
          </tr>
          <tr>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal' }}>利用者及び家族の<br />生活に対する意向を<br />踏まえた課題分析<br />の結果</td>
            <td colSpan={3} style={{ ...S.tdValue, padding: 0 }}>
              <textarea style={{ ...taS, minHeight: 120 }}
                value={`${t1.userWishes}\n${t1.familyWishes}\n${t1.assessmentResult}`}
                onChange={e => {
                  const lines = e.target.value.split('\n');
                  onUpdateTable1({
                    ...t1,
                    userWishes: lines[0] || '',
                    familyWishes: lines[1] || '',
                    assessmentResult: lines.slice(2).join('\n'),
                  });
                }} />
            </td>
          </tr>
          <tr>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal' }}>介護認定審査会の<br />意見及びサービス<br />の種類の指定</td>
            <td colSpan={3} style={{ ...S.tdValue, padding: 0 }}>
              <input style={inS} value={t1.committeeOpinion} onChange={e => setT1('committeeOpinion', e.target.value)} />
            </td>
          </tr>
          <tr>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal' }}>総合的な援助の<br />方針</td>
            <td colSpan={3} style={{ ...S.tdValue, padding: 0 }}>
              <textarea style={{ ...taS, minHeight: 150 }} value={t1.totalPolicy} onChange={e => setT1('totalPolicy', e.target.value)} />
            </td>
          </tr>
          <tr>
            <td style={{ ...S.tdLabel, whiteSpace: 'normal' }}>生活援助中心型の<br />算定理由</td>
            <td colSpan={3} style={{ ...S.tdValue, padding: 0 }}>
              <input style={inS} value={t1.livingSupportReason} onChange={e => setT1('livingSupportReason', e.target.value)} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
