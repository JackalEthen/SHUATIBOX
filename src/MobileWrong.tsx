import { t } from './i18n';
import { useEffect, useState } from 'react';
import { clearWrong, errorText, listWrong, type SessionSpec, type WrongPage } from './api';
import { CountDialog } from './CountDialog';

interface Props {
  onStart: (spec: SessionSpec) => void;
  onNotice: (message: string) => void;
  reloadKey: number;
}

function plain(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function MobileWrong({ onStart, onNotice, reloadKey }: Props) {
  const [status, setStatus] = useState<'pending' | 'mastered' | 'all'>('pending');
  const [days, setDays] = useState(0);
  const [page, setPage] = useState<WrongPage>({ items: [], total: 0, pending: 0, mastered: 0 });
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);
  const [redoOpen, setRedoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listWrong({ status, days: days || undefined })
      .then((value) => !cancelled && setPage(value))
      .catch((error) => !cancelled && onNotice(t("错题加载失败：{p0}", { p0: errorText(error) })))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, days, reloadKey, key]);

  const redo = (ids: string[]) => {
    if (!ids.length) return;
    onStart({ mode: 'custom', questionIds: ids, title: t("错题重做") });
  };

  return (
    <div className="px-4 pt-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-[20px] font-semibold">{t("错题集")}</h2>
          <p className="text-[11.5px] text-[var(--muted)] mt-1">{t("答错自动收录 · 连续答对后移入已掌握")}</p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          disabled={page.pending === 0}
          onClick={() => setRedoOpen(true)}
        >

          {t("重做")} {page.pending}
        </button>
      </div>

      <div className="seg mt-3 w-full">
        <button className={`flex-1 ${status === 'pending' ? 'active' : ''}`} onClick={() => setStatus('pending')}>{t("待攻克")} {page.pending}</button>
        <button className={`flex-1 ${status === 'mastered' ? 'active' : ''}`} onClick={() => setStatus('mastered')}>{t("已掌握")} {page.mastered}</button>
      </div>

      <div className="flex gap-2 overflow-x-auto scroll -mx-4 px-4 mt-3 pb-1">
        {[{ label: t("全部时间"), value: 0 }, { label: t("今天"), value: 1 }, { label: t("近 7 天"), value: 7 }, { label: t("近 30 天"), value: 30 }].map((item) => (
          <button key={item.value} className={`chip ${days === item.value ? 'active' : ''}`} onClick={() => setDays(item.value)}>{item.label}</button>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-[var(--muted)]">{page.items.length}  {t("条")}</span>
        <button
          className="text-[11px] text-[var(--muted)]"
          onClick={() => {
            clearWrong(status === 'mastered')
              .then(() => { onNotice(status === 'mastered' ? t("已清空已掌握") : t("已清空错题")); setKey((value) => value + 1); })
              .catch((error) => onNotice(errorText(error)));
          }}
        >

          {t("清空")}{status === 'mastered' ? t("已掌握") : t("错题")}
        </button>
      </div>

      <div className="mt-2 space-y-2.5">
        {loading ? (
          <div className="card p-8 text-center text-[13.5px] text-[var(--muted)]">{t("读取错题…")}</div>
        ) : page.items.length === 0 ? (
          <div className="card p-8 text-center text-[13.5px] text-[var(--muted)]">{t("暂无错题")}</div>
        ) : (
          page.items.map((item) => (
            <div key={item.question.id} className="card p-4">
              <div className="text-[13.5px] line-clamp-2">{plain(item.question.stem).slice(0, 160)}</div>
              <div className="text-[10.5px] text-[var(--muted)] mt-2">
                {item.question.module} · {item.question.type}  {t("· 错")} {item.wrongCount}  {t("次 · 连对")} {item.correctStreak}
              </div>
              <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{item.question.paperTitle}</div>
              <div className="flex gap-2 mt-3">
                <button className="btn btn-ghost btn-sm flex-1" onClick={() => redo([item.question.id])}>{t("重做")}</button>
                <button className="btn btn-primary btn-sm flex-1" onClick={() => onStart({ mode: 'custom', questionIds: [item.question.id], title: t("单题练习") })}>{t("看解析")}</button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="h-4" />

      <CountDialog
        open={redoOpen}
        title={t("错题重做")}
        max={page.pending}
        initial={20}
        mobile
        onClose={() => setRedoOpen(false)}
        onStart={(count) => {
          setRedoOpen(false);
          onStart({ mode: 'wrong', count, title: t("错题重做") });
        }}
      />
    </div>
  );
}