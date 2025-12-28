import { NextRequest, NextResponse } from 'next/server';
import { LayeredSessionRouter } from '@/lib/layered-session-router';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');

    const sessions = await LayeredSessionRouter.ListSessions(limit);

    return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const topic = body.topic || '';

        const session = await LayeredSessionRouter.CreateSession(topic);

        if (!session) {
            return NextResponse.json(
                { error: 'Failed to create session' },
                { status: 500 }
            );
        }

        return NextResponse.json(session);
    } catch (error) {
        console.error('Error creating layered session:', error);
        return NextResponse.json(
            { error: 'Failed to create session' },
            { status: 500 }
        );
    }
}
