import { useEffect, useMemo, useRef, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { t } from './i18n';
import { actionForEvent, loadShortcuts } from './shortcuts';
import { loadPracticeBg, practiceBgStyle } from './practiceBg';
import {
  bootstrap,
  errorText,
  getSession,
  hydrateSession,
  isFavorite,
  saveAnswer,
  toggleFavorite,
  type AnswerDto,
  type SessionView,
} from './api';
import { AnswerCard } from './AnswerCard';
import { Icon } from './icons';
import { Modal } from './Modal';
import type { PracticeQuestion } from './questions';

const LABEL = 'practice-mini';

export function MiniPractice() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session') ?? '';
  const [view, setView] = useState<SessionView | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerDto>>({});
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(() => Math.max(0, Number(params.get('index')) || 0));
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [notice, setNotice] = useState('');
  const bg = useMemo(loadPracticeBg, []);
  const assetDirRef = useRef('');
  const question = questions[index];
  const isExam = view?.session.mode === 'exam';
  const mode = isExam || (view?.session.spec.judgeMode ?? 'instant') === 'deferred' ? 'deferred' : 'instant';

  const merge = (next: SessionView) => {
    setView(next);
    setQuestions(hydrateSession(next, assetDirRef.current).practiceQuestions);
    setAnswers(Object.fromEntries(next.answers.map((item) => [item.questionId, item])));
    setFlags(new Set(next.flags));
  };

  useEffect(() => {
    if (!sessionId) return;
    bootstrap()
      .then(async (data) => {
        assetDirRef.current = data.assetDir;
        const next = await getSession(sessionId);
        merge(next);
        setIndex((value) => Math.min(Math.max(0, value), Math.max(0, next.questions.length - 1)));
      })
      .catch((error) => setNotice(errorText(error)));
  }, [sessionId]);

  useEffect(() => {
    void emit('mini-state', { open: true });
    return () => {
      void emit('mini-state', { open: false });
    };
  }, []);

  useEffect(() => {
    if (!question) return;
    const answer = answers[question.id];
    setSelected(answer?.selected ?? []);
    setSubmitted(Boolean(answer?.submitted));
    isFavorite(question.id).then(setFavorite).catch(() => undefined);
  }, [question?.id]);

  useEffect(() => {
    const unlisten = listen<{ sessionId: string; origin: string }>('session-updated', async (event) => {
      if (event.payload.sessionId !== sessionId || event.payload.origin === LABEL) return;
      try {
        const next = await getSession(sessionId);
        setAnswers(Object.fromEntries(next.answers.map((item) => [item.questionId, item])));
        setFlags(new Set(next.flags));
      } catch {
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [sessionId]);

  useEffect(() => {
    const unlisten = listen<{ sessionId: string; index: number }>('mini-open', (event) => {
      if (event.payload.sessionId !== sessionId) return;
      setIndex(Math.max(0, event.payload.index));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [sessionId]);

  useEffect(() => {
    if (!question || !view) return;
    const map = loadShortcuts();
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const action = actionForEvent(event, map);
      if (action) {
        event.preventDefault();
        if (action === 'prev') setIndex((value) => Math.max(0, value - 1));
        else if (action === 'next') setIndex((value) => Math.min(questions.length - 1, value + 1));
        else if (action === 'submit') {
          if (question.multi && !submitted && selected.length > 0) void submit(selected, true);
        } else if (action === 'favorite') void voidFavorite();
        else if (action === 'flag') void voidFlag();
        else if (action === 'card') setCardOpen(true);
        return;
      }
      const key = event.key.toUpperCase();
      if (/^[A-H]$/.test(key)) {
        const option = question.options.find((item) => item.label === key);
        if (option) choose(key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, selected, submitted, busy, flags]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const broadcast = () => {
    void emit('session-updated', { sessionId, origin: LABEL });
  };

  const submit = async (labels: string[], graded: boolean) => {
    if (!view || !question || busy) return;
    setBusy(true);
    try {
      const result = await saveAnswer({
        sessionId,
        questionId: question.id,
        selected: labels,
        submitted: graded,
        flagged: flags.has(question.id),
      });
      setAnswers((current) => ({
        ...current,
        [question.id]: {
          questionId: question.id,
          selected: labels,
          submitted: graded,
          correct: graded ? result.correct : (current[question.id]?.correct ?? false),
          flagged: flags.has(question.id),
        },
      }));
      setSubmitted(graded);
      broadcast();
    } catch (error) {
      showNotice(t("保存失败：{p0}", { p0: errorText(error) }));
    } finally {
      setBusy(false);
    }
  };

  function choose(label: string) {
    if (!question || submitted || busy) return;
    if (question.multi) {
      const next = selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label];
      setSelected(next);
      void submit(next, false);
      return;
    }
    setSelected([label]);
    if (mode === 'instant' && !isExam) void submit([label], true);
    else void submit([label], false);
  }

  const voidFlag = async () => {
    if (!question) return;
    const next = new Set(flags);
    if (next.has(question.id)) next.delete(question.id);
    else next.add(question.id);
    setFlags(next);
    try {
      await saveAnswer({
        sessionId,
        questionId: question.id,
        selected,
        submitted,
        flagged: next.has(question.id),
      });
      broadcast();
    } catch (error) {
      showNotice(t("标记失败：{p0}", { p0: errorText(error) }));
    }
  };

  const voidFavorite = async () => {
    if (!question) return;
    try {
      const value = await toggleFavorite(question.id);
      setFavorite(value);
    } catch (error) {
      showNotice(t("收藏失败：{p0}", { p0: errorText(error) }));
    }
  };

  const close = () => {
    void emit('mini-state', { open: false });
    void invoke('close_mini_window');
  };

  const answer = question ? answers[question.id] : undefined;
  const isSubmitted = submitted || Boolean(answer?.submitted);
  const optionClass = (label: string) => {
    if (!question || !isSubmitted) return selected.includes(label) ? 'opt is-selected' : 'opt';
    if (question.answer.includes(label)) return 'opt is-correct';
    if (selected.includes(label)) return 'opt is-wrong';
    return 'opt';
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={practiceBgStyle(bg)}>
      <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-[var(--line)] select-none" style={{ background: 'color-mix(in srgb, var(--card) 86%, transparent)' }}>
        <span data-tauri-drag-region className="text-[11px] text-[var(--muted)]">
          {t("卡片刷题")}
        </span>
        <span data-tauri-drag-region className="text-[11px] text-[var(--ink-2)]">
          {questions.length ? index + 1 : 0} / {questions.length}
        </span>
        <div data-tauri-drag-region className="flex-1 h-full" />
        <div className="ml-auto flex items-center gap-0.5">
          <button
            className="icon-btn w-8 h-8"
            onClick={() => void voidFavorite()}
            aria-label={t("收藏")}
            style={favorite ? { color: 'var(--warn)' } : undefined}
          >
            <Icon name="star" className="w-4 h-4" />
          </button>
          <button
            className="icon-btn w-8 h-8"
            onClick={() => void voidFlag()}
            aria-label={t("标注")}
            style={question && flags.has(question.id) ? { color: 'var(--warn)' } : undefined}
          >
            <Icon name="check" className="w-4 h-4" />
          </button>
          <button className="icon-btn w-8 h-8" onClick={() => setCardOpen(true)} aria-label={t("答题卡")}>
            <Icon name="grid" className="w-4 h-4" />
          </button>
          <button
            className="icon-btn w-8 h-8"
            onClick={() => {
              const next = !pinned;
              setPinned(next);
              void getCurrentWindow().setAlwaysOnTop(next);
            }}
            aria-label={t("固定在最上方")}
            style={pinned ? { color: 'var(--accent-ink)' } : undefined}
          >
            <Icon name="pin" className="w-4 h-4" />
          </button>
          <button className="icon-btn w-8 h-8" onClick={close} aria-label={t("返回做题页")}>
            <Icon name="chevronLeft" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll px-4 py-3">
        {question ? (
          <>
            <div className="text-[10.5px] text-[var(--muted)]">
              {question.module} · {question.type}
            </div>
            {question.material ? (
              <div className="card material-card p-2.5 mt-2 max-h-28 overflow-y-auto scroll text-[11px] leading-5 text-[var(--ink-2)]">
                <div dangerouslySetInnerHTML={{ __html: question.material.html }} />
              </div>
            ) : null}
            <div className="qtext text-[13.5px] mt-2" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />
            <div className="mt-3 space-y-2">
              {question.options.map((option) => (
                <button key={option.label} className={optionClass(option.label)} onClick={() => choose(option.label)}>
                  <span className="opt-key">{option.label}</span>
                  <span dangerouslySetInnerHTML={{ __html: option.text }} />
                </button>
              ))}
            </div>
            {question.multi && !isSubmitted ? (
              <button
                className="btn btn-soft btn-sm mt-2.5"
                onClick={() => void submit(selected, true)}
                disabled={selected.length === 0 || busy}
              >
                {t("提交本题")}
              </button>
            ) : null}
            {isSubmitted && question.answer.length > 0 ? (
              <div className="card p-3 mt-3 text-[11.5px] leading-6">
                <div className="flex items-center gap-2">
                  <span className={answer?.correct ? 'chip-accent' : 'chip'} style={answer?.correct ? undefined : { color: 'var(--bad)', borderColor: 'var(--bad)' }}>
                    {answer?.correct ? t("回答正确") : t("回答错误")}
                  </span>
                  <span className="text-[var(--muted)]">{t("正确答案")} <b className="text-[var(--ink-2)]">{question.answer.join('')}</b></span>
                </div>
                <div className="mt-2 text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: question.explanationHtml }} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-[12px] text-[var(--muted)]">{view ? t("本组题目为空。") : t("加载中…")}</div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] px-3 py-2 flex items-center gap-2" style={{ background: 'color-mix(in srgb, var(--card) 92%, transparent)' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
          <Icon name="chevronLeft" className="w-3.5 h-3.5" />
          {t("上一题")}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}
          disabled={index >= questions.length - 1}
        >
          {t("下一题")}
          <Icon name="chevronRight" className="w-3.5 h-3.5" />
        </button>
        <span className="ml-auto text-[10px] text-[var(--muted)]">{t("答完回主窗交卷")}</span>
      </div>

      {notice ? (
        <div className="absolute left-1/2 bottom-14 -translate-x-1/2 text-[11px] px-3 py-1.5 rounded-lg text-white" style={{ background: 'rgba(30,28,24,.86)' }}>
          {notice}
        </div>
      ) : null}

      <div
        className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize"
        onMouseDown={(event) => {
          event.preventDefault();
          void getCurrentWindow().startResizeDragging('SouthEast');
        }}
        aria-label={t("缩放")}
      />

      <Modal open={cardOpen} title={t("答题卡")} onClose={() => setCardOpen(false)}>
        <AnswerCard
          questions={questions}
          answers={answers}
          flags={flags}
          isExam={Boolean(isExam)}
          mode={mode}
          current={index}
          className="grid grid-cols-6 gap-2"
          onPick={(itemIndex) => {
            setIndex(itemIndex);
            setCardOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
