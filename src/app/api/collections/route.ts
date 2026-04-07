import { NextResponse } from 'next/server';
import {
  getCollections, createCollection, updateCollection, deleteCollection,
  getCollectionItems, addCollectionItem, deleteCollectionItem, reorderCollectionItems,
  updateCollectionItem
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

  if (action === 'update-item') {
    updateCollectionItem(body.id, {
      pathParams: body.pathParams !== undefined ? JSON.stringify(body.pathParams) : undefined,
      queryParams: body.queryParams !== undefined ? JSON.stringify(body.queryParams) : undefined,
      headers: body.headers !== undefined ? JSON.stringify(body.headers) : undefined,
      body: body.body !== undefined ? (body.body ? JSON.stringify(body.body) : null) : undefined,
    });
    return NextResponse.json({ success: true });
  }

  if (action === 'reorder') {
    reorderCollectionItems(body.collectionId, body.itemIds);
    return NextResponse.json({ success: true });
  }

  if (action === 'duplicate') {
    // Get the source collection info
    const collections = getCollections() as Array<{ id: string; name: string; description: string }>;
    const source = collections.find(c => c.id === body.id);
    if (!source) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

    // Create new collection with "(copy)" suffix
    const newId = uuidv4();
    createCollection(newId, `${source.name} (copy)`, source.description, null);

    // Copy all items
    const items = getCollectionItems(body.id) as Array<{
      id: string; operation_id: string | null; method: string; path: string;
      path_params: string; query_params: string; headers: string; body: string | null; sort_order: number;
    }>;
    for (const item of items) {
      addCollectionItem({
        id: uuidv4(),
        collectionId: newId,
        operationId: item.operation_id,
        method: item.method,
        path: item.path,
        pathParams: item.path_params || '{}',
        queryParams: item.query_params || '{}',
        headers: item.headers || '{}',
        body: item.body,
        sortOrder: item.sort_order,
      });
    }
    return NextResponse.json({ id: newId, success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
