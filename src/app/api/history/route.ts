import { NextRequest, NextResponse } from 'next/server';
import { getHistory, getHistoryEntry, deleteHistory, clearHistory } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    const entry = getHistoryEntry(id);
    return NextResponse.json(entry || null);
  }
  const environmentId = searchParams.get('environmentId') || undefined;
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  const history = getHistory(environmentId, limit, offset);
  return NextResponse.json(history);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === 'delete') {
    deleteHistory(body.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'clear') {
    clearHistory(body.environmentId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
