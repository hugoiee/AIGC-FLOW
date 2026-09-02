import { z } from "zod";

/**
 * 节点标记：素材一多，哪些是废片、哪些能用得有个记号。
 *
 * 三态而不是一个「废弃」开关：没标记的就是「还没审」，审到哪一眼能看出来。
 * 标记**跟结果走**：生成节点重新生成时旧标记一并清掉（那是给上一张打的）。
 * 以后做结果历史时应挪进每条结果记录里，现在放在节点 data 上只是过渡。
 *
 * 只是信息，不是锁：废弃的素材照样能连线当参考、照样能下载，只在 prompt 徽章上提示。
 */
export const NODE_MARKS = ["keep", "reject"] as const;
export const nodeMarkSchema = z.enum(NODE_MARKS);
export type NodeMark = z.infer<typeof nodeMarkSchema>;

export const NODE_MARK_LABEL: Record<NodeMark, string> = { keep: "采用", reject: "废弃" };
