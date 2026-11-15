import { t } from './i18n';
import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { downloadUpdate, errorText, resolveUpdateDownload, type UpdateInfo } from './api';
import { Modal } from './Modal';

interface Props {
  info: UpdateInfo | null;
  mobile?: boolean;
  onClose: () => void;
  onNotice?: (message: string) => void;
}

export function UpdateDialog({ info, mobile, onClose, onNotice }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!info) return null;

  const isAndroid = /android/i.test(navigator.userAgent);
  const hintClass = mobile ? 'text-[10.5px]' : 'text-[11.5px]';

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      if (!info.downloadUrl) {
        await openUrl(info.pageUrl);
        onClose();
        return;
      }
      const resolved = await resolveUpdateDownload(info.downloadUrl);
      if (isAndroid) {
        await downloadUpdate(resolved.url, info.assetName ?? `shuatibox-${info.latestVersion}.apk`);
        onNotice?.(t("已开始下载，请查看通知栏"));
      } else {
        await openUrl(resolved.url);
      }
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t("发现新版本 v{p0}", { p0: info.latestVersion })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t("取消")}</button>
          <button className="btn btn-primary" onClick={() => void download()} disabled={busy}>
            {busy ? t("准备下载…") : info.downloadUrl ? t("下载更新") : t("打开下载页")}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <div className={`${hintClass} text-[var(--muted)]`}>

          {t("当前 v")}{info.currentVersion}  {t("· 最新 v")}{info.latestVersion}
        </div>
        {info.title ? <div className="text-[13px] font-medium">{info.title}</div> : null}
        {info.notes ? (
          <div className={`${hintClass} text-[var(--ink-2)] max-h-56 overflow-y-auto scroll whitespace-pre-wrap leading-5`}>
            {info.notes}
          </div>
        ) : null}
        {isAndroid && !info.downloadUrl ? (
          <div className={`${hintClass} text-[var(--warn)]`}>
            {t("当前版本没有适配此设备架构的安装包，请打开下载页手动选择。")}
          </div>
        ) : null}
        {info.assetName ? (
          <div className={`${hintClass} text-[var(--muted)] truncate`}>
            {info.assetName}
            {info.assetSize ? ` · ${(info.assetSize / 1024 / 1024).toFixed(1)} MB` : ''}
          </div>
        ) : null}
        {error ? <div className={`${hintClass} text-[var(--bad)] break-all`}>{error}</div> : null}
      </div>
    </Modal>
  );
}
