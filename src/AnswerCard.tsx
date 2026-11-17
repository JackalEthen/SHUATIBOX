import type { AnswerDto } from './api';
import { t } from './i18n';

interface Props {
  questions: { id: string }[];
  answers: Record<string, AnswerDto>;
  flags: Set<string>;
  isExam: boolean;
  mode: 'instant' | 'deferred';
  current: number;
  onPick: (index: number) => void;
  className?: string;
}

export function AnswerCard({ questions, answers, flags, isExam, mode, current, onPick, className }: Props) {
  const deferred = isExam || mode === 'deferred';
  return (
    <div className={className ?? 'grid grid-cols-5 gap-2.5'}>
      {questions.map((question, index) => {
        const answer = answers[question.id];
        const answered = Boolean(answer?.selected?.length);
        const flagged = flags.has(question.id);
        let state = 'unanswered';
        let label = t('未答');
        if (flagged) {
          state = 'flagged';
          label = t('标记');
        } else if (answered) {
          if (deferred) {
            state = 'good';
            label = t('已答');
          } else if (answer.submitted) {
            state = answer.correct ? 'good' : 'bad';
            label = answer.correct ? t('答对') : t('答错');
          } else {
            label = t('待判');
          }
        }
        const classes = ['ans-cell', state];
        if (index === current) classes.push('current');
        return (
          <button
            key={question.id}
            className={classes.join(' ')}
            title={label}
            aria-label={`${t('第 {p0} 题', { p0: index + 1 })} · ${label}`}
            onClick={() => onPick(index)}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}
