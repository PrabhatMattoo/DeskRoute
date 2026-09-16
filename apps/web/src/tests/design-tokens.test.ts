import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/* The colour contract: relationships rather than constants, so a change of
   contrast passes and a broken ladder does not. */

const root = process.cwd()
const css = readFileSync(join(root, 'src/index.css'), 'utf8')

/* Parsing */

/** Every `--name: value;` in the file, last declaration winning. */
function declarations(source: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of source.matchAll(/--([a-z][-a-z0-9]*):\s*([^;]+);/g)) {
    out.set(m[1]!, m[2]!.trim().replace(/\s+/g, ' '))
  }
  return out
}

/** Every `selector { … }` pair, so a constant cannot leak across blocks. Read
    flat, the menu's row departures would be taken for the page's. */
function blocks(source: string): Array<{ selector: string; body: string }> {
  /* Comments first, or a block's selector reads as the whole paragraph above
     it, and this file is mostly paragraphs. */
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Array<{ selector: string; body: string }> = []
  /* Walked rather than matched: a selector here can follow an at-rule, a brace
     or the top of the file. */
  let cursor = 0
  while (true) {
    const open = bare.indexOf('{', cursor)
    if (open === -1) break
    const close = bare.indexOf('}', open)
    if (close === -1) break
    const selector = bare
      .slice(cursor, open)
      .split(/[;}]/)
      .pop()!
      .trim()
      .replace(/\s+/g, ' ')
    out.push({ selector, body: bare.slice(open + 1, close) })
    cursor = close + 1
  }
  return out
}

const BLOCKS = blocks(css)
const bodyOf = (selector: string) =>
  BLOCKS.filter((b) => b.selector === selector)
    .map((b) => b.body)
    .join('\n')

const all = declarations(css)
/** The anchor and the departure table live on `:root` and nowhere else. */
const rootDecls = declarations(bodyOf(':root'))
/** A menu overrides two of them; nothing else may. */
const menuDecls = declarations(bodyOf('[data-ground="menu"]'))

const num = (name: string, from: Map<string, string> = rootDecls): number => {
  const raw = from.get(name)
  const v = Number(raw)
  if (!Number.isFinite(v)) throw new Error(`--${name} is not a plain number: ${raw}`)
  return v
}

const BASE_L = num('base-l')
const BASE_C = num('base-c')
const BASE_H = num('base-h')
const CONTRAST = num('contrast')

/** The block that redeclares every ground-dependent token. */
const derivedBlock = /:root,\s*\[data-ground\]\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

type Step = { L: number; C: number }

/** A ground: its own lightness and chroma, plus any departure it overrides. */
function ground(name: 'base' | 'sub' | 'card' | 'menu', contrast = CONTRAST): Step {
  if (name === 'base') return { L: BASE_L, C: BASE_C }
  const key = name === 'menu' ? 'card' : name
  return {
    L: BASE_L + num(`d-${key}`) * contrast,
    C: BASE_C + num(`dc-${key}`),
  }
}

/** A role on a ground, by the additive law for L and the departure law for C. */
function role(
  name: string,
  on: 'base' | 'sub' | 'card' | 'menu',
  contrast = CONTRAST,
): Step {
  const g = ground(on, contrast)
  /* A menu is read by pointing, so its highlight travels further than a list's. */
  const dl =
    on === 'menu' && menuDecls.has(`d-${name}`)
      ? num(`d-${name}`, menuDecls)
      : num(`d-${name}`)
  return {
    L: clampL(g.L + dl * contrast),
    C: Math.max(0, g.C + num(`dc-${name}`)),
  }
}

/** Ink is proportional: a mix toward the pole, not a fixed distance from here. */
function ink(rung: 1 | 2 | 3, on: 'base' | 'sub' | 'card' | 'menu'): Step {
  const g = ground(on)
  const POLE = 0 // light: text travels toward black
  return {
    L: clampL(g.L + num(`t-ink-${rung}`) * (POLE - g.L)),
    C: Math.max(0, num('c-ink') + (g.C - BASE_C) / 2),
  }
}

const clampL = (l: number) => Math.min(100, Math.max(0, l))

const GROUNDS = ['base', 'sub', 'card', 'menu'] as const
const SURFACE_ROLES = ['card', 'control'] as const
const LINE_ROLES = ['border', 'input'] as const

/* Colour maths: CIELCh(D65) to sRGB to relative luminance */

function luminance({ L, C }: Step, H = BASE_H): number {
  const h = (H * Math.PI) / 180
  const [a, bb] = [C * Math.cos(h), C * Math.sin(h)]
  const fy = (L + 16) / 116
  const [fx, fz] = [fy + a / 500, fy - bb / 200]
  const e = 216 / 24389
  const k = 24389 / 27
  const inv = (f: number) => (f ** 3 > e ? f ** 3 : (116 * f - 16) / k)
  const WP = [0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329]
  const [X, Y, Z] = [inv(fx) * WP[0]!, inv(fy) * WP[1]!, inv(fz) * WP[2]!]
  const lin = [
    3.2409699419 * X - 1.5373831776 * Y - 0.4986107603 * Z,
    -0.9692436363 * X + 1.8759675015 * Y + 0.0415550574 * Z,
    0.0556300797 * X - 0.203976959 * Y + 1.0569715142 * Z,
  ].map((v) => Math.min(1, Math.max(0, v)))
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

function contrastRatio(a: Step, b: Step, ha = BASE_H, hb = BASE_H): number {
  const [hi, lo] = [luminance(a, ha), luminance(b, hb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `lch(L C H)` out of a declaration, for the two absolute hues. */
function absolute(name: string): Step & { H: number } {
  const m = /^lch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(all.get(name) ?? '')
  if (!m) throw new Error(`--${name} is not an absolute lch() triple`)
  return { L: +m[1]!, C: +m[2]!, H: +m[3]! }
}

/* The laws */

describe('the anchor', () => {
  it('never moves, at any contrast', () => {
    /* If the base drifts with contrast then every departure is measured from a
       moving point. */
    for (const c of [15, 27, 30, 50, 75, 100]) {
      expect(ground('base', c).L, `contrast ${c}`).toBe(BASE_L)
    }
  })

  it('multiplies every lightness departure by the contrast dial', () => {
    /* Read from the stylesheet, since arithmetic here would test this file
       against itself. Every rung is `ground + departure x contrast`. */
    const derived = declarations(derivedBlock)
    /* `--n-2` is the anchor and has no departure; ink scales through the ground. */
    const additive = [...derived].filter(
      ([n, v]) =>
        /^(n-1|n-3|control|control-hover|control-active|sunk|sunk-1|line-1|line-2)$/.test(
          n,
        ) && v.startsWith('lch('),
    )
    expect(additive.length).toBeGreaterThanOrEqual(9)
    for (const [name, value] of additive) {
      expect(value, `--${name} names no departure`).toMatch(/var\(--d-[a-z-]+\)/)
      expect(value, `--${name} ignores the contrast dial`).toMatch(/var\(--contrast\)/)
    }
    for (const rung of [1, 2, 3] as const) {
      expect(derived.get(`ink-${rung}`), `--ink-${rung}`).toMatch(/var\(--t-ink-\d\)/)
    }
  })

  it('clamps rather than overflowing when contrast is pushed', () => {
    /* Light runs out of room at the top: a card at contrast 60 would land past
       L 100. It must pin to white, not wrap or go negative. */
    for (const c of [15, 60, 100]) {
      for (const g of GROUNDS) {
        const l = role('control', g, c).L
        expect(l, `control on ${g} at contrast ${c}`).toBeGreaterThanOrEqual(0)
        expect(l).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('law 1: surfaces, borders and controls are additive', () => {
  it('rises: the rail is below the stage and a card above it', () => {
    /* A card sits above the page, so the page is faintly warm and the card white. */
    expect(ground('sub').L).toBeLessThan(BASE_L)
    expect(BASE_L).toBeLessThan(ground('card').L)
  })

  it('raises a control above its ground and reverses its hover toward the ink', () => {
    /* Controls travel toward white while surfaces travel toward the ink. The two
       coincide in dark, which hides the distinction until the system is ported. */
    for (const g of GROUNDS) {
      const rest = role('control', g)
      const hover = role('control-hover', g)
      const active = role('control-active', g)
      expect(rest.L, `rest on ${g}`).toBeGreaterThanOrEqual(ground(g).L)
      expect(hover.L, `hover on ${g}`).toBeLessThan(rest.L)
      expect(active.L, `active on ${g}`).toBeLessThan(hover.L)
    }
  })

  it('keeps every line below every surface it can land on', () => {
    /* In light, "a line sits above its surface" means darker. A line lighter
       than the surface it edges disappears exactly where it is needed. */
    for (const g of GROUNDS) {
      for (const line of LINE_ROLES) {
        for (const surface of SURFACE_ROLES) {
          expect(role(line, g).L, `${line} against ${surface} on ${g}`).toBeLessThan(
            role(surface, g).L,
          )
        }
        expect(role(line, g).L, `${line} on ${g}`).toBeLessThan(ground(g).L)
      }
    }
  })

  it('keeps the input edge more defined than the card edge', () => {
    /* A card and an input share one fill, so the input's border is the only
       thing that separates them. */
    expect(num('d-input')).toBeLessThan(num('d-border'))
  })

  it('highlights a menu row harder than a list row', () => {
    /* A list is scanned; a menu is READ by pointing at it. Reusing the general
       row value in a menu is what makes a ported menu feel dead. */
    const list = Math.abs(role('row-active', 'base').L - ground('base').L)
    const menu = Math.abs(role('row-active', 'menu').L - ground('menu').L)
    expect(menu).toBeGreaterThan(list * 1.4)
  })
})

describe('law 2: ink is proportional, not additive', () => {
  it('darkens monotonically and stops short of the pole', () => {
    /* Pure black on near-white is harsh in a way pure white on near-black is
       not, so the darkest rung lands near L 6 rather than at 0. */
    for (const g of GROUNDS) {
      expect(ink(1, g).L).toBeGreaterThan(ink(2, g).L)
      expect(ink(2, g).L).toBeGreaterThan(ink(3, g).L)
      expect(ink(3, g).L, `ink-3 on ${g}`).toBeGreaterThan(0)
    }
    for (const r of [1, 2, 3] as const) expect(num(`t-ink-${r}`)).toBeLessThan(1)
  })

  it('barely moves when the surface moves', () => {
    /* Between the rail and a card the ground travels ~7 L and body ink under 1,
       which an additive ladder cannot reproduce at another contrast. */
    const groundTravel = Math.abs(ground('card').L - ground('sub').L)
    const inkTravel = Math.abs(ink(3, 'card').L - ink(3, 'sub').L)
    expect(inkTravel).toBeLessThan(groundTravel / 4)
  })
})

describe('law 3: chroma re-anchors as well as lightness', () => {
  it("builds every ground-dependent chroma out of the ground's own", () => {
    /* Read from the stylesheet: recomputing chroma from the same constants would
       pass while the CSS pins a flat value. `--n-1` and `--n-2` are anchored. */
    const derived = declarations(derivedBlock)
    const mustReanchor =
      /^(n-3|control|control-hover|control-active|sunk|sunk-1|line-1|line-2|ink-1|ink-2|ink-3)$/
    let checked = 0
    for (const [name, value] of derived) {
      if (!mustReanchor.test(name)) continue
      checked++
      expect(value, `--${name} pins chroma instead of departing from the ground`).toMatch(
        /var\(--ground-c\)/,
      )
    }
    expect(checked).toBeGreaterThanOrEqual(11)
  })

  it("moves ink chroma at half the ground's rate", () => {
    /* The half-rate divisor is the law; losing it makes ink follow the surface
       as hard as a border does, and warm paper turns the body text tan. */
    const derived = declarations(derivedBlock)
    for (const rung of [1, 2, 3] as const) {
      expect(derived.get(`ink-${rung}`), `--ink-${rung}`).toMatch(
        /var\(--ground-c\)\s*-\s*var\(--base-c\)\)\s*\/\s*2/,
      )
    }
  })

  it("departs from the ground's chroma rather than holding a flat constant", () => {
    /* Flat chroma lifts the ladder without the colour, so a control on a card
       comes out grey against a warm page. */
    for (const name of [...SURFACE_ROLES, ...LINE_ROLES]) {
      for (const g of GROUNDS) {
        expect(role(name, g).C, `${name} on ${g}`).toBeCloseTo(
          Math.max(0, ground(g).C + num(`dc-${name}`)),
          6,
        )
      }
      /* And it must actually differ between two grounds, or the departure is
         zero and the assertion above is vacuous. */
      expect(role(name, 'sub').C).not.toBeCloseTo(role(name, 'card').C, 3)
    }
  })

  it("moves ink chroma at half the ground's rate, one value per ground", () => {
    for (const g of GROUNDS) {
      const [a, b, c] = [ink(1, g), ink(2, g), ink(3, g)]
      expect(a.C, `ink chroma varies by rung on ${g}`).toBeCloseTo(b.C, 6)
      expect(b.C).toBeCloseTo(c.C, 6)
      expect(a.C).toBeCloseTo(num('c-ink') + (ground(g).C - BASE_C) / 2, 6)
    }
  })

  it('caps ink chroma, so the greys cannot drift', () => {
    /* Warm paper wants warm ink, not tan. */
    for (const g of GROUNDS) {
      for (const r of [1, 2, 3] as const) {
        expect(ink(r, g).C, `ink-${r} on ${g}`).toBeLessThanOrEqual(6.5)
      }
    }
  })
})

describe('contrast floors, within each ground', () => {
  /* Measured against the ground the ink actually lands on: ink in a menu tested
     against the page background is a pair that never appears on screen. */
  it('clears AAA for body ink on every ground', () => {
    for (const g of GROUNDS) {
      expect(contrastRatio(ink(3, g), ground(g)), `ink-3 on ${g}`).toBeGreaterThanOrEqual(
        7,
      )
    }
  })

  it('clears AA for muted ink on every ground', () => {
    for (const g of GROUNDS) {
      expect(contrastRatio(ink(1, g), ground(g)), `ink-1 on ${g}`).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })

  it('clears AA for the accent wherever it is read', () => {
    const accent = absolute('accent-fill')
    for (const g of GROUNDS) {
      expect(
        contrastRatio(accent, ground(g), accent.H, BASE_H),
        `accent on ${g}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('clears AA for a fill against the text it carries', () => {
    for (const fill of ['accent-fill', 'red-fill'] as const) {
      const f = absolute(fill)
      expect(contrastRatio(absolute('white'), f, 0, f.H), fill).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })

  it('keeps a hairline visible but calm on every ground', () => {
    /* Between 1.2 and 3: below that an edge vanishes, above it the page turns
       into a wireframe. */
    for (const g of GROUNDS) {
      for (const line of LINE_ROLES) {
        const c = contrastRatio(role(line, g), ground(g))
        expect(c, `${line} on ${g}`).toBeGreaterThan(1.2)
        expect(c, `${line} on ${g}`).toBeLessThan(3)
      }
    }
  })
})

describe('derivation', () => {
  it('derives every ground-dependent token rather than naming a value', () => {
    /* Built from `--ground-*`: a raw triple is right at one depth and wrong at
       every other. */
    const derived = declarations(derivedBlock)
    const mustDerive =
      /^(n-3|control|control-hover|control-active|sunk|sunk-1|line-1|line-2|ink-1|ink-2|ink-3)$/
    for (const [name, value] of derived) {
      if (!mustDerive.test(name)) continue
      expect(value, `--${name} does not derive from the ground`).toMatch(
        /var\(--ground-[lc]\)/,
      )
      expect(value, `--${name} holds a literal`).not.toMatch(/lch\(\s*[\d.]+\s+[\d.]+/)
    }
  })

  it('re-declares the derived layer on every ground, not only on :root', () => {
    /* A custom property substitutes its `var()`s where it is declared, so one
       declared on `:root` bakes in `:root`'s ground and re-anchoring does nothing. */
    expect(css).toMatch(/:root,\s*\[data-ground\]\s*\{/)
    expect(derivedBlock).toMatch(/--ink-1:/)
    expect(derivedBlock).toMatch(/--control:/)
  })

  it('keeps the anchor and the two hues as the only absolute colours', () => {
    const literals = [...all]
      .filter(([, v]) => /^lch\([\d.]+ [\d.]+ [\d.]+\)$/.test(v))
      .map(([n]) => n)
      .sort()
    expect(literals).toEqual(['accent-fill', 'red-fill', 'white'])
  })
})

describe('colour means one thing', () => {
  it('spends the accent on anything you act on, and nothing else', () => {
    const accented = [...all]
      .filter(([, v]) => v === 'var(--accent-fill)')
      .map(([n]) => n)
    expect(accented).toEqual(
      expect.arrayContaining(['primary', 'ring', 'status-pending', 'accent-ink']),
    )
  })

  it('reserves red for destructive and nothing else', () => {
    const red = [...all]
      .filter(([, v]) => v === 'var(--red-fill)')
      .map(([n]) => n)
      .sort()
    expect(red).toEqual(['destructive', 'status-error'])
  })

  it('states a fact in ink, not in green', () => {
    /* A booking is not a celebration and an escalation is not a failure. */
    for (const s of ['status-booked', 'status-confirmed']) {
      expect(all.get(s)).toBe('var(--ink-3)')
    }
  })
})

describe('the elevation ladder', () => {
  const ui = (f: string) => readFileSync(join(root, 'src/components/ui', f), 'utf8')

  it('gives every overlay an edge', () => {
    /* A menu and a card land on the same fill, so the shadow is the whole
       boundary. The set is pinned, so a new overlay joins the law. */
    const overlays = readdirSync(join(root, 'src/components/ui'))
      .filter((file) => ui(file).includes('data-ground="menu"'))
      .sort()
    expect(overlays).toEqual([
      'dialog.tsx',
      'popover.tsx',
      'select.tsx',
      'sheet.tsx',
      'sonner.tsx',
    ])
    for (const file of overlays) {
      expect(ui(file), `${file} carries no overlay shadow`).toMatch(
        /shadow-(medium|high)/,
      )
    }
  })

  it('targets the orientation attribute Base UI actually emits', () => {
    /* Registry components compile `data-horizontal:` to a selector
       @base-ui/react 1.5 never emits, and `shadcn add` reintroduces it. */
    const files = readdirSync(join(root, 'src/components/ui'))
    for (const file of files) {
      const source = readFileSync(join(root, 'src/components/ui', file), 'utf8')
      const offenders = source.match(/data-(horizontal|vertical)[:/]/g) ?? []
      expect(offenders, `${file} styles an attribute Base UI never sets`).toEqual([])
    }
  })

  it("declares the shadow tiers and clears Tailwind's default scale", () => {
    expect(css).toMatch(/--shadow-\*:\s*initial/)
    const declared = [...css.matchAll(/--shadow-([a-z]+):/g)].map((m) => m[1]!).sort()
    expect(declared).toEqual(['control', 'high', 'low', 'medium', 'ring'])
  })

  it('draws the control ring in black, which is what a light theme needs', () => {
    /* White composites to nothing on paper, leaving a control at 1.02:1 against
       its own ground. */
    expect(all.get('shadow-ring')).toMatch(/^0 0 0 0\.5px lch\(0 0 0 \/ [\d.]+\)$/)
    expect(all.get('shadow-control')).toMatch(/^0 0 0 0\.5px lch\(0 0 0 \/ [\d.]+\),/)
  })

  it('stacks each tier rather than using one large blur', () => {
    /* Three shadows at low opacity is what makes an edge read soft without the
       panel looking hazy. */
    for (const tier of ['low', 'medium', 'high']) {
      const layers = (all.get(`shadow-${tier}`)?.match(/lch\(/g) ?? []).length
      expect(layers, `shadow-${tier}`).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('law 4: chroma is proportional to lightness', () => {
  /* `dc = -0.145 x dL`, capped at 1.20: a departure ignoring its own lightness
     step reads as a different material from the surface under it. */
  const K = -0.145
  const CAP = 1.2
  const STEPS = [
    'sub',
    'card',
    'control',
    'control-hover',
    'control-active',
    'row-hover',
    'row-active',
    'border',
    'input',
  ] as const

  it('moves chroma opposite to lightness, at a single rate', () => {
    for (const name of STEPS) {
      const dL = num(`d-${name}`) * CONTRAST
      const expected = Math.max(-CAP, Math.min(CAP, K * dL))
      expect(
        num(`dc-${name}`),
        `--dc-${name} against its own ${dL.toFixed(2)} L step`,
      ).toBeCloseTo(expected, 2)
    }
  })

  it("keeps a menu's harder highlight on the same law", () => {
    for (const name of ['row-hover', 'row-active'] as const) {
      const dL = num(`d-${name}`, menuDecls) * CONTRAST
      expect(num(`dc-${name}`, menuDecls), `menu --dc-${name}`).toBeCloseTo(
        Math.max(-CAP, Math.min(CAP, K * dL)),
        2,
      )
    }
  })

  it('keeps a control one material across rest, hover and press', () => {
    /* Chroma rising faster than lightness falls turns a press into a hue
       animation. */
    const spread = ['control', 'control-hover', 'control-active'].map(
      (n) => BASE_C + num(`dc-${n}`),
    )
    expect(Math.max(...spread) - Math.min(...spread)).toBeLessThan(1)
  })
})

describe('type and geometry', () => {
  const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

  it('puts nothing below the 14px floor', () => {
    const sizes = [
      ...theme.matchAll(/--text-(?!.*line-height)[a-z0-9]+:\s*(\d+)px/g),
    ].map((m) => +m[1]!)
    expect(sizes.length).toBeGreaterThan(0)
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(14)
  })

  it('holds the floor in components too, where arbitrary sizes escape it', () => {
    /* `--text-*` governs the scale; an arbitrary value like `text-[0.8rem]`
       bypasses it entirely and lands at 12.8px. */
    const files = readdirSync(join(root, 'src/components/ui'))
    for (const file of files) {
      const source = readFileSync(join(root, 'src/components/ui', file), 'utf8')
      for (const m of source.matchAll(/text-\[([\d.]+)(px|rem)\]/g)) {
        const px = m[2] === 'rem' ? +m[1]! * 16 : +m[1]!
        expect(px, `${file} sets ${m[0]}`).toBeGreaterThanOrEqual(14)
      }
    }
  })

  it('carries three radii, one per rung of the elevation ladder', () => {
    /* 8 a control, 10 a card, 12 an overlay. Near white the fills run out of
       room, so radius carries depth alongside the shadow. */
    const radii = new Set(
      [...theme.matchAll(/--radius-[a-z0-9]+:\s*(\d+)px/g)].map((m) => m[1]!),
    )
    expect([...radii].map(Number).sort((a, b) => a - b)).toEqual([8, 10, 12])
  })

  it('keeps pixel widths out of call sites', () => {
    /* A call site names rather than measures. Pixels are not banned: a component
       may own its width in one place, and `sheet.tsx` does. */
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(full, 'utf8')
          for (const m of source.matchAll(/(?:max-w|min-w|w)-\[(\d+(?:\.\d+)?)px\]/g)) {
            offenders.push(`${full.replace(root, '')} sets ${m[0]}`)
          }
        }
      }
    }
    walk(join(root, 'src/features'))
    walk(join(root, 'src/layout'))

    expect(offenders).toEqual([])
  })

  it('names every measure once', () => {
    /* Every measure is named here, so a page cannot hardcode one that quietly
       disagrees with the token of the same name. */
    for (const m of ['page', 'form', 'narrow', 'sidebar']) {
      expect(theme, `--container-${m}`).toMatch(new RegExp(`--container-${m}:\\s*\\d+px`))
    }
  })
})
