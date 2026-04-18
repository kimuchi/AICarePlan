import React, { useEffect, useState } from 'react';
import { getCareplanLatest, getAssessmentLatest } from '../../api';

export default function ReferencePanel({ folderId }: { folderId?: string }) {
  const [careplan, setCareplan] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!folderId) return;
    getCareplanLatest(folderId).then(setCareplan).catch(() => setCareplan({ found: false }));
    getAssessmentLatest(folderId).then(setAssessment).catch(() => setAssessment({ found: false }));
  }, [folderId]);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, marginTop: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>参考情報</b>
        <button onClick={() => setOpen(v => !v)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 6, padding: '4px 8px' }}>{open ? '閉じる' : '開く'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 8, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>
          <div><b>ケアプラン拡張情報</b></div>
          <pre>{JSON.stringify(careplan?.data || { found: false }, null, 2)}</pre>
          <div><b>フェイスシート・アセスメント</b></div>
          <pre>{JSON.stringify(assessment?.data || { found: false }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
