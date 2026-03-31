import { NextRequest, NextResponse } from 'next/server';
import { getVariables, setVariable, deleteVariable } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const envId = new URL(request.url).searchParams.get('environmentId');
  if (!envId) return NextResponse.json({ error: 'environmentId required' }, { status: 400 });
  const variables = getVariables(envId);
  return NextResponse.json(variables);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === 'set') {
    const id = body.id || uuidv4();
    setVariable(body.environmentId, id, body.name, body.value);
    return NextResponse.json({ id, success: true });
  }

  if (action === 'delete') {
    deleteVariable(body.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
