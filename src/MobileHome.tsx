import type { Bootstrap, HomeSummary, SessionSpec } from './api';
import { Icon, type IconName } from './icons';

interface Props {
  data: Bootstrap;
  summary: HomeSummary | null;
  profileName: string;
  onStart: (spec: SessionSpec) => void;
  onResume: () => void;
  onLibrary: () => void;
  onWrong: () => void;
  onSearch: () => void;
  onStats: () => void;
}

const actions: Array<{ icon: IconName; title: string; sub: string; to: 'library' | 'wrong' | 'search' }> = [
  { icon: 'library', title: '模块刷题', sub: '按模块 / 题型 / 年份', to: 'library' },
  { icon: 'clock', title: '整卷练习', sub: '按套卷计时练习', to: 'library' },
  { icon: 'wrong', title: '错题重做', sub: '按错题攻克', to: 'wrong' },
  { icon: 'search', title: '搜索题目', sub: '题干 / 选项 / 解析', to: 'search' },
];

function fmt(value: number) {
  return value.toLocaleString('zh-CN');
}

export function MobileHome({ data, summary, profileName, onStart, onResume, onLibrary, onWrong, onSearch, onStats }: Props) {
  const today = summary?.today ?? data.today;
  const streak = summary?.streak ?? data.streak;
  const wrongCount = summary?.wrongCount ?? data.wrongCount;
  const continueSession = summary?.continueSession ?? data.continueSession;
  const recent = summary?.recent ?? [];
  const modules = data.modules;
  const goalRatio = today.goal > 0 ? Math.min(100, Math.round((today.answered / today.goal) * 100)) : 0;

  const go = (to: 'library' | 'wrong' | 'search') => {
    if (to === 'library') onLibrary();
    else if (to === 'wrong') onWrong();
    else onSearch();
  };

  return (
    <div className="px-4 pt-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight">你好，{profileName}</h2>
          <p className="text-[11px] text-[var(--muted)] mt-1">
            {data.bank.title} · {fmt(data.bank.questionCount)} 题
          </p>
        </div>
        <button className="chip" onClick={onStats}>今日 {today.answered} / {today.goal}</button>
      </div>

      <div className="card mt-4 p-4 relative overflow-hidden" onClick={() => (continueSession ? onResume() : onStart({ mode: 'module', count: 20 }))}>
        <div className="absolute -right-10 -top-14 w-40 h-40 rounded-full" style={{ background: 'var(--accent-soft)', filter: 'blur(4px)', opacity: 0.8 }} />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="chip-accent">{continueSession ? '继续上次' : '开始练习'}</span>
            <span className="text-[10px] text-[var(--muted)]">{continueSession ? continueSession.updatedAt : '今天'}</span>
          </div>
          <div className="serif text-[16px] mt-2 leading-snug">
            {continueSession ? continueSession.title : '从任意模块开始一组 20 题'}
          </div>
          <div className="text-[11px] text-[var(--ink-2)] mt-1">
            {continueSession
              ? `已答 ${continueSession.answered} / ${continueSession.total} 题`
              : '答题记录自动保存，可随时继续'}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="progress flex-1" style={{ height: 5 }}>
              <i style={{ width: `${continueSession && continueSession.total ? Math.round((continueSession.answered / continueSession.total) * 100) : 0}%` }} />
            </div>
            <span className="text-[10px] text-[var(--muted)]">
              {continueSession && continueSession.total ? `${Math.round((continueSession.answered / continueSession.total) * 100)}%` : '0%'}
            </span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10.5px] text-[var(--muted)]">目标 {today.goal} 题</span>
            <span className="btn btn-primary btn-sm">{continueSession ? '继续练题' : '开始练习'} ›</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="card p-4">
          <div className="text-[10.5px] text-[var(--muted)]">今日已刷</div>
          <div className="flex items-end gap-1 mt-1.5">
            <span className="stat-num">{fmt(today.answered)}</span>
            <span className="text-[10px] text-[var(--muted)] mb-1">题</span>
            <span className="ml-auto text-[9.5px] text-[var(--good)] mb-1">{goalRatio}% 目标</span>
          </div>
          <div className="progress mt-2" style={{ height: 5 }}>
            <i style={{ width: `${goalRatio}%` }} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[10.5px] text-[var(--muted)]">正确率</div>
          <div className="flex items-end gap-1 mt-1.5">
            <span className="stat-num">{today.accuracy}</span>
            <span className="text-[10px] text-[var(--muted)] mb-1">%</span>
          </div>
          <div className="text-[9.5px] text-[var(--muted)] mt-2">答对 {fmt(today.correct)} / {fmt(today.answered)} 题</div>
        </div>
        <div className="card p-4">
          <div className="text-[10.5px] text-[var(--muted)]">连续学习</div>
          <div className="flex items-end gap-1 mt-1.5">
            <span className="stat-num">{streak.current}</span>
            <span className="text-[10px] text-[var(--muted)] mb-1">天</span>
            <span className="ml-auto text-[9.5px] text-[var(--muted)] mb-1">最长 {streak.max}</span>
          </div>
          <div className="text-[9.5px] text-[var(--muted)] mt-2">累计 {streak.totalDays} 天</div>
        </div>
        <div className="card p-4">
          <div className="text-[10.5px] text-[var(--muted)]">待攻克错题</div>
          <div className="flex items-end gap-1 mt-1.5">
            <span className="stat-num">{fmt(wrongCount)}</span>
            <span className="text-[10px] text-[var(--muted)] mb-1">题</span>
          </div>
          <div className="text-[9.5px] text-[var(--muted)] mt-2">收藏 {fmt(data.favoriteCount)} 题</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        {actions.map((item) => (
          <button key={item.title} className="card p-4 text-left" onClick={() => go(item.to)}>
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center mb-2">
              <Icon name={item.icon} className="w-5 h-5" strokeWidth={1.8} />
            </div>
            <div className="text-[13px] font-medium">{item.title}</div>
            <div className="text-[10px] text-[var(--muted)] mt-0.5">{item.sub}</div>
          </button>
        ))}
      </div>

      <div className="card mt-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[12.5px] font-semibold">模块进度</h3>
          <button className="text-[10px] text-[var(--muted)]" onClick={onStats}>全部</button>
        </div>
        <div className="mt-2 divide-y divide-[var(--line)]">
          {modules.map((module) => (
            <button
              key={module.code}
              className="w-full text-left flex items-center gap-3 py-2"
              onClick={() => onStart({ mode: 'module', module: module.name, count: 20 })}
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[10px] font-semibold">
                {module.code}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] truncate">{module.name}</div>
                <div className="progress mt-1" style={{ height: 4 }}>
                  <i style={{ width: `${Math.max(module.progress, module.done > 0 ? 1 : 0)}%` }} />
                </div>
              </div>
              <span className="text-[10px] text-[var(--muted)]">{fmt(module.done)} / {fmt(module.total)}</span>
            </button>
          ))}
        </div>
      </div>

      {recent.length > 0 ? (
        <div className="card mt-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[12.5px] font-semibold">最近记录</h3>
          </div>
          <div className="mt-2 divide-y divide-[var(--line)]">
            {recent.slice(0, 4).map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[10px] font-semibold">
                  {item.score ?? '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] truncate">{item.title}</div>
                  <div className="text-[9.5px] text-[var(--muted)] mt-0.5">{item.completedAt ?? item.updatedAt}</div>
                </div>
                <span className="text-[10px] text-[var(--muted)]">{item.total} 题</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="h-4" />
    </div>
  );
}