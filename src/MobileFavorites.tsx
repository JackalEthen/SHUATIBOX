import { t } from './i18n';
import { useEffect, useState } from 'react';
import { errorText, listFavorites, toggleFavorite, type QuestionDto } from './api';
import { Icon } from './icons';
import { QuestionReview } from './QuestionReview';

interface Props {
  assetDir: string;
  reloadKey: number;
  onBack: () => void;
  onRefresh: () => void;
  onNotice: (message: string) => void;
}

function plain(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function MobileFavorites({ assetDir, reloadKey, onBack, onRefresh, onNotice }: Props) {
  const [items, setItems] = useState<QuestionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<QuestionDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listFavorites(500)
      .then((value) => !cancelled && setItems(value))
      .catch((error) => !cancelled && onNotice(t("收藏加载失败：{p0}", { p0: errorText(error) })))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!selected) return;
    const win = window as unknown as { __shuatiboxBack?: () => string };
    const previous = win.__shuatiboxBack;
    const handler = () => {
      setSelected(null);
      return 'handled';
    };
    win.__shuatiboxBack = handler;
    return () => {
      if (win.__shuatiboxBack === handler) win.__shuatiboxBack = previous;
    };
  }, [selected]);

  const unfavorite = async () => {
    if (!selected) return;
    try {
      await toggleFavorite(selected.id);
      setItems((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      onRefresh();
      onNotice(t("已取消收藏"));
    } catch (error) {
      onNotice(t("操作失败：{p0}", { p0: errorText(error) }));
    }
  };

  if (selected) {
    return (
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2">
          <button className="icon-btn -ml-2" onClick={() => setSelected(null)} aria-label={t("返回收藏")}>
            <Icon name="chevronLeft" strokeWidth={1.8} />
          </button>
          <h2 className="text-[18px] font-semibold">{t("收藏详情")}</h2>
        </div>
        <div className="mt-4">
          <QuestionReview
            question={selected}
            assetDir={assetDir}
            mobile
            onUnfavorite={() => void unfavorite()}
          />
        </div>
        <div className="h-4" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <button className="icon-btn -ml-2" onClick={onBack} aria-label={t("返回我的")}>
          <Icon name="chevronLeft" strokeWidth={1.8} />
        </button>
        <div className="flex-1">
          <h2 className="text-[18px] font-semibold">{t("我的收藏")}</h2>
          <p className="text-[10.5px] text-[var(--muted)]">{t("只读查看 · 不产生答题记录")}</p>
        </div>
        <span className="chip">{items.length}  {t("题")}</span>
      </div>

      <div className="mt-4 space-y-2.5">
        {loading ? (
          <div className="card p-8 text-center text-[13.5px] text-[var(--muted)]">{t("读取收藏…")}</div>
        ) : items.length === 0 ? (
          <div className="card p-8 text-center text-[13.5px] text-[var(--muted)]">{t("还没有收藏题目")}</div>
        ) : (
          items.map((item) => (
            <button key={item.id} className="card p-4 w-full text-left" onClick={() => setSelected(item)}>
              <div className="text-[13.5px] line-clamp-3">{plain(item.stem).slice(0, 180)}</div>
              <div className="text-[10.5px] text-[var(--muted)] mt-2">
                {item.module} · {item.type} · {item.paperTitle}
              </div>
            </button>
          ))
        )}
      </div>
      <div className="h-4" />
    </div>
  );
}
