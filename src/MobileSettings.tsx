import { setLang, t, useLang, fmtNumber } from './i18n';
import { useEffect, useState } from 'react';
import { clearHistory, errorText, exportBackup, importBackup, setSettings, type Bootstrap } from './api';
import { AiConfigDialog } from './AiConfigDialog';
import { Icon } from './icons';
import { UpdateCard } from './UpdateCard';
import { APP_VERSION } from './version';
import type { Appearance } from './theme';

interface Props {
  data: Bootstrap;
  appearance: Appearance;
  onBack: () => void;
  onBank: () => void;
  onImport: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
}

function fmt(value: number) {
  return fmtNumber(value);
}

export function MobileSettings({ data, appearance, onBack, onBank, onImport, onNotice, onRefresh }: Props) {
  const { dark, setDark, accent, setAccent, fontScale, setFontScale } = appearance;
  const lang = useLang();
  const [goal, setGoal] = useState(Number(data.settings.daily_goal ?? '50'));
  const [archive, setArchive] = useState(Number(data.settings.archive_streak ?? '2'));
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

  const save = (values: Record<string, string>) => {
    setSettings(values).catch((error) => onNotice(errorText(error)));
  };

  const saveAndRefresh = (values: Record<string, string>) => {
    setSettings(values).then(onRefresh).catch((error) => onNotice(errorText(error)));
  };

  const reviewEnabled = data.settings.review_enabled !== '0';
  const reviewLimit = data.settings.review_limit ?? '50';

  useEffect(() => {
    const win = window as unknown as { __shuatiboxBack?: () => string };
    const previous = win.__shuatiboxBack;
    const handler = () => {
      if (aiConfigOpen) {
        if (!(window as unknown as { __shuatiboxAiTesting?: boolean }).__shuatiboxAiTesting) {
          setAiConfigOpen(false);
        }
        return 'handled';
      }
      return previous ? previous() : 'handled';
    };
    win.__shuatiboxBack = handler;
    return () => {
      if (win.__shuatiboxBack === handler) win.__shuatiboxBack = previous;
    };
  }, [aiConfigOpen]);

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <button className="icon-btn -ml-2" onClick={onBack} aria-label={t("返回")}><Icon name="chevronLeft" strokeWidth={1.8} /></button>
        <h2 className="text-[18px] font-semibold">{t("设置")}</h2>
      </div>

      <div className="card mt-4 p-4">
        <h3 className="text-[15px] font-semibold">{t("题库")}</h3>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[12px] font-semibold">
            {data.bank.title.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-medium truncate">{data.bank.title}</div>
            <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{fmt(data.bank.questionCount)}  {t("题 ·")} {fmt(data.bank.paperCount)}  {t("套卷")}</div>
          </div>
          <span className="chip active">{t("启用中")}</span>
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-ghost btn-sm flex-1" onClick={onImport}>{t("导入")}</button>
          <button className="btn btn-ghost btn-sm flex-1" onClick={onBank}>{t("切换")}</button>
        </div>
      </div>

      <div className="card mt-3 p-4">
        <h3 className="text-[15px] font-semibold">{t("AI 设置")}</h3>
        <p className="text-[10.5px] text-[var(--muted)] mt-1 leading-5">
          {t("建议使用支持图片识别的模型（GPT-4o、Claude、Gemini、Qwen-VL 等），否则带图题目可能无法正常讲解。密钥仅保存在本机。")}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="chip">{data.settings.ai_model || t("未配置模型")}</span>
          <span className="chip">{data.settings.ai_url ? t("接口已填写") : t("接口未填写")}</span>
        </div>
        <button className="btn btn-soft btn-sm btn-block mt-3" onClick={() => setAiConfigOpen(true)}>
          {t("配置 AI 模型")}
        </button>
      </div>

      <div className="card mt-3 p-4">
        <h3 className="text-[15px] font-semibold">{t("外观")}</h3>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13.5px]">{t("深色模式")}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setDark(!dark)}>{dark ? t("开启") : t("关闭")}</button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13.5px]">{t("阅读字号")}</span>
          <div className="seg">
            {[
              ['s', t("小")],
              ['m', t("标准")],
              ['l', t("大")],
              ['xl', t("特大")],
            ].map(([key, label]) => (
              <button key={key} className={fontScale === key ? 'active' : ''} onClick={() => setFontScale(key as typeof fontScale)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13.5px]">{t("主题色")}</span>
          <div className="flex items-center gap-2">
            {(['blue', 'orange', 'teal', 'pink', 'purple'] as const).map((value) => (
              <button
                key={value}
                className={`dot ${accent === value ? 'active' : ''}`}
                style={{ background: value === 'blue' ? '#7FA6CF' : value === 'orange' ? '#D08A5A' : value === 'teal' ? '#63A695' : value === 'pink' ? '#D092A0' : '#9C8FC4' }}
                onClick={() => setAccent(value)}
                aria-label={value}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold">{t("界面语言")}</h3>
            <div className="text-[10.5px] text-[var(--muted)] mt-1">{t("切换后立即生效")}</div>
          </div>
          <div className="seg">
            <button className={lang === 'zh' ? 'active' : ''} onClick={() => setLang('zh')}>{t("中文")}</button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
          </div>
        </div>
      </div>

      <div className="card mt-3 p-4">
        <h3 className="text-[15px] font-semibold">{t("刷题")}</h3>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13.5px]">{t("错题移出阈值")}</span>
          <div className="seg">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} className={archive === value ? 'active' : ''} onClick={() => { setArchive(value); save({ archive_streak: String(value) }); }}>{value}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13.5px]">{t("每日目标")}</span>
          <div className="seg">
            {[20, 50, 100].map((value) => (
              <button key={value} className={goal === value ? 'active' : ''} onClick={() => { setGoal(value); save({ daily_goal: String(value) }); }}>{value}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13.5px]">{t("默认判分")}</span>
          <div className="seg">
            <button className={data.settings.practice_mode === 'instant' ? 'active' : ''} onClick={() => save({ practice_mode: 'instant' })}>{t("逐题")}</button>
            <button className={data.settings.practice_mode === 'deferred' ? 'active' : ''} onClick={() => save({ practice_mode: 'deferred' })}>{t("交卷")}</button>
          </div>
        </div>
      </div>

      <div className="card mt-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold">{t("艾宾浩斯复习")}</h3>
            <p className="text-[10.5px] text-[var(--muted)] mt-1 leading-5">{t("1 / 2 / 4 / 7 / 15 / 30 / 60 天；答对升级，答错回到 1 天。")}</p>
          </div>
          <button className={`chip ${reviewEnabled ? 'active' : ''}`} onClick={() => saveAndRefresh({ review_enabled: reviewEnabled ? '0' : '1' })}>
            {reviewEnabled ? t("已开启") : t("已关闭")}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13.5px]">{t("每日复习上限")}</span>
          <div className="seg">
            {['20', '50', '100'].map((value) => (
              <button key={value} className={reviewLimit === value ? 'active' : ''} onClick={() => saveAndRefresh({ review_limit: value })}>{value}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-3 p-4">
        <h3 className="text-[15px] font-semibold">{t("数据")}</h3>
        <p className="text-[11px] text-[var(--muted)] mt-1 leading-5">{t("进度、错题、笔记、收藏保存在本地；备份不含题库图片。")}</p>
        <div className="flex gap-2 mt-3">
          <button
            className="btn btn-ghost btn-sm flex-1"
            onClick={() => {
              const stamp = new Date().toISOString().slice(0, 10);
              exportBackup(`shuatibox-backup-${stamp}.db`)
                .then(() => onNotice(t("备份已导出到应用目录")))
                .catch((error) => onNotice(t("导出失败：{p0}", { p0: errorText(error) })));
            }}
          >
            {t("导出备份")}
          </button>
          <button
            className="btn btn-ghost btn-sm flex-1"
            onClick={() => {
              const value = window.prompt(t('输入备份文件路径'));
              if (!value) return;
              importBackup(value)
                .then(() => { onNotice(t("备份已恢复")); onRefresh(); })
                .catch((error) => onNotice(t("恢复失败：{p0}", { p0: errorText(error) })));
            }}
          >
            {t("导入备份")}
          </button>
        </div>
        <button
          className="btn btn-danger btn-sm btn-block mt-2"
          onClick={() => {
            if (!window.confirm(t("确定清空学习记录？错题、笔记、收藏与统计都会删除，题库不受影响。"))) return;
            clearHistory()
              .then(() => { onNotice(t("学习记录已清空")); onRefresh(); })
              .catch((error) => onNotice(errorText(error)));
          }}
        >
          {t("清空学习记录")}
        </button>
      </div>

      <UpdateCard mobile onNotice={onNotice} />

      <div className="text-center text-[10.5px] text-[var(--muted)] mt-4 leading-5">

        {t("刷题盒子 SHUATIBOX v")}{APP_VERSION}
      </div>
      <div className="h-4" />

      <AiConfigDialog
        open={aiConfigOpen}
        mobile
        onClose={() => {
          setAiConfigOpen(false);
          onRefresh();
        }}
        onNotice={onNotice}
      />
    </div>
  );
}