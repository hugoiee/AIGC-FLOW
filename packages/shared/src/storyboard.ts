import { z } from "zod";

/** 分镜表节点在 React Flow 里的 node.type */
export const STORYBOARD_NODE_TYPE = "storyboard";

/**
 * 一行分镜。
 *
 * **镜号不在这里** —— 它就是行在数组里的位置（从 1 数起），渲染时现算。
 * 存一份的话插行 / 删行 / 挪行都要全表重排，还会出现「存的号和看到的号对不上」
 * 这种只能靠人工发现的脏数据。
 *
 * `id` 只是渲染用的稳定 key（React 列表 + 逐格编辑的定位），不跨节点有意义：
 * 复制节点时整份 rows 照抄，两个节点里出现同样的行 id 是正常的。
 */
export const storyboardRowSchema = z.object({
  id: z.string().min(1),
  /** 镜头：景别 / 运镜 / 画面内容 */
  shot: z.string(),
  /** 时长。自由文本（"3s" / "2-3s" / "0:05" 都行），刻意不做数字校验 */
  duration: z.string(),
  /** 台词 */
  dialogue: z.string(),
  /** 表演：情绪、动作、走位 */
  performance: z.string(),
  /** 表演 Prompt：喂给模型的表演描述 */
  performancePrompt: z.string(),
  /** 完整 Prompt：这一镜最终发给生成模型的整段提示词 */
  fullPrompt: z.string(),
});

export type StoryboardRow = z.infer<typeof storyboardRowSchema>;

/** 除 id 外的字段名，也就是表格里可编辑的那几列 */
export type StoryboardField = Exclude<keyof StoryboardRow, "id">;

/**
 * 列的顺序与中文名。放 shared 而不是组件里：这既是表头文案，
 * 也是以后接 LLM 拆分镜时描述输出格式要用的同一份字段清单，
 * 抄成两份迟早会对不上。列宽之类的展示细节留在组件里。
 */
export const STORYBOARD_COLUMNS: readonly { key: StoryboardField; label: string }[] = [
  { key: "shot", label: "镜头" },
  { key: "duration", label: "时长" },
  { key: "dialogue", label: "台词" },
  { key: "performance", label: "表演" },
  { key: "performancePrompt", label: "表演 Prompt" },
  { key: "fullPrompt", label: "完整 Prompt" },
];

/**
 * 单个节点的行数上限。整张图是**整体覆盖**写进 projects.graph 一个 JSON 列的，
 * 没有上限时一张表就能把单元格塞爆（同 projectGraphSchema 里节点 / 连线的上限）。
 */
export const STORYBOARD_MAX_ROWS = 200;

export const storyboardNodeDataSchema = z.object({
  label: z.string(),
  rows: z.array(storyboardRowSchema).max(STORYBOARD_MAX_ROWS),
});

export type StoryboardNodeData = z.infer<typeof storyboardNodeDataSchema>;

/** 新建节点时的初始行数，够看出这是张表、又不至于一屏全是空格 */
const INITIAL_ROWS = 3;

/**
 * 行 id 的自增序号。**shared 里不能用 crypto.randomUUID** —— 这个包刻意不带任何
 * 运行环境的类型（tsconfig 的 lib 只有 ES2023，没有 DOM 也没有 node），
 * 前后端和 Electron 都直接吃它的 TS 源码。
 *
 * 后面那截随机串是给「刷新之后」兜底的：序号从 0 重新数，而画布上已有的行
 * 带着上次的 id 从 graph 里读回来，光靠序号会撞。行 id 只需在一张表内唯一。
 */
let rowSeq = 0;

function nextRowId(): string {
  rowSeq += 1;
  return `row-${rowSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createStoryboardRow(): StoryboardRow {
  return {
    id: nextRowId(),
    shot: "",
    duration: "",
    dialogue: "",
    performance: "",
    performancePrompt: "",
    fullPrompt: "",
  };
}

/**
 * 新节点的初始 data。**必须是函数，不能是模块级常量** ——
 * 建节点走的 buildCanvasNode 只做浅拷贝（`{ ...defaults }`），
 * 常量的话所有分镜表节点会共用同一个 rows 数组，改一张表另一张跟着变。
 */
export function createStoryboardNodeData(): StoryboardNodeData {
  return {
    label: "双人播客分镜表",
    rows: Array.from({ length: INITIAL_ROWS }, createStoryboardRow),
  };
}

/** 改一个单元格。行不存在时原样返回，调用方据此可跳过入栈 */
export function withCell(
  rows: StoryboardRow[],
  rowId: string,
  field: StoryboardField,
  value: string,
): StoryboardRow[] {
  if (!rows.some((row) => row.id === rowId)) return rows;
  return rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row));
}

/** 在 index 位置插入一个空行（index === rows.length 就是追加）。到上限时原样返回 */
export function withRowInserted(rows: StoryboardRow[], index: number): StoryboardRow[] {
  if (rows.length >= STORYBOARD_MAX_ROWS) return rows;
  const at = Math.min(Math.max(index, 0), rows.length);
  return [...rows.slice(0, at), createStoryboardRow(), ...rows.slice(at)];
}

/**
 * 删掉一行。删到一行不剩时留一个空行 —— 空表没有任何可点的地方，
 * 用户会以为节点坏了（表头下面连个「加一行」的落点都没有）。
 */
export function withRowRemoved(rows: StoryboardRow[], rowId: string): StoryboardRow[] {
  const next = rows.filter((row) => row.id !== rowId);
  if (next.length === rows.length) return rows;
  return next.length > 0 ? next : [createStoryboardRow()];
}

/** 把某一行上移 / 下移一格。已经在头 / 尾时原样返回 */
export function withRowMoved(
  rows: StoryboardRow[],
  rowId: string,
  direction: -1 | 1,
): StoryboardRow[] {
  const from = rows.findIndex((row) => row.id === rowId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const moved = next[from];
  const swapped = next[to];
  // noUncheckedIndexedAccess：上面的边界判断已经保证两个都在，这里只是让类型收窄
  if (!moved || !swapped) return rows;
  next[from] = swapped;
  next[to] = moved;
  return next;
}

/** 分镜表节点的初始尺寸。可自由拉伸，尺寸随 graph 落盘（同文本节点） */
export const STORYBOARD_NODE_WIDTH = 880;
export const STORYBOARD_NODE_HEIGHT = 320;

/**
 * 解析从 Excel / Google Sheets（以及多数表格工具）复制来的剪贴板文本。
 *
 * 两家放进 `text/plain` 的都是 **TSV**：列用 `\t` 分、行用换行分，而**含制表符、
 * 换行或引号的单元格会被 `"` 包起来、内部引号翻倍**（和 CSV 一个规矩）。
 * 台词和完整 Prompt 这两列很容易是多行的，所以不能简单 `split("\t")` ——
 * 那样一格里的换行会被当成换行，一行内容散成好几行。
 *
 * 返回的是剪贴板里的原始形状（几行几列），要不要截断、往哪落由调用方决定。
 * 空文本返回 `[[""]]`（一个空格子），调用方按 1×1 处理即可，不用特判。
 */
export function parseClipboardTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  /** 正在引号里面。此时制表符和换行都是内容，不是分隔符 */
  let quoted = false;
  /** 字段刚开始。只有开头的引号才算「包裹」，中间出现的引号是普通字符 */
  let atFieldStart = true;
  let i = 0;

  while (i < text.length) {
    const ch = text[i] ?? "";

    if (quoted) {
      if (ch === '"') {
        // 连着两个引号是转义出来的一个引号，不是结束
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (atFieldStart && ch === '"') {
      quoted = true;
      atFieldStart = false;
      i += 1;
      continue;
    }

    if (ch === "\t") {
      row.push(field);
      field = "";
      atFieldStart = true;
      i += 1;
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";
      atFieldStart = true;
      rows.push(row);
      row = [];
      // Windows 的 Excel 给的是 \r\n，两个字符算一个换行
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }

    field += ch;
    atFieldStart = false;
    i += 1;
  }

  // 收尾。文本以换行结尾时这里 field 和 row 都是空的 —— 那是分隔符的尾巴，
  // 不是一个空行，补上去的话每次粘贴都会多出一行
  if (field !== "" || row.length > 0 || rows.length === 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * 把一块（几行几列）内容按 Excel 的语义贴进表里：以 `anchorIndex` 行、
 * `anchorField` 列为左上角向右下铺开，覆盖沿途的格子。
 *
 * - 行不够就补空行，补到 `STORYBOARD_MAX_ROWS` 为止，**超出的行直接丢弃**
 * - 超出最右一列的内容丢弃（列是固定的，不会因为粘贴而长出新列）
 *
 * 调用方要提示「丢了多少」的话自己按 `STORYBOARD_MAX_ROWS` 算，
 * 这里只管落数据，不返回统计 —— 返回值的形状越简单越好接。
 */
export function withBlockPasted(
  rows: StoryboardRow[],
  anchorIndex: number,
  anchorField: StoryboardField,
  block: string[][],
): StoryboardRow[] {
  const anchorColumn = STORYBOARD_COLUMNS.findIndex((column) => column.key === anchorField);
  if (anchorColumn < 0 || block.length === 0) return rows;

  const next = [...rows];
  const wanted = Math.min(anchorIndex + block.length, STORYBOARD_MAX_ROWS);
  while (next.length < wanted) next.push(createStoryboardRow());

  for (const [offset, line] of block.entries()) {
    const target = next[anchorIndex + offset];
    // 越过上限的行：上面没补出来，这里跳过
    if (!target) continue;

    const patched = { ...target };
    for (const [column, value] of line.entries()) {
      const field = STORYBOARD_COLUMNS[anchorColumn + column]?.key;
      // 越过最右一列，丢弃
      if (!field) continue;
      patched[field] = value;
    }
    next[anchorIndex + offset] = patched;
  }

  return next;
}

/** 单元格含分隔符或引号时要按 TSV 的规矩包起来，否则粘回表格工具会散架 */
function escapeClipboardCell(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * 把整张表（含表头、含镜号）写成 TSV，直接粘进 Excel / Google Sheets 就是一张表。
 * 行分隔用 `\r\n`：Windows 版 Excel 只认这个，其余工具两种都收。
 */
export function toClipboardTable(rows: StoryboardRow[]): string {
  const header = ["镜号", ...STORYBOARD_COLUMNS.map((column) => column.label)];
  const body = rows.map((row, index) => [
    String(index + 1),
    ...STORYBOARD_COLUMNS.map((column) => row[column.key]),
  ]);

  return [header, ...body].map((line) => line.map(escapeClipboardCell).join("\t")).join("\r\n");
}
