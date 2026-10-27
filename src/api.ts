import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { renderMarkdown, renderRich } from './markdown';
import type { PracticeQuestion } from './questions';

export interface OptionDto {
  label: string;
  text: string;
}

export interface ReviewDto {
  explanationAnswer?: string | null;
  missing: boolean;
}

export interface QuestionDto {
  id: string;
  qid: string;
  module: string;
  type: string;
  source: string;
  paperTitle: string;
  paperKey: string;
  stem: string;
  options: OptionDto[];
  answer: string[];
  explanation: string;
  multi: boolean;
  materialTitle?: string | null;
  materialContent?: string | null;
review?: ReviewDto | null;
  hasImage: boolean;
  imageMissing: boolean;
}

export interface ModuleStat {
  code: string;
  name: string;
  total: number;
  available: number;
  done: number;
  accuracy: number;
  progress: number;
}

export interface PaperDto {
  key: string;
  title: string;
  year: string;
  region: string;
  examType: string;
  questionCount: number;
  moduleCount: number;
  availableCount: number;
  imageCount: number;
  answered: number;
  progress: number;
  lastScore?: number | null;
  note: string;
}

export interface PaperPage {
  items: PaperDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionSpec {
  mode: string;
  module?: string | null;
  paperKey?: string | null;
  questionIds?: string[] | null;
  modules?: string[] | null;
  year?: string | null;
  years?: string[] | null;
  examType?: string | null;
  count?: number | null;
  order?: string | null;
  durationSec?: number | null;
  title?: string | null;
}

export interface SessionDto {
  id: string;
  mode: string;
  title: string;
  paperKey?: string | null;
  module?: string | null;
  questionIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  status: string;
  durationSec: number;
  score?: number | null;
  total: number;
  answered: number;
  correct: number;
  spec: SessionSpec;
}

export interface AnswerDto {
  questionId: string;
  selected: string[];
  submitted: boolean;
  correct: boolean;
  flagged: boolean;
}

export interface SessionView {
  session: SessionDto;
  questions: QuestionDto[];
  answers: AnswerDto[];
  flags: string[];
}

export interface AnswerResult {
  correct: boolean;
  canGrade: boolean;
  answer: string[];
  wrongCount: number;
  mastered: boolean;
}

export interface FinishResult {
  session: SessionDto;
  answered: number;
  correct: number;
  unanswered: number;
  score: number;
  accuracy: number;
}

export interface BankDto {
  id: string;
  title: string;
  path: string;
  sourceRoot?: string | null;
  importedAt: string;
  questionCount: number;
  paperCount: number;
  imageCount: number;
  reviewCount: number;
  active: boolean;
}

export interface TodayDto {
  answered: number;
  correct: number;
  goal: number;
  accuracy: number;
}

export interface StreakDto {
  current: number;
  max: number;
  totalDays: number;
}

export interface HomeSummary {
  today: TodayDto;
  streak: StreakDto;
  continueSession?: SessionDto | null;
  recent: SessionDto[];
  modules: ModuleStat[];
  wrongCount: number;
  favoriteCount: number;
  bank: BankDto;
}

export interface Bootstrap {
  bank: BankDto;
  modules: ModuleStat[];
  years: string[];
  regions: string[];
  examTypes: string[];
  settings: Record<string, string>;
  today: TodayDto;
  streak: StreakDto;
  wrongCount: number;
  favoriteCount: number;
  continueSession?: SessionDto | null;
  banks: BankDto[];
  assetDir: string;
}

export interface DailyPoint {
  day: string;
  answered: number;
  correct: number;
}

export interface WeakType {
  module: string;
  type: string;
  answered: number;
  accuracy: number;
}

export interface StatsDto {
  days: number;
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  learnedDays: number;
  perDay: number;
  examCount: number;
  bestScore: number;
  daily: DailyPoint[];
  modules: ModuleStat[];
  weak: WeakType[];
  exams: SessionDto[];
}

export interface WrongItem {
  question: QuestionDto;
  wrongCount: number;
  correctStreak: number;
  mastered: boolean;
  firstWrongAt: string;
  lastWrongAt: string;
}

export interface WrongPage {
  items: WrongItem[];
  total: number;
  pending: number;
  mastered: number;
}

export interface SearchResult {
  items: QuestionDto[];
  total: number;
}

export interface SavedNote {
  questionId: string;
  content: string;
  updatedAt?: string | null;
}

export interface ImportSummary {
  bankId: string;
  title: string;
  questions: number;
  papers: number;
  materials: number;
  images: number;
  imageQuestions: number;
  review: number;
  invalid: number;
  fileErrors: number;
  skipped: number;
  issues: string[];
}

function localize(html: string, assetDir: string): string {
  if (!assetDir || !html.includes('asset:')) return html;
  return html.replace(/asset:([^"'\s<>]+)/g, (_match, file: string) => {
    // ponytail: 拒绝路径穿越，只允许 assets 目录内的单层文件名
    if (file.includes('..') || file.includes('/') || file.includes('\\')) return '';
    try {
      return convertFileSrc(`${assetDir}/${file}`);
    } catch {
      return `asset:${file}`;
    }
  });
}

const MATERIAL_TYPES = new Set(['片段阅读', '语句表达', '综合', '篇章阅读', '阅读理解', '材料分析', '资料分析']);

export function toQuestion(raw: QuestionDto, assetDir: string): PracticeQuestion {
  return {
    id: raw.id,
    qid: raw.qid,
    module: raw.module,
    type: raw.type,
    source: raw.source,
    paperTitle: raw.paperTitle,
    paperKey: raw.paperKey,
    stemHtml: renderMarkdown(localize(raw.stem, assetDir)),
    options: raw.options.map((option) => ({
      label: option.label,
      text: renderRich(localize(option.text, assetDir)),
    })),
    answer: raw.answer,
    explanationHtml: renderMarkdown(localize(raw.explanation || '暂无解析', assetDir)),
    multi: raw.multi,
    review: raw.review
      ? { explanationAnswer: raw.review.explanationAnswer ?? undefined, missing: raw.review.missing }
      : undefined,
    material: raw.materialContent && MATERIAL_TYPES.has(raw.type)
      ? {
          title: raw.materialTitle ?? '材料',
          html: renderMarkdown(localize(raw.materialContent, assetDir)),
        }
      : undefined,
hasImage: raw.hasImage,
    imageMissing: raw.imageMissing,
  };
}

export function hydrateSession(view: SessionView, assetDir: string) {
  return {
    ...view,
    practiceQuestions: view.questions.map((question) => toQuestion(question, assetDir)),
  };
}

export async function bootstrap(): Promise<Bootstrap> {
  return invoke<Bootstrap>('bootstrap');
}

export async function homeSummary(): Promise<HomeSummary> {
  return invoke<HomeSummary>('home_summary');
}

export async function startSession(spec: SessionSpec): Promise<SessionView> {
  return invoke<SessionView>('start_session', { spec });
}

export async function getSession(id: string): Promise<SessionView> {
  return invoke<SessionView>('get_session', { id });
}

export async function resumeSession(id?: string): Promise<SessionView> {
  return invoke<SessionView>('resume_session', { id: id ?? null });
}

export async function saveAnswer(input: {
  sessionId: string;
  questionId: string;
  selected: string[];
  submitted: boolean;
  elapsedMs?: number;
  flagged?: boolean;
}): Promise<AnswerResult> {
  return invoke<AnswerResult>('save_answer', input);
}

export async function finishSession(id: string): Promise<FinishResult> {
  return invoke<FinishResult>('finish_session', { id });
}

export async function listPapers(input: {
  page?: number;
  pageSize?: number;
  year?: string;
  region?: string;
  examType?: string;
  q?: string;
}): Promise<PaperPage> {
  return invoke<PaperPage>('list_papers', input);
}

export async function searchQuestions(q: string, limit = 50): Promise<SearchResult> {
  return invoke<SearchResult>('search_questions', { q, limit });
}

export async function listWrong(input: {
  status?: string;
  days?: number;
  module?: string;
}): Promise<WrongPage> {
  return invoke<WrongPage>('list_wrong', input);
}

export async function clearWrong(mastered = false): Promise<void> {
  return invoke('clear_wrong', { mastered });
}

export async function toggleFavorite(questionId: string): Promise<boolean> {
  return invoke<boolean>('toggle_favorite', { questionId });
}

export async function isFavorite(questionId: string): Promise<boolean> {
  return invoke<boolean>('is_favorite', { questionId });
}

export async function listFavorites(limit = 100): Promise<QuestionDto[]> {
  return invoke<QuestionDto[]>('list_favorites', { limit });
}

export async function getNote(questionId: string): Promise<SavedNote> {
  return invoke<SavedNote>('get_note', { questionId });
}

export async function saveNote(questionId: string, content: string): Promise<void> {
  return invoke('save_note', { questionId, content });
}

export async function addReport(questionId: string, reason: string, note: string): Promise<void> {
  return invoke('add_report', { questionId, reason, note });
}

export async function getSettings(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('get_settings');
}

export async function setSettings(values: Record<string, string>): Promise<void> {
  return invoke('set_settings', { values });
}

export interface Profile {
  name: string;
  avatar: string;
}

export const DEFAULT_PROFILE_NAME = 'Boss';

export async function getProfile(): Promise<Profile> {
  const values = await getSettings();
  return {
    name: values.userName || DEFAULT_PROFILE_NAME,
    avatar: values.userAvatar || '',
  };
}

export async function saveProfile(input: Partial<Profile>): Promise<void> {
  const values: Record<string, string> = {};
  if (input.name !== undefined) values.userName = input.name;
  if (input.avatar !== undefined) values.userAvatar = input.avatar;
  if (Object.keys(values).length > 0) await setSettings(values);
}

export async function saveAvatarFile(path: string): Promise<string> {
  return invoke<string>('save_avatar', { path });
}

export async function loadStats(days = 14): Promise<StatsDto> {
  return invoke<StatsDto>('stats', { days });
}

export async function listBanks(): Promise<BankDto[]> {
  return invoke<BankDto[]>('list_banks_cmd');
}

export async function switchBank(id: string): Promise<void> {
  return invoke('switch_bank', { id });
}

export async function revalidateBank(id: string): Promise<BankDto> {
  return invoke<BankDto>('revalidate_bank', { id });
}

export async function deleteBank(id: string): Promise<void> {
  return invoke('delete_bank', { id });
}

export async function exportBackup(path: string): Promise<void> {
  return invoke('export_backup', { path });
}

export async function importBackup(path: string): Promise<void> {
  return invoke('import_backup', { path });
}

export async function clearHistory(): Promise<void> {
  return invoke('clear_history');
}

export async function importBank(path: string, setActive = true): Promise<ImportSummary> {
  return invoke<ImportSummary>('import_bank', { path, setActive });
}

export function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

