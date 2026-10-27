import { useState } from 'react';
import { errorText, searchQuestions, toQuestion, type QuestionDto, type SearchResult, type SessionSpec } from './api';
import { Icon } from './icons';
import { MobileSheet } from './MobileSheet';

interface Props {
  assetDir: string;
  onStart: (spec: SessionSpec) => void;
  onNotice: (message: string) => void;
}

function plain(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function MobileSearch({ assetDir, onStart, onNotice }: Props) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<QuestionDto | null>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      setResult(await searchQuestions(query, 60));
    } catch (error) {
      onNotice(`搜索失败：${errorText(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const preview = selected ? toQuestion(selected, assetDir) : null;

  return (
    <div className="px-4 pt-4">
      <div className="card p-3 flex items-center gap-2">
        <Icon name="search" className="w-5 h-5 text-[var(--muted)]" />
        <input
          className="flex-1 bg-transparent outline-none text-[13px]"
          placeholder="输入关键词，例如：资料分析、qid"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void run()}
        />
        <button className="text-[10.5px] text-[var(--muted)]" onClick={() => { setQuery(''); setResult(null); }}>清空</button>
      </div>

      <button className="btn btn-primary btn-block mt-3" disabled={loading || !query.trim()} onClick={() => void run()}>
        {loading ? '搜索中…' : '搜索'}
      </button>

      {result ? (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-[var(--muted)]">{result.total} 条结果</span>
          </div>
          <div className="mt-2 space-y-2.5">
            {result.items.length === 0 ? (
              <div className="card p-8 text-center text-[11.5px] text-[var(--muted)]">没有匹配的题目</div>
            ) : (
              result.items.map((item) => (
                <button key={item.id} className="card w-full p-4 text-left" onClick={() => setSelected(item)}>
                  <div className="flex items-center gap-2 text-[9.5px] text-[var(--muted)]">
                    <span className="chip-accent">{item.module}</span>
                    <span>{item.type}</span>
                    <span>qid {item.qid}</span>
                  </div>
                  <div className="text-[12px] leading-6 mt-2 line-clamp-2">{plain(item.stem).slice(0, 180)}</div>
                  <div className="text-[9.5px] text-[var(--muted)] mt-1 truncate">{item.paperTitle}</div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="card mt-3 p-8 text-center">
          <div className="serif text-[16px]">题干 / 选项 / 解析 / qid</div>
          <div className="text-[10.5px] text-[var(--muted)] mt-2">全部在本地完成，不联网。</div>
        </div>
      )}
      <div className="h-4" />

      <MobileSheet open={!!preview} onClose={() => setSelected(null)}>
        {preview ? (
          <>
            <div className="grabber" />
            <div className="text-[10.5px] text-[var(--muted)]">qid {preview.qid} · {preview.source} · {preview.paperTitle}</div>

            {preview.material ? (
              <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <div className="text-[10.5px] text-[var(--muted)] mb-2">{preview.material.title}</div>
                <div className="qtext max-h-52 overflow-y-auto scroll text-[12.5px] leading-7" dangerouslySetInnerHTML={{ __html: preview.material.html }} />
              </div>
            ) : null}

            <div className="qtext mt-3" dangerouslySetInnerHTML={{ __html: preview.stemHtml }} />

            <div className="mt-4 space-y-2">
              {preview.options.map((option) => (
                <div key={option.label} className={`opt ${preview.answer.includes(option.label) ? 'is-correct' : ''}`}>
                  <span className="opt-key">{option.label}</span>
                  <span dangerouslySetInnerHTML={{ __html: option.text }} />
                </div>
              ))}
            </div>

            {preview.answer.length > 0 ? (
              <div className="mt-4 text-[12px] text-[var(--ink-2)]">正确答案：<b>{preview.answer.join('')}</b></div>
            ) : (
              <div className="mt-4 text-[12px] text-[var(--warn)]">答案缺失，不参与判分</div>
            )}

            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <div className="text-[12px] font-semibold mb-2">解析</div>
              <div className="text-[12.5px] leading-7 text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: preview.explanationHtml }} />
            </div>

            <div className="flex gap-2 mt-4">
              <button className="btn btn-ghost flex-1" onClick={() => setSelected(null)}>关闭</button>
              <button
                className="btn btn-primary flex-1"
                onClick={() => {
                  if (!selected) return;
                  onStart({ mode: 'custom', questionIds: [selected.id], title: '单题练习' });
                  setSelected(null);
                }}
              >
                开始练习
              </button>
            </div>
            <div className="h-4" />
          </>
        ) : null}
      </MobileSheet>
    </div>
  );
}