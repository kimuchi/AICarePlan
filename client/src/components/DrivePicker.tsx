import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getPickerConfig } from '../api';

/** Google Drive Picker でファイルを選択した結果 */
export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
}

interface Props {
  onPick: (files: PickedFile[]) => void;
  buttonLabel?: string;
  multiSelect?: boolean;
  style?: React.CSSProperties;
}

// Google Picker API のスクリプトを一度だけ読み込む
let pickerApiLoaded = false;
let pickerApiLoading = false;
const loadCallbacks: Array<() => void> = [];

function loadPickerApi(): Promise<void> {
  if (pickerApiLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    loadCallbacks.push(resolve);
    if (pickerApiLoading) return;
    pickerApiLoading = true;

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      (window as any).gapi.load('picker', () => {
        pickerApiLoaded = true;
        loadCallbacks.forEach(cb => cb());
        loadCallbacks.length = 0;
      });
    };
    document.head.appendChild(script);
  });
}

/**
 * Google Drive Picker を使ってファイルを選択するボタン。
 * クリックすると Google のファイル選択ダイアログが開く。
 */
export default function DrivePicker({ onPick, buttonLabel, multiSelect, style }: Props) {
  const [loading, setLoading] = useState(false);

  const openPicker = useCallback(async () => {
    setLoading(true);
    try {
      await loadPickerApi();
      const config = await getPickerConfig();

      const google = (window as any).google;
      const picker = new google.picker.PickerBuilder()
        .addView(
          new google.picker.DocsView()
            .setIncludeFolders(false)
            .setSelectFolderEnabled(false)
        )
        .addView(
          new google.picker.DocsView(google.picker.ViewId.DOCS)
        )
        .setOAuthToken(config.accessToken)
        .setDeveloperKey('') // Picker API は OAuth トークンがあればAPI Keyは空でOK
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const files: PickedFile[] = data.docs.map((doc: any) => ({
              id: doc.id,
              name: doc.name,
              mimeType: doc.mimeType,
            }));
            onPick(files);
          }
        })
        .setTitle('知識ファイルを選択')
        .setLocale('ja');

      if (multiSelect) {
        picker.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      }

      picker.build().setVisible(true);
    } catch (err: any) {
      console.error('Picker error:', err);
      alert(`ファイル選択エラー: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [onPick, multiSelect]);

  return (
    <button
      type="button"
      onClick={openPicker}
      disabled={loading}
      style={{
        padding: '10px 18px',
        borderRadius: 10,
        border: '1px solid #d1d9e0',
        background: '#fff',
        color: '#0f2942',
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
        ...style,
      }}
    >
      {loading ? '読み込み中...' : (buttonLabel || 'Googleドライブから選択')}
    </button>
  );
}
