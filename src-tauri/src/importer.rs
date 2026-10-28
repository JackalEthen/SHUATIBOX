use crate::db::{asset_dir, bank_by_id, base_dir, open_user, register_bank};
use crate::models::{ImportProgress, ImportSummary};
use regex::Regex;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[derive(Clone)]
struct Issue {
    level: &'static str,
    code: String,
    file: String,
    line: usize,
    message: String,
}

#[derive(Clone)]
struct ParsedOption {
    label: String,
    text: String,
    checked: bool,
}

#[derive(Clone)]
struct ParsedQuestion {
    id: String,
    qid: String,
    qid_source: String,
    paper_key: String,
    paper: String,
    module: String,
    number: usize,
    kind: String,
    is_judgment: bool,
    stem: String,
    options: Vec<ParsedOption>,
    answer: Vec<String>,
    answer_raw: String,
    explanation: String,
    material_number: Option<usize>,
    material_key: Option<String>,
    line: usize,
    status: String,
    can_grade: bool,
    answer_conflict: bool,
    explanation_answer: Option<String>,
    issues: Vec<Issue>,
}

struct ParsedMaterial {
    key: String,
    number: usize,
    content: String,
    line: usize,
}

struct ParsedFile {
    #[allow(dead_code)]
    file: String,
    skipped: bool,
    paper: String,
    paper_key: String,
    module: String,
    year: String,
    region: String,
    exam_type: String,
    questions: Vec<ParsedQuestion>,
    materials: Vec<ParsedMaterial>,
    issues: Vec<Issue>,
    has_file_error: bool,
}

#[derive(Clone)]
struct QuestionState {
    number: usize,
    line: usize,
    qid: Option<String>,
    kind: String,
    stem: Vec<String>,
    options: Vec<ParsedOption>,
    placeholder: bool,
    answer_raw: Option<String>,
    answer_line: Option<usize>,
    first_option_line: Option<usize>,
    explanation: Vec<String>,
    saw_answer: bool,
    content_after_options: bool,
    material_number: Option<usize>,
    issues: Vec<Issue>,
}

struct MaterialState {
    number: usize,
    line: usize,
    content: Vec<String>,
    q_count: usize,
}

struct ImageResult {
    text: String,
    has_image: bool,
    missing: bool,
}

struct ImageStore<'a> {
    root: &'a Path,
    assets: &'a Path,
    images: HashSet<String>,
    missing: usize,
}

fn re(pattern: &'static str) -> Regex {
    static CACHE: OnceLock<std::sync::Mutex<HashMap<&'static str, Regex>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()));
    let mut guard = cache.lock().unwrap();
    if let Some(value) = guard.get(pattern) {
        return value.clone();
    }
    let value = Regex::new(pattern).unwrap();
    guard.insert(pattern, value.clone());
    value
}

fn strip_quotes(value: &str) -> String {
    let value = value.trim();
    if value.len() >= 2 {
        let bytes = value.as_bytes();
        if (bytes[0] == b'"' && bytes[value.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[value.len() - 1] == b'\'')
        {
            return value[1..value.len() - 1].to_string();
        }
    }
    value.to_string()
}

fn fnv32(value: &str) -> String {
    let mut hash: u32 = 2166136261;
    for ch in value.chars() {
        hash ^= ch as u32;
        hash = hash.wrapping_mul(16777619);
    }
    format!("{hash:x}")
}

pub(crate) fn derive_exam_type(paper: &str, explicit: &str) -> String {
    if !explicit.is_empty() {
        return explicit.to_string();
    }
    if paper.contains("国家公务员") || paper.contains("国考") {
        return "国考".to_string();
    }
    if paper.contains("选调") {
        return "选调".to_string();
    }
    if paper.contains("事业单位") || paper.contains("综合知识") || paper.contains("公共基础知识") {
        return "事业单位".to_string();
    }
    if paper.contains("公务员") || paper.contains("联考") || paper.contains("省考") {
        return "省考".to_string();
    }
    "其他".to_string()
}

fn answer_chars(raw: &str) -> Vec<String> {
    let mut result: Vec<String> = raw
        .chars()
        .filter(|ch| !ch.is_whitespace() && !"，,、/".contains(*ch))
        .flat_map(|ch| ch.to_uppercase())
        .filter(|ch| ('A'..='H').contains(ch))
        .map(|ch| ch.to_string())
        .collect();
    result.sort();
    result.dedup();
    result
}

fn explanation_answer(explanation: &str) -> Option<String> {
    let pattern = re(r"故正确答案为\s*([A-H](?:[、,，\s]*[A-H])*)");
    let mut found = None;
    for capture in pattern.captures_iter(explanation) {
        found = Some(capture.get(1).map(|value| value.as_str()).unwrap_or("").to_string());
    }
    found.map(|value| answer_chars(&value).join("")).filter(|value| !value.is_empty())
}

fn explanation_judgment(explanation: &str) -> Option<String> {
    let pattern = re(r"故(?:题干)?表述(正确|错误)");
    let mut found = None;
    for capture in pattern.captures_iter(explanation) {
        found = capture.get(1).map(|value| value.as_str().to_string());
    }
    found.map(|value| if value == "正确" { "A".to_string() } else { "B".to_string() })
}

pub(crate) fn parse_meta(text: &str) -> Result<(HashMap<String, String>, String, usize), String> {
    let lines: Vec<&str> = text.lines().collect();
    if lines.first().map(|line| line.trim()) != Some("---") {
        return Ok((HashMap::new(), text.to_string(), 1));
    }
    let mut end = None;
    for (index, line) in lines.iter().enumerate().skip(1) {
        if line.trim() == "---" {
            end = Some(index);
            break;
        }
    }
    let Some(end) = end else {
        return Err("frontmatter 没有结束标记 ---".to_string());
    };
    let mut meta = HashMap::new();
    let key_re = re(r"^([^:]+):(.*)$");
    for line in &lines[1..end] {
        if line.trim().is_empty() || line.trim().starts_with('#') {
            continue;
        }
        if let Some(capture) = key_re.captures(line) {
            let key = capture.get(1).map(|value| value.as_str().trim()).unwrap_or("");
            if !key.is_empty() {
                meta.insert(key.to_string(), strip_quotes(capture.get(2).map(|value| value.as_str()).unwrap_or("")));
            }
        }
    }
    Ok((meta, lines[end + 1..].join("\n"), end + 2))
}

fn parse_heading_suffix(suffix: &str) -> Result<(Option<String>, String), String> {
    let rest = suffix.trim();
    if rest.is_empty() {
        return Ok((None, String::new()));
    }
    if let Some(value) = rest.strip_prefix('·') {
        return Ok((None, value.trim().to_string()));
    }
    if !rest.starts_with("<sub>") || !rest.ends_with("</sub>") {
        return Err(format!("题目标题后缀无法识别：{rest}"));
    }
    let inner = rest[5..rest.len() - 6].trim();
    if inner.is_empty() {
        return Ok((None, String::new()));
    }
    let qid_re = re(r"^qid\s+(\S+)(.*)$");
    if let Some(capture) = qid_re.captures(inner) {
        let qid = capture.get(1).map(|value| value.as_str()).unwrap_or("").to_string();
        let tail = capture.get(2).map(|value| value.as_str().trim()).unwrap_or("");
        if !tail.is_empty() && !tail.starts_with('·') {
            return Err(format!("qid 后有多余内容：{tail}"));
        }
        let kind = tail.strip_prefix('·').unwrap_or("").trim().to_string();
        return Ok((Some(qid), kind));
    }
    Ok((None, inner.to_string()))
}

fn module_from_path(rel: &str) -> String {
    rel.split('/')
        .next()
        .unwrap_or("")
        .split_once('-')
        .map(|(_, name)| name.to_string())
        .unwrap_or_else(|| rel.split('/').next().unwrap_or("").to_string())
}

fn parse_file(text: &str, file: &str, module_from_dir: &str) -> ParsedFile {
    let clean = text.trim_start_matches('\u{feff}');
    let (meta, body, body_start) = match parse_meta(clean) {
        Ok(value) => value,
        Err(error) => {
            return ParsedFile {
                file: file.to_string(),
                skipped: false,
                paper: String::new(),
                paper_key: String::new(),
                module: module_from_dir.to_string(),
                year: String::new(),
                region: String::new(),
                exam_type: String::new(),
                questions: Vec::new(),
                materials: Vec::new(),
                issues: vec![Issue {
                    level: "file",
                    code: "frontmatter".to_string(),
                    file: file.to_string(),
                    line: 1,
                    message: error,
                }],
                has_file_error: true,
            };
        }
    };
    let mut issues = Vec::new();
    let file_issue = |issues: &mut Vec<Issue>, code: &str, line: usize, message: String| {
        issues.push(Issue {
            level: "file",
            code: code.to_string(),
            file: file.to_string(),
            line,
            message,
        });
    };
    if meta.get("类型").map(|value| value.as_str()) == Some("模块索引") {
        return ParsedFile {
            file: file.to_string(),
            skipped: true,
            paper: meta.get("试卷").cloned().unwrap_or_default(),
            paper_key: String::new(),
            module: meta.get("模块").cloned().unwrap_or_else(|| module_from_dir.to_string()),
            year: String::new(),
            region: String::new(),
            exam_type: String::new(),
            questions: Vec::new(),
            materials: Vec::new(),
            issues,
            has_file_error: false,
        };
    }
    let paper = meta.get("试卷").cloned().unwrap_or_default();
    let module = meta
        .get("模块")
        .cloned()
        .unwrap_or_else(|| module_from_dir.to_string());
    let mut year = meta.get("年份").cloned().unwrap_or_default();
    let region = meta.get("地区").cloned().unwrap_or_default();
    let exam_type = derive_exam_type(&paper, meta.get("考试类型").map(|value| value.as_str()).unwrap_or(""));
    if paper.is_empty() {
        file_issue(&mut issues, "paper-missing", 1, "缺少 试卷 字段".to_string());
    }
    if module.is_empty() {
        file_issue(&mut issues, "module-missing", 1, "缺少 模块 字段，且无法从目录推导".to_string());
    }
    if !year.is_empty() && (year.len() != 4 || !year.chars().all(|ch| ch.is_ascii_digit())) {
        issues.push(Issue {
            level: "warning",
            code: "year-invalid".to_string(),
            file: file.to_string(),
            line: 1,
            message: format!("年份 不是 4 位数字：{year}"),
        });
        year.clear();
    }
    let paper_key = [paper.clone(), year.clone(), region.clone()]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("|");
    let lines: Vec<&str> = body.lines().collect();
    let mut questions: Vec<ParsedQuestion> = Vec::new();
    let mut materials: Vec<ParsedMaterial> = Vec::new();
    let mut material_numbers = HashSet::new();
    let mut question_numbers = HashSet::new();
    let mut current_question: Option<QuestionState> = None;
    let mut current_material: Option<MaterialState> = None;
    let mut first_question_seen = false;
    let mut content_started = false;
    let mut h1_seen = false;
    let mut outside_content = 0usize;
    let mut in_fence = false;

    let question_re = re(r"^(##|###)[ \t]+第[ \t]*(\d+)[ \t]*题(.*)$");
    let material_re = re(r"^##[ \t]+材料[ \t]*(\d+)[ \t]*$");
    let option_re = re(r"^\s*-\s+\*\*([A-H])\*\*\s*[.．、]\s*(.*?)\s*$");
    let placeholder_re = re(r"^\s*-\s*（选项）\[\]\s*$");
    let answer_re = re(r"^\*\*答案\*\*\s*[：:]\s*(.*?)\s*$");
    let explain_re = re(r"^\*\*(官方解析|解析)\*\*\s*$");
    let checked_re = re(r"(?:[\s\u{3000}]*✅)+\s*$");
    let qid_re = re(r"^[A-Za-z0-9_-]{1,64}$");

    let close_material = |issues: &mut Vec<Issue>, material: &mut Option<MaterialState>, materials: &mut Vec<ParsedMaterial>| {
        if let Some(state) = material.take() {
            if state.q_count == 0 {
                issues.push(Issue {
                    level: "file",
                    code: "empty-material".to_string(),
                    file: file.to_string(),
                    line: state.line,
                    message: format!("材料 {} 没有小题", state.number),
                });
            } else {
                materials.push(ParsedMaterial {
                    key: format!("{paper_key}|{module}|{}", state.number),
                    number: state.number,
                    content: state.content.join("\n").trim().to_string(),
                    line: state.line,
                });
            }
        }
    };

    let finalize = |state: QuestionState, questions: &mut Vec<ParsedQuestion>| {
        let mut question_issues = state.issues.clone();
        let mut invalid = question_issues.iter().any(|issue| {
            matches!(
                issue.code.as_str(),
                "heading-suffix" | "explanation-before-answer" | "duplicate-answer" | "placeholder-with-options" | "no-options" | "option-count" | "option-labels" | "answer-duplicate" | "answer-not-in-options" | "answer-before-options" | "content-after-options" | "empty-stem" | "qid-invalid" | "empty-option"
            )
        });
        let mut review = false;
        let bad = |code: &str, message: String, issues: &mut Vec<Issue>, invalid: &mut bool| {
            *invalid = true;
            issues.push(Issue {
                level: "question",
                code: code.to_string(),
                file: file.to_string(),
                line: state.line,
                message,
            });
        };
        let flag = |code: &str, message: String, issues: &mut Vec<Issue>, review: &mut bool| {
            *review = true;
            issues.push(Issue {
                level: "question",
                code: code.to_string(),
                file: file.to_string(),
                line: state.line,
                message,
            });
        };
        let warn = |code: &str, message: String, issues: &mut Vec<Issue>| {
            issues.push(Issue {
                level: "warning",
                code: code.to_string(),
                file: file.to_string(),
                line: state.line,
                message,
            });
        };

        let mut options = state.options.clone();
        while options.last().map(|option| option.text.trim().is_empty()).unwrap_or(false) {
            let dropped = options.pop().unwrap();
            warn("empty-option-dropped", format!("末尾空选项 {} 已丢弃", dropped.label), &mut question_issues);
        }
        for option in &options {
            if option.text.trim().is_empty() {
                bad("empty-option", format!("选项 {} 文本为空", option.label), &mut question_issues, &mut invalid);
            }
        }
        let answer_text = state.answer_raw.clone().unwrap_or_default();
        let normalized = answer_chars(&answer_text).join("");
        let answer_valid = !normalized.is_empty() && normalized.len() <= 8;
        let answer_letters = if answer_valid { answer_chars(&answer_text) } else { Vec::new() };
        let mut is_judgment = false;
        if state.placeholder && !options.is_empty() {
            bad("placeholder-with-options", "同时存在真实选项和 - （选项）[] 占位行".to_string(), &mut question_issues, &mut invalid);
        }
        if options.is_empty() {
            if state.placeholder {
                is_judgment = true;
                options.push(ParsedOption { label: "A".to_string(), text: "正确".to_string(), checked: false });
                options.push(ParsedOption { label: "B".to_string(), text: "错误".to_string(), checked: false });
            } else {
                bad("no-options", "没有选项，且不满足判断题条件".to_string(), &mut question_issues, &mut invalid);
            }
        }
        if !options.is_empty() {
            if options.len() < 2 || options.len() > 8 {
                bad("option-count", format!("选项数量必须是 2–8，实际 {}", options.len()), &mut question_issues, &mut invalid);
            }
            for (index, option) in options.iter().enumerate() {
                let expected = ((b'A' + index as u8) as char).to_string();
                if option.label != expected {
                    bad(
                        "option-labels",
                        format!("选项必须从 A 连续排列，第 {} 个应为 {}，实际 {}", index + 1, expected, option.label),
                        &mut question_issues,
                        &mut invalid,
                    );
                }
            }
        }
        if state.answer_raw.is_none() {
            flag("answer-missing", "缺少 **答案** 行，已导入但无法判分".to_string(), &mut question_issues, &mut review);
        } else if !answer_valid {
            flag("answer-invalid", format!("答案不是 A–H 字母：{answer_text}，已导入但无法判分"), &mut question_issues, &mut review);
        } else if answer_letters.len() != normalized.len() {
            bad("answer-duplicate", format!("答案包含重复字母：{answer_text}"), &mut question_issues, &mut invalid);
        } else if !options.is_empty() {
            let labels: HashSet<&str> = options.iter().map(|option| option.label.as_str()).collect();
            for letter in &answer_letters {
                if !labels.contains(letter.as_str()) {
                    bad("answer-not-in-options", format!("答案 {letter} 不在选项中"), &mut question_issues, &mut invalid);
                }
            }
        }
        if let (Some(first), Some(answer_line)) = (state.first_option_line, state.answer_line) {
            if answer_line < first && !is_judgment {
                bad("answer-before-options", "答案出现在选项之前".to_string(), &mut question_issues, &mut invalid);
            }
        }
        let mut answer_conflict = false;
        let mut explanation_final = None;
        let checked: Vec<String> = {
            let mut labels: Vec<String> = options.iter().filter(|option| option.checked).map(|option| option.label.clone()).collect();
            labels.sort();
            labels.dedup();
            labels
        };
        if !checked.is_empty() && checked.join("") != answer_letters.join("") {
            answer_conflict = true;
            flag(
                "check-mismatch",
                format!("✅ 标记 {} 与答案 {} 不一致", checked.join(""), answer_letters.join("")),
                &mut question_issues,
                &mut review,
            );
        }
        if state.content_after_options {
            bad("content-after-options", "选项与答案之间存在无法识别的内容".to_string(), &mut question_issues, &mut invalid);
        }
        let explanation = state.explanation.join("\n").trim().to_string();
        if !answer_letters.is_empty() {
            if let Some(final_answer) = explanation_answer(&explanation) {
                if final_answer != answer_letters.join("") {
                    answer_conflict = true;
                    explanation_final = Some(final_answer.clone());
                    flag(
                        "explanation-conflict",
                        format!("解析最终答案 {final_answer} 与答案 {} 不一致", answer_letters.join("")),
                        &mut question_issues,
                        &mut review,
                    );
                }
            }
            if is_judgment {
                if let Some(judgment) = explanation_judgment(&explanation) {
                    if judgment != answer_letters.join("") {
                        answer_conflict = true;
                        explanation_final = Some(judgment.clone());
                        flag(
                            "explanation-conflict",
                            format!("解析判定 {judgment} 与答案 {} 不一致", answer_letters.join("")),
                            &mut question_issues,
                            &mut review,
                        );
                    }
                }
            }
        }
        let stem = state.stem.join("\n").trim().to_string();
        if stem.is_empty() {
            bad("empty-stem", "题干为空".to_string(), &mut question_issues, &mut invalid);
        }
        if explanation.is_empty() {
            warn("missing-explanation", "缺少解析".to_string(), &mut question_issues);
        }
        let mut qid = state.qid.clone().unwrap_or_default();
        if !qid.is_empty() && !qid_re.is_match(&qid) {
            bad("qid-invalid", format!("qid 不合法：{qid}"), &mut question_issues, &mut invalid);
            qid.clear();
        }
        let qid_source = if qid.is_empty() {
            qid = format!("auto-{}", fnv32(&format!("{paper_key}|{module}|{}", state.number)));
            "auto".to_string()
        } else {
            "source".to_string()
        };
        let material_number = state.material_number;
        let status = if invalid {
            "invalid"
        } else if review {
            "review"
        } else {
            "ok"
        };
        let can_grade = status != "invalid" && !answer_letters.is_empty();
        questions.push(ParsedQuestion {
            id: format!("{paper_key}|{module}|{qid}"),
            qid,
            qid_source,
            paper_key: paper_key.clone(),
            paper: paper.clone(),
            module: module.clone(),
            number: state.number,
            kind: if state.kind.is_empty() { "未分类".to_string() } else { state.kind },
            is_judgment,
            stem,
            options,
            answer: answer_letters,
            answer_raw: answer_text,
            explanation,
            material_number,
            material_key: material_number.map(|number| format!("{paper_key}|{module}|{number}")),
            line: state.line,
            status: status.to_string(),
            can_grade,
            answer_conflict,
            explanation_answer: explanation_final,
            issues: question_issues,
        });
    };

    let append_content = |line: &str,
                          current_question: &mut Option<QuestionState>,
                          current_material: &mut Option<MaterialState>,
                          outside_content: &mut usize| {
        if let Some(question) = current_question {
            if question.saw_answer {
                question.explanation.push(line.to_string());
            } else if !question.options.is_empty() {
                if !line.trim().is_empty() {
                    question.content_after_options = true;
                }
            } else {
                question.stem.push(line.to_string());
            }
            return;
        }
        if let Some(material) = current_material {
            if material.q_count == 0 {
                material.content.push(line.to_string());
                return;
            }
        }
        if !line.trim().is_empty() {
            *outside_content += 1;
        }
    };

    for (index, line) in lines.iter().enumerate() {
        let line_no = body_start + index;
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            append_content(line, &mut current_question, &mut current_material, &mut outside_content);
            continue;
        }
        if in_fence {
            append_content(line, &mut current_question, &mut current_material, &mut outside_content);
            continue;
        }
        if trimmed == "---" {
            if let Some(state) = current_question.take() {
                finalize(state, &mut questions);
            }
            continue;
        }
        if current_question.is_none()
            && current_material.is_none()
            && !first_question_seen
            && line.trim_start().starts_with('>')
        {
            continue;
        }
        if let Some(capture) = material_re.captures(line) {
            if let Some(state) = current_question.take() {
                finalize(state, &mut questions);
            }
            close_material(&mut issues, &mut current_material, &mut materials);
            let number: usize = capture.get(1).map(|value| value.as_str()).unwrap_or("0").parse().unwrap_or(0);
            content_started = true;
            if number < 1 {
                file_issue(&mut issues, "material-number", line_no, format!("材料编号必须为正整数：{number}"));
            }
            if !material_numbers.insert(number) {
                file_issue(&mut issues, "duplicate-material", line_no, format!("材料编号重复：{number}"));
            }
            current_material = Some(MaterialState { number, line: line_no, content: Vec::new(), q_count: 0 });
            continue;
        }
        if let Some(capture) = question_re.captures(line) {
            if let Some(state) = current_question.take() {
                finalize(state, &mut questions);
            }
            let level = capture.get(1).map(|value| value.as_str()).unwrap_or("##");
            let number: usize = capture.get(2).map(|value| value.as_str()).unwrap_or("0").parse().unwrap_or(0);
            let suffix = capture.get(3).map(|value| value.as_str()).unwrap_or("");
            let (qid, kind, suffix_error) = match parse_heading_suffix(suffix) {
                Ok((qid, kind)) => (qid, kind, None),
                Err(error) => (None, String::new(), Some(error)),
            };
            content_started = true;
            first_question_seen = true;
            let material_number = current_material.as_ref().map(|material| material.number);
            if level == "##" {
                close_material(&mut issues, &mut current_material, &mut materials);
            } else if material_number.is_none() {
                file_issue(&mut issues, "h3-outside-material", line_no, "### 小题只能出现在 ## 材料 N 内".to_string());
            }
            if number < 1 {
                file_issue(&mut issues, "question-number", line_no, format!("题号必须为正整数：{number}"));
            }
            if !question_numbers.insert(number) {
                file_issue(&mut issues, "duplicate-number", line_no, format!("题号重复：{number}"));
            }
            let mut state = QuestionState {
                number,
                line: line_no,
                qid,
                kind,
                stem: Vec::new(),
                options: Vec::new(),
                placeholder: false,
                answer_raw: None,
                answer_line: None,
                first_option_line: None,
                explanation: Vec::new(),
                saw_answer: false,
                content_after_options: false,
                material_number: if level == "###" { material_number } else { None },
                issues: Vec::new(),
            };
            if let Some(error) = suffix_error {
                state.issues.push(Issue {
                    level: "question",
                    code: "heading-suffix".to_string(),
                    file: file.to_string(),
                    line: line_no,
                    message: error,
                });
            }
            if level == "###" {
                if let Some(material) = &mut current_material {
                    material.q_count += 1;
                }
            }
            current_question = Some(state);
            continue;
        }
        if line.starts_with("# ") {
            if first_question_seen || content_started || h1_seen {
                file_issue(&mut issues, "h1-after-content", line_no, "一级标题只能出现一次且在所有题目之前".to_string());
            } else {
                h1_seen = true;
            }
            continue;
        }
        if line.starts_with("## ") {
            file_issue(&mut issues, "unknown-heading", line_no, format!("无法识别的二级标题：{}", trimmed.chars().take(60).collect::<String>()));
            continue;
        }
        if line.starts_with("### ") {
            file_issue(&mut issues, "unknown-heading", line_no, format!("无法识别的三级标题：{}", trimmed.chars().take(60).collect::<String>()));
            continue;
        }
        if let Some(question) = &mut current_question {
            if !question.saw_answer {
                if let Some(capture) = option_re.captures(line) {
                    if question.options.is_empty() {
                        question.first_option_line = Some(line_no);
                    }
                    let raw_text = capture.get(2).map(|value| value.as_str()).unwrap_or("");
                    let checked = checked_re.is_match(raw_text);
                    let text = checked_re.replace(raw_text, "").trim().to_string();
                    question.options.push(ParsedOption {
                        label: capture.get(1).map(|value| value.as_str()).unwrap_or("").to_string(),
                        text,
                        checked,
                    });
                    continue;
                }
                if placeholder_re.is_match(line) {
                    if !question.options.is_empty() {
                        question.issues.push(Issue {
                            level: "question",
                            code: "placeholder-with-options".to_string(),
                            file: file.to_string(),
                            line: line_no,
                            message: "占位行出现在真实选项之后".to_string(),
                        });
                    }
                    question.placeholder = true;
                    continue;
                }
                if let Some(capture) = answer_re.captures(line) {
                    question.answer_raw = Some(capture.get(1).map(|value| value.as_str()).unwrap_or("").to_string());
                    question.answer_line = Some(line_no);
                    question.saw_answer = true;
                    continue;
                }
                if explain_re.is_match(line) {
                    question.issues.push(Issue {
                        level: "question",
                        code: "explanation-before-answer".to_string(),
                        file: file.to_string(),
                        line: line_no,
                        message: "解析出现在答案之前".to_string(),
                    });
                    continue;
                }
            } else {
                if answer_re.is_match(line) {
                    question.issues.push(Issue {
                        level: "question",
                        code: "duplicate-answer".to_string(),
                        file: file.to_string(),
                        line: line_no,
                        message: "出现第二条 **答案** 行".to_string(),
                    });
                    question.explanation.push(line.to_string());
                    continue;
                }
                if option_re.is_match(line) {
                    question.issues.push(Issue {
                        level: "warning",
                        code: "option-after-answer".to_string(),
                        file: file.to_string(),
                        line: line_no,
                        message: "答案之后出现选项样式的行".to_string(),
                    });
                    question.explanation.push(line.to_string());
                    continue;
                }
                if explain_re.is_match(line) {
                    continue;
                }
            }
        }
        append_content(line, &mut current_question, &mut current_material, &mut outside_content);
    }
    if let Some(state) = current_question.take() {
        finalize(state, &mut questions);
    }
    close_material(&mut issues, &mut current_material, &mut materials);

    let mut by_qid: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, question) in questions.iter().enumerate() {
        if question.qid_source == "source" {
            by_qid.entry(question.qid.clone()).or_default().push(index);
        }
    }
    for (qid, indexes) in by_qid {
        if indexes.len() < 2 {
            continue;
        }
        for index in indexes {
            let question = &mut questions[index];
            question.status = "invalid".to_string();
            question.can_grade = false;
            question.issues.push(Issue {
                level: "question",
                code: "qid-duplicate".to_string(),
                file: file.to_string(),
                line: question.line,
                message: format!("同一文件内 qid 重复：{qid}"),
            });
        }
    }
    for pair in questions.windows(2) {
        if pair[1].number != pair[0].number + 1 {
            issues.push(Issue {
                level: "warning",
                code: "number-gap".to_string(),
                file: file.to_string(),
                line: pair[1].line,
                message: format!("题号不连续：{} → {}", pair[0].number, pair[1].number),
            });
        }
    }
    if let Some(declared) = meta.get("题数").filter(|value| !value.is_empty()) {
        match declared.parse::<usize>() {
            Ok(count) if count == questions.len() => {}
            Ok(count) => file_issue(&mut issues, "count-mismatch", 1, format!("题数 声明 {count}，实际解析 {} 道标题", questions.len())),
            Err(_) => issues.push(Issue {
                level: "warning",
                code: "count-invalid".to_string(),
                file: file.to_string(),
                line: 1,
                message: format!("题数 不是非负整数：{declared}"),
            }),
        }
    }
    if questions.is_empty() {
        file_issue(&mut issues, "empty-file", 1, "非索引文件没有题目".to_string());
    }
    if outside_content > 0 {
        issues.push(Issue {
            level: "warning",
            code: "outside-content".to_string(),
            file: file.to_string(),
            line: 1,
            message: format!("题目之外有 {outside_content} 行内容被忽略"),
        });
    }
    let has_file_error = issues.iter().any(|issue| issue.level == "file");
    ParsedFile {
        file: file.to_string(),
        skipped: false,
        paper,
        paper_key,
        module,
        year,
        region,
        exam_type,
        questions,
        materials,
        issues,
        has_file_error,
    }
}

// ponytail: AI 转换只读探测，避免把 parser 内部结构全量 pub
pub(crate) struct FileProbe {
    pub skipped: bool,
    pub has_file_error: bool,
    pub paper: String,
    pub module: String,
    pub year: String,
    pub region: String,
    pub exam_type: String,
    pub invalid: usize,
    pub numbers: Vec<usize>,
    pub stems: Vec<String>,
    pub issue_text: Vec<String>,
}

pub(crate) fn probe_file(text: &str, rel: &str) -> FileProbe {
    let parsed = parse_file(text, rel, &module_from_path(rel));
    let ok: Vec<&ParsedQuestion> = parsed
        .questions
        .iter()
        .filter(|question| question.status != "invalid")
        .collect();
    FileProbe {
        skipped: parsed.skipped,
        has_file_error: parsed.has_file_error,
        paper: parsed.paper,
        module: parsed.module,
        year: parsed.year,
        region: parsed.region,
        exam_type: parsed.exam_type,
        invalid: parsed.questions.len() - ok.len(),
        numbers: ok.iter().map(|question| question.number).collect(),
        stems: ok.iter().map(|question| question.stem.clone()).collect(),
        issue_text: parsed
            .issues
            .iter()
            .filter(|issue| issue.level != "warning")
            .map(|issue| format!("{}:{} {}", issue.file, issue.line, issue.message))
            .collect(),
    }
}

pub(crate) fn walk_markdown(root: &Path) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().map(|value| value == "md").unwrap_or(false) {
                result.push(path);
            }
        }
    }
    result.sort();
    result
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn allowed_ext(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
    if ["png", "jpg", "jpeg", "jfif", "gif", "webp"].contains(&ext.as_str()) {
        Some(if ext == "jfif" { "jpg".to_string() } else { ext })
    } else {
        None
    }
}

impl<'a> ImageStore<'a> {
    fn process(&mut self, text: &str, md_path: &Path) -> ImageResult {
        let mut has_image = false;
        let mut missing = false;
        let img_re = re(r#"(?is)<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#);
        let markdown_re = re(r#"!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#);
        let mut output = String::with_capacity(text.len());
        let mut last = 0usize;
        for captures in img_re.captures_iter(text) {
            let Some(whole) = captures.get(0) else { continue };
            let src = captures.get(1).or_else(|| captures.get(2)).or_else(|| captures.get(3));
            let Some(src) = src else { continue };
            has_image = true;
            output.push_str(&text[last..whole.start()]);
            let (replacement, was_missing) = self.resolve(src.as_str(), md_path);
            if was_missing {
                missing = true;
            }
            let value = whole.as_str();
            let new_value = if let Some(start) = value.find("src") {
                let after = &value[start..];
                if let Some(quote_start) = after.find('"') {
                    let quote_end = after[quote_start + 1..].find('"').map(|value| quote_start + 1 + value);
                    if let Some(quote_end) = quote_end {
                        format!("{}{}{}", &value[..start + quote_start + 1], replacement, &after[quote_end..])
                    } else {
                        value.to_string()
                    }
                } else if let Some(quote_start) = after.find('\'') {
                    let quote_end = after[quote_start + 1..].find('\'').map(|value| quote_start + 1 + value);
                    if let Some(quote_end) = quote_end {
                        format!("{}{}{}", &value[..start + quote_start + 1], replacement, &after[quote_end..])
                    } else {
                        value.to_string()
                    }
                } else {
                    value.to_string()
                }
            } else {
                value.to_string()
            };
            output.push_str(&new_value);
            last = whole.end();
        }
        output.push_str(&text[last..]);
        let text = output;
        let mut output = String::with_capacity(text.len());
        last = 0usize;
        for captures in markdown_re.captures_iter(&text) {
            let Some(whole) = captures.get(0) else { continue };
            let Some(src) = captures.get(2) else { continue };
            has_image = true;
            output.push_str(&text[last..whole.start()]);
            let (replacement, was_missing) = self.resolve(src.as_str(), md_path);
            if was_missing {
                missing = true;
            }
            let alt = captures.get(1).map(|value| value.as_str()).unwrap_or("");
            output.push_str(&format!("![{alt}]({replacement})"));
            last = whole.end();
        }
        output.push_str(&text[last..]);
        ImageResult {
            text: output,
            has_image,
            missing,
        }
    }

    fn resolve(&mut self, src: &str, md_path: &Path) -> (String, bool) {
        let clean = src
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .replace("&amp;", "&")
            .replace("%20", " ");
        if clean.is_empty()
            || clean.starts_with("http://")
            || clean.starts_with("https://")
            || clean.starts_with("data:")
            || clean.starts_with("//")
            || clean.starts_with('/')
            || clean.starts_with("asset:")
        {
            return (clean, false);
        }
        let path = md_path.parent().unwrap_or(Path::new(".")).join(&clean);
        let Ok(canonical) = path.canonicalize() else {
            self.missing += 1;
            return (format!("missing:{clean}"), true);
        };
        if !canonical.starts_with(self.root) {
            self.missing += 1;
            return (format!("missing:{clean}"), true);
        }
        let Some(ext) = allowed_ext(&canonical) else {
            self.missing += 1;
            return (format!("missing:{clean}"), true);
        };
        let Ok(bytes) = fs::read(&canonical) else {
            self.missing += 1;
            return (format!("missing:{clean}"), true);
        };
        let hash = hex(&Sha256::digest(&bytes));
        let name = format!("{hash}.{ext}");
        if self.images.insert(name.clone()) {
            let _ = fs::create_dir_all(self.assets);
            let _ = fs::write(self.assets.join(&name), bytes);
        }
        (format!("asset:{name}"), false)
    }
}

pub(crate) fn extract_zip(zip_path: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    let file = File::open(zip_path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(relative) = entry.enclosed_name() else { continue };
        let out = target.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut output = File::create(&out).map_err(|error| error.to_string())?;
        std::io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn make_temp_dir(base: &Path, tag: &str) -> Result<PathBuf, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    let path = base.join("import-tmp").join(format!("{tag}-{nanos}"));
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

const BANK_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS papers (
      key TEXT PRIMARY KEY, title TEXT NOT NULL, year TEXT NOT NULL, region TEXT NOT NULL,
      exam_type TEXT NOT NULL, question_count INTEGER NOT NULL, module_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS materials (
      key TEXT PRIMARY KEY, paper_key TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
      source_file TEXT NOT NULL, line INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY, paper_key TEXT NOT NULL, paper TEXT NOT NULL, module TEXT NOT NULL,
      number INTEGER NOT NULL, qid TEXT NOT NULL, qid_source TEXT NOT NULL, type TEXT NOT NULL,
      is_judgment INTEGER NOT NULL, stem TEXT NOT NULL, options TEXT NOT NULL, answer TEXT NOT NULL,
      answer_raw TEXT NOT NULL, explanation TEXT NOT NULL, material_key TEXT, material_title TEXT,
      material_content TEXT, status TEXT NOT NULL, can_grade INTEGER NOT NULL,
      answer_conflict INTEGER NOT NULL, explanation_answer TEXT, has_image INTEGER NOT NULL,
      image_missing INTEGER NOT NULL DEFAULT 0, source_file TEXT NOT NULL, source_line INTEGER NOT NULL
    );
    ";

const REFRESH_COUNTS_SQL: &str = "UPDATE papers SET
       question_count=(SELECT COUNT(*) FROM questions WHERE questions.paper_key=papers.key),
       module_count=(SELECT COUNT(DISTINCT module) FROM questions WHERE questions.paper_key=papers.key);";

pub fn import_bank(
    app: &tauri::AppHandle,
    input: &str,
    set_active: bool,
) -> Result<ImportSummary, String> {
    import_bank_ex(app, input, None, None, set_active, false)
}

pub fn import_into_bank(
    app: &tauri::AppHandle,
    input: &str,
    bank_id: Option<String>,
    title: Option<String>,
    set_active: bool,
) -> Result<ImportSummary, String> {
    import_bank_ex(app, input, bank_id, title, set_active, true)
}

fn import_bank_ex(
    app: &tauri::AppHandle,
    input: &str,
    target_bank_id: Option<String>,
    title_hint: Option<String>,
    set_active: bool,
    append: bool,
) -> Result<ImportSummary, String> {
    let source = PathBuf::from(input);
    if !source.exists() {
        return Err("题库路径不存在".to_string());
    }
    let base = base_dir(app)?;
    let banks_dir = base.join("banks");
    fs::create_dir_all(&banks_dir).map_err(|error| error.to_string())?;
    let mut temp_zip = None;
    let root = if source.is_dir() {
        source.canonicalize().map_err(|error| error.to_string())?
    } else if source.extension().map(|value| value.eq_ignore_ascii_case("zip")).unwrap_or(false) {
        let dir = make_temp_dir(&base, "zip")?;
        extract_zip(&source, &dir)?;
        temp_zip = Some(dir.clone());
        dir.canonicalize().map_err(|error| error.to_string())?
    } else {
        return Err("请选择 Markdown 文件夹或 zip".to_string());
    };

    let existing_bank = match target_bank_id.as_deref() {
        Some(id) if append => {
            let user = open_user(app)?;
            Some(bank_by_id(&user, id)?)
        }
        _ => None,
    };
    let (bank_id, final_db, assets, existing_title, existing_source) = match &existing_bank {
        Some(bank) => (
            bank.id.clone(),
            PathBuf::from(&bank.path),
            asset_dir(bank),
            Some(bank.title.clone()),
            bank.source_root.clone(),
        ),
        None => {
            let bank_id = match target_bank_id {
                Some(id) => id,
                None if append => {
                    let nanos = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|value| value.as_nanos())
                        .unwrap_or(0);
                    let seed = format!("{}|{nanos}", title_hint.clone().unwrap_or_default());
                    format!("bank-{}", &hex(&Sha256::digest(seed.as_bytes()))[..12])
                }
                None => {
                    let id_hash = hex(&Sha256::digest(root.to_string_lossy().as_bytes()));
                    format!("bank-{}", &id_hash[..12])
                }
            };
            let db = banks_dir.join(format!("{bank_id}.db"));
            let assets = db.with_extension("assets");
            (bank_id, db, assets, None, None)
        }
    };
    let temp_db = if existing_bank.is_some() {
        None
    } else {
        Some(banks_dir.join(format!("{bank_id}.importing.db")))
    };
    let db_path = temp_db.clone().unwrap_or_else(|| final_db.clone());
    if let Some(temp) = &temp_db {
        for suffix in ["", "-wal", "-shm"] {
            let _ = fs::remove_file(format!("{}{}", temp.to_string_lossy(), suffix));
        }
    }
    let source_root = existing_source.unwrap_or_else(|| root.to_string_lossy().to_string());

    let result = (|| -> Result<ImportSummary, String> {
        let db = Connection::open(&db_path).map_err(|error| error.to_string())?;
        db.pragma_update(None, "journal_mode", "WAL").map_err(|error| error.to_string())?;
        db.execute_batch(BANK_SCHEMA)
        .map_err(|error| error.to_string())?;

        let skip_papers: HashSet<String> = if existing_bank.is_some() {
            let mut stmt = db.prepare("SELECT key FROM papers").map_err(|error| error.to_string())?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|error| error.to_string())?;
            rows.flatten().collect()
        } else {
            HashSet::new()
        };


        let mut insert_paper = db.prepare("INSERT OR REPLACE INTO papers (key,title,year,region,exam_type,question_count,module_count) VALUES (?,?,?,?,?,?,?)").map_err(|error| error.to_string())?;
        let mut insert_material = db.prepare("INSERT OR REPLACE INTO materials (key,paper_key,title,content,source_file,line) VALUES (?,?,?,?,?,?)").map_err(|error| error.to_string())?;
        let mut insert_question = db.prepare(
            "INSERT INTO questions (
              id,paper_key,paper,module,number,qid,qid_source,type,is_judgment,stem,options,answer,answer_raw,
              explanation,material_key,material_title,material_content,status,can_grade,answer_conflict,
              explanation_answer,has_image,image_missing,source_file,source_line
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .map_err(|error| error.to_string())?;

        let mut papers: HashMap<String, (String, String, String, String, usize, HashSet<String>)> = HashMap::new();
        let mut image_store = ImageStore { root: &root, assets: &assets, images: HashSet::new(), missing: 0 };
        let files = walk_markdown(&root);
        let total_files = files.len() as i64;
        let mut skipped = 0i64;
        let mut file_errors = 0i64;
        let mut invalid = 0i64;
        let mut review = 0i64;
        let mut imported = 0i64;
        let mut materials_count = 0i64;
        let mut image_questions = 0i64;
        let mut issues_out: Vec<String> = Vec::new();
        let mut image_missing_total = 0i64;
        let _ = fs::create_dir_all(&assets);
        db.execute_batch("BEGIN").map_err(|error| error.to_string())?;

        for (file_index, full) in files.iter().enumerate() {
            let relative = full.strip_prefix(&root).unwrap_or(full).to_string_lossy().replace('\\', "/");
            if relative.ends_with("README.md") {
                skipped += 1;
                continue;
            }
            let text = match fs::read_to_string(full) {
                Ok(value) => value,
                Err(error) => {
                    file_errors += 1;
                    issues_out.push(format!("{relative}:0 读取失败：{error}"));
                    continue;
                }
            };
            let parsed = parse_file(&text, &relative, &module_from_path(&relative));
            if parsed.skipped {
                skipped += 1;
                continue;
            }
            if parsed.has_file_error {
                file_errors += 1;
                for issue in parsed.issues.iter().filter(|issue| issue.level == "file") {
                    issues_out.push(format!("{}:{} {}", issue.file, issue.line, issue.message));
                }
                continue;
            }
            if skip_papers.contains(&parsed.paper_key) {
                skipped += 1;
                if issues_out.len() < 500 {
                    issues_out.push(format!("{}:0 试卷已存在，已跳过：{}", relative, parsed.paper));
                }
                continue;
            }
            for issue in parsed.issues.iter().filter(|issue| issue.level != "warning") {
                if issues_out.len() < 500 {
                    issues_out.push(format!("{}:{} {}", issue.file, issue.line, issue.message));
                }
            }
            let paper = papers.entry(parsed.paper_key.clone()).or_insert_with(|| {
                (
                    parsed.paper.clone(),
                    parsed.year.clone(),
                    parsed.region.clone(),
                    parsed.exam_type.clone(),
                    0,
                    HashSet::new(),
                )
            });
            paper.5.insert(parsed.module.clone());
            let material_by_key: HashMap<String, &ParsedMaterial> = parsed.materials.iter().map(|item| (item.key.clone(), item)).collect();
            for material in &parsed.materials {
                let image = image_store.process(&material.content, full);
                if image.missing {
                    image_missing_total += 1;
                }
                insert_material
                    .execute(params![
                        material.key,
                        parsed.paper_key,
                        format!("材料 {}", material.number),
                        image.text,
                        relative,
                        material.line as i64
                    ])
                    .map_err(|error| error.to_string())?;
                materials_count += 1;
            }
            for mut question in parsed.questions {
                if question.status == "invalid" {
                    invalid += 1;
                    continue;
                }
                for issue in question.issues.iter().filter(|issue| issue.level != "warning") {
                    if issues_out.len() < 500 {
                        issues_out.push(format!("{}:{} {}", issue.file, issue.line, issue.message));
                    }
                }
                let stem_image = image_store.process(&question.stem, full);
                question.stem = stem_image.text;
                let mut has_image = stem_image.has_image;
                let mut missing = stem_image.missing;
                let explanation_image = image_store.process(&question.explanation, full);
                question.explanation = explanation_image.text;
                has_image |= explanation_image.has_image;
                missing |= explanation_image.missing;
                for option in &mut question.options {
                    let option_image = image_store.process(&option.text, full);
                    option.text = option_image.text;
                    has_image |= option_image.has_image;
                    missing |= option_image.missing;
                }
                if let Some(material_number) = question.material_number {
                    if let Some(material) = material_by_key.get(&question.material_key.clone().unwrap_or_default()) {
                        let _ = material_number;
                        let _ = material;
                        missing |= false;
                    }
                }
                if let Some(material) = question.material_number.and_then(|number| {
                    parsed.materials.iter().find(|item| item.number == number)
                }) {
                    let image = image_store.process(&material.content, full);
                    missing |= image.missing;
                    has_image |= image.has_image;
                }
                if has_image {
                    image_questions += 1;
                }
                if missing {
                    image_missing_total += 1;
                }
                insert_question
                    .execute(params![
                        question.id,
                        question.paper_key,
                        question.paper,
                        question.module,
                        question.number as i64,
                        question.qid,
                        question.qid_source,
                        question.kind,
                        if question.is_judgment { 1 } else { 0 },
                        question.stem,
                        serde_json::to_string(&question.options.iter().map(|option| serde_json::json!({"label": option.label, "text": option.text})).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string()),
                        question.answer.join(","),
                        question.answer_raw,
                        question.explanation,
                        question.material_key,
                        question.material_number.map(|number| format!("材料 {number}")),
                        question.material_number.and_then(|number| parsed.materials.iter().find(|item| item.number == number).map(|item| image_store.process(&item.content, full).text)),
                        question.status,
                        if question.can_grade { 1 } else { 0 },
                        if question.answer_conflict { 1 } else { 0 },
                        question.explanation_answer,
                        if has_image { 1 } else { 0 },
                        if missing { 1 } else { 0 },
                        relative,
                        question.line as i64
                    ])
                    .map_err(|error| error.to_string())?;
                imported += 1;
                if question.status == "review" {
                    review += 1;
                }
                if let Some(paper) = papers.get_mut(&question.paper_key) {
                    paper.4 += 1;
                }
            }
            if file_index % 25 == 0 {
                let _ = app.emit(
                    "import-progress",
                    ImportProgress {
                        phase: "parse".to_string(),
                        current: file_index as i64,
                        total: total_files,
                        message: format!("读取 Markdown {}/{}", file_index + 1, total_files),
                    },
                );
            }
        }

        for (key, (title, year, region, exam_type, count, modules)) in &papers {
            insert_paper
                .execute(params![key, title, year, region, exam_type, *count as i64, modules.len() as i64])
                .map_err(|error| error.to_string())?;
        }
        db.execute_batch(REFRESH_COUNTS_SQL)
        .map_err(|error| error.to_string())?;
        db.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module);
             CREATE INDEX IF NOT EXISTS idx_questions_paper ON questions(paper_key);
             CREATE INDEX IF NOT EXISTS idx_questions_paper_practice ON questions(paper_key, can_grade, image_missing);
             CREATE INDEX IF NOT EXISTS idx_questions_practice ON questions(can_grade, image_missing);
             CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);",
        )
        .map_err(|error| error.to_string())?;
        let year_min = papers.values().map(|value| value.1.as_str()).filter(|value| !value.is_empty()).min().unwrap_or("");
        let year_max = papers.values().map(|value| value.1.as_str()).filter(|value| !value.is_empty()).max().unwrap_or("");
        let title = existing_title
            .clone()
            .or_else(|| title_hint.clone().filter(|value| !value.trim().is_empty()))
            .unwrap_or_else(|| {
                if year_min.is_empty() {
                    source.file_name().map(|value| value.to_string_lossy().to_string()).unwrap_or_else(|| "本地题库".to_string())
                } else {
                    format!("行测真题 {year_min}–{year_max}")
                }
            });
        let count_sql = |sql: &str| -> Result<i64, String> {
            db.query_row(sql, [], |row| row.get(0)).map_err(|error| error.to_string())
        };
        let total_questions = count_sql("SELECT COUNT(*) FROM questions")?;
        let total_review = count_sql("SELECT COUNT(*) FROM questions WHERE status='review'")?;
        let total_papers = count_sql("SELECT COUNT(*) FROM papers")?;
        let total_materials = count_sql("SELECT COUNT(*) FROM materials")?;
        let total_image_questions = count_sql("SELECT COALESCE(SUM(has_image),0) FROM questions")?;
        for (key, value) in [
            ("imported", total_questions.to_string()),
            ("review", total_review.to_string()),
            ("papers", total_papers.to_string()),
            ("materials", total_materials.to_string()),
            ("image_questions", total_image_questions.to_string()),
            ("images", image_store.images.len().to_string()),
            ("image_missing", image_missing_total.to_string()),
            ("invalid", invalid.to_string()),
            ("file_errors", file_errors.to_string()),
            ("skipped", skipped.to_string()),
            ("source_root", source_root.clone()),
            ("title", title.clone()),
        ] {
            db.execute("INSERT INTO meta (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value])
                .map_err(|error| error.to_string())?;
        }
        db.execute_batch("COMMIT").map_err(|error| error.to_string())?;
        drop(insert_paper);
        drop(insert_material);
        drop(insert_question);
        if let Err((_, error)) = db.close() { return Err(error.to_string()); }
        if let Some(temp) = &temp_db {
            if final_db.exists() {
                fs::remove_file(&final_db).map_err(|error| error.to_string())?;
            }
            fs::rename(temp, &final_db).map_err(|error| error.to_string())?;
        }
        let user = open_user(app)?;
        let keep_active = set_active || existing_bank.as_ref().map(|bank| bank.active).unwrap_or(false);
        register_bank(&user, &bank_id, &title, &final_db, Some(&source_root), keep_active)?;
        let payload = serde_json::json!({ "issues": issues_out });
        user.execute(
            "INSERT INTO import_reports (bank_id,payload,created_at) VALUES (?1,?2,datetime('now','localtime'))
             ON CONFLICT(bank_id) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at",
            params![bank_id, payload.to_string()],
        )
        .map_err(|error| error.to_string())?;
        Ok(ImportSummary {
            bank_id,
            title,
            questions: imported,
            papers: papers.len() as i64,
            materials: materials_count,
            images: image_store.images.len() as i64,
            image_questions,
            review,
            invalid,
            file_errors,
            skipped,
            issues: issues_out,
        })
    })();
    if let Some(dir) = temp_zip {
        let _ = fs::remove_dir_all(dir);
    }
    if result.is_err() {
        if let Some(temp) = &temp_db {
            for suffix in ["", "-wal", "-shm"] {
                let _ = fs::remove_file(format!("{}{}", temp.to_string_lossy(), suffix));
            }
        }
    }
    result
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_refresh_after_append() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(BANK_SCHEMA).unwrap();
        for key in ["p1", "p2"] {
            db.execute(
                "INSERT INTO papers (key,title,year,region,exam_type,question_count,module_count) VALUES (?1,?1,'','','省考',0,0)",
                params![key],
            )
            .unwrap();
        }
        for (id, paper, module) in [("a", "p1", "数量"), ("b", "p1", "判断"), ("c", "p2", "数量")] {
            db.execute(
                "INSERT INTO questions (id,paper_key,paper,module,number,qid,qid_source,type,is_judgment,stem,options,answer,answer_raw,explanation,material_key,material_title,material_content,status,can_grade,answer_conflict,explanation_answer,has_image,image_missing,source_file,source_line)
                 VALUES (?1,?2,'',?3,1,'q','auto','',0,'','[]','','','',NULL,NULL,NULL,'ok',1,0,NULL,0,0,'',0)",
                params![id, paper, module],
            )
            .unwrap();
        }
        db.execute_batch(REFRESH_COUNTS_SQL).unwrap();
        let mut stmt = db
            .prepare("SELECT key,question_count,module_count FROM papers ORDER BY key")
            .unwrap();
        let rows: Vec<(String, i64, i64)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(rows, vec![("p1".to_string(), 2, 2), ("p2".to_string(), 1, 1)]);
    }

    #[test]
    fn same_paper_meta_shares_key() {
        let text_a = "---\n试卷: \"联考\"\n模块: \"数量关系\"\n年份: \"2020\"\n---\n\n## 第 1 题\n\n题干一\n- **A**. 甲\n- **B**. 乙\n\n**答案**：A\n";
        let text_b = "---\n试卷: \"联考\"\n模块: \"数量关系\"\n年份: \"2020\"\n---\n\n## 第 2 题\n\n题干二\n- **A**. 甲\n- **B**. 乙\n\n**答案**：B\n";
        let a = parse_file(text_a, "a.md", "");
        let b = parse_file(text_b, "b.md", "");
        assert_eq!(a.paper_key, b.paper_key);
        assert_eq!(a.questions.len(), 1);
        assert_eq!(b.questions.len(), 1);
    }
}
