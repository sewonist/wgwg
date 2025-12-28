import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { LayeredSessionRouter } from '@/lib/layered-session-router';

export async function POST(req: Request) {
    const { text, sessionId, agentType } = await req.json();

    if (!sessionId) {
        return Response.json(
            { error: 'sessionId is required' },
            { status: 400 }
        );
    }

    if (!text) {
        return Response.json(
            { error: 'text is required' },
            { status: 400 }
        );
    }

    const { object } = await generateObject({
        model: openai('gpt-5.2'),
        schema: z.object({
            nodes: z.array(z.object({
                id: z.string(),
                name: z.string(),
                type: z.enum(['Concept', 'Entity', 'Action', 'Emotion']),
                description: z.string().optional(),
            })),
            links: z.array(z.object({
                source: z.string(),
                target: z.string(),
                label: z.string(),
                description: z.string().optional(),
            })),
        }),
        prompt: `Analyze the following discussion content and extract an ontology graph.
Identify key concepts, entities, actions, or emotions as nodes.
Identify relationships between them as links with descriptive labels.

Content:
"${text}"
`,
    });

    // Create a new layer for this analysis
    const layerMeta = await LayeredSessionRouter.CreateLayer(sessionId, {
        agentType: agentType || '',
        originalText: text,
    });

    if (!layerMeta) {
        return Response.json(
            { error: 'Failed to create layer' },
            { status: 500 }
        );
    }

    // Save ontology to the new layer
    if (object.nodes.length > 0 || object.links.length > 0) {
        await LayeredSessionRouter.SaveLayerOntology(sessionId, layerMeta.layerId, {
            nodes: object.nodes,
            links: object.links,
        });
    }

    return Response.json({
        layerId: layerMeta.layerId,
        timestamp: layerMeta.timestamp,
        agentType: layerMeta.agentType,
        nodes: object.nodes,
        links: object.links,
    });
}
