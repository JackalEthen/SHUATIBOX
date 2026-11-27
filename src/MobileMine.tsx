import { t, fmtNumber } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { errorText, loadStats, saveAvatarFile, saveProfile, type Bootstrap, type Profile, type StatsDto } from './api';
import { Icon } from './icons';
import { APP_VERSION } from './version';

interface Props {
  data: Bootstrap;
  profile: Profile;
  onProfileChange: () => void;
  onStats: () => void;
  onSettings: () => void;
  onFavorites: () => void;
  onBank: () => void;
  onImport: () => void;
  onReader: () => void;
  onNotice: (message: string) => void;
}

function fmt(value: number) {
  return fmtNumber(value);
}

const isAndroid = () => /android/i.test(navigator.userAgent);

export function MobileMine({ data, profile, onProfileChange, onStats, onSettings, onFavorites, onBank, onImport, onReader, onNotice }: Props) {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStats(30).then(setStats).catch((error) => onNotice(t("统计加载失败：{p0}", { p0: errorText(error) })));
  }, []);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const avatarUrl = profile.avatar ? convertFileSrc(profile.avatar) : '';

  const pickAvatar = async () => {
    try {
      let source: string | null = null;
      if (isAndroid()) {
        const uri = await invoke<string>('saf_pick', { kind: 'image' });
        source = await invoke<string>('saf_materialize', { uri, maxDepth: 1 });
      } else {
        const value = await open({ directory: false, multiple: false, filters: [{ name: t("图片"), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] });
        if (!value || Array.isArray(value)) return;
        source = value;
      }
      if (!source) return;
      const saved = await saveAvatarFile(source);
      await saveProfile({ avatar: saved });
      onProfileChange();
      onNotice(t("头像已更新"));
    } catch (error) {
      onNotice(t("设置头像失败：{p0}", { p0: errorText(error) }));
    }
  };

  const commitName = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === profile.name) {
      setDraft(profile.name);
      return;
    }
    try {
      await saveProfile({ name: next });
      onProfileChange();
      onNotice(t("用户名已更新"));
    } catch (error) {
      setDraft(profile.name);
      onNotice(t("修改失败：{p0}", { p0: errorText(error) }));
    }
  };

  const rows = [
    { icon: 'stats' as const, title: t("学习统计"), onClick: onStats },
    { icon: 'star' as const, title: t("我的收藏"), onClick: onFavorites },
    { icon: 'library' as const, title: t("题库管理"), onClick: onBank },
    { icon: 'settings' as const, title: t("偏好设置"), onClick: onSettings },
    { icon: 'book' as const, title: t("Markdown 阅读器"), onClick: onReader },
    { icon: 'library' as const, title: t("导入题库"), onClick: onImport },
  ];

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-3">
        <button
          className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center serif text-[22px] overflow-hidden shrink-0"
          onClick={() => void pickAvatar()}
          aria-label={t("更换头像")}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={t("头像")} className="w-full h-full object-cover" />
          ) : (
            profile.name.slice(0, 1)
          )}
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              className="text-[16px] font-semibold w-full bg-transparent border-b border-[var(--accent)] outline-none"
              value={draft}
              maxLength={20}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitName();
                if (event.key === 'Escape') {
                  setDraft(profile.name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button className="text-[16px] font-semibold text-left" onClick={() => setEditing(true)}>
              {profile.name}
            </button>
          )}
          <div className="text-[11.5px] text-[var(--muted)] mt-0.5">{t("数据保存在本机")}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mt-4">
        <div className="card p-3 text-center">
          <div className="text-[17px] font-semibold">{stats ? fmt(stats.totalAnswered) : '—'}</div>
          <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{t("累计刷题")}</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-[17px] font-semibold">{stats ? `${stats.accuracy}%` : '—'}</div>
          <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{t("总正确率")}</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-[17px] font-semibold">{data.streak.current}  {t("天")}</div>
          <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{t("连续学习")}</div>
        </div>
      </div>

      <div className="card mt-3 overflow-hidden">
        {rows.map((row, index) => (
          <button
            key={row.title}
            className={`w-full p-4 flex items-center gap-3 text-left ${index < rows.length - 1 ? 'border-b border-[var(--line)]' : ''}`}
            onClick={row.onClick}
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center">
              <Icon name={row.icon} className="w-4 h-4" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-medium">{row.title}</div>
            </div>
            <Icon name="chevronRight" className="w-4 h-4 text-[var(--muted)]" />
          </button>
        ))}
      </div>

      <div className="card mt-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium">{t("当前题库")}</span>
          <span className="chip active">{t("启用中")}</span>
        </div>
        <div className="text-[11.5px] text-[var(--muted)] mt-2 leading-5">
          {data.bank.title} · {fmt(data.bank.questionCount)}  {t("题 ·")} {fmt(data.bank.paperCount)}  {t("套卷")}
          {data.bank.reviewCount > 0 ? t(" · {p0} 题待校对", { p0: data.bank.reviewCount }) : ''}
        </div>
      </div>

      <div className="text-center text-[10.5px] text-[var(--muted)] mt-4 leading-5">

        {t("刷题盒子 SHUATIBOX v")}{APP_VERSION}
      </div>
      <div className="h-4" />
    </div>
  );
}