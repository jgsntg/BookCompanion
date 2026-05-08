import { NextRequest, NextResponse } from "next/server";
import { listLibraryBooks } from "@/lib/db";

export async function GET(_req: NextRequest) {
  const books = await listLibraryBooks();
  return NextResponse.json({ books });
}
