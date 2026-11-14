import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { checkUpdate, errorText, resolveUpdateDownload, type UpdateInfo } from './api';
import { APP_VERSION } from './version';

interface Props {
  mobile?: boolean;
}

export function UpdateCard({ mobile }: Props) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [mirrored, setMirrored] = useState(false);

  const load = async () => {
    setChecking(true);
    setError('');
    setMirrored(false);
    try {
      setInfo(await checkUpdate());
    } catch (err) {
      setInfo(null);
      setError(errorText(err));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const download = async () => {
    const target = info?.downloadUrl ?? info?.pageUrl;
    if (!target) return;
    setOpening(true);
    setError('');
    setMirrored(false);
    try {
      const resolved = await resolveUpdateDownload(target);
      setMirrored(resolved.mirrored);
      await openUrl(resolved.url);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setOpening(false);
    }
  };

  const titleClass = mobile ? 'text-[13px]' : 'text-[13.5px]';
  const hintClass = 'text-[10.5px]';

  return (
    <div className={mobile ? 'card mt-3 p-4' : 'card mt-4 p-5'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`${titleClass} font-semibold`}>软件更新</h3>
          <p className={`${hintClass} text-[var(--muted)] mt-1`}>
            当前版本 v{info?.currentVersion ?? APP_VERSION}
          </p>
        </div>
        <button className="chip" onClick={() => void load()} disabled={checking || opening}>
          {checking ? '检查中…' : '检查更新'}
        </button>
      </div>

      {checking && !info ? (
        <div className={`${hintClass} text-[var(--muted)] mt-3`}>正在检查 GitHub 最新版本…</div>
      ) : null}

      {error ? (
        <div className={`${hintClass} text-[var(--bad)] mt-3 break-all`}>{error}</div>
      ) : null}

      {info ? (
        info.hasUpdate ? (
          <>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span className="chip-accent">v{info.latestVersion}</span>
              <span className={`${hintClass} text-[var(--ink-2)]`}>{info.title}</span>
            </div>
            {info.notes ? (
              <div className={`${hintClass} text-[var(--ink-2)] mt-2 max-h-28 overflow-y-auto scroll whitespace-pre-wrap leading-5`}>
                {info.notes}
              </div>
            ) : null}
            <div className="flex items-center gap-3 mt-3">
              <button className="btn btn-primary btn-sm" onClick={() => void download()} disabled={opening}>
                {opening ? '检测连接中…' : info.downloadUrl ? '下载更新' : '打开下载页'}
              </button>
              {info.assetName ? (
                <span className={`${hintClass} text-[var(--muted)] truncate`}>
                  {info.assetName}
                  {info.assetSize ? ` · ${(info.assetSize / 1024 / 1024).toFixed(1)} MB` : ''}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <div className={`${hintClass} text-[var(--muted)] mt-3`}>
            已是最新版本 v{info.currentVersion}
          </div>
        )
      ) : null}

      {mirrored ? (
        <div className={`${hintClass} text-[var(--warn)] mt-2`}>
          GitHub 连接失败，已切换 fastgit.cc 加速下载
        </div>
      ) : null}
    </div>
  );
}
