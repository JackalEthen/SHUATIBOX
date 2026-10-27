use crate::models::{BankDto, QuestionDto, ReviewDto};
use rusqlite::{Connection, OpenFlags, Row};
use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn base_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) && !cfg!(target_os = "android") {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../data"));
    }
    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
}

pub fn user_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = base_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("user.db"))
}

pub fn default_bank_path(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    let dir = base_dir(app)?;
    let candidates = if cfg!(debug_assertions) && !cfg!(target_os = "android") {
        vec![dir.join("shuatibox.db")]
    } else {
        vec![
            dir.join("banks/default.db"),
            dir.join("shuatibox.db"),
        ]
    };
    if let Some(found) = candidates.into_iter().find(|path| path.exists()) {
        return Ok(Some(found));
    }
    if !cfg!(debug_assertions) || cfg!(target_os = "android") {
        if let Ok(resource) = app.path().resource_dir() {
            let source = resource.join("shuatibox.db");
            if source.exists() {
                let target = dir.join("shuatibox.db");
                std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
                std::fs::copy(&source, &target).map_err(|error| error.to_string())?;
                return Ok(Some(target));
            }
        }
    }
    Ok(None)
}

pub fn open_user(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = user_db_path(app)?;
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| error.to_string())?;
    Ok(conn)
}

pub fn init_user(app: &tauri::AppHandle) -> Result<(), String> {
    let conn = open_user(app)?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS banks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          path TEXT NOT NULL,
          source_root TEXT,
          imported_at TEXT NOT NULL,
          question_count INTEGER NOT NULL DEFAULT 0,
          paper_count INTEGER NOT NULL DEFAULT 0,
          image_count INTEGER NOT NULL DEFAULT 0,
          review_count INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          bank_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          title TEXT NOT NULL,
          paper_key TEXT,
          module TEXT,
          question_ids TEXT NOT NULL,
          spec_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          duration_sec INTEGER NOT NULL DEFAULT 0,
          score INTEGER,
          total INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS attempts (
          session_id TEXT NOT NULL,
          bank_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          paper_key TEXT,
          module TEXT,
          type TEXT,
          selected TEXT NOT NULL DEFAULT '[]',
          submitted INTEGER NOT NULL DEFAULT 0,
          correct INTEGER NOT NULL DEFAULT 0,
          flagged INTEGER NOT NULL DEFAULT 0,
          elapsed_ms INTEGER NOT NULL DEFAULT 0,
          answered_at TEXT NOT NULL,
          PRIMARY KEY (session_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS wrong (
          bank_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          wrong_count INTEGER NOT NULL DEFAULT 0,
          correct_streak INTEGER NOT NULL DEFAULT 0,
          mastered INTEGER NOT NULL DEFAULT 0,
          first_wrong_at TEXT NOT NULL,
          last_wrong_at TEXT NOT NULL,
          PRIMARY KEY (bank_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS favorites (
          bank_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (bank_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS notes (
          bank_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          content TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (bank_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bank_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS import_reports (
          bank_id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_bank ON sessions(bank_id, status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_paper ON sessions(bank_id, paper_key, status);
        CREATE INDEX IF NOT EXISTS idx_attempts_bank ON attempts(bank_id, answered_at);
        CREATE INDEX IF NOT EXISTS idx_attempts_paper ON attempts(bank_id, paper_key, question_id);
        CREATE INDEX IF NOT EXISTS idx_attempts_module ON attempts(bank_id, module, question_id);
        CREATE INDEX IF NOT EXISTS idx_wrong_bank ON wrong(bank_id, mastered, last_wrong_at);
        ",
    )
    .map_err(|error| error.to_string())?;
    let _ = conn.execute("ALTER TABLE attempts ADD COLUMN type TEXT", []);

    for (key, value) in [
        ("practice_mode", "instant"),
        ("archive_streak", "2"),
        ("daily_goal", "50"),
        ("shortcuts", "1"),
        ("show_explanation", "1"),
    ] {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key,value) VALUES (?1,?2)",
            rusqlite::params![key, value],
        )
        .map_err(|error| error.to_string())?;
    }

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM banks", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if count == 0 {
        if let Some(path) = default_bank_path(app)? {
            register_bank(&conn, "default", "行测真题 2016–2026", &path, None, true)?;
        }
    }
    let _ = ensure_active_bank(&conn)?;
    Ok(())
}

pub fn register_bank(
    conn: &Connection,
    id: &str,
    title: &str,
    path: &Path,
    source_root: Option<&str>,
    active: bool,
) -> Result<(), String> {
    let (questions, papers, images, review) = read_bank_counts(path)?;
    if active {
        conn.execute("UPDATE banks SET active = 0", [])
            .map_err(|error| error.to_string())?;
    }
    conn.execute(
        "INSERT INTO banks (id,title,path,source_root,imported_at,question_count,paper_count,image_count,review_count,active)
         VALUES (?1,?2,?3,?4,datetime('now','localtime'),?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title,path=excluded.path,source_root=excluded.source_root,
           imported_at=excluded.imported_at,question_count=excluded.question_count,paper_count=excluded.paper_count,
           image_count=excluded.image_count,review_count=excluded.review_count,active=excluded.active",
        rusqlite::params![
            id,
            title,
            path.to_string_lossy(),
            source_root,
            questions,
            papers,
            images,
            review,
            if active { 1 } else { 0 }
        ],
    )
    .map_err(|error| error.to_string())?;
    if active {
        conn.execute(
            "INSERT INTO settings (key,value) VALUES ('active_bank',?1)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            rusqlite::params![id],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn read_bank_counts(path: &Path) -> Result<(i64, i64, i64, i64), String> {
    if !path.exists() {
        return Err(format!("题库数据库不存在：{}", path.display()));
    }
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;
    let questions: i64 = conn
        .query_row("SELECT COUNT(*) FROM questions", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let papers: i64 = conn
        .query_row("SELECT COUNT(*) FROM papers", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let images: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(has_image),0) FROM questions",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let review: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM questions WHERE status='review'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    Ok((questions, papers, images, review))
}

pub fn bank_conn(path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())
}

pub fn ensure_active_bank(conn: &Connection) -> Result<BankDto, String> {
    let id: Option<String> = conn
        .query_row(
            "SELECT id FROM banks WHERE active=1 ORDER BY imported_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();
    let id = match id {
        Some(id) => id,
        None => {
            let id: Option<String> = conn
                .query_row("SELECT id FROM banks ORDER BY imported_at DESC LIMIT 1", [], |row| {
                    row.get(0)
                })
                .ok();
            let Some(id) = id else {
                return Err("还没有题库。请先导入题库。".to_string());
            };
            conn.execute("UPDATE banks SET active = CASE WHEN id=?1 THEN 1 ELSE 0 END", rusqlite::params![id])
                .map_err(|error| error.to_string())?;
            id
        }
    };
    bank_by_id(conn, &id)
}

pub fn bank_by_id(conn: &Connection, id: &str) -> Result<BankDto, String> {
    conn.query_row(
        "SELECT id,title,path,source_root,imported_at,question_count,paper_count,image_count,review_count,active
         FROM banks WHERE id=?1",
        rusqlite::params![id],
        |row| {
            Ok(BankDto {
                id: row.get(0)?,
                title: row.get(1)?,
                path: row.get(2)?,
                source_root: row.get(3)?,
                imported_at: row.get(4)?,
                question_count: row.get(5)?,
                paper_count: row.get(6)?,
                image_count: row.get(7)?,
                review_count: row.get(8)?,
                active: row.get::<_, i64>(9)? == 1,
            })
        },
    )
    .map_err(|error| error.to_string())
}

pub fn list_banks(conn: &Connection) -> Result<Vec<BankDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id,title,path,source_root,imported_at,question_count,paper_count,image_count,review_count,active
             FROM banks ORDER BY active DESC, imported_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(BankDto {
                id: row.get(0)?,
                title: row.get(1)?,
                path: row.get(2)?,
                source_root: row.get(3)?,
                imported_at: row.get(4)?,
                question_count: row.get(5)?,
                paper_count: row.get(6)?,
                image_count: row.get(7)?,
                review_count: row.get(8)?,
                active: row.get::<_, i64>(9)? == 1,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn set_active_bank(conn: &Connection, id: &str) -> Result<(), String> {
    let exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM banks WHERE id=?1", rusqlite::params![id], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    if exists == 0 {
        return Err("题库不存在".to_string());
    }
    conn.execute("UPDATE banks SET active = CASE WHEN id=?1 THEN 1 ELSE 0 END", rusqlite::params![id])
        .map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO settings (key,value) VALUES ('active_bank',?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        rusqlite::params![id],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn asset_dir(bank: &BankDto) -> PathBuf {
    let path = PathBuf::from(&bank.path);
    let dir = if bank.id == "default" {
        path.parent().unwrap_or(Path::new(".")).join("assets")
    } else {
        path.with_extension("assets")
    };
    match dir.canonicalize() {
        Ok(canonical) => {
            let text = canonical.to_string_lossy();
            PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
        }
        Err(_) => dir,
    }
}

pub fn question_from_row(row: &Row<'_>) -> rusqlite::Result<QuestionDto> {
    let options_json: String = row.get(9)?;
    let answer_text: String = row.get(10)?;
    let status: String = row.get(14)?;
    let explanation_answer: Option<String> = row.get(15)?;
    let answer: Vec<String> = answer_text
        .split(',')
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect();
    let year: String = row.get(4)?;
    let region: String = row.get(5)?;
    Ok(QuestionDto {
        id: row.get(0)?,
        qid: row.get(1)?,
        module: row.get(2)?,
        kind: row.get(3)?,
        source: format!("{} {}", year, region),
        paper_title: row.get(6)?,
        paper_key: row.get(7)?,
        stem: row.get(8)?,
        options: serde_json::from_str(&options_json).unwrap_or_default(),
        multi: answer.len() > 1,
        answer: answer.clone(),
        explanation: row.get(11)?,
        material_title: row.get(12)?,
        material_content: row.get(13)?,
        review: if status == "review" {
            Some(ReviewDto {
                explanation_answer,
                missing: answer.is_empty(),
            })
        } else {
            None
        },
        has_image: row.get::<_, i64>(16)? == 1,
    })
}

pub const QUESTION_COLUMNS: &str =
    "q.id, q.qid, q.module, q.type, p.year, p.region, q.paper, q.paper_key, q.stem, q.options,
     q.answer, q.explanation, q.material_title, q.material_content, q.status, q.explanation_answer, q.has_image";
