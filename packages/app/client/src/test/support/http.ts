export const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

export const requestUrl = (input: RequestInfo | URL) =>
    input instanceof Request ? input.url : String(input)

export const requestParts = (input: RequestInfo | URL, init?: RequestInit) => ({
    method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
    url: requestUrl(input),
})
