import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  // This reads from: public/icons/icon-192.png
  const filePath = path.join(process.cwd(), "public", "icons", "icon-192.png");

  const file = fs.readFileSync(filePath);

  return new NextResponse(file, {
    headers: {
      // Browsers accept PNG even if the URL ends with .ico
      "Content-Type": "image/png",
      // during testing, avoid sticky cache
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}