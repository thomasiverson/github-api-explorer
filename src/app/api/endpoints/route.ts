import { NextRequest, NextResponse } from 'next/server';
import {
  getEndpointCategories, getEndpointsByCategory,
  searchEndpoints, getEndpointCount, getSpecVersions
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'categories';
  const specVersion = searchParams.get('version') || undefined;

  if (action === 'categories') {
    const categories = getEndpointCategories(specVersion);
    const total = getEndpointCount(specVersion);
    const versions = getSpecVersions();
    return NextResponse.json({ categories, total, versions });
  }

  if (action === 'by-category') {
    const category = searchParams.get('category');
    if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 });
    const endpoints = getEndpointsByCategory(category, specVersion);
    return NextResponse.json(endpoints);
  }

  if (action === 'search') {
    const query = searchParams.get('q');
    if (!query) return NextResponse.json({ error: 'q required' }, { status: 400 });
    const limit = parseInt(searchParams.get('limit') || '50');
    const endpoints = searchEndpoints(query, limit, specVersion);
    return NextResponse.json(endpoints);
  }

  if (action === 'count') {
    const count = getEndpointCount(specVersion);
    return NextResponse.json({ count });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
