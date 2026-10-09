import { loadResumeContext } from './resume-context.ts'

try {
    console.log(
        (await loadResumeContext()) ||
            'No uploaded resumes are available. Keep the existing private resume-selection policy.',
    )
} catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not read the resume library')
    process.exitCode = 1
}
