import { fmtNumber, t } from './i18n';
import { useState } from 'react';
import {
  errorText,
  searchQuestions,
  toQuestion,
  type QuestionDto,
  type SearchResult,
  type SessionSpec,
} from './api';
import { Icon } from './icons';
import { Modal } from './Modal';

interface Props {
  assetDir: string;
  totalQuestions: number;
  onStart: (spec: SessionSpec) => void;
  onNotice: (message: string) => void;
}

function plain(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function DesktopSearch({ assetDir, totalQuestions, onStart, onNotice }: Props) {
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
      onNotice(t("搜索失败：{p0}", { p0: errorText(error) }));
    } finally {
      setLoading(false);
    }
  };

  const preview = selected ? toQuestion(selected, assetDir) : null;

  return (
    <section className="screen active">
      <div className="max-w-[1180px] mx-auto px-8 py-8">
        <h1 className="text-[24px] font-semibold tracking-tight">{t("搜索题目")}</h1>
        <p className="text-[12.5px] text-[var(--muted)] mt-1.5">{t("题干 / 选项 / 解析 / qid / 试卷名")}</p>

        <div className="card mt-5 p-4 flex items-center gap-3">
          <Icon name="search" className="w-5 h-5 text-[var(--muted)]" />
          <input
            className="flex-1 bg-transparent outline-none text-[14px]"
            placeholder={t("输入关键词，例如：资料分析、行政处罚、qid 2263114")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void run()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={() => void run()} disabled={loading || !query.trim()}>
            {loading ? t("搜索中…") : t("搜索")}
          </button>
        </div>

        {result ? (
          <div className="mt-4">
            <div className="text-[11px] text-[var(--muted)] mb-2">
              {result.total > result.items.length
                ? t("共 {p0} 条，显示前 {p1} 条", { p0: result.total, p1: result.items.length })
                : t("{p0} 条结果", { p0: result.total })}
            </div>
            <div className="card overflow-hidden">
              {result.items.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-[var(--muted)]">{t("没有匹配的题目")}</div>
              ) : (
                result.items.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left px-5 py-4 border-b border-[var(--line)] last:border-0 hover:bg-[var(--paper)]"
                    onClick={() => setSelected(item)}
                  >
                    <div className="flex items-center gap-2 text-[10.5px] text-[var(--muted)]">
                      <span className="chip-accent">{item.module}</span>
                      <span>{item.type}</span>
                      <span>·</span>
                      <span>qid {item.qid}</span>
                      <span className="ml-auto">{item.paperTitle}</span>
                    </div>
                    <div className="text-[12.5px] leading-6 mt-2 line-clamp-2">{plain(item.stem).slice(0, 220)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="card mt-4 p-10 text-center">
            <div className="serif text-[18px]">{t("从")} {fmtNumber(totalQuestions)}  {t("道题里找一道")}</div>
            <div className="text-[11.5px] text-[var(--muted)] mt-2">{t("搜索不会联网，全部在本地 SQLite 中完成。")}</div>
          </div>
        )}
      </div>

      <Modal
        open={!!preview}
        title={preview ? `${preview.module} · ${preview.type}` : t("题目")}
        onClose={() => setSelected(null)}
        wide
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setSelected(null)}>{t("关闭")}</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!selected) return;
                onStart({ mode: 'custom', questionIds: [selected.id], title: t("单题练习") });
                setSelected(null);
              }}
            >
              {t("开始练习")}
            </button>
          </>
        }
      >
        {preview ? (
          <div>
            <div className="text-[10.5px] text-[var(--muted)]">
              qid {preview.qid} · {preview.source} · {preview.paperTitle}
            </div>
            {preview.material ? (
              <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <div className="text-[10.5px] text-[var(--muted)] mb-2">{preview.material.title}</div>
                <div className="qtext max-h-52 overflow-y-auto scroll text-[12.5px] leading-7" dangerouslySetInnerHTML={{ __html: preview.material.html }} />
              </div>
            ) : null}
            <div className="qtext mt-3" dangerouslySetInnerHTML={{ __html: preview.stemHtml }} />
            <div className="mt-4 space-y-2">
              {preview.options.map((option) => (
                <div
                  key={option.label}
                  className={`opt ${preview.answer.includes(option.label) ? 'is-correct' : ''}`}
                >
                  <span className="opt-key">{option.label}</span>
                  <span dangerouslySetInnerHTML={{ __html: option.text }} />
                </div>
              ))}
            </div>
            {preview.answer.length > 0 ? (
              <div className="mt-4 text-[12px] text-[var(--ink-2)]">
                {t("正确答案：")}<b>{preview.answer.join('')}</b>
              </div>
            ) : (
              <div className="mt-4 text-[12px] text-[var(--warn)]">{t("答案缺失，不参与判分")}</div>
            )}
            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <div className="text-[12px] font-semibold mb-2">{t("解析")}</div>
              <div className="text-[12.5px] leading-7 text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: preview.explanationHtml }} />
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
