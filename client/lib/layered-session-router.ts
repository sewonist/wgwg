import { redis, checkRedisAvailable } from './redis';

export interface GraphNode {
    id: string;
    name: string;
    type: 'Concept' | 'Entity' | 'Action' | 'Emotion';
    val?: number;
    color?: string;
    description?: string;
}

export interface GraphLink {
    source: string;
    target: string;
    value?: number;
    label?: string;
    description?: string;
}

export interface OntologyData {
    nodes: GraphNode[];
    links: GraphLink[];
}

export interface LayerMeta {
    layerId: string;
    timestamp: number;
    agentType?: string;
    originalText?: string;
}

export interface LayerData {
    meta: LayerMeta;
    nodes: GraphNode[];
    links: GraphLink[];
}

export interface LayeredSessionConfig {
    sessionId: string;
    topic?: string;
    createdAt: number;
    updatedAt: number;
    status: 'active' | 'completed';
    layerCount: number;
}

export interface LayeredOntologyData {
    layers: LayerData[];
}

const KEYS = {
    SessionsList: 'layered-sessions:list',
    SessionMeta: (id: string) => `layered-session:${id}:meta`,
    SessionLayers: (id: string) => `layered-session:${id}:layers`,
    LayerNodes: (sessionId: string, layerId: string) => `layered-session:${sessionId}:layer:${layerId}:nodes`,
    LayerLinks: (sessionId: string, layerId: string) => `layered-session:${sessionId}:layer:${layerId}:links`,
    LayerMeta: (sessionId: string, layerId: string) => `layered-session:${sessionId}:layer:${layerId}:meta`,
};

export class LayeredSessionRouter {
    static GenerateSessionId(): string {
        return crypto.randomUUID();
    }

    static GenerateLayerId(): string {
        return crypto.randomUUID();
    }

    static async CreateSession(topic?: string): Promise<LayeredSessionConfig | null> {
        if (!checkRedisAvailable()) {
            return null;
        }

        const sessionId = this.GenerateSessionId();
        const now = Date.now();

        const config: LayeredSessionConfig = {
            sessionId,
            topic: topic || '',
            createdAt: now,
            updatedAt: now,
            status: 'active',
            layerCount: 0,
        };

        try {
            await redis.hset(KEYS.SessionMeta(sessionId), {
                sessionId: config.sessionId,
                topic: config.topic,
                createdAt: config.createdAt.toString(),
                updatedAt: config.updatedAt.toString(),
                status: config.status,
                layerCount: config.layerCount.toString(),
            });

            await redis.zadd(KEYS.SessionsList, now, sessionId);

            return config;
        } catch (error) {
            console.error('Failed to create layered session:', error);
            return null;
        }
    }

    static async GetSession(sessionId: string): Promise<LayeredSessionConfig | null> {
        if (!checkRedisAvailable()) {
            return null;
        }

        try {
            const meta = await redis.hgetall(KEYS.SessionMeta(sessionId));

            if (!meta || !meta.sessionId) {
                return null;
            }

            return {
                sessionId: meta.sessionId,
                topic: meta.topic || '',
                createdAt: parseInt(meta.createdAt) || 0,
                updatedAt: parseInt(meta.updatedAt) || 0,
                status: (meta.status as 'active' | 'completed') || 'active',
                layerCount: parseInt(meta.layerCount) || 0,
            };
        } catch (error) {
            console.error('Failed to get layered session:', error);
            return null;
        }
    }

    static async ListSessions(limit: number = 20): Promise<LayeredSessionConfig[]> {
        if (!checkRedisAvailable()) {
            return [];
        }

        try {
            const sessionIds = await redis.zrevrange(KEYS.SessionsList, 0, limit - 1);

            const sessions: LayeredSessionConfig[] = [];
            for (const sessionId of sessionIds) {
                const session = await this.GetSession(sessionId);
                if (session) {
                    sessions.push(session);
                }
            }

            return sessions;
        } catch (error) {
            console.error('Failed to list layered sessions:', error);
            return [];
        }
    }

    static async CreateLayer(
        sessionId: string,
        meta: Partial<LayerMeta>
    ): Promise<LayerMeta | null> {
        if (!checkRedisAvailable()) {
            return null;
        }

        const layerId = meta.layerId || this.GenerateLayerId();
        const timestamp = meta.timestamp || Date.now();

        const layerMeta: LayerMeta = {
            layerId,
            timestamp,
            agentType: meta.agentType || '',
            originalText: meta.originalText || '',
        };

        try {
            // Save layer meta
            await redis.hset(KEYS.LayerMeta(sessionId, layerId), {
                layerId: layerMeta.layerId,
                timestamp: layerMeta.timestamp.toString(),
                agentType: layerMeta.agentType || '',
                originalText: layerMeta.originalText || '',
            });

            // Add to layers sorted set (by timestamp)
            await redis.zadd(KEYS.SessionLayers(sessionId), timestamp, layerId);

            // Update session layer count and timestamp
            const layerCount = await redis.zcard(KEYS.SessionLayers(sessionId));
            await redis.hset(KEYS.SessionMeta(sessionId), {
                updatedAt: Date.now().toString(),
                layerCount: layerCount.toString(),
            });

            return layerMeta;
        } catch (error) {
            console.error('Failed to create layer:', error);
            return null;
        }
    }

    static async SaveLayerOntology(
        sessionId: string,
        layerId: string,
        data: OntologyData
    ): Promise<boolean> {
        if (!checkRedisAvailable()) {
            return false;
        }

        try {
            // Save nodes as hash (nodeId -> JSON)
            if (data.nodes.length > 0) {
                const nodeEntries: Record<string, string> = {};

                for (const node of data.nodes) {
                    nodeEntries[node.id] = JSON.stringify(node);
                }

                await redis.hset(KEYS.LayerNodes(sessionId, layerId), nodeEntries);
            }

            // Save links as list
            if (data.links.length > 0) {
                const linkJsons = data.links.map(link => JSON.stringify(link));
                await redis.del(KEYS.LayerLinks(sessionId, layerId));
                await redis.rpush(KEYS.LayerLinks(sessionId, layerId), ...linkJsons);
            }

            // Update session timestamp
            await redis.hset(KEYS.SessionMeta(sessionId), {
                updatedAt: Date.now().toString(),
            });

            return true;
        } catch (error) {
            console.error('Failed to save layer ontology:', error);
            return false;
        }
    }

    static async GetLayer(sessionId: string, layerId: string): Promise<LayerData | null> {
        if (!checkRedisAvailable()) {
            return null;
        }

        try {
            // Get layer meta
            const metaHash = await redis.hgetall(KEYS.LayerMeta(sessionId, layerId));

            if (!metaHash || !metaHash.layerId) {
                return null;
            }

            const meta: LayerMeta = {
                layerId: metaHash.layerId,
                timestamp: parseInt(metaHash.timestamp) || 0,
                agentType: metaHash.agentType || '',
                originalText: metaHash.originalText || '',
            };

            // Get nodes
            const nodesHash = await redis.hgetall(KEYS.LayerNodes(sessionId, layerId));
            const nodes: GraphNode[] = Object.values(nodesHash).map(json => JSON.parse(json));

            // Get links
            const linksJson = await redis.lrange(KEYS.LayerLinks(sessionId, layerId), 0, -1);
            const links: GraphLink[] = linksJson.map(json => JSON.parse(json));

            return { meta, nodes, links };
        } catch (error) {
            console.error('Failed to get layer:', error);
            return null;
        }
    }

    static async GetAllLayers(sessionId: string): Promise<LayerData[]> {
        if (!checkRedisAvailable()) {
            return [];
        }

        try {
            // Get all layer IDs sorted by timestamp
            const layerIds = await redis.zrange(KEYS.SessionLayers(sessionId), 0, -1);

            const layers: LayerData[] = [];
            for (const layerId of layerIds) {
                const layer = await this.GetLayer(sessionId, layerId);
                if (layer) {
                    layers.push(layer);
                }
            }

            return layers;
        } catch (error) {
            console.error('Failed to get all layers:', error);
            return [];
        }
    }

    static async DeleteSession(sessionId: string): Promise<boolean> {
        if (!checkRedisAvailable()) {
            return false;
        }

        try {
            // Get all layer IDs
            const layerIds = await redis.zrange(KEYS.SessionLayers(sessionId), 0, -1);

            // Delete all layer data
            const keysToDelete: string[] = [
                KEYS.SessionMeta(sessionId),
                KEYS.SessionLayers(sessionId),
            ];

            for (const layerId of layerIds) {
                keysToDelete.push(
                    KEYS.LayerMeta(sessionId, layerId),
                    KEYS.LayerNodes(sessionId, layerId),
                    KEYS.LayerLinks(sessionId, layerId)
                );
            }

            await redis.del(...keysToDelete);
            await redis.zrem(KEYS.SessionsList, sessionId);

            return true;
        } catch (error) {
            console.error('Failed to delete layered session:', error);
            return false;
        }
    }

    static async GetLayerIds(sessionId: string): Promise<string[]> {
        if (!checkRedisAvailable()) {
            return [];
        }

        try {
            return await redis.zrange(KEYS.SessionLayers(sessionId), 0, -1);
        } catch (error) {
            console.error('Failed to get layer IDs:', error);
            return [];
        }
    }
}
