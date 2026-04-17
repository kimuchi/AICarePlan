import React, { useCallback, useState } from 'react';
import { getPickerConfig } from '../api';

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

export default function DrivePicker({ onPick, buttonLabel, multiSelect, style }: Props) {
  const [loading, setLoading] = useState(false);

  const openPicker = useCallback(async () => {
    setLoading(true);
    try {
      await loadPickerApi();
      const config = await getPickerConfig();
      const google = (window as any).google;

      // フォルダをたどれるビュー（マイドライブ + 共有ドライブ両対応）
      const docsView = new google.picker.DocsView()
        .setIncludeFolders(true)        // フォルダを表示
        .setSelectFolderEnabled(false)  // フォルダ自体は選択不可（中に入る用）
        .setParent('root');             // マイドライブのルートから開始

      const sharedView = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setEnableDrives(true);         // 共有ドライブも表示

      const builder = new google.picker.PickerBuilder()
        .addView(docsView)
        .addView(sharedView)
        .setOAuthToken(config.accessToken)
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
        .setLocale('ja')
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES); // 共有ドライブ対応

      if (multiSelect) {
        builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      }

      builder.build().setVisible(true);
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
