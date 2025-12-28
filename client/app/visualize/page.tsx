'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VisualizePage() {
    const router = useRouter();

    useEffect(() => {
        const CreateAndRedirect = async () => {
            try {
                const response = await fetch('/api/sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });

                if (!response.ok) {
                    const fallbackId = crypto.randomUUID();
                    router.replace(`/visualize/${fallbackId}`);
                    return;
                }

                const session = await response.json();
                router.replace(`/visualize/${session.sessionId}`);
            } catch (err) {
                console.error('Failed to create session:', err);
                const fallbackId = crypto.randomUUID();
                router.replace(`/visualize/${fallbackId}`);
            }
        };

        CreateAndRedirect();
    }, [router]);

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            backgroundColor: '#000011',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00d2ff',
            fontFamily: 'sans-serif',
            fontSize: '18px'
        }}>
            Creating new session...
        </div>
    );
}
