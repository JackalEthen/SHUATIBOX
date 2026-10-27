export type IssueLevel = 'file' | 'question' | 'warning';

export interface ImportIssue {
  level: IssueLevel;
  code: string;
  file: string;
  line: number;
  message: string;
}

export interface ParsedOption {
  label: string;
  text: string;
  checked: boolean;
}

export interface ParsedQuestion {
  id: string;
  qid: string;
  qidSource: 'source' | 'auto';
  paperKey: string;
  paper: string;
  module: string;
  number: number;
  type: string;
  isJudgment: boolean;
  stem: string;
  options: ParsedOption[];
  answer: string[];
  answerRaw: string;
  explanation: string;
  materialNumber: number | null;
  materialKey: string | null;
  line: number;
  status: 'ok' | 'review' | 'invalid';
  canGrade: boolean;
  answerConflict: boolean;
  explanationAnswer: string | null;
  issues: ImportIssue[];
}

export interface ParsedMaterial {
  key: string;
  number: number;
  content: string;
  line: number;
}

export interface ParsedFile {
  file: string;
  skipped: boolean;
  paper: string;
  paperKey: string;
  module: string;
  year: string;
  region: string;
  examType: string;
  meta: Record<string, string>;
  title: string;
  headingCount: number;
  questions: ParsedQuestion[];
  materials: ParsedMaterial[];
  issues: ImportIssue[];
  hasFileError: boolean;
}

export interface ParseOptions {
  moduleFromPath?: string;
}

interface QuestionState {
  number: number;
  line: number;
  qid: string | null;
  type: string;
  stem: string[];
  options: ParsedOption[];
  placeholder: boolean;
  answerRaw: string | null;
  answerLine: number | null;
  firstOptionLine: number | null;
  explanation: string[];
  sawAnswer: boolean;
  explanationHeading: boolean;
  contentAfterOptions: boolean;
  materialNumber: number | null;
  issues: ImportIssue[];
}

interface MaterialState {
  number: number;
  line: number;
  content: string[];
  qCount: number;
}

const QUESTION_RE = /^(##|###)[ \t]+第[ \t]*(\d+)[ \t]*题(.*)$/;
const MATERIAL_RE = /^##[ \t]+材料[ \t]*(\d+)[ \t]*$/;
const OPTION_RE = /^\s*-\s+\*\*([A-H])\*\*\s*[.．、]\s*(.*?)\s*$/;
const PLACEHOLDER_RE = /^\s*-\s*（选项）\[\]\s*$/;
const ANSWER_RE = /^\*\*答案\*\*\s*[：:]\s*(.*?)\s*$/;
const EXPLAIN_RE = /^\*\*(官方解析|解析)\*\*\s*$/;
const QID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function hash32(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function deriveExamType(paper: string, explicit: string): string {
  if (explicit) return explicit;
  if (/国家公务员|国考/.test(paper)) return '国考';
  if (/选调/.test(paper)) return '选调';
  if (/事业单位|综合知识|公共基础知识/.test(paper)) return '事业单位';
  if (/公务员|联考|省考/.test(paper)) return '省考';
  return '其他';
}

function normalizeAnswer(raw: string): string {
  return raw.replace(/[\s、,，/]/g, '').toUpperCase();
}

function answerSet(raw: string): string[] {
  return [...new Set(normalizeAnswer(raw).split(''))].sort();
}

function lastMatch(text: string, pattern: RegExp): RegExpExecArray | null {
  let found: RegExpExecArray | null = null;
  for (const match of text.matchAll(pattern)) found = match;
  return found;
}

function explanationAnswer(explanation: string): string[] {
  const match = lastMatch(explanation, /故正确答案为\s*([A-H](?:[、,，\s]*[A-H])*)/g);
  return match ? answerSet(match[1]) : [];
}

function explanationJudgment(explanation: string): 'A' | 'B' | null {
  const match = lastMatch(explanation, /故(?:题干)?表述(正确|错误)/g);
  if (!match) return null;
  return match[1] === '正确' ? 'A' : 'B';
}

function parseMeta(text: string): {
  meta: Record<string, string>;
  body: string;
  bodyStartLine: number;
  error: string | null;
} {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { meta: {}, body: text, bodyStartLine: 1, error: null };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) {
    return { meta: {}, body: text, bodyStartLine: 1, error: 'frontmatter 没有结束标记 ---' };
  }
  const meta: Record<string, string> = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^([^:]+):(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].trim();
    if (!key) continue;
    meta[key] = stripQuotes(match[2].trim());
  }
  return {
    meta,
    body: lines.slice(end + 1).join('\n'),
    bodyStartLine: end + 2,
    error: null,
  };
}

function parseHeadingSuffix(suffix: string): {
  qid: string | null;
  type: string;
  error: string | null;
} {
  const rest = suffix.trim();
  if (!rest) return { qid: null, type: '', error: null };

  if (rest.startsWith('·')) {
    const type = rest.slice(1).trim();
    return { qid: null, type, error: null };
  }

  if (!rest.startsWith('<sub>') || !rest.endsWith('</sub>')) {
    return { qid: null, type: '', error: `题目标题后缀无法识别：${rest}` };
  }

  const inner = rest.slice(5, -6).trim();
  if (!inner) return { qid: null, type: '', error: null };

  const qidMatch = /^qid\s+(\S+)(.*)$/.exec(inner);
  if (qidMatch) {
    const qid = qidMatch[1];
    const tail = qidMatch[2].trim();
    if (tail && !tail.startsWith('·')) {
      return { qid: null, type: '', error: `qid 后有多余内容：${tail}` };
    }
    return { qid, type: tail ? tail.slice(1).trim() : '', error: null };
  }

  return { qid: null, type: inner, error: null };
}

function makeIssue(
  level: IssueLevel,
  code: string,
  file: string,
  line: number,
  message: string,
): ImportIssue {
  return { level, code, file, line, message };
}

export function parseMarkdown(
  text: string,
  file: string,
  options: ParseOptions = {},
): ParsedFile {
  const clean = text.replace(/^\uFEFF/, '');
  const parsedMeta = parseMeta(clean);
  const issues: ImportIssue[] = [];

  if (parsedMeta.error) {
    issues.push(makeIssue('file', 'frontmatter', file, 1, parsedMeta.error));
    return {
      file,
      skipped: false,
      paper: '',
      paperKey: '',
      module: options.moduleFromPath ?? '',
      year: '',
      region: '',
      examType: '',
      meta: {},
      title: '',
      headingCount: 0,
      questions: [],
      materials: [],
      issues,
      hasFileError: true,
    };
  }

  const meta = parsedMeta.meta;
  if (meta['类型'] === '模块索引') {
    return {
      file,
      skipped: true,
      paper: meta['试卷'] ?? '',
      paperKey: '',
      module: meta['模块'] ?? options.moduleFromPath ?? '',
      year: '',
      region: '',
      examType: '',
      meta,
      title: '',
      headingCount: 0,
      questions: [],
      materials: [],
      issues,
      hasFileError: false,
    };
  }

  const paper = meta['试卷'] ?? '';
  const module = meta['模块'] ?? options.moduleFromPath ?? '';
  let year = meta['年份'] ?? '';
  const region = meta['地区'] ?? '';
  const examType = deriveExamType(paper, meta['考试类型'] ?? '');

  if (!paper) issues.push(makeIssue('file', 'paper-missing', file, 1, '缺少 试卷 字段'));
  if (!module) issues.push(makeIssue('file', 'module-missing', file, 1, '缺少 模块 字段，且无法从目录推导'));
  if (year && !/^\d{4}$/.test(year)) {
    issues.push(makeIssue('warning', 'year-invalid', file, 1, `年份 不是 4 位数字：${year}`));
    year = '';
  }

  const paperKey = [paper, year, region].filter(Boolean).join('|');
  const bodyStartLine = parsedMeta.bodyStartLine;
  const lines = parsedMeta.body.split(/\r?\n/);

  const questions: ParsedQuestion[] = [];
  const materials: ParsedMaterial[] = [];
  const materialNumbers = new Set<number>();
  const questionNumbers = new Set<number>();
  let title = '';
  let currentQuestion: QuestionState | null = null;
  let currentMaterial: MaterialState | null = null;
  let firstQuestionSeen = false;
  let contentStarted = false;
  let h1Seen = false;
  let outsideContent = 0;
  let inFence = false;

  const fileIssue = (code: string, line: number, message: string): void => {
    issues.push(makeIssue('file', code, file, line, message));
  };
  const warn = (code: string, line: number, message: string): void => {
    issues.push(makeIssue('warning', code, file, line, message));
  };

  const closeMaterial = (): void => {
    if (!currentMaterial) return;
    if (currentMaterial.qCount === 0) {
      fileIssue('empty-material', currentMaterial.line, `材料 ${currentMaterial.number} 没有小题`);
    } else {
      materials.push({
        key: `${paperKey}|${module}|${currentMaterial.number}`,
        number: currentMaterial.number,
        content: currentMaterial.content.join('\n').trim(),
        line: currentMaterial.line,
      });
    }
    currentMaterial = null;
  };

  const finalizeQuestion = (state: QuestionState): void => {
    const questionIssues: ImportIssue[] = [...state.issues];
    let status: 'ok' | 'review' | 'invalid' = state.issues.some((issue) =>
      ['heading-suffix', 'explanation-before-answer', 'duplicate-answer'].includes(issue.code),
    )
      ? 'invalid'
      : 'ok';
    const bad = (code: string, message: string): void => {
      status = 'invalid';
      questionIssues.push(makeIssue('question', code, file, state.line, message));
    };
    const flag = (code: string, message: string): void => {
      if (status === 'ok') status = 'review';
      questionIssues.push(makeIssue('question', code, file, state.line, message));
    };
    const questionWarn = (code: string, message: string): void => {
      questionIssues.push(makeIssue('warning', code, file, state.line, message));
    };

    const options = state.options.map((option) => ({ ...option }));
    while (options.length > 0 && options[options.length - 1].text.trim() === '') {
      const dropped = options.pop();
      questionWarn('empty-option-dropped', `末尾空选项 ${dropped?.label ?? ''} 已丢弃`);
    }
    for (const option of options) {
      if (!option.text.trim()) bad('empty-option', `选项 ${option.label} 文本为空`);
    }

    const answer = normalizeAnswer(state.answerRaw ?? '');
    const answerValid = !!answer && /^[A-H]{1,8}$/.test(answer);
    const answerLetters = answerValid ? [...new Set(answer.split(''))].sort() : [];
    let isJudgment = false;

    if (state.placeholder && options.length > 0) {
      bad('placeholder-with-options', '同时存在真实选项和 - （选项）[] 占位行');
    }

    if (options.length === 0) {
      if (state.placeholder) {
        isJudgment = true;
        options.push({ label: 'A', text: '正确', checked: false });
        options.push({ label: 'B', text: '错误', checked: false });
      } else {
        bad('no-options', '没有选项，且不满足判断题条件');
      }
    }

    if (options.length > 0) {
      if (options.length < 2 || options.length > 8) {
        bad('option-count', `选项数量必须是 2–8，实际 ${options.length}`);
      }
      options.forEach((option, index) => {
        const expected = String.fromCharCode(65 + index);
        if (option.label !== expected) {
          bad('option-labels', `选项必须从 A 连续排列，第 ${index + 1} 个应为 ${expected}，实际 ${option.label}`);
        }
      });
    }

    if (!state.answerRaw) {
      flag('answer-missing', '缺少 **答案** 行，已导入但无法判分');
    } else if (!answerValid) {
      flag('answer-invalid', `答案不是 A–H 字母：${state.answerRaw}，已导入但无法判分`);
    } else if (answerLetters.length !== answer.length) {
      bad('answer-duplicate', `答案包含重复字母：${state.answerRaw}`);
    } else if (options.length > 0) {
      const labels = new Set(options.map((option) => option.label));
      for (const letter of answerLetters) {
        if (!labels.has(letter)) bad('answer-not-in-options', `答案 ${letter} 不在选项中`);
      }
    }

    if (state.firstOptionLine !== null && state.answerLine !== null && state.answerLine < state.firstOptionLine) {
      if (!isJudgment) bad('answer-before-options', '答案出现在选项之前');
    }

    let answerConflict = false;
    let explanationFinal: string | null = null;
    const checked = [...new Set(options.filter((option) => option.checked).map((option) => option.label))].sort();
    if (checked.length > 0 && checked.join('') !== answerLetters.join('')) {
      answerConflict = true;
      flag('check-mismatch', `✅ 标记 ${checked.join('')} 与答案 ${answerLetters.join('')} 不一致`);
    }

    if (state.contentAfterOptions) {
      bad('content-after-options', '选项与答案之间存在无法识别的内容');
    }

    const explanation = state.explanation.join('\n').trim();
    if (answerLetters.length > 0) {
      const finalAnswer = explanationAnswer(explanation);
      if (finalAnswer.length > 0 && finalAnswer.join('') !== answerLetters.join('')) {
        answerConflict = true;
        explanationFinal = finalAnswer.join('');
        flag(
          'explanation-conflict',
          `解析最终答案 ${explanationFinal} 与答案 ${answerLetters.join('')} 不一致`,
        );
      }
      if (isJudgment) {
        const judgment = explanationJudgment(explanation);
        if (judgment && judgment !== answerLetters.join('')) {
          answerConflict = true;
          explanationFinal = judgment;
          flag('explanation-conflict', `解析判定 ${judgment} 与答案 ${answerLetters.join('')} 不一致`);
        }
      }
    }

    const stem = state.stem.join('\n').trim();
    if (!stem) bad('empty-stem', '题干为空');
    if (!explanation) questionWarn('missing-explanation', '缺少解析');

    let qid = state.qid ?? '';
    if (qid && !QID_RE.test(qid)) {
      bad('qid-invalid', `qid 不合法：${qid}`);
      qid = '';
    }
    let qidSource: 'source' | 'auto' = 'source';
    if (!qid) {
      qidSource = 'auto';
      qid = `auto-${hash32(`${paperKey}|${module}|${state.number}`)}`;
    }

    const materialNumber = state.materialNumber;
    questions.push({
      id: `${paperKey}|${module}|${qid}`,
      qid,
      qidSource,
      paperKey,
      paper,
      module,
      number: state.number,
      type: state.type || '未分类',
      isJudgment,
      stem,
      options,
      answer: answerLetters,
      answerRaw: state.answerRaw ?? '',
      explanation,
      materialNumber,
      materialKey: materialNumber === null ? null : `${paperKey}|${module}|${materialNumber}`,
      line: state.line,
      status,
      canGrade: status !== 'invalid' && answerLetters.length > 0,
      answerConflict,
      explanationAnswer: explanationFinal,
      issues: questionIssues,
    });
  };
  const closeQuestion = (): void => {
    if (!currentQuestion) return;
    finalizeQuestion(currentQuestion);
    currentQuestion = null;
  };

  const appendContent = (line: string): void => {
    if (currentQuestion) {
      if (currentQuestion.sawAnswer) {
        currentQuestion.explanation.push(line);
      } else if (currentQuestion.options.length > 0) {
        if (line.trim()) currentQuestion.contentAfterOptions = true;
      } else {
        currentQuestion.stem.push(line);
      }
      return;
    }
    if (currentMaterial && currentMaterial.qCount === 0) {
      currentMaterial.content.push(line);
      return;
    }
    if (line.trim()) outsideContent += 1;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNo = bodyStartLine + index;
    const trimmed = line.trim();

    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      appendContent(line);
      continue;
    }
    if (inFence) {
      appendContent(line);
      continue;
    }

    if (trimmed === '---') {
      closeQuestion();
      continue;
    }

    if (!currentQuestion && !currentMaterial && !firstQuestionSeen && /^\s*>/.test(line)) {
      continue;
    }

    const materialMatch = MATERIAL_RE.exec(line);
    if (materialMatch) {
      closeQuestion();
      closeMaterial();
      const number = Number(materialMatch[1]);
      contentStarted = true;
      if (number < 1) fileIssue('material-number', lineNo, `材料编号必须为正整数：${number}`);
      if (materialNumbers.has(number)) {
        fileIssue('duplicate-material', lineNo, `材料编号重复：${number}`);
      } else {
        materialNumbers.add(number);
      }
      currentMaterial = { number, line: lineNo, content: [], qCount: 0 };
      continue;
    }

    const questionMatch = QUESTION_RE.exec(line);
    if (questionMatch) {
      closeQuestion();
      const level = questionMatch[1];
      const number = Number(questionMatch[2]);
      const suffix = parseHeadingSuffix(questionMatch[3]);
      contentStarted = true;
      firstQuestionSeen = true;

      if (level === '##') closeMaterial();

      if (level === '###' && !currentMaterial) {
        fileIssue('h3-outside-material', lineNo, '### 小题只能出现在 ## 材料 N 内');
      }
      if (number < 1) fileIssue('question-number', lineNo, `题号必须为正整数：${number}`);
      if (questionNumbers.has(number)) {
        fileIssue('duplicate-number', lineNo, `题号重复：${number}`);
      } else {
        questionNumbers.add(number);
      }

      const state: QuestionState = {
        number,
        line: lineNo,
        qid: suffix.qid,
        type: suffix.type,
        stem: [],
        options: [],
        placeholder: false,
        answerRaw: null,
        answerLine: null,
        firstOptionLine: null,
        explanation: [],
        sawAnswer: false,
        explanationHeading: false,
        contentAfterOptions: false,
        materialNumber: currentMaterial ? currentMaterial.number : null,
        issues: [],
      };
      if (suffix.error) {
        state.issues.push(makeIssue('question', 'heading-suffix', file, lineNo, suffix.error));
      }
      if (currentMaterial) currentMaterial.qCount += 1;
      currentQuestion = state;
      continue;
    }

    if (/^#\s/.test(line)) {
      if (firstQuestionSeen || contentStarted || h1Seen) {
        fileIssue('h1-after-content', lineNo, '一级标题只能出现一次且在所有题目之前');
      } else {
        h1Seen = true;
        title = line.replace(/^#\s+/, '').trim();
      }
      continue;
    }

    if (/^##\s/.test(line)) {
      fileIssue('unknown-heading', lineNo, `无法识别的二级标题：${trimmed.slice(0, 60)}`);
      continue;
    }
    if (/^###\s/.test(line)) {
      fileIssue('unknown-heading', lineNo, `无法识别的三级标题：${trimmed.slice(0, 60)}`);
      continue;
    }

    if (currentQuestion) {
      if (!currentQuestion.sawAnswer) {
        const optionMatch = OPTION_RE.exec(line);
        if (optionMatch) {
          if (currentQuestion.options.length === 0) currentQuestion.firstOptionLine = lineNo;
          let text = optionMatch[2];
          const checked = /(?:[\s\u3000]*✅)+\s*$/.test(text);
          if (checked) text = text.replace(/(?:[\s\u3000]*✅)+\s*$/, '');
          currentQuestion.options.push({
            label: optionMatch[1],
            text: text.trim(),
            checked,
          });
          continue;
        }

        if (PLACEHOLDER_RE.test(line)) {
          if (currentQuestion.options.length > 0) {
            currentQuestion.issues.push(
              makeIssue('question', 'placeholder-with-options', file, lineNo, '占位行出现在真实选项之后'),
            );
          }
          currentQuestion.placeholder = true;
          continue;
        }

        const answerMatch = ANSWER_RE.exec(line);
        if (answerMatch) {
          currentQuestion.answerRaw = answerMatch[1];
          currentQuestion.answerLine = lineNo;
          currentQuestion.sawAnswer = true;
          continue;
        }

        if (EXPLAIN_RE.test(line)) {
          currentQuestion.issues.push(
            makeIssue('question', 'explanation-before-answer', file, lineNo, '解析出现在答案之前'),
          );
          currentQuestion.explanationHeading = true;
          continue;
        }
      } else {
        const answerMatch = ANSWER_RE.exec(line);
        if (answerMatch) {
          currentQuestion.issues.push(
            makeIssue('question', 'duplicate-answer', file, lineNo, '出现第二条 **答案** 行'),
          );
          currentQuestion.explanation.push(line);
          continue;
        }
        const optionMatch = OPTION_RE.exec(line);
        if (optionMatch) {
          currentQuestion.issues.push(
            makeIssue('warning', 'option-after-answer', file, lineNo, '答案之后出现选项样式的行'),
          );
          currentQuestion.explanation.push(line);
          continue;
        }
        if (EXPLAIN_RE.test(line)) {
          currentQuestion.explanationHeading = true;
          continue;
        }
      }
    }

    appendContent(line);
  }

  closeQuestion();
  closeMaterial();

  const byQid = new Map<string, ParsedQuestion[]>();
  for (const question of questions) {
    if (question.qidSource !== 'source') continue;
    const list = byQid.get(question.qid) ?? [];
    list.push(question);
    byQid.set(question.qid, list);
  }
  for (const [qid, list] of byQid) {
    if (list.length < 2) continue;
    for (const question of list) {
      question.status = 'invalid';
      question.issues.push(
        makeIssue('question', 'qid-duplicate', file, question.line, `同一文件内 qid 重复：${qid}`),
      );
    }
  }

  const sortedNumbers = questions.map((question) => question.number);
  for (let i = 1; i < sortedNumbers.length; i += 1) {
    if (sortedNumbers[i] !== sortedNumbers[i - 1] + 1) {
      warn('number-gap', questions[i].line, `题号不连续：${sortedNumbers[i - 1]} → ${sortedNumbers[i]}`);
    }
  }

  const declaredCount = meta['题数'];
  if (declaredCount !== undefined && declaredCount !== '') {
    const count = Number(declaredCount);
    if (!Number.isInteger(count) || count < 0) {
      warn('count-invalid', 1, `题数 不是非负整数：${declaredCount}`);
    } else if (count !== questions.length) {
      fileIssue('count-mismatch', 1, `题数 声明 ${count}，实际解析 ${questions.length} 道标题`);
    }
  }

  if (questions.length === 0) {
    fileIssue('empty-file', 1, '非索引文件没有题目');
  }
  if (outsideContent > 0) {
    warn('outside-content', 1, `题目之外有 ${outsideContent} 行内容被忽略`);
  }

  return {
    file,
    skipped: false,
    paper,
    paperKey,
    module,
    year,
    region,
    examType,
    meta,
    title,
    headingCount: questions.length,
    questions,
    materials,
    issues,
    hasFileError: issues.some((issue) => issue.level === 'file'),
  };
}



