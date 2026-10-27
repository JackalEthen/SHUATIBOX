import { useEffect, useMemo, useRef, useState } from 'react';
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
  type QuestionDto,
  type SessionSpec,
  type SessionView,
} from './api';
import { Icon } from './icons';
import { Modal } from './Modal';

interface Props {
  view: SessionView;
  assetDir: string;
  settings: Record<string, string>;
  onExit: () => void;
  onNotice: (message: string) => void;
  onFinished: () => void;
  onGoWrong: () => void;
  onRetry: (spec: SessionSpec) => void;
}

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  const hour = Math.floor(safe / 3600);
  const minute = Math.floor((safe % 3600) / 60);
  const second = safe % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function elapsedSeconds(createdAt: string) {
  const value = new Date(createdAt.replace(' ', 'T')).getTime();
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.floor((Date.now() - value) / 1000));
}

function ResultView({
  view,
  result,
  answers,
  onExit,
  onGoWrong,
  onRetry,
}: {
  view: SessionView;
  result: FinishResult;
  answers: Record<string, AnswerDto>;
  onExit: () => void;
  onGoWrong: () => void;
  onRetry: (spec: SessionSpec) => void;
}) {
  const groups = new Map<string, { total: number; correct: number }>();
  for (const question of view.questions) {
    const group = groups.get(question.module) ?? { total: 0, correct: 0 };
    group.total += 1;
    if (answers[question.id]?.correct) group.correct += 1;
    groups.set(question.module, group);
  }
  const weak = [...groups.entries()]
    .map(([module, item]) => ({ module, ...item, rate: item.total ? Math.round((item.correct / item.total) * 100) : 0 }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 4);
  const minutes = Math.floor(elapsedSeconds(view.session.createdAt) / 60);
  return (
    <section className="screen active immersive">
      <div className="h-full overflow-y-auto scroll">
        <div className="max-w-[760px] mx-auto px-8 py-10">
          <div className="text-[11px] tracking-[.18em] text-[var(--muted)]">交卷完成</div>
          <h1 className="text-[24px] font-semibold mt-2">{view.session.title}</h1>
          <p className="text-[12px] text-[var(--muted)] mt-1">
            用时 {minutes} 分 · 未答 {result.unanswered} 题 · 正确率 {result.accuracy}%
          </p>

          <div className="card mt-6 p-6 grid grid-cols-[auto_1fr] gap-8 items-center">
            <div className="text-center">
              <div className="stat-num" style={{ fontSize: 48 }}>{result.score}</div>
              <div className="text-[11px] text-[var(--muted)] mt-1">满分 100</div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[10.5px] text-[var(--muted)]">正确率</div>
                <div className="text-[20px] font-semibold mt-1">{result.accuracy}%</div>
              </div>
              <div>
                <div className="text-[10.5px] text-[var(--muted)]">答对</div>
                <div className="text-[20px] font-semibold mt-1">{result.correct} / {view.session.total}</div>
              </div>
              <div>
                <div className="text-[10.5px] text-[var(--muted)]">已答</div>
                <div className="text-[20px] font-semibold mt-1">{result.answered}</div>
              </div>
            </div>
          </div>

          <div className="card mt-4 p-5">
            <h2 className="text-[13.5px] font-semibold">模块表现</h2>
            <div className="mt-4 space-y-3">
              {weak.map((item) => (
                <div key={item.module}>
                  <div className="flex justify-between text-[11.5px] mb-1.5">
                    <span>{item.module}</span>
                    <span className="text-[var(--muted)]">{item.correct} / {item.total} · {item.rate}%</span>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${item.rate}%`, background: item.rate < 60 ? 'var(--bad)' : 'var(--accent)' }} />
                  </div>
                </div>
              ))}
            </div>
            {weak.length > 0 ? (
              <div className="mt-4 text-[11.5px] text-[var(--ink-2)] leading-6">
                {weak[0].rate < 60
                  ? `${weak[0].module}正确率偏低，建议先回看错题与解析。`
                  : '整体表现稳定，继续按模块推进即可。'}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button className="btn btn-ghost" onClick={onExit}>返回题库</button>
            <button className="btn btn-soft" onClick={onGoWrong}>查看错题</button>
            <button className="btn btn-primary" onClick={() => onRetry(view.session.spec)}>再练一次</button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DesktopPractice({
  view,
  assetDir,
  settings,
  onExit,
  onNotice,
  onFinished,
  onGoWrong,
  onRetry,
}: Props) {
  const questions = useMemo(
    () => view.questions.map((question: QuestionDto) => toQuestion(question, assetDir)),
    [view, assetDir],
  );
  const isExam = view.session.mode === 'exam';
  const initialMode = isExam ? 'deferred' : settings.practice_mode === 'deferred' ? 'deferred' : 'instant';
  const [mode, setMode] = useState<'instant' | 'deferred'>(initialMode);
  const [index, setIndex] = useState(() => {
    const first = view.questions.findIndex((question) => !view.answers.find((answer) => answer.questionId === question.id)?.submitted);
    return first < 0 ? 0 : first;
  });
  const [answers, setAnswers] = useState<Record<string, AnswerDto>>(() =>
    Object.fromEntries(view.answers.map((answer) => [answer.questionId, answer])),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [flags, setFlags] = useState<Set<string>>(() => new Set(view.flags));
  const [favorite, setFavorite] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(() => {
    if (view.session.status !== 'done') return null;
    const answered = view.session.answered;
    const correct = view.session.correct;
    return {
      session: view.session,
      answered,
      correct,
      unanswered: Math.max(0, view.session.total - answered),
      score: view.session.score ?? 0,
      accuracy: answered ? Math.round((correct * 1000) / answered) / 10 : 0,
    };
  });
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('答案错误');
  const [reportNote, setReportNote] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    view.session.durationSec > 0
      ? Math.max(0, view.session.durationSec - elapsedSeconds(view.session.createdAt))
      : 0,
  );
  const finishing = useRef(false);
  const questionStart = useRef(Date.now());
  const question = questions[index];

  useEffect(() => {
    const answer = question ? answers[question.id] : undefined;
    setSelected(answer?.selected ?? []);
    setSubmitted(answer?.submitted ?? false);
    questionStart.current = Date.now();
    if (!question) return;
    isFavorite(question.id).then(setFavorite).catch(() => setFavorite(false));
  }, [index, question?.id]);

  useEffect(() => {
    setIndex(() => {
      const first = view.questions.findIndex(
        (question) => !view.answers.find((answer) => answer.questionId === question.id)?.submitted,
      );
      return first < 0 ? 0 : first;
    });
    setAnswers(Object.fromEntries(view.answers.map((answer) => [answer.questionId, answer])));
    setFlags(new Set(view.flags));
    setResult(
      view.session.status === 'done'
        ? {
            session: view.session,
            answered: view.session.answered,
            correct: view.session.correct,
            unanswered: Math.max(0, view.session.total - view.session.answered),
            score: view.session.score ?? 0,
            accuracy: view.session.answered
              ? Math.round((view.session.correct * 1000) / view.session.answered) / 10
              : 0,
          }
        : null,
    );
  }, [view.session.id]);

  useEffect(() => {
    if (!question) return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = event.key.toUpperCase();
      if (event.key === 'ArrowLeft') {
        setIndex((value) => Math.max(0, value - 1));
      } else if (event.key === 'ArrowRight') {
        setIndex((value) => Math.min(questions.length - 1, value + 1));
      } else if (/^[A-H]$/.test(key)) {
        const option = question.options.find((item) => item.label === key);
        if (option) choose(key);
      } else if (key === 'F') {
        toggleFlag();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, selected, submitted, index]);

  useEffect(() => {
    if (result || view.session.durationSec <= 0 || view.session.status !== 'active') return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, view.session.durationSec - elapsedSeconds(view.session.createdAt));
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(timer);
        void finish(true);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [result, view.session.id]);

  if (!question && !result) {
    return (
      <section className="screen active immersive">
        <div className="p-8 text-center text-[12px] text-[var(--muted)]">
          本组题目为空。
          <button className="btn btn-ghost ml-3" onClick={onExit}>返回</button>
        </div>
      </section>
    );
  }

  if (result) {
    return (
      <ResultView
        view={view}
        result={result}
        answers={answers}
        onExit={onExit}
        onGoWrong={onGoWrong}
        onRetry={onRetry}
      />
    );
  }

  const canGrade = question.answer.length > 0;
  const answer = answers[question.id];
  const isSubmitted = submitted || !!answer?.submitted;

  const optionClass = (label: string) => {
    if (!isSubmitted) return selected.includes(label) ? 'opt is-selected' : 'opt';
    if (question.answer.includes(label)) return 'opt is-correct';
    if (selected.includes(label)) return 'opt is-wrong';
    return 'opt answered';
  };

  const updateAnswer = (value: AnswerDto) => {
    setAnswers((current) => ({ ...current, [value.questionId]: value }));
  };

  const persistDraft = (labels: string[]) => {
    saveAnswer({
      sessionId: view.session.id,
      questionId: question.id,
      selected: labels,
      submitted: false,
      elapsedMs: Date.now() - questionStart.current,
    }).catch((error) => onNotice(`保存失败：${errorText(error)}`));
  };

  const grade = async (labels: string[]) => {
    if (labels.length === 0 || busy) return;
    setBusy(true);
    try {
      const value: AnswerResult = await saveAnswer({
        sessionId: view.session.id,
        questionId: question.id,
        selected: labels,
        submitted: true,
        elapsedMs: Date.now() - questionStart.current,
      });
      updateAnswer({
        questionId: question.id,
        selected: labels,
        submitted: true,
        correct: value.correct,
        flagged: flags.has(question.id),
      });
      setSubmitted(true);
    } catch (error) {
      onNotice(`判分失败：${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };

  function choose(label: string) {
    if (isSubmitted || busy) return;
    if (question.multi) {
      const next = selected.includes(label)
        ? selected.filter((item) => item !== label)
        : [...selected, label];
      setSelected(next);
      persistDraft(next);
      return;
    }
    setSelected([label]);
    if (mode === 'instant' && !isExam) {
      void grade([label]);
    } else {
      persistDraft([label]);
    }
  }

  function toggleFlag() {
    const next = new Set(flags);
    if (next.has(question.id)) next.delete(question.id);
    else next.add(question.id);
    setFlags(next);
    saveAnswer({
      sessionId: view.session.id,
      questionId: question.id,
      selected,
      submitted: isSubmitted,
      flagged: next.has(question.id),
    }).catch((error) => onNotice(`标记失败：${errorText(error)}`));
  }

  async function reveal() {
    if (selected.length > 0) {
      await grade(selected);
    } else {
      setSubmitted(true);
    }
  }

  async function finish(auto = false) {
    if (finishing.current) return;
    if (!auto && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    finishing.current = true;
    setBusy(true);
    try {
      const value = await finishSession(view.session.id);
      setResult(value);
      setConfirmSubmit(false);
      onFinished();
    } catch (error) {
      onNotice(`交卷失败：${errorText(error)}`);
    } finally {
      finishing.current = false;
      setBusy(false);
    }
  }

  const openNote = async () => {
    setNoteOpen(true);
    try {
      const value = await getNote(question.id);
      setNote(value.content);
    } catch (error) {
      onNotice(`笔记读取失败：${errorText(error)}`);
    }
  };

  const submitReport = async () => {
    try {
      await addReport(question.id, reportReason, reportNote);
      setReportOpen(false);
      setReportNote('');
      onNotice('已记录，感谢反馈');
    } catch (error) {
      onNotice(`提交失败：${errorText(error)}`);
    }
  };

  const answeredCount = view.questions.filter((item) => answers[item.id]?.submitted).length;

  return (
    <section id="screen-practice" className="screen immersive active">
      <div className="h-full flex flex-col min-h-0">
        <div className="h-14 shrink-0 border-b border-[var(--line)] flex items-center gap-3 px-5">
          <button className="icon-btn" onClick={onExit} aria-label="返回">
            <Icon name="chevronLeft" strokeWidth={1.8} />
          </button>
          <span className="chip-accent">{question.module}</span>
          <span className="text-[11px] text-[var(--muted)]">
            第 <b className="text-[var(--ink-2)]">{index + 1}</b> / <span>{questions.length}</span> 题
          </span>
          <div className="w-28">
            <div className="progress">
              <i style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
            </div>
          </div>
          {isExam ? (
            <span className="chip ml-3" style={{ color: remaining < 300 ? 'var(--bad)' : undefined }}>
              <Icon name="clock" className="w-3 h-3" />
              {formatClock(remaining)}
            </span>
          ) : (
            <div className="ml-auto flex items-center gap-3">
              <div className="seg">
                <button className={mode === 'instant' ? 'active' : ''} onClick={() => setMode('instant')}>
                  逐题显示
                </button>
                <button className={mode === 'deferred' ? 'active' : ''} onClick={() => setMode('deferred')}>
                  交卷后显示
                </button>
              </div>
              <span className="text-[10px] text-[var(--muted)]">
                {mode === 'instant' ? '点击选项立即判分' : '交卷后统一显示'}
              </span>
            </div>
          )}
          <div className={isExam ? 'ml-auto flex items-center gap-2' : 'flex items-center gap-2'}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSheet(true)}>
              答题卡
            </button>
            {isExam ? (
              <button className="btn btn-primary btn-sm" onClick={() => void finish(false)}>
                交卷
              </button>
            ) : null}
          </div>
        </div>

        <div className={`practice-grid flex-1 min-h-0 ${question.material ? '' : 'no-material'}`}>
          <div id="p-material-pane" className="min-h-0 flex flex-col border-r border-[var(--line)] bg-[var(--paper-2)]">
            <div className="px-6 py-3 border-b border-[var(--line)] flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-medium text-[var(--ink-2)]">{question.material?.title ?? '材料'}</span>
              <span className="text-[10px] text-[var(--muted)]">题面材料 · 可滚动</span>
              <button className="icon-btn ml-auto" onClick={() => setMaterialOpen(true)} aria-label="放大材料">
                <Icon name="expand" />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto scroll px-7 py-5 material-body"
              dangerouslySetInnerHTML={{ __html: question.material?.html ?? '' }}
            />
          </div>

          <div className="min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto scroll px-8 py-6">
              <div className="max-w-[760px] mx-auto">
                <div className="flex items-center gap-2 text-[10.5px] text-[var(--muted)]">
                  <span>qid {question.qid}</span>
                  <span>·</span>
                  <span>{question.type}</span>
                  <span>·</span>
                  <span>{question.source}</span>
                  <span className="ml-auto">
                    {question.review ? (
                      <span className="chip" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
                        {question.review.missing ? '答案缺失' : '解析冲突'}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="qtext mt-4" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />

                {question.imageMissing ? (
                  <div className="mt-3 text-[11px] text-[var(--warn)] leading-5">
                    本题原始图片缺失，题干或选项中的图无法显示；不影响作答。
                  </div>
                ) : null}

                {question.review ? (
                  <div className="mt-4 text-[11px] text-[var(--warn)] leading-5">
                    {question.review.missing
                      ? '源文件没有提供答案，本题不参与判分；可先浏览题目与解析。'
                      : `答案行为 ${question.answer.join('')}，解析最终答案为 ${question.review.explanationAnswer}；已按答案行计分并标记待校对。`}
                  </div>
                ) : null}

                <div className="mt-6 space-y-2.5">
                  {question.options.map((option) => (
                    <button key={option.label} className={optionClass(option.label)} onClick={() => choose(option.label)}>
                      <span className="opt-key">{option.label}</span>
                      <span dangerouslySetInnerHTML={{ __html: option.text }} />
                    </button>
                  ))}
                </div>

                {question.multi && !isSubmitted ? (
                  <button className="btn btn-soft mt-3" onClick={() => void grade(selected)} disabled={selected.length === 0 || busy}>
                    提交答案
                  </button>
                ) : null}

                {isSubmitted ? (
                  <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {canGrade ? (
                        <span
                          className={answer?.correct ? 'chip-accent' : 'chip'}
                          style={answer?.correct ? undefined : { color: 'var(--bad)', borderColor: 'var(--bad)' }}
                        >
                          {answer?.correct ? '回答正确' : '回答错误'}
                        </span>
                      ) : (
                        <span className="chip" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
                          答案缺失
                        </span>
                      )}
                      {canGrade ? (
                        <span className="text-[11.5px] text-[var(--muted)]">
                          正确答案 <b className="text-[var(--ink-2)]">{question.answer.join('')}</b>
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-[var(--muted)]">本题不判分</span>
                      )}
                      <span className="ml-auto text-[10.5px] text-[var(--muted)]">官方解析</span>
                    </div>
                    <div className="mt-3 text-[12px] font-semibold text-[var(--ink-2)]">解析</div>
                    <div
                      className="text-[13.5px] leading-7 text-[var(--ink-2)] mt-1.5"
                      dangerouslySetInnerHTML={{ __html: question.explanationHtml }}
                    />
                    {question.review && !question.review.missing ? (
                      <div className="mt-2 text-[11px] text-[var(--warn)]">
                        解析最终答案：{question.review.explanationAnswer}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-6 flex items-center gap-3 text-[11px] text-[var(--muted)]">
                  <span>本题来源：{question.paperTitle ?? question.source}</span>
                  <span className="ml-auto">A–H 选择 · ← → 翻题 · F 收藏</span>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-[var(--line)] bg-[var(--card)] px-6 py-3 flex flex-wrap items-center gap-2">
              <button className="btn btn-ghost" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
                <Icon name="chevronLeft" strokeWidth={1.8} />
                上一题
              </button>
              <div className="flex items-center gap-1 ml-2">
                <button
                  className="icon-btn"
                  onClick={() => {
                    toggleFavorite(question.id)
                      .then((value) => {
                        setFavorite(value);
                        onNotice(value ? '已收藏' : '已取消收藏');
                      })
                      .catch((error) => onNotice(`收藏失败：${errorText(error)}`));
                  }}
                  aria-label="收藏"
                  style={favorite ? { color: 'var(--warn)' } : undefined}
                >
                  <Icon name="star" />
                </button>
                <button className="icon-btn" onClick={() => void openNote()} aria-label="笔记">
                  <Icon name="note" />
                </button>
                <button className="icon-btn" onClick={() => setReportOpen(true)} aria-label="报错">
                  <Icon name="alert" />
                </button>
                <button
                  className="icon-btn"
                  onClick={toggleFlag}
                  aria-label="标记"
                  style={flags.has(question.id) ? { color: 'var(--warn)' } : undefined}
                >
                  <Icon name="check" />
                </button>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {!isExam ? (
                  <button className="btn btn-ghost" onClick={() => void reveal()} disabled={isSubmitted}>
                    显示答案
                  </button>
                ) : null}
                {!isExam ? (
                  <button className="btn btn-ghost" onClick={() => void finish(false)}>
                    交卷本组
                  </button>
                ) : null}
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (index === questions.length - 1) {
                      if (isExam) void finish(false);
                      else onNotice('已经是最后一题');
                    } else {
                      setIndex((value) => value + 1);
                    }
                  }}
                >
                  下一题
                  <Icon name="chevronRight" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal open={sheet} title={`答题卡 · 已答 ${answeredCount} / ${questions.length}`} onClose={() => setSheet(false)}>
        <div className="grid grid-cols-10 gap-2">
          {questions.map((item, itemIndex) => {
            const itemAnswer = answers[item.id];
            const classes = ['ans-cell'];
            if (itemAnswer?.submitted) classes.push('done');
            if (itemIndex === index) classes.push('current');
            if (flags.has(item.id)) classes.push('flagged');
            return (
              <button
                key={item.id}
                className={classes.join(' ')}
                onClick={() => {
                  setIndex(itemIndex);
                  setSheet(false);
                }}
              >
                {itemIndex + 1}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-[11px] text-[var(--muted)]">
          <span>未答</span>
          <span className="ans-cell done" style={{ width: 24, height: 24 }} />
          <span>已答</span>
          <span className="ans-cell current" style={{ width: 24, height: 24 }} />
          <span>当前题</span>
          <span className="ans-cell flagged" style={{ width: 24, height: 24 }} />
          <span>已标记</span>
        </div>
      </Modal>

      <Modal open={materialOpen} title={question.material?.title ?? '材料'} onClose={() => setMaterialOpen(false)} wide>
        <div className="material-body" dangerouslySetInnerHTML={{ __html: question.material?.html ?? '' }} />
      </Modal>

      <Modal
        open={noteOpen}
        title="题目笔记"
        onClose={() => setNoteOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setNoteOpen(false)}>取消</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                saveNote(question.id, note)
                  .then(() => {
                    setNoteOpen(false);
                    onNotice('笔记已保存');
                  })
                  .catch((error) => onNotice(`保存失败：${errorText(error)}`));
              }}
            >
              保存笔记
            </button>
          </>
        }
      >
        <div className="text-[11px] text-[var(--muted)] mb-2">qid {question.qid} · 自动保存到本地</div>
        <textarea
          className="w-full h-40 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3 text-[13px] outline-none"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="记录解题思路、易错点…"
        />
      </Modal>

      <Modal
        open={reportOpen}
        title="反馈题目问题"
        onClose={() => setReportOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setReportOpen(false)}>取消</button>
            <button className="btn btn-primary" onClick={() => void submitReport()}>提交</button>
          </>
        }
      >
        <div className="text-[11px] text-[var(--muted)] mb-3">会记录到本地，后续可导出反馈。</div>
        <div className="flex flex-wrap gap-2">
          {['答案错误', '选项缺失', '图片不显示', '解析有误', '其他'].map((reason) => (
            <button
              key={reason}
              className={`chip ${reportReason === reason ? 'active' : ''}`}
              onClick={() => setReportReason(reason)}
            >
              {reason}
            </button>
          ))}
        </div>
        <textarea
          className="w-full h-24 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3 text-[13px] outline-none mt-3"
          value={reportNote}
          onChange={(event) => setReportNote(event.target.value)}
          placeholder="补充说明（可选）"
        />
      </Modal>

      <Modal
        open={confirmSubmit}
        title="确认交卷？"
        onClose={() => setConfirmSubmit(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmSubmit(false)}>继续答题</button>
            <button className="btn btn-primary" onClick={() => void finish(true)} disabled={busy}>确认交卷</button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--ink-2)] leading-7">
          共 {questions.length} 题，未答 {questions.length - answeredCount} 题。交卷后不可修改答案，未答按错处理。
        </p>
      </Modal>
    </section>
  );
}
