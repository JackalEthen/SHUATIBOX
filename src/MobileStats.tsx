import { useEffect, useState } from 'react';
import { errorText, loadStats, type StatsDto } from './api';
import { Icon } from './icons';

interface Props {
  onBack: () => void;
  reloadKey: number;
  onNotice: (message: string) => void;
}

function fmt(value: number) {
  return value.toLocaleString('zh-CN');
}

export function MobileStats({ onBack, reloadKey, onNotice }: Props) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<StatsDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadStats(days)
      .then((value) => !cancelled && setData(value))
      .catch((error) => !cancelled && onNotice(`统计加载失败：${errorText(error)}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days, reloadKey]);

  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((item) => item.answered));

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <button className="icon-btn -ml-2" onClick={onBack} aria-label="返回"><Icon name="chevronLeft" strokeWidth={1.8} /></button>
        <h2 className="text-[18px] font-semibold">学习统计</h2>
        <div className="ml-auto seg">
          <button className={days === 14 ? 'active' : ''} onClick={() => setDays(14)}>14 天</button>
          <button className={days === 30 ? 'active' : ''} onClick={() => setDays(30)}>30 天</button>
        </div>
      </div>

      {loading && !data ? (
        <div className="card mt-4 p-8 text-center text-[11.5px] text-[var(--muted)]">读取统计…</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            <div className="card p-4">
              <div className="text-[10px] text-[var(--muted)]">累计已刷</div>
              <div className="flex items-end gap-1 mt-1.5"><span className="stat-num">{fmt(data.totalAnswered)}</span><span className="text-[10px] text-[var(--muted)] mb-1">题</span></div>
            </div>
            <div className="card p-4">
              <div className="text-[10px] text-[var(--muted)]">总正确率</div>
              <div className="flex items-end gap-1 mt-1.5"><span className="stat-num">{data.accuracy}</span><span className="text-[10px] text-[var(--muted)] mb-1">%</span></div>
              <div className="text-[9.5px] text-[var(--muted)] mt-1">{fmt(data.totalCorrect)} 题答对</div>
            </div>
            <div className="card p-4">
              <div className="text-[10px] text-[var(--muted)]">学习天数</div>
              <div className="flex items-end gap-1 mt-1.5"><span className="stat-num">{data.learnedDays}</span><span className="text-[10px] text-[var(--muted)] mb-1">天</span></div>
              <div className="text-[9.5px] text-[var(--muted)] mt-1">日均 {data.perDay} 题</div>
            </div>
            <div className="card p-4">
              <div className="text-[10px] text-[var(--muted)]">模拟考试</div>
              <div className="flex items-end gap-1 mt-1.5"><span className="stat-num">{data.examCount}</span><span className="text-[10px] text-[var(--muted)] mb-1">次</span></div>
              <div className="text-[9.5px] text-[var(--muted)] mt-1">最高 {data.bestScore} 分</div>
            </div>
          </div>

          <div className="card mt-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold">每日做题量</h3>
              <span className="text-[9.5px] text-[var(--muted)]">题 / 天</span>
            </div>
            <div className="flex items-end gap-1 mt-3" style={{ height: 88 }}>
              {data.daily.map((item) => (
                <div key={item.day} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${Math.round((item.answered / maxDaily) * 72)}px`, background: item.answered > 0 ? 'var(--accent)' : 'var(--line)', minHeight: 3 }}
                    title={`${item.day} · ${item.answered} 题`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[8.5px] text-[var(--muted)] mt-1">
              <span>{data.daily[0]?.day.slice(5)}</span>
              <span>{data.daily[data.daily.length - 1]?.day.slice(5)}</span>
            </div>
          </div>

          <div className="card mt-3 p-4">
            <h3 className="text-[12px] font-semibold">模块正确率</h3>
            <div className="mt-3 space-y-2.5">
              {data.modules.map((module) => (
                <div key={module.code}>
                  <div className="flex justify-between text-[10.5px] mb-1">
                    <span>{module.name}</span>
                    <span>{module.done > 0 ? `${module.accuracy}%` : '—'}</span>
                  </div>
                  <div className="progress" style={{ height: 5 }}>
                    <i style={{ width: `${module.done > 0 ? module.accuracy : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card mt-3 p-4">
            <h3 className="text-[12px] font-semibold">薄弱题型</h3>
            {data.weak.length === 0 ? (
              <div className="text-[10.5px] text-[var(--muted)] mt-2">至少作答 2 题后显示</div>
            ) : (
              <div className="mt-2 divide-y divide-[var(--line)]">
                {data.weak.map((item, index) => (
                  <div key={`${item.module}-${item.type}`} className="py-2.5 flex items-center gap-2">
                    <span className="text-[10px] text-[var(--muted)] w-4">{index + 1}</span>
                    <span className="text-[11.5px] flex-1">{item.module} · {item.type}</span>
                    <span className="text-[10px] text-[var(--bad)]">{item.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card mt-3 p-4">
            <h3 className="text-[12px] font-semibold">最近模考</h3>
            {data.exams.length === 0 ? (
              <div className="text-[10.5px] text-[var(--muted)] mt-2">还没有完成模拟考试</div>
            ) : (
              <div className="mt-2 divide-y divide-[var(--line)]">
                {data.exams.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[10px] font-semibold">
                      {item.score ?? '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] truncate">{item.title}</div>
                      <div className="text-[9.5px] text-[var(--muted)] mt-0.5">{item.completedAt ?? item.updatedAt}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
      <div className="h-4" />
    </div>
  );
}