/**
 * npm run build:artifact
 *
 * Turns the embedded build (artifact-dist/, built with VITE_EMBEDDED=1) into a
 * page for a hosted page viewer such as a claude.ai artifact: the viewer adds
 * its own <html>/<head>/<body>, so page.html holds only the title, the inlined
 * stylesheet, the root element and the script tag. files.json lists the files
 * to publish next to it (the script and the photos), by their relative paths.
 *
 * The build includes this computer's private photos, so the result is for the
 * owner's private use only: never publish it anywhere public.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from './catalogue/lib'

const OUT = join(ROOT, 'artifact-dist')
const html = readFileSync(join(OUT, 'index.html'), 'utf8')

const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'Watch Discovery'
const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1])
const scripts = [...html.matchAll(/<script[^>]+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => m[1])
if (scripts.length !== 1) throw new Error(`Expected one module script in the build, found ${scripts.length}`)

const clean = (path: string) => path.replace(/^\.\//, '')
const css = styles.map((href) => readFileSync(join(OUT, clean(href)), 'utf8')).join('\n')
const page = [
  `<title>${title}</title>`,
  `<meta name="robots" content="noindex, nofollow">`,
  `<style>\n${css}\n</style>`,
  `<div id="root"></div>`,
  `<script type="module" src="${clean(scripts[0])}"></script>`,
  '',
].join('\n')
writeFileSync(join(OUT, 'page.html'), page)

// Everything the page loads: the script, and the images it references.
const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) walk(abs)
    else files.push(relative(OUT, abs))
  }
}
walk(join(OUT, 'assets'))
walk(join(OUT, 'watches'))
const publish = files.filter((f) => /\.(js|jpe?g|png|webp|svg)$/.test(f)).sort()
writeFileSync(join(OUT, 'files.json'), JSON.stringify(publish, null, 2) + '\n')

const bytes = publish.reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0)
console.log(`artifact-dist/page.html (${Math.round(page.length / 1024)} kB) + ${publish.length} files (${(bytes / 1e6).toFixed(1)} MB), listed in artifact-dist/files.json`)
