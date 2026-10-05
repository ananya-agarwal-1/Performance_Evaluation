import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.FRONTEND_PORT || 5173)
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
}

const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname)
        const requested = pathname === '/' ? '/index.html' : pathname
        const filePath = path.resolve(root, `.${requested}`)
        if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, 'index.html')) {
            response.writeHead(403).end('Forbidden')
            return
        }
        const fileStat = await stat(filePath)
        if (!fileStat.isFile()) throw new Error('Not a file')
        const content = await readFile(filePath)
        response.writeHead(200, {
            'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache'
        })
        response.end(content)
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
    }
})

server.listen(port, '127.0.0.1', () => {
    console.log(`EPMS static frontend running at http://127.0.0.1:${port}`)
})
