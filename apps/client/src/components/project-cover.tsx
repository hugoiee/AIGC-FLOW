import { cn } from "@/lib/utils";

/**
 * djb2 + xorshift finalizer。
 * 单纯的 djb2 低位分布很差，对长度相近的中文串取模会大量撞桶
 * （实测 8 个项目名有 3 个撞同一个色），finalizer 用来把熵摊到所有位上。
 * 纯函数，保证 SSR 与客户端渲染结果一致，不会 hydration 不匹配。
 */
function hashName(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = (Math.imul(hash, 33) ^ name.charCodeAt(i)) | 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * 由名称映射成一段渐变。
 * 色相取满 360 度，再用 hash 的另外两段位抖动饱和度和明度——
 * 只靠色相的话，两个名字撞到相邻色相（如 212 与 228）时肉眼都是蓝的，分不开。
 */
function gradientOf(name: string): { from: string; to: string } {
  const hash = hashName(name);
  const hue = hash % 360;
  const saturation = 58 + ((hash >>> 9) % 24); // 58% ~ 81%
  const lightness = 46 + ((hash >>> 17) % 16); // 46% ~ 61%

  return {
    from: `hsl(${hue} ${saturation}% ${lightness}%)`,
    to: `hsl(${(hue + 42) % 360} ${saturation}% ${Math.max(lightness - 14, 30)}%)`,
  };
}

/** 取首个非空白字符做角标；中文取一字，英文取一字母 */
function initial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

type ProjectCoverProps = {
  name: string;
  /** 有真实封面时优先显示；当前版本恒为 null */
  coverImage: string | null;
  className?: string;
};

export function ProjectCover({ name, coverImage, className }: ProjectCoverProps) {
  if (coverImage) {
    return (
      // 封面来源是本地上传的任意图片，交给浏览器直接加载，不走 next/image 优化
      // biome-ignore lint/performance/noImgElement: 用户上传的任意尺寸图片，无需 next/image
      <img
        src={coverImage}
        alt={`${name} 的封面`}
        className={cn("size-full object-cover", className)}
      />
    );
  }

  const { from, to } = gradientOf(name);

  return (
    <div
      aria-hidden
      className={cn("flex size-full items-center justify-center", className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <span className="select-none font-semibold text-3xl text-white/90 drop-shadow-sm">
        {initial(name)}
      </span>
    </div>
  );
}
