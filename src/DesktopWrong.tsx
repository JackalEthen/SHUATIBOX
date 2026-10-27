import { useEffect, useState } from 'react';
import {
  clearWrong,
  errorText,
  listWrong,
  type Bootstrap,
  type SessionSpec,
  type WrongItem,
  type WrongPage,
} from './api';
import { Icon } from './icons';
import { Modal } from './Modal';

interface Props {
  data: Bootstrap;
  onStart: (spec: SessionSpec) => void;
  onNotice: (message: string) => void;
  refreshKey: number;
}

function plain(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function DesktopWrong({ data, onStart, onNotice, refreshKey }: Props) {
  const [status, setStatus] = useState('pending');
  const [days, setDays] = useState(0);
  const [module, setModule] = useState('');
  const [page, setPage] = useState<WrongPage>({ items: [], total: 0, pending: 0, mastered: 0 });
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = () => {
    setLoading(true);
    listWrong({ status, days: days || undefined, module: module || undefined })
      .then(setPage)
      .catch((error) => onNotice(`错题加载失败：${errorText(error)}`))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, days, module, refreshKey]);

  const redo = (item: WrongItem) => {
    onStart({
      mode: 'custom',
      questionIds: [item.question.id],
      title: '错题练习',
    });
  };

  return (
    <section className="screen active">
      <div className="max-w-[1180px] mx-auto px-8 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">错题集</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1.5">
              答错自动收录 · 连续答对 {data.settings.archive_streak ?? '2'} 次移入「已掌握」
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-primary"
              onClick={() => onStart({ mode: 'wrong', count: 200, title: '错题重做' })}
              disabled={page.pending === 0}
            >
              <Icon name="wrong" />
              重做 {page.pending} 题
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmClear(true)}>
              清空错题
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 flex-wrap">
          <div className="seg">
            {[
              ['pending', `待攻克 ${page.pending}`],
              ['mastered', `已掌握 ${page.mastered}`],
              ['all', '全部'],
            ].map(([key, label]) => (
              <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>
                {label}
              </button>
            ))}
          </div>
          <span className="w-px h-4 bg-[var(--line)] mx-1" />
          {[
            [0, '全部时间'],
            [1, '今天'],
            [7, '近 7 天'],
            [30, '近 30 天'],
          ].map(([value, label]) => (
            <button key={label} className={`chip ${days === value ? 'active' : ''}`} onClick={() => setDays(Number(value))}>
              {label}
            </button>
          ))}
          <select className="chip bg-transparent ml-auto" value={module} onChange={(event) => setModule(event.target.value)}>
            <option value="">全部模块</option>
            {data.modules.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="card mt-4 overflow-hidden">
          <div className="tr text-[10.5px] text-[var(--muted)]" style={{ gridTemplateColumns: '1fr 150px 120px 90px' }}>
            <div>题目</div>
            <div>来源</div>
            <div>错题信息</div>
            <div className="text-right">操作</div>
          </div>
          {loading ? (
            <div className="py-10 text-center text-[11.5px] text-[var(--muted)]">读取错题…</div>
          ) : page.items.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-[13px] font-medium">没有错题</div>
              <div className="text-[11px] text-[var(--muted)] mt-1">
                {status === 'mastered' ? '连续答对后会自动归档到这里' : '答错题目会自动出现在这里'}
              </div>
            </div>
          ) : (
            page.items.map((item) => (
              <div key={item.question.id} className="tr" style={{ gridTemplateColumns: '1fr 150px 120px 90px' }}>
                <div className="min-w-0">
                  <div className="text-[12.5px] line-clamp-2">{plain(item.question.stem).slice(0, 150)}</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">
                    {item.question.module} · {item.question.type} · qid {item.question.qid}
                  </div>
                </div>
                <div className="text-[10.5px] text-[var(--muted)] truncate">{item.question.paperTitle}</div>
                <div className="text-[10.5px] text-[var(--muted)]">
                  错 {item.wrongCount} 次 · 连对 {item.correctStreak}
                  <div>{item.lastWrongAt}</div>
                </div>
                <div className="text-right">
                  <button className="btn btn-ghost btn-sm" onClick={() => redo(item)}>重做</button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="h-8" />
      </div>

      <Modal
        open={confirmClear}
        title="清空错题？"
        onClose={() => setConfirmClear(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmClear(false)}>取消</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                clearWrong(false)
                  .then(() => {
                    setConfirmClear(false);
                    onNotice('错题已清空');
                    load();
                  })
                  .catch((error) => onNotice(`清空失败：${errorText(error)}`));
              }}
            >
              确认清空
            </button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--ink-2)] leading-7">只会删除错题记录，不会删除答题历史和题目。</p>
      </Modal>
    </section>
  );
}
