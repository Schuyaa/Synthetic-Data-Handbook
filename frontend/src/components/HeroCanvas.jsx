import { useEffect, useRef } from "react";

/* ── Constants ── */
const PARTICLE_COUNT = 140;
const CONNECT_DIST = 120;
const SPEED = 0.12;
const EDGE_MARGIN = 20;

const MAX_PULSES = 3;
const PULSE_SPEED_FRAC = 0.0002;
const SPAWN_MIN = 60;
const SPAWN_MAX = 200;
const PULSE_RADIUS = 2;
const PULSE_GLOW = 6;

const COLLISION_DIST = 5;

/* Gentle bump on collision */
const BUMP_RADIUS = 100;
const BUMP_FORCE = 0.5;
const SETTLE_DUR = 180;
const BLAST_DECAY = 0.985;

const C_O = { glow: [220, 120, 20], dot: [235, 140, 30], line: [220, 120, 20] };
const C_G = { glow: [61, 155, 99], dot: [61, 175, 99], line: [61, 155, 99] };

/* ── Component ── */
export default function HeroCanvas() {
  const cvs = useRef(null);
  const pts = useRef([]);
  const pls = useRef([]);
  const fc = useRef(0);
  const af = useRef(null);
  // spawnAt: первый порог появления пульсации. Math.random() в теле render —
  // impure, поэтому инициализируем лениво внутри эффекта (ниже).
  const spawnAt = useRef(0);
  const dm = useRef({ w: 0, h: 0 });
  const tL = useRef(0), tR = useRef(1);

  const settling = useRef(false);
  const settleTimer = useRef(0);
  const visible = useRef(true);

  useEffect(() => {
    const canvas = cvs.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Лениво инициализируем первый порог spawnAt (нельзя Math.random() в
    // теле render — правило react-hooks/purity).
    spawnAt.current = SPAWN_MIN + Math.floor(Math.random() * (SPAWN_MAX - SPAWN_MIN));

    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
      canvas.style.width = r.width + "px";
      canvas.style.height = r.height + "px";
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };

    const init = () => {
      resize();
      const w = canvas.width / devicePixelRatio;
      const h = canvas.height / devicePixelRatio;
      dm.current = { w, h };
      const mid = h / 2;
      const p = [];
      p.push({ x: EDGE_MARGIN, y: mid, vx: 0, vy: 0, r: 0, pinned: true });
      p.push({ x: w - EDGE_MARGIN, y: mid, vx: 0, vy: 0, r: 0, pinned: true });
      for (let i = 0; i < PARTICLE_COUNT; i++)
        p.push({
          x: EDGE_MARGIN + Math.random() * (w - EDGE_MARGIN * 2),
          y: EDGE_MARGIN / 2 + Math.random() * (h - EDGE_MARGIN),
          vx: (Math.random() - 0.5) * SPEED,
          vy: (Math.random() - 0.5) * SPEED,
          r: Math.random() * 1.5 + 1,
          pinned: false,
        });
      pts.current = p;
      pls.current = [];
      settling.current = false;
      settleTimer.current = 0;
    };

    /* ── Helpers ── */
    const adjList = (p) => {
      const a = p.map(() => []);
      for (let i = 0; i < p.length; i++)
        for (let j = i + 1; j < p.length; j++) {
          const dx = p[i].x - p[j].x, dy = p[i].y - p[j].y;
          if (dx * dx + dy * dy < CONNECT_DIST * CONNECT_DIST) {
            a[i].push(j); a[j].push(i);
          }
        }
      return a;
    };

    const pickNext = (cur, p, adj, vis, dir, target) => {
      let all = adj[cur].filter((n) => !vis.has(n));
      if (!all.length && target) {
        vis.clear(); vis.add(cur);
        all = adj[cur].filter((n) => !vis.has(n));
      }
      if (!all.length) return -1;

      if (target) {
        const curDist = Math.hypot(p[cur].x - target.x, p[cur].y - target.y);
        const closer = all.filter((n) => Math.hypot(p[n].x - target.x, p[n].y - target.y) < curDist);
        const pool = closer.length ? closer : all;
        let b = -1, bs = Infinity;
        for (const n of pool) {
          const d = Math.hypot(p[n].x - target.x, p[n].y - target.y) + Math.random() * 3;
          if (d < bs) { bs = d; b = n; }
        }
        return b;
      }

      const end = dir === 1 ? tR.current : tL.current;
      if (all.includes(end)) return end;
      const fwd = all.filter((n) => (dir === 1 ? p[n].x > p[cur].x : p[n].x < p[cur].x));
      const cands = fwd.length ? fwd : all;
      let b = -1, bs = Infinity;
      for (const n of cands) {
        const s = Math.hypot(p[n].x - p[cur].x, p[n].y - p[cur].y) + Math.random() * 5;
        if (s < bs) { bs = s; b = n; }
      }
      return b;
    };

    const spawnPulse = (col, dir) => {
      const same = pls.current.filter((x) => x.direction === dir);
      if (same.length >= MAX_PULSES || same.some((x) => x.phase === "walk")) return;
      const si = dir === 1 ? tL.current : tR.current;
      pls.current.push({
        curIdx: si, nextIdx: -1, t: 0, trail: [],
        visited: new Set([si]), phase: "walk",
        exitFade: 0, color: col, direction: dir,
      });
    };

    /* Drawing */
    const drawDot = (x, y, a, c) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, PULSE_GLOW);
      g.addColorStop(0, `rgba(${c.glow},${0.5 * a})`);
      g.addColorStop(1, `rgba(${c.glow},0)`);
      ctx.beginPath(); ctx.arc(x, y, PULSE_GLOW, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, PULSE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c.dot},${a})`; ctx.fill();
    };

    const drawLine = (ax, ay, bx, by, a, c, lw = 1.5) => {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.strokeStyle = `rgba(${c.line},${a})`; ctx.lineWidth = lw; ctx.stroke();
    };

    const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

    const drawWeb = (p, adj, alpha) => {
      if (alpha < 0.01) return;
      const webColor = isDark() ? "255,255,255" : "42,125,110";
      for (let i = 0; i < p.length; i++)
        for (const j of adj[i]) {
          if (j <= i) continue;
          const dx = p[i].x - p[j].x, dy = p[i].y - p[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const op = 0.22 * (1 - d / CONNECT_DIST) * alpha;
          if (op < 0.005) continue;
          ctx.beginPath(); ctx.moveTo(p[i].x, p[i].y); ctx.lineTo(p[j].x, p[j].y);
          ctx.strokeStyle = `rgba(${webColor},${op})`; ctx.lineWidth = 0.8; ctx.stroke();
        }
    };

    const drawParticles = (p, alpha) => {
      const dotColor = isDark() ? "255,255,255" : "42,125,110";
      for (let i = 2; i < p.length; i++) {
        const a = typeof alpha === "number" ? alpha : alpha(i);
        if (a < 0.01) continue;
        ctx.beginPath(); ctx.arc(p[i].x, p[i].y, p[i].r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${dotColor},${a})`; ctx.fill();
      }
    };

    const moveP = (p) => {
      const { w, h } = dm.current;
      for (let i = 0; i < p.length; i++) {
        if (p[i].pinned) continue;
        p[i].x += p[i].vx; p[i].y += p[i].vy;
        if (p[i].x < EDGE_MARGIN) { p[i].x = EDGE_MARGIN; p[i].vx *= -1; }
        if (p[i].x > w - EDGE_MARGIN) { p[i].x = w - EDGE_MARGIN; p[i].vx *= -1; }
        if (p[i].y < 3) { p[i].y = 3; p[i].vy *= -1; }
        if (p[i].y > h - 3) { p[i].y = h - 3; p[i].vy *= -1; }
      }
    };

    /* Gentle push outward */
    const bump = (bx, by) => {
      const pp = pts.current;
      for (let i = 2; i < pp.length; i++) {
        const dx = pp[i].x - bx, dy = pp[i].y - by;
        const dist = Math.hypot(dx, dy);
        if (dist < BUMP_RADIUS && dist > 1) {
          const strength = BUMP_FORCE * (1 - dist / BUMP_RADIUS);
          pp[i].vx += (dx / dist) * strength;
          pp[i].vy += (dy / dist) * strength;
        }
      }
    };

    /* ════════════ MAIN DRAW ════════════ */
    const draw = () => {
      const { w, h } = dm.current;
      ctx.clearRect(0, 0, w, h);
      const p = pts.current;
      fc.current++;
      const spd = w * PULSE_SPEED_FRAC;

      /* Settle after bump — decelerate particles back to normal */
      if (settling.current) {
        settleTimer.current++;
        for (let i = 2; i < p.length; i++) {
          if (p[i].pinned) continue;
          const speed = Math.hypot(p[i].vx, p[i].vy);
          if (speed > SPEED) {
            p[i].vx *= BLAST_DECAY;
            p[i].vy *= BLAST_DECAY;
          }
        }
        if (settleTimer.current >= SETTLE_DUR) {
          settling.current = false;
          settleTimer.current = 0;
        }
      }

      moveP(p);
      const adj = adjList(p);
      drawWeb(p, adj, 1);
      drawParticles(p, 0.32);

      /* Spawn — both dots together */
      const hasO = pls.current.some((x) => x.color === C_O && x.phase === "walk");
      const hasG = pls.current.some((x) => x.color === C_G && x.phase === "walk");
      if (!hasO && !hasG && fc.current >= spawnAt.current) {
        spawnPulse(C_O, 1);
        spawnPulse(C_G, -1);
        spawnAt.current = fc.current + SPAWN_MIN + Math.floor(Math.random() * (SPAWN_MAX - SPAWN_MIN));
      }

      /* Pre-scan positions */
      let oPos = null, gPos = null;
      for (const pulse of pls.current) {
        if (pulse.phase !== "walk") continue;
        const cur = p[pulse.curIdx];
        let cx2, cy2;
        if (pulse.nextIdx >= 0) {
          const nxt = p[pulse.nextIdx];
          cx2 = cur.x + (nxt.x - cur.x) * pulse.t;
          cy2 = cur.y + (nxt.y - cur.y) * pulse.t;
        } else { cx2 = cur.x; cy2 = cur.y; }
        if (pulse.color === C_O) oPos = { x: cx2, y: cy2 };
        else gPos = { x: cx2, y: cy2 };
      }

      const mid = (oPos && gPos) ? { x: (oPos.x + gPos.x) / 2, y: (oPos.y + gPos.y) / 2 } : null;
      const oTarget = mid;
      const gTarget = mid;

      /* Process pulses */
      const alive = [];
      oPos = null; gPos = null;

      for (const pulse of pls.current) {
        const end = pulse.direction === 1 ? tR.current : tL.current;
        const col = pulse.color;
        const target = col === C_O ? oTarget : gTarget;

        if (pulse.phase === "fade") {
          pulse.exitFade = Math.max(0, pulse.exitFade - 0.006);
          for (const tr of pulse.trail) {
            tr.fade = Math.max(0, tr.fade - 0.002);
            if (tr.fade > 0) drawLine(p[tr.fi].x, p[tr.fi].y, p[tr.ti].x, p[tr.ti].y, 0.5 * tr.fade * Math.max(pulse.exitFade, 0.3), col);
          }
          if (pulse.exitFade > 0 || pulse.trail.some((t) => t.fade > 0)) alive.push(pulse);
          continue;
        }

        if (pulse.nextIdx >= 0) {
          const a = p[pulse.curIdx], b = p[pulse.nextIdx];
          const el = Math.hypot(b.x - a.x, b.y - a.y);
          pulse.t += el > 0 ? spd / el : 1;
          if (pulse.t >= 1) {
            pulse.trail.push({ fi: pulse.curIdx, ti: pulse.nextIdx, fade: 1 });
            pulse.t = 0; pulse.curIdx = pulse.nextIdx; pulse.visited.add(pulse.curIdx);
            if (!target && pulse.curIdx === end) { pulse.phase = "fade"; pulse.exitFade = 1; }
            else pulse.nextIdx = pickNext(pulse.curIdx, p, adj, pulse.visited, pulse.direction, target);
          }
        } else {
          pulse.nextIdx = pickNext(pulse.curIdx, p, adj, pulse.visited, pulse.direction, target);
        }

        for (const tr of pulse.trail) {
          tr.fade = Math.max(0, tr.fade - 0.002);
          if (tr.fade > 0) drawLine(p[tr.fi].x, p[tr.fi].y, p[tr.ti].x, p[tr.ti].y, 0.5 * tr.fade, col);
        }

        if (pulse.phase === "walk") {
          const cur = p[pulse.curIdx];
          let cx2, cy2;
          if (pulse.nextIdx >= 0) {
            const nxt = p[pulse.nextIdx];
            cx2 = cur.x + (nxt.x - cur.x) * pulse.t;
            cy2 = cur.y + (nxt.y - cur.y) * pulse.t;
            drawLine(cur.x, cur.y, cx2, cy2, 0.55, col);
          } else { cx2 = cur.x; cy2 = cur.y; }
          drawDot(cx2, cy2, pulse.nextIdx >= 0 ? 1 : 0.6 + 0.4 * Math.sin(fc.current * 0.05), col);
          if (col === C_O) oPos = { x: cx2, y: cy2 };
          else gPos = { x: cx2, y: cy2 };
        }

        pulse.trail = pulse.trail.filter((tr) => tr.fade > 0);
        alive.push(pulse);
      }
      pls.current = alive;

      /* Detect collision → gentle bump */
      if (oPos && gPos) {
        const dx = oPos.x - gPos.x, dy = oPos.y - gPos.y;
        if (dx * dx + dy * dy < COLLISION_DIST * COLLISION_DIST) {
          const mx = (oPos.x + gPos.x) / 2, my = (oPos.y + gPos.y) / 2;
          bump(mx, my);
          for (const pulse of pls.current) {
            if (pulse.phase === "walk") { pulse.phase = "fade"; pulse.exitFade = 1; }
          }
          settling.current = true;
          settleTimer.current = 0;
          spawnAt.current = fc.current + 90 + Math.floor(Math.random() * 120);
        }
      }

      if (visible.current) {
        af.current = requestAnimationFrame(draw);
      } else {
        af.current = null;
      }
    };

    init();
    draw();
    window.addEventListener("resize", init);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting;
        if (entry.isIntersecting && !af.current) draw();
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    return () => {
      window.removeEventListener("resize", init);
      cancelAnimationFrame(af.current);
      io.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={cvs}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
