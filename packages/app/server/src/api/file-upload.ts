import type { Request } from 'express'

const hasControlCharacter = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index)

        if (codeUnit <= 0x1f || codeUnit === 0x7f) {
            return true
        }
    }

    return false
}

export const readEncodedHeader = (request: Request, name: string, maxLength: number) => {
    const encodedValue = request.header(name)

    if (encodedValue === undefined) {
        return null
    }

    try {
        const value = decodeURIComponent(encodedValue).trim()
        return value.length > 0 && value.length <= maxLength && !hasControlCharacter(value)
            ? value
            : null
    } catch {
        return null
    }
}

export const readFileName = (request: Request) => {
    const fileName = readEncodedHeader(request, 'x-artifact-filename', 255)
    return fileName !== null && !fileName.includes('/') && !fileName.includes('\\')
        ? fileName
        : null
}

export const isPdf = (fileName: string, content: Buffer) =>
    fileName.toLowerCase().endsWith('.pdf') && content.subarray(0, 5).toString('ascii') === '%PDF-'

export const contentDisposition = (fileName: string) => {
    const asciiFileName = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_')
    return `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
