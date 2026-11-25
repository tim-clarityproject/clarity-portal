// The coach portal's imports of the shared design parts, each from its own file (tidy follow-up 4, part 1, item 1).
//
// The coach portal imports its design parts from the one index (src/components/design/index.js), which names every
// part of the client portal too. Importing one name from an index runs every file it names (that is how imports
// work), so the coach portal's opening was handed the whole of the client pages' shared part (client-core: about
// 520 kB of code, 145 kB sent) for the few buttons, panels and loading crosshairs it draws. Here, as the build reads a
// coach portal file, each name it takes from the index is taken from that part's own file instead: the same thing,
// under the same name, so nothing a page does changes. vite.config.js (clientCoreChunks) then puts the shared parts the
// coach portal's first screens use in a part of their own, design-core, that the coach portal and the client pages
// both load.
//
// Only `import { A, B as C } from '…/components/design'` is rewritten, and every index line must be
// `export { … } from '…'` (anything else stops the build rather than guess). The rewritten lines keep their line
// count. Checked by tests/performance/design-imports.test.mjs.
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** The index's names: name -> { file: './Button' (from the index's folder), name: 'Button' | 'default' }. */
export function designIndex(source) {
  const map = new Map()
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    const m = /^export \{([^}]*)\} from '(\.\.?\/[^']+)';$/.exec(line)
    if (!m) throw new Error(`designImports: the design index has a line it can't read: ${line}`)
    for (const part of m[1].split(',').map((p) => p.trim()).filter(Boolean)) {
      const as = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(part)
      if (!as) throw new Error(`designImports: the design index names something it can't read: ${part}`)
      map.set(as[2] || as[1], { file: m[2], name: as[1] })
    }
  }
  return map
}

const IMPORT = /import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2;?/g

/**
 * One file's source with its imports from the design index taken from each part's own file. `fromDir`: the file's
 * folder; `indexDir`: src/components/design. Returns the source unchanged when it has none.
 */
export function rewriteDesignImports(code, fromDir, indexDir, index) {
  return code.replace(IMPORT, (whole, names, quote, spec) => {
    if (!spec.startsWith('.')) return whole
    if (resolve(fromDir, spec).replace(/\/index(\.js)?$/, '') !== indexDir) return whole
    const parts = names.split(',').map((p) => p.trim()).filter(Boolean)
    const lines = parts.map((part) => {
      const m = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(part)
      if (!m) throw new Error(`designImports: an import it can't read: ${part}`)
      const found = index.get(m[1])
      if (!found) throw new Error(`designImports: the design index has no ${m[1]}`)
      let path = relative(fromDir, resolve(indexDir, found.file))
      if (!path.startsWith('.')) path = `./${path}`
      return `import { ${found.name} as ${m[2] || m[1]} } from ${quote}${path}${quote};`
    })
    // The same number of lines as before, so every later line keeps its number.
    return lines.join(' ') + '\n'.repeat((whole.match(/\n/g) || []).length)
  })
}

/** The Vite plugin, for the coach portal's own files only (src/pages/coach, src/lib/coach, src/components/coach). */
export function designImports(root) {
  const indexDir = join(root, 'src/components/design')
  const coach = /\/src\/(pages|lib|components)\/coach\/[^?]*\.(jsx?|mjs)$/
  let index = null
  return {
    name: 'clarity-design-imports',
    enforce: 'pre',
    transform(code, id) {
      if (!coach.test(id) || !code.includes('components/design')) return null
      if (!index) index = designIndex(readFileSync(join(indexDir, 'index.js'), 'utf8'))
      const out = rewriteDesignImports(code, dirname(id), indexDir, index)
      return out === code ? null : { code: out, map: null }
    },
  }
}
