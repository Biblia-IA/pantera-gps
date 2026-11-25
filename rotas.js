// Motor de rotas da Pantera: A* no grafo de ruas, tudo no aparelho.
(function (raiz) {
  const KM_BATERIA = 45, KMH = 25;
  const metros = (a, b) => {
    const k = Math.PI / 180, dy = (b[0] - a[0]) * k, dx = (b[1] - a[1]) * k * Math.cos((a[0] + b[0]) / 2 * k);
    return Math.hypot(dx, dy) * 6371000;
  };

  function carregar(M) {
    const pos = M.nos.map(n => [n[0] / 1e5, n[1] / 1e5]);
    const alt = M.nos.map(n => n[2]);
    const trechos = M.arestas.map(([a, b, m, c, nome, mao, vel, evitar, meio, duvida]) => {
      const g = [pos[a]];
      for (let i = 0; i < meio.length; i += 2) g.push([meio[i] / 1e5, meio[i + 1] / 1e5]);
      g.push(pos[b]);
      return { a, b, m, c, nome: M.nomes[nome], mao, vel, evitar, duvida, g };
    });
    // correções conferidas na API do Google: sentido proibido e trechos a evitar
    const C = M.correcoes || {}, bloq = new Set(C.bloq || []), penal = new Set(C.penal || []);
    const K = n => M.nos[n][0] + ',' + M.nos[n][1];
    const viz = pos.map(() => []);
    trechos.forEach((t, i) => {
      const ida = K(t.a) + '>' + K(t.b), volta = K(t.b) + '>' + K(t.a);
      t.ida = ida; t.volta = volta;
      if (penal.has(ida) || penal.has(volta)) t.penal = 20;
      if (t.mao >= 0 && !bloq.has(ida)) viz[t.a].push([t.b, i, 1]);
      if (t.mao <= 0 && !bloq.has(volta)) viz[t.b].push([t.a, i, -1]);
    });
    return { pos, alt, trechos, viz };
  }

  // marcas: [{tipo:'buraco'|'interditado', p:[lat,lon]}]
  function pesoMarcas(G, marcas) {
    const f = new Map();
    for (const mk of marcas || []) {
      G.trechos.forEach((t, i) => {
        if (!t.g.some((p, j) => j && distSeg(mk.p, t.g[j - 1], p) < 20)) return;
        if (mk.tipo === 'contramao') { // bloqueia só o sentido em que ele estava indo
          const az = rumoDe(t.g[0], t.g.at(-1)), d = Math.abs(((mk.rumo - az + 540) % 360) - 180);
          f.set(i + ':' + (d < 90 ? 1 : -1), 1e6); return;
        }
        f.set(i, Math.max(f.get(i) || 1, mk.tipo === 'interditado' ? 1000 : 2.5));
      });
    }
    return f;
  }
  const rumoDe = (a, b) => (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI + 360) % 360;
  function distSeg(p, a, b) {
    const k = Math.cos(p[0] * Math.PI / 180), ax = (a[1] - p[1]) * k, ay = a[0] - p[0], bx = (b[1] - p[1]) * k, by = b[0] - p[0];
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy) * 111320;
  }

  const FATOR = [0.9, 1, 1.25, 2.2, 4, 1.4, 3.5];
  function custo(G, t, sentido, op) {
    let f = FATOR[t.c];
    if (t.evitar) f = 9;
    if (t.duvida) f = Math.max(f, 8);
    if (t.penal) f *= t.penal;
    if (t.vel > 40) f = Math.max(f, t.vel >= 60 ? 6 : 3);
    if (op.pico && t.c >= 2 && t.c <= 4) f *= 1.3;
    const sobe = (G.alt[t.b] - G.alt[t.a]) * sentido, grau = sobe / Math.max(t.m, 40);
    if (grau > 0.03) f *= 1 + (grau - 0.03) * (op.garupa ? 60 : 12) + (op.garupa && grau > 0.07 ? 3 : 0);
    return t.m * f * (op.marcas.get(+t.i) || 1) * (op.marcas.get(t.i + ':' + sentido) || 1);
  }

  function noMaisPerto(G, p) {
    let m = 1e18, r = -1;
    for (let i = 0; i < G.pos.length; i++) {
      const d = (G.pos[i][0] - p[0]) ** 2 + ((G.pos[i][1] - p[1]) * 0.925) ** 2;
      if (d < m && G.viz[i].length) { m = d; r = i; }
    }
    return r;
  }

  function caminho(G, ini, fim, o) {
    const g = new Float64Array(G.pos.length).fill(Infinity), veio = new Array(G.pos.length), fechado = new Uint8Array(G.pos.length);
    const heap = [];
    const poe = (f, n) => { let i = heap.push([f, n]) - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= f) break; heap[i] = heap[p]; i = p; } heap[i] = [f, n]; };
    const tira = () => {
      const topo = heap[0], u = heap.pop();
      if (heap.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[c][0] >= u[0]) break; heap[i] = heap[c]; i = c; } heap[i] = u; }
      return topo;
    };
    g[ini] = 0; poe(0, ini);
    while (heap.length) {
      const n = tira()[1];
      if (n === fim) break;
      if (fechado[n]) continue;
      fechado[n] = 1;
      for (const [v, i, s] of G.viz[n]) {
        const t = G.trechos[i]; t.i = i;
        const c = g[n] + custo(G, t, s, o);
        if (c < g[v]) { g[v] = c; veio[v] = [n, i, s]; poe(c + 0.9 * metros(G.pos[v], G.pos[fim]), v); }
      }
    }
    if (g[fim] === Infinity) return null;
    const passos = [];
    for (let n = fim; n !== ini; n = veio[n][0]) passos.unshift(veio[n]);
    return { custo: g[fim], passos };
  }

  // op.rua: termina no meio da quadra, na rua certa, entrando pela mão permitida
  function rota(G, de, para, op = {}) {
    const o = { garupa: !!op.garupa, pico: !!op.pico, marcas: pesoMarcas(G, op.marcas) };
    const ini = noMaisPerto(G, de);
    if (op.rua) {
      let melhor = null;
      G.trechos.forEach((t, i) => {
        if (t.nome !== op.rua) return;
        for (let j = 1; j < t.g.length; j++) { const d = distSeg(para, t.g[j - 1], t.g[j]); if (!melhor || d < melhor.d) melhor = { t, i, j, d }; }
      });
      if (melhor && melhor.d < 120) {
        const { t, i, j } = melhor, A = t.g[j - 1], B = t.g[j];
        const k = Math.cos(A[0] * Math.PI / 180), vx = (B[1] - A[1]) * k, vy = B[0] - A[0], wx = (para[1] - A[1]) * k, wy = para[0] - A[0];
        const f = Math.max(0, Math.min(1, (vx * wx + vy * wy) / ((vx * vx + vy * vy) || 1)));
        const P = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
        const opcoes = [];
        if (G.viz[t.a].some(([v, ii]) => ii === i)) opcoes.push({ entra: t.a, geo: [...t.g.slice(0, j), P] });
        if (G.viz[t.b].some(([v, ii]) => ii === i)) opcoes.push({ entra: t.b, geo: [...t.g.slice(j).reverse(), P] });
        let fim = null;
        for (const x of opcoes) {
          const c = x.entra === ini ? { custo: 0, passos: [] } : caminho(G, ini, x.entra, o);
          if (!c) continue;
          let m = 0; for (let q = 1; q < x.geo.length; q++) m += metros(x.geo[q - 1], x.geo[q]);
          if (!fim || c.custo + m < fim.total) fim = { total: c.custo + m, c, x, m };
        }
        if (fim) {
          const r = resumo(G, fim.c.passos);
          const ultimo = fim.x.geo;
          for (let q = r.linha.length ? 1 : 0; q < ultimo.length; q++) r.linha.push(ultimo[q]);
          r.partes.push({ g: ultimo, ruim: !!t.evitar, subida: false });
          r.m += fim.m; r.min = Math.round(r.m / 1000 / KMH * 60); r.cargas = r.m / 1000 / KM_BATERIA;
          return r;
        }
      }
    }
    const c = caminho(G, ini, noMaisPerto(G, para), o);
    return c ? resumo(G, c.passos) : null;
  }

  function resumo(G, passos) {
    const linha = [], partes = [], evitadas = {}, rapidas = {}, subidas = [], duvidas = {};
    let m = 0, ganho = 0, sub = null;
    for (const [de, i, s] of passos) {
      const t = G.trechos[i], g = s > 0 ? t.g : [...t.g].reverse();
      const ruim = t.evitar || t.vel > 40 || t.c === 4;
      const ate = s > 0 ? t.b : t.a, d = G.alt[ate] - G.alt[de], grau = d / Math.max(t.m, 40);
      for (let j = linha.length ? 1 : 0; j < g.length; j++) linha.push(g[j]);
      partes.push({ g, ruim: !!ruim, subida: grau >= 0.06 });
      m += t.m; if (d > 0) ganho += d;
      if (t.duvida) duvidas[t.nome || 'rua sem nome'] = (duvidas[t.nome || 'rua sem nome'] || 0) + t.m;
      if (ruim) { const k = t.nome || 'via sem nome'; (t.evitar ? evitadas : rapidas)[k] = ((t.evitar ? evitadas : rapidas)[k] || 0) + t.m; }
      if (grau >= 0.06) {
        if (!sub) subidas.push(sub = { rua: t.nome || 'rua sem nome', m: 0, sobe: 0 });
        sub.m += t.m; sub.sobe += d;
      } else sub = null;
    }
    return {
      linha, partes, m, ganho: Math.round(ganho), min: Math.round(m / 1000 / KMH * 60), evitadas, rapidas, duvidas,
      subidas: subidas.filter(s => s.m >= 60).map(s => ({ rua: s.rua, m: s.m, grau: Math.round(s.sobe / s.m * 100) })),
      cargas: m / 1000 / KM_BATERIA,
    };
  }

  const api = { carregar, rota, metros, distSeg, KM_BATERIA };
  if (typeof module !== 'undefined') module.exports = api; else raiz.Rotas = api;
})(this);
