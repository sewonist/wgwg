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

export interface SessionConfig {
    sessionId: string;
    topic?: string;
    createdAt: number;
    updatedAt: number;
    status: 'active' | 'completed';
}

const KEYS = {
    SessionsList: 'sessions:list',
    SessionMeta: (id: string) => `session:${id}:meta`,
    SessionNodes: (id: string) => `session:${id}:nodes`,
    SessionLinks: (id: string) => `session:${id}:links`,
    GlobalNodes: 'ontology:nodes',
};

export class SessionRouter {
    static GenerateSessionId(): string {
        return crypto.randomUUID();
    }

    static async CreateSession(topic?: string): Promise<SessionConfig | null> {
        if (!checkRedisAvailable()) {
            return null;
        }

        const sessionId = this.GenerateSessionId();
        const now = Date.now();

        const config: SessionConfig = {
            sessionId,
            topic: topic || '',
            createdAt: now,
            updatedAt: now,
            status: 'active',
        };

        try {
            await redis.hset(KEYS.SessionMeta(sessionId), {
                sessionId: config.sessionId,
                topic: config.topic,
                createdAt: config.createdAt.toString(),
                updatedAt: config.updatedAt.toString(),
                status: config.status,
            });

            await redis.zadd(KEYS.SessionsList, now, sessionId);

            return config;
        } catch (error) {
            console.error('Failed to create session:', error);
            return null;
        }
    }

    static async GetSession(sessionId: string): Promise<SessionConfig | null> {
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
            };
        } catch (error) {
            console.error('Failed to get session:', error);
            return null;
        }
    }

    static async ListSessions(limit: number = 20): Promise<SessionConfig[]> {
        if (!checkRedisAvailable()) {
            return [];
        }

        try {
            const sessionIds = await redis.zrevrange(KEYS.SessionsList, 0, limit - 1);

            const sessions: SessionConfig[] = [];
            for (const sessionId of sessionIds) {
                const session = await this.GetSession(sessionId);
                if (session) {
                    sessions.push(session);
                }
            }

            return sessions;
        } catch (error) {
            console.error('Failed to list sessions:', error);
            return [];
        }
    }

    static async SaveOntology(sessionId: string, data: OntologyData): Promise<boolean> {
        if (!checkRedisAvailable()) {
            return false;
        }

        try {
            // Save nodes as hash (nodeId -> JSON)
            if (data.nodes.length > 0) {
                const nodeEntries: Record<string, string> = {};
                const nodeNames: string[] = [];

                for (const node of data.nodes) {
                    nodeEntries[node.id] = JSON.stringify(node);
                    nodeNames.push(node.name);
                }

                await redis.hset(KEYS.SessionNodes(sessionId), nodeEntries);
                await redis.sadd(KEYS.GlobalNodes, ...nodeNames);
            }

            // Save links as list
            if (data.links.length > 0) {
                const linkJsons = data.links.map(link => JSON.stringify(link));
                await redis.del(KEYS.SessionLinks(sessionId));
                await redis.rpush(KEYS.SessionLinks(sessionId), ...linkJsons);
            }

            // Update session timestamp
            await redis.hset(KEYS.SessionMeta(sessionId), {
                updatedAt: Date.now().toString(),
            });

            return true;
        } catch (error) {
            console.error('Failed to save ontology:', error);
            return false;
        }
    }

    static async AppendOntology(sessionId: string, data: OntologyData): Promise<boolean> {
        if (!checkRedisAvailable()) {
            return false;
        }

        try {
            // Append nodes (HSET will overwrite existing keys, which is fine for updates)
            if (data.nodes.length > 0) {
                const nodeEntries: Record<string, string> = {};
                const nodeNames: string[] = [];

                for (const node of data.nodes) {
                    nodeEntries[node.id] = JSON.stringify(node);
                    nodeNames.push(node.name);
                }

                await redis.hset(KEYS.SessionNodes(sessionId), nodeEntries);
                await redis.sadd(KEYS.GlobalNodes, ...nodeNames);
            }

            // Append links
            if (data.links.length > 0) {
                const linkJsons = data.links.map(link => JSON.stringify(link));
                await redis.rpush(KEYS.SessionLinks(sessionId), ...linkJsons);
            }

            // Update session timestamp
            await redis.hset(KEYS.SessionMeta(sessionId), {
                updatedAt: Date.now().toString(),
            });

            return true;
        } catch (error) {
            console.error('Failed to append ontology:', error);
            return false;
        }
    }

    static async GetOntology(sessionId: string): Promise<OntologyData> {
        if (!checkRedisAvailable()) {
            return { nodes: [], links: [] };
        }

        try {
            // Get nodes
            const nodesHash = await redis.hgetall(KEYS.SessionNodes(sessionId));
            const nodes: GraphNode[] = Object.values(nodesHash).map(json => JSON.parse(json));

            // Get links
            const linksJson = await redis.lrange(KEYS.SessionLinks(sessionId), 0, -1);
            const links: GraphLink[] = linksJson.map(json => JSON.parse(json));

            return { nodes, links };
        } catch (error) {
            console.error('Failed to get ontology:', error);
            return { nodes: [], links: [] };
        }
    }

    static async DeleteSession(sessionId: string): Promise<boolean> {
        if (!checkRedisAvailable()) {
            return false;
        }

        try {
            await redis.del(
                KEYS.SessionMeta(sessionId),
                KEYS.SessionNodes(sessionId),
                KEYS.SessionLinks(sessionId)
            );
            await redis.zrem(KEYS.SessionsList, sessionId);

            return true;
        } catch (error) {
            console.error('Failed to delete session:', error);
            return false;
        }
    }

    static async GetExistingNodeNames(sessionId?: string): Promise<string[]> {
        if (!checkRedisAvailable()) {
            return [];
        }

        try {
            if (sessionId) {
                const nodesHash = await redis.hgetall(KEYS.SessionNodes(sessionId));
                return Object.values(nodesHash).map(json => {
                    const node = JSON.parse(json);
                    return node.name;
                });
            } else {
                return await redis.smembers(KEYS.GlobalNodes);
            }
        } catch (error) {
            console.error('Failed to get existing node names:', error);
            return [];
        }
    }
}
