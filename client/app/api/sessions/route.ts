import { NextRequest, NextResponse } from 'next/server';
import { SessionRouter } from '@/lib/session-router';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');

    const sessions = await SessionRouter.ListSessions(limit);

    return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));
    const { topic } = body;

    const session = await SessionRouter.CreateSession(topic);

    if (!session) {
        return NextResponse.json(
            { error: 'Failed to create session. Redis may be unavailable.' },
            { status: 503 }
        );
    }

    return NextResponse.json(session, { status: 201 });
}
