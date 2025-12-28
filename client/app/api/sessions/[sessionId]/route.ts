import { NextRequest, NextResponse } from 'next/server';
import { SessionRouter } from '@/lib/session-router';

interface RouteParams {
    params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const { sessionId } = await params;

    const session = await SessionRouter.GetSession(sessionId);
    const ontology = await SessionRouter.GetOntology(sessionId);

    // Return 404 only if both session meta and ontology data are missing
    if (!session && ontology.nodes.length === 0 && ontology.links.length === 0) {
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
        ontology,
    });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const { sessionId } = await params;

    const session = await SessionRouter.GetSession(sessionId);

    if (!session) {
        return NextResponse.json(
            { error: 'Session not found' },
            { status: 404 }
        );
    }

    const success = await SessionRouter.DeleteSession(sessionId);

    if (!success) {
        return NextResponse.json(
            { error: 'Failed to delete session' },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}
