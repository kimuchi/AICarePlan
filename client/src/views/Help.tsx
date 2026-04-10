import React, { useEffect, useState } from 'react';
import { S } from '../styles';

interface Props {
  onBack: () => void;
}

/** 簡易Markdownレンダラー（テーブル対応） */
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) { i++; continue; }

    // 見出し
    if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} style={{ fontSize: 24, fontWeight: 700, margin: '32px 0 16px', color: '#0f2942' }}>{line.slice(2)}</h1>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} style={{ fontSize: 20, fontWeight: 700, margin: '28px 0 12px', color: '#1e3a5f', borderBottom: '2px solid #0f2942', paddingBottom: 6 }}>{line.slice(3)}</h2>);
      i++; continue;
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 8px', color: '#334155' }}>{line.slice(4)}</h3>);
      i++; continue;
    }

    // 水平線
    if (line.trim() === '---') { elements.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '16px 0' }} />); i++; continue; }

    // 引用
    if (line.startsWith('> ')) {
      elements.push(<blockquote key={key++} style={{ borderLeft: '4px solid #0f2942', padding: '8px 16px', margin: '8px 0', background: '#f0f7ff', borderRadius: '0 8px 8px 0', fontSize: 13, color: '#334155' }}>{formatInline(line.slice(2))}</blockquote>);
      i++; continue;
    }

    // テーブル
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1]?.includes('---')) {
      const headers = line.split('|').map(s => s.trim()).filter(Boolean);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map(s => s.trim()).filter(Boolean));
        i++;
      }
      elements.push(
        <table key={key++} style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, margin: '8px 0 16px' }}>
          <thead>
            <tr>{headers.map((h, j) => <th key={j} style={{ border: '1px solid #d1d9e0', padding: '8px 12px', background: '#f1f5f9', fontWeight: 600, textAlign: 'left' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ border: '1px solid #d1d9e0', padding: '8px 12px' }}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // リスト
    if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(lines[i].replace(/^[-*] /, ''));
        i++;
      }
      elements.push(
        <ul key={key++} style={{ margin: '8px 0', paddingLeft: 24, lineHeight: 1.8, fontSize: 14 }}>
          {items.map((item, j) => <li key={j}>{formatInline(item)}</li>)}
        </ul>
      );
      continue;
    }

    // 番号付きリスト
    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={key++} style={{ margin: '8px 0', paddingLeft: 24, lineHeight: 1.8, fontSize: 14 }}>
          {items.map((item, j) => <li key={j}>{formatInline(item)}</li>)}
        </ol>
      );
      continue;
    }

    // 通常のパラグラフ
    elements.push(<p key={key++} style={{ margin: '8px 0', lineHeight: 1.7, fontSize: 14, color: '#334155' }}>{formatInline(line)}</p>);
    i++;
  }

  return elements;
}

function formatInline(text: string): React.ReactNode {
  // **bold** → <strong>, `code` → <code>
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);

    const matches = [boldMatch, codeMatch].filter(Boolean).sort((a, b) => (a!.index || 0) - (b!.index || 0));

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const firstMatch = matches[0]!;
    const idx = firstMatch.index || 0;

    if (idx > 0) parts.push(remaining.slice(0, idx));

    if (firstMatch === boldMatch) {
      parts.push(<strong key={k++}>{firstMatch[1]}</strong>);
    } else {
      parts.push(<code key={k++} style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{firstMatch[1]}</code>);
    }

    remaining = remaining.slice(idx + firstMatch[0].length);
  }

  return <>{parts}</>;
}

export default function Help({ onBack }: Props) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/manual')
      .then(r => r.json())
      .then(r => setContent(r.content))
      .catch(() => setContent('# エラー\n\nマニュアルの読み込みに失敗しました。'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button style={S.backBtn} onClick={onBack}>&larr; 戻る</button>
        <h1 style={S.headerTitle}>ヘルプ</h1>
        <div style={{ width: 60 }} />
      </header>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
        {loading
          ? <p style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>読み込み中...</p>
          : renderMarkdown(content)
        }
      </main>
    </div>
  );
}
