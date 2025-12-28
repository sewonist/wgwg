import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { SessionRouter } from '@/lib/session-router';

export async function POST(req: Request) {
    const { text, sessionId } = await req.json();

    // Fetch existing nodes from session or global context
    const existingNodes = await SessionRouter.GetExistingNodeNames(sessionId);

    const existingNodesContext = existingNodes.length > 0
        ? `\n\nExisting ontology nodes (reuse these names if applicable): ${existingNodes.join(', ')}`
        : '';

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

    Reuse existing node names where appropriate. Only introduce new node names if the concept is distinctly different from existing ones.

    Content:
    "${text}"${existingNodesContext}
    `,
    });

    // Save ontology to session if sessionId provided
    if (sessionId && (object.nodes.length > 0 || object.links.length > 0)) {
        await SessionRouter.AppendOntology(sessionId, {
            nodes: object.nodes,
            links: object.links,
        });
    }

    return Response.json(object);
}
