import { useEffect, useState } from 'react';
import { errorText, listPapers, type Bootstrap, type PaperDto, type PaperPage, type SessionSpec } from './api';
import { Icon } from './icons';

interface Props {
  data: Bootstrap;
  onStart: (spec: SessionSpec) => void;
  onNotice: (message: string) => void;
  onBank: () => void;
  onCustom: () => void;
  onImport: () => void;
  reloadKey: number;
}

function fmt(value: number) {
  return value.toLocaleString('zh-CN');
}

export function MobileLibrary({ data, onStart, onNotice, onBank, onCustom, onImport, reloadKey }: Props) {
  const [year, setYear] = useState('');
  const [examType, setExamType] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaperPage>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPapers({ page, pageSize: 20, year, examType })
      .then((value) => !cancelled && setResult(value))
      .catch((error) => !cancelled && onNotice(`题库加载失败：${errorText(error)}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, year, examType, reloadKey]);

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const startPaper = (paper: PaperDto) => {
    if (paper.availableCount === 0) {
      onNotice('这张试卷目前没有可练题目');
      return;
    }
    onStart({ mode: 'paper', paperKey: paper.key });
  };

  return (
    <div className="px-4 pt-4">
      <button className="card w-full p-3 flex items-center gap-3 text-left" onClick={onBank}>
        <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[12px] font-semibold">
          {data.bank.title.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium truncate">{data.bank.title}</div>
          <div className="text-[10px] text-[var(--muted)] mt-0.5">
            {fmt(data.bank.paperCount)} 套卷 · {fmt(data.bank.questionCount)} 题
          </div>
        </div>
        <Icon name="chevronDown" className="w-4 h-4 text-[var(--muted)]" />
      </button>

      <div className="flex items-center justify-between mt-4">
        <h2 className="text-[15px] font-semibold">模块刷题</h2>
        <span className="text-[10px] text-[var(--muted)]">{data.modules.length} 个模块</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scroll pb-1 mt-2 -mx-4 px-4">
        {data.modules.map((module) => (
          <button
            key={module.code}
            className="chip"
            onClick={() => onStart({ mode: 'module', module: module.name, count: 20 })}
          >
            {module.name} · {module.available > 9999 ? `${Math.round(module.available / 1000)}k` : module.available}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-3">
        {data.modules.map((module) => (
          <button
            key={module.code}
            className="card p-3.5 text-left"
            onClick={() => onStart({ mode: 'module', module: module.name, count: 20 })}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium">{module.name}</span>
              <span className="text-[9.5px] text-[var(--muted)]">{fmt(module.total)} 题</span>
            </div>
            <div className="progress mt-2.5" style={{ height: 5 }}>
              <i style={{ width: `${Math.max(module.progress, module.done > 0 ? 1 : 0)}%` }} />
            </div>
            <div className="text-[9.5px] text-[var(--muted)] mt-1.5">
              已刷 {fmt(module.done)} · 正确率 {module.accuracy}%
            </div>
          </button>
        ))}
      </div>

      <button className="card w-full p-4 flex items-center gap-3 text-left mt-3" onClick={onCustom}>
        <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center">
          <Icon name="book" className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <div className="text-[12.5px] font-medium">自定义组卷</div>
          <div className="text-[9.5px] text-[var(--muted)] mt-0.5">选模块 / 年份 / 顺序 / 限时</div>
        </div>
        <Icon name="chevronRight" className="w-4 h-4 text-[var(--muted)]" />
      </button>

      <div className="flex items-center justify-between mt-5">
        <h2 className="text-[15px] font-semibold">试卷</h2>
        <span className="text-[10px] text-[var(--muted)]">共 {fmt(result.total)} 套</span>
      </div>

      <div className="flex gap-2 overflow-x-auto scroll -mx-4 px-4 mt-2 pb-1">
        <select className="chip bg-transparent" value={year} onChange={(event) => { setYear(event.target.value); setPage(1); }}>
          <option value="">全部年份</option>
          {data.years.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select className="chip bg-transparent" value={examType} onChange={(event) => { setExamType(event.target.value); setPage(1); }}>
          <option value="">考试类型：全部</option>
          {data.examTypes.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      <div className="mt-2.5 space-y-2.5">
        {loading ? (
          <div className="card p-8 text-center text-[11.5px] text-[var(--muted)]">读取题库…</div>
        ) : result.items.length === 0 ? (
          <div className="card p-8 text-center text-[11.5px] text-[var(--muted)]">没有匹配的试卷</div>
        ) : (
          result.items.map((paper) => (
            <div key={paper.key} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[11px] font-semibold shrink-0">
                  {paper.year || '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium leading-5">{paper.title}</div>
                  <div className="text-[9.5px] text-[var(--muted)] mt-1">
                    {paper.region || '—'} · {paper.questionCount} 题 · 可练 {paper.availableCount}
                  </div>
                  <div className="progress mt-2" style={{ height: 5 }}>
                    <i style={{ width: `${Math.max(paper.progress, paper.answered > 0 ? 1 : 0)}%` }} />
                  </div>
                  {paper.lastScore != null ? (
                    <div className="text-[9.5px] text-[var(--good)] mt-1">已完成 · {paper.lastScore} 分</div>
                  ) : paper.answered > 0 ? (
                    <div className="text-[9.5px] text-[var(--muted)] mt-1">{paper.answered} / {paper.questionCount}</div>
                  ) : (
                    <div className="text-[9.5px] text-[var(--muted)] mt-1">未开始</div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => onStart({ mode: 'exam', paperKey: paper.key })}
                >
                  计时模考
                </button>
                <button
                  className="btn btn-primary btn-sm flex-1"
                  disabled={paper.availableCount === 0}
                  onClick={() => startPaper(paper)}
                >
                  {paper.availableCount === 0 ? '缺图' : paper.answered > 0 ? '继续' : '开始'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between mt-3">
          <button className="chip" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
          <span className="text-[10.5px] text-[var(--muted)]">第 {page} / {pages} 页</span>
          <button className="chip" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>下一页</button>
        </div>
      ) : null}

      <button className="btn btn-ghost btn-block mt-3" onClick={onImport}>导入题库（文件夹 / zip）</button>
      <div className="h-4" />
    </div>
  );
}