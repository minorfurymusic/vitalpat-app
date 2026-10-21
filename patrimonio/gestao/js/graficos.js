/* VitalPat Patrimônio · Gestão — gráficos em SVG puro (sem biblioteca).
   Regras: uma cor por série (paleta validada), marcas finas com ponta arredondada,
   rótulos diretos só onde ajudam, dica ao passar o mouse e tabela sempre junto. */
'use strict';
(function () {
  const VP = window.VP;
  const esc = VP.u.esc;
  const G = VP.graficos = {};

  // Dica (tooltip) única para todos os gráficos
  let dica = null;
  const mostrarDica = (ev) => {
    const alvo = ev.target.closest('[data-dica]');
    if (!alvo) { if (dica) dica.hidden = true; return; }
    if (!dica) { dica = document.createElement('div'); dica.className = 'dica-grafico'; dica.setAttribute('role', 'tooltip'); document.body.appendChild(dica); }
    dica.innerHTML = alvo.getAttribute('data-dica');
    dica.hidden = false;
    const x = Math.min(ev.clientX + 14, window.innerWidth - dica.offsetWidth - 8);
    const y = Math.max(8, ev.clientY - dica.offsetHeight - 12);
    dica.style.left = x + 'px';
    dica.style.top = y + 'px';
  };
  document.addEventListener('mousemove', mostrarDica);
  document.addEventListener('focusin', (ev) => {
    const alvo = ev.target.closest && ev.target.closest('[data-dica]');
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    mostrarDica({ target: alvo, clientX: r.left + r.width / 2, clientY: r.top });
  });

  const fmtPadrao = (v) => VP.u.inteiro(v);

  // Barras horizontais — comparar categorias (unidades, classes, estados…)
  G.barrasH = (dados, op = {}) => {
    const fmt = op.formato || fmtPadrao;
    const lista = dados.filter((d) => d.valor > 0 || op.mostrarZeros).slice(0, op.limite || 12);
    if (!lista.length) return '<p class="vazio">Sem dados para este gráfico.</p>';
    const max = Math.max(...lista.map((d) => d.valor), 1);
    const linhas = lista.map((d) => {
      const w = Math.max(0.5, (d.valor / max) * 100);
      const tip = `<b>${esc(d.rotulo)}</b><br>${esc(fmt(d.valor))}${d.extra ? '<br>' + esc(d.extra) : ''}`;
      const rot = d.link ? `<a href="${esc(d.link)}">${esc(d.rotulo)}</a>` : esc(d.rotulo);
      return `<div class="barra-linha" tabindex="0" data-dica="${esc(tip)}">
          <span class="barra-rotulo" title="${esc(d.rotulo)}">${rot}</span>
          <span class="barra-trilho"><span class="barra" style="width:${w}%;${d.cor ? 'background:' + d.cor : ''}"></span></span>
          <span class="barra-valor">${esc(fmt(d.valor))}</span>
        </div>`;
    }).join('');
    return `<div class="grafico-barrasH" role="img" aria-label="${esc(op.titulo || 'Gráfico de barras')}">${linhas}</div>`;
  };

  // Colunas — valores ao longo do tempo (meses, anos)
  G.colunas = (dados, op = {}) => {
    const fmt = op.formato || fmtPadrao;
    if (!dados.length || dados.every((d) => !d.valor)) return '<p class="vazio">Sem dados para este gráfico.</p>';
    const W = op.largura || 440, H = op.altura || 200, mE = 72, mD = 6, mT = 14, mB = 26;
    const max = Math.max(...dados.map((d) => d.valor), 1);
    const passo = (W - mE - mD) / dados.length;
    const larg = Math.max(4, Math.min(36, passo - 6));
    const y = (v) => mT + (H - mT - mB) * (1 - v / max);
    const grade = [0, 0.5, 1].map((f) => {
      const v = max * f, yy = y(v);
      return `<line x1="${mE}" x2="${W - mD}" y1="${yy}" y2="${yy}" class="grade"/><text x="${mE - 6}" y="${yy + 4}" text-anchor="end" class="eixo">${esc(op.formatoEixo ? op.formatoEixo(v) : fmt(v))}</text>`;
    }).join('');
    const pularRotulo = Math.ceil(dados.length / Math.max(4, Math.floor(W / 52)));
    const barras = dados.map((d, i) => {
      const x = mE + i * passo + (passo - larg) / 2;
      const yy = y(d.valor), h = Math.max(0, H - mB - yy);
      const rx = Math.min(4, larg / 2, h);
      const tip = `<b>${esc(d.rotulo)}</b><br>${esc(fmt(d.valor))}`;
      // ponta arredondada só em cima, base reta na linha do zero
      const path = h > 0 ? `M${x},${H - mB} V${yy + rx} Q${x},${yy} ${x + rx},${yy} H${x + larg - rx} Q${x + larg},${yy} ${x + larg},${yy + rx} V${H - mB} Z` : '';
      return `<g tabindex="0" data-dica="${esc(tip)}"><rect x="${mE + i * passo}" y="${mT}" width="${passo}" height="${H - mT - mB}" class="alvo"/>${path ? `<path d="${path}" class="coluna"/>` : ''}${i % pularRotulo === 0 ? `<text x="${x + larg / 2}" y="${H - 10}" text-anchor="middle" class="eixo">${esc(d.rotulo)}</text>` : ''}</g>`;
    }).join('');
    return `<svg class="grafico-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(op.titulo || 'Gráfico de colunas')}">${grade}<line x1="${mE}" x2="${W - mD}" y1="${H - mB}" y2="${H - mB}" class="base"/>${barras}</svg>`;
  };

  // Linha — evolução (ex.: valor do bem ao longo da vida útil)
  G.linha = (pontos, op = {}) => {
    const fmt = op.formato || fmtPadrao;
    if (pontos.length < 2) return '<p class="vazio">Sem dados para este gráfico.</p>';
    const W = op.largura || 440, H = op.altura || 200, mE = 66, mD = 10, mT = 14, mB = 26;
    const max = Math.max(...pontos.map((p) => p.y), 1);
    const x = (i) => mE + (W - mE - mD) * i / (pontos.length - 1);
    const y = (v) => mT + (H - mT - mB) * (1 - v / max);
    const d = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
    const grade = [0, 0.5, 1].map((f) => `<line x1="${mE}" x2="${W - mD}" y1="${y(max * f)}" y2="${y(max * f)}" class="grade"/><text x="${mE - 6}" y="${y(max * f) + 4}" text-anchor="end" class="eixo">${esc(op.formatoEixo ? op.formatoEixo(max * f) : fmt(max * f))}</text>`).join('');
    const passoRot = Math.ceil(pontos.length / Math.max(3, Math.floor(W / 70)));
    const rotulos = pontos.map((p, i) => i % passoRot === 0 || i === pontos.length - 1 ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="eixo">${esc(op.rotuloX ? op.rotuloX(p.x) : p.x)}</text>` : '').join('');
    const larg = (W - mE - mD) / (pontos.length - 1);
    const alvos = pontos.map((p, i) => `<g tabindex="-1" data-dica="${esc(`<b>${op.rotuloX ? op.rotuloX(p.x) : p.x}</b><br>${fmt(p.y)}`)}"><rect x="${x(i) - larg / 2}" y="${mT}" width="${larg}" height="${H - mT - mB}" class="alvo"/><line x1="${x(i)}" x2="${x(i)}" y1="${mT}" y2="${H - mB}" class="mira"/><circle cx="${x(i)}" cy="${y(p.y)}" r="4" class="ponto"/></g>`).join('');
    const hoje = op.marcaX != null ? (() => { const i = pontos.findIndex((p) => p.x >= op.marcaX); return i >= 0 ? `<line x1="${x(i)}" x2="${x(i)}" y1="${mT}" y2="${H - mB}" class="marca-hoje"/><text x="${x(i) + 4}" y="${mT + 10}" class="eixo">hoje</text>` : ''; })() : '';
    return `<svg class="grafico-svg grafico-linha" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(op.titulo || 'Gráfico de linha')}">${grade}<line x1="${mE}" x2="${W - mD}" y1="${H - mB}" y2="${H - mB}" class="base"/>${hoje}<path d="${d}" class="linha"/>${rotulos}${alvos}</svg>`;
  };

  // Barras empilhadas de 2 partes (ex.: conferidos × faltam) com legenda
  G.empilhadas = (dados, nomes, op = {}) => {
    if (!dados.length) return '<p class="vazio">Sem dados para este gráfico.</p>';
    const fmt = op.formato || fmtPadrao;
    const legenda = `<div class="legenda"><span><i class="serie-1"></i>${esc(nomes[0])}</span><span><i class="serie-cinza"></i>${esc(nomes[1])}</span></div>`;
    const linhas = dados.map((d) => {
      const tot = d.a + d.b || 1;
      const tip = `<b>${esc(d.rotulo)}</b><br>${esc(nomes[0])}: ${esc(fmt(d.a))}<br>${esc(nomes[1])}: ${esc(fmt(d.b))}`;
      return `<div class="barra-linha" tabindex="0" data-dica="${esc(tip)}">
        <span class="barra-rotulo" title="${esc(d.rotulo)}">${esc(d.rotulo)}</span>
        <span class="barra-trilho empilhada"><span class="barra" style="width:${d.a / tot * 100}%"></span><span class="barra cinza" style="width:${d.b / tot * 100}%"></span></span>
        <span class="barra-valor">${esc(VP.u.pct(d.a / tot))}</span></div>`;
    }).join('');
    return legenda + `<div class="grafico-barrasH">${linhas}</div>`;
  };

  // Medidor simples (barra de progresso com texto)
  G.medidor = (fracao, texto, classe = '') => `<div class="medidor ${classe}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fracao * 100)}"><span style="width:${Math.min(100, Math.max(0, fracao * 100))}%"></span></div>${texto ? `<small class="medidor-texto">${esc(texto)}</small>` : ''}`;

  // Cartão de número em destaque
  G.numero = (rotulo, valor, detalhe = '', link = '') => `<${link ? `a href="${esc(link)}"` : 'div'} class="numero-destaque"><span class="numero-rotulo">${esc(rotulo)}</span><strong>${esc(valor)}</strong>${detalhe ? `<small>${esc(detalhe)}</small>` : ''}</${link ? 'a' : 'div'}>`;

  // QR Code (biblioteca qrcode-generator, MIT)
  G.qr = (texto, tamanho = 3) => {
    if (typeof window.qrcode !== 'function') return '';
    const q = window.qrcode(0, 'M');
    q.addData(String(texto));
    q.make();
    return q.createSvgTag({ cellSize: tamanho, margin: 0, scalable: true });
  };
  // Mapa simples em desenho (sem internet e bom para imprimir): pontos e contornos por latitude/longitude.
  // pontos: [{ lat, lon, cor, rotulo, link }]; contornos: [{ pontos: [[lat, lon]…], rotulo }]
  G.mapaPontos = (pontos, op = {}) => {
    const ps = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const cs = (op.contornos || []).filter((c) => (c.pontos || []).length >= 3);
    const todos = ps.map((p) => [p.lat, p.lon]).concat(cs.flatMap((c) => c.pontos));
    if (!todos.length) return '<p class="vazio">Sem coordenadas para desenhar o mapa.</p>';
    const W = op.largura || 640, H = op.altura || 360, m = 18;
    let minLat = Math.min(...todos.map((x) => x[0])), maxLat = Math.max(...todos.map((x) => x[0]));
    let minLon = Math.min(...todos.map((x) => x[1])), maxLon = Math.max(...todos.map((x) => x[1]));
    if (maxLat - minLat < 1e-5) { minLat -= 0.0002; maxLat += 0.0002; }
    if (maxLon - minLon < 1e-5) { minLon -= 0.0002; maxLon += 0.0002; }
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180); // longitude encolhe longe do equador
    const larg = (maxLon - minLon) * k, alt = maxLat - minLat;
    const esc2 = Math.min((W - 2 * m) / larg, (H - 2 * m) / alt);
    const ox = (W - larg * esc2) / 2, oy = (H - alt * esc2) / 2;
    const x = (lon) => ox + (lon - minLon) * k * esc2;
    const y = (lat) => H - oy - (lat - minLat) * esc2;
    // escala: metros por pixel ≈ 111.320 m por grau de latitude
    const mPorPx = 111320 / esc2;
    const opcoes = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const barra = opcoes.find((v) => v / mPorPx >= 60) || 5000;
    const r = op.raio || 4;
    const poligonos = cs.map((c) => `<polygon points="${c.pontos.map(([la, lo]) => `${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join(' ')}" class="mapa-contorno"><title>${esc(c.rotulo || '')}</title></polygon>`).join('');
    const marcas = ps.map((p) => { const c = `<circle cx="${x(p.lon).toFixed(1)}" cy="${y(p.lat).toFixed(1)}" r="${r}" fill="${esc(p.cor || 'var(--serie-1)')}" stroke="var(--superficie)" stroke-width="1"><title>${esc(p.rotulo || '')}</title></circle>`; return p.link ? `<a href="${esc(p.link)}">${c}</a>` : c; }).join('');
    return `<svg class="grafico-svg mapa-pontos" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(op.titulo || 'Mapa')}">
      <rect x="0" y="0" width="${W}" height="${H}" class="mapa-fundo"/>${poligonos}${marcas}
      <g class="eixo"><text x="${W - 14}" y="20" text-anchor="middle">N</text><path d="M${W - 14},24 l-5,12 h10 z" fill="currentColor"/></g>
      <g class="eixo"><line x1="12" x2="${12 + barra / mPorPx}" y1="${H - 12}" y2="${H - 12}" stroke="currentColor" stroke-width="2"/><text x="12" y="${H - 16}">${barra >= 1000 ? barra / 1000 + ' km' : barra + ' m'}</text></g>
    </svg>`;
  };
})();
