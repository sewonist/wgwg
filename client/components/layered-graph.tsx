'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ForceGraphMethods, NodeObject, LinkObject } from 'react-force-graph-2d';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="text-white">Loading Graph...</div>,
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

interface LayerData {
    meta: {
        layerId: string;
        timestamp: number;
        agentType?: string;
    };
    nodes: GraphNode[];
    links: GraphLink[];
}

interface LayeredGraphProps {
    layers: LayerData[];
    currentLayerIndex: number;
    onLayerChange: (index: number) => void;
    width: number;
    height: number;
}

const AGENT_COLORS: Record<string, string> = {
    'FRITZ': '#ff6b6b',
    'BOB': '#4ecdc4',
    'DONNA': '#ffe66d',
    'BEN': '#95e1d3',
    'JOHN': '#dfe6e9',
    'MODERATOR': '#a29bfe',
    '': '#00d2ff',
};

function GetAgentColor(agentType?: string): string {
    if (!agentType) return AGENT_COLORS[''];
    const upperType = agentType.toUpperCase();
    return AGENT_COLORS[upperType] || AGENT_COLORS[''];
}

function GetNodeColor(type: string): string {
    switch (type) {
        case 'Concept':
            return '#00d2ff';
        case 'Entity':
            return '#ff0055';
        case 'Action':
            return '#00ffaa';
        case 'Emotion':
            return '#ffff00';
        default:
            return '#ffffff';
    }
}

export default function LayeredGraph({
    layers,
    currentLayerIndex,
    onLayerChange,
    width,
    height,
}: LayeredGraphProps) {
    const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [connectedNodeIds, setConnectedNodeIds] = useState<Set<string>>(new Set());
    const [isTransitioning, setIsTransitioning] = useState(false);

    const currentLayer = layers[currentLayerIndex] || null;

    // Process graph data for current layer
    const graphData = useMemo(() => {
        if (!currentLayer) {
            return { nodes: [], links: [] };
        }

        const nodes: GraphNode[] = currentLayer.nodes.map((n) => ({
            ...n,
            val: n.val || 5,
            color: n.color || GetNodeColor(n.type),
        }));

        const links: GraphLink[] = currentLayer.links.map((l) => ({
            ...l,
            value: l.value || 1,
        }));

        return { nodes, links };
    }, [currentLayer]);

    // Keyboard navigation
    useEffect(() => {
        const HandleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                if (currentLayerIndex > 0) {
                    setIsTransitioning(true);
                    onLayerChange(currentLayerIndex - 1);
                }
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                if (currentLayerIndex < layers.length - 1) {
                    setIsTransitioning(true);
                    onLayerChange(currentLayerIndex + 1);
                }
            }
        };

        window.addEventListener('keydown', HandleKeyDown);
        return () => window.removeEventListener('keydown', HandleKeyDown);
    }, [currentLayerIndex, layers.length, onLayerChange]);

    // Transition animation
    useEffect(() => {
        if (isTransitioning) {
            const timer = setTimeout(() => setIsTransitioning(false), 500);
            return () => clearTimeout(timer);
        }
    }, [isTransitioning]);

    const GetConnectedNodeIds = (nodeId: string): Set<string> => {
        const connected = new Set<string>();
        connected.add(nodeId);
        graphData.links.forEach((link) => {
            const sourceId =
                typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
            const targetId =
                typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
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

    const agentColor = currentLayer ? GetAgentColor(currentLayer.meta.agentType) : '#00d2ff';

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                backgroundColor: '#000011',
                overflow: 'hidden',
            }}
        >
            {/* Layer Stack Visualization (background) */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    perspective: '1000px',
                    perspectiveOrigin: 'center 30%',
                    pointerEvents: 'none',
                }}
            >
                {layers.map((layer, index) => {
                    const offset = index - currentLayerIndex;
                    const isActive = index === currentLayerIndex;

                    // Only render nearby layers for performance
                    if (Math.abs(offset) > 3) return null;

                    return (
                        <div
                            key={layer.meta.layerId}
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                width: '80%',
                                height: '60%',
                                transform: `
                                    translate(-50%, -50%)
                                    translateZ(${offset * -150}px)
                                    rotateX(${isActive ? 0 : 60}deg)
                                    scale(${isActive ? 1 : 0.7})
                                `,
                                opacity: isActive ? 1 : 0.15 - Math.abs(offset) * 0.03,
                                border: `1px solid ${GetAgentColor(layer.meta.agentType)}`,
                                borderRadius: '8px',
                                backgroundColor: `${GetAgentColor(layer.meta.agentType)}10`,
                                transition: isTransitioning
                                    ? 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                    : 'none',
                                pointerEvents: 'none',
                            }}
                        />
                    );
                })}
            </div>

            {/* Force Graph for current layer */}
            {currentLayer && graphData.nodes.length > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: isTransitioning ? 0.5 : 1,
                        transition: 'opacity 0.3s ease',
                    }}
                >
                    <ForceGraph2D
                        ref={fgRef}
                        width={width}
                        height={height}
                        graphData={graphData}
                        nodeLabel={() => ''}
                        nodeColor="color"
                        nodeRelSize={4}
                        linkColor={(link) => {
                            if (!hoveredNode) return 'rgba(255,255,255,0.2)';
                            const l = link as GraphLink;
                            const sourceId =
                                typeof l.source === 'string'
                                    ? l.source
                                    : (l.source as GraphNode).id;
                            const targetId =
                                typeof l.target === 'string'
                                    ? l.target
                                    : (l.target as GraphNode).id;
                            const isConnected =
                                connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId);
                            return isConnected
                                ? 'rgba(255,255,255,0.4)'
                                : 'rgba(255,255,255,0.05)';
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
                        backgroundColor="transparent"
                        minZoom={0.5}
                        maxZoom={8}
                        onNodeHover={HandleNodeHover}
                        nodeCanvasObject={(node, ctx, globalScale) => {
                            const label = node.name;
                            const fontSize = Math.max(
                                2 / globalScale,
                                Math.min(2, 6 * globalScale)
                            );

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

                            const textPos = {
                                x: start.x! + (end.x! - start.x!) / 2,
                                y: start.y! + (end.y! - start.y!) / 2,
                            };

                            const fontSize = Math.max(
                                2 / globalScale,
                                Math.min(2, 5 * globalScale)
                            );
                            ctx.font = `${fontSize}px Sans-Serif`;
                            const textWidth = ctx.measureText(l.label).width;
                            const bckgDimensions = [textWidth, fontSize].map(
                                (n) => n + fontSize * 0.2
                            );

                            ctx.fillStyle = 'rgba(0, 0, 17, 0.8)';
                            ctx.fillRect(
                                textPos.x - bckgDimensions[0] / 2,
                                textPos.y - bckgDimensions[1] / 2,
                                bckgDimensions[0],
                                bckgDimensions[1]
                            );
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                            ctx.fillText(l.label, textPos.x, textPos.y);
                        }}
                    />
                </div>
            )}

            {/* Empty state */}
            {(!currentLayer || graphData.nodes.length === 0) && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'rgba(255, 255, 255, 0.4)',
                        fontSize: '16px',
                        textAlign: 'center',
                    }}
                >
                    {layers.length === 0 ? (
                        <>
                            <div style={{ marginBottom: '8px' }}>Waiting for data...</div>
                            <div style={{ fontSize: '13px' }}>
                                Messages will appear as layers
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ marginBottom: '8px' }}>No nodes in this layer</div>
                            <div style={{ fontSize: '13px' }}>
                                Use timeline to navigate between layers
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Current layer indicator */}
            {currentLayer && (
                <div
                    style={{
                        position: 'absolute',
                        top: 20,
                        left: 20,
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: `1px solid ${agentColor}40`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}
                    >
                        <span
                            style={{
                                color: 'white',
                                fontSize: '16px',
                                fontWeight: 'bold',
                            }}
                        >
                            Layer {currentLayerIndex + 1}
                        </span>
                        <span
                            style={{
                                color: 'rgba(255,255,255,0.5)',
                                fontSize: '14px',
                            }}
                        >
                            / {layers.length}
                        </span>
                        {currentLayer.meta.agentType && (
                            <span
                                style={{
                                    color: agentColor,
                                    fontSize: '12px',
                                    padding: '2px 8px',
                                    backgroundColor: `${agentColor}20`,
                                    borderRadius: '4px',
                                }}
                            >
                                {currentLayer.meta.agentType}
                            </span>
                        )}
                    </div>
                    <div
                        style={{
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontSize: '12px',
                        }}
                    >
                        {graphData.nodes.length} nodes, {graphData.links.length} links
                    </div>
                </div>
            )}

            {/* Node Legend */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 20,
                    left: 20,
                    color: 'white',
                    fontFamily: 'sans-serif',
                    pointerEvents: 'none',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    padding: '10px',
                    borderRadius: '8px',
                }}
            >
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Node Types</h3>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <span
                        style={{
                            width: 10,
                            height: 10,
                            backgroundColor: '#00d2ff',
                            borderRadius: '50%',
                            marginRight: 8,
                        }}
                    ></span>
                    <span style={{ fontSize: '12px' }}>Concept</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <span
                        style={{
                            width: 10,
                            height: 10,
                            backgroundColor: '#ff0055',
                            borderRadius: '50%',
                            marginRight: 8,
                        }}
                    ></span>
                    <span style={{ fontSize: '12px' }}>Entity</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <span
                        style={{
                            width: 10,
                            height: 10,
                            backgroundColor: '#00ffaa',
                            borderRadius: '50%',
                            marginRight: 8,
                        }}
                    ></span>
                    <span style={{ fontSize: '12px' }}>Action</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span
                        style={{
                            width: 10,
                            height: 10,
                            backgroundColor: '#ffff00',
                            borderRadius: '50%',
                            marginRight: 8,
                        }}
                    ></span>
                    <span style={{ fontSize: '12px' }}>Emotion</span>
                </div>
            </div>

            {/* Node Description Tooltip */}
            {hoveredNode && hoveredNode.description && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 20,
                        right: 20,
                        maxWidth: '300px',
                        color: 'white',
                        fontFamily: 'sans-serif',
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: '15px',
                        borderRadius: '8px',
                        border: `1px solid ${hoveredNode.color || '#00d2ff'}`,
                        boxShadow: `0 0 15px ${hoveredNode.color || '#00d2ff'}40`,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '8px',
                            gap: '8px',
                        }}
                    >
                        <span
                            style={{
                                width: 10,
                                height: 10,
                                backgroundColor: hoveredNode.color,
                                borderRadius: '50%',
                            }}
                        ></span>
                        <span
                            style={{
                                fontSize: '14px',
                                fontWeight: 'bold',
                            }}
                        >
                            {hoveredNode.name}
                        </span>
                        <span
                            style={{
                                fontSize: '11px',
                                color: 'rgba(255,255,255,0.5)',
                                marginLeft: 'auto',
                            }}
                        >
                            {hoveredNode.type}
                        </span>
                    </div>
                    <p
                        style={{
                            margin: 0,
                            fontSize: '13px',
                            lineHeight: '1.5',
                            color: 'rgba(255,255,255,0.8)',
                        }}
                    >
                        {hoveredNode.description}
                    </p>
                </div>
            )}
        </div>
    );
}
