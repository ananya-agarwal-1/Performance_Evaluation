import { access, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const pages = ['index.html', 'login.html', 'employee.html', 'manager.html', 'officer.html', 'senior.html', 'board.html', 'admin.html']
const scripts = ['js/api.js', 'js/auth.js', 'js/login.js', 'js/employee.js', 'js/manager.js', 'js/officer.js', 'js/senior.js', 'js/board.js', 'js/admin.js', 'static-server.js']

for (const pageName of pages) {
    const page = await readFile(path.join(root, pageName), 'utf8')
    const localReferences = [...page.matchAll(/(?:src|href)="(?!#|https?:|mailto:)([^\"]+)"/g)]
    for (const [, reference] of localReferences) {
        const localPath = reference.split('#')[0].split('?')[0]
        if (localPath) await access(path.resolve(root, localPath))
    }
    const anchors = [...page.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])
    for (const anchor of anchors) {
        if (!new RegExp(`\\bid=["']${anchor}["']`).test(page)) {
            throw new Error(`${pageName} links to missing section #${anchor}`)
        }
    }
}

for (const script of scripts) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, script)], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`${script} failed syntax check:\n${result.stderr}`)
}

console.log(`Static frontend check passed: ${pages.length} pages, ${scripts.length} JavaScript files.`)
