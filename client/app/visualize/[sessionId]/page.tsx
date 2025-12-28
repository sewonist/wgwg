'use client';

import React, { useEffect, useRef, useState, use } from 'react';
import dynamic from 'next/dynamic';
import { ForceGraphMethods, NodeObject, LinkObject } from 'react-force-graph-2d';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="text-white">Loading Graph...</div>
});

interface GraphNode extends NodeObject {
    id: string;
    name: string;
    type: 'Concept' | 'Entity' | 'Action' | 'Emotion';
    val: number;
    color?: string;
    description?: string;
}

interface GraphLink extends LinkObject {
    source: string | GraphNode;
    target: string | GraphNode;
    value: number;
    label?: string;
    description?: string;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

interface PageProps {
    params: Promise<{ sessionId: string }>;
}

export default function SessionVisualizePage({ params }: PageProps) {
    const { sessionId } = use(params);

    const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
    const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const socketRef = useRef<WebSocket | null>(null);
    const messageBuffer = useRef<string>("");
    const currentAgentType = useRef<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [connectedNodeIds, setConnectedNodeIds] = useState<Set<string>>(new Set());

    // Load existing session data on mount
    useEffect(() => {
        const LoadSessionData = async () => {
            try {
                const response = await fetch(`/api/sessions/${sessionId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.ontology && (data.ontology.nodes.length > 0 || data.ontology.links.length > 0)) {
                        const loadedNodes = data.ontology.nodes.map((n: GraphNode) => ({
                            ...n,
                            val: n.val || 5,
                            color: n.color || GetNodeColor(n.type)
                        }));
                        const loadedLinks = data.ontology.links.map((l: GraphLink) => ({
                            ...l,
                            value: l.value || 1
                        }));
                        setGraphData({ nodes: loadedNodes, links: loadedLinks });
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
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        window.addEventListener('resize', UpdateDimensions);
        UpdateDimensions();

        return () => window.removeEventListener('resize', UpdateDimensions);
    }, []);

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
                    const text = response || rawText || "";

                    if (text === "[END]") {
                        if (messageBuffer.current.trim()) {
                            ProcessMessage(messageBuffer.current);
                            messageBuffer.current = "";
                        }
                        return;
                    }

                    if (currentAgentType.current !== null && currentAgentType.current !== agentType) {
                        if (messageBuffer.current.trim()) {
                            ProcessMessage(messageBuffer.current);
                        }
                        messageBuffer.current = "";
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
    }, [sessionId]);

    const ProcessMessage = async (text: string) => {
        console.log("Processing message:", text);
        setIsLoading(true);
        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, sessionId })
            });

            if (!response.ok) {
                console.error("Failed to analyze text");
                return;
            }

            const result = await response.json();
            console.log("Analysis result:", result);
            UpdateGraph(result);

        } catch (error) {
            console.error("Error processing message:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const UpdateGraph = (ontology: { nodes: GraphNode[], links: GraphLink[] }) => {
        setGraphData((prevData) => {
            const newNodes = [...prevData.nodes];
            const newLinks = [...prevData.links];
            const idMapping: { [key: string]: string } = {};

            const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, '');
            ontology.nodes.forEach(n => {
                const existingNode = newNodes.find(node => normalize(node.name) === normalize(n.name));

                if (existingNode) {
                    existingNode.val += 1;
                    idMapping[n.id] = existingNode.id;
                } else {
                    newNodes.push({
                        ...n,
                        val: 5,
                        color: GetNodeColor(n.type)
                    });
                    idMapping[n.id] = n.id;
                }
            });

            ontology.links.forEach(l => {
                const sourceId = idMapping[l.source as string] !== undefined ? idMapping[l.source as string] : l.source as string;
                const targetId = idMapping[l.target as string] !== undefined ? idMapping[l.target as string] : l.target as string;

                const sourceExists = newNodes.some(n => n.id === sourceId);
                const targetExists = newNodes.some(n => n.id === targetId);

                if (!sourceExists || !targetExists) {
                    console.warn(`Skipping invalid link: ${sourceId} -> ${targetId}`);
                    return;
                }

                const existingLink = newLinks.find(link =>
                    (link.source === sourceId && link.target === targetId) ||
                    (typeof link.source !== 'string' && (link.source as GraphNode).id === sourceId &&
                        typeof link.target !== 'string' && (link.target as GraphNode).id === targetId)
                );

                if (!existingLink) {
                    newLinks.push({
                        ...l,
                        source: sourceId,
                        target: targetId,
                        value: 1
                    });
                }
            });

            return { nodes: newNodes, links: newLinks };
        });
    };

    const GetNodeColor = (type: string) => {
        switch (type) {
            case 'Concept': return '#00d2ff';
            case 'Entity': return '#ff0055';
            case 'Action': return '#00ffaa';
            case 'Emotion': return '#ffff00';
            default: return '#ffffff';
        }
    };

    const GetConnectedNodeIds = (nodeId: string): Set<string> => {
        const connected = new Set<string>();
        connected.add(nodeId);
        graphData.links.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
            if (sourceId === nodeId) {
                connected.add(targetId);
            } else if (targetId === nodeId) {
                connected.add(sourceId);
            }
        });
        return connected;
    };

    const HandleNodeHover = (node: NodeObject | null) => {
        if (node) {
            const graphNode = node as GraphNode;
            setHoveredNode(graphNode);
            setConnectedNodeIds(GetConnectedNodeIds(graphNode.id));
        } else {
            setHoveredNode(null);
            setConnectedNodeIds(new Set());
        }
    };

    if (isInitialLoading) {
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
                Loading session...
            </div>
        );
    }

    return (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000011', overflow: 'hidden' }}>
            <ForceGraph2D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}

                nodeLabel={() => ''}
                nodeColor="color"
                nodeRelSize={4}

                linkColor={(link) => {
                    if (!hoveredNode) return 'rgba(255,255,255,0.2)';
                    const l = link as GraphLink;
                    const sourceId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
                    const targetId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
                    const isConnected = connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId);
                    return isConnected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.05)';
                }}
                linkWidth={1}
                linkDirectionalArrowLength={3.5}
                linkDirectionalArrowRelPos={1}
                linkLabel="label"

                d3VelocityDecay={0.6}
                d3AlphaDecay={0.01}

                linkDirectionalParticles={2}
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalParticleWidth={2}

                backgroundColor="#000011"
                minZoom={0.5}
                maxZoom={8}

                onNodeHover={HandleNodeHover}

                nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.name;
                    const fontSize = 12 / globalScale;

                    const n = node as GraphNode;
                    const r = Math.sqrt(Math.max(0, n.val || 1)) * 2;

                    const isHighlighted = !hoveredNode || connectedNodeIds.has(n.id);
                    const opacity = isHighlighted ? 1 : 0.15;

                    ctx.beginPath();
                    ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI, false);
                    ctx.globalAlpha = opacity;
                    ctx.fillStyle = n.color || '#fff';
                    ctx.fill();

                    if (isHighlighted) {
                        ctx.shadowBlur = 15;
                        ctx.shadowColor = n.color || '#fff';
                    }

                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
                    ctx.fillText(label, n.x!, n.y! + r + fontSize);

                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 1;
                }}
                linkCanvasObjectMode={() => 'after'}
                linkCanvasObject={(link, ctx, globalScale) => {
                    const l = link as GraphLink;
                    if (!l.label) return;

                    const start = l.source as GraphNode;
                    const end = l.target as GraphNode;

                    if (typeof start !== 'object' || typeof end !== 'object') return;

                    const textPos = { x: start.x! + (end.x! - start.x!) / 2, y: start.y! + (end.y! - start.y!) / 2 };

                    const fontSize = 10 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    const textWidth = ctx.measureText(l.label).width;
                    const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                    ctx.fillStyle = 'rgba(0, 0, 17, 0.8)';
                    ctx.fillRect(textPos.x - bckgDimensions[0] / 2, textPos.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.fillText(l.label, textPos.x, textPos.y);
                }}
            />

            {/* Session ID Display */}
            <div style={{
                position: 'absolute',
                top: 20,
                right: 20,
                color: 'rgba(255,255,255,0.5)',
                fontFamily: 'monospace',
                fontSize: '12px',
                backgroundColor: 'rgba(0,0,0,0.5)',
                padding: '5px 10px',
                borderRadius: '4px'
            }}>
                Session: {sessionId.slice(0, 8)}...
            </div>

            {/* Node Legend */}
            <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', fontFamily: 'sans-serif', pointerEvents: 'none', backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Node Legend</h3>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ width: 12, height: 12, backgroundColor: '#00d2ff', borderRadius: '50%', marginRight: 8 }}></span>
                    <span style={{ fontSize: '14px' }}>Concept</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ width: 12, height: 12, backgroundColor: '#ff0055', borderRadius: '50%', marginRight: 8 }}></span>
                    <span style={{ fontSize: '14px' }}>Entity</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ width: 12, height: 12, backgroundColor: '#00ffaa', borderRadius: '50%', marginRight: 8 }}></span>
                    <span style={{ fontSize: '14px' }}>Action</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: 12, height: 12, backgroundColor: '#ffff00', borderRadius: '50%', marginRight: 8 }}></span>
                    <span style={{ fontSize: '14px' }}>Emotion</span>
                </div>
            </div>

            {/* Loading Indicator */}
            {isLoading && (
                <div style={{
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
                    boxShadow: '0 0 10px rgba(0, 210, 255, 0.3)'
                }}>
                    <div style={{
                        width: '12px',
                        height: '12px',
                        border: '2px solid #00d2ff',
                        borderTop: '2px solid transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    Processing...
                    <style jsx>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            )}

            {/* Node Description Tooltip */}
            {hoveredNode && hoveredNode.description && (
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    left: 20,
                    maxWidth: '400px',
                    color: 'white',
                    fontFamily: 'sans-serif',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: '15px',
                    borderRadius: '8px',
                    border: `1px solid ${hoveredNode.color || '#00d2ff'}`,
                    boxShadow: `0 0 15px ${hoveredNode.color || '#00d2ff'}40`
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '8px',
                        gap: '8px'
                    }}>
                        <span style={{
                            width: 10,
                            height: 10,
                            backgroundColor: hoveredNode.color,
                            borderRadius: '50%'
                        }}></span>
                        <span style={{
                            fontSize: '16px',
                            fontWeight: 'bold'
                        }}>{hoveredNode.name}</span>
                        <span style={{
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.5)',
                            marginLeft: 'auto'
                        }}>{hoveredNode.type}</span>
                    </div>
                    <p style={{
                        margin: 0,
                        fontSize: '14px',
                        lineHeight: '1.5',
                        color: 'rgba(255,255,255,0.8)'
                    }}>{hoveredNode.description}</p>
                </div>
            )}
        </div>
    );
}
