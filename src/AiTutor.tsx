import { useEffect, useRef, useState } from 'react';
import { aiCancel, aiChat, errorText, type AiChatMessage, type QuestionDto } from './api';
import { Icon } from './icons';
import { renderMarkdown } from './markdown';
import { MobileSheet } from './MobileSheet';
import { Modal } from './Modal';

interface Props {
  question: QuestionDto;
  onClose: () => void;
  mobile?: boolean;
}

const IMAGE_MD = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
const IMAGE_HTML = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;

function stripImages(text: string): string {
  return text.replace(IMAGE_MD, '[图片]').replace(IMAGE_HTML, '[图片]');
}

function collectImages(text: string, out: string[]) {
  for (const match of text.matchAll(IMAGE_MD)) out.push(match[1]);
  for (const match of text.matchAll(IMAGE_HTML)) out.push(match[1] ?? match[2] ?? match[3]);
}

function buildPrompt(question: QuestionDto): { text: string; images: string[] } {
  const images: string[] = [];
  const material = question.materialContent ? stripImages(question.materialContent) : '';
  if (question.materialContent) collectImages(question.materialContent, images);
  const stem = stripImages(question.stem);
  collectImages(question.stem, images);
  const options = question.options.map((option) => {
    collectImages(option.text, images);
    return `${option.label}. ${stripImages(option.text)}`;
  });

  const lines = [
    '请解答下面这道题，并详细讲解解题思路。先给出正确答案，再逐步分析，说明关键概念和易错点。',
    '',
  ];
  if (material.trim()) lines.push('【材料】', material.trim(), '');
  lines.push('【题目】', stem.trim(), '');
  if (options.length) lines.push('【选项】', ...options, '');
  if (question.answer.length) lines.push(`【参考答案】${question.answer.join(',')}`);

  return { text: lines.join('\n').trim(), images: [...new Set(images)] };
}

export function AiTutor({ question, onClose, mobile }: Props) {
  const initial = useRef<{ text: string; images: string[] } | null>(null);
  if (!initial.current) initial.current = buildPrompt(question);

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [requestId] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // ponytail: StrictMode 会先清理再重建，延迟到下一轮确认真正卸载才取消
      window.setTimeout(() => {
        if (!mounted.current) void aiCancel(requestId).catch(() => undefined);
      }, 0);
    };
  }, [requestId]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const history: AiChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(history);
    setError('');
    setBusy(true);
    try {
      const reply = await aiChat(history, initial.current?.images ?? [], requestId);
      setMessages([...history, { role: 'assistant', content: reply }]);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (busy || messages.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const reply = await aiChat(messages, initial.current?.images ?? [], requestId);
      setMessages([...messages, { role: 'assistant', content: reply }]);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send(initial.current?.text ?? '');
    // ponytail: 只在挂载时自动发首问，组件关闭即销毁
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, error, busy]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void send(text);
  };

  const body = (
    <div className="flex flex-col h-[60vh]">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'self-end max-w-[86%]' : 'self-start max-w-[92%]'}>
            {message.role === 'user' ? (
              <div className="rounded-2xl rounded-br-md bg-[var(--accent)] px-3 py-2 text-[12.5px] leading-6 text-white whitespace-pre-wrap">
                {message.content}
              </div>
            ) : (
              <div className="rounded-2xl rounded-bl-md border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[12.5px] leading-6 text-[var(--ink-2)]">
                <div className="ai-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
              </div>
            )}
          </div>
        ))}
        {busy ? <div className="self-start text-[11.5px] text-[var(--muted)]">AI 正在思考…</div> : null}
        {error ? (
          <div className="self-start max-w-[92%] rounded-xl border border-[var(--bad)] px-3 py-2 text-[11.5px] leading-5 text-[var(--bad)]">
            {error}
            <button className="ml-2 underline" onClick={() => void retry()}>
              重试
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-end gap-2 border-t border-[var(--line)] pt-3">
        <textarea
          className="flex-1 resize-none rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[12.5px] text-[var(--ink)] outline-none"
          rows={2}
          placeholder="继续追问…（Enter 发送，Shift+Enter 换行）"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button className="btn btn-primary" disabled={busy || !input.trim()} onClick={submit}>
          发送
        </button>
      </div>
    </div>
  );

  if (mobile) {
    return (
      <MobileSheet open onClose={onClose}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)]">
          <Icon name="sparkle" className="w-4 h-4" />
          <span className="text-[13px] font-semibold">AI 讲解</span>
          <button className="icon-btn ml-auto" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="p-4">{body}</div>
      </MobileSheet>
    );
  }

  return (
    <Modal open title="AI 讲解" onClose={onClose} wide>
      {body}
    </Modal>
  );
}
