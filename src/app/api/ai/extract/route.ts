import { NextRequest, NextResponse } from "next/server";
import { requireUnlocked } from "@/lib/auth";
import { extractStructuredDataWithVision } from "@/lib/ai";

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const targetType = String(formData.get("targetType") || "insurance") as
      | "insurance"
      | "investment"
      | "income"
      | "loan";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type.toLowerCase();
    const isImage =
      mime.startsWith("image/") ||
      /\.(png|jpg|jpeg|webp)$/i.test(file.name);

    const result = await extractStructuredDataWithVision({
      base64Image: isImage ? buf.toString("base64") : undefined,
      textContent: isImage ? undefined : buf.toString("utf-8"),
      targetType,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction error" },
      { status: 500 }
    );
  }
}
