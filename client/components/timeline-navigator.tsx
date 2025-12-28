'use client';

import React, { useEffect, useRef } from 'react';

interface LayerMeta {
    layerId: string;
    timestamp: number;
    agentType?: string;
    originalText?: string;
}

interface TimelineNavigatorProps {
    layers: LayerMeta[];
    currentLayerIndex: number;
    onLayerSelect: (index: number) => void;
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

function FormatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export default function TimelineNavigator({
    layers,
    currentLayerIndex,
    onLayerSelect,
}: TimelineNavigatorProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to current layer
    useEffect(() => {
        if (containerRef.current && layers.length > 0) {
            const container = containerRef.current;
            const currentItem = container.querySelector(`[data-layer-index="${currentLayerIndex}"]`);
            if (currentItem) {
                currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentLayerIndex, layers.length]);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 17, 0.9)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'sans-serif',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <span>Timeline</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                    {layers.length} layers
                </span>
            </div>

            {/* Timeline items */}
            <div
                ref={containerRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: '8px 0',
                }}
            >
                {layers.length === 0 ? (
                    <div
                        style={{
                            padding: '20px',
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontSize: '13px',
                            textAlign: 'center',
                        }}
                    >
                        No layers yet.
                        <br />
                        Waiting for messages...
                    </div>
                ) : (
                    <div style={{ position: 'relative', paddingLeft: '24px' }}>
                        {/* Vertical line */}
                        <div
                            style={{
                                position: 'absolute',
                                left: '15px',
                                top: '12px',
                                bottom: '12px',
                                width: '2px',
                                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                            }}
                        />

                        {layers.map((layer, index) => {
                            const isActive = index === currentLayerIndex;
                            const color = GetAgentColor(layer.agentType);

                            return (
                                <div
                                    key={layer.layerId}
                                    data-layer-index={index}
                                    onClick={() => onLayerSelect(index)}
                                    style={{
                                        position: 'relative',
                                        padding: '12px 16px 12px 20px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        backgroundColor: isActive
                                            ? 'rgba(255, 255, 255, 0.05)'
                                            : 'transparent',
                                        borderRight: isActive
                                            ? `3px solid ${color}`
                                            : '3px solid transparent',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.backgroundColor =
                                                'rgba(255, 255, 255, 0.03)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }
                                    }}
                                >
                                    {/* Node circle */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: '-15px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            width: isActive ? '14px' : '10px',
                                            height: isActive ? '14px' : '10px',
                                            borderRadius: '50%',
                                            backgroundColor: color,
                                            border: `2px solid ${isActive ? 'white' : 'rgba(0,0,17,1)'}`,
                                            boxShadow: isActive
                                                ? `0 0 10px ${color}`
                                                : 'none',
                                            transition: 'all 0.2s ease',
                                        }}
                                    />

                                    {/* Layer content */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                        }}
                                    >
                                        {/* Layer number and agent */}
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    color: isActive ? 'white' : 'rgba(255,255,255,0.7)',
                                                    fontSize: '13px',
                                                    fontWeight: isActive ? 'bold' : 'normal',
                                                }}
                                            >
                                                Layer {index + 1}
                                            </span>
                                            {layer.agentType && (
                                                <span
                                                    style={{
                                                        color: color,
                                                        fontSize: '11px',
                                                        padding: '2px 6px',
                                                        backgroundColor: `${color}20`,
                                                        borderRadius: '4px',
                                                    }}
                                                >
                                                    {layer.agentType}
                                                </span>
                                            )}
                                        </div>

                                        {/* Timestamp */}
                                        <span
                                            style={{
                                                color: 'rgba(255, 255, 255, 0.4)',
                                                fontSize: '11px',
                                            }}
                                        >
                                            {FormatTime(layer.timestamp)}
                                        </span>

                                        {/* Preview text */}
                                        {layer.originalText && (
                                            <p
                                                style={{
                                                    margin: 0,
                                                    color: 'rgba(255, 255, 255, 0.5)',
                                                    fontSize: '11px',
                                                    lineHeight: '1.4',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    maxWidth: '100%',
                                                }}
                                            >
                                                {layer.originalText.slice(0, 100)}
                                                {layer.originalText.length > 100 ? '...' : ''}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer with keyboard hint */}
            <div
                style={{
                    padding: '12px 16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontSize: '11px',
                    textAlign: 'center',
                }}
            >
                Use arrow keys to navigate
            </div>
        </div>
    );
}
