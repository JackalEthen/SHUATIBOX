use crate::db::{
    bank_conn, bank_by_id, ensure_active_bank, init_user, list_banks, open_user,
    question_from_row, read_bank_counts, set_active_bank, user_db_path, QUESTION_COLUMNS,
};
use crate::models::*;
use chrono::{Duration, Local, NaiveDate};
use rusqlite::types::Value;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};


fn module_code(module: &str) -> String {
    match module {
        "政治理论" => "01",
        "常识判断" => "02",
        "言语理解与表达" => "03",
        "数量关系" => "04",
        "判断推理" => "05",
        "资料分析" => "06",
        _ => "00",
    }
.to_string()
}

// ponytail: 用户提供的文件路径只校验扩展名，位置由系统文件选择器授权；数据库备份限定 .db
fn require_ext(path: &Path, allowed: &[&str]) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if allowed.contains(&ext.as_str()) {
        Ok(())
    } else {
        Err(format!("不支持的文件类型（仅允许 {}）", allowed.join(" / ")))
    }
}

// ponytail: DB 内 JSON 解析失败时记日志再兜底，避免静默丢弃用户数据
pub(crate) fn parse_json_or_warn<T: serde::de::DeserializeOwned + Default>(raw: &str, field: &str) -> T {
    match serde_json::from_str(raw) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("[shuatibox] 字段 {field} 的 JSON 解析失败：{error}；原始值已丢弃");
            T::default()
        }
    }
}



fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn now() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn setting(conn: &Connection, key: &str, fallback: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key=?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten()
    .unwrap_or_else(|| fallback.to_string())
}

fn settings_map(conn: &Connection) -> HashMap<String, String> {
    let mut result = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT key,value FROM settings") {
        if let Ok(rows) = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))) {
            for row in rows.flatten() {
                result.insert(row.0, row.1);
            }
        }
    }
    result
}

fn today_stats(conn: &Connection, bank_id: &str) -> Result<TodayDto, String> {
    let (answered, correct): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(correct),0) FROM attempts
             WHERE bank_id=?1 AND submitted=1 AND date(answered_at)=date('now','localtime')",
            params![bank_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;
    let goal: i64 = setting(conn, "daily_goal", "50").parse().unwrap_or(50);
    Ok(TodayDto {
        answered,
        correct,
        goal,
        accuracy: if answered == 0 { 0.0 } else { round1(correct as f64 * 100.0 / answered as f64) },
    })
}

fn streak_stats(conn: &Connection, bank_id: &str) -> Result<StreakDto, String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT date(answered_at) FROM attempts
             WHERE bank_id=?1 AND submitted=1 ORDER BY 1 DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![bank_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let dates: Vec<NaiveDate> = rows
        .flatten()
        .filter_map(|day| NaiveDate::parse_from_str(&day, "%Y-%m-%d").ok())
        .collect();
    if dates.is_empty() {
        return Ok(StreakDto { current: 0, max: 0, total_days: 0 });
    }
    let today = Local::now().date_naive();
    let latest = dates[0];
    let mut current = 0i64;
    if latest == today || latest == today - Duration::days(1) {
        let mut cursor = latest;
        for day in &dates {
            if *day == cursor {
                current += 1;
                cursor -= Duration::days(1);
            } else {
                break;
            }
        }
    }
    let mut max = 1i64;
    let mut run = 1i64;
    for pair in dates.windows(2) {
        if pair[0] - pair[1] == Duration::days(1) {
            run += 1;
            max = max.max(run);
        } else {
            run = 1;
        }
    }
    Ok(StreakDto {
        current,
        max,
        total_days: dates.len() as i64,
    })
}

fn module_stats(bank: &Connection, user: &Connection, bank_id: &str) -> Result<Vec<ModuleStat>, String> {
    let mut stmt = bank
        .prepare(
            "SELECT module, COUNT(*), SUM(CASE WHEN can_grade=1 THEN 1 ELSE 0 END)
             FROM questions GROUP BY module ORDER BY module",
        )
        .map_err(|error| error.to_string())?;
    let totals = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut result = Vec::new();
    for (name, total, available) in totals {
        let (done, attempts, correct): (i64, i64, i64) = user
            .query_row(
                "SELECT COUNT(DISTINCT question_id), COUNT(*), COALESCE(SUM(correct),0)
                 FROM attempts WHERE bank_id=?1 AND module=?2 AND submitted=1",
                params![bank_id, name],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        result.push(ModuleStat {
            code: module_code(&name),
            name,
            total,
            available,
            done,
            accuracy: if attempts == 0 { 0.0 } else { round1(correct as f64 * 100.0 / attempts as f64) },
            progress: if total == 0 { 0.0 } else { round1(done as f64 * 100.0 / total as f64) },
        });
    }
    Ok(result)
}

fn session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionDto> {
    let question_ids: String = row.get("question_ids")?;
    let spec_json: String = row.get("spec_json")?;
    Ok(SessionDto {
        id: row.get("id")?,
        mode: row.get("mode")?,
        title: row.get("title")?,
        paper_key: row.get("paper_key")?,
        module: row.get("module")?,
        question_ids: parse_json_or_warn(&question_ids, "sessions.question_ids"),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        completed_at: row.get("completed_at")?,
        status: row.get("status")?,
        duration_sec: row.get("duration_sec")?,
        score: row.get("score")?,
        total: row.get("total")?,
        answered: row.get("answered")?,
        correct: row.get("correct")?,
        spec: parse_json_or_warn(&spec_json, "sessions.spec_json"),
    })
}

const SESSION_SELECT: &str =
    "SELECT s.id,s.mode,s.title,s.paper_key,s.module,s.question_ids,s.spec_json,s.created_at,
            s.updated_at,s.completed_at,s.status,s.duration_sec,s.score,s.total,
            (SELECT COUNT(*) FROM attempts a WHERE a.session_id=s.id AND a.submitted=1 AND a.selected<>'[]') AS answered,
            (SELECT COUNT(*) FROM attempts a WHERE a.session_id=s.id AND a.submitted=1 AND a.correct=1) AS correct
     FROM sessions s";

fn session_by_id(conn: &Connection, id: &str) -> Result<SessionDto, String> {
    conn.query_row(
        &format!("{SESSION_SELECT} WHERE s.id=?1"),
        params![id],
        session_from_row,
    )
    .map_err(|error| error.to_string())
}

fn latest_active_session(conn: &Connection, bank_id: &str) -> Result<Option<SessionDto>, String> {
    conn.query_row(
        &format!("{SESSION_SELECT} WHERE s.bank_id=?1 AND s.status='active' ORDER BY s.updated_at DESC LIMIT 1"),
        params![bank_id],
        session_from_row,
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn recent_sessions(conn: &Connection, bank_id: &str, limit: i64) -> Result<Vec<SessionDto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{SESSION_SELECT} WHERE s.bank_id=?1 AND s.status='done' AND s.mode IN ('paper','exam')
             ORDER BY s.completed_at DESC LIMIT ?2"
        ))
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![bank_id, limit], session_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn count_value(conn: &Connection, sql: &str, bank_id: &str) -> i64 {
    conn.query_row(sql, params![bank_id], |row| row.get(0)).unwrap_or(0)
}

fn load_questions_by_ids(bank: &Connection, ids: &[String]) -> Result<Vec<QuestionDto>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = std::iter::repeat("?").take(ids.len()).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT {QUESTION_COLUMNS} FROM questions q JOIN papers p ON p.key=q.paper_key WHERE q.id IN ({placeholders})"
    );
    let mut stmt = bank.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), question_from_row)
        .map_err(|error| error.to_string())?;
    let map: HashMap<String, QuestionDto> = rows
        .flatten()
        .map(|question| (question.id.clone(), question))
        .collect();
    Ok(ids.iter().filter_map(|id| map.get(id).cloned()).collect())
}

fn load_session_view(app: &tauri::AppHandle, session_id: &str) -> Result<SessionView, String> {
    let user = open_user(app)?;
    let session = session_by_id(&user, session_id)?;
    let bank = bank_by_id(&user, &bank_for_session(&user, session_id)?.id)?;
    let bank_conn = bank_conn(Path::new(&bank.path))?;
    let questions = load_questions_by_ids(&bank_conn, &session.question_ids)?;
    let mut stmt = user
        .prepare(
            "SELECT question_id,selected,submitted,correct,flagged FROM attempts
             WHERE session_id=?1 ORDER BY rowid",
        )
        .map_err(|error| error.to_string())?;
    let answers = stmt
        .query_map(params![session_id], |row| {
            let selected: String = row.get(1)?;
            Ok(AnswerDto {
                question_id: row.get(0)?,
                selected: parse_json_or_warn(&selected, "attempts.selected"),
                submitted: row.get::<_, i64>(2)? == 1,
                correct: row.get::<_, i64>(3)? == 1,
                flagged: row.get::<_, i64>(4)? == 1,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let flags = answers
        .iter()
        .filter(|answer| answer.flagged)
        .map(|answer| answer.question_id.clone())
        .collect();
    Ok(SessionView {
        session,
        questions,
        answers,
        flags,
    })
}

fn bank_for_session(conn: &Connection, session_id: &str) -> Result<BankDto, String> {
    let bank_id: String = conn
        .query_row(
            "SELECT bank_id FROM sessions WHERE id=?1",
            params![session_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    bank_by_id(conn, &bank_id)
}

fn normalize_answer(values: &[String]) -> Vec<String> {
    let mut result: Vec<String> = values
        .iter()
        .flat_map(|value| value.chars())
        .filter(|ch| ch.is_ascii_alphabetic())
        .map(|ch| ch.to_ascii_uppercase().to_string())
        .collect();
    result.sort();
    result.dedup();
    result
}

fn question_meta(
    bank: &Connection,
    id: &str,
) -> Result<(Vec<String>, bool, Option<String>, Option<String>, Option<String>), String> {
    bank.query_row(
        "SELECT answer,can_grade,paper_key,module,type FROM questions WHERE id=?1",
        params![id],
        |row| {
            let answer: String = row.get(0)?;
            Ok((
                answer
                    .split(',')
                    .filter(|item| !item.is_empty())
                    .map(ToString::to_string)
                    .collect(),
                row.get::<_, i64>(1)? == 1,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn bootstrap(app: tauri::AppHandle) -> Result<Bootstrap, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let modules = module_stats(&bank_db, &user, &bank.id)?;
    let mut stmt = bank_db
        .prepare("SELECT DISTINCT year FROM papers WHERE year<>'' ORDER BY year DESC")
        .map_err(|error| error.to_string())?;
    let years = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .flatten()
        .collect();
    let mut stmt = bank_db
        .prepare("SELECT DISTINCT region FROM papers WHERE region<>'' ORDER BY region")
        .map_err(|error| error.to_string())?;
    let regions = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .flatten()
        .collect();
    let mut stmt = bank_db
        .prepare("SELECT DISTINCT exam_type FROM papers WHERE exam_type<>'' ORDER BY exam_type")
        .map_err(|error| error.to_string())?;
    let exam_types = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .flatten()
        .collect();
    let today = today_stats(&user, &bank.id)?;
    let streak = streak_stats(&user, &bank.id)?;
    let wrong_count = count_value(
        &user,
        "SELECT COUNT(*) FROM wrong WHERE bank_id=?1 AND mastered=0",
        &bank.id,
    );
    let favorite_count = count_value(
        &user,
        "SELECT COUNT(*) FROM favorites WHERE bank_id=?1",
        &bank.id,
    );
    let continue_session = latest_active_session(&user, &bank.id)?;
    let banks = list_banks(&user)?;
    let asset_dir = crate::db::asset_dir(&bank).to_string_lossy().to_string();
    Ok(Bootstrap {
        bank,
        modules,
        years,
        regions,
        exam_types,
        settings: settings_map(&user),
        today,
        streak,
        wrong_count,
        favorite_count,
        continue_session,
        banks,
        asset_dir,
    })
}

#[tauri::command]
pub fn home_summary(app: tauri::AppHandle) -> Result<HomeSummary, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let modules = module_stats(&bank_db, &user, &bank.id)?;
    let today = today_stats(&user, &bank.id)?;
    let streak = streak_stats(&user, &bank.id)?;
    let continue_session = latest_active_session(&user, &bank.id)?;
    let recent = recent_sessions(&user, &bank.id, 3)?;
    let wrong_count = count_value(
        &user,
        "SELECT COUNT(*) FROM wrong WHERE bank_id=?1 AND mastered=0",
        &bank.id,
    );
    let favorite_count = count_value(
        &user,
        "SELECT COUNT(*) FROM favorites WHERE bank_id=?1",
        &bank.id,
    );
    Ok(HomeSummary {
        today,
        streak,
        continue_session,
        recent,
        modules,
        wrong_count,
        favorite_count,
        bank,
    })
}

fn build_session(
    bank: &Connection,
    user: &Connection,
    bank_id: &str,
    spec: &SessionSpec,
) -> Result<(Vec<String>, String, Option<String>, Option<String>, i64), String> {
    let mode = spec.mode.as_str();
    let limit = spec.count.unwrap_or(20).clamp(1, 500);
    let mut ids: Vec<String> = Vec::new();
    let mut paper_key = spec.paper_key.clone();
    let mut module = spec.module.clone();
    let mut title = spec.title.clone().unwrap_or_else(|| "练习".to_string());
    let mut duration = spec.duration_sec.unwrap_or(0);

    if let Some(explicit) = &spec.question_ids {
        for id in explicit {
            let exists: bool = bank
                .query_row("SELECT 1 FROM questions WHERE id=?1", params![id], |_| Ok(true))
                .optional()
                .map_err(|error| error.to_string())?
                .unwrap_or(false);
            if exists && !ids.contains(id) {
                ids.push(id.clone());
            }
        }
        if title == "练习" {
            title = "单题练习".to_string();
        }
    } else if mode == "wrong" || mode == "favorites" {
        let sql = if mode == "wrong" {
            "SELECT question_id FROM wrong WHERE bank_id=?1 AND mastered=0
             ORDER BY last_wrong_at DESC LIMIT ?2"
        } else {
            "SELECT question_id FROM favorites WHERE bank_id=?1 ORDER BY created_at DESC LIMIT ?2"
        };
        let mut stmt = user.prepare(sql).map_err(|error| error.to_string())?;
        ids = stmt
            .query_map(params![bank_id, limit], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .flatten()
            .collect();
        title = if mode == "wrong" { "错题重做".to_string() } else { "收藏练习".to_string() };
    } else if mode == "paper" || mode == "exam" {
        let key = spec
            .paper_key
            .clone()
            .ok_or_else(|| "缺少试卷".to_string())?;
        let paper_title: String = bank
            .query_row("SELECT title FROM papers WHERE key=?1", params![key], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        let mut stmt = bank
            .prepare(
                "SELECT id FROM questions WHERE paper_key=?1 AND can_grade=1
                 ORDER BY module, number",
            )
            .map_err(|error| error.to_string())?;
        ids = stmt
            .query_map(params![key], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .flatten()
            .collect();
        paper_key = Some(key);
        module = None;
        title = if mode == "exam" {
            format!("{paper_title} · 模拟考试")
        } else {
            paper_title
        };
        duration = spec.duration_sec.unwrap_or(if mode == "exam" { 7200 } else { 0 });
    } else if mode == "custom" {
        let mut conditions = vec!["q.can_grade=1".to_string()];
        let mut values: Vec<Value> = Vec::new();
        if let Some(modules) = &spec.modules {
            if !modules.is_empty() {
                let placeholders = std::iter::repeat("?").take(modules.len()).collect::<Vec<_>>().join(",");
                conditions.push(format!("q.module IN ({placeholders})"));
                values.extend(modules.iter().cloned().map(Value::Text));
            }
        } else if let Some(module) = &spec.module {
            conditions.push("q.module=?".to_string());
            values.push(Value::Text(module.clone()));
        }
        if let Some(years) = &spec.years {
            if !years.is_empty() {
                let placeholders = std::iter::repeat("?").take(years.len()).collect::<Vec<_>>().join(",");
                conditions.push(format!("p.year IN ({placeholders})"));
                values.extend(years.iter().cloned().map(Value::Text));
            }
        } else if let Some(year) = &spec.year {
            conditions.push("p.year=?".to_string());
            values.push(Value::Text(year.clone()));
        }
        if let Some(exam_type) = &spec.exam_type {
            conditions.push("p.exam_type=?".to_string());
            values.push(Value::Text(exam_type.clone()));
        }
        let order = if spec.order.as_deref() == Some("random") {
            "RANDOM()"
        } else {
            "q.paper_key, q.module, q.number"
        };
        let sql = format!(
            "SELECT q.id FROM questions q JOIN papers p ON p.key=q.paper_key WHERE {} ORDER BY {} LIMIT {}",
            conditions.join(" AND "),
            order,
            limit
        );
        let mut stmt = bank.prepare(&sql).map_err(|error| error.to_string())?;
        ids = stmt
            .query_map(rusqlite::params_from_iter(values.iter()), |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .flatten()
            .collect();
        title = spec
            .title
            .clone()
            .unwrap_or_else(|| format!("自定义练习 · {} 题", ids.len()));
        duration = spec.duration_sec.unwrap_or(0);
    } else {
        let module_name = spec.module.clone().unwrap_or_default();
        let mut stmt = bank
            .prepare(
                "SELECT id FROM questions WHERE can_grade=1
                 AND (?1='' OR module=?1) ORDER BY RANDOM() LIMIT ?2",
            )
            .map_err(|error| error.to_string())?;
        ids = stmt
            .query_map(params![module_name, limit], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .flatten()
            .collect();
        title = if module_name.is_empty() {
            format!("随机练习 · {} 题", ids.len())
        } else {
            format!("{} · {} 题", module_name, ids.len())
        };
        module = if module_name.is_empty() { None } else { Some(module_name) };
    }

    if ids.is_empty() {
        return Err("没有可练习的题目。图片题需先导入题库图片。".to_string());
    }
    Ok((ids, title, paper_key, module, duration))
}

#[tauri::command]
pub fn start_session(app: tauri::AppHandle, spec: SessionSpec) -> Result<SessionView, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let (ids, title, paper_key, module, duration) = build_session(&bank_db, &user, &bank.id, &spec)?;
    let id = format!(
        "s{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    );
    let now = now();
    user.execute(
        "INSERT INTO sessions (id,bank_id,mode,title,paper_key,module,question_ids,spec_json,status,duration_sec,total,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'active',?9,?10,?11,?11)",
        params![
            id,
            bank.id,
            spec.mode,
            title,
            paper_key,
            module,
            serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string()),
            serde_json::to_string(&spec).unwrap_or_else(|_| "{}".to_string()),
            duration,
            ids.len() as i64,
            now
        ],
    )
    .map_err(|error| error.to_string())?;
    load_session_view(&app, &id)
}

#[tauri::command]
pub fn get_session(app: tauri::AppHandle, id: String) -> Result<SessionView, String> {
    load_session_view(&app, &id)
}

#[tauri::command]
pub fn resume_session(app: tauri::AppHandle, id: Option<String>) -> Result<SessionView, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let session_id = if let Some(id) = id {
        id
    } else {
        latest_active_session(&user, &bank.id)?
            .map(|session| session.id)
            .ok_or_else(|| "没有可继续的练习".to_string())?
    };
    load_session_view(&app, &session_id)
}

#[tauri::command]
pub fn save_answer(
    app: tauri::AppHandle,
    session_id: String,
    question_id: String,
    selected: Vec<String>,
    submitted: bool,
    elapsed_ms: Option<i64>,
    flagged: Option<bool>,
) -> Result<AnswerResult, String> {
    let user = open_user(&app)?;
    let session = session_by_id(&user, &session_id)?;
    if session.status != "active" {
        return Err("本组已交卷，不能继续作答".to_string());
    }
    let bank = bank_for_session(&user, &session_id)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let (answer, can_grade, paper_key, module, kind) = question_meta(&bank_db, &question_id)?;
    let selected = normalize_answer(&selected);
    let correct = can_grade && !selected.is_empty() && selected == normalize_answer(&answer);
    let old: Option<(bool, bool)> = user
        .query_row(
            "SELECT submitted,correct FROM attempts WHERE session_id=?1 AND question_id=?2",
            params![session_id, question_id],
            |row| Ok((row.get::<_, i64>(0)? == 1, row.get::<_, i64>(1)? == 1)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let was_submitted = old.map(|item| item.0).unwrap_or(false);
    let should_submit = submitted && !selected.is_empty();
    let answered_at = now();
    user.execute(
        "INSERT INTO attempts (session_id,bank_id,question_id,paper_key,module,type,selected,submitted,correct,flagged,elapsed_ms,answered_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,COALESCE(?10,0),?11,?12)
         ON CONFLICT(session_id,question_id) DO UPDATE SET
           selected=excluded.selected, submitted=excluded.submitted, correct=excluded.correct,
           type=excluded.type, flagged=COALESCE(?10,attempts.flagged),
           elapsed_ms=excluded.elapsed_ms, answered_at=excluded.answered_at",
        params![
            session_id,
            bank.id,
            question_id,
            paper_key,
            module,
            kind,
            serde_json::to_string(&selected).unwrap_or_else(|_| "[]".to_string()),
            if should_submit { 1 } else { 0 },
            if correct { 1 } else { 0 },
            flagged.map(|value| if value { 1 } else { 0 }),
            elapsed_ms.unwrap_or(0),
            answered_at
        ],
    )
    .map_err(|error| error.to_string())?;

    let archive: i64 = setting(&user, "archive_streak", "2").parse().unwrap_or(2);
    if should_submit && !was_submitted && can_grade {
        if correct {
            user.execute(
                "UPDATE wrong SET correct_streak=correct_streak+1,
                   mastered=CASE WHEN correct_streak+1>=?3 THEN 1 ELSE mastered END
                 WHERE bank_id=?1 AND question_id=?2",
                params![bank.id, question_id, archive],
            )
            .map_err(|error| error.to_string())?;
        } else {
            user.execute(
                "INSERT INTO wrong (bank_id,question_id,wrong_count,correct_streak,mastered,first_wrong_at,last_wrong_at)
                 VALUES (?1,?2,1,0,0,?3,?3)
                 ON CONFLICT(bank_id,question_id) DO UPDATE SET
                   wrong_count=wrong.wrong_count+1, correct_streak=0, mastered=0, last_wrong_at=excluded.last_wrong_at",
                params![bank.id, question_id, answered_at],
            )
            .map_err(|error| error.to_string())?;
        }
    }
    user.execute(
        "UPDATE sessions SET updated_at=?2 WHERE id=?1",
        params![session_id, now()],
    )
    .map_err(|error| error.to_string())?;
    let (wrong_count, mastered): (i64, bool) = user
        .query_row(
            "SELECT wrong_count,mastered FROM wrong WHERE bank_id=?1 AND question_id=?2",
            params![bank.id, question_id],
            |row| Ok((row.get(0)?, row.get::<_, i64>(1)? == 1)),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or((0, false));
    Ok(AnswerResult {
        correct,
        can_grade,
        answer,
        wrong_count,
        mastered,
    })
}

#[tauri::command]
pub fn finish_session(app: tauri::AppHandle, id: String) -> Result<FinishResult, String> {
    let user = open_user(&app)?;
    let session = session_by_id(&user, &id)?;
    let (answered, correct): (i64, i64) = user
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(correct),0) FROM attempts
             WHERE session_id=?1 AND submitted=1 AND selected<>'[]'",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;
    let total = session.total.max(1);
    let score = (correct as f64 * 100.0 / total as f64).round() as i64;
    user.execute(
        "UPDATE sessions SET status='done', score=?2, completed_at=?3, updated_at=?3 WHERE id=?1",
        params![id, score, now()],
    )
    .map_err(|error| error.to_string())?;
    let session = session_by_id(&user, &id)?;
    Ok(FinishResult {
        session,
        answered,
        correct,
        unanswered: (total - answered).max(0),
        score,
        accuracy: if answered == 0 { 0.0 } else { round1(correct as f64 * 100.0 / answered as f64) },
    })
}

#[tauri::command]
pub fn list_papers(
    app: tauri::AppHandle,
    page: Option<i64>,
    page_size: Option<i64>,
    year: Option<String>,
    region: Option<String>,
    exam_type: Option<String>,
    q: Option<String>,
) -> Result<PaperPage, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).clamp(1, 100);
    let mut conditions = vec!["1=1".to_string()];
    let mut filter_values: Vec<Value> = Vec::new();
    if let Some(year) = year.filter(|value| !value.is_empty() && value != "全部年份") {
        conditions.push("p.year=?".to_string());
        filter_values.push(Value::Text(year));
    }
    if let Some(region) = region.filter(|value| !value.is_empty() && value != "全部地区") {
        conditions.push("p.region=?".to_string());
        filter_values.push(Value::Text(region));
    }
    if let Some(exam_type) = exam_type.filter(|value| !value.is_empty() && value != "全部") {
        conditions.push("p.exam_type=?".to_string());
        filter_values.push(Value::Text(exam_type));
    }
    if let Some(q) = q.filter(|value| !value.trim().is_empty()) {
        conditions.push("p.title LIKE ?".to_string());
        filter_values.push(Value::Text(format!("%{}%", q.trim())));
    }
    let where_sql = conditions.join(" AND ");
    let total: i64 = bank_db
        .query_row(
            &format!("SELECT COUNT(*) FROM papers p WHERE {where_sql}"),
            rusqlite::params_from_iter(filter_values.iter()),
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let offset = (page - 1) * page_size;
    let mut values = filter_values;
    values.push(Value::Integer(page_size));
    values.push(Value::Integer(offset));
    let limit_index = values.len() - 1;
    let offset_index = values.len();
    let sql = format!(
        "SELECT p.key,p.title,p.year,p.region,p.exam_type,p.question_count,p.module_count,
          (SELECT COUNT(*) FROM questions x WHERE x.paper_key=p.key AND x.can_grade=1),
          (SELECT COUNT(*) FROM questions x WHERE x.paper_key=p.key AND x.has_image=1)
         FROM papers p WHERE {where_sql} ORDER BY p.year DESC, p.title LIMIT ?{limit_index} OFFSET ?{offset_index}"
    );
    let mut stmt = bank_db.prepare(&sql).map_err(|error| error.to_string())?;
    let mut items = stmt
        .query_map(rusqlite::params_from_iter(values.iter()), |row| {
            let question_count: i64 = row.get(5)?;
            let module_count: i64 = row.get(6)?;
            let available: i64 = row.get(7)?;
            let image_count: i64 = row.get(8)?;
            let note = if image_count > 0 {
                format!("{} 个模块 · {} 题 · 含图 {} 题", module_count, question_count, image_count)
            } else {
                format!("{} 个模块 · {} 题 · 纯文本", module_count, question_count)
            };
            Ok(PaperDto {
                key: row.get(0)?,
                title: row.get(1)?,
                year: row.get(2)?,
                region: row.get(3)?,
                exam_type: row.get(4)?,
                question_count,
                module_count,
                available_count: available,
                image_count,
                answered: 0,
                progress: 0.0,
                last_score: None,
                note,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(stmt);
    if !items.is_empty() {
        let placeholders = std::iter::repeat("?").take(items.len()).collect::<Vec<_>>().join(",");
        let mut progress_values: Vec<Value> = vec![Value::Text(bank.id.clone())];
        progress_values.extend(items.iter().map(|paper| Value::Text(paper.key.clone())));
        let mut progress = HashMap::new();
        let mut score = HashMap::new();
        {
            let mut pstmt = user
                .prepare(&format!(
                    "SELECT paper_key,COUNT(DISTINCT question_id) FROM attempts
                     WHERE bank_id=?1 AND submitted=1 AND paper_key IN ({placeholders}) GROUP BY paper_key"
                ))
                .map_err(|error| error.to_string())?;
            let rows = pstmt
                .query_map(rusqlite::params_from_iter(progress_values.iter()), |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .map_err(|error| error.to_string())?;
            for row in rows.flatten() {
                progress.insert(row.0, row.1);
            }
        }
        {
            let mut sstmt = user
                .prepare(&format!(
                    "SELECT paper_key,score FROM sessions WHERE bank_id=?1 AND status='done'
                     AND paper_key IN ({placeholders}) ORDER BY completed_at"
                ))
                .map_err(|error| error.to_string())?;
            let rows = sstmt
                .query_map(rusqlite::params_from_iter(progress_values.iter()), |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
                })
                .map_err(|error| error.to_string())?;
            for row in rows.flatten() {
                if let Some(value) = row.1 {
                    score.insert(row.0, value);
                }
            }
        }
        for item in &mut items {
            item.answered = *progress.get(&item.key).unwrap_or(&0);
            item.progress = if item.question_count == 0 {
                0.0
            } else {
                round1(item.answered as f64 * 100.0 / item.question_count as f64)
            };
            item.last_score = score.get(&item.key).copied();
        }
    }
    Ok(PaperPage {
        items,
        total,
        page,
        page_size,
    })
}

#[tauri::command]
pub fn search_questions(app: tauri::AppHandle, q: String, limit: Option<i64>) -> Result<SearchResult, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let term = q.trim();
    if term.is_empty() {
        return Ok(SearchResult { items: Vec::new(), total: 0 });
    }
    let limit = limit.unwrap_or(50).clamp(1, 100);
    let like = format!("%{}%", term);
    let total: i64 = bank_db
        .query_row(
            "SELECT COUNT(*) FROM questions q WHERE q.stem LIKE ?1 OR q.options LIKE ?1 OR q.explanation LIKE ?1 OR q.qid=?2 OR q.paper LIKE ?1",
            params![like, term],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let sql = format!(
        "SELECT {QUESTION_COLUMNS} FROM questions q JOIN papers p ON p.key=q.paper_key
         WHERE q.stem LIKE ?1 OR q.options LIKE ?1 OR q.explanation LIKE ?1 OR q.qid=?2 OR q.paper LIKE ?1
         ORDER BY CASE WHEN q.qid=?2 THEN 0 ELSE 1 END, q.paper_key, q.module, q.number LIMIT ?3"
    );
    let mut stmt = bank_db.prepare(&sql).map_err(|error| error.to_string())?;
    let items = stmt
        .query_map(params![like, term, limit], question_from_row)
        .map_err(|error| error.to_string())?
        .flatten()
        .collect();
    Ok(SearchResult { items, total })
}

#[tauri::command]
pub fn list_wrong(
    app: tauri::AppHandle,
    status: Option<String>,
    days: Option<i64>,
    module: Option<String>,
) -> Result<WrongPage, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let pending = count_value(
        &user,
        "SELECT COUNT(*) FROM wrong WHERE bank_id=?1 AND mastered=0",
        &bank.id,
    );
    let mastered = count_value(
        &user,
        "SELECT COUNT(*) FROM wrong WHERE bank_id=?1 AND mastered=1",
        &bank.id,
    );
    let status = status.unwrap_or_else(|| "pending".to_string());
    let mut conditions = vec!["bank_id=?".to_string()];
    let mut values: Vec<Value> = vec![Value::Text(bank.id.clone())];
    if status == "pending" {
        conditions.push("mastered=0".to_string());
    } else if status == "mastered" {
        conditions.push("mastered=1".to_string());
    }
    if let Some(days) = days.filter(|value| *value > 0) {
        conditions.push("last_wrong_at >= datetime('now','localtime',?)".to_string());
        values.push(Value::Text(format!("-{} days", days)));
    }
    values.push(Value::Integer(300));
    let limit_index = values.len();
    let sql = format!(
        "SELECT question_id,wrong_count,correct_streak,mastered,first_wrong_at,last_wrong_at
         FROM wrong WHERE {} ORDER BY mastered, last_wrong_at DESC LIMIT ?{limit_index}",
        conditions.join(" AND ")
    );
    let mut stmt = user.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)? == 1,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(stmt);
    let ids: Vec<String> = rows.iter().map(|row| row.0.clone()).collect();
    let questions = load_questions_by_ids(&bank_db, &ids)?;
    let map: HashMap<String, QuestionDto> = questions
        .into_iter()
        .map(|question| (question.id.clone(), question))
        .collect();
    let module = module.unwrap_or_default();
    let items = rows
        .into_iter()
        .filter_map(|row| {
            let question = map.get(&row.0)?.clone();
            if !module.is_empty() && module != question.module {
                return None;
            }
            Some(WrongItem {
                question,
                wrong_count: row.1,
                correct_streak: row.2,
                mastered: row.3,
                first_wrong_at: row.4,
                last_wrong_at: row.5,
            })
        })
        .collect::<Vec<_>>();
    // ponytail: items 受 LIMIT 截断，total 报真实错题总数（pending+mastered），前端据此提示
    let total = pending + mastered;
    Ok(WrongPage { items, total, pending, mastered })
}

#[tauri::command]
pub fn clear_wrong(app: tauri::AppHandle, mastered: Option<bool>) -> Result<(), String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    if mastered.unwrap_or(false) {
        user.execute(
            "DELETE FROM wrong WHERE bank_id=?1 AND mastered=1",
            params![bank.id],
        )
        .map_err(|error| error.to_string())?;
    } else {
        user.execute("DELETE FROM wrong WHERE bank_id=?1", params![bank.id])
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_favorite(app: tauri::AppHandle, question_id: String) -> Result<bool, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let exists: bool = user
        .query_row(
            "SELECT 1 FROM favorites WHERE bank_id=?1 AND question_id=?2",
            params![bank.id, question_id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or(false);
    if exists {
        user.execute(
            "DELETE FROM favorites WHERE bank_id=?1 AND question_id=?2",
            params![bank.id, question_id],
        )
        .map_err(|error| error.to_string())?;
        Ok(false)
    } else {
        user.execute(
            "INSERT INTO favorites (bank_id,question_id,created_at) VALUES (?1,?2,?3)",
            params![bank.id, question_id, now()],
        )
        .map_err(|error| error.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub fn is_favorite(app: tauri::AppHandle, question_id: String) -> Result<bool, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    Ok(user
        .query_row(
            "SELECT 1 FROM favorites WHERE bank_id=?1 AND question_id=?2",
            params![bank.id, question_id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or(false))
}

#[tauri::command]
pub fn list_favorites(app: tauri::AppHandle, limit: Option<i64>) -> Result<Vec<QuestionDto>, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let mut stmt = user
        .prepare("SELECT question_id FROM favorites WHERE bank_id=?1 ORDER BY created_at DESC LIMIT ?2")
        .map_err(|error| error.to_string())?;
    let ids: Vec<String> = stmt
        .query_map(params![bank.id, limit], |row| row.get(0))
        .map_err(|error| error.to_string())?
        .flatten()
        .collect();
    load_questions_by_ids(&bank_db, &ids)
}

#[tauri::command]
pub fn get_note(app: tauri::AppHandle, question_id: String) -> Result<SavedNote, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let row: Option<(String, String)> = user
        .query_row(
            "SELECT content,updated_at FROM notes WHERE bank_id=?1 AND question_id=?2",
            params![bank.id, question_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(match row {
        Some((content, updated_at)) => SavedNote {
            question_id,
            content,
            updated_at: Some(updated_at),
        },
        None => SavedNote {
            question_id,
            content: String::new(),
            updated_at: None,
        },
    })
}

#[tauri::command]
pub fn save_note(app: tauri::AppHandle, question_id: String, content: String) -> Result<(), String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    if content.trim().is_empty() {
        user.execute(
            "DELETE FROM notes WHERE bank_id=?1 AND question_id=?2",
            params![bank.id, question_id],
        )
        .map_err(|error| error.to_string())?;
    } else {
        user.execute(
            "INSERT INTO notes (bank_id,question_id,content,updated_at) VALUES (?1,?2,?3,?4)
             ON CONFLICT(bank_id,question_id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at",
            params![bank.id, question_id, content, now()],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn add_report(
    app: tauri::AppHandle,
    question_id: String,
    reason: String,
    note: Option<String>,
) -> Result<(), String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    user.execute(
        "INSERT INTO reports (bank_id,question_id,reason,note,created_at) VALUES (?1,?2,?3,?4,?5)",
        params![bank.id, question_id, reason, note.unwrap_or_default(), now()],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

// ponytail: 用户直接编辑题目内容，写回当前题库 db；只改文本，不处理图片文件
fn parse_answer_letters(raw: &str, options: &[OptionDto]) -> Result<Vec<String>, String> {
    let cleaned: String = raw
        .chars()
        .filter(|ch| !matches!(ch, ',' | '，' | '、' | ';' | '；' | ' ' | '\u{3000}'))
        .collect::<String>()
        .to_ascii_uppercase();
    if cleaned.is_empty() {
        return Ok(Vec::new());
    }
    let allowed: Vec<char> = options.iter().filter_map(|option| option.label.chars().next()).collect();
    let mut letters: Vec<char> = cleaned.chars().collect();
    letters.sort_unstable();
    letters.dedup();
    for letter in &letters {
        if !allowed.contains(letter) {
            return Err(format!("答案「{letter}」不在选项范围内"));
        }
    }
    Ok(letters.iter().map(|letter| letter.to_string()).collect())
}

#[tauri::command]
pub fn update_question(
    app: tauri::AppHandle,
    question_id: String,
    stem: String,
    options: Vec<OptionDto>,
    answer: String,
    explanation: String,
) -> Result<QuestionDto, String> {
    const LABELS: [&str; 8] = ["A", "B", "C", "D", "E", "F", "G", "H"];
    let stem = stem.trim().to_string();
    if stem.is_empty() {
        return Err("题干不能为空".to_string());
    }
    if !(2..=8).contains(&options.len()) {
        return Err("选项数量需在 2–8 个之间".to_string());
    }
    let mut clean = Vec::with_capacity(options.len());
    for (index, option) in options.iter().enumerate() {
        let expected = LABELS[index];
        if !option.label.trim().eq_ignore_ascii_case(expected) {
            return Err(format!("选项标签必须从 A 连续，第 {} 个应为 {expected}", index + 1));
        }
        let text = option.text.trim().to_string();
        if text.is_empty() {
            return Err(format!("选项 {expected} 内容不能为空"));
        }
        clean.push(OptionDto { label: expected.to_string(), text });
    }
    let answer_raw = answer.trim().to_string();
    let letters = parse_answer_letters(&answer_raw, &clean)?;
    let answer_text = letters.join(",");
    let has_image = [stem.as_str(), explanation.as_str()]
        .iter()
        .any(|text| text.contains("<img") || text.contains("!["))
        || clean
            .iter()
            .any(|option| option.text.contains("<img") || option.text.contains("!["));
    let options_json = serde_json::to_string(
        &clean
            .iter()
            .map(|option| serde_json::json!({ "label": option.label, "text": option.text }))
            .collect::<Vec<_>>(),
    )
    .map_err(|error| error.to_string())?;

    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let conn = crate::db::bank_conn_rw(Path::new(&bank.path))?;
    let changed = conn
        .execute(
            "UPDATE questions SET stem=?2, options=?3, answer=?4, answer_raw=?5, explanation=?6,
               status=?7, can_grade=?8, answer_conflict=0, explanation_answer=NULL,
               has_image=?9, image_missing=CASE WHEN ?9=0 THEN 0 ELSE image_missing END
             WHERE id=?1",
            params![
                question_id,
                stem,
                options_json,
                answer_text,
                answer_raw,
                explanation,
                if letters.is_empty() { "review" } else { "ok" },
                if letters.is_empty() { 0 } else { 1 },
                if has_image { 1 } else { 0 }
            ],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("题目不存在".to_string());
    }
    let sql = format!(
        "SELECT {QUESTION_COLUMNS} FROM questions q JOIN papers p ON p.key=q.paper_key WHERE q.id=?1"
    );
    conn.query_row(&sql, params![&question_id], question_from_row)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    let user = open_user(&app)?;
    Ok(settings_map(&user))
}

#[tauri::command]
pub fn set_settings(app: tauri::AppHandle, values: HashMap<String, String>) -> Result<(), String> {
    let user = open_user(&app)?;
    for (key, value) in values {
        user.execute(
            "INSERT INTO settings (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn stats(app: tauri::AppHandle, days: Option<i64>) -> Result<StatsDto, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let days = days.unwrap_or(14).clamp(7, 90);
    let (total_answered, total_correct): (i64, i64) = user
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(correct),0) FROM attempts WHERE bank_id=?1 AND submitted=1",
            params![bank.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;
    let learned_days = count_value(
        &user,
        "SELECT COUNT(DISTINCT date(answered_at)) FROM attempts WHERE bank_id=?1 AND submitted=1",
        &bank.id,
    );
    let (exam_count, best_score): (i64, i64) = user
        .query_row(
            "SELECT COUNT(*), COALESCE(MAX(score),0) FROM sessions WHERE bank_id=?1 AND mode='exam' AND status='done'",
            params![bank.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;
    let today = Local::now().date_naive();
    let mut daily = Vec::new();
    for offset in (0..days).rev() {
        let day = today - Duration::days(offset);
        let label = day.format("%Y-%m-%d").to_string();
        let (answered, correct): (i64, i64) = user
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(correct),0) FROM attempts
                 WHERE bank_id=?1 AND submitted=1 AND date(answered_at)=?2",
                params![bank.id, label],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0, 0));
        daily.push(DailyPoint { day: label, answered, correct });
    }
    let mut stmt = user
        .prepare(
            "SELECT module,type,COUNT(*),COALESCE(SUM(correct),0) FROM attempts
             WHERE bank_id=?1 AND submitted=1 GROUP BY module,type HAVING COUNT(*)>=2
             ORDER BY 1.0*SUM(correct)/COUNT(*) ASC LIMIT 4",
        )
        .map_err(|error| error.to_string())?;
    let weak = stmt
        .query_map(params![bank.id], |row| {
            let answered: i64 = row.get(2)?;
            let correct: i64 = row.get(3)?;
            Ok(WeakType {
                module: row.get(0)?,
                kind: row.get(1)?,
                answered,
                accuracy: if answered == 0 { 0.0 } else { round1(correct as f64 * 100.0 / answered as f64) },
            })
        })
        .map_err(|error| error.to_string())?
        .flatten()
        .collect();
    let mut stmt = user
        .prepare(&format!(
            "{SESSION_SELECT} WHERE s.bank_id=?1 AND s.mode='exam' AND s.status='done'
             ORDER BY s.completed_at DESC LIMIT 5"
        ))
        .map_err(|error| error.to_string())?;
    let exams = stmt
        .query_map(params![bank.id], session_from_row)
        .map_err(|error| error.to_string())?
        .flatten()
        .collect();
    Ok(StatsDto {
        days,
        total_answered,
        total_correct,
        accuracy: if total_answered == 0 { 0.0 } else { round1(total_correct as f64 * 100.0 / total_answered as f64) },
        learned_days,
        per_day: if learned_days == 0 { 0.0 } else { round1(total_answered as f64 / learned_days as f64) },
        exam_count,
        best_score,
        daily,
        modules: module_stats(&bank_db, &user, &bank.id)?,
        weak,
        exams,
    })
}

#[tauri::command]
pub fn list_banks_cmd(app: tauri::AppHandle) -> Result<Vec<BankDto>, String> {
    let user = open_user(&app)?;
    list_banks(&user)
}

#[tauri::command]
pub fn switch_bank(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let user = open_user(&app)?;
    set_active_bank(&user, &id)
}

#[tauri::command]
pub fn revalidate_bank(app: tauri::AppHandle, id: String) -> Result<BankDto, String> {
    let user = open_user(&app)?;
    let bank = bank_by_id(&user, &id)?;
    let (questions, papers, images, review) = read_bank_counts(Path::new(&bank.path))?;
    user.execute(
        "UPDATE banks SET question_count=?2,paper_count=?3,image_count=?4,review_count=?5,imported_at=datetime('now','localtime') WHERE id=?1",
        params![id, questions, papers, images, review],
    )
    .map_err(|error| error.to_string())?;
    bank_by_id(&user, &id)
}

#[tauri::command]
pub fn delete_bank(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let user = open_user(&app)?;
    let bank = bank_by_id(&user, &id)?;
    if bank.active {
        return Err("请先切换到其他题库，再删除当前题库".to_string());
    }
    let path = PathBuf::from(&bank.path);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(path.with_extension("db-wal"));
    let _ = std::fs::remove_file(path.with_extension("db-shm"));
    let assets = crate::db::asset_dir(&bank);
    let _ = std::fs::remove_dir_all(assets);
    user.execute("DELETE FROM banks WHERE id=?1", params![id])
        .map_err(|error| error.to_string())?;
    user.execute("DELETE FROM attempts WHERE bank_id=?1", params![id])
        .map_err(|error| error.to_string())?;
    user.execute("DELETE FROM sessions WHERE bank_id=?1", params![id])
        .map_err(|error| error.to_string())?;
    user.execute("DELETE FROM wrong WHERE bank_id=?1", params![id])
        .map_err(|error| error.to_string())?;
    user.execute("DELETE FROM favorites WHERE bank_id=?1", params![id])
        .map_err(|error| error.to_string())?;
    user.execute("DELETE FROM notes WHERE bank_id=?1", params![id])
        .map_err(|error| error.to_string())?;
    user.execute("DELETE FROM reports WHERE bank_id=?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_backup(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let user = open_user(&app)?;
    let target = PathBuf::from(path);
    require_ext(&target, &["db"])?;
    // ponytail: 禁止把备份写到应用数据目录内，避免覆盖 user.db 或题库
    let root = crate::db::base_dir(&app)?.canonicalize().map_err(|error| error.to_string())?;
    if let Some(parent) = target.parent() {
        if parent.canonicalize().map(|p| p.starts_with(&root)).unwrap_or(false) {
            return Err("备份不能写入应用数据目录".to_string());
        }
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if target.exists() {
        std::fs::remove_file(&target).map_err(|error| error.to_string())?;
    }
    user.execute("VACUUM INTO ?1", params![target.to_string_lossy()])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_backup(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let source = PathBuf::from(path);
    require_ext(&source, &["db"])?;
    if !source.exists() {
        return Err("备份文件不存在".to_string());
    }
    let check = Connection::open_with_flags(&source, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;
    let valid: bool = check
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'",
            [],
            |_| Ok(true),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or(false);
    drop(check);
    if !valid {
        return Err("不是有效的刷题盒子备份".to_string());
    }
    let target = user_db_path(&app)?;
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{}", target.to_string_lossy(), suffix));
    }
    std::fs::copy(source, target).map_err(|error| error.to_string())?;
    init_user(&app)?;
    // ponytail: 备份可能被篡改，剔除 banks 表中指向数据目录之外的条目，避免后续删库误伤
    let root = crate::db::base_dir(&app)?.canonicalize().map_err(|error| error.to_string())?;
    let user = open_user(&app)?;
    let paths: Vec<(String, String)> = {
        let mut stmt = user
            .prepare("SELECT id, path FROM banks")
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|error| error.to_string())?;
        rows.flatten().collect()
    };
    for (id, path) in paths {
        let legal = Path::new(&path)
            .canonicalize()
            .map(|p| p.starts_with(&root))
            .unwrap_or(false);
        if !legal {
            user.execute("DELETE FROM banks WHERE id=?1", params![id])
                .map_err(|error| error.to_string())?;
            user.execute("DELETE FROM settings WHERE key='active_bank' AND value=?1", params![id])
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    let user = open_user(&app)?;
    user.execute_batch(
        "BEGIN;
         DELETE FROM attempts;
         DELETE FROM sessions;
         DELETE FROM wrong;
         DELETE FROM favorites;
         DELETE FROM notes;
         DELETE FROM reports;
         COMMIT;",
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_bank(app: tauri::AppHandle, path: String, set_active: Option<bool>) -> Result<ImportSummary, String> {
    crate::importer::import_bank(&app, &path, set_active.unwrap_or(true))
}

#[tauri::command]
pub fn import_into_bank(
    app: tauri::AppHandle,
    path: String,
    bank_id: Option<String>,
    title: Option<String>,
    set_active: Option<bool>,
) -> Result<ImportSummary, String> {
    crate::importer::import_into_bank(&app, &path, bank_id, title, set_active.unwrap_or(true))
}

#[tauri::command]
pub fn save_avatar(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    if !source.is_file() {
        return Err("图片不存在".to_string());
    }
    // ponytail: 只接受图片扩展名，杜绝 user-avatar.<任意后缀> 污染应用目录
    let allowed = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
    require_ext(&source, &allowed)?;
    let ext = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let dir = crate::db::base_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let target = dir.join(format!("user-avatar.{ext}"));
    for old in ["png", "jpg", "jpeg", "webp", "gif", "bmp"] {
        let candidate = dir.join(format!("user-avatar.{old}"));
        if candidate != target && candidate.exists() {
            let _ = std::fs::remove_file(candidate);
        }
    }
    std::fs::copy(&source, &target).map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().to_string())
}


#[tauri::command]
pub fn load_practice_questions(
    app: tauri::AppHandle,
    limit: Option<u32>,
    module: Option<String>,
) -> Result<Vec<QuestionDto>, String> {
    let user = open_user(&app)?;
    let bank = ensure_active_bank(&user)?;
    let bank_db = bank_conn(Path::new(&bank.path))?;
    let limit = limit.unwrap_or(30).clamp(1, 200);
    let mut stmt = bank_db
        .prepare(&format!(
            "SELECT {QUESTION_COLUMNS} FROM questions q JOIN papers p ON p.key=q.paper_key
             WHERE q.can_grade=1 AND (?2 IS NULL OR q.module=?2)
             ORDER BY q.paper_key, q.module, q.number LIMIT ?1"
        ))
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![limit, module], question_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}








