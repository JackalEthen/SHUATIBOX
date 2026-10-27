use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OptionDto {
    pub label: String,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDto {
    pub explanation_answer: Option<String>,
    pub missing: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionDto {
    pub id: String,
    pub qid: String,
    pub module: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub source: String,
    pub paper_title: String,
    pub paper_key: String,
    pub stem: String,
    pub options: Vec<OptionDto>,
    pub answer: Vec<String>,
    pub explanation: String,
    pub multi: bool,
    pub material_title: Option<String>,
    pub material_content: Option<String>,
    pub review: Option<ReviewDto>,
    pub has_image: bool,
    pub image_missing: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModuleStat {
    pub code: String,
    pub name: String,
    pub total: i64,
    pub available: i64,
    pub done: i64,
    pub accuracy: f64,
    pub progress: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PaperDto {
    pub key: String,
    pub title: String,
    pub year: String,
    pub region: String,
    pub exam_type: String,
    pub question_count: i64,
    pub module_count: i64,
    pub available_count: i64,
    pub image_count: i64,
    pub answered: i64,
    pub progress: f64,
    pub last_score: Option<i64>,
    pub note: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PaperPage {
    pub items: Vec<PaperDto>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionSpec {
    pub mode: String,
    pub module: Option<String>,
    pub paper_key: Option<String>,
    pub question_ids: Option<Vec<String>>,
    pub modules: Option<Vec<String>>,
    pub year: Option<String>,
    pub years: Option<Vec<String>>,
    pub exam_type: Option<String>,
    pub count: Option<i64>,
    pub order: Option<String>,
    pub duration_sec: Option<i64>,
    pub title: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    pub id: String,
    pub mode: String,
    pub title: String,
    pub paper_key: Option<String>,
    pub module: Option<String>,
    pub question_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub status: String,
    pub duration_sec: i64,
    pub score: Option<i64>,
    pub total: i64,
    pub answered: i64,
    pub correct: i64,
    pub spec: SessionSpec,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnswerDto {
    pub question_id: String,
    pub selected: Vec<String>,
    pub submitted: bool,
    pub correct: bool,
    pub flagged: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub session: SessionDto,
    pub questions: Vec<QuestionDto>,
    pub answers: Vec<AnswerDto>,
    pub flags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnswerResult {
    pub correct: bool,
    pub can_grade: bool,
    pub answer: Vec<String>,
    pub wrong_count: i64,
    pub mastered: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FinishResult {
    pub session: SessionDto,
    pub answered: i64,
    pub correct: i64,
    pub unanswered: i64,
    pub score: i64,
    pub accuracy: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BankDto {
    pub id: String,
    pub title: String,
    pub path: String,
    pub source_root: Option<String>,
    pub imported_at: String,
    pub question_count: i64,
    pub paper_count: i64,
    pub image_count: i64,
    pub review_count: i64,
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TodayDto {
    pub answered: i64,
    pub correct: i64,
    pub goal: i64,
    pub accuracy: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreakDto {
    pub current: i64,
    pub max: i64,
    pub total_days: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HomeSummary {
    pub today: TodayDto,
    pub streak: StreakDto,
    pub continue_session: Option<SessionDto>,
    pub recent: Vec<SessionDto>,
    pub modules: Vec<ModuleStat>,
    pub wrong_count: i64,
    pub favorite_count: i64,
    pub bank: BankDto,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub bank: BankDto,
    pub modules: Vec<ModuleStat>,
    pub years: Vec<String>,
    pub regions: Vec<String>,
    pub exam_types: Vec<String>,
    pub settings: std::collections::HashMap<String, String>,
    pub today: TodayDto,
    pub streak: StreakDto,
    pub wrong_count: i64,
    pub favorite_count: i64,
    pub continue_session: Option<SessionDto>,
    pub banks: Vec<BankDto>,
    pub asset_dir: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyPoint {
    pub day: String,
    pub answered: i64,
    pub correct: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WeakType {
    pub module: String,
    pub kind: String,
    pub answered: i64,
    pub accuracy: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatsDto {
    pub days: i64,
    pub total_answered: i64,
    pub total_correct: i64,
    pub accuracy: f64,
    pub learned_days: i64,
    pub per_day: f64,
    pub exam_count: i64,
    pub best_score: i64,
    pub daily: Vec<DailyPoint>,
    pub modules: Vec<ModuleStat>,
    pub weak: Vec<WeakType>,
    pub exams: Vec<SessionDto>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WrongItem {
    pub question: QuestionDto,
    pub wrong_count: i64,
    pub correct_streak: i64,
    pub mastered: bool,
    pub first_wrong_at: String,
    pub last_wrong_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WrongPage {
    pub items: Vec<WrongItem>,
    pub total: i64,
    pub pending: i64,
    pub mastered: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub items: Vec<QuestionDto>,
    pub total: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedNote {
    pub question_id: String,
    pub content: String,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub bank_id: String,
    pub title: String,
    pub questions: i64,
    pub papers: i64,
    pub materials: i64,
    pub images: i64,
    pub image_questions: i64,
    pub review: i64,
    pub invalid: i64,
    pub file_errors: i64,
    pub skipped: i64,
    pub issues: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub phase: String,
    pub current: i64,
    pub total: i64,
    pub message: String,
}
