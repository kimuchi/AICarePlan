import React from 'react';
import { S } from '../../styles';
import type { GeneratedPlan, BusinessMode } from '../../api';

interface Props {
  plan: GeneratedPlan;
  userName: string;
  birthDate: string;
  address: string;
  careLevel: string;
  certDate: string;
  certPeriod: { start: string; end: string };
  meta: { creator: string; facility: string; facilityAddress: string; createDate: string; firstCreateDate: string };
  mode: BusinessMode;
  onUpdate: (table1: GeneratedPlan['table1']) => void;
}

export default function Table1View({ plan, userName, birthDate, address, careLevel, certDate, certPeriod, meta, mode, onUpdate }: Props) {
  const t1 = plan.table1;

  const subtitle = mode === 'shoki'
    ? ' 兼小規模多機能型居宅介護計画書'
    : '';

  const handleChange = (field: keyof typeof t1, value: string) => {
    onUpdate({ ...t1, [field]: value });
  };

  return (
    <div style={S.formSheet}>
      <div style={S.sheetHeader}>
        <span style={S.sheetTag}>第1表</span>
        <h3 style={S.sheetTitle}>
          居宅サービス計画書(1)
          {subtitle && <span style={{ fontSize: 12, fontWeight: 400 }}>{subtitle}</span>}
        </h3>
        <div style={S.sheetDate}>作成年月日 {meta.createDate}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 4 }}>
        <span style={S.statusPill}>初回 ・ <strong>継続</strong></span>
        <span style={S.statusPill}><strong>認定済</strong> ・ 申請中</span>
      </div>

      <table style={{ ...S.formTable, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '31%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={S.tdLabel}>利用者名</td>
            <td style={S.tdValue}>{userName} 様</td>
            <td style={S.tdLabel}>生年月日</td>
            <td style={S.tdValue}>{birthDate}</td>
            <td style={S.tdLabel}>住所</td>
            <td style={{ ...S.tdValue, wordBreak: 'break-all' }}>{address}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>居宅サービス計画作成者氏名</td>
            <td colSpan={5} style={S.tdValue}>{meta.creator}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>居宅介護支援事業者・事業所名および所在地</td>
            <td colSpan={3} style={S.tdValue}>{meta.facility}</td>
            <td style={S.tdLabel}>住所</td>
            <td style={S.tdValue}>{meta.facilityAddress}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>居宅サービス計画作成(変更)日</td>
            <td colSpan={3} style={S.tdValue}>{meta.createDate}</td>
            <td style={S.tdLabel}>初回居宅サービス計画作成日</td>
            <td style={S.tdValue}>{meta.firstCreateDate}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>認定日</td>
            <td colSpan={2} style={S.tdValue}>{certDate}</td>
            <td style={S.tdLabel}>認定の有効期間</td>
            <td colSpan={2} style={S.tdValue}>{certPeriod.start} 〜 {certPeriod.end}</td>
          </tr>
          <tr>
            <td style={S.tdLabel}>要介護状態区分</td>
            <td colSpan={5} style={S.tdValue}>
              {['要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'].map((level, i) => (
                <span key={level}>
                  {i > 0 && ' ・ '}
                  {careLevel === level ? (
                    <strong style={{ background: '#fef3c7', padding: '2px 8px', borderRadius: 4, border: '1px solid #f59e0b' }}>{level}</strong>
                  ) : (
                    <span>{level}</span>
                  )}
                </span>
              ))}
              {careLevel && !['要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'].includes(careLevel) && (
                <span> ・ <strong style={{ background: '#fef3c7', padding: '2px 8px', borderRadius: 4 }}>{careLevel}</strong></span>
              )}
            </td>
          </tr>
          <tr>
            <td style={S.tdLabel}>利用者及び家族の<br />生活に対する<br />意向を踏まえた<br />課題分析の結果</td>
            <td colSpan={5} style={{ ...S.tdValue, padding: 0 }}>
              <textarea
                style={{ width: '100%', minHeight: 120, border: 'none', padding: '8px 12px', fontSize: 13, lineHeight: 1.7, fontFamily: 'Noto Sans JP', resize: 'vertical' }}
                value={`${t1.userWishes}\n${t1.familyWishes}\n${t1.assessmentResult}`}
                onChange={e => {
                  const lines = e.target.value.split('\n');
                  // Simple split — first line user, second family, rest assessment
                  handleChange('userWishes', lines[0] || '');
                  handleChange('familyWishes', lines[1] || '');
                  handleChange('assessmentResult', lines.slice(2).join('\n'));
                }}
              />
            </td>
          </tr>
          <tr>
            <td style={S.tdLabel}>介護認定審査会の<br />意見及びサービス<br />の種類の指定</td>
            <td colSpan={5} style={{ ...S.tdValue, padding: 0 }}>
              <input
                style={{ width: '100%', border: 'none', padding: '8px 12px', fontSize: 13, fontFamily: 'Noto Sans JP' }}
                value={t1.committeeOpinion}
                onChange={e => handleChange('committeeOpinion', e.target.value)}
              />
            </td>
          </tr>
          <tr>
            <td style={S.tdLabel}>総合的な援助の<br />方針</td>
            <td colSpan={5} style={{ ...S.tdValue, padding: 0 }}>
              <textarea
                style={{ width: '100%', minHeight: 150, border: 'none', padding: '8px 12px', fontSize: 13, lineHeight: 1.7, fontFamily: 'Noto Sans JP', resize: 'vertical' }}
                value={t1.totalPolicy}
                onChange={e => handleChange('totalPolicy', e.target.value)}
              />
            </td>
          </tr>
          <tr>
            <td style={S.tdLabel}>生活援助中心型の<br />算定理由</td>
            <td colSpan={5} style={S.tdValue}>{t1.livingSupportReason}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
