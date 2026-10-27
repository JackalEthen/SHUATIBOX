import { useEffect, useState } from 'react';
import { errorText, loadStats, type SessionSpec, type StatsDto } from './api';
import { Icon } from './icons';

interface Props {
  onNotice: (message: string) => void;
  onStart: (spec: SessionSpec) => void;
  refreshKey: number;
}

export function DesktopStats({ onNotice, onStart, refreshKey }: Props) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<StatsDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadStats(days)
      .then(setData)
      .catch((error) => onNotice(`统计加载失败：${errorText(error)}`))
      .finally(() => setLoading(false));
  }, [days, refreshKey]);

  if (!data) {
    return (
      <section className="screen active">
        <div className="max-w-[1180px] mx-auto px-8 py-8 text-[12px] text-[var(--muted)]">
          {loading ? '读取学习统计…' : '暂无统计'}
        </div>
      </section>
    );
  }

  const maxDaily = Math.max(1, ...data.daily.map((item) => item.answered));

  return (
    <section className="screen active">
      <div className="max-w-[1180px] mx-auto px-8 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">学习统计</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1.5">本地记录 · 最近 {data.days} 天</p>
          </div>
          <div className="seg">
            <button className={days === 14 ? 'active' : ''} onClick={() => setDays(14)}>近 14 天</button>
            <button className={days === 30 ? 'active' : ''} onClick={() => setDays(30)}>近 30 天</button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6">
          {[
            ['累计已刷', data.totalAnswered.toLocaleString('zh-CN'), '题'],
            ['总正确率', `${data.accuracy}%`, `${data.totalCorrect} 题答对`],
            ['学习天数', String(data.learnedDays), `日均 ${data.perDay} 题`],
            ['模拟考试', String(data.examCount), `最高 ${data.bestScore} 分`],
          ].map(([label, value, note]) => (
            <div key={label} className="card p-5">
              <div className="text-[11.5px] text-[var(--muted)]">{label}</div>
              <div className="flex items-end gap-2 mt-2">
                <span className="stat-num">{value}</span>
                <span className="text-[11px] text-[var(--muted)] mb-1">{note}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[1.35fr_1fr] gap-4 mt-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13.5px] font-semibold">每日做题量</h2>
              <span className="text-[10.5px] text-[var(--muted)]">题 / 天</span>
            </div>
            <div className="h-44 flex items-end gap-1.5 mt-5">
              {data.daily.map((item) => (
                <div key={item.day} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                  <div className="absolute -top-6 hidden group-hover:block text-[10px] bg-[var(--ink)] text-[var(--paper)] px-1.5 py-0.5 rounded">
                    {item.answered}
                  </div>
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${Math.max(item.answered > 0 ? 4 : 1, (item.answered / maxDaily) * 100)}%`,
                      background: item.answered > 0 ? 'var(--accent)' : 'var(--line)',
                      opacity: item.answered > 0 ? 1 : 0.7,
                    }}
                  />
                  <span className="text-[8px] text-[var(--muted)] rotate-[-45deg] origin-top-left mt-3 whitespace-nowrap">
                    {item.day.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13.5px] font-semibold">模块正确率</h2>
              <span className="text-[10.5px] text-[var(--muted)]">全部作答</span>
            </div>
            <div className="mt-4 space-y-3">
              {data.modules.map((item) => (
                <div key={item.name}>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span>{item.name}</span>
                    <span className="text-[var(--muted)]">{item.done > 0 ? `${item.accuracy}%` : '—'}</span>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${item.accuracy}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr] gap-4 mt-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13.5px] font-semibold">薄弱题型</h2>
              <span className="text-[10.5px] text-[var(--muted)]">按正确率升序</span>
            </div>
            <div className="mt-3 space-y-3">
              {data.weak.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-[var(--muted)]">至少作答 2 题后显示</div>
              ) : (
                data.weak.map((item) => (
                  <div key={`${item.module}-${item.type}`} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] truncate">{item.module} · {item.type}</div>
                      <div className="text-[10px] text-[var(--muted)] mt-0.5">已答 {item.answered} 题</div>
                    </div>
                    <span className="text-[12px]" style={{ color: item.accuracy < 60 ? 'var(--bad)' : 'var(--ink-2)' }}>
                      {item.accuracy}%
                    </span>
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => onStart({ mode: 'custom', module: item.module, count: 20, order: 'random', title: `${item.module} · 薄弱练习` })}
                    >
                      去练
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[13.5px] font-semibold">最近模考</h2>
              <span className="text-[10.5px] text-[var(--muted)]">{data.examCount} 次</span>
            </div>
            <div className="mt-3 divide-y divide-[var(--line)]">
              {data.exams.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-[var(--muted)]">还没有完成模拟考试</div>
              ) : (
                data.exams.map((exam) => (
                  <div key={exam.id} className="flex items-center gap-3 py-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[11px] font-semibold">
                      {exam.score ?? '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] truncate">{exam.title}</div>
                      <div className="text-[10px] text-[var(--muted)] mt-0.5">{exam.completedAt} · 用时 {Math.round(exam.durationSec / 60)} 分钟</div>
                    </div>
                    <Icon name="chevronRight" className="w-3.5 h-3.5 text-[var(--muted)]" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="h-8" />
      </div>
    </section>
  );
}
