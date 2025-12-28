import { NextRequest, NextResponse } from 'next/server';
import { LayeredSessionRouter } from '@/lib/layered-session-router';

interface RouteParams {
    params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const { sessionId } = await params;

    const session = await LayeredSessionRouter.GetSession(sessionId);
    const layers = await LayeredSessionRouter.GetAllLayers(sessionId);

    // Return 404 only if both session meta and layers are missing
    if (!session && layers.length === 0) {
        return NextResponse.json(
            { error: 'Session not found' },
            { status: 404 }
        );
    }

    // Return available data even if session meta is incomplete
    return NextResponse.json({
        sessionId,
        topic: session?.topic || '',
        createdAt: session?.createdAt || 0,
        updatedAt: session?.updatedAt || Date.now(),
        status: session?.status || 'active',
        layerCount: session?.layerCount || layers.length,
        layers,
    });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const { sessionId } = await params;

    const session = await LayeredSessionRouter.GetSession(sessionId);

    if (!session) {
        return NextResponse.json(
            { error: 'Session not found' },
            { status: 404 }
        );
    }

    const success = await LayeredSessionRouter.DeleteSession(sessionId);

    if (!success) {
        return NextResponse.json(
            { error: 'Failed to delete session' },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}
