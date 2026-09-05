import writeXlsxFile from "write-excel-file/browser";

/** 面板和导出共用的一条流水（服务端 /api/generations 的 items 元素） */
export type GenerationItem = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  kind: string;
  payload: string;
  status: string;
  error: string | null;
  resultUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
};

/** payload 里的 prompt；解不出来就当空字符串，导出不能因为一条脏数据整个失败 */
function promptOf(payload: string): string {
  try {
    return (JSON.parse(payload) as { prompt?: string }).prompt ?? "";
  } catch {
    return "";
  }
}

/**
 * Excel 的「日期」是从 1900 起算的天数，没有时区概念，而 write-excel-file
 * 直接拿 `date.getTime()`（UTC 毫秒）换算 —— 原样传进去，UTC+8 的用户在 Excel 里
 * 看到的时间会比面板列表（`toLocaleString()`，本地时区）早 8 小时。
 * 所以先把本地墙上时间平移成「假装是 UTC」的那一刻，序列号才对得上眼睛看到的。
 */
function asExcelLocalDate(iso: string): Date | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
}

/** 视频时长：-1 是「自动」（下单时没指定秒数），图像没有这一项 */
function durationOf(item: GenerationItem): string {
  if (item.kind !== "video" || item.durationSeconds == null) return "";
  return item.durationSeconds === -1 ? "自动" : `${item.durationSeconds}s`;
}

const HEADER_STYLE = { fontWeight: "bold", backgroundColor: "#F1F5F9" } as const;

/**
 * 把生成流水导出成 .xlsx。
 *
 * 表格列固定，和面板列表一个口径：**导出的就是这次拿到的这批记录**
 * （全局面板导出全局流水，画布面板导出本画布的），调用方负责先把全量取回来。
 * 「请求 JSON」整条塞进最后一列，核对参数时不用再回面板展开。
 *
 * 存盘交给 `toFile()`（内部就是 blob URL + `<a download>`）：blob 是同源的，
 * 和 lib/download.ts 里跨源 API 那个「download 属性被忽略、变成顶层导航」的坑
 * 不是一回事，那套隐藏 iframe 在这儿用不着。
 */
export async function exportGenerationsXlsx(
  items: GenerationItem[],
  filename: string,
): Promise<void> {
  const header = [
    { value: "时间", ...HEADER_STYLE },
    { value: "项目", ...HEADER_STYLE },
    { value: "类型", ...HEADER_STYLE },
    { value: "状态", ...HEADER_STYLE },
    { value: "时长", ...HEADER_STYLE },
    { value: "提示词", ...HEADER_STYLE },
    { value: "结果地址", ...HEADER_STYLE },
    { value: "失败原因", ...HEADER_STYLE },
    { value: "请求 JSON", ...HEADER_STYLE },
  ];

  const rows = items.map((item) => [
    { type: Date, value: asExcelLocalDate(item.createdAt), format: "yyyy-mm-dd hh:mm:ss" },
    // 老记录和已删项目的流水没有归属，留个明确的占位，别让空格看着像漏了数据
    { type: String, value: item.projectName ?? "未归属" },
    { type: String, value: item.kind === "image" ? "图像" : "视频" },
    { type: String, value: item.status === "success" ? "成功" : "失败" },
    { type: String, value: durationOf(item) },
    { type: String, value: promptOf(item.payload) },
    { type: String, value: item.resultUrl ?? "" },
    { type: String, value: item.error ?? "" },
    { type: String, value: item.payload },
  ]);

  const file = await writeXlsxFile([header, ...rows], {
    columns: [
      { width: 20 },
      { width: 18 },
      { width: 8 },
      { width: 8 },
      { width: 8 },
      { width: 44 },
      { width: 44 },
      { width: 28 },
      { width: 60 },
    ],
    sheet: "生成流水",
  });

  await file.toFile(filename);
}

/** 导出文件名带口径和日期，多次导出不互相覆盖 */
export function exportFilenameOf(scope: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `生成流水-${scope}-${stamp}.xlsx`;
}
