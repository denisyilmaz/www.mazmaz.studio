import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MotionValue, animate, cancelFrame, frame, motionValue } from 'motion';

interface Cell {
  key: string;
  col: number;
  /** The two cells that stay in the accessibility tree and read "mazmaz". */
  semantic: boolean;
}

interface Row {
  key: string;
  row: number;
  cells: Cell[];
}

interface Layout {
  cols: number;
  rows: number;
  fontSize: number;
  rowH: number;
  gap: number;
  offsetY: number;
  horizontal: boolean;
}

/**
 * One "visitor": a pair of words pushed to the peak, with a spring-smoothed centre in grid units.
 * Agent 0 is the real pointer; the others are simulated visitors wandering on their own paths.
 */
interface Agent {
  /** Share of the full effect this agent can reach (1 = the real visitor). */
  strength: number;
  pc: MotionValue<number>;
  pr: MotionValue<number>;
  pairKey: string;
  pairA: number;
  pairB: number;
  /** Wander pace multiplier (1 = default). */
  pace: number;
  /** Current Bézier segment of the wander, or null while the real pointer drives this agent. */
  wander: Wander | null;
}

interface Pt {
  c: number;
  r: number;
}

/** A colour wave started by a click, in grid coordinates. */
interface Ripple {
  c: number;
  r: number;
  start: number;
}

/** One cubic Bézier hop of a wandering visitor, then a short pause at the end point. */
interface Wander {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
  start: number;
  duration: number;
  pauseUntil: number;
}

const WORD = 'maz';
/** Rest: light, narrow, italic. Peak: ultra, extended, upright. */
const REST = { wght: 200, wdth: 100, slnt: -12 };
const PEAK = { wght: 1000, wdth: 125, slnt: 0 };
/** Approximate width of one word at rest, in px; sets the type size per viewport. */
const targetWordWidth = (vw: number) => clamp(vw * 0.105, 88, 150);
const MIN_WORDS = 4;
/** Extra words per row so the line still overflows the viewport when the peak pushes it. */
const OVERFLOW_WORDS = 4;
/** Row height relative to font size. "maz" is all x-height, so rows can sit tight. */
const ROW_RATIO = 0.6;
/** Word gap relative to font size. */
const GAP_RATIO = 0.03;
/** Falloff reach of the gradient, in cells horizontally and rows vertically. */
const FALLOFF_X = 1.5;
const FALLOFF_Y = 2.6;
/** Width of the Gaussian falloff beyond the plateau, in normalised units (0 = plateau edge, 1 = reach). */
const FALLOFF_SIGMA = 0.36;
/** Pair orientation: false = two stacked rows (like the reference gif), true = two words side by side. */
const PAIR_HORIZONTAL = false;
const SPRING = { type: 'spring', stiffness: 150, damping: 24, mass: 1 } as const;
/** Extra reach, in cells, a point must travel past a pair edge before the pair switches. Kills flicker at boundaries. */
const HYSTERESIS = 0.25;
/** Output quantisation: a style write only happens when a value crosses one of these steps. */
const WGHT_STEP = 8;
const WDTH_STEP = 0.5;
const SLNT_STEP = 0.5;
/**
 * Visitors. The first entry is the real pointer; it only wanders while no pointer is active.
 * The others are simulated visitors, always wandering, at a share of the real strength.
 */
const VISITORS: { strength: number; pace: number }[] = [
  { strength: 1, pace: 1 },
  { strength: 0.7, pace: 0.8 },
  { strength: 0.6, pace: 1.1 },
];
/** Wander timing: seconds per hop = base + perCell * distance (rows count less, they are shorter). */
const WANDER = { base: 1.6, perCell: 0.38, rowScale: 0.45, pauseMin: 0.5, pauseMax: 2.2 };
/** Click ripple: a ring of colour expanding from the click. Speed and ring width in px. */
const RIPPLE = { speed: 700, width: 160, color: [0, 0, 255] as const };
const COLOR_STEPS = 24;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

@Component({
  selector: 'maz-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fixed inset-0 block overflow-hidden select-none' },
  template: `
    <h1
      class="flex flex-col font-schengen leading-none transition-opacity duration-700 ease-out"
      [class.opacity-0]="!ready()"
      [style.font-size.px]="layout()?.fontSize ?? null"
      [style.transform]="layout() ? 'translateY(' + layout()!.offsetY + 'px)' : null"
    >
      @for (row of rows(); track row.key) {
        <span
          class="flex shrink-0 items-center justify-center whitespace-nowrap [contain:layout_style]"
          [style.height.px]="layout()?.rowH ?? null"
          [style.gap.px]="layout()?.gap ?? null"
        >
          @for (cell of row.cells; track cell.key) {
            <span data-cell class="block" [attr.aria-hidden]="cell.semantic ? null : true">${WORD}</span>
          }
        </span>
      }
    </h1>
    <span
      #probeRest
      aria-hidden="true"
      class="invisible absolute top-0 left-0 whitespace-nowrap font-schengen"
      style="font-size: 100px; font-variation-settings: 'wght' ${REST.wght}, 'wdth' ${REST.wdth}, 'slnt' ${REST.slnt}"
      >${WORD}</span
    >
  `,
})
export class MazGrid {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly probeRest = viewChild.required<ElementRef<HTMLElement>>('probeRest');

  /** Server / first client render: only the semantic pair, so hydration matches. */
  protected readonly rows = signal<Row[]>([
    {
      key: 'seed',
      row: 0,
      cells: [
        { key: 's0', col: 0, semantic: true },
        { key: 's1', col: 1, semantic: true },
      ],
    },
  ]);
  protected readonly layout = signal<Layout | null>(null);
  protected readonly ready = signal(false);

  private restEm = 2.4; // width of "maz" at rest in em; measured on the client
  private cellEls: { el: HTMLElement; col: number; row: number; last: string; lastColor: string }[] = [];
  private ripples: Ripple[] = [];
  /** Latest click, resolved in the frame loop like pointer moves. */
  private pendingClick: { x: number; y: number } | null = null;
  private rowEls: HTMLElement[][] = [];
  private readonly agents: Agent[] = VISITORS.map((v) => ({
    strength: v.strength,
    pc: motionValue(0),
    pr: motionValue(0),
    pairKey: '',
    pairA: 0,
    pairB: 0,
    pace: v.pace,
    wander: null,
  }));
  private pointerActive = false;
  /** Latest pointer position, resolved once per frame so DOM reads never interleave with writes. */
  private pending: { x: number; y: number } | null = null;
  private reducedMotion = false;
  /** Frozen visitor positions from the URL hash (#peaks=col,row,strength;...), used to render still images. */
  private frozen: { c: number; r: number; s: number }[] | null = null;
  private loop: ((data: { timestamp: number }) => void) | null = null;

  constructor() {
    afterNextRender(async () => {
      this.reducedMotion =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const peaks = new URLSearchParams(location.hash.slice(1)).get('peaks');
      if (peaks) {
        this.frozen = peaks.split(';').map((p) => {
          const [c, r, s] = p.split(',').map(Number);
          return { c, r, s: s || 1 };
        });
      }
      await document.fonts?.load?.(`${PEAK.wght} 100px Schengen`).catch(() => undefined);
      const w = this.probeRest().nativeElement.getBoundingClientRect().width / 100;
      if (w > 0) this.restEm = w;
      this.build();
      this.bindPointer();
      this.startLoop();
      this.ready.set(true);
    });

    // Re-collect cell elements whenever the grid re-renders.
    afterRenderEffect(() => {
      this.rows();
      const l = this.layout();
      if (!l) return;
      const rowNodes = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('h1 > span'));
      this.rowEls = rowNodes.map((r) => Array.from(r.querySelectorAll<HTMLElement>('[data-cell]')));
      this.cellEls = this.rowEls.flatMap((cells, row) => cells.map((el, col) => ({ el, col, row, last: '', lastColor: '' })));
    });
  }

  private build() {
    const el = this.host.nativeElement;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const horizontal = PAIR_HORIZONTAL;

    const visibleWords = Math.max(MIN_WORDS, Math.round(vw / targetWordWidth(vw)));
    const fontSize = vw / visibleWords / (this.restEm + GAP_RATIO);
    const rowH = fontSize * ROW_RATIO;
    const gap = fontSize * GAP_RATIO;
    const cols = visibleWords + OVERFLOW_WORDS;
    const rows = Math.ceil(vh / rowH) + 1;
    const offsetY = (vh - rows * rowH) / 2;

    const midC = Math.floor(cols / 2);
    const midR = Math.floor(rows / 2);
    const semantic = new Set(
      horizontal ? [`${midC - 1}-${midR}`, `${midC}-${midR}`] : [`${midC}-${midR - 1}`, `${midC}-${midR}`],
    );

    const rowList: Row[] = [];
    for (let row = 0; row < rows; row++) {
      const cells: Cell[] = [];
      for (let col = 0; col < cols; col++) {
        cells.push({ key: `${col}`, col, semantic: semantic.has(`${col}-${row}`) });
      }
      rowList.push({ key: `${row}`, row, cells });
    }

    this.layout.set({ cols, rows, fontSize, rowH, gap, offsetY, horizontal });
    this.rows.set(rowList);
    // Scatter the visitors and let each start wandering from where it stands.
    this.agents.forEach((a, i) => {
      a.pairKey = '';
      a.wander = null;
      const fz = this.frozen?.[i];
      // Frozen positions are relative to the visible grid (0..1 across, 0..1 down).
      a.pc.jump(fz ? OVERFLOW_WORDS / 2 + fz.c * (cols - 1 - OVERFLOW_WORDS) : rand(OVERFLOW_WORDS / 2, cols - 1 - OVERFLOW_WORDS / 2));
      a.pr.jump(fz ? fz.r * (rows - 1) : rand(1, rows - 2));
      if (fz) a.strength = fz.s;
    });
  }

  /** A random target inside the visible part of the grid. */
  private randomTarget(): Pt {
    const l = this.layout()!;
    return { c: rand(OVERFLOW_WORDS / 2, l.cols - 1 - OVERFLOW_WORDS / 2), r: rand(1, l.rows - 2) };
  }

  /** Plan the next Bézier hop from a point, keeping the tangent of the previous hop for a smooth curve. */
  private planWander(from: Pt, tangent: Pt | null, pace: number, now: number): Wander {
    const p3 = this.randomTarget();
    const dc = p3.c - from.c;
    const dr = p3.r - from.r;
    const dist = Math.hypot(dc, dr * WANDER.rowScale);
    // First control point continues the incoming direction; second approaches the target from a random side.
    const pull = dist * rand(0.25, 0.5);
    const tan = tangent && Math.hypot(tangent.c, tangent.r) > 1e-3 ? tangent : { c: dc, r: dr };
    const tl = Math.hypot(tan.c, tan.r) || 1;
    const p1 = { c: from.c + (tan.c / tl) * pull, r: from.r + (tan.r / tl) * pull };
    const ang = Math.atan2(-dr, -dc) + rand(-0.9, 0.9);
    const p2 = { c: p3.c + Math.cos(ang) * pull, r: p3.r + Math.sin(ang) * pull * WANDER.rowScale };
    const duration = ((WANDER.base + WANDER.perCell * dist) / pace) * rand(0.85, 1.15);
    return { p0: from, p1, p2, p3, start: now, duration, pauseUntil: 0 };
  }

  /** Advance an agent along its wander and return its position; plans new hops as needed. */
  private wanderPoint(a: Agent, now: number): Pt {
    if (!a.wander) a.wander = this.planWander({ c: a.pc.get(), r: a.pr.get() }, null, a.pace, now);
    let w = a.wander;
    if (w.pauseUntil) {
      if (now < w.pauseUntil) return w.p3;
      a.wander = w = this.planWander(w.p3, { c: w.p3.c - w.p2.c, r: w.p3.r - w.p2.r }, a.pace, now);
    }
    const u = clamp((now - w.start) / w.duration, 0, 1);
    if (u >= 1) {
      w.pauseUntil = now + rand(WANDER.pauseMin, WANDER.pauseMax) / a.pace;
      return w.p3;
    }
    const v = 1 - u;
    const b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
    return {
      c: b0 * w.p0.c + b1 * w.p1.c + b2 * w.p2.c + b3 * w.p3.c,
      r: b0 * w.p0.r + b1 * w.p1.r + b2 * w.p2.r + b3 * w.p3.r,
    };
  }

  /** Convert a viewport point to fractional grid coordinates (cell centres sit on integers). */
  private toGrid(x: number, y: number): { colF: number; rowF: number } | null {
    const l = this.layout()!;
    const rowF = (y - l.offsetY) / l.rowH - 0.5;
    const row = clamp(Math.round(rowF), 0, l.rows - 1);
    const cells = this.rowEls[row];
    if (!cells?.length) return null;
    // Rendered widths shift as words grow, so read the row's real positions.
    let col = 0;
    let best = Infinity;
    let rect: DOMRect | null = null;
    for (let i = 0; i < cells.length; i++) {
      const r = cells[i].getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - x);
      if (d < best) {
        best = d;
        col = i;
        rect = r;
      }
    }
    const colF = rect ? col + (x - (rect.left + rect.width / 2)) / (rect.width + l.gap) : col;
    return { colF, rowF };
  }

  /**
   * Snap fractional grid coordinates to the nearest adjacent pair, with hysteresis so a point
   * hovering near a boundary does not flip the pair back and forth every frame.
   */
  private moveToGrid(a: Agent, colF: number, rowF: number, jump = false) {
    const l = this.layout()!;
    // Along the pair axis the pair (i, i+1) covers [i, i+1]; across it the index is rounded.
    const along = l.horizontal ? colF : rowF;
    const across = l.horizontal ? rowF : colF;
    const alongMax = (l.horizontal ? l.cols : l.rows) - 2;
    const acrossMax = (l.horizontal ? l.rows : l.cols) - 1;

    let pa = a.pairA;
    let pb = a.pairB;
    const keep = a.pairKey !== '';
    if (!keep || Math.abs(along - (pa + 0.5)) > 0.5 + HYSTERESIS) pa = clamp(Math.floor(along), 0, alongMax);
    if (!keep || Math.abs(across - pb) > 0.5 + HYSTERESIS) pb = clamp(Math.round(across), 0, acrossMax);

    const key = `${l.horizontal ? 'h' : 'v'}${pa}-${pb}`;
    if (key === a.pairKey) return;
    a.pairKey = key;
    a.pairA = pa;
    a.pairB = pb;
    const c = l.horizontal ? pa + 0.5 : pb;
    const r = l.horizontal ? pb : pa + 0.5;
    if (jump || this.reducedMotion) {
      a.pc.jump(c);
      a.pr.jump(r);
      return;
    }
    animate(a.pc, c, SPRING);
    animate(a.pr, r, SPRING);
  }

  private bindPointer() {
    const root = document.documentElement;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      root.addEventListener(type, fn, { passive: true });
      this.destroyRef.onDestroy(() => root.removeEventListener(type, fn));
    };

    on('pointermove', (e) => {
      this.pointerActive = true;
      this.pending = { x: e.clientX, y: e.clientY };
    });
    on('pointerdown', (e) => {
      this.pointerActive = true;
      this.pending = { x: e.clientX, y: e.clientY };
      this.pendingClick = { x: e.clientX, y: e.clientY };
    });
    // Mouse leaves the window, or a touch ends: hand control back to the idle drift.
    on('pointerleave', () => (this.pointerActive = false));
    on('pointerup', (e) => {
      if (e.pointerType !== 'mouse') this.pointerActive = false;
    });
    on('pointercancel', () => (this.pointerActive = false));

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.build());
    };
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  private startLoop() {
    // Plateau edge sits exactly on the two pair cells, in normalised falloff units.
    const n0 = PAIR_HORIZONTAL ? 0.5 / FALLOFF_X : 0.5 / FALLOFF_Y;
    const peaks = this.agents.map(() => ({ c: 0, r: 0, s: 0 }));

    this.loop = ({ timestamp }) => {
      const l = this.layout();
      if (!l) return;
      const secs = timestamp / 1000;

      // 1. Move the visitors (DOM reads happen here, before any writes).
      const [user, ...ghosts] = this.agents;
      if (this.frozen) {
        this.pending = null;
      } else if (this.pending) {
        const g = this.toGrid(this.pending.x, this.pending.y);
        this.pending = null;
        user.wander = null;
        if (g) this.moveToGrid(user, g.colF, g.rowF);
      } else if (!this.pointerActive && !this.reducedMotion) {
        // Idle: glide continuously along a Bézier wander instead of snapping between pairs.
        const p = this.wanderPoint(user, secs);
        user.pairKey = '';
        user.pc.jump(p.c);
        user.pr.jump(p.r);
      }
      if (!this.reducedMotion && !this.frozen) {
        for (const g of ghosts) {
          const p = this.wanderPoint(g, secs);
          g.pc.jump(p.c);
          g.pr.jump(p.r);
        }
      }
      for (let i = 0; i < this.agents.length; i++) {
        peaks[i].c = this.agents[i].pc.get();
        peaks[i].r = this.agents[i].pr.get();
        peaks[i].s = this.agents[i].strength;
      }
      if (this.pendingClick) {
        const g = this.toGrid(this.pendingClick.x, this.pendingClick.y);
        this.pendingClick = null;
        if (g) this.ripples.push({ c: g.colF, r: g.rowF, start: secs });
      }
      // Ripples live until the ring has left the far corner of the grid.
      const unitW = l.fontSize * this.restEm + l.gap;
      const unitH = l.rowH;
      const reach = Math.hypot(l.cols * unitW, l.rows * unitH) + RIPPLE.width * 2;
      this.ripples = this.ripples.filter((rp) => (secs - rp.start) * RIPPLE.speed < reach);

      // 2. Write styles. Visitors blend softly: overlapping halos add up without exceeding the peak.
      for (const c of this.cellEls) {
        let keep = 1;
        for (const p of peaks) {
          const n = Math.hypot((c.col - p.c) / FALLOFF_X, (c.row - p.r) / FALLOFF_Y);
          const x = clamp((n - n0) / (1 - n0), 0, 1);
          keep *= 1 - p.s * Math.exp(-(x * x) / (2 * FALLOFF_SIGMA * FALLOFF_SIGMA));
        }
        const t = 1 - keep;
        const wght = Math.round((REST.wght + (PEAK.wght - REST.wght) * t) / WGHT_STEP) * WGHT_STEP;
        const wdth = Math.round((REST.wdth + (PEAK.wdth - REST.wdth) * t) / WDTH_STEP) * WDTH_STEP;
        const slnt = Math.round((REST.slnt + (PEAK.slnt - REST.slnt) * t) / SLNT_STEP) * SLNT_STEP;
        const next = `"wght" ${wght}, "wdth" ${wdth}, "slnt" ${slnt}`;
        if (next !== c.last) {
          c.last = next;
          c.el.style.fontVariationSettings = next;
        }

        // Colour wave: each ripple is a Gaussian ring; overlapping rings add up.
        let k = 0;
        for (const rp of this.ripples) {
          const d = Math.hypot((c.col - rp.c) * unitW, (c.row - rp.r) * unitH);
          const off = (d - (secs - rp.start) * RIPPLE.speed) / RIPPLE.width;
          k += Math.exp(-off * off * 4);
        }
        k = Math.round(clamp(k, 0, 1) * COLOR_STEPS) / COLOR_STEPS;
        const color = k === 0 ? '' : `rgb(${RIPPLE.color.map((ch) => Math.round(ch * k)).join(' ')})`;
        if (color !== c.lastColor) {
          c.lastColor = color;
          c.el.style.color = color;
        }
      }
    };
    frame.update(this.loop, true);
    this.destroyRef.onDestroy(() => this.loop && cancelFrame(this.loop));
  }
}
