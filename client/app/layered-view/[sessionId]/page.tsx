'use client';

import React, { useEffect, useRef, useState, useCallback, use } from 'react';
import TimelineNavigator from '@/components/timeline-navigator';
import LayeredGraph from '@/components/layered-graph';

interface GraphNode {
    id: string;
    name: string;
    type: 'Concept' | 'Entity' | 'Action' | 'Emotion';
    val?: number;
    color?: string;
    description?: string;
}

interface GraphLink {
    source: string;
    target: string;
    value?: number;
    label?: string;
    description?: string;
}

interface LayerMeta {
    layerId: string;
    timestamp: number;
    agentType?: string;
    originalText?: string;
}

interface LayerData {
    meta: LayerMeta;
    nodes: GraphNode[];
    links: GraphLink[];
}

interface PageProps {
    params: Promise<{ sessionId: string }>;
}

export default function LayeredViewSessionPage({ params }: PageProps) {
    const { sessionId } = use(params);

    const [layers, setLayers] = useState<LayerData[]>([]);
    const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const socketRef = useRef<WebSocket | null>(null);
    const messageBuffer = useRef<string>('');
    const currentAgentType = useRef<string | null>(null);

    // Load existing session data on mount
    useEffect(() => {
        const LoadSessionData = async () => {
            try {
                const response = await fetch(`/api/layered-sessions/${sessionId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.layers && data.layers.length > 0) {
                        setLayers(data.layers);
                        setCurrentLayerIndex(data.layers.length - 1);
                    }
                }
            } catch (error) {
                console.error('Failed to load session data:', error);
            } finally {
                setIsInitialLoading(false);
            }
        };

        LoadSessionData();
    }, [sessionId]);

    // Resize handler
    useEffect(() => {
        const UpdateDimensions = () => {
            // Subtract timeline width (20% of viewport)
            const timelineWidth = Math.min(280, window.innerWidth * 0.2);
            setDimensions({
                width: window.innerWidth - timelineWidth,
                height: window.innerHeight,
            });
        };

        window.addEventListener('resize', UpdateDimensions);
        UpdateDimensions();

        return () => window.removeEventListener('resize', UpdateDimensions);
    }, []);

    // Process message and create new layer
    const ProcessMessage = useCallback(
        async (text: string, agentType: string | null) => {
            console.log('Processing message for layer:', text);
            setIsLoading(true);

            try {
                const response = await fetch('/api/layered-analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text,
                        sessionId,
                        agentType: agentType || '',
                    }),
                });

                if (!response.ok) {
                    console.error('Failed to analyze text');
                    return;
                }

                const result = await response.json();
                console.log('Layer analysis result:', result);

                // Add new layer
                const newLayer: LayerData = {
                    meta: {
                        layerId: result.layerId,
                        timestamp: result.timestamp,
                        agentType: result.agentType,
                        originalText: text,
                    },
                    nodes: result.nodes,
                    links: result.links,
                };

                setLayers((prev) => {
                    const updated = [...prev, newLayer];
                    // Auto-navigate to new layer
                    setCurrentLayerIndex(updated.length - 1);
                    return updated;
                });
            } catch (error) {
                console.error('Error processing message:', error);
            } finally {
                setIsLoading(false);
            }
        },
        [sessionId]
    );

    // WebSocket Connection
    useEffect(() => {
        const wsUrl = 'ws://localhost:4001/ws/chat';
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
            console.log('Connected to WebSocket');
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.agentType) {
                    const { agentType, response, text: rawText } = data;
                    const text = response || rawText || '';

                    if (text === '[END]') {
                        if (messageBuffer.current.trim()) {
                            ProcessMessage(messageBuffer.current, currentAgentType.current);
                            messageBuffer.current = '';
                        }
                        return;
                    }

                    if (
                        currentAgentType.current !== null &&
                        currentAgentType.current !== agentType
                    ) {
                        if (messageBuffer.current.trim()) {
                            ProcessMessage(messageBuffer.current, currentAgentType.current);
                        }
                        messageBuffer.current = '';
                    }

                    currentAgentType.current = agentType;
                    messageBuffer.current = text;
                }
            } catch (e) {
                console.error('Error parsing message', e);
            }
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        };
    }, [sessionId, ProcessMessage]);

    const HandleLayerSelect = useCallback((index: number) => {
        setCurrentLayerIndex(index);
    }, []);

    const HandleLayerChange = useCallback((index: number) => {
        setCurrentLayerIndex(index);
    }, []);

    // Extract layer metas for timeline
    const layerMetas = layers.map((l) => l.meta);

    if (isInitialLoading) {
        return (
            <div
                style={{
                    width: '100vw',
                    height: '100vh',
                    backgroundColor: '#000011',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#00d2ff',
                    fontFamily: 'sans-serif',
                    fontSize: '18px',
                }}
            >
                Loading session...
            </div>
        );
    }

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                backgroundColor: '#000011',
                overflow: 'hidden',
                display: 'flex',
            }}
        >
            {/* Main Graph Area */}
            <div
                style={{
                    flex: 1,
                    position: 'relative',
                }}
            >
                <LayeredGraph
                    layers={layers}
                    currentLayerIndex={currentLayerIndex}
                    onLayerChange={HandleLayerChange}
                    width={dimensions.width}
                    height={dimensions.height}
                />

                {/* Session ID Display */}
                <div
                    style={{
                        position: 'absolute',
                        top: 20,
                        right: 20,
                        color: 'rgba(255,255,255,0.5)',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        padding: '5px 10px',
                        borderRadius: '4px',
                    }}
                >
                    Session: {sessionId.slice(0, 8)}...
                </div>

                {/* Loading Indicator */}
                {isLoading && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 60,
                            right: 20,
                            color: '#00d2ff',
                            fontFamily: 'sans-serif',
                            fontSize: '14px',
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            padding: '8px 12px',
                            borderRadius: '20px',
                            border: '1px solid #00d2ff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 0 10px rgba(0, 210, 255, 0.3)',
                        }}
                    >
                        <div
                            style={{
                                width: '12px',
                                height: '12px',
                                border: '2px solid #00d2ff',
                                borderTop: '2px solid transparent',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }}
                        />
                        Creating layer...
                        <style jsx>{`
                            @keyframes spin {
                                0% {
                                    transform: rotate(0deg);
                                }
                                100% {
                                    transform: rotate(360deg);
                                }
                            }
                        `}</style>
                    </div>
                )}
            </div>

            {/* Timeline Navigator */}
            <div
                style={{
                    width: 'min(280px, 20vw)',
                    height: '100%',
                    flexShrink: 0,
                }}
            >
                <TimelineNavigator
                    layers={layerMetas}
                    currentLayerIndex={currentLayerIndex}
                    onLayerSelect={HandleLayerSelect}
                />
            </div>
        </div>
    );
}
