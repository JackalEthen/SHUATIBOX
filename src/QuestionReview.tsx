import { useMemo } from 'react';
import { toQuestion, type QuestionDto } from './api';

interface Props {
  question: QuestionDto;
  assetDir: string;
  mobile?: boolean;
  onUnfavorite?: () => void;
}

export function QuestionReview({ question, assetDir, mobile, onUnfavorite }: Props) {
  const item = useMemo(() => toQuestion(question, assetDir), [question, assetDir]);

  return (
    <div className={mobile ? '' : 'max-w-[760px]'}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip-accent">{item.module}</span>
        <span className="chip">{item.type}</span>
        <span className="text-[10.5px] text-[var(--muted)]">qid {item.qid}</span>
        {item.source ? <span className="text-[10.5px] text-[var(--muted)] ml-auto">{item.source}</span> : null}
      </div>

      {item.material ? (
        <div className="card mt-4 p-4 bg-[var(--paper-2)]">
          <div className="text-[11.5px] font-semibold mb-2">{item.material.title}</div>
          <div className="material-body" dangerouslySetInnerHTML={{ __html: item.material.html }} />
        </div>
      ) : null}

      <div className="qtext mt-4" dangerouslySetInnerHTML={{ __html: item.stemHtml }} />

      <div className="mt-4 space-y-2.5">
        {item.options.map((option) => {
          const correct = item.answer.includes(option.label);
          return (
            <div key={option.label} className={`opt answered ${correct ? 'is-correct' : ''}`}>
              <span className="opt-key">{option.label}</span>
              <span dangerouslySetInnerHTML={{ __html: option.text }} />
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--good)] bg-[var(--good-soft)] px-4 py-3">
        <span className="text-[11.5px] text-[var(--muted)]">正确答案</span>
        <b className="ml-2 text-[13px] text-[var(--good)]">
          {item.answer.length > 0 ? item.answer.join('、') : '答案缺失'}
        </b>
      </div>

      <div className="mt-4 text-[12px] font-semibold text-[var(--ink-2)]">解析</div>
      <div className="read-explain text-[var(--ink-2)] mt-1.5" dangerouslySetInnerHTML={{ __html: item.explanationHtml }} />
      {item.review && !item.review.missing ? (
        <div className="mt-2 text-[11px] text-[var(--warn)]">解析最终答案：{item.review.explanationAnswer}</div>
      ) : null}

      {onUnfavorite ? (
        <button className="btn btn-ghost btn-sm mt-5" onClick={onUnfavorite}>
          取消收藏
        </button>
      ) : null}
    </div>
  );
}
