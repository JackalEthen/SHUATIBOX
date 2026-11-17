import { setLang, t, useLang, fmtNumber } from './i18n';
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
import { FontSettings } from './FontSettings';
import { AiConfigDialog } from './AiConfigDialog';
import { BankRenameDialog } from './BankRenameDialog';
import { Icon } from './icons';
import { UpdateCard } from './UpdateCard';
import { APP_VERSION } from './version';
import { Modal } from './Modal';
import type { Appearance, FontScale } from './theme';

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
  const { accent, setAccent, dark, setDark, fontScale, setFontScale, appFont, setAppFont, practiceFont, setPracticeFont } = appearance;
  const lang = useLang();
  const [confirmBank, setConfirmBank] = useState<BankDto | null>(null);
  const [renameBank, setRenameBank] = useState<BankDto | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [practiceMode, setPracticeMode] = useState(data.settings.practice_mode ?? 'instant');
  const [archive, setArchive] = useState(data.settings.archive_streak ?? '2');
  const reviewEnabled = data.settings.review_enabled !== '0';
  const reviewLimit = data.settings.review_limit ?? '50';
  const [goal, setGoal] = useState(data.settings.daily_goal ?? '50');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

  const avatarUrl = profile.avatar ? convertFileSrc(profile.avatar) : '';

  const pickAvatar = async () => {
    try {
      const value = await open({
        multiple: false,
        directory: false,
        filters: [{ name: t("图片"), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      });
      if (!value || Array.isArray(value)) return;
      const saved = await saveAvatarFile(value);
      await saveProfile({ avatar: saved });
      onProfileChange();
      onNotice(t("头像已更新"));
    } catch (error) {
      onNotice(t("设置头像失败：{p0}", { p0: errorText(error) }));
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
      onNotice(t("用户名已更新"));
    } catch (error) {
      setDraftName(profile.name);
      onNotice(t("修改失败：{p0}", { p0: errorText(error) }));
    }
  };

  const saveSetting = (values: Record<string, string>) => {
    setSettings(values).catch((error) => onNotice(t("设置保存失败：{p0}", { p0: errorText(error) })));
  };

  const saveAndRefresh = (values: Record<string, string>) => {
    setSettings(values)
      .then(onRefresh)
      .catch((error) => onNotice(t("设置保存失败：{p0}", { p0: errorText(error) })));
  };

  const chooseBackupPath = async () => {
    const path = await save({
      defaultPath: 'shuatibox-backup.db',
      filters: [{ name: t("SQLite 备份"), extensions: ['db'] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      await exportBackup(path);
      onNotice(t("备份已导出"));
    } catch (error) {
      onNotice(t("导出失败：{p0}", { p0: errorText(error) }));
    } finally {
      setBusy(false);
    }
  };

  const chooseBackup = async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t("SQLite 备份"), extensions: ['db'] }],
    });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    try {
      await importBackup(path);
      onNotice(t("备份已恢复"));
      onRefresh();
    } catch (error) {
      onNotice(t("恢复失败：{p0}", { p0: errorText(error) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="screen active">
      <div className="max-w-[1080px] mx-auto px-8 py-8">
        <h1 className="text-[24px] font-semibold tracking-tight">{t("设置")}</h1>
        <p className="text-[12.5px] text-[var(--muted)] mt-1.5">{t("本地离线 · 数据仅保存在应用私有目录")}</p>

        <div className="card p-5 mt-6 flex items-center gap-4">
          <button
            className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center serif text-[28px] overflow-hidden shrink-0"
            onClick={() => void pickAvatar()}
            aria-label={t("更换头像")}
          >
            {avatarUrl ? <img src={avatarUrl} alt={t("头像")} className="w-full h-full object-cover" /> : profile.name.slice(0, 1)}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] text-[var(--muted)] mb-1">{t("用户名")}</div>
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
          <button className="btn btn-ghost btn-sm" onClick={() => void pickAvatar()}>{t("更换头像")}</button>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="card p-5">
            <h2 className="text-[13.5px] font-semibold">{t("外观")}</h2>
            <div className="mt-4 space-y-5">
              <div>
                <div className="text-[11.5px] text-[var(--muted)] mb-2">{t("主题色")}</div>
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
                  <div className="text-[12px]">{t("深色模式")}</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{t("墨色纸面，夜间刷题更省眼")}</div>
                </div>
                <button className={`chip ${dark ? 'active' : ''}`} onClick={() => setDark(!dark)}>
                  {dark ? t("已开启") : t("关闭")}
                </button>
              </div>
              <div>
                <div className="text-[11.5px] text-[var(--muted)] mb-2">{t("阅读字号")}</div>
                <div className="seg">
                  {[
                    ['s', t("小")],
                    ['m', t("标准")],
                    ['l', t("大")],
                    ['xl', t("特大")],
                  ].map(([key, label]) => (
                    <button key={key} className={fontScale === key ? 'active' : ''} onClick={() => setFontScale(key as FontScale)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-[13.5px] font-semibold">{t("刷题")}</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px]">{t("默认显示答案")}</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{t("进入练习时的判分方式")}</div>
                </div>
                <select
                  className="chip bg-transparent"
                  value={practiceMode}
                  onChange={(event) => {
                    setPracticeMode(event.target.value);
                    saveSetting({ practice_mode: event.target.value });
                  }}
                >
                  <option value="instant">{t("逐题显示")}</option>
                  <option value="deferred">{t("交卷后显示")}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px]">{t("错题移出阈值")}</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{t("错题连续答对后移入已掌握")}</div>
                </div>
                <select
                  className="chip bg-transparent"
                  value={archive}
                  onChange={(event) => {
                    setArchive(event.target.value);
                    saveSetting({ archive_streak: event.target.value });
                  }}
                >
                  <option value="1">{t("1 次")}</option>
                  <option value="2">{t("2 次")}</option>
                  <option value="3">{t("3 次")}</option>
                  <option value="4">{t("4 次")}</option>
                  <option value="5">{t("5 次")}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px]">{t("每日目标")}</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{t("首页进度按此计算")}</div>
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
                  <span className="text-[10.5px] text-[var(--muted)]">{t("题")}</span>
                </div>
              </div>
              <div className="text-[10.5px] text-[var(--muted)] leading-5">
                {t("快捷键：A–H 选择，← → 翻题，F 收藏，标记按钮记录疑问题。")}
              </div>
            </div>
          </div>
        </div>

        <FontSettings
          appFont={appFont}
          practiceFont={practiceFont}
          setAppFont={setAppFont}
          setPracticeFont={setPracticeFont}
          onNotice={onNotice}
        />

        <div className="card mt-4 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[13.5px] font-semibold">{t("界面语言")}</h2>
              <div className="text-[10.5px] text-[var(--muted)] mt-1">{t("切换后立即生效")}</div>
            </div>
          <div className="seg">
              <button className={lang === 'zh' ? 'active' : ''} onClick={() => setLang('zh')}>{t("中文")}</button>
              <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
            </div>
          </div>


        </div>



        <div className="card mt-4 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[13.5px] font-semibold">{t("艾宾浩斯复习")}</h2>
              <div className="text-[10.5px] text-[var(--muted)] mt-1">
                {t("按 1 / 2 / 4 / 7 / 15 / 30 / 60 天复习；答对进入下一阶段，答错回到 1 天。")}
              </div>
            </div>
            <button
              className={`chip ${reviewEnabled ? 'active' : ''}`}
              onClick={() => saveAndRefresh({ review_enabled: reviewEnabled ? '0' : '1' })}
            >
              {reviewEnabled ? t("已开启") : t("已关闭")}
            </button>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div>
              <div className="text-[12px]">{t("每日复习上限")}</div>
              <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{t("到期题多时，单次最多复习的题数")}</div>
            </div>
            <div className="seg">
              {['20', '50', '100'].map((value) => (
                <button
                  key={value}
                  className={reviewLimit === value ? 'active' : ''}
                  onClick={() => saveAndRefresh({ review_limit: value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card mt-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[13.5px] font-semibold">{t("题库管理")}</h2>
              <div className="text-[10.5px] text-[var(--muted)] mt-1">{t("多个题库互斥，同一时间仅一个启用。切换后进度、错题、统计随题库切换。")}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={onImport}>
              <Icon name="library" />
              {t("导入新题库")}
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
                    {bank.title} {bank.active ? <span className="chip-accent ml-2">{t("启用中")}</span> : null}
                  </div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5 truncate">
                    {fmtNumber(bank.questionCount)}  {t("题 ·")} {bank.paperCount}  {t("套卷 · 导入于")} {bank.importedAt}
                  </div>
                </div>
                {!bank.active ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      switchBank(bank.id)
                        .then(() => {
                          onNotice(t("题库已切换"));
                          onRefresh();
                        })
                        .catch((error) => onNotice(t("切换失败：{p0}", { p0: errorText(error) })))
                    }
                  >
                    {t("启用")}
                  </button>
                ) : null}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    revalidateBank(bank.id)
                      .then(() => {
                        onNotice(t("校验完成"));
                        onRefresh();
                      })
                      .catch((error) => onNotice(t("校验失败：{p0}", { p0: errorText(error) })))
                  }
                >
                  {t("校验")}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setRenameBank(bank)}>
                  {t("重命名")}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmBank(bank)}>
                  {t("删除")}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card mt-4 p-5">
          <h2 className="text-[13.5px] font-semibold">{t("AI 设置")}</h2>
          <div className="text-[10.5px] text-[var(--muted)] mt-1 leading-5">
            {t("用于 AI 转换导入和题目 AI 讲解。建议使用支持图片识别的模型（GPT-4o、Claude、Gemini、Qwen-VL 等），否则带图题目可能无法正常讲解。密钥仅保存在本机。")}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="chip">{data.settings.ai_model ? data.settings.ai_model : t("未配置模型")}</span>
            <span className="chip">{data.settings.ai_url ? t("接口已填写") : t("接口未填写")}</span>
          </div>
          <button className="btn btn-soft btn-sm mt-3" onClick={() => setAiConfigOpen(true)}>
            {t("配置 AI 模型")}
          </button>
        </div>

        <div className="card mt-4 p-5">
          <h2 className="text-[13.5px] font-semibold">{t("数据")}</h2>
          <div className="text-[10.5px] text-[var(--muted)] mt-1 leading-5">
            {t("进度、错题、笔记、收藏保存在本地；备份不含题库图片，换设备后重新导入题库即可。")}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button className="btn btn-ghost" onClick={() => void chooseBackupPath()} disabled={busy}>
              {t("导出进度备份")}
            </button>
            <button className="btn btn-ghost" onClick={() => void chooseBackup()} disabled={busy}>
              {t("导入备份")}
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
              {t("清空学习记录")}
            </button>
          </div>
        </div>

        <UpdateCard onNotice={onNotice} />

        <div className="text-[10.5px] text-[var(--muted)] mt-6">

          {t("刷题盒子 SHUATIBOX v")}{APP_VERSION}  {t("· 本地离线")}
          <br />
          {t("图片仅存于应用私有目录，不写入系统图库。")}
        </div>
      </div>

      <BankRenameDialog
        open={!!renameBank}
        bank={renameBank}
        onClose={() => setRenameBank(null)}
        onSaved={onRefresh}
        onNotice={onNotice}
      />

      <Modal
        open={!!confirmBank}
        title={t("删除题库？")}
        onClose={() => setConfirmBank(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmBank(null)}>{t("取消")}</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirmBank) return;
                deleteBank(confirmBank.id)
                  .then(() => {
                    setConfirmBank(null);
                    onNotice(t("题库已删除"));
                    onRefresh();
                  })
                  .catch((error) => onNotice(t("删除失败：{p0}", { p0: errorText(error) })));
              }}
            >
              {t("确认删除")}
            </button>
          </>
        }
      >
        <p className="text-[13px] leading-7 text-[var(--ink-2)]">
          {t("将删除题库文件、该题库的进度、错题、笔记与收藏。此操作不可撤销。")}
        </p>
      </Modal>

      <Modal
        open={confirmClear}
        title={t("清空学习记录？")}
        onClose={() => setConfirmClear(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmClear(false)}>{t("取消")}</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                clearHistory()
                  .then(() => {
                    setConfirmClear(false);
                    onNotice(t("学习记录已清空"));
                    onRefresh();
                  })
                  .catch((error) => onNotice(t("清空失败：{p0}", { p0: errorText(error) })));
              }}
            >
              {t("确认清空")}
            </button>
          </>
        }
      >
        <p className="text-[13px] leading-7 text-[var(--ink-2)]">
          {t("会清空所有练习记录、错题、收藏、笔记和反馈；题库文件不会被删除。")}
        </p>
      </Modal>

      <AiConfigDialog
        open={aiConfigOpen}
        onClose={() => {
          setAiConfigOpen(false);
          onRefresh();
        }}
        onNotice={onNotice}
      />
    </section>
  );
}
