import { useCallback, useEffect, useState } from 'react';
import { bootstrap, errorText, getProfile, getSession, homeSummary, startSession, type Bootstrap, type HomeSummary, type Profile, type SessionSpec, type SessionView } from './api';
import { BankDialog } from './BankDialog';
import { CustomPaperDialog } from './CustomPaperDialog';
import { DesktopHome } from './DesktopHome';
import { DesktopLibrary } from './DesktopLibrary';
import { DesktopPractice } from './DesktopPractice';
import { DesktopSearch } from './DesktopSearch';
import { DesktopSettings } from './DesktopSettings';
import { DesktopStats } from './DesktopStats';
import { DesktopWrong } from './DesktopWrong';
import { ExamPicker } from './ExamPicker';
import { Icon, type IconName } from './icons';
import { APP_VERSION } from './version';
import { ImportDialog } from './ImportDialog';
import type { Appearance, Accent } from './theme';

type Screen = 'home' | 'library' | 'practice' | 'wrong' | 'search' | 'stats' | 'settings';

interface Props {
  appearance: Appearance;
  onNotice: (message: string) => void;
}

const accents: Array<{ key: Accent; color: string; label: string }> = [
  { key: 'blue', color: '#7FA6CF', label: '淡蓝' },
  { key: 'orange', color: '#D08A5A', label: '橙' },
  { key: 'teal', color: '#63A695', label: '青绿' },
  { key: 'pink', color: '#D092A0', label: '淡粉' },
  { key: 'purple', color: '#9C8FC4', label: '浅紫' },
];

export function DesktopApp({ appearance, onNotice }: Props) {
  const { accent, setAccent, dark, setDark } = appearance;
  const [screen, setScreen] = useState<Screen>('home');
  const [data, setData] = useState<Bootstrap | null>(null);
  const [home, setHome] = useState<HomeSummary | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [profile, setProfile] = useState<Profile>({ name: 'Boss', avatar: '' });

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
    Promise.all([bootstrap(), homeSummary(), getProfile()])
      .then(([next, summary, prof]) => {
        setData(next);
        setHome(summary);
        setProfile(prof);
        setLoadError('');
      })
      .catch((error) => setLoadError(errorText(error)));
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (!data) return;
    if (screen === 'home' && !home) {
      homeSummary().then(setHome).catch(() => undefined);
    }
  }, [screen, data, home]);

  const begin = async (spec: SessionSpec) => {
    if (starting) return;
    setStarting(true);
    try {
      const next = await startSession(spec);
      setView(next);
      setScreen('practice');
    } catch (error) {
      onNotice(`开始练习失败：${errorText(error)}`);
    } finally {
      setStarting(false);
    }
  };

  const resume = async (id: string) => {
    try {
      const next = await getSession(id);
      setView(next);
      setScreen('practice');
    } catch (error) {
      onNotice(`读取练习失败：${errorText(error)}`);
    }
  };

  const leavePractice = () => {
    const mode = view?.session.mode;
    setView(null);
    setScreen(mode === 'paper' || mode === 'exam' ? 'library' : 'home');
    refresh();
  };

  const go = (next: Screen) => {
    setView(null);
    setScreen(next);
  };

  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center p-8">
        <div className="card max-w-[520px] w-full p-8 text-center">
          <div className="seal mx-auto">题</div>
          <h1 className="text-[20px] font-semibold mt-4">刷题盒子 SHUATIBOX</h1>
          <p className="text-[12px] text-[var(--muted)] mt-2 leading-6">
            {loadError || '正在读取本地题库…'}
          </p>
          {loadError ? (
            <div className="mt-5 flex justify-center gap-2">
              <button className="btn btn-primary" onClick={() => setImportOpen(true)}>导入题库</button>
              <button className="btn btn-ghost" onClick={refresh}>重试</button>
            </div>
          ) : null}
        </div>
        <ImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onDone={refresh}
          onNotice={onNotice}
        />
      </div>
    );
  }

  const title =
    screen === 'home'
      ? '首页'
      : screen === 'library'
        ? '题库'
        : screen === 'practice'
          ? '练习'
          : screen === 'wrong'
            ? '错题'
            : screen === 'search'
              ? '搜索'
              : screen === 'stats'
                ? '统计'
                : '设置';

  const homeData: HomeSummary = home ?? {
    today: data.today,
    streak: data.streak,
    continueSession: data.continueSession,
    recent: [],
    modules: data.modules,
    wrongCount: data.wrongCount,
    favoriteCount: data.favoriteCount,
    bank: data.bank,
  };

  const navItems: Array<{ icon: IconName; label: string; badge?: string; target: Screen }> = [
    { icon: 'home', label: '首页', target: 'home' },
    { icon: 'library', label: '题库', badge: `${data.bank.paperCount} 卷`, target: 'library' },
    { icon: 'wrong', label: '错题', badge: String(data.wrongCount), target: 'wrong' },
    { icon: 'search', label: '搜索', target: 'search' },
    { icon: 'stats', label: '统计', target: 'stats' },
    { icon: 'settings', label: '设置', target: 'settings' },
  ];

  return (
    <div className="flex h-screen">
      <aside className="w-[248px] shrink-0 border-r border-[var(--line)] bg-[var(--paper-2)] flex flex-col">
        <div className="px-5 pt-6 pb-5 flex items-center gap-0.5">
          <img
            src="/app-icon.png"
            alt="刷题盒子"
            className="w-12 h-12 rounded-[12px] object-cover shrink-0"
          />
          <div>
            <div className="font-semibold tracking-wide text-[15px]">刷题盒子</div>
            <div className="text-[9px] tracking-[.22em] text-[var(--muted)] mt-0.5">SHUATIBOX</div>
          </div>
        </div>

        <button
          className="mx-4 mb-4 flex items-center gap-3 p-2.5 rounded-xl border border-[var(--line)] bg-[var(--card)] hover:border-[var(--accent)] transition text-left"
          onClick={() => setBankOpen(true)}
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[12px] font-semibold">行</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium truncate">{data.bank.title}</div>
            <div className="text-[10.5px] text-[var(--muted)] mt-0.5">
              {data.bank.questionCount.toLocaleString('zh-CN')} 题 · {data.bank.reviewCount} 题待校对
            </div>
          </div>
          <Icon name="chevronDown" className="w-3.5 h-3.5 text-[var(--muted)]" strokeWidth={2} />
        </button>

        <nav className="px-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`nav-btn ${screen === item.target || (screen === 'practice' && item.target === 'library') ? 'active' : ''}`}
              onClick={() => go(item.target)}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.badge ? <span className="n">{item.badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-[var(--line)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10.5px] text-[var(--muted)] mr-1">主题</span>
            {accents.map((item) => (
              <button
                key={item.key}
                className={`dot ${accent === item.key ? 'active' : ''}`}
                style={{ background: item.color }}
                onClick={() => setAccent(item.key)}
                aria-label={item.label}
              />
            ))}
          </div>
          <button className="flex items-center gap-2 text-[11.5px] text-[var(--ink-2)] hover:text-[var(--ink)]" onClick={() => setDark(!dark)}>
            <Icon name="moon" className="w-4 h-4" />
            <span>{dark ? '浅色模式' : '深色模式'}</span>
          </button>
          <div className="mt-4 text-[10px] text-[var(--muted)] flex items-center justify-between">
            <span>v{APP_VERSION} · 本地离线</span>
            <span className="flex items-center gap-1">
              <i className="w-1.5 h-1.5 rounded-full bg-[var(--good)] inline-block" />
              数据已保存
            </span>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header
          className="h-14 shrink-0 border-b border-[var(--line)] flex items-center gap-3 px-6"
          style={{ background: 'color-mix(in srgb,var(--paper) 82%,transparent)', backdropFilter: 'blur(8px)' }}
        >
          <div className="text-[13.5px] font-medium">{title}</div>
          <div className="ml-auto flex items-center gap-2">
            <button className="icon-btn" onClick={() => go('search')} aria-label="搜索">
              <Icon name="search" strokeWidth={1.8} />
            </button>
            <span className="chip">今日 {data.today.answered} 题</span>
            <span className="chip">
              <i className="w-1.5 h-1.5 rounded-full bg-[var(--good)] inline-block" />
              连续 {data.streak.current} 天
            </span>
          </div>
        </header>

        <div className={`flex-1 min-h-0 ${screen === 'practice' ? 'overflow-hidden' : 'overflow-y-auto scroll'}`}>
          {screen === 'home' ? (
            <DesktopHome
              data={homeData}
              profileName={profile.name}
              onStart={(spec) => void begin(spec)}
              onResume={(id) => void resume(id)}
              onLibrary={() => go('library')}
              onWrong={() => go('wrong')}
              onSearch={() => go('search')}
              onStats={() => go('stats')}
              onExam={() => setExamOpen(true)}
              onNotice={onNotice}
            />
          ) : screen === 'library' ? (
            <DesktopLibrary
              data={data}
              refreshKey={refreshKey}
              onStart={(spec) => void begin(spec)}
              onNotice={onNotice}
              onCustom={() => setCustomOpen(true)}
              onImport={() => setImportOpen(true)}
              onBank={() => setBankOpen(true)}
            />
          ) : screen === 'practice' && view ? (
            <DesktopPractice
              key={view.session.id}
              view={view}
              assetDir={data.assetDir}
              settings={data.settings}
              onExit={leavePractice}
              onNotice={onNotice}
              onFinished={refresh}
              onGoWrong={() => {
                setView(null);
                setScreen('wrong');
              }}
              onRetry={(spec) => void begin(spec)}
            />
          ) : screen === 'wrong' ? (
            <DesktopWrong data={data} refreshKey={refreshKey} onStart={(spec) => void begin(spec)} onNotice={onNotice} />
          ) : screen === 'search' ? (
            <DesktopSearch
              assetDir={data.assetDir}
              totalQuestions={data.bank.questionCount}
              onStart={(spec) => void begin(spec)}
              onNotice={onNotice}
            />
          ) : screen === 'stats' ? (
            <DesktopStats refreshKey={refreshKey} onStart={(spec) => void begin(spec)} onNotice={onNotice} />
          ) : (
            <DesktopSettings
              data={data}
              appearance={appearance}
              profile={profile}
              onProfileChange={refresh}
              onRefresh={refresh}
              onNotice={onNotice}
              onImport={() => setImportOpen(true)}
            />
          )}
        </div>
      </main>

      <CustomPaperDialog open={customOpen} data={data} onClose={() => setCustomOpen(false)} onStart={(spec) => void begin(spec)} />
      <ExamPicker open={examOpen} onClose={() => setExamOpen(false)} onStart={(spec) => void begin(spec)} onNotice={onNotice} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={refresh} onNotice={onNotice} bank={data.bank} banks={data.banks} />
      <BankDialog
        open={bankOpen}
        data={data}
        onClose={() => setBankOpen(false)}
        onRefresh={refresh}
        onImport={() => setImportOpen(true)}
        onNotice={onNotice}
      />
    </div>
  );
}
