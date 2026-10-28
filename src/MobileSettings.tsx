import { useState } from 'react';
import { clearHistory, errorText, exportBackup, importBackup, setSettings, type Bootstrap } from './api';
import { Icon } from './icons';
import { APP_VERSION } from './version';
import type { Appearance } from './theme';

interface Props {
  data: Bootstrap;
  appearance: Appearance;
  onBack: () => void;
  onBank: () => void;
  onImport: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
}

function fmt(value: number) {
  return value.toLocaleString('zh-CN');
}

export function MobileSettings({ data, appearance, onBack, onBank, onImport, onNotice, onRefresh }: Props) {
  const { dark, setDark, accent, setAccent } = appearance;
  const [goal, setGoal] = useState(Number(data.settings.daily_goal ?? '50'));
  const [archive, setArchive] = useState(Number(data.settings.archive_streak ?? '2'));
  const [aiUrl, setAiUrl] = useState(data.settings.ai_url ?? '');
  const [aiKey, setAiKey] = useState(data.settings.ai_key ?? '');
  const [aiModel, setAiModel] = useState(data.settings.ai_model ?? '');

  const save = (values: Record<string, string>) => {
    setSettings(values).catch((error) => onNotice(errorText(error)));
  };

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <button className="icon-btn -ml-2" onClick={onBack} aria-label="返回"><Icon name="chevronLeft" strokeWidth={1.8} /></button>
        <h2 className="text-[18px] font-semibold">设置</h2>
      </div>

      <div className="card mt-4 p-4">
        <h3 className="text-[12px] font-semibold">题库</h3>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] grid place-items-center text-[11px] font-semibold">
            {data.bank.title.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] font-medium truncate">{data.bank.title}</div>
            <div className="text-[9.5px] text-[var(--muted)] mt-0.5">{fmt(data.bank.questionCount)} 题 · {fmt(data.bank.paperCount)} 套卷</div>
          </div>
          <span className="chip active">启用中</span>
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-ghost btn-sm flex-1" onClick={onImport}>导入</button>
          <button className="btn btn-ghost btn-sm flex-1" onClick={onBank}>切换</button>
        </div>
      </div>

      <div className="card mt-3 p-4">
        <h3 className="text-[12px] font-semibold">AI 导入</h3>
        <p className="text-[9.5px] text-[var(--muted)] mt-1 leading-5">OpenAI 兼容接口，密钥仅保存在本机。</p>
        <input
          className="mt-3 w-full rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] outline-none"
          placeholder="接口地址，如 https://api.deepseek.com/v1"
          value={aiUrl}
          onChange={(event) => {
            setAiUrl(event.target.value);
            save({ ai_url: event.target.value.trim() });
          }}
        />
        <input
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] outline-none"
          placeholder="模型，如 deepseek-chat"
          value={aiModel}
          onChange={(event) => {
            setAiModel(event.target.value);
            save({ ai_model: event.target.value.trim() });
          }}
        />
        <input
          type="password"
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] outline-none"
          placeholder="密钥 sk-..."
          value={aiKey}
          onChange={(event) => {
            setAiKey(event.target.value);
            save({ ai_key: event.target.value.trim() });
          }}
        />
      </div>

      <div className="card mt-3 p-4">
        <h3 className="text-[12px] font-semibold">外观</h3>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11.5px]">深色模式</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setDark(!dark)}>{dark ? '开启' : '关闭'}</button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11.5px]">主题色</span>
          <div className="flex items-center gap-2">
            {(['blue', 'orange', 'teal', 'pink', 'purple'] as const).map((value) => (
              <button
                key={value}
                className={`dot ${accent === value ? 'active' : ''}`}
                style={{ background: value === 'blue' ? '#7FA6CF' : value === 'orange' ? '#D08A5A' : value === 'teal' ? '#63A695' : value === 'pink' ? '#D092A0' : '#9C8FC4' }}
                onClick={() => setAccent(value)}
                aria-label={value}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-3 p-4">
        <h3 className="text-[12px] font-semibold">刷题</h3>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11.5px]">连续答对归档</span>
          <div className="seg">
            {[1, 2, 3].map((value) => (
              <button key={value} className={archive === value ? 'active' : ''} onClick={() => { setArchive(value); save({ archive_streak: String(value) }); }}>{value} 次</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11.5px]">每日目标</span>
          <div className="seg">
            {[20, 50, 100].map((value) => (
              <button key={value} className={goal === value ? 'active' : ''} onClick={() => { setGoal(value); save({ daily_goal: String(value) }); }}>{value}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11.5px]">默认判分</span>
          <div className="seg">
            <button className={data.settings.practice_mode === 'instant' ? 'active' : ''} onClick={() => save({ practice_mode: 'instant' })}>逐题</button>
            <button className={data.settings.practice_mode === 'deferred' ? 'active' : ''} onClick={() => save({ practice_mode: 'deferred' })}>交卷</button>
          </div>
        </div>
      </div>

      <div className="card mt-3 p-4">
        <h3 className="text-[12px] font-semibold">数据</h3>
        <p className="text-[10px] text-[var(--muted)] mt-1 leading-5">进度、错题、笔记、收藏保存在本地；备份不含题库图片。</p>
        <div className="flex gap-2 mt-3">
          <button
            className="btn btn-ghost btn-sm flex-1"
            onClick={() => {
              const stamp = new Date().toISOString().slice(0, 10);
              exportBackup(`shuatibox-backup-${stamp}.db`)
                .then(() => onNotice('备份已导出到应用目录'))
                .catch((error) => onNotice(`导出失败：${errorText(error)}`));
            }}
          >
            导出备份
          </button>
          <button
            className="btn btn-ghost btn-sm flex-1"
            onClick={() => {
              const value = window.prompt('输入备份文件路径');
              if (!value) return;
              importBackup(value)
                .then(() => { onNotice('备份已恢复'); onRefresh(); })
                .catch((error) => onNotice(`恢复失败：${errorText(error)}`));
            }}
          >
            导入备份
          </button>
        </div>
        <button
          className="btn btn-danger btn-sm btn-block mt-2"
          onClick={() => {
            if (!window.confirm('确定清空学习记录？错题、笔记、收藏与统计都会删除，题库不受影响。')) return;
            clearHistory()
              .then(() => { onNotice('学习记录已清空'); onRefresh(); })
              .catch((error) => onNotice(errorText(error)));
          }}
        >
          清空学习记录
        </button>
      </div>

      <div className="text-center text-[9.5px] text-[var(--muted)] mt-4 leading-5">
        刷题盒子 SHUATIBOX v{APP_VERSION}
      </div>
      <div className="h-4" />
    </div>
  );
}