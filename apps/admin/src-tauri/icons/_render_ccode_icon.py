"""
从原版 ccode-icon-b 出透明底 PNG：只抠白底，并略放大圆内元素。
不改图形样式（保持原版 C / </> 观感）。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

# 用户确认过的原版（白底黑圆 + 大 C + </>）
SRC = Path(r"C:\Users\chenzhibin\.cursor\projects\e-cz6-tsb\assets\ccode-icon-b.png")
OUT = Path(__file__).with_name("ccode-icon-b.png")
SIZE = 1024
# 圆内元素相对放大；略大于 1 即「稍微调大」
CONTENT_SCALE = 1.12
# 近白阈值：抠掉画布白底，保留圆内抗锯齿
WHITE_LUMA = 245


def main() -> None:
  src = Image.open(SRC).convert("RGBA")
  w, h = src.size
  px = src.load()

  # 白底 → 透明；黑圆与白字保留
  for y in range(h):
    for x in range(w):
      r, g, b, a = px[x, y]
      if r >= WHITE_LUMA and g >= WHITE_LUMA and b >= WHITE_LUMA:
        px[x, y] = (0, 0, 0, 0)

  # 不透明内容包围盒
  bbox = src.getbbox()
  if not bbox:
    raise SystemExit("empty after keying")
  content = src.crop(bbox)
  cw, ch = content.size

  # 略放大后居中贴到透明画布（仍留一点边，避免贴边锯齿）
  nw = int(cw * CONTENT_SCALE)
  nh = int(ch * CONTENT_SCALE)
  max_side = int(SIZE * 0.96)
  if max(nw, nh) > max_side:
    s = max_side / max(nw, nh)
    nw, nh = int(nw * s), int(nh * s)
  content = content.resize((nw, nh), Image.Resampling.LANCZOS)

  out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
  out.paste(content, ((SIZE - nw) // 2, (SIZE - nh) // 2), content)
  out.save(OUT, "PNG")
  print("saved", OUT)
  print("corner", out.getpixel((0, 0)))
  print("scale", CONTENT_SCALE, "content", nw, nh)


if __name__ == "__main__":
  main()
