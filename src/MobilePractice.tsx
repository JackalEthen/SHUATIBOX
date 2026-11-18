import { t } from './i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  errorText,
  finishSession,
  getNote,
  getSettings,
  isFavorite,
  saveAnswer,
  saveNote,
  toggleFavorite,
  toQuestion,
  updateQuestion,
  type AnswerDto,
  type AnswerResult,
  type FinishResult,
  type QuestionDto,
  type SessionView,
} from './api';
import { AiTutor } from './AiTutor';
import { AnswerCard } from './AnswerCard';
import { AiMark, Icon } from './icons';
import type { PracticeQuestion } from './questions';

interface Props {
  view: SessionView;
  assetDir: string;
  settings: Record<string, string>;
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

export function MobilePractice({ view, assetDir, settings, onExit, onNotice, onFinished }: Props) {
  const isExam = view.session.mode === 'exam';
  const mode =
    isExam || (view.session.spec.judgeMode ?? settings.practice_mode) === 'deferred' ? 'deferred' : 'instant';
  const [edits, setEdits] = useState<Record<string, QuestionDto>>({});
  const questions = useMemo<PracticeQuestion[]>(
    () => view.questions.map((question) => toQuestion(edits[question.id] ?? question, assetDir)),
    [view, assetDir, edits],
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
  const [cardOpen, setCardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editStem, setEditStem] = useState('');
  const [editOptions, setEditOptions] = useState<{ label: string; text: string }[]>([]);
  const [editAnswer, setEditAnswer] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiReady, setAiReady] = useState(() =>
    Boolean(settings.ai_url && settings.ai_key_set === '1' && settings.ai_model),
  );
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

  const rawQuestion = view.questions[index] ? edits[view.questions[index].id] ?? view.questions[index] : undefined;

  const openEdit = () => {
    if (!rawQuestion) return;
    setEditStem(rawQuestion.stem);
    setEditOptions(rawQuestion.options.map((option) => ({ label: option.label, text: option.text })));
    setEditAnswer(rawQuestion.answer.join(','));
    setEditExplanation(rawQuestion.explanation);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!rawQuestion) return;
    setEditBusy(true);
    try {
      const updated = await updateQuestion(
        rawQuestion.id,
        editStem,
        editOptions,
        editAnswer,
        editExplanation,
      );
      setEdits((prev) => ({ ...prev, [updated.id]: updated }));
      setEditOpen(false);
      onNotice(t("已保存修改"));
    } catch (error) {
      onNotice(t("保存失败：{p0}", { p0: errorText(error) }));
    } finally {
      setEditBusy(false);
    }
  };

  useEffect(() => {
    startedAt.current = Date.now();
    setAiOpen(false);
    setMenuOpen(false);
    if (!question) return;
    setFavorite(false);
    isFavorite(question.id).then(setFavorite).catch(() => setFavorite(false));
  }, [question?.id]);

  useEffect(() => {
    getSettings()
      .then((values) => setAiReady(Boolean(values.ai_url && values.ai_key_set === '1' && values.ai_model)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const win = window as unknown as { __shuatiboxBack?: () => string };
    const previous = win.__shuatiboxBack;
    const handler = () => {
      if (menuOpen) {
        setMenuOpen(false);
        return 'handled';
      }
      if (aiOpen) {
        setAiOpen(false);
        return 'handled';
      }
      return previous ? previous() : 'handled';
    };
    win.__shuatiboxBack = handler;
    return () => {
      if (win.__shuatiboxBack === handler) win.__shuatiboxBack = previous;
    };
  }, [aiOpen, menuOpen]);

  const grade = useCallback(
    async (final: boolean, labels?: string[]) => {
      if (!question || busy) return;
      const selected = labels ?? answers[question.id]?.selected ?? [];
      if (selected.length === 0) return;
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
        onNotice(t("判分失败：{p0}", { p0: errorText(error) }));
      } finally {
        setBusy(false);
      }
    },
    [question, busy, answers, view.session.id, onNotice],
  );

  const submit = useCallback(
    async (label: string) => {
      if (!question || busy) return;
      const selected = current?.selected ?? [];
      const next = selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label];
      if (mode === 'instant' && !isExam && !question.multi) {
        await grade(false, next);
        return;
      }
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
        onNotice(t("选择失败：{p0}", { p0: errorText(error) }));
      } finally {
        setBusy(false);
      }
    },
    [question, busy, current, mode, isExam, view.session.id, onNotice, grade],
  );

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      const value = await finishSession(view.session.id);
      setResult(value);
      onFinished();
    } catch (error) {
      onNotice(t("交卷失败：{p0}", { p0: errorText(error) }));
    } finally {
      setBusy(false);
      setConfirmSubmit(false);
    }
  }, [view.session.id, onNotice, onFinished]);

  useEffect(() => {
    if (!isExam || result || view.session.durationSec <= 0) return;
    const timer = window.setInterval(() => {
      const left = Math.max(
        0,
        view.session.durationSec - elapsedSeconds(view.session.createdAt),
      );
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(timer);
        void finish();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isExam, result, finish, view.session.durationSec, view.session.createdAt]);

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
      onNotice(t("标记失败：{p0}", { p0: errorText(error) }));
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
          <button className="icon-btn" onClick={onExit} aria-label={t("返回")}><Icon name="chevronLeft" strokeWidth={1.8} /></button>
          <h1 className="flex-1">{t("交卷完成")}</h1>
        </div>
        <div className="px-4 py-5 text-center">
          <div className="chip-accent inline-flex">{isExam ? t("模考完成") : t("练习完成")}</div>
          <h2 className="text-[18px] font-semibold mt-2">{view.session.title}</h2>
          <p className="text-[11.5px] text-[var(--muted)] mt-1">

            {t("未答")} {result.unanswered}  {t("题 · 正确率")} {result.accuracy}%
          </p>
          <div className="card mt-4 p-5 text-center">
            <div className="text-[11.5px] text-[var(--muted)]">{t("得分")}</div>
            <div className="text-[54px] font-semibold leading-none mt-1">{result.score}</div>
            <div className="text-[11px] text-[var(--muted)] mt-1">{t("满分 100")}</div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[var(--line)]">
              <div><div className="text-[10.5px] text-[var(--muted)]">{t("正确率")}</div><div className="text-[15px] font-semibold mt-0.5">{result.accuracy}%</div></div>
              <div><div className="text-[10.5px] text-[var(--muted)]">{t("答对")}</div><div className="text-[15px] font-semibold mt-0.5">{result.correct}/{view.questions.length}</div></div>
              <div><div className="text-[10.5px] text-[var(--muted)]">{t("已答")}</div><div className="text-[15px] font-semibold mt-0.5">{result.answered}</div></div>
            </div>
          </div>
          <div className="card mt-3 p-4 text-left">
            <h3 className="text-[15px] font-semibold">{t("模块表现")}</h3>
            <div className="mt-3 space-y-2.5">
              {[...groups.entries()].map(([module, item]) => {
                const rate = item.total ? Math.round((item.correct / item.total) * 100) : 0;
                return (
                  <div key={module}>
                    <div className="flex justify-between text-[11.5px] mb-1"><span>{module}</span><span>{item.correct}/{item.total} · {rate}%</span></div>
                    <div className="progress" style={{ height: 5 }}><i style={{ width: `${rate}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
          {weakest ? (
            <div className="card mt-3 p-4 text-left">
              <h3 className="text-[15px] font-semibold">{t("建议")}</h3>
              <div className="mt-2 text-[13.5px] text-[var(--ink-2)] leading-6">
                {weakest}  {t("正确率偏低，建议回看错题与解析。")}
              </div>
            </div>
          ) : null}
          <div className="flex gap-2 mt-4">
            <button className="btn btn-ghost flex-1" onClick={onExit}>{t("返回题库")}</button>
          </div>
          <div className="h-6" />
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="shell">
        <div className="grid place-items-center h-[70vh] text-[13px] text-[var(--muted)]">{t("没有可练题目")}</div>
      </div>
    );
  }

  const verdict = verdicts[question.id];
  const showAnswer = current?.submitted || (verdict && verdict.canGrade === false);

  return (
    <div className="shell shell-flush">
      <div className="h-12 shrink-0 border-b border-[var(--line)] flex items-center gap-2 px-3" style={{ background: 'var(--paper)' }}>
        <button className="icon-btn" onClick={onExit} aria-label={t("返回")}><Icon name="chevronLeft" strokeWidth={1.8} /></button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="chip-accent">{question.module}</span>
            <span className="text-[11px] text-[var(--muted)]">{t("第")} <b className="text-[var(--ink-2)]">{index + 1}</b>/{questions.length}</span>
          </div>
          <div className="w-24"><div className="progress mt-1" style={{ height: 4 }}><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div></div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {isExam ? (
            <span className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] font-mono text-[13px] font-semibold tabular-nums">
              {formatClock(remaining)}
            </span>
          ) : null}
          <div className="relative">
            <button
              className="icon-btn"
              aria-label={t("更多")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <Icon name="list" />
            </button>
            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-28 rounded-xl border border-[var(--line)] bg-[var(--card)] py-1 shadow-[var(--shadow-lg)]">
                  <button
                    className="block w-full px-3 py-2 text-left text-[13px]"
                    onClick={() => {
                      setMenuOpen(false);
                      setNoteOpen(true);
                      getNote(question.id).then((value) => setNote(value.content)).catch(() => setNote(''));
                    }}
                  >
                    {t("笔记")}
                  </button>
                  <button
                    className="block w-full px-3 py-2 text-left text-[13px]"
                    onClick={() => {
                      setMenuOpen(false);
                      openEdit();
                    }}
                  >
                    {t("编辑")}
                  </button>
                  <button
                    className="block w-full px-3 py-2 text-left text-[13px]"
                    style={flags.has(question.id) ? { color: 'var(--warn)' } : undefined}
                    onClick={() => {
                      setMenuOpen(false);
                      void toggleFlag();
                    }}
                  >
                    {t("标注")}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll px-4 py-4">
        <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <span>qid {question.qid}</span>
          <span>·</span>
          <span>{question.type}</span>
          <span>·</span>
          <span>{question.source}</span>
        </div>

        {question.material ? (
          <button className="w-full card p-3 flex items-center gap-2 text-left mt-3" onClick={() => setMaterialOpen(true)}>
            <Icon name="book" className="w-4 h-4 text-[var(--accent-ink)]" strokeWidth={1.7} />
            <span className="text-[13.5px]">{t("查看材料：")}{question.material.title}</span>
            <span className="ml-auto text-[11px] text-[var(--muted)]">{t("点击展开")}</span>
          </button>
        ) : null}

        <div className="qtext mt-4" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />

        {question.imageMissing ? (
          <div className="mt-3 text-[12px] text-[var(--warn)] leading-5">
            {t("本题原始图片缺失，题干或选项中的图无法显示；不影响作答。")}
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
                {verdict?.canGrade === false ? t("答案缺失") : (verdict?.correct ?? current?.correct) ? t("回答正确") : t("回答错误")}
              </span>
              <span className="text-[11.5px] text-[var(--muted)]">{t("正确答案")} <b className="text-[var(--ink-2)]">{question.answer.join('')}</b></span>
            </div>
            {question.review && !question.review.missing ? (
              <div className="mt-2 text-[12px] text-[var(--warn)]">{t("解析最终答案：")}{question.review.explanationAnswer}</div>
            ) : null}
            <div className="text-[13px] font-semibold text-[var(--ink-2)] mt-3">{t("解析")}</div>
            <div className="read-explain text-[var(--ink-2)] mt-1" dangerouslySetInnerHTML={{ __html: question.explanationHtml }} />
          </div>
        ) : mode === 'instant' && !isExam && question.multi && !showAnswer ? (
          <button
            className="btn btn-ghost btn-block mt-4"
            disabled={busy || !current?.selected?.length}
            onClick={() => void grade(false, current?.selected)}
          >
            {t("提交本题")}
          </button>
        ) : null}

        <div className="mt-4 text-[11px] text-[var(--muted)] leading-5">{t("本题来源：")}{question.paperTitle || question.source}</div>
        <div className="h-24" />
      </div>

      <div
        className="shrink-0 border-t border-[var(--line)] bg-[var(--card)] flex items-center"
        style={{
          paddingLeft: 'clamp(6px, 2.4vw, 14px)',
          paddingRight: 'clamp(6px, 2.4vw, 14px)',
          paddingTop: 'clamp(4px, 1.2vw, 8px)',
          paddingBottom: 'calc(clamp(4px, 1.2vw, 8px) + var(--safe-bottom, env(safe-area-inset-bottom)))',
          columnGap: 'clamp(2px, 1.4vw, 10px)',
        }}
      >
        <button
          className="btn btn-ghost btn-sm shrink-0 whitespace-nowrap"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
        >
          {t("上一题")}
        </button>
        <div
          className="flex-1 min-w-0 flex items-center justify-center"
          style={{ columnGap: 'clamp(4px, 2vw, 16px)' }}
        >
          <button
            className="icon-btn"
            aria-label={t("收藏")}
            style={favorite ? { color: 'var(--warn)' } : undefined}
            onClick={() => {
              toggleFavorite(question.id)
                .then((value) => {
                  setFavorite(value);
                  onNotice(value ? t("已收藏") : t("已取消收藏"));
                })
                .catch((error) => onNotice(t("收藏失败：{p0}", { p0: errorText(error) })));
            }}
          >
            <Icon name="star" />
          </button>
          <button
            className="icon-btn"
            aria-label={t("AI 讲解")}
            aria-disabled={!aiReady}
            style={aiReady ? undefined : { opacity: 0.35 }}
            onClick={() => {
              if (aiReady) setAiOpen(true);
              else onNotice(t("请先在设置中配置 AI 接口"));
            }}
          >
            <AiMark />
          </button>
          <button className="icon-btn" aria-label={t("答题卡")} onClick={() => setCardOpen(true)}>
            <Icon name="grid" />
          </button>
        </div>
        {isExam ? (
          <button className="btn btn-primary btn-sm shrink-0 whitespace-nowrap" onClick={() => setConfirmSubmit(true)}>
            {t("交卷")}
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm shrink-0 whitespace-nowrap"
            style={{ paddingLeft: 'clamp(10px, 3vw, 18px)', paddingRight: 'clamp(10px, 3vw, 18px)' }}
            onClick={() => {
              if (index === questions.length - 1) setConfirmSubmit(true);
              else setIndex((value) => value + 1);
            }}
          >
            {t("下一题")}
          </button>
        )}
      </div>

      <div className={`sheet ${cardOpen ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setCardOpen(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">{t("答题卡")}</h3>
            <button className="icon-btn" onClick={() => setCardOpen(false)} aria-label={t("关闭")}><Icon name="x" /></button>
          </div>
          <div className="mt-4 max-h-[60vh] overflow-y-auto scroll p-2">
            <AnswerCard
              questions={questions}
              answers={answers}
              flags={flags}
              isExam={isExam}
              mode={mode}
              current={index}
              onPick={(itemIndex) => {
                setIndex(itemIndex);
                setCardOpen(false);
              }}
            />
          </div>
          <button className="btn btn-ghost btn-block mt-4" onClick={() => setCardOpen(false)}>{t("继续答题")}</button>
          <div className="h-4" />
        </div>
      </div>

      <div className={`sheet ${materialOpen ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setMaterialOpen(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <div className="flex items-start justify-between">
            <h3 className="text-[15px] font-semibold">{question.material?.title ?? t("材料")}</h3>
            <button className="icon-btn" onClick={() => setMaterialOpen(false)} aria-label={t("关闭")}><Icon name="x" /></button>
          </div>
          <div className="material-body mt-3" dangerouslySetInnerHTML={{ __html: question.material?.html ?? '' }} />
          <button className="btn btn-primary btn-block mt-4" onClick={() => setMaterialOpen(false)}>{t("回到题目")}</button>
          <div className="h-4" />
        </div>
      </div>

      <div className={`sheet ${noteOpen ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setNoteOpen(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <h3 className="text-[15px] font-semibold">{t("题目笔记")}</h3>
          <p className="text-[11px] text-[var(--muted)] mt-1">qid {question.qid}  {t("· 自动保存到本地")}</p>
          <textarea
            className="w-full h-32 mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13.5px] leading-6 outline-none resize-none"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("记录解题思路、易错点…")}
          />
          <div className="flex gap-2 mt-3">
            <button className="btn btn-ghost flex-1" onClick={() => setNoteOpen(false)}>{t("取消")}</button>
            <button
              className="btn btn-primary flex-1"
              onClick={() => {
                saveNote(question.id, note)
                  .then(() => { setNoteOpen(false); onNotice(t("笔记已保存")); })
                  .catch((error) => onNotice(t("保存失败：{p0}", { p0: errorText(error) })));
              }}
            >
              {t("保存笔记")}
            </button>
          </div>
          <div className="h-4" />
        </div>
      </div>

      <div className={`sheet ${editOpen ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setEditOpen(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <h3 className="text-[15px] font-semibold">{t("编辑本题")}</h3>
          <div className="max-h-[58vh] overflow-y-auto scroll space-y-3 mt-3 pr-1">
            <label className="block">
              <div className="text-[11.5px] text-[var(--muted)] mb-1">{t("题干（支持 Markdown / HTML）")}</div>
              <textarea
                className="w-full h-24 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13.5px] outline-none resize-none"
                value={editStem}
                onChange={(event) => setEditStem(event.target.value)}
              />
            </label>

            <div>
              <div className="text-[11.5px] text-[var(--muted)] mb-1">{t("选项")}</div>
              <div className="space-y-2">
                {editOptions.map((option, position) => (
                  <div key={option.label} className="flex items-start gap-2">
                    <span className="chip shrink-0">{option.label}</span>
                    <textarea
                      className="flex-1 h-14 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-2 text-[13px] outline-none resize-none"
                      value={option.text}
                      onChange={(event) => {
                        const next = [...editOptions];
                        next[position] = { ...next[position], text: event.target.value };
                        setEditOptions(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <label className="block">
              <div className="text-[11.5px] text-[var(--muted)] mb-1">{t("答案（如 A,C；留空表示不判分）")}</div>
              <input
                className="w-full h-10 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-3 text-[13.5px] outline-none"
                value={editAnswer}
                onChange={(event) => setEditAnswer(event.target.value)}
              />
            </label>

            <label className="block">
              <div className="text-[11.5px] text-[var(--muted)] mb-1">{t("解析")}</div>
              <textarea
                className="w-full h-24 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13.5px] outline-none resize-none"
                value={editExplanation}
                onChange={(event) => setEditExplanation(event.target.value)}
              />
            </label>

            <div className="text-[11px] text-[var(--muted)] leading-5">
              {t("修改直接保存到本地题库，错题本、收藏、搜索会同步更新；此处不能新增图片。")}
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button className="btn btn-ghost btn-sm flex-1" onClick={() => setEditOpen(false)} disabled={editBusy}>{t("取消")}</button>
            <button className="btn btn-primary btn-sm flex-1" onClick={() => void saveEdit()} disabled={editBusy}>
              {editBusy ? t("保存中…") : t("保存")}
            </button>
          </div>
          <div className="h-4" />
        </div>
      </div>

      <div className={`sheet ${confirmSubmit ? 'open' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && setConfirmSubmit(false)}>
        <div className="sheet-card">
          <div className="grabber" />
          <h3 className="text-[15px] font-semibold">{t("确认交卷？")}</h3>
          <p className="text-[13.5px] text-[var(--ink-2)] mt-2 leading-6">

            {t("已答")} {answeredCount}/{questions.length}  {t("题，未答")} {questions.length - answeredCount}  {t("题。交卷后不可修改，未答按错处理。")}
          </p>
          <div className="flex gap-2 mt-5">
            <button className="btn btn-ghost flex-1" onClick={() => setConfirmSubmit(false)}>{t("继续答题")}</button>
            <button className="btn btn-primary flex-1" disabled={busy} onClick={() => void finish()}>{t("确认交卷")}</button>
          </div>
          <div className="h-2" />
        </div>
      </div>

      {aiOpen && rawQuestion ? (
        <AiTutor mobile question={rawQuestion} onClose={() => setAiOpen(false)} />
      ) : null}
    </div>
  );
}