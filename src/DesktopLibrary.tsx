import { useEffect, useState } from 'react';
import { errorText, listPapers, type Bootstrap, type PaperDto, type PaperPage, type SessionSpec } from './api';
import { Icon } from './icons';

interface Props {
  data: Bootstrap;
  onStart: (spec: SessionSpec) => void;
  onNotice: (message: string) => void;
  onCustom: () => void;
  onImport: () => void;
  onBank: () => void;
  refreshKey: number;
}

function fmt(value: number) {
  return value.toLocaleString('zh-CN');
}

export function DesktopLibrary({ data, onStart, onNotice, onCustom, onImport, onBank, refreshKey }: Props) {
  const [year, setYear] = useState('');
  const [region, setRegion] = useState('');
  const [examType, setExamType] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaperPage>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      listPapers({ page, pageSize: 20, year, region, examType, q: query })
        .then((value) => {
          if (!cancelled) setResult(value);
        })
        .catch((error) => {
          if (!cancelled) onNotice(`题库加载失败：${errorText(error)}`);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, year, region, examType, query, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [year, region, examType, query]);

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageNumbers = Array.from({ length: Math.min(5, pages) }, (_, index) => {
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    return start + index;
  }).filter((value) => value <= pages);

  const startPaper = (paper: PaperDto) => {
    if (paper.availableCount === 0) {
      onNotice('这张试卷目前没有可练题目，请先导入题库图片');
      return;
    }
    onStart({ mode: 'paper', paperKey: paper.key });
  };

  return (
    <section className="screen active">
      <div className="max-w-[1180px] mx-auto px-8 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">题库</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1.5">
              {data.bank.title} · {fmt(data.bank.paperCount)} 套卷 · {fmt(data.bank.questionCount)} 题 · 图片 {fmt(data.bank.imageCount)} 张
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data.bank.reviewCount > 0 ? (
              <span className="chip">
                <i className="w-1.5 h-1.5 rounded-full bg-[var(--warn)] inline-block" />
                {data.bank.reviewCount} 题待校对
              </span>
            ) : null}
            <button className="btn btn-ghost" onClick={onBank}>
              <Icon name="library" />
              切换题库
            </button>
            <button className="btn btn-ghost" onClick={onCustom}>
              <Icon name="book" />
              自定义组卷
            </button>
            <button className="btn btn-primary" onClick={onImport}>
              <Icon name="library" />
              导入题库
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-6">
          {data.modules.map((module) => (
            <button
              key={module.code}
              className="module-card"
              onClick={() => onStart({ mode: 'module', module: module.name, count: 20 })}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--muted)]">{module.code}</span>
                <span className="text-[10px] text-[var(--muted)]">{fmt(module.total)} 题</span>
              </div>
              <div className="serif text-[16px] mt-2">{module.name}</div>
              <div className="progress mt-3">
                <i style={{ width: `${Math.max(module.progress, module.done > 0 ? 1 : 0)}%` }} />
              </div>
              <div className="text-[10.5px] text-[var(--muted)] mt-2">
                已刷 {fmt(module.done)} 题 · 正确率 {module.accuracy}% · 可练 {fmt(module.available)}
              </div>
            </button>
          ))}
        </div>

        <div className="card mt-4 overflow-hidden">
          <div className="p-4 flex items-center gap-2 border-b border-[var(--line)] flex-wrap">
            <span className="text-[11px] text-[var(--muted)] mr-1">筛选</span>
            <select
              className="chip bg-transparent"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            >
              <option value="">全部年份</option>
              {data.years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              className="chip bg-transparent"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            >
              <option value="">全部地区</option>
              {data.regions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              className="chip bg-transparent"
              value={examType}
              onChange={(event) => setExamType(event.target.value)}
            >
              <option value="">考试类型：全部</option>
              {data.examTypes.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              className="chip bg-transparent w-[190px] outline-none"
              placeholder="搜索试卷"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="ml-auto flex items-center gap-2">
              <button
                className="btn btn-soft btn-sm"
                onClick={() =>
                  onStart({
                    mode: 'custom',
                    year: year || undefined,
                    examType: examType || undefined,
                    count: 20,
                    order: 'random',
                    title: '按当前筛选随机 20 题',
                  })
                }
              >
                开始练习
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  onStart({
                    mode: 'custom',
                    year: year || undefined,
                    examType: examType || undefined,
                    count: 20,
                    order: 'random',
                    title: '随机 20 题',
                  })
                }
              >
                随机 20 题
              </button>
            </div>
          </div>

          <div className="tr text-[10.5px] text-[var(--muted)]" style={{ gridTemplateColumns: '2.4fr 70px 70px 70px 150px 110px' }}>
            <div>试卷</div>
            <div>年份</div>
            <div>地区</div>
            <div>题数</div>
            <div>进度</div>
            <div className="text-right">操作</div>
          </div>
          {loading ? (
            <div className="py-10 text-center text-[11.5px] text-[var(--muted)]">读取题库…</div>
          ) : result.items.length === 0 ? (
            <div className="py-10 text-center text-[11.5px] text-[var(--muted)]">没有匹配的试卷</div>
          ) : (
            result.items.map((paper) => (
              <div key={paper.key} className="tr" style={{ gridTemplateColumns: '2.4fr 70px 70px 70px 150px 110px' }}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{paper.title}</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{paper.note}</div>
                </div>
                <div>{paper.year || '—'}</div>
                <div>{paper.region || '—'}</div>
                <div>{paper.questionCount}</div>
                <div>
                  <div className="progress">
                    <i style={{ width: `${Math.max(paper.progress, paper.answered > 0 ? 1 : 0)}%` }} />
                  </div>
                  {paper.lastScore !== null && paper.lastScore !== undefined ? (
                    <div className="text-[10px] text-[var(--good)] mt-1">已完成 · {paper.lastScore} 分</div>
                  ) : paper.answered > 0 ? (
                    <div className="text-[10px] text-[var(--muted)] mt-1">
                      {paper.answered} / {paper.questionCount}
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--muted)] mt-1">未开始</div>
                  )}
                </div>
                <div className="text-right">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => startPaper(paper)}
                    disabled={paper.availableCount === 0}
                  >
                    {paper.availableCount === 0 ? '缺图' : paper.answered > 0 ? '继续' : '开始'}
                  </button>
                </div>
              </div>
            ))
          )}
          <div className="p-3 flex items-center justify-between text-[11px] text-[var(--muted)]">
            <span>
              共 {fmt(result.total)} 套卷 · 第 {page} / {pages} 页
            </span>
            <div className="flex items-center gap-1">
              <button className="chip" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                上一页
              </button>
              {pageNumbers.map((value) => (
                <button key={value} className={`chip ${value === page ? 'active' : ''}`} onClick={() => setPage(value)}>
                  {value}
                </button>
              ))}
              <button className="chip" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>
                下一页
              </button>
            </div>
          </div>
        </div>
        <div className="h-8" />
      </div>
    </section>
  );
}
