// @metis/ui — the illustrations. Still drawings of the things a warehouse is made of:
// real materials (kraft cartons, taped seams, timber pallets, painted rack steel), one
// light from the top left and a soft shadow on the floor. Coloured only by --mx-ill-*
// tokens, so they follow light and dark. Each fills its container's width; size the box,
// never the scene. Use sparingly: empty states and one quiet panel per page at most,
// never behind data or in a table (design system §2.2).
import { useId, type ReactNode } from "react";

type V3 = [number, number, number];
type Paint = { t: string; l: string; r: string };
type Block = (x: number, y: number, z: number, w: number, d: number, h: number, c: Paint, children?: ReactNode) => ReactNode;

const paint = (n: string): Paint => ({ t: `var(--mx-ill-${n}-t)`, l: `var(--mx-ill-${n}-l)`, r: `var(--mx-ill-${n}-r)` });
const KRAFT = paint("kraft"), WOOD = paint("wood"), FRAME = paint("frame"), BEAM = paint("beam"), DECK = paint("deck"), WALL = paint("wall"), ROOF = paint("roof");

const at = ([x, y, z]: V3): [number, number] => [(x - y) * 0.866, (x + y) * 0.5 - z];
const pts = (...v: V3[]) => v.map((p) => at(p).map((n) => n.toFixed(2)).join(",")).join(" ");

/** The two faces of a block a viewer can see below its top, and the top itself. */
const leftFace = (x: number, y: number, z: number, w: number, d: number, h: number) =>
  pts([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]);
const rightFace = (x: number, y: number, z: number, w: number, d: number, h: number) =>
  pts([x + w, y + d, z], [x + w, y, z], [x + w, y, z + h], [x + w, y + d, z + h]);
const topFace = (x: number, y: number, z: number, w: number, d: number, h: number) =>
  pts([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]);

/** Paints blocks with one light: every side face darkens gently toward the floor, and the
 *  near top edges catch the light. `id` keeps the gradients unique to one drawing. */
function painter(id: string) {
  const block: Block = (x, y, z, w, d, h, c, children) => {
    const [ax, ay] = at([x, y + d, z + h]), [bx, by] = at([x + w, y + d, z + h]), [cx, cy] = at([x + w, y, z + h]), [fx, fy] = at([x + w, y + d, z]);
    return (
      <g key={`${x},${y},${z},${w},${d},${h}`}>
        <polygon points={leftFace(x, y, z, w, d, h)} fill={c.l} />
        <polygon points={leftFace(x, y, z, w, d, h)} fill={`url(#${id}-fall)`} />
        <polygon points={rightFace(x, y, z, w, d, h)} fill={c.r} />
        <polygon points={rightFace(x, y, z, w, d, h)} fill={`url(#${id}-fall)`} />
        <polygon points={topFace(x, y, z, w, d, h)} fill={c.t} />
        <path d={`M${ax} ${ay}L${bx} ${by}L${cx} ${cy}`} fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="0.3" strokeLinejoin="round" />
        <path d={`M${bx} ${by}L${fx} ${fy}`} fill="none" stroke="#000000" strokeOpacity="0.1" strokeWidth="0.3" />
        {children}
      </g>
    );
  };
  return { block, carton: carton(block), pallet: pallet(block), shadow: shadow(id) };
}

/** A packed carton: flaps meeting along the top, parcel tape over the seam and down the
 *  near face; `tag` adds its printed QR label. */
const carton = (block: Block) => (x: number, y: number, z: number, w: number, d: number, h: number, tag?: boolean) => {
  const tw = Math.min(w * 0.2, 2.4), mx = x + w / 2;
  const seam = pts([mx - tw / 2, y, z + h], [mx + tw / 2, y, z + h], [mx + tw / 2, y + d, z + h], [mx - tw / 2, y + d, z + h]);
  const drop = Math.min(h * 0.3, 3.2);
  const lip = pts([mx - tw / 2, y + d, z + h], [mx + tw / 2, y + d, z + h], [mx + tw / 2, y + d, z + h - drop], [mx - tw / 2, y + d, z + h - drop]);
  const flap = at([x, y + d / 2, z + h]), flapEnd = at([x + w, y + d / 2, z + h]);
  return block(x, y, z, w, d, h, KRAFT, (
    <>
      <path d={`M${flap[0]} ${flap[1]}L${flapEnd[0]} ${flapEnd[1]}`} stroke="var(--mx-ill-tape-edge)" strokeOpacity="0.4" strokeWidth="0.22" />
      <polygon points={seam} fill="var(--mx-ill-tape)" />
      <polygon points={lip} fill="var(--mx-ill-tape)" opacity="0.92" />
      {tag && <FaceLabel x={x + w * 0.1} y={y + d} z={z + h * 0.16} w={w * 0.34} h={Math.min(h * 0.56, w * 0.42)} />}
    </>
  ));
};

/** A timber pallet: three runners under five deck boards. */
const pallet = (block: Block) => (x: number, y: number, z: number, w: number, d: number) => {
  const boards = Array.from({ length: 5 }, (_, i) => block(x, y + (i * d) / 5 + 0.25, z + 2.2, w, d / 5 - 0.5, 0.8, WOOD));
  const runners = [0, 1, 2].map((i) => block(x + (i * (w - 2.6)) / 2, y, z, 2.6, d, 2.2, WOOD));
  return <g key={`pallet${x},${y}`}>{runners}{boards}</g>;
};

/** A soft contact shadow on the floor, under a footprint. */
const shadow = (id: string) => (x: number, y: number, w: number, d: number, spread = 3, opacity = 0.2) => (
  <polygon points={pts([x - spread * 0.3, y, 0], [x + w + spread, y, 0], [x + w + spread, y + d + spread, 0], [x - spread * 0.3, y + d + spread, 0])}
    fill="var(--mx-ill-shadow)" opacity={opacity} filter={`url(#${id}-soft)`} />
);

/** A deterministic 21×21 code with real finder squares: reads as a QR at any size. */
function qrModules(seed: number): [number, number][] {
  const out: [number, number][] = [];
  const inFinder = (c: number, r: number) => (c < 8 && r < 8) || (c > 12 && r < 8) || (c < 8 && r > 12);
  let s = seed;
  for (let r = 0; r < 21; r++) for (let c = 0; c < 21; c++) {
    s = (s * 9301 + 49297) % 233280;
    if (!inFinder(c, r) && s / 233280 > 0.52) out.push([c, r]);
  }
  for (const [ox, oy] of [[0, 0], [14, 0], [0, 14]]) for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) out.push([ox + c, oy + r]);
  }
  return out;
}
const QR = qrModules(7);

/** A white printed label stuck flat on a carton's near face, with its code. */
function FaceLabel({ x, y, z, w, h }: { x: number; y: number; z: number; w: number; h: number }) {
  const q = Math.min(w, h) * 0.8, u = q / 21, ox = x + (w - q) / 2, oz = z + (h - q) / 2;
  return (
    <>
      <polygon points={pts([x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h])} fill="var(--mx-ill-paper)" />
      <path d={QR.map(([c, r]) => {
        const a = at([ox + c * u, y, oz + q - r * u]), b = at([ox + (c + 1) * u, y, oz + q - r * u]);
        const e = at([ox + (c + 1) * u, y, oz + q - (r + 1) * u]), f = at([ox + c * u, y, oz + q - (r + 1) * u]);
        return `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}L${e[0].toFixed(2)} ${e[1].toFixed(2)}L${f[0].toFixed(2)} ${f[1].toFixed(2)}Z`;
      }).join("")} fill="var(--mx-ill-ink)" />
    </>
  );
}

function Drawing({ id, box, label, children }: { id: string; box: string; label?: string; children: ReactNode }) {
  return (
    <svg className="mx-ill" viewBox={box} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={`${id}-fall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.07" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.13" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.8" /></filter>
      </defs>
      {children}
    </svg>
  );
}

/** A soft pool of floor the drawing stands on: fades to nothing at its edge. */
function Floor({ id, x, y, w, d }: { id: string; x: number; y: number; w: number; d: number }) {
  const [cx, cy] = at([x + w / 2, y + d / 2, 0]);
  const rx = (w + d) * 0.45;
  return (
    <>
      <radialGradient id={`${id}-floor`}>
        <stop offset="0.45" stopColor="var(--mx-ill-floor)" />
        <stop offset="1" stopColor="var(--mx-ill-floor)" stopOpacity="0" />
      </radialGradient>
      <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.56} fill={`url(#${id}-floor)`} />
    </>
  );
}

/** One bay of pallet racking: blue uprights, orange beams, three levels of stock. */
export function RackScene({ label }: { label?: string }) {
  const id = `r${useId().replace(/[^a-z0-9]/gi, "")}`;
  const { block, carton, pallet, shadow } = painter(id);
  const W = 62, D = 18, P = 1.6, levels = [8, 29, 50], beam = 2.2, H = 70;
  const post = (x: number, y: number) => block(x, y, 0, P, P, H, FRAME);
  const holes = (x: number, y: number) => Array.from({ length: 21 }, (_, i) => {
    const [hx, hy] = at([x + P / 2, y + P, 3 + i * 3.2]);
    return <ellipse key={i} cx={hx} cy={hy} rx="0.28" ry="0.42" fill="#000000" opacity="0.32" />;
  });
  const level = (z: number, stock: ReactNode) => (
    <g key={z}>
      {block(0, P * 0.2, z - beam, W, 1, beam, BEAM)}
      {block(1, 1, z - 0.2, W - 2, D - 2, 0.4, DECK)}
      {stock}
      {block(P, D - 1.2, z - beam, W - P, 1.2, beam, BEAM)}
      {block(W, P, z - beam, 1.2, D - P, beam, BEAM)}
    </g>
  );
  return (
    <Drawing id={id} box="-52 -76 124 136" label={label}>
      <Floor id={id} x={-8} y={-8} w={82} d={50} />
      <path d={`M${at([-6, 31, 0]).join(" ")}L${at([66, 31, 0]).join(" ")}`} stroke="var(--mx-ill-mark)" strokeWidth="1.1" strokeLinecap="round" />
      {shadow(0, 0, W, D, 5, 0.22)}
      {post(0, 0)}{post(W - P + 1.2, 0)}
      {block(0, P, 5, 0.8, D - P, 0.9, FRAME)}{block(0, P, 34, 0.8, D - P, 0.9, FRAME)}{block(0, P, 58, 0.8, D - P, 0.9, FRAME)}
      {level(levels[0], <>
        {pallet(4, 3, levels[0] + 0.2, 24, 13)}
        {carton(5, 4, levels[0] + 3.2, 10.5, 11, 10)}{carton(16, 4, levels[0] + 3.2, 10.5, 11, 12, true)}
        {pallet(33, 3, levels[0] + 0.2, 24, 13)}
        {carton(34, 4, levels[0] + 3.2, 21, 11, 8)}
      </>)}
      {level(levels[1], <>
        {carton(4, 4, levels[1] + 0.2, 13, 11, 12)}
        {carton(18.5, 4, levels[1] + 0.2, 10, 11, 8)}
        {carton(36, 4, levels[1] + 0.2, 14, 11, 13, true)}
        {carton(51, 4, levels[1] + 0.2, 8, 11, 8)}
      </>)}
      {level(levels[2], <>
        {carton(6, 4, levels[2] + 0.2, 16, 11, 11)}
        {carton(24, 4, levels[2] + 0.2, 10, 11, 7)}
        {carton(41, 4, levels[2] + 0.2, 13, 11, 9)}
      </>)}
      {post(0, D - P)}{holes(0, D - P)}
      {block(W - P + 1.2, D - P, 0, P, P, H, FRAME)}{holes(W - P + 1.2, D - P)}
    </Drawing>
  );
}

/** A loaded pallet, the nearest carton carrying its QR: "every box has its label". */
export function CartonsScene({ label }: { label?: string }) {
  const id = `c${useId().replace(/[^a-z0-9]/gi, "")}`;
  const { block: _b, carton, pallet, shadow } = painter(id);
  return (
    <Drawing id={id} box="-46 -34 112 90" label={label}>
      <Floor id={id} x={-4} y={-4} w={70} d={46} />
      {shadow(0, 0, 40, 32, 6, 0.24)}
      {shadow(52, 8, 12, 12, 3, 0.2)}
      {pallet(0, 0, 0, 40, 32)}
      {carton(1, 1, 3, 18, 14, 13)}{carton(20.5, 1, 3, 18, 14, 13)}
      {carton(1, 16.5, 3, 18, 14.5, 13)}{carton(20.5, 16.5, 3, 18, 14.5, 13, true)}
      {carton(2, 2, 16, 17, 13, 11)}{carton(20, 3, 16, 16, 13, 9)}
      {carton(5, 16, 16, 18, 14, 11, true)}
      {carton(52, 8, 0, 12, 12, 9)}
    </Drawing>
  );
}

/** A hand pallet truck carrying a loaded pallet across painted floor lanes: stock on the
 *  move. For empty states about movements and issues. */
export function TruckScene({ label }: { label?: string }) {
  const id = `t${useId().replace(/[^a-z0-9]/gi, "")}`;
  const { block, carton, pallet, shadow } = painter(id);
  const lane = (y: number) => {
    const p = at([-12, y, 0]), q = at([46, y, 0]);
    return <path key={y} d={`M${p.join(" ")}L${q.join(" ")}`} stroke="var(--mx-ill-mark)" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="5 3.5" />;
  };
  const wheel = (x: number, y: number) => { const [wx, wy] = at([x, y, 1.5]); return <ellipse key={`${x},${y}`} cx={wx} cy={wy} rx="1.7" ry="2" fill="var(--mx-ill-ink)" opacity="0.8" />; };
  const [h0x, h0y] = at([-6, 15, 8]), [h1x, h1y] = at([-14, 15, 28]);
  const [g0x, g0y] = at([-14, 11.5, 28]), [g1x, g1y] = at([-14, 18.5, 28]);
  // Drawn back to front: the truck's pump and handle stand behind the load (low x).
  return (
    <Drawing id={id} box="-44 -34 88 76" label={label}>
      <Floor id={id} x={-12} y={-4} w={58} d={42} />
      {lane(-2)}{lane(34)}
      {shadow(-9, 3, 44, 26, 5, 0.24)}
      <path d={`M${h0x} ${h0y}L${h1x} ${h1y}`} stroke="var(--mx-ill-frame-r)" strokeWidth="1.5" strokeLinecap="round" />
      <path d={`M${g0x} ${g0y}L${g1x} ${g1y}`} stroke="var(--mx-ill-ink)" strokeWidth="1.9" strokeLinecap="round" />
      {block(-8, 7, 1, 7, 16, 6.5, BEAM)}
      {block(-7, 12.5, 7.5, 3, 5, 2, FRAME)}
      {wheel(-4.5, 22)}
      {block(-1, 5, 0.6, 34, 4, 1.2, BEAM)}{block(-1, 21, 0.6, 34, 4, 1.2, BEAM)}
      {pallet(1, 2, 1.8, 30, 26)}
      {carton(2, 3, 4.8, 14, 12, 12)}{carton(17, 3, 4.8, 13, 12, 10)}
      {carton(2, 15.5, 4.8, 14, 11.5, 11)}{carton(17, 15.5, 4.8, 13, 11.5, 12, true)}
      {carton(4, 6, 16.8, 12, 10, 9)}
      {wheel(31, 9)}{wheel(31, 25)}
    </Drawing>
  );
}

/** A receiving dock: the store's roller doors, a canopy, and a delivery on the apron. */
export function DockScene({ label }: { label?: string }) {
  const id = `d${useId().replace(/[^a-z0-9]/gi, "")}`;
  const { block, carton, pallet, shadow } = painter(id);
  const W = 74, D = 40, H = 25;
  const doorFace = (x: number, w: number, h: number) => {
    const y = D;
    const ribs = Array.from({ length: Math.floor(h / 1.4) }, (_, i) => {
      const a = at([x, y, 1.4 * (i + 1)]), b = at([x + w, y, 1.4 * (i + 1)]);
      return <path key={i} d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke="var(--mx-ill-door-line)" strokeWidth="0.22" />;
    });
    return (
      <g key={x}>
        <polygon points={pts([x - 0.8, y, 0], [x + w + 0.8, y, 0], [x + w + 0.8, y, h + 0.8], [x - 0.8, y, h + 0.8])} fill="var(--mx-ill-frame-r)" />
        <polygon points={pts([x, y, 0], [x + w, y, 0], [x + w, y, h], [x, y, h])} fill="var(--mx-ill-door)" />
        {ribs}
      </g>
    );
  };
  const windows = Array.from({ length: 5 }, (_, i) => {
    const y0 = 4 + i * 7;
    return <polygon key={i} points={pts([W, y0, 15], [W, y0 + 5, 15], [W, y0 + 5, 20], [W, y0, 20])} fill="var(--mx-ill-glass)" opacity="0.9" />;
  });
  const bollard = (x: number, y: number) => block(x, y, 0, 1, 1, 4, BEAM);
  return (
    <Drawing id={id} box="-66 -36 136 108" label={label}>
      <Floor id={id} x={-10} y={-8} w={98} d={84} />
      {[20, 42].map((x) => {
        const a = at([x + 1, D + 3, 0]), b = at([x + 1, D + 30, 0]), e = at([x + 21, D + 3, 0]), f = at([x + 21, D + 30, 0]);
        return <path key={x} d={`M${a.join(" ")}L${b.join(" ")}M${e.join(" ")}L${f.join(" ")}`} stroke="var(--mx-ill-floor-line)" strokeWidth="0.7" />;
      })}
      {shadow(0, 0, W, D, 7, 0.22)}
      {block(0, 0, 0, W, D, H, WALL, <>{windows}{doorFace(8, 18, 15)}{doorFace(32, 18, 15)}{doorFace(56, 12, 15)}</>)}
      {block(-1.2, -1.2, H, W + 2.4, D + 2.4, 2.2, ROOF)}
      {block(6, D, 16.8, 46, 5, 0.9, ROOF)}
      {bollard(6.5, D + 2.5)}{bollard(27.5, D + 2.5)}{bollard(29.5, D + 2.5)}{bollard(51, D + 2.5)}
      {shadow(33, D + 11, 22, 18, 3, 0.22)}
      {pallet(33, D + 11, 0, 22, 18)}
      {carton(34, D + 12, 3, 10, 16, 9)}{carton(45, D + 12, 3, 9, 16, 11, true)}
      {carton(35, D + 14, 12, 9, 12, 7)}
    </Drawing>
  );
}

/** Printed box labels, one lifting off the sheet: what Box labels makes. */
export function LabelScene({ label }: { label?: string }) {
  const id = `l${useId().replace(/[^a-z0-9]/gi, "")}`;
  const sheet = (x: number, y: number, rot: number, face: boolean, key: string) => {
    const w = 118, h = 70, q = 50, u = q / 21;
    return (
      <g key={key} transform={`translate(${x} ${y}) rotate(${rot} ${w / 2} ${h / 2})`}>
        <rect x="0" y="3.5" width={w} height={h} rx="5" fill="var(--mx-ill-shadow)" opacity="0.22" filter={`url(#${id}-soft)`} />
        <rect width={w} height={h} rx="5" fill="var(--mx-ill-paper)" stroke="var(--mx-ill-paper-line)" strokeWidth="0.6" />
        {face && (
          <>
            <path d={QR.map(([c, r]) => `M${10 + c * u} ${10 + r * u}h${u}v${u}h${-u}Z`).join("")} fill="var(--mx-ill-ink)" />
            <rect x="68" y="11" width="40" height="6.5" rx="1.6" fill="var(--mx-ill-ink)" />
            <rect x="68" y="23" width="34" height="2.8" rx="1.4" fill="var(--mx-ill-paper-line)" />
            <rect x="68" y="29" width="27" height="2.8" rx="1.4" fill="var(--mx-ill-paper-line)" />
            <rect x="68" y="42" width="20" height="4.6" rx="1.4" fill="var(--mx-ill-frame-l)" />
            <rect x="68" y="51" width="31" height="2.8" rx="1.4" fill="var(--mx-ill-paper-line)" />
          </>
        )}
      </g>
    );
  };
  return (
    <Drawing id={id} box="0 0 200 120" label={label}>
      {sheet(52, 22, 9, false, "back")}
      {sheet(44, 26, 3.5, false, "mid")}
      {sheet(30, 32, -4, true, "front")}
    </Drawing>
  );
}

/** A costing sheet on a clipboard beside a fabric roll: what Costing compares against. */
export function SheetScene({ label }: { label?: string }) {
  const id = `s${useId().replace(/[^a-z0-9]/gi, "")}`;
  const row = (y: number, w: number, fig: number, tick: boolean) => (
    <g key={y}>
      <rect x="70" y={y} width={w} height="3" rx="1.5" fill="var(--mx-ill-paper-line)" />
      <rect x={136 - fig} y={y} width={fig} height="3" rx="1.5" fill="var(--mx-ill-ink)" opacity="0.75" />
      {tick && <path d={`M142 ${y + 1.5}l2.2 2.2 4-4.4`} fill="none" stroke="var(--mx-ill-frame-l)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
  return (
    <Drawing id={id} box="0 0 200 120" label={label}>
      <ellipse cx="104" cy="111" rx="78" ry="6" fill="var(--mx-ill-shadow)" opacity="0.18" filter={`url(#${id}-soft)`} />
      <g transform="rotate(-3 104 60)">
        <rect x="56" y="12" width="104" height="96" rx="6" fill="var(--mx-ill-wood-l)" />
        <rect x="62" y="20" width="92" height="84" rx="3" fill="var(--mx-ill-paper)" stroke="var(--mx-ill-paper-line)" strokeWidth="0.6" />
        <rect x="88" y="8" width="40" height="12" rx="3" fill="var(--mx-ill-frame-r)" />
        <rect x="70" y="30" width="44" height="6" rx="2" fill="var(--mx-ill-ink)" />
        <rect x="70" y="40" width="28" height="3" rx="1.5" fill="var(--mx-ill-paper-line)" />
        {row(52, 30, 16, true)}{row(61, 38, 12, true)}{row(70, 26, 18, false)}{row(79, 34, 10, true)}
        <rect x="70" y="90" width="76" height="0.8" fill="var(--mx-ill-paper-line)" />
        <rect x="118" y="94" width="18" height="4" rx="1.5" fill="var(--mx-ill-frame-l)" />
      </g>
      <g>
        <ellipse cx="42" cy="104" rx="20" ry="4" fill="var(--mx-ill-shadow)" opacity="0.2" filter={`url(#${id}-soft)`} />
        <rect x="22" y="58" width="36" height="46" rx="4" fill="var(--mx-ill-roof-l)" />
        <rect x="22" y="58" width="36" height="46" rx="4" fill={`url(#${id}-fall)`} />
        {[66, 74, 82, 90, 98].map((y) => <path key={y} d={`M24 ${y}h32`} stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="0.8" />)}
        <ellipse cx="40" cy="58" rx="18" ry="5.5" fill="var(--mx-ill-roof-t)" />
        <ellipse cx="40" cy="58" rx="5" ry="1.6" fill="var(--mx-ill-wood-r)" />
      </g>
    </Drawing>
  );
}
