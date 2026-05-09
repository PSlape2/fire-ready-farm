import { NextRequest, NextResponse } from "next/server";

/** Base URL of the local Python detection backend (live deep-scan mode). */
const BACKEND = "http://localhost:8000";

/**
 * Forwards an incoming Next.js request to the local detection backend,
 * preserving method, headers, query string, and body.
 * Used by the Live Deep Scan feature which requires the backend running separately.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const url = new URL(`/${path.join("/")}`, BACKEND);
  url.search = new URL(req.url).search;

  const headers = new Headers(req.headers);
  headers.delete("host");

  const upstream = await fetch(url.toString(), {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error — Node fetch needs this to stream the body
    duplex: "half",
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
