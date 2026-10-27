import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { parseMarkdown, type ImportIssue, type ParsedFile } from './parse.ts';

interface ModuleStats {
  files: number;
  headings: number;
  imported: number;
  review: number;
  invalid: number;
}

interface FileSummary {
  file: string;
  paper: string;
  module: string;
  headings: number;
  imported: number;
  review: number;
  invalid: number;
  fileErrors: number;
  issues: ImportIssue[];
}

interface QuestionNote {
  file: string;
  line: number;
  qid: string;
  number: number;
  paper: string;
  module: string;
  canGrade: boolean;
  answerConflict: boolean;
  explanationAnswer: string | null;
  issues: string[];
}

function walk(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (entry.name.endsWith('.md')) result.push(full);
  }
  return result;
}

function moduleFromPath(rel: string): string {
  const first = rel.split('/')[0] ?? '';
  return first.replace(/^\d+-/, '');
}

function main(): void {
  const args = process.argv.slice(2);
  const root = args.find((arg) => !arg.startsWith('--'));
  if (!root) {
    console.error('usage: node tools/import-parser/validate.ts <root> [--json out.json] [--baseline]');
    process.exit(2);
  }
  const jsonIndex = args.indexOf('--json');
  const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : '';
  const baseline = args.includes('--baseline');

  const files = walk(root).sort();
  let skipped = 0;
  let fileErrors = 0;
  let headings = 0;
  let imported = 0;
  let review = 0;
  let invalid = 0;
  let warnings = 0;
  const papers = new Set<string>();
  const modules: Record<string, ModuleStats> = {};
  const issueCounts: Record<string, number> = {};
  const fileSummaries: FileSummary[] = [];
  const reviewQuestions: QuestionNote[] = [];
  const invalidQuestions: QuestionNote[] = [];
  const fileErrorDetails: Array<{ file: string; issues: ImportIssue[] }> = [];
  const warningSamples: Array<{ file: string; line: number; code: string; message: string }> = [];

  const note = (rel: string, question: ParsedFile['questions'][number]): QuestionNote => ({
    file: rel,
    line: question.line,
    qid: question.qid,
    number: question.number,
    paper: question.paper,
    module: question.module,
    canGrade: question.canGrade,
    answerConflict: question.answerConflict,
    explanationAnswer: question.explanationAnswer,
    issues: question.issues
      .filter((issue) => issue.level !== 'warning')
      .map((issue) => `${issue.code}: ${issue.message}`),
  });

  for (const full of files) {
    const rel = relative(root, full).split(sep).join('/');
    if (basename(rel) === 'README.md') {
      skipped += 1;
      continue;
    }
    const text = readFileSync(full, 'utf8');
    const parsed: ParsedFile = parseMarkdown(text, rel, { moduleFromPath: moduleFromPath(rel) });
    if (parsed.skipped) {
      skipped += 1;
      continue;
    }
    for (const issue of parsed.issues) {
      issueCounts[`${issue.level}:${issue.code}`] = (issueCounts[`${issue.level}:${issue.code}`] ?? 0) + 1;
      if (issue.level === 'warning') {
        warnings += 1;
        if (warningSamples.length < 50) {
          warningSamples.push({ file: rel, line: issue.line, code: issue.code, message: issue.message });
        }
      }
    }
    for (const question of parsed.questions) {
      for (const issue of question.issues) {
        issueCounts[`${issue.level}:${issue.code}`] = (issueCounts[`${issue.level}:${issue.code}`] ?? 0) + 1;
        if (issue.level === 'warning') {
          warnings += 1;
          if (warningSamples.length < 50) {
            warningSamples.push({ file: rel, line: issue.line, code: issue.code, message: issue.message });
          }
        }
      }
    }

    headings += parsed.headingCount;
    if (parsed.paperKey) papers.add(parsed.paperKey);
    const module = parsed.module || '(unknown)';
    const stats = (modules[module] ??= {
      files: 0,
      headings: 0,
      imported: 0,
      review: 0,
      invalid: 0,
    });
    stats.files += 1;
    stats.headings += parsed.headingCount;

    let fileImported = 0;
    let fileReview = 0;
    let fileInvalid = 0;
    if (parsed.hasFileError) {
      fileErrors += 1;
      fileInvalid = parsed.headingCount;
      invalid += fileInvalid;
      stats.invalid += fileInvalid;
      fileErrorDetails.push({
        file: rel,
        issues: parsed.issues.filter((issue) => issue.level === 'file'),
      });
    } else {
      for (const question of parsed.questions) {
        if (question.status === 'invalid') {
          fileInvalid += 1;
          invalid += 1;
          stats.invalid += 1;
          invalidQuestions.push(note(rel, question));
          continue;
        }
        fileImported += 1;
        imported += 1;
        stats.imported += 1;
        if (question.status === 'review') {
          fileReview += 1;
          review += 1;
          stats.review += 1;
          reviewQuestions.push(note(rel, question));
        }
      }
    }

    fileSummaries.push({
      file: rel,
      paper: parsed.paper,
      module: parsed.module,
      headings: parsed.headingCount,
      imported: fileImported,
      review: fileReview,
      invalid: fileInvalid,
      fileErrors: parsed.issues.filter((issue) => issue.level === 'file').length,
      issues: parsed.issues,
    });
  }

  const summary = {
    root,
    files: files.length,
    skipped,
    questionFiles: files.length - skipped,
    fileErrors,
    headings,
    imported,
    review,
    invalid,
    warnings,
    papers: papers.size,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    modules,
    issueCounts,
    fileErrors: fileErrorDetails,
    reviewQuestions,
    invalidQuestions,
    warningSamples,
    files: fileSummaries,
  };

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  }

  console.log(JSON.stringify(summary, null, 2));
  console.log('modules');
  for (const [name, stats] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b, 'zh'))) {
    console.log(
      `  ${name}: files=${stats.files} headings=${stats.headings} imported=${stats.imported} review=${stats.review} invalid=${stats.invalid}`,
    );
  }
  console.log('issueCounts');
  for (const [key, count] of Object.entries(issueCounts).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${key}: ${count}`);
  }

  if (baseline) {
    const checks = [
      ['files', summary.files, 2962],
      ['questionFiles', summary.questionFiles, 2956],
      ['papers', summary.papers, 515],
      ['headings', summary.headings, 58890],
      ['imported', summary.imported, 58890],
      ['review', summary.review, 137],
      ['invalid', summary.invalid, 0],
      ['fileErrors', summary.fileErrors, 0],
    ] as const;
    let failed = false;
    for (const [name, actual, expected] of checks) {
      const ok = actual === expected;
      if (!ok) failed = true;
      console.log(`baseline ${ok ? 'PASS' : 'FAIL'} ${name}: ${actual} (expected ${expected})`);
    }
    if (failed) process.exit(1);
  }
}

main();

