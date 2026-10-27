import { readFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, sep, basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseMarkdown } from './parse.ts';

interface PaperRow {
  key: string;
  title: string;
  year: string;
  region: string;
  examType: string;
  questions: number;
  modules: Set<string>;
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
  return (rel.split('/')[0] ?? '').replace(/^\d+-/, '');
}

function main(): void {
  const args = process.argv.slice(2);
  const root = resolve(args[0] ?? '');
  if (!args[0]) {
    console.error('usage: node tools/import-parser/build-db.ts <题库根目录> [输出.db]');
    process.exit(2);
  }
  const output = resolve(args[1] ?? join(import.meta.dirname, '../../data/shuatibox.db'));
  mkdirSync(dirname(output), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) rmSync(output + suffix, { force: true });

  const db = new DatabaseSync(output);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE papers (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      year TEXT NOT NULL,
      region TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      module_count INTEGER NOT NULL
    );
    CREATE TABLE materials (
      key TEXT PRIMARY KEY,
      paper_key TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_file TEXT NOT NULL,
      line INTEGER NOT NULL
    );
    CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      paper_key TEXT NOT NULL,
      paper TEXT NOT NULL,
      module TEXT NOT NULL,
      number INTEGER NOT NULL,
      qid TEXT NOT NULL,
      qid_source TEXT NOT NULL,
      type TEXT NOT NULL,
      is_judgment INTEGER NOT NULL,
      stem TEXT NOT NULL,
      options TEXT NOT NULL,
      answer TEXT NOT NULL,
      answer_raw TEXT NOT NULL,
      explanation TEXT NOT NULL,
      material_key TEXT,
      material_title TEXT,
      material_content TEXT,
      status TEXT NOT NULL,
      can_grade INTEGER NOT NULL,
      answer_conflict INTEGER NOT NULL,
      explanation_answer TEXT,
      has_image INTEGER NOT NULL,
      image_missing INTEGER NOT NULL DEFAULT 0,
      source_file TEXT NOT NULL,
      source_line INTEGER NOT NULL
    );
  `);

  const insertPaper = db.prepare(
    'INSERT OR REPLACE INTO papers (key,title,year,region,exam_type,question_count,module_count) VALUES (?,?,?,?,?,?,?)',
  );
  const insertMaterial = db.prepare(
    'INSERT OR REPLACE INTO materials (key,paper_key,title,content,source_file,line) VALUES (?,?,?,?,?,?)',
  );
  const insertQuestion = db.prepare(`
    INSERT INTO questions (
      id,paper_key,paper,module,number,qid,qid_source,type,is_judgment,
      stem,options,answer,answer_raw,explanation,material_key,material_title,material_content,
      status,can_grade,answer_conflict,explanation_answer,has_image,image_missing,source_file,source_line
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const papers = new Map<string, PaperRow>();
  let files = 0;
  let skipped = 0;
  let fileErrors = 0;
  let materialCount = 0;
  let imported = 0;
  let review = 0;
  let imageQuestions = 0;

  db.exec('BEGIN');
  try {
    for (const full of walk(root).sort()) {
      const rel = relative(root, full).split(sep).join('/');
      if (basename(rel) === 'README.md') {
        skipped += 1;
        continue;
      }
      const parsed = parseMarkdown(readFileSync(full, 'utf8'), rel, { moduleFromPath: moduleFromPath(rel) });
      if (parsed.skipped) {
        skipped += 1;
        continue;
      }
      files += 1;
      if (parsed.hasFileError) {
        fileErrors += 1;
        continue;
      }

      const paper = papers.get(parsed.paperKey) ?? {
        key: parsed.paperKey,
        title: parsed.paper,
        year: parsed.year,
        region: parsed.region,
        examType: parsed.examType,
        questions: 0,
        modules: new Set<string>(),
      };
      paper.questions += parsed.questions.length;
      paper.modules.add(parsed.module);
      papers.set(parsed.paperKey, paper);

      const materialByKey = new Map(parsed.materials.map((item) => [item.key, item]));
      for (const material of parsed.materials) {
        insertMaterial.run(
          material.key,
          parsed.paperKey,
          `材料 ${material.number}`,
          material.content,
          rel,
          material.line,
        );
        materialCount += 1;
      }

      for (const question of parsed.questions) {
        const material = question.materialKey ? materialByKey.get(question.materialKey) : undefined;
        const hasImage = /<img\b/i.test(
          [question.stem, question.explanation, ...question.options.map((option) => option.text), material?.content ?? ''].join('\n'),
        );
        if (hasImage) imageQuestions += 1;
        insertQuestion.run(
          question.id,
          question.paperKey,
          question.paper,
          question.module,
          question.number,
          question.qid,
          question.qidSource,
          question.type,
          question.isJudgment ? 1 : 0,
          question.stem,
          JSON.stringify(question.options.map((option) => ({ label: option.label, text: option.text }))),
          question.answer.join(','),
          question.answerRaw,
          question.explanation,
          question.materialKey,
          material ? `材料 ${material.number}` : null,
          material?.content ?? null,
          question.status,
          question.canGrade ? 1 : 0,
          question.answerConflict ? 1 : 0,
          question.explanationAnswer,
          hasImage ? 1 : 0,
          hasImage ? 1 : 0,
          rel,
          question.line,
        );
        imported += 1;
        if (question.status === 'review') review += 1;
      }
    }

    for (const paper of papers.values()) {
      insertPaper.run(
        paper.key,
        paper.title,
        paper.year,
        paper.region,
        paper.examType,
        paper.questions,
        paper.modules.size,
      );
    }

    db.exec(`
      CREATE INDEX idx_questions_module ON questions(module);
      CREATE INDEX idx_questions_paper ON questions(paper_key);
      CREATE INDEX idx_questions_paper_practice ON questions(paper_key, can_grade, image_missing);
      CREATE INDEX idx_questions_practice ON questions(can_grade, image_missing);
      CREATE INDEX idx_questions_status ON questions(status);
    `);
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('imported', String(imported));
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('review', String(review));
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('papers', String(papers.size));
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('materials', String(materialCount));
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('image_questions', String(imageQuestions));
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('image_missing', String(imageQuestions));
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('source_root', root);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }

  console.log(
    JSON.stringify(
      {
        output,
        files,
        skipped,
        fileErrors,
        papers: papers.size,
        materials: materialCount,
        imported,
        review,
        imageQuestions,
        textOnlyGradeable: imported - imageQuestions,
      },
      null,
      2,
    ),
  );
}

main();

