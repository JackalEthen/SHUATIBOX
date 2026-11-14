import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { checkUpdate, errorText, getSettings, setSettings, type UpdateInfo } from './api';
import { APP_VERSION } from './version';
import { UpdateDialog } from './UpdateDialog';

const REPO_URL = 'https://github.com/JackalEthen/SHUATIBOX';

interface Props {
  mobile?: boolean;
  onNotice?: (message: string) => void;
}

type Status = 'idle' | 'checking' | 'latest' | 'error' | 'update';

const labels: Record<Status, string> = {
  idle: '检查更新',
  checking: '检查中…',
  latest: '已是最新版',
  error: '检查失败',
  update: '发现最新版',
};

export function UpdateCard({ mobile, onNotice }: Props) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [auto, setAuto] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState('');

  const load = async (showDialog: boolean) => {
    setStatus('checking');
    setError('');
    try {
      const next = await checkUpdate();
      setInfo(next);
      setStatus(next.hasUpdate ? 'update' : 'latest');
      if (next.hasUpdate && showDialog) setDialogOpen(true);
    } catch (err) {
      setStatus('error');
      setError(errorText(err));
    }
  };

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((values) => {
        if (cancelled) return;
        const enabled = values.auto_update_check !== '0';
        setAuto(enabled);
        if (enabled) void load(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAuto = async () => {
    const next = !auto;
    setAuto(next);
    try {
      await setSettings({ auto_update_check: next ? '1' : '0' });
      if (next && status === 'idle') void load(false);
    } catch (err) {
      setAuto(!next);
      setError(errorText(err));
    }
  };

  const titleClass = mobile ? 'text-[13px]' : 'text-[13.5px]';
  const hintClass = 'text-[10.5px]';

  const onClickCheck = () => {
    if (status === 'update' && info) {
      setDialogOpen(true);
      return;
    }
    void load(true);
  };

  return (
    <div className={mobile ? 'card mt-3 p-4' : 'card mt-4 p-5'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`${titleClass} font-semibold`}>软件更新</h3>
          <p className={`${hintClass} text-[var(--muted)] mt-1`}>
            当前版本 v{info?.currentVersion ?? APP_VERSION}
          </p>
        </div>
        <button className="chip shrink-0" onClick={onClickCheck} disabled={status === 'checking'}>
          {labels[status]}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px]">自动检查更新</div>
          <div className={`${hintClass} text-[var(--muted)] mt-0.5`}>开启后启动应用时检查一次</div>
        </div>
        <button className={`chip shrink-0 ${auto ? 'active' : ''}`} onClick={() => void toggleAuto()}>
          {auto ? '已开启' : '已关闭'}
        </button>
      </div>

      <button
        className={`${hintClass} text-[var(--muted)] mt-3 truncate max-w-full text-left hover:text-[var(--accent-ink)]`}
        onClick={() => void openUrl(REPO_URL).catch((err) => setError(errorText(err)))}
        title={REPO_URL}
      >
        {REPO_URL.replace('https://', '')}
      </button>

      {status === 'update' && info ? (
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <span className="chip-accent">v{info.latestVersion}</span>
          <span className={`${hintClass} text-[var(--ink-2)]`}>{info.title}</span>
        </div>
      ) : null}

      {status === 'latest' ? (
        <div className={`${hintClass} text-[var(--muted)] mt-3`}>已是最新版本 v{info?.currentVersion}</div>
      ) : null}

      {error ? <div className={`${hintClass} text-[var(--bad)] mt-3 break-all`}>{error}</div> : null}

      <UpdateDialog
        info={dialogOpen ? info : null}
        mobile={mobile}
        onClose={() => setDialogOpen(false)}
        onNotice={onNotice}
      />
    </div>
  );
}
