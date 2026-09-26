import type { Request } from 'express'

export function readFileName(request: Request) {
    try {
        const fileName = decodeURIComponent(request.header('x-artifact-filename') ?? '').trim()
        return fileName.length > 0 && fileName.length <= 255 && !/[/\\\p{Cc}]/u.test(fileName)
            ? fileName
            : null
    } catch {
        return null
    }
}

export const isPdf = (fileName: string, content: Buffer) =>
    fileName.toLowerCase().endsWith('.pdf') && content.subarray(0, 5).toString('ascii') === '%PDF-'

export const contentDisposition = (fileName: string, download = false) => {
    const asciiFileName = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_')
    return `${download ? 'attachment' : 'inline'}; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
