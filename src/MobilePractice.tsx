import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addReport,
  errorText,
  finishSession,
  getNote,
  isFavorite,
  saveAnswer,
  saveNote,
  toggleFavorite,
  toQuestion,
  type AnswerDto,
  type AnswerResult,
  type FinishResult,
  type SessionView,
} from './api';
import { Icon } from './icons';
import type { PracticeQuestion } from './questions';

interface Props {
  view: SessionView;
  assetDir: string;
  onExit: () => void;
  onNotice: (message: string) => void;
  onFinished: () => void;
}

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function elapsedSeconds(createdAt: string) {
  const value = Date.parse(createdAt.replace(' ', 'T'));
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.floor((Date.now() - value) / 1000));
}

export function MobilePractice({ view, assetDir, onExit, onNotice, onFinished }: Props) {
  const isExam = view.session.mode === 'exam';
  const questions = useMemo<PracticeQuestion[]>(
    () => view.questions.map((question) => toQuestion(question, assetDir)),
    [view, assetDir],
  );
  const initialAnswers = useMemo(() => {
    const map: Record<string, AnswerDto> = {};
    for (const answer of view.answers) map[answer.questionId] = answer;
    return map;
  }, [view]);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerDto>>(initialAnswers);
  const [verdicts, setVerdicts] = useState<Record<string, AnswerResult>>({});
  const [flags, setFlags] = useState<Set<string>>(new Set(view.flags));
  const [favorite, setFavorite] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    isExam && view.session.durationSec > 0
      ? Math.max(0, view.session.durationSec - elapsedSeconds(view.session.createdAt))
      : 0,
  );
  const startedAt = useRef(Date.now());

  const question = questions[index];
  const current = question ? answers[question.id] : undefined;
  const answeredCount = questions.filter((item) => answers[item.id]?.submitted).length;

  useEffect(() => {
    if (!isExam) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isExam]);

  useEffect(() => {
    startedAt.current = Date.now();
    if (!question) return;
    setFavorite(false);
    isFavorite(question.id).then(setFavorite).catch(() => setFavorite(false));
  }, [question?.id]);

  const submit = useCallback(
    async (label: string) => {
      if (!question || busy) return;
      const selected = current?.selected ?? [];
      const next = selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label];
      setBusy(true);
      try {
        await saveAnswer({
          sessionId: view.session.id,
          questionId: question.id,
          selected: next,
          submitted: false,
          elapsedMs: Date.now() - startedAt.current,
        });
        setAnswers((prev) => ({
          ...prev,
          [question.id]: {
            questionId: question.id,
            selected: next,
            submitted: false,
            correct: false,
            flagged: prev[question.id]?.flagged ?? false,
          },
        }));
      } catch (error) {
        onNotice(`选择失败：${errorText(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [question, busy, current, view.session.id, onNotice],
  );

  const grade = useCallback(
    async (final: boolean) => {
      if (!question || busy) return;
      const selected = answers[question.id]?.selected ?? [];
      setBusy(true);
      try {
        const value = await saveAnswer({
          sessionId: view.session.id,
          questionId: question.id,
          selected,
          submitted: true,
          elapsedMs: Date.now() - startedAt.current,
        });
        setVerdicts((prev) => ({ ...prev, [question.id]: value }));
        setAnswers((prev) => ({
          ...prev,
          [question.id]: {
            questionId: question.id,
            selected,
            submitted: true,
            correct: value.correct,
            flagged: prev[question.id]?.flagged ?? false,
          },
        }));
        if (final) void finish();
      } catch (error) {
        onNotice(`判分失败：${errorText(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [question, busy, answers, view.session.id, onNotice],
  );

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      const value = await finishSession(view.session.id);
      setResult(value);
      onFinished();
    } catch (error) {
      onNotice(`交卷失败：${errorText(error)}`);
    } finally {
      setBusy(false);
      setConfirmSubmit(false);
    }
  }, [view.session.id, onNotice, onFinished]);

  const toggleFlag = useCallback(async () => {
    if (!question) return;
    const next = new Set(flags);
    const on = !next.has(question.id);
    if (on) next.add(question.id);
    else next.delete(question.id);
    setFlags(next);
    try {
      await saveAnswer({
        sessionId: view.session.id,
        questionId: question.id,
        selected: answers[question.id]?.selected ?? [],
        submitted: answers[question.id]?.submitted ?? false,
        flagged: on,
      });
    } catch (error) {
      onNotice(`标记失败：${errorText(error)}`);
    }
  }, [question, flags, answers, view.session.id, onNotice]);

  if (result) {
    const groups = new Map<string, { total: number; correct: number }>();
    for (const item of view.questions) {
      const group = groups.get(item.module) ?? { total: 0, correct: 0 };
      group.total += 1;
      if (answers[item.id]?.correct) group.correct += 1;
      groups.set(item.module, group);
    }
    let weakest = '';
    let weakestRate = 101;
    for (const [module, item] of groups) {
      const rate = item.total ? Math.round((item.correct / item.total) * 100) : 0;
      if (rate < weakestRate) {
        weakestRate = rate;
        weakest = module;
      }
    }
    return (
      <div className="shell">
        <div className="appbar">
          <button className="icon-btn" onClick={onExit} aria-label="返回"><Icon name="chevronLeft" strokeWidth={1.8} /></button>
          <h1 className="flex-1">交卷完成</h1>
        </div>
        <div className="px-4 py-5 text-center">
          <div className="chip-accent inline-flex">{isExam ? '模考完成' : '练习完成'}</div>
          <h2 className="text-[18px] font-semibold mt-2">{view.session.title}</h2>
          <p className="text-[10.5px] text-[var(--muted)] mt-1">
            未答 {result.unanswered} 题 · 正确率 {result.accuracy}%
          </p>
          <div className="card mt-4 p-5 text-center">
            <div className="text-[10.5px] text-[var(--muted)]">得分</div>
            <div className="text-[54px] font-semibold leading-none mt-1">{result.score}</div>
            <div className="text-[10px] text-[var(--muted)] mt-1">满分 100</div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[var(--line)]">
              <div><div className="text-[9.5px] text-[var(--muted)]">正确率</div><div className="text-[15px] font-semibold mt-0.5">{result.accuracy}%</div></div>
              <div><div className="text-[9.5px] text-[var(--muted)]">答对</div><div className="text-[15px] font-semibold mt-0.5">{result.correct}/{view.questions.length}</div></div>
              <div><div className="text-[9.5px] text-[var(--muted)]">已答</div><div className="text-[15px] font-semibold mt-0.5">{result.answered}</div></div>
            </div>
          </div>
          <div className="card mt-3 p-4 text-left">
            <h3 className="text-[12px] font-semibold">模块表现</h3>
            <div className="mt-3 space-y-2.5">
              {[...groups.entries()].map(([module, item]) => {
                const rate = item.total ? Math.round((item.correct / item.total) * 100) : 0;
                return (
                  <div key={module}>
                    <div className="flex justify-between text-[10.5px] mb-1"><span>{module}</span><span>{item.correct}/{item.total} · {rate}%</span></div>
                    <div className="progress" style={{ height: 5 }}><i style={{ width: `${rate}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
          {weakest ? (
            <div className="card mt-3 p-4 text-left">
              <h3 className="text-[12px] font-semibold">建议</h3>
              <div className="mt-2 text-[11.5px] text-[var(--ink-2)] leading-6">
                {weakest} 正确率偏低，建议回看错题与解析。
              </div>
            </div>
          ) : null}
          <div className="flex gap-2 mt-4">
            <button className="btn btn-ghost flex-1" onClick={onExit}>返回题库</button>
          </div>
          <div className="h-6" />
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="shell">
        <div className="grid place-items-center h-[70vh] text-[12px] text-[var(--muted)]">没有可练题目</div>
      </div>
    );
  }

  const verdict = verdicts[question.id];
  const showAnswer = current?.submitted || (verdict && verdict.canGrade === false);

  return (
    <div className="shell shell-flush">
      <div className="h-12 shrink-0 border-b border-[var(--line)] flex items-center gap-2 px-3" style={{ background: 'var(--paper)' }}>
        <button className="icon-btn" onClick={onExit} aria-label="返回"><Icon name="chevronLeft" strokeWidth={1.8} /></button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="chip-accent">{question.module}</span>
            <span className="text-[10px] text-[var(--muted)]">第 <b className="text-[var(--ink-2)]">{index + 1}</b>/{questions.length}</span>
          </div>
          <div className="w-24"><div className="progress mt-1" style={{ height: 4 }}><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div></div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {isExam ? (
            <span className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] font-mono text-[13px] font-semibold tabular-nums">
              {formatClock(remaining)}
            </span>
          ) : (
            <div className="seg">
              <button className={(answers[question.id]?.submitted || verdict) ? 'active' : ''} disabled>逐题</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll px-4 py-4">
        <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
          <span>qid {question.qid}</span>
          <span>·</span>
          <span>{question.type}</span>
          <span>·</span>
          <span>{question.source}</span>
        </div>

        {question.material ? (
          <button className="w-full card p-3 flex items-center gap-2 text-left mt-3" onClick={() => setMaterialOpen(true)}>
            <Icon name="book" className="w-4 h-4 text-[var(--accent-ink)]" strokeWidth={1.7} />
            <span className="text-[11.5px]">查看材料：{question.material.title}</span>
            <span className="ml-auto text-[10px] text-[var(--muted)]">点击展开</span>
          </button>
        ) : null}

        <div className="qtext mt-4" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />

        {question.imageMissing ? (
          <div className="mt-3 text-[11px] text-[var(--warn)] leading-5">
            本题原始图片缺失，题干或选项中的图无法显示；不影响作答。
          </div>
        ) : null}

        <div className="mt-4 space-y-2.5">
          {question.options.map((option) => {
            const selected = current?.selected?.includes(option.label) ?? false;
            const classes = ['opt'];
            if (selected) classes.push('is-selected');
            if (showAnswer && question.answer.includes(option.label)) classes.push('is-correct');
            if (showAnswer && selected && !question.answer.includes(option.label)) classes.push('is-wrong');
            return (
              <button
                key={option.label}
                className={classes.join(' ')}
                onClick={() => {
                  if (showAnswer && verdict) return;
                  if (showAnswer && !verdict) return;
                  void submit(option.label);
                }}
              >
                <span className="opt-key">{option.label}</span>
                <span dangerouslySetInnerHTML={{ __html: option.text }} />
              </button>
            );
          })}
        </div>

        {showAnswer ? (
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--paper-2)] p-4">
            <div className="flex items-center gap-2">
              <span className="chip-accent" style={{ color: verdict?.correct ?? current?.correct ? 'var(--good)' : 'var(--bad)' }}>
                {verdict?.canGrade === false ? '答案缺失' : (verdict?.correct ?? current?.correct) ? '回答正确' : '回答错误'}
              </span>
              <span className="text-[10.5px] text-[var(--muted)]">正确答案 <b className="text-[var(--ink-2)]">{question.answer.join('')}</b></span>
            </div>
            {question.review && !question.review.missing ? (
              <div className="mt-2 text-[11px] text-[var(--warn)]">解析最终答案：{question.review.explanationAnswer}</div>
            ) : null}
            <div className="text-[12px] font-semibold text-[var(--ink-2)] mt-3">解析</div>
            <div className="text-[12.5px] leading-6 text-[var(--ink-2)] mt-1" dangerouslySetInnerHTML={{ __html: question.explanationHtml }} />
          </div>
        ) : !isExam ? (
          <button className="btn btn-ghost btn-block mt-4" disabled={busy} onClick={() => void grade(false)}>
            显示答案
          </button>
        ) : null}

        <div className="mt-4 text-[10px] text-[var(--muted)] leading-5">本题来源：{question.paperTitle || question.source}</div>
        <div className="h-24" />
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--card)] px-3 py-1.5 flex items-center gap-1.5" style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom))' }}>
        <button className="icon-btn" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} aria-label="上一题">
          <Icon name="chevronLeft" strokeWidth={1.8} />
        </button>
        <button
          className="icon-btn"
          aria-label="收藏"
          style={favorite ? { color: 'var(--warn)' } : undefined}
          onClick={() => {
            toggleFavorite(question.id)
              .then((value) => {
                setFavorite(value);
                onNotice(value ? '已收藏' : '已取消收藏');
              })
              .catch((error) => onNotice(`收藏失败：${errorText(error)}`));
          }}
        >
          <Icon name="star" />
        </button>
        <button className="icon-btn" aria-label="笔记" onClick={() => {
          setNoteOpen(true);
          getNote(question.id).then((value) => setNote(value.content)).catch(() => setNote(''));
        }}>
          <Icon name="note" />
        </button>
        <button className="icon-btn" aria-label="标记" style={flags.has(question.id) ? { color: 'var(--warn)' } : undefined} onClick={() => void toggleFlag()}>
          <Icon name="check" />
        </button>
        <div className="flex-1" />
        {isExam ? (
          <>
            <button className="btn btn-ghost btn-sm flex-1" onClick={() => setSheet(true)}>答题卡</button>
            <button className="btn btn-primary btn-sm flex-1" onClick={() => setConfirmSubmit(true)}>交卷</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost btn-sm" style={{ minWidth: 58 }} disabled={busy} onClick={() => void grade(false)}>判题</button>
            <button
              className="btn btn-primary btn-sm"
              style={{ minWidth: 70 }}
              onClick={() => {
                if (index === questions.length - 1) setConfirmSubmit(true);
                else setIndex((value) => value + 1);
              }}
            >
              下一题
            </button>
          </>
        )}
      </div>

      <div className="sheet-wrap">
        <div className={`sheet ${sheet ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setSheet(false)}>
          <div className="sheet-card">
            <div className="grabber" />
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">答题卡</h3>
              <span className="text-[10px] text-[var(--muted)]">已答 {answeredCount}/{questions.length}</span>
            </div>
            <div className="grid grid-cols-5 gap-2.5 mt-4">
              {questions.map((item, itemIndex) => {
                const answer = answers[item.id];
                const classes = ['ans-cell'];
                if (answer?.submitted) classes.push('done');
                if (itemIndex === index) classes.push('current');
                if (flags.has(item.id)) classes.push('flagged');
                return (
                  <button key={item.id} className={classes.join(' ')} onClick={() => { setIndex(itemIndex); setSheet(false); }}>
                    {itemIndex + 1}
                  </button>
                );
              })}
            </div>
            <button className="btn btn-ghost btn-block mt-4" onClick={() => setSheet(false)}>继续答题</button>
            <button className="btn btn-primary btn-block mt-2" onClick={() => { setSheet(false); setConfirmSubmit(true); }}>交卷</button>
            <div className="h-4" />
          </div>
        </div>
      </div>

      <div className={`sheet ${materialOpen ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setMaterialOpen(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <div className="flex items-start justify-between">
            <h3 className="text-[14px] font-semibold">{question.material?.title ?? '材料'}</h3>
            <button className="icon-btn" onClick={() => setMaterialOpen(false)} aria-label="关闭"><Icon name="x" /></button>
          </div>
          <div className="material-body mt-3" dangerouslySetInnerHTML={{ __html: question.material?.html ?? '' }} />
          <button className="btn btn-primary btn-block mt-4" onClick={() => setMaterialOpen(false)}>回到题目</button>
          <div className="h-4" />
        </div>
      </div>

      <div className={`sheet ${noteOpen ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setNoteOpen(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <h3 className="text-[14px] font-semibold">题目笔记</h3>
          <p className="text-[10px] text-[var(--muted)] mt-1">qid {question.qid} · 自动保存到本地</p>
          <textarea
            className="w-full h-32 mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[12.5px] leading-6 outline-none resize-none"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="记录解题思路、易错点…"
          />
          <div className="flex gap-2 mt-3">
            <button className="btn btn-ghost flex-1" onClick={() => setNoteOpen(false)}>取消</button>
            <button
              className="btn btn-primary flex-1"
              onClick={() => {
                saveNote(question.id, note)
                  .then(() => { setNoteOpen(false); onNotice('笔记已保存'); })
                  .catch((error) => onNotice(`保存失败：${errorText(error)}`));
              }}
            >
              保存笔记
            </button>
          </div>
          <div className="h-4" />
        </div>
      </div>

      <div className={`sheet ${reportOpen ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setReportOpen(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <h3 className="text-[14px] font-semibold">反馈题目问题</h3>
          <div className="flex flex-wrap gap-2 mt-3">
            {['答案错误', '选项缺失', '图片不显示', '解析有误', '其他'].map((reason) => (
              <button key={reason} className="chip" onClick={() => {
                addReport(question.id, reason, reportNote)
                  .then(() => { setReportOpen(false); setReportNote(''); onNotice('已提交反馈'); })
                  .catch((error) => onNotice(`提交失败：${errorText(error)}`));
              }}>
                {reason}
              </button>
            ))}
          </div>
          <textarea
            className="w-full h-24 mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[12.5px] outline-none resize-none"
            value={reportNote}
            onChange={(event) => setReportNote(event.target.value)}
            placeholder="补充说明（可选）"
          />
          <button className="btn btn-ghost btn-block mt-3" onClick={() => setReportOpen(false)}>取消</button>
          <div className="h-4" />
        </div>
      </div>

      <div className={`sheet ${confirmSubmit ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setConfirmSubmit(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <h3 className="text-[15px] font-semibold">确认交卷？</h3>
          <p className="text-[11.5px] text-[var(--ink-2)] mt-2 leading-6">
            已答 {answeredCount}/{questions.length} 题，未答 {questions.length - answeredCount} 题。交卷后不可修改，未答按错处理。
          </p>
          <div className="flex gap-2 mt-5">
            <button className="btn btn-ghost flex-1" onClick={() => setConfirmSubmit(false)}>继续答题</button>
            <button className="btn btn-primary flex-1" disabled={busy} onClick={() => void finish()}>确认交卷</button>
          </div>
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}