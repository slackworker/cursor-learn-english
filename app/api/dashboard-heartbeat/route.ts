import fs from "fs";
import path from "path";

export const runtime = "nodejs";

/** 浏览页打开时的心跳：刷新闲置计时，供桌面快捷方式看门狗使用 */
export async function POST() {
  try {
    const dir = path.join(process.cwd(), ".local");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "dashboard-last-access"),
      String(Math.floor(Date.now() / 1000))
    );
  } catch {
    // ignore
  }
  return new Response(null, { status: 204 });
}
