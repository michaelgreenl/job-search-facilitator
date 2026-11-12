import { z } from 'zod'
import { capturedDescriptionSchema, type CapturedJobDescription } from '../job-description.ts'
import type { AppServerConnection } from './app-server-connection.ts'

export const descriptionCaptureInputSchema = z.strictObject({
    tabId: z.string().min(1).max(100),
    selector: z.string().min(1).max(2_000),
})

export async function captureJobDescription(
    connection: AppServerConnection,
    threadId: string,
    input: z.infer<typeof descriptionCaptureInputSchema>,
): Promise<CapturedJobDescription> {
    const response = await connection.request(
        'mcpServer/tool/call',
        {
            threadId,
            server: 'node_repl',
            tool: 'js',
            arguments: {
                title: 'Capture the job description',
                code: `{
    const descriptionTab = await chrome.tabs.get(${JSON.stringify(input.tabId)});
    const sourceUrl = await descriptionTab.url();
    const description = await descriptionTab.playwright.evaluate((selector) => {
        const elements = document.querySelectorAll(selector);
        if (elements.length !== 1) throw new Error('Select exactly one description element.');
        const element = elements[0];
        if (typeof element.innerText !== 'string' || !element.innerText.trim()) {
            throw new Error('The description element has no visible text.');
        }
        if (element.querySelector('form, input, textarea, select')) {
            throw new Error('Select the description without the application form.');
        }
        return element.innerText;
    }, ${JSON.stringify(input.selector)});
    if (await descriptionTab.url() !== sourceUrl) throw new Error('The job page changed during capture.');
    nodeRepl.write(JSON.stringify({ description, sourceUrl }));
}`,
            },
        },
        z.object({
            isError: z.boolean().optional(),
            content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
        }),
    )
    const text = response.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text ?? '')
        .join('\n')
    if (response.isError)
        throw new Error(
            text.split('\n')[0] ||
                'Chrome could not capture the description. Check the tab and selector, then retry.',
        )
    return capturedDescriptionSchema.parse(JSON.parse(text))
}
