export function ImportFormatHelp() {
  return (
    <details className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper-2)]">
      <summary className="px-4 py-3 text-[11.5px] text-[var(--ink-2)] cursor-pointer select-none">
        题库格式说明（点开查看：目录结构 / 文件头 / 题目 / 图片）
      </summary>
      <div className="px-4 pb-4 max-h-72 overflow-y-auto scroll text-[10.5px] leading-6 text-[var(--ink-2)]">
        <div className="font-semibold text-[var(--ink-2)] mt-1">一、文件夹结构</div>
        <div className="mt-1 text-[var(--muted)]">
          选一个文件夹（或打包成 zip）。文件夹内所有 <code>.md</code> 会被递归扫描，图片放在哪里都行，只要用相对路径引用。
        </div>
        <pre className="mt-2 rounded-lg bg-[var(--paper)] border border-[var(--line)] p-3 overflow-x-auto text-[10px] leading-5">{`题库文件夹/
  01-言语理解与表达/        ← 顶层目录名可作模块名（模块: 字段优先）
    2023年国考行测.md
    90-图片/
      q1.png
  02-数量关系/
    2023年国考行测.md
  README.md                 ← 自动跳过`}</pre>

        <div className="font-semibold text-[var(--ink-2)] mt-4">二、文件头（文件开头用 --- 包围）</div>
        <pre className="mt-2 rounded-lg bg-[var(--paper)] border border-[var(--line)] p-3 overflow-x-auto text-[10px] leading-5">{`---
试卷: "2023年国考《行测》题"
年份: "2023"
地区: "国考"
模块: "言语理解与表达"
考试类型: "国考"
---`}</pre>
        <div className="mt-1 text-[var(--muted)]">
          必填：<b>试卷</b>、<b>模块</b>（模块可从目录名 <code>01-模块名</code> 推导）。其余可选。
        </div>

        <div className="font-semibold text-[var(--ink-2)] mt-4">三、题目写法</div>
        <pre className="mt-2 rounded-lg bg-[var(--paper)] border border-[var(--line)] p-3 overflow-x-auto text-[10px] leading-5">{`## 第 1 题 · 逻辑填空        ← 用 ## ；可选 · 题型

题干正文，可含 Markdown / HTML / 图片。

- **A**. 选项一
- **B**. 选项二　✅          ← 选项 A–H，必须从 A 连续
- **C**. 选项三

**答案**：B                  ← 必填；多选写 A,C

**官方解析**

解析正文……故正确答案为B。`}</pre>
        <div className="mt-1 text-[var(--muted)]">
          判断题可写一行 <code>- （选项）[]</code>，答案 A=正确 B=错误。
          材料题用 <code>## 材料 1</code> + <code>### 第 1 题</code>。
          选项末尾 <code>✅</code> 可选，用于校验答案。
        </div>

        <div className="font-semibold text-[var(--ink-2)] mt-4">四、图片</div>
        <div className="mt-1 text-[var(--muted)]">
          支持 <code>![描述](相对路径.png)</code> 或 <code>&lt;img src="相对路径.png"&gt;</code>。
          路径相对当前 <code>.md</code> 文件；可用扩展名 <code>png jpg jpeg jfif gif webp</code>。
          网络图片和绝对路径不下载，仅告警；缺图不影响导入，报告会列出文件与行号。
        </div>
      </div>
    </details>
  );
}