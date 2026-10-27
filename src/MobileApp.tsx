import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bootstrap as bootstrapApi,
  errorText,
  getProfile,
  homeSummary,
  resumeSession,
  startSession,
  type Bootstrap,
  type HomeSummary,
  type Profile,
  type SessionSpec,
  type SessionView,
} from './api';
import { Icon, type IconName } from './icons';
import type { Appearance } from './theme';
import { MobileHome } from './MobileHome';
import { MobileLibrary } from './MobileLibrary';
import { MobileMine } from './MobileMine';
import { MobilePractice } from './MobilePractice';
import { MobileSearch } from './MobileSearch';
import { MobileSettings } from './MobileSettings';
import { MobileStats } from './MobileStats';
import { MobileWrong } from './MobileWrong';
import { BankSheet } from './mobile/BankSheet';
import { CustomPaperSheet } from './mobile/CustomPaperSheet';
import { ImportSheet } from './mobile/ImportSheet';

export type MobileScreen =
  | 'home'
  | 'library'
  | 'practice'
  | 'wrong'
  | 'search'
  | 'mine'
  | 'stats'
  | 'settings';

interface Props {
  appearance: Appearance;
  onNotice: (message: string) => void;
}

const tabs: Array<{ icon: IconName; label: string; screen: MobileScreen }> = [
  { icon: 'home', label: '首页', screen: 'home' },
  { icon: 'library', label: '题库', screen: 'library' },
  { icon: 'wrong', label: '错题', screen: 'wrong' },
  { icon: 'user', label: '我的', screen: 'mine' },
];

const titles: Record<MobileScreen, string> = {
  home: '首页',
  library: '题库',
  practice: '练习',
  wrong: '错题集',
  search: '搜索',
  mine: '我的',
  stats: '学习统计',
  settings: '设置',
};

export function MobileApp({ appearance, onNotice }: Props) {
  const { dark, setDark } = appearance;
  const [screen, setScreen] = useState<MobileScreen>('home');
  const [data, setData] = useState<Bootstrap | null>(null);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [profile, setProfile] = useState<Profile>({ name: 'Boss', avatar: '' });
  const [view, setView] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [bankOpen, setBankOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([bootstrapApi(), homeSummary(), getProfile()])
      .then(([boot, home, prof]) => {
        if (cancelled) return;
        setData(boot);
        setSummary(home);
        setProfile(prof);
      })
      .catch((error) => onNotice(`加载失败：${errorText(error)}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reloadProfile = useCallback(() => {
    getProfile().then(setProfile).catch(() => undefined);
  }, []);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  const begin = useCallback(
    async (spec: SessionSpec) => {
      try {
        const next = await startSession(spec);
        setView(next);
        setScreen('practice');
      } catch (error) {
        onNotice(`开始失败：${errorText(error)}`);
      }
    },
    [onNotice],
  );

  const resume = useCallback(async () => {
    try {
      const next = await resumeSession();
      setView(next);
      setScreen('practice');
    } catch (error) {
      onNotice(`没有可继续的练习`);
    }
  }, [onNotice]);

  const leavePractice = useCallback(() => {
    setView(null);
    setScreen('library');
    refresh();
  }, [refresh]);

  const currentScreen = useRef<MobileScreen>(screen);
  currentScreen.current = screen;
  const lastHomeBack = useRef(0);

  useEffect(() => {
    type BackBridge = () => string;
    const handler: BackBridge = () => {
      if (bankOpen) {
        setBankOpen(false);
        return 'handled';
      }
      if (customOpen) {
        setCustomOpen(false);
        return 'handled';
      }
      if (importOpen) {
        setImportOpen(false);
        return 'handled';
      }
      const active = currentScreen.current;
      if (active === 'practice') {
        leavePractice();
        return 'handled';
      }
      if (active === 'stats' || active === 'settings') {
        setScreen('mine');
        return 'handled';
      }
      if (active === 'search') {
        setScreen('home');
        return 'handled';
      }
      if (active !== 'home') {
        setScreen('home');
        return 'handled';
      }
      const now = Date.now();
      if (now - lastHomeBack.current < 2000) {
        return 'exit';
      }
      lastHomeBack.current = now;
      onNotice('再按一次返回键退出应用');
      return 'handled';
    };
    (window as unknown as { __shuatiboxBack?: BackBridge }).__shuatiboxBack = handler;
    return () => {
      delete (window as unknown as { __shuatiboxBack?: BackBridge }).__shuatiboxBack;
    };
  }, [bankOpen, customOpen, importOpen, leavePractice, onNotice]);

  if (loading && !data) {
    return (
      <div className="shell">
        <div className="grid place-items-center h-[70vh] text-[12px] text-[var(--muted)]">读取题库…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shell">
        <div className="grid place-items-center h-[70vh] px-8 text-center">
          <div>
            <div className="text-[13px]">还没有可用题库</div>
            <div className="text-[11px] text-[var(--muted)] mt-2 leading-6">用「导入题库」选择题库文件夹或 zip 开始。</div>
            <button className="btn btn-primary mt-4" onClick={() => setImportOpen(true)}>导入题库</button>
          </div>
        </div>
        <ImportSheet
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onNotice={onNotice}
          onDone={() => {
            setImportOpen(false);
            refresh();
          }}
        />
      </div>
    );
  }

  if (screen === 'practice' && view) {
    return (
      <MobilePractice
        view={view}
        assetDir={data.assetDir}
        onExit={leavePractice}
        onNotice={onNotice}
        onFinished={refresh}
      />
    );
  }

  const header = (
    <div className="appbar">
      <div className="flex-1 min-w-0">
        <h1>{titles[screen]}</h1>
        <p className="text-[9.5px] text-[var(--muted)] -mt-0.5 truncate">{data.bank.title}</p>
      </div>
      <button className="icon-btn" onClick={() => setScreen('search')} aria-label="搜索">
        <Icon name="search" strokeWidth={1.8} />
      </button>
      <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="深色模式">
        <Icon name="moon" />
      </button>
    </div>
  );

  return (
    <div className="shell">
      {header}

      <section className="screen active">
        {screen === 'home' ? (
          <MobileHome
            data={data}
            summary={summary}
            profileName={profile.name}
            onStart={begin}
            onResume={resume}
            onLibrary={() => setScreen('library')}
            onWrong={() => setScreen('wrong')}
            onSearch={() => setScreen('search')}
            onStats={() => setScreen('stats')}
          />
        ) : screen === 'library' ? (
          <MobileLibrary
            data={data}
            onStart={begin}
            onNotice={onNotice}
            onBank={() => setBankOpen(true)}
            onCustom={() => setCustomOpen(true)}
            onImport={() => setImportOpen(true)}
            reloadKey={reloadKey}
          />
        ) : screen === 'wrong' ? (
          <MobileWrong onStart={begin} onNotice={onNotice} reloadKey={reloadKey} />
        ) : screen === 'search' ? (
          <MobileSearch assetDir={data.assetDir} onStart={begin} onNotice={onNotice} />
        ) : screen === 'mine' ? (
          <MobileMine
            data={data}
            profile={profile}
            onProfileChange={reloadProfile}
            onStats={() => setScreen('stats')}
            onSettings={() => setScreen('settings')}
            onBank={() => setBankOpen(true)}
            onImport={() => setImportOpen(true)}
            onNotice={onNotice}
          />
        ) : screen === 'stats' ? (
          <MobileStats onBack={() => setScreen('mine')} reloadKey={reloadKey} onNotice={onNotice} />
        ) : (
          <MobileSettings
            data={data}
            appearance={appearance}
            onBack={() => setScreen('mine')}
            onBank={() => setBankOpen(true)}
            onImport={() => setImportOpen(true)}
            onNotice={onNotice}
            onRefresh={refresh}
          />
        )}
      </section>

      <nav className="tabbar">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.screen}
              className={`tab ${screen === tab.screen ? 'active' : ''}`}
              onClick={() => setScreen(tab.screen)}
            >
              <Icon name={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <BankSheet
        open={bankOpen}
        data={data}
        onClose={() => setBankOpen(false)}
        onNotice={onNotice}
        onRefresh={refresh}
        onImport={() => {
          setBankOpen(false);
          setImportOpen(true);
        }}
      />
      <CustomPaperSheet
        open={customOpen}
        data={data}
        onClose={() => setCustomOpen(false)}
        onStart={(spec) => {
          setCustomOpen(false);
          void begin(spec);
        }}
      />
      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onNotice={onNotice}
        onDone={() => {
          setImportOpen(false);
          refresh();
        }}
      />

      </div>
  );
}