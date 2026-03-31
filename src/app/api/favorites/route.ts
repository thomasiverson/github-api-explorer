import { NextResponse } from 'next/server';
import { getFavorites, addFavorite, removeFavorite } from '@/lib/db';

export async function GET() {
  const favorites = getFavorites();
  return NextResponse.json(favorites);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, operationId } = body;

  if (action === 'add') {
    addFavorite(operationId);
    return NextResponse.json({ success: true });
  }

  if (action === 'remove') {
    removeFavorite(operationId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
