import type { CSSProperties } from 'react';
import type { HomeSummary, SessionSpec } from './api';
import { Icon } from './icons';

interface Props {
  data: HomeSummary;
  profileName: string;
  onStart: (spec: SessionSpec) => void;
  onResume: (id: string) => void;
  onLibrary: () => void;
  onWrong: () => void;
  onSearch: () => void;
  onStats: () => void;
  onExam: () => void;
  onNotice: (message: string) => void;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '上午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function dateLine() {
  const now = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${week}`;
}

function fmt(value: number) {
  return value.toLocaleString('zh-CN');
}

export function DesktopHome({
  data,
  profileName,
  onStart,
  onResume,
  onLibrary,
  onWrong,
  onSearch,
  onStats,
  onExam,
  onNotice,
}: Props) {
  const { today, streak, continueSession, recent, modules, wrongCount, bank } = data;
  const target = today.goal || 50;
  const goalPercent = Math.min(100, Math.round((today.answered / Math.max(1, target)) * 100));
  const continueProgress = continueSession
    ? Math.round((continueSession.answered / Math.max(1, continueSession.total)) * 100)
    : 0;

  return (
    <section className="screen active">
      <div className="max-w-[1180px] mx-auto px-8 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">{greeting()}，{profileName}</h1>
            <p className="text-[12.5px] text-[var(--muted)] mt-1.5">
              {dateLine()} · {bank.questionCount.toLocaleString('zh-CN')} 题 · 今日 {today.answered} 题
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => onNotice(`今日目标 ${target} 题，已完成 ${today.answered} 题`)}>
            <Icon name="calendar" />
            今日计划
          </button>
        </div>

        <div className="card mt-6 p-6 grid grid-cols-[1fr_auto] items-center gap-8 relative overflow-hidden">
          <div
            className="absolute -right-14 -top-20 w-64 h-64 rounded-full"
            style={{ background: 'var(--accent-soft)', filter: 'blur(6px)', opacity: 0.7 }}
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="chip-accent">{continueSession ? '继续上次' : '开始今天'}</span>
              <span className="text-[11px] text-[var(--muted)]">
                {continueSession ? continueSession.updatedAt : '还没有进行中的练习'}
              </span>
            </div>
            <h2 className="serif text-[21px] mt-3 leading-snug">
              {continueSession ? continueSession.title : '从任意模块开始一组 20 题'}
            </h2>
            <p className="text-[12.5px] text-[var(--ink-2)] mt-2">
              {continueSession
                ? `第 ${Math.min(continueSession.answered + 1, continueSession.total)} 题 / 共 ${continueSession.total} 题 · 已答对 ${continueSession.correct} 题`
                : '题目来自本地题库，答题记录自动保存，可随时继续。'}
            </p>
            <div className="mt-4 flex items-center gap-4">
              <button
                className="btn btn-primary"
                onClick={() =>
                  continueSession ? onResume(continueSession.id) : onStart({ mode: 'module', count: 20 })
                }
              >
                {continueSession ? '继续刷题' : '开始练习'}
                <Icon name="arrowRight" strokeWidth={2} />
              </button>
              {continueSession ? (
                <button
                  className="text-[12px] text-[var(--muted)] hover:text-[var(--ink)]"
                  onClick={() => onStart({ mode: 'module', count: 20 })}
                >
                  新开一组
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-4 relative">
            <div className="ring" style={{ '--p': continueProgress } as CSSProperties}>
              <div>{continueProgress}%</div>
            </div>
            <div className="text-[11.5px] text-[var(--muted)] leading-5">
              <div>{continueSession ? '本组进度' : '今日进度'}</div>
              <div className="text-[var(--ink)] font-medium mt-0.5">
                {continueSession ? `${continueSession.answered} / ${continueSession.total}` : `${today.answered} / ${target}`}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="card p-5">
            <div className="text-[11.5px] text-[var(--muted)]">今日已刷</div>
            <div className="flex items-end gap-2 mt-2">
              <span className="stat-num">{today.answered}</span>
              <span className="text-[11px] text-[var(--muted)] mb-1">题 · 目标 {target}</span>
            </div>
            <div className="progress mt-3">
              <i style={{ width: `${goalPercent}%` }} />
            </div>
          </div>
          <div className="card p-5">
            <div className="text-[11.5px] text-[var(--muted)]">今日正确率</div>
            <div className="flex items-end gap-2 mt-2">
              <span className="stat-num">{today.accuracy.toFixed(1)}</span>
              <span className="text-[11px] text-[var(--muted)] mb-1">%</span>
              <span className="text-[10.5px] text-[var(--muted)] mb-1 ml-auto">答对 {today.correct} 题</span>
            </div>
            <div className="flex gap-1 mt-3">
              {[0, 1, 2, 3, 4].map((index) => (
                <i
                  key={index}
                  className="h-1.5 flex-1 rounded-full"
                  style={{ background: index * 20 < today.accuracy ? 'var(--good)' : 'var(--line)' }}
                />
              ))}
            </div>
          </div>
          <div className="card p-5">
            <div className="text-[11.5px] text-[var(--muted)]">连续学习</div>
            <div className="flex items-end gap-2 mt-2">
              <span className="stat-num">{streak.current}</span>
              <span className="text-[11px] text-[var(--muted)] mb-1">天</span>
              <span className="ml-auto text-[10.5px] text-[var(--muted)] mb-1">最长 {streak.max} 天</span>
            </div>
            <div className="flex gap-1.5 mt-3">
              {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                <span
                  key={index}
                  className="w-5 h-5 rounded-md"
                  style={{
                    background:
                      index >= 7 - Math.min(7, streak.current)
                        ? 'var(--accent)'
                        : 'var(--accent-soft)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { icon: 'library' as const, title: '模块刷题', sub: '按模块 / 题型 / 年份', action: onLibrary },
            { icon: 'clock' as const, title: '模拟考试', sub: '整卷计时 · 交卷判分', action: onExam },
            { icon: 'wrong' as const, title: '错题重做', sub: `${wrongCount} 题待攻克`, action: onWrong },
            { icon: 'search' as const, title: '搜索题目', sub: '题干 / 选项 / 解析', action: onSearch },
          ].map((item) => (
            <button key={item.title} className="card p-4 text-left hover:border-[var(--accent)] transition" onClick={item.action}>
              <div
                className={`w-8 h-8 rounded-lg grid place-items-center mb-3 ${
                  item.title === '错题重做' ? 'bg-[var(--bad-soft)] text-[var(--bad)]' : 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                }`}
              >
                <Icon name={item.icon} className="w-4 h-4" strokeWidth={1.8} />
              </div>
              <div className="text-[13px] font-medium">{item.title}</div>
              <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{item.sub}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1.25fr_1fr] gap-4 mt-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[13.5px] font-semibold">最近模考</h3>
              <button className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)]" onClick={onStats}>
                全部记录
              </button>
            </div>
            <div className="mt-3 divide-y divide-[var(--line)]">
              {recent.length === 0 ? (
                <div className="py-6 text-center text-[11.5px] text-[var(--muted)]">还没有完成过整卷或模考</div>
              ) : (
                recent.map((item) => (
                  <button
                    key={item.id}
                    className="flex items-center gap-3 py-2.5 w-full text-left"
                    onClick={() => onResume(item.id)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[11px] font-semibold">
                      {item.score ?? '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] truncate">{item.title}</div>
                      <div className="text-[10.5px] text-[var(--muted)] mt-0.5">
                        {item.completedAt} · 用时 {Math.round(item.durationSec / 60)} 分钟
                      </div>
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">{item.mode === 'exam' ? '模考' : '整卷'}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[13.5px] font-semibold">模块进度</h3>
              <span className="text-[10.5px] text-[var(--muted)]">按已刷题数</span>
            </div>
            <div className="mt-4 space-y-3">
              {modules.map((item) => (
                <button key={item.name} className="w-full text-left" onClick={() => onStart({ mode: 'module', module: item.name, count: 20 })}>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span>{item.name}</span>
                    <span className="text-[var(--muted)]">
                      {fmt(item.done)} / {fmt(item.total)}
                    </span>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${Math.max(item.progress, item.done > 0 ? 1 : 0)}%` }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="h-8" />
      </div>
    </section>
  );
}
