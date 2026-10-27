import { useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  clearHistory,
  deleteBank,
  errorText,
  exportBackup,
  importBackup,
  revalidateBank,
  saveAvatarFile,
  saveProfile,
  setSettings,
  switchBank,
  type BankDto,
  type Bootstrap,
  type Profile,
} from './api';
import { Icon } from './icons';
import { Modal } from './Modal';
import type { Appearance, QSize } from './theme';

interface Props {
  data: Bootstrap;
  appearance: Appearance;
  profile: Profile;
  onProfileChange: () => void;
  onRefresh: () => void;
  onNotice: (message: string) => void;
  onImport: () => void;
}

export function DesktopSettings({ data, appearance, profile, onProfileChange, onRefresh, onNotice, onImport }: Props) {
  const { accent, setAccent, dark, setDark, qsize, setQSize } = appearance;
  const [confirmBank, setConfirmBank] = useState<BankDto | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [practiceMode, setPracticeMode] = useState(data.settings.practice_mode ?? 'instant');
  const [archive, setArchive] = useState(data.settings.archive_streak ?? '2');
  const [goal, setGoal] = useState(data.settings.daily_goal ?? '50');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);

  const avatarUrl = profile.avatar ? convertFileSrc(profile.avatar) : '';

  const pickAvatar = async () => {
    try {
      const value = await open({
        multiple: false,
        directory: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      });
      if (!value || Array.isArray(value)) return;
      const saved = await saveAvatarFile(value);
      await saveProfile({ avatar: saved });
      onProfileChange();
      onNotice('头像已更新');
    } catch (error) {
      onNotice(`设置头像失败：${errorText(error)}`);
    }
  };

  const commitName = async () => {
    const next = draftName.trim();
    setEditingName(false);
    if (!next || next === profile.name) {
      setDraftName(profile.name);
      return;
    }
    try {
      await saveProfile({ name: next });
      onProfileChange();
      onNotice('用户名已更新');
    } catch (error) {
      setDraftName(profile.name);
      onNotice(`修改失败：${errorText(error)}`);
    }
  };

  const saveSetting = (values: Record<string, string>) => {
    setSettings(values).catch((error) => onNotice(`设置保存失败：${errorText(error)}`));
  };

  const chooseBackupPath = async () => {
    const path = await save({
      defaultPath: 'shuatibox-backup.db',
      filters: [{ name: 'SQLite 备份', extensions: ['db'] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      await exportBackup(path);
      onNotice('备份已导出');
    } catch (error) {
      onNotice(`导出失败：${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const chooseBackup = async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'SQLite 备份', extensions: ['db'] }],
    });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    try {
      await importBackup(path);
      onNotice('备份已恢复');
      onRefresh();
    } catch (error) {
      onNotice(`恢复失败：${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="screen active">
      <div className="max-w-[1080px] mx-auto px-8 py-8">
        <h1 className="text-[24px] font-semibold tracking-tight">设置</h1>
        <p className="text-[12.5px] text-[var(--muted)] mt-1.5">本地离线 · 数据仅保存在应用私有目录</p>

        <div className="card p-5 mt-6 flex items-center gap-4">
          <button
            className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center serif text-[28px] overflow-hidden shrink-0"
            onClick={() => void pickAvatar()}
            aria-label="更换头像"
          >
            {avatarUrl ? <img src={avatarUrl} alt="头像" className="w-full h-full object-cover" /> : profile.name.slice(0, 1)}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] text-[var(--muted)] mb-1">用户名</div>
            {editingName ? (
              <input
                autoFocus
                className="text-[18px] font-semibold w-full bg-transparent border-b border-[var(--accent)] outline-none"
                value={draftName}
                maxLength={20}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => void commitName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commitName();
                  if (event.key === 'Escape') {
                    setDraftName(profile.name);
                    setEditingName(false);
                  }
                }}
              />
            ) : (
              <button className="text-[18px] font-semibold text-left" onClick={() => setEditingName(true)}>
                {profile.name}
              </button>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => void pickAvatar()}>更换头像</button>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="card p-5">
            <h2 className="text-[13.5px] font-semibold">外观</h2>
            <div className="mt-4 space-y-5">
              <div>
                <div className="text-[11.5px] text-[var(--muted)] mb-2">主题色</div>
                <div className="flex items-center gap-2">
                  {[
                    ['blue', '#7FA6CF'],
                    ['orange', '#D08A5A'],
                    ['teal', '#63A695'],
                    ['pink', '#D092A0'],
                    ['purple', '#9C8FC4'],
                  ].map(([key, color]) => (
                    <button
                      key={key}
                      className={`dot ${accent === key ? 'active' : ''}`}
                      style={{ background: color }}
                      onClick={() => setAccent(key as Appearance['accent'])}
                      aria-label={key}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px]">深色模式</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">墨色纸面，夜间刷题更省眼</div>
                </div>
                <button className={`chip ${dark ? 'active' : ''}`} onClick={() => setDark(!dark)}>
                  {dark ? '已开启' : '关闭'}
                </button>
              </div>
              <div>
                <div className="text-[11.5px] text-[var(--muted)] mb-2">题干字号</div>
                <div className="seg">
                  {[
                    ['s', '小'],
                    ['m', '标准'],
                    ['l', '大'],
                  ].map(([key, label]) => (
                    <button key={key} className={qsize === key ? 'active' : ''} onClick={() => setQSize(key as QSize)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-[13.5px] font-semibold">刷题</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px]">默认显示答案</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">进入练习时的判分方式</div>
                </div>
                <select
                  className="chip bg-transparent"
                  value={practiceMode}
                  onChange={(event) => {
                    setPracticeMode(event.target.value);
                    saveSetting({ practice_mode: event.target.value });
                  }}
                >
                  <option value="instant">逐题显示</option>
                  <option value="deferred">交卷后显示</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px]">连续答对归档</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">错题连续答对后移入已掌握</div>
                </div>
                <select
                  className="chip bg-transparent"
                  value={archive}
                  onChange={(event) => {
                    setArchive(event.target.value);
                    saveSetting({ archive_streak: event.target.value });
                  }}
                >
                  <option value="1">1 次</option>
                  <option value="2">2 次</option>
                  <option value="3">3 次</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px]">每日目标</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">首页进度按此计算</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="chip bg-transparent w-16 text-center outline-none"
                    type="number"
                    min={1}
                    max={500}
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    onBlur={() => saveSetting({ daily_goal: String(Math.max(1, Number(goal) || 50)) })}
                  />
                  <span className="text-[10.5px] text-[var(--muted)]">题</span>
                </div>
              </div>
              <div className="text-[10.5px] text-[var(--muted)] leading-5">
                快捷键：A–H 选择，← → 翻题，F 收藏，标记按钮记录疑问题。
              </div>
            </div>
          </div>
        </div>

        <div className="card mt-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[13.5px] font-semibold">题库管理</h2>
              <div className="text-[10.5px] text-[var(--muted)] mt-1">多个题库互斥，同一时间仅一个启用。切换后进度、错题、统计随题库切换。</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={onImport}>
              <Icon name="library" />
              导入新题库
            </button>
          </div>
          <div className="mt-4 divide-y divide-[var(--line)]">
            {data.banks.map((bank) => (
              <div key={bank.id} className="flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center">
                  <Icon name="library" className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium">
                    {bank.title} {bank.active ? <span className="chip-accent ml-2">启用中</span> : null}
                  </div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5 truncate">
                    {bank.questionCount.toLocaleString('zh-CN')} 题 · {bank.paperCount} 套卷 · 导入于 {bank.importedAt}
                  </div>
                </div>
                {!bank.active ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      switchBank(bank.id)
                        .then(() => {
                          onNotice('题库已切换');
                          onRefresh();
                        })
                        .catch((error) => onNotice(`切换失败：${errorText(error)}`))
                    }
                  >
                    启用
                  </button>
                ) : null}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    revalidateBank(bank.id)
                      .then(() => {
                        onNotice('校验完成');
                        onRefresh();
                      })
                      .catch((error) => onNotice(`校验失败：${errorText(error)}`))
                  }
                >
                  校验
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmBank(bank)}>
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card mt-4 p-5">
          <h2 className="text-[13.5px] font-semibold">数据</h2>
          <div className="text-[10.5px] text-[var(--muted)] mt-1 leading-5">
            进度、错题、笔记、收藏保存在本地；备份不含题库图片，换设备后重新导入题库即可。
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button className="btn btn-ghost" onClick={() => void chooseBackupPath()} disabled={busy}>
              导出进度备份
            </button>
            <button className="btn btn-ghost" onClick={() => void chooseBackup()} disabled={busy}>
              导入备份
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
              清空学习记录
            </button>
          </div>
        </div>

        <div className="text-[10.5px] text-[var(--muted)] mt-6">
          刷题盒子 SHUATIBOX v0.1 · 本地离线 · 题库来源 ERRRC/xingcezhenti
          <br />
          图片仅存于应用私有目录，不写入系统图库。
        </div>
      </div>

      <Modal
        open={!!confirmBank}
        title="删除题库？"
        onClose={() => setConfirmBank(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmBank(null)}>取消</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirmBank) return;
                deleteBank(confirmBank.id)
                  .then(() => {
                    setConfirmBank(null);
                    onNotice('题库已删除');
                    onRefresh();
                  })
                  .catch((error) => onNotice(`删除失败：${errorText(error)}`));
              }}
            >
              确认删除
            </button>
          </>
        }
      >
        <p className="text-[13px] leading-7 text-[var(--ink-2)]">
          将删除题库文件、该题库的进度、错题、笔记与收藏。此操作不可撤销。
        </p>
      </Modal>

      <Modal
        open={confirmClear}
        title="清空学习记录？"
        onClose={() => setConfirmClear(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmClear(false)}>取消</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                clearHistory()
                  .then(() => {
                    setConfirmClear(false);
                    onNotice('学习记录已清空');
                    onRefresh();
                  })
                  .catch((error) => onNotice(`清空失败：${errorText(error)}`));
              }}
            >
              确认清空
            </button>
          </>
        }
      >
        <p className="text-[13px] leading-7 text-[var(--ink-2)]">
          会清空所有练习记录、错题、收藏、笔记和反馈；题库文件不会被删除。
        </p>
      </Modal>
    </section>
  );
}
