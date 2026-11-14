import { useEffect, useState } from 'react';
import { errorText, listFavorites, toggleFavorite, type QuestionDto } from './api';
import { Icon } from './icons';
import { Modal } from './Modal';
import { QuestionReview } from './QuestionReview';

interface Props {
  assetDir: string;
  refreshKey: number;
  onRefresh: () => void;
  onNotice: (message: string) => void;
}

function plain(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function DesktopFavorites({ assetDir, refreshKey, onRefresh, onNotice }: Props) {
  const [items, setItems] = useState<QuestionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<QuestionDto | null>(null);

  const load = () => {
    setLoading(true);
    listFavorites(500)
      .then(setItems)
      .catch((error) => onNotice(`收藏加载失败：${errorText(error)}`))
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshKey]);

  const unfavorite = async () => {
    if (!selected) return;
    try {
      await toggleFavorite(selected.id);
      setSelected(null);
      load();
      onRefresh();
      onNotice('已取消收藏');
    } catch (error) {
      onNotice(`操作失败：${errorText(error)}`);
    }
  };

  return (
    <section className="screen active">
      <div className="max-w-[1180px] mx-auto px-8 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">我的收藏</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1.5">只读查看 · 正确选项已标出，不会产生答题记录</p>
          </div>
          <span className="chip">{items.length} 题</span>
        </div>

        <div className="card mt-4 overflow-hidden">
          <div className="tr text-[10.5px] text-[var(--muted)]" style={{ gridTemplateColumns: '1fr 160px 120px 90px' }}>
            <div>题目</div>
            <div>来源</div>
            <div>模块</div>
            <div className="text-right">操作</div>
          </div>
          {loading ? (
            <div className="py-10 text-center text-[11.5px] text-[var(--muted)]">读取收藏…</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-[13px] font-medium">还没有收藏题目</div>
              <div className="text-[11px] text-[var(--muted)] mt-1">刷题时按 F 或点击星标即可收藏</div>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="tr" style={{ gridTemplateColumns: '1fr 160px 120px 90px' }}>
                <div className="min-w-0">
                  <div className="text-[12.5px] line-clamp-2">{plain(item.stem).slice(0, 150)}</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">qid {item.qid}</div>
                </div>
                <div className="text-[10.5px] text-[var(--muted)] truncate">{item.paperTitle}</div>
                <div className="text-[10.5px] text-[var(--muted)]">{item.module} · {item.type}</div>
                <div className="text-right">
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(item)}>
                    <Icon name="star" />
                    查看
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="h-8" />
      </div>

      <Modal open={!!selected} title="收藏题目" onClose={() => setSelected(null)} wide>
        {selected ? (
          <QuestionReview question={selected} assetDir={assetDir} onUnfavorite={() => void unfavorite()} />
        ) : null}
      </Modal>
    </section>
  );
}
