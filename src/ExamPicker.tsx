import { useEffect, useState } from 'react';
import { errorText, listPapers, type PaperDto, type SessionSpec } from './api';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onStart: (spec: SessionSpec) => void;
  onNotice: (message: string) => void;
}

export function ExamPicker({ open, onClose, onStart, onNotice }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PaperDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(7200);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = window.setTimeout(() => {
      listPapers({ page: 1, pageSize: 40, q: query })
        .then((page) => setItems(page.items))
        .catch((error) => onNotice(`试卷加载失败：${errorText(error)}`))
        .finally(() => setLoading(false));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  return (
    <Modal open={open} title="模拟考试" onClose={onClose} wide>
      <div className="flex items-center gap-2">
        <input
          className="chip bg-transparent flex-1 outline-none"
          placeholder="搜索试卷"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="chip bg-transparent" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
          <option value={3600}>60 分钟</option>
          <option value={5400}>90 分钟</option>
          <option value={7200}>120 分钟</option>
        </select>
      </div>
      <div className="mt-3 max-h-[55vh] overflow-y-auto scroll divide-y divide-[var(--line)]">
        {loading ? (
          <div className="py-10 text-center text-[11.5px] text-[var(--muted)]">读取试卷…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-[11.5px] text-[var(--muted)]">没有匹配的试卷</div>
        ) : (
          items.map((paper) => (
            <div key={paper.key} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium truncate">{paper.title}</div>
                <div className="text-[10.5px] text-[var(--muted)] mt-0.5">
                  {paper.year} · {paper.region} · {paper.questionCount} 题 · 可练 {paper.availableCount}
                  {paper.imageCount > 0 ? ` · 含图 ${paper.imageCount}` : ''}
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                disabled={paper.availableCount === 0}
                onClick={() => {
                  onStart({ mode: 'exam', paperKey: paper.key, durationSec: duration });
                  onClose();
                }}
              >
                {paper.availableCount === 0 ? '缺图' : '开始'}
              </button>
            </div>
          ))
        )}
      </div>
      <div className="text-[10.5px] text-[var(--muted)] mt-3">图片题导入前，整卷只包含纯文本题；导入图片后自动纳入。</div>
    </Modal>
  );
}
