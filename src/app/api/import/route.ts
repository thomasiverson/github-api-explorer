import { NextResponse } from 'next/server';
import { replaceEndpoints, getEndpointCount } from '@/lib/db';
import { importOpenApiSpec } from '@/lib/openapi-import';

export async function POST(request: Request) {
  const body = await request.json();
  const specVersion = body.specVersion || 'api.github.com';

  try {
    const result = await importOpenApiSpec(
      { replaceEndpoints },
      specVersion
    );
    const total = getEndpointCount();
    return NextResponse.json({ ...result, total });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
