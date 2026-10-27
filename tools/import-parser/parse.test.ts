import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from './parse.ts';

function doc(body: string, meta = '试卷: "测试卷"\n模块: "言语理解与表达"\n题数: "1"'): string {
  return `---\n${meta}\n---\n\n# 测试卷\n\n> 摘要\n\n${body}`;
}

function base(question: string, options = '- **A**. 甲\n- **B**. 乙\n- **C**. 丙\n- **D**. 丁', answer = 'D'): string {
  return `## 第 1 题　<sub>qid 100 · 逻辑填空</sub>\n\n${question}\n\n${options}\n\n**答案**：${answer}\n\n**官方解析**\n\n解析。故正确答案为${answer}。`;
}

test('single choice imports', () => {
  const parsed = parseMarkdown(doc(base('题干。')), 'a.md');
  assert.equal(parsed.hasFileError, false);
  assert.equal(parsed.questions.length, 1);
  const q = parsed.questions[0];
  assert.equal(q.status, 'ok');
  assert.deepEqual(q.answer, ['D']);
  assert.equal(q.options.length, 4);
  assert.equal(q.qid, '100');
  assert.equal(q.type, '逻辑填空');
  assert.equal(q.stem, '题干。');
});

test('eight options import', () => {
  const options = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    .map((label) => `- **${label}**. ${label}`)
    .join('\n');
  const parsed = parseMarkdown(doc(base('题干。', options, 'H')), 'a.md');
  const q = parsed.questions[0];
  assert.equal(q.status, 'ok');
  assert.equal(q.options.length, 8);
  assert.deepEqual(q.answer, ['H']);
});

test('multi answer is normalized and sorted', () => {
  const parsed = parseMarkdown(
    doc(base('题干。', '- **A**. 甲 ✅\n- **B**. 乙\n- **C**. 丙 ✅\n- **D**. 丁 ✅', 'C,A,D')),
    'a.md',
  );
  const q = parsed.questions[0];
  assert.equal(q.status, 'ok');
  assert.deepEqual(q.answer, ['A', 'C', 'D']);
  assert.equal(q.answerRaw, 'C,A,D');
});

test('judgment placeholder synthesizes two options', () => {
  const body = `## 第 1 题　<sub>qid 200 · 新思想</sub>

说法正确。（  ）

- （选项）[]

**答案**：A

**官方解析**

故表述正确。`;
  const parsed = parseMarkdown(doc(body), 'a.md');
  const q = parsed.questions[0];
  assert.equal(q.status, 'ok');
  assert.equal(q.isJudgment, true);
  assert.deepEqual(q.options.map((option) => option.text), ['正确', '错误']);
  assert.deepEqual(q.answer, ['A']);
});

test('material subquestions keep material key', () => {
  const body = `## 材料 1

材料正文。

### 第 1 题　<sub>qid 301 · 综合</sub>

小题一。

- **A**. 甲
- **B**. 乙

**答案**：A

**官方解析**

故正确答案为A。

---

### 第 2 题　<sub>qid 302 · 综合</sub>

小题二。

- **A**. 甲
- **B**. 乙

**答案**：B

**官方解析**

故正确答案为B。`;
  const parsed = parseMarkdown(doc(body, '试卷: "测试卷"\n模块: "资料分析"\n题数: "2"'), 'a.md');
  assert.equal(parsed.materials.length, 1);
  assert.equal(parsed.materials[0].content, '材料正文。');
  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.questions[0].materialNumber, 1);
  assert.equal(parsed.questions[1].materialKey, parsed.questions[0].materialKey);
});

test('check mark mismatch marks review', () => {
  const parsed = parseMarkdown(
    doc(base('题干。', '- **A**. 甲\n- **B**. 乙\n- **C**. 丙 ✅\n- **D**. 丁', 'D')),
    'a.md',
  );
  const q = parsed.questions[0];
  assert.equal(q.status, 'review');
  assert.equal(q.canGrade, true);
  assert.equal(q.answerConflict, true);
  assert.ok(q.issues.some((issue) => issue.code === 'check-mismatch'));
});

test('explanation conflict marks review', () => {
  const parsed = parseMarkdown(
    doc(base('题干。', '- **A**. 甲\n- **B**. 乙\n- **C**. 丙\n- **D**. 丁 ✅', 'D').replace('故正确答案为D。', '故正确答案为B。')),
    'a.md',
  );
  const q = parsed.questions[0];
  assert.equal(q.status, 'review');
  assert.equal(q.canGrade, true);
  assert.equal(q.answerConflict, true);
  assert.equal(q.explanationAnswer, 'B');
  assert.ok(q.issues.some((issue) => issue.code === 'explanation-conflict'));
});

test('missing answer imports with review', () => {
  const body = `## 第 1 题

题干。

- **A**. 甲
- **B**. 乙`;
  const parsed = parseMarkdown(doc(body), 'a.md');
  const q = parsed.questions[0];
  assert.equal(q.status, 'review');
  assert.equal(q.canGrade, false);
  assert.ok(q.issues.some((issue) => issue.code === 'answer-missing'));
});

test('trailing empty option is dropped, middle empty is invalid', () => {
  const trailing = parseMarkdown(
    doc(base('题干。', '- **A**. 甲\n- **B**. 乙\n- **C**. 丙\n- **D**. 丁\n- **E**. ', 'A')),
    'a.md',
  );
  assert.equal(trailing.questions[0].status, 'ok');
  assert.equal(trailing.questions[0].options.length, 4);
  assert.ok(trailing.questions[0].issues.some((issue) => issue.code === 'empty-option-dropped'));

  const middle = parseMarkdown(
    doc(base('题干。', '- **A**. 甲\n- **B**. \n- **C**. 丙\n- **D**. 丁', 'A')),
    'a.md',
  );
  assert.equal(middle.questions[0].status, 'invalid');
  assert.ok(middle.questions[0].issues.some((issue) => issue.code === 'empty-option'));
});

test('declared count mismatch is a file error', () => {
  const parsed = parseMarkdown(doc(base('题干。'), '试卷: "测试卷"\n模块: "言语理解与表达"\n题数: "2"'), 'a.md');
  assert.equal(parsed.hasFileError, true);
  assert.ok(parsed.issues.some((issue) => issue.code === 'count-mismatch'));
});

test('duplicate qid in one file invalidates both', () => {
  const body = `${base('题干一。')}\n\n---\n\n## 第 2 题　<sub>qid 100 · 逻辑填空</sub>\n\n题干二。\n\n- **A**. 甲\n- **B**. 乙\n- **C**. 丙\n- **D**. 丁\n\n**答案**：D\n\n**官方解析**\n\n故正确答案为D。`;
  const parsed = parseMarkdown(doc(body, '试卷: "测试卷"\n模块: "言语理解与表达"\n题数: "2"'), 'a.md');
  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.questions[0].status, 'invalid');
  assert.equal(parsed.questions[1].status, 'invalid');
  assert.ok(parsed.questions[0].issues.some((issue) => issue.code === 'qid-duplicate'));
});

test('alias type suffix is parsed', () => {
  const body = `## 第 1 题 · 片段阅读

题干。

- **A**. 甲
- **B**. 乙

**答案**：A

**官方解析**

故正确答案为A。`;
  const parsed = parseMarkdown(doc(body), 'a.md');
  const q = parsed.questions[0];
  assert.equal(q.status, 'ok');
  assert.equal(q.type, '片段阅读');
  assert.equal(q.qidSource, 'auto');
});

test('answer not in options is invalid', () => {
  const parsed = parseMarkdown(doc(base('题干。', undefined, 'E')), 'a.md');
  const q = parsed.questions[0];
  assert.equal(q.status, 'invalid');
  assert.ok(q.issues.some((issue) => issue.code === 'answer-not-in-options'));
});


