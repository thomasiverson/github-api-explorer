import { NextResponse } from 'next/server';
import {
  getCollections, createCollection, updateCollection, deleteCollection,
  getCollectionItems, addCollectionItem, deleteCollectionItem, reorderCollectionItems
} from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const collections = getCollections();
  return NextResponse.json(collections);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === 'create') {
    const id = uuidv4();
    createCollection(id, body.name || 'New Collection', body.description || '', body.environmentId || null);
    return NextResponse.json({ id, success: true });
  }

  if (action === 'update') {
    updateCollection(body.id, body.name, body.description || '');
    return NextResponse.json({ success: true });
  }

  if (action === 'delete') {
    deleteCollection(body.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'get-items') {
    const items = getCollectionItems(body.collectionId);
    return NextResponse.json(items);
  }

  if (action === 'add-item') {
    const id = uuidv4();
    addCollectionItem({
      id,
      collectionId: body.collectionId,
      operationId: body.operationId || null,
      method: body.method,
      path: body.path,
      pathParams: JSON.stringify(body.pathParams || {}),
      queryParams: JSON.stringify(body.queryParams || {}),
      headers: JSON.stringify(body.headers || {}),
      body: body.body || null,
      sortOrder: body.sortOrder || 0,
    });
    return NextResponse.json({ id, success: true });
  }

  if (action === 'delete-item') {
    deleteCollectionItem(body.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'reorder') {
    reorderCollectionItems(body.collectionId, body.itemIds);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
