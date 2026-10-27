/* VitalPat Patrimônio · Gestão — versão para celular (pedido de 26/10/2026, prévia v2 aprovada).
   Tela inicial rápida com botões grandes; inventário por unidade com leitura de QR Code e código de barras
   pela câmera (só Android, leitor do próprio Chrome) ou digitando; termo de responsabilidade assinado na tela
   (ou recusa com testemunha); análise na Gestão, que aplica as mudanças, guarda o antes e o depois e o número
   do inventário em cada bem. Nada muda no cadastro do bem antes da aprovação. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, L = VP.LISTAS;
  const T = VP.telas;
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const quem = () => VP.servidor?.perfil?.nome || VP.sessao?.nome || VP.sessao?.usuario || 'demonstração';
  // Quem tem acesso faz inventário e termo pelo celular; aprovar é do administrador ou do gestor
  const podeCampo = () => !VP.servidor?.ativo || ['admin', 'gestor', 'campo'].includes(VP.servidor.perfil?.papel);
  const podeAprovar = () => !VP.servidor?.ativo || VP.servidor.podeAlterar();
  const semAcesso = (titulo) => ({ titulo, html: '<p class="aviso-inline">Seu papel só consulta. Inventário e termo pelo celular são de quem tem acesso de campo, gestor ou administrador.</p>' });
  const nomeEstado = (n) => L.estados[n] || '—';
  // Data e hora no fuso do aparelho (o registro guarda o instante em ISO/UTC; nunca cortar o texto UTC)
  const dataLocal = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const horaLocal = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const nomeResp = (id) => (id ? VP.nome('responsaveis', id) : 'sem responsável');

  // ------------------------------------------------------------------ leitor de código (câmera)
  // Fica em VP.Plataforma para os testes trocarem (ex.: VP.Plataforma.temCamera = () => false)
  VP.Plataforma.temCamera = VP.Plataforma.temCamera || (() => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia);
  const LE = VP.leitor = { atual: null };
  // O QR Code das etiquetas do sistema traz só a plaqueta; aceita também um endereço com "?plaqueta="
  LE.normalizar = (cod) => {
    const c = String(cod ?? '').trim();
    const m = c.match(/[?&]plaqueta=([^&#]+)/i);
    return m ? decodeURIComponent(m[1]).trim() : c;
  };
  LE.acharBem = (cod) => {
    const c = LE.normalizar(cod);
    if (!c) return null;
    const bens = VP.db.lista('bens');
    const semZero = c.replace(/^0+/, '');
    return bens.find((b) => String(b.plaqueta) === c) || (semZero && bens.find((b) => String(b.plaqueta).replace(/^0+/, '') === semZero)) || null;
  };
  LE.html = () => `<div class="cel-camera" data-camera>${VP.Plataforma.temCamera()
    ? '<video playsinline muted></video><div class="cel-mira"></div><div class="cel-laser"></div><p>Aponte para o QR Code ou o código de barras</p>'
    : '<p class="cel-sem-camera">Este aparelho ou navegador não lê códigos pela câmera (use o Chrome no Android). Digite a plaqueta abaixo.</p>'}</div>
    <form class="cel-digitar" data-digitar><input data-codigo placeholder="Ou digite a plaqueta" inputmode="numeric" autocomplete="off" aria-label="Plaqueta"><button class="botao primario">Abrir</button></form>`;
  const sinal = () => {
    try { navigator.vibrate && navigator.vibrate(80); } catch (_) { /* aparelho sem vibração */ }
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      const c = LE._som || (LE._som = new A()); const o = c.createOscillator(); const g = c.createGain();
      o.frequency.value = 1200; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.08);
    } catch (_) { /* sem som */ }
  };
  LE.parar = () => {
    const a = LE.atual; LE.atual = null;
    if (!a) return;
    clearTimeout(a.timer);
    if (a.fluxo) a.fluxo.getTracks().forEach((t) => t.stop());
  };
  LE.pausar = (sim) => { if (LE.atual) LE.atual.pausado = !!sim; };
  // Liga a leitura na tela: aoLer(codigo, origem) com origem "camera" ou "digitado"
  LE.ligar = (raiz, aoLer) => {
    LE.parar();
    const a = LE.atual = { aoLer, pausado: false, fluxo: null, timer: null };
    raiz.querySelector('[data-digitar]').addEventListener('submit', (e) => {
      e.preventDefault();
      const i = raiz.querySelector('[data-codigo]');
      const v = i.value.trim(); i.value = '';
      if (v) aoLer(v, 'digitado');
    });
    const video = raiz.querySelector('[data-camera] video');
    if (!video) return;
    (async () => {
      let fluxo;
      // Câmera leve: imagem pequena basta para ler etiqueta e deixa a leitura rápida
      try { fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
      catch (_) { const c = raiz.querySelector('[data-camera]'); if (c) c.innerHTML = '<p class="cel-sem-camera">Não foi possível abrir a câmera (o aparelho pediu permissão?). Digite a plaqueta abaixo.</p>'; return; }
      if (LE.atual !== a) { fluxo.getTracks().forEach((t) => t.stop()); return; }
      a.fluxo = fluxo; video.srcObject = fluxo;
      await video.play().catch(() => {});
      let formatos = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'upc_a'];
      try { const sup = await window.BarcodeDetector.getSupportedFormats(); const f = formatos.filter((x) => sup.includes(x)); if (f.length) formatos = f; } catch (_) { /* usa a lista */ }
      const det = new window.BarcodeDetector({ formats: formatos });
      let ultimo = '', ultimoEm = 0;
      const ciclo = async () => {
        if (LE.atual !== a) return;
        if (!a.pausado && video.readyState >= 2) {
          try {
            const r = await det.detect(video);
            const cod = r[0]?.rawValue;
            // A mesma etiqueta parada na frente da câmera não conta duas vezes
            if (cod && (cod !== ultimo || Date.now() - ultimoEm > 2500)) { ultimo = cod; ultimoEm = Date.now(); sinal(); a.aoLer(cod, 'camera'); }
          } catch (_) { /* tenta de novo */ }
        }
        a.timer = setTimeout(ciclo, 150);
      };
      ciclo();
    })();
  };
  // Para os testes: faz de conta que a câmera leu este código
  LE.simular = (cod) => LE.atual && LE.atual.aoLer(cod, 'camera');
  window.addEventListener('hashchange', () => LE.parar());

  // ------------------------------------------------------------------ assinatura com o dedo
  VP.assinatura = (canvas) => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 130;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#16365a';
    let desenhando = false, tracos = 0;
    const ponto = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', (e) => { desenhando = true; canvas.setPointerCapture?.(e.pointerId); const [x, y] = ponto(e); g.beginPath(); g.moveTo(x, y); });
    canvas.addEventListener('pointermove', (e) => { if (!desenhando) return; const [x, y] = ponto(e); g.lineTo(x, y); g.stroke(); tracos++; });
    const fim = () => { desenhando = false; };
    canvas.addEventListener('pointerup', fim); canvas.addEventListener('pointercancel', fim); canvas.addEventListener('pointerleave', fim);
    return {
      vazia: () => tracos < 3,
      limpar: () => { g.clearRect(0, 0, canvas.width, canvas.height); tracos = 0; },
      imagem: () => canvas.toDataURL('image/png')
    };
  };
  const quadroAssinatura = (rotulo, ajuda) => `<label class="cel-rotulo">${esc(rotulo)}</label>
    <div class="cel-assinar"><canvas data-assinatura></canvas><small>${esc(ajuda)}</small><button type="button" class="cel-limpar" data-limpar>Limpar</button></div>`;
  const ligarAssinatura = (raiz) => {
    const pad = VP.assinatura(raiz.querySelector('[data-assinatura]'));
    raiz.querySelector('[data-limpar]').addEventListener('click', pad.limpar);
    return pad;
  };

  // ------------------------------------------------------------------ regras do inventário pelo celular
  const IC = VP.invCampo = {};
  IC.lista = (incl = false) => VP.db.lista('inventarios', incl).filter((i) => i.origem === 'celular');
  IC.abertos = () => IC.lista().filter((i) => i.situacao === 'aberto');
  IC.emAnalise = () => IC.lista().filter((i) => i.situacao === 'em-analise');
  IC.situacaoTexto = (i) => (i.situacao === 'aberto' && i.pendenteResposta ? (i.pendenteResposta.tipo === 'recusa' ? 'recusado, aguardando correção' : 'esclarecimento pedido, aguardando resposta')
    : ({ aberto: 'aberto', 'em-analise': 'em análise', encerrado: 'aprovado' }[i.situacao] || i.situacao));
  IC.proximoNumero = () => {
    const ano = hoje().slice(0, 4);
    const n = VP.db.lista('inventarios', true).filter((i) => String(i.numero || '').startsWith(`INV-${ano}-`)).length + 1;
    return `INV-${ano}-${String(n).padStart(2, '0')}`;
  };
  IC.criar = async (unidadeId) => {
    const bens = VP.db.lista('bens').filter((b) => b.unidadeId === unidadeId && b.status !== 'baixado');
    const numero = IC.proximoNumero();
    const inv = {
      id: u.id(), numero, nome: `${numero} · ${VP.nome('unidades', unidadeId)}`, unidadeId, origem: 'celular',
      dataCorte: hoje(), situacao: 'aberto', esperados: Object.fromEntries(bens.map((b) => [b.id, unidadeId])),
      leituras: {}, sobras: [], criadoPor: quem(), abertoEm: agora(),
      historico: [{ em: agora(), por: quem(), descricao: `Inventário aberto pelo celular (${bens.length} bens esperados)` }]
    };
    await VP.db.gravar('inventarios', inv);
    return inv;
  };
  IC.progresso = (inv) => {
    const total = Object.keys(inv.esperados).length;
    const lidos = Object.keys(inv.esperados).filter((id) => inv.leituras[id]).length;
    const deFora = Object.keys(inv.leituras).filter((id) => !inv.esperados[id]).length;
    return { total, lidos, faltam: total - lidos, extras: deFora + (inv.sobras || []).length };
  };
  // O que muda em cada bem lido (só o que a pessoa mudou; o resto fica como está)
  const CAMPOS = [
    ['unidadeId', 'Unidade', (v) => VP.nome('unidades', v)],
    ['localizacao', 'Sala / local', (v) => v || '—'],
    ['estado', 'Estado', nomeEstado],
    ['responsavelId', 'Responsável', nomeResp]
  ];
  IC.mudancas = (inv, bemId) => {
    const l = inv.leituras[bemId]; const b = VP.db.pega('bens', bemId);
    if (!l || !b) return [];
    const ant = l.antes || { unidadeId: b.unidadeId, localizacao: b.localizacao || '', estado: b.estado, responsavelId: b.responsavelId || '' };
    const lista = CAMPOS.filter(([k]) => l[k] !== undefined && l[k] !== null && String(l[k]) !== String(ant[k] ?? ''))
      .map(([k, rotulo, fmt]) => ({ campo: k, rotulo, de: fmt(ant[k]), para: fmt(l[k]) }));
    if ((l.fotos || []).length) lista.push({ campo: 'fotos', rotulo: 'Fotos', de: '', para: `${l.fotos.length} nova(s)` });
    if (l.observacao) lista.push({ campo: 'observacao', rotulo: 'Observação', de: '', para: l.observacao });
    return lista;
  };
  IC.resumo = (inv) => {
    const lidos = Object.keys(inv.leituras).map((id) => VP.db.pega('bens', id)).filter(Boolean);
    const faltaram = Object.keys(inv.esperados).filter((id) => !inv.leituras[id]).map((id) => VP.db.pega('bens', id)).filter(Boolean);
    const deFora = lidos.filter((b) => !inv.esperados[b.id]);
    const mudancas = lidos.map((b) => ({ b, lista: IC.mudancas(inv, b.id) })).filter((x) => x.lista.length);
    const resp = new Map();
    for (const { b, lista } of mudancas) {
      const m = lista.find((x) => x.campo === 'responsavelId'); if (!m) continue;
      const k = `${m.de} → ${m.para}`; resp.set(k, (resp.get(k) || 0) + 1);
    }
    return {
      lidos, faltaram, deFora, sobras: inv.sobras || [], mudancas,
      semMudanca: lidos.filter((b) => !mudancas.some((x) => x.b.id === b.id)),
      estado: mudancas.filter((x) => x.lista.some((y) => y.campo === 'estado')).length,
      respDePara: [...resp].map(([k, n]) => ({ texto: k, n })),
      fotos: lidos.reduce((t, b) => t + (inv.leituras[b.id].fotos || []).length, 0) + (inv.sobras || []).reduce((t, s) => t + (s.fotos || []).length, 0)
    };
  };
  // Um termo por responsável, com os bens lidos que ficam com ele
  IC.gruposTermo = (inv) => {
    const g = new Map();
    for (const [id, l] of Object.entries(inv.leituras)) {
      const b = VP.db.pega('bens', id); if (!b) continue;
      const r = l.responsavelId || b.responsavelId; if (!r) continue;
      if (!g.has(r)) g.set(r, []);
      g.get(r).push(id);
    }
    return [...g].map(([responsavelId, bens]) => ({ responsavelId, bens: bens.sort() }));
  };
  IC.termos = (inv) => VP.db.lista('termosResp').filter((t) => t.inventarioId === inv.id && t.situacao !== 'cancelado');
  // Prepara os termos do inventário: mantém os que não mudaram (e a assinatura deles), cancela os que mudaram, cria os que faltam
  IC.prepararTermos = async (inv) => {
    const grupos = IC.gruposTermo(inv);
    const atuais = IC.termos(inv);
    const manter = [], cancelar = [], novos = [];
    for (const t of atuais) {
      const g = grupos.find((x) => x.responsavelId === t.responsavelId);
      if (g && g.bens.join('|') === [...t.bens].sort().join('|')) manter.push(t);
      else { t.situacao = 'cancelado'; t.canceladoEm = hoje(); t.historico = (t.historico || []).concat([{ data: agora(), descricao: 'Cancelado: a lista de bens do inventário mudou', usuario: quem() }]); cancelar.push(t); }
    }
    const ano = hoje().slice(0, 4);
    let n = VP.db.lista('termosResp', true).filter((t) => String(t.numero).endsWith('/' + ano)).length;
    for (const g of grupos) {
      if (manter.some((t) => t.responsavelId === g.responsavelId)) continue;
      novos.push({
        id: u.id(), numero: `${++n}/${ano}`, responsavelId: g.responsavelId, unidadeId: inv.unidadeId, bens: g.bens,
        origem: `inventário ${inv.numero}`, inventarioId: inv.id, emitidoEm: hoje(), prazo: u.somaDias(hoje(), VP.termos?.prazoDias() || 15),
        situacao: 'em-analise', historico: [{ data: agora(), descricao: `Termo do inventário ${inv.numero} (celular)`, usuario: quem() }]
      });
    }
    if (cancelar.length || novos.length) await VP.db.gravar('termosResp', cancelar.concat(novos));
    return manter.concat(novos);
  };
  const historico = (inv, descricao) => { inv.historico = (inv.historico || []).concat([{ em: agora(), por: quem(), descricao }]); };

  // ------------------------------------------------------------------ observação, esclarecimento e recusa (histórico do inventário)
  // A Gestão pede esclarecimento (só explicar) ou recusa (erro, algo a alterar): o inventário volta a abrir no celular com o pedido à vista;
  // quem fez revê e explica no campo de observação ao enviar de novo. Tudo fica guardado em inv.conversa (nunca apagado).
  const TIPOS_CONV = { envio: 'Observação ao enviar', resposta: 'Resposta de quem fez o inventário', esclarecimento: 'Pedido de esclarecimento', recusa: 'Recusado: corrigir', planilha: 'Planilha importada', devolucao: 'Devolvido para correção' };
  IC.conversa = (inv) => (inv.conversa || []).concat((inv.devolucoes || []).map((d) => ({ tipo: 'devolucao', em: d.em, por: d.por, texto: d.motivo })))
    .sort((a, b) => String(a.em).localeCompare(String(b.em)));
  IC.blocoConversa = (inv) => { const c = IC.conversa(inv); return c.length ? `<ul class="inv-conversa">${c.map((x) => `<li class="inv-conv-${esc(x.tipo)}"><b>${esc(TIPOS_CONV[x.tipo] || x.tipo)}</b> <small>${esc(x.por || '')} · ${esc(u.data(dataLocal(x.em)))} ${esc(horaLocal(x.em))}</small><br>${esc(x.texto)}</li>`).join('')}</ul>` : '<p class="ajuda">Nada registrado ainda.</p>'; };
  const avisoPedido = (inv) => { const p = inv.pendenteResposta; return p ? `<div class="aviso-inline cel-pedido"><b>${p.tipo === 'recusa' ? 'Inventário recusado: corrija e explique o que fez.' : 'Esclarecimento pedido: explique ao enviar.'}</b><br>${esc(p.texto)}<br><small>${esc(p.por || '')} · ${esc(u.data(dataLocal(p.em)))} ${esc(horaLocal(p.em))}</small></div>` : ''; };

  // ------------------------------------------------------------------ planilha do inventário (baixar e importar de volta)
  // Célula vazia = não mexe. Nada é apagado: tirar uma linha da planilha não apaga leitura nem sobra. As fotos nunca mudam pela planilha.
  const COLUNAS = ['Código (não altere)', 'Plaqueta', 'Bem', 'Situação', 'Estado', 'Responsável', 'Sala / local', 'Observação', 'Fotos (só informação)'];
  IC.linhasPlanilha = (inv) => {
    const linhas = [];
    const linhaBem = (b, situacao) => { const x = inv.leituras[b.id]; return [`B:${b.id}`, b.plaqueta, b.descricao, situacao, x ? nomeEstado(x.estado) : '', x ? (x.responsavelId ? VP.nome('responsaveis', x.responsavelId) : 'sem responsável') : '', x ? x.localizacao || '' : '', x ? x.observacao || '' : '', x ? (x.fotos || []).length : 0]; };
    for (const id of Object.keys(inv.esperados)) { const b = VP.db.pega('bens', id); if (b) linhas.push(linhaBem(b, inv.leituras[id] ? 'Lido' : 'Faltou')); }
    for (const id of Object.keys(inv.leituras).filter((x) => !inv.esperados[x])) { const b = VP.db.pega('bens', id); if (b) linhas.push(linhaBem(b, 'De outra unidade')); }
    for (const x of inv.sobras || []) linhas.push([`S:${x.id}`, x.plaqueta || '', x.descricao, x.semPlaqueta ? 'Sem plaqueta' : 'Sobra (sem cadastro)', x.estado ? nomeEstado(x.estado) : '', '', x.localizacao || '', x.observacao || '', (x.fotos || []).length]);
    return linhas;
  };
  IC.baixarPlanilha = (inv) => VP.baixarXLSX(`inventario-${inv.numero}`, [{ nome: inv.numero, cabecalho: COLUNAS, linhas: IC.linhasPlanilha(inv) }]);
  IC.podeImportar = (inv) => (inv.situacao === 'aberto' && podeCampo()) || (inv.situacao === 'em-analise' && podeAprovar());
  const norm = (v) => u.normalizar(String(v ?? '')).trim();
  const estadoDe = (v) => { const t = norm(v); if (!t) return undefined; const n = Number(t); if (Number.isInteger(n) && L.estados[n]) return n; const e = Object.entries(L.estados).find(([, nome]) => norm(nome) === t); return e ? Number(e[0]) : null; };
  const respDe = (v) => { const t = norm(v); if (!t) return undefined; if (t === norm('sem responsável')) return ''; const r = VP.db.lista('responsaveis').find((x) => norm(x.nome) === t || (x.matricula && norm(x.matricula) === t)); return r ? r.id : null; };
  // Monta o que vai mudar (sem gravar): { plano: [{ linha, rotulo, bemId | sobraId | nova, mudancas: [{ campo, rotulo, de, para, valor }] }], falhas, semMudanca }
  IC.lerPlanilha = (inv, abas) => {
    const linhas = abas?.[0]?.linhas || [];
    const cab = (linhas[0] || []).map(norm);
    const ix = { cod: cab.findIndex((c) => c.startsWith('codigo')), pl: cab.indexOf('plaqueta'), bem: cab.indexOf('bem'), est: cab.indexOf('estado'), resp: cab.indexOf('responsavel'), sala: cab.findIndex((c) => c.startsWith('sala')), obs: cab.findIndex((c) => c.startsWith('observ')) };
    if (ix.cod < 0 && ix.pl < 0) return { erro: 'A planilha não tem as colunas "Código" e "Plaqueta". Use a planilha baixada deste inventário (botão Baixar planilha).' };
    const plano = [], falhas = [], vistos = new Set(); let semMudanca = 0;
    linhas.slice(1).forEach((ln, k) => {
      const nl = k + 2, v = (i) => (i >= 0 ? String(ln[i] ?? '').trim() : '');
      const cod = v(ix.cod), pl = v(ix.pl), desc = v(ix.bem), sala = v(ix.sala), obs = v(ix.obs);
      if (!cod && !pl && !desc) return;
      const estado = estadoDe(v(ix.est)), resp = respDe(v(ix.resp));
      if (estado === null) { falhas.push({ item: `Linha ${nl}`, motivo: `Estado "${v(ix.est)}" não existe. Use: ${Object.values(L.estados).join(', ')}.` }); return; }
      if (resp === null) { falhas.push({ item: `Linha ${nl}`, motivo: `Responsável "${v(ix.resp)}" não está em Cadastros → Responsáveis.` }); return; }
      let bemId = cod.startsWith('B:') && VP.db.pega('bens', cod.slice(2)) ? cod.slice(2) : '';
      let sobra = cod.startsWith('S:') ? (inv.sobras || []).find((x) => x.id === cod.slice(2)) : null;
      if (!bemId && !sobra && pl) bemId = LE.acharBem(pl)?.id || '';
      const chave = bemId || sobra?.id || '';
      if (chave && vistos.has(chave)) { falhas.push({ item: `Linha ${nl}`, motivo: 'Mesmo bem em duas linhas: só a primeira vale.' }); return; }
      if (chave) vistos.add(chave);
      const mud = [], mais = (campo, rotulo, de, para, valor) => { if (String(valor ?? '') !== String(de ?? '')) mud.push({ campo, rotulo, de: campo === 'estado' ? (de ? nomeEstado(de) : '') : campo === 'responsavelId' ? (de === undefined ? '' : nomeResp(de)) : de || '', para: campo === 'estado' ? nomeEstado(valor) : campo === 'responsavelId' ? nomeResp(valor) : valor, valor }); };
      if (bemId) {
        const b = VP.db.pega('bens', bemId), x = inv.leituras[bemId];
        const base = x || { estado: b.estado, responsavelId: b.responsavelId || '', localizacao: b.localizacao || '', observacao: '' };
        if (estado !== undefined) mais('estado', 'Estado', base.estado, '', estado);
        if (resp !== undefined) mais('responsavelId', 'Responsável', base.responsavelId, '', resp);
        if (sala) mais('localizacao', 'Sala / local', base.localizacao, '', sala);
        if (obs) mais('observacao', 'Observação', base.observacao, '', obs);
        if (!x && (estado !== undefined || resp !== undefined || sala || obs)) { plano.push({ linha: nl, rotulo: `${b.plaqueta} · ${b.descricao} (passa a lido)`, bemId, nova: true, mudancas: mud }); return; }
        if (mud.length) plano.push({ linha: nl, rotulo: `${b.plaqueta} · ${b.descricao}`, bemId, mudancas: mud }); else semMudanca++;
        return;
      }
      if (sobra) {
        if (desc) mais('descricao', 'O que é', sobra.descricao, '', desc);
        if (estado !== undefined) mais('estado', 'Estado', sobra.estado, '', estado);
        if (sala) mais('localizacao', 'Sala / local', sobra.localizacao, '', sala);
        if (obs) mais('observacao', 'Observação', sobra.observacao, '', obs);
        if (mud.length) plano.push({ linha: nl, rotulo: `Sobra: ${sobra.descricao}`, sobraId: sobra.id, mudancas: mud }); else semMudanca++;
        return;
      }
      if (!desc) { falhas.push({ item: `Linha ${nl}`, motivo: `Plaqueta "${pl}" não está cadastrada: escreva na coluna Bem o que é, para virar sobra.` }); return; }
      plano.push({ linha: nl, rotulo: `Nova sobra: ${desc}${pl ? ` (plaqueta ${pl})` : ' (sem plaqueta)'}`, nova: true, sobraNova: { plaqueta: pl, descricao: desc, estado: estado ?? null, localizacao: sala, observacao: obs }, mudancas: [] });
    });
    return { plano, falhas, semMudanca };
  };
  IC.aplicarPlanilha = async (inv, plano) => {
    for (const p of plano) {
      if (p.bemId) {
        const b = VP.db.pega('bens', p.bemId);
        let x = inv.leituras[p.bemId];
        if (!x) x = inv.leituras[p.bemId] = { unidadeId: inv.unidadeId, data: hoje(), em: agora(), por: quem(), origem: 'planilha', antes: { unidadeId: b.unidadeId, localizacao: b.localizacao || '', estado: b.estado, responsavelId: b.responsavelId || '' }, estado: b.estado, responsavelId: b.responsavelId || '', localizacao: b.localizacao || '', observacao: '', fotos: [] };
        for (const m of p.mudancas) x[m.campo] = m.valor; // as fotos da leitura não são tocadas
        x.editadoEm = agora(); x.editadoPor = quem(); x.editadoPelaPlanilha = true;
      } else if (p.sobraId) {
        const x = inv.sobras.find((y) => y.id === p.sobraId);
        for (const m of p.mudancas) x[m.campo] = m.valor; // fotos da sobra continuam
        x.editadoEm = agora(); x.editadoPor = quem();
      } else {
        inv.sobras = (inv.sobras || []).concat([Object.assign({ id: u.id(), semPlaqueta: !p.sobraNova.plaqueta, unidadeId: inv.unidadeId, data: hoje(), em: agora(), por: quem(), origem: 'planilha', fotos: [] }, p.sobraNova)]);
      }
    }
    inv.conversa = (inv.conversa || []).concat([{ tipo: 'planilha', em: agora(), por: quem(), texto: `${plano.length} linha(s) alterada(s) pela planilha. Fotos não mudam pela planilha.` }]);
    historico(inv, `Planilha importada (${plano.length} alteração(ões))`);
    await VP.db.gravar('inventarios', inv);
  };
  // Escolhe o arquivo, mostra a prévia e só grava depois de confirmar; no fim, tela de resultado
  IC.importarPlanilha = async (inv, arquivo) => {
    let r;
    try { r = IC.lerPlanilha(inv, await VP.lerArquivoPlanilha(arquivo)); } catch (e) { r = { erro: e.message }; }
    if (r.erro) { ui.resultado({ titulo: 'Planilha não importada', falhas: [{ item: arquivo.name, motivo: r.erro }] }); return; }
    const corpo = `<p class="ajuda">Célula vazia não muda nada. Nenhuma leitura é apagada e <b>as fotos não mudam</b> pela planilha.</p>
      ${r.plano.length ? `<table class="tabela"><thead><tr><th>Linha</th><th>Item</th><th>O que muda</th></tr></thead><tbody>${r.plano.map((p) => `<tr><td>${p.linha}</td><td>${esc(p.rotulo)}</td><td>${p.mudancas.map((m) => `${esc(m.rotulo)}: ${m.de ? `<s>${esc(m.de)}</s> → ` : ''}<b>${esc(m.para)}</b>`).join('<br>') || 'nova'}</td></tr>`).join('')}</tbody></table>` : '<p>Nada a mudar.</p>'}
      ${r.falhas.length ? `<p class="erro-txt"><b>${r.falhas.length} linha(s) não serão importadas:</b></p><ul>${r.falhas.map((f) => `<li>${esc(f.item)}: ${esc(f.motivo)}</li>`).join('')}</ul>` : ''}
      <p class="ajuda">${r.semMudanca} linha(s) sem mudança.</p>`;
    ui.modal({ titulo: `Importar planilha · ${inv.numero}`, largura: 'grande', corpo, botoes: [{ texto: 'Cancelar' }, ...(r.plano.length ? [{ texto: `Aplicar ${r.plano.length} alteração(ões)`, classe: 'primario', acao: async () => {
      await IC.aplicarPlanilha(inv, r.plano);
      setTimeout(() => { ui.resultado({ titulo: 'Planilha do inventário importada', sucesso: r.plano.map((p) => `Linha ${p.linha}: ${p.rotulo}`), falhas: r.falhas }); }, 50);
      VP.app.render();
    } }] : [])] });
  };
  const botoesPlanilha = (inv) => `<button type="button" class="botao" data-baixar-plan>Baixar planilha do inventário</button>${IC.podeImportar(inv) ? '<label class="botao">Importar planilha do inventário<input type="file" accept=".xlsx,.csv" data-imp-plan hidden></label>' : ''}`;
  const ligarPlanilha = (inv) => {
    document.querySelectorAll('[data-baixar-plan]').forEach((el) => el.addEventListener('click', () => IC.baixarPlanilha(inv)));
    document.querySelectorAll('[data-imp-plan]').forEach((el) => el.addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) IC.importarPlanilha(inv, f); }));
  };

  // ------------------------------------------------------------------ texto do termo (tela e PDF)
  // Na tela: Constituição e Lei 4.320. No PDF: também as demais citações do livro (decisão do usuário, 26/10/2026).
  const FUNDAMENTO_TELA = 'art. 70, parágrafo único, da Constituição Federal ("prestará contas qualquer pessoa física ou entidade pública que utilize, arrecade, guarde, gerencie ou administre dinheiros, bens e valores públicos"); art. 94 da Lei nº 4.320/1964';
  const FUNDAMENTO_PDF = FUNDAMENTO_TELA + '; art. 83 da Lei nº 4.320/1964; art. 87 do Decreto-Lei nº 200/1967; item 7.11 da Instrução Normativa nº 205/1988';
  const dataExtenso = (iso) => { const d = new Date(iso); return `${d.getDate()} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][d.getMonth()]} de ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`; };
  const orgao = (unidadeId) => { const un = VP.db.pega('unidades', unidadeId); return un?.entidadeId ? VP.nome('entidades', un.entidadeId) : (VP.db.lista('entidades')[0]?.nome || 'Prefeitura Municipal'); };
  IC.textoTermo = (t, { completo = false, inv = null } = {}) => {
    const r = VP.db.pega('responsaveis', t.responsavelId) || {};
    const bens = t.bens.map((id) => VP.db.pega('bens', id)).filter(Boolean);
    const leit = (b) => inv?.leituras?.[b.id] || {};
    const linhas = completo ? bens : bens.slice(0, 2);
    const a = t.assinaturaCelular;
    const quando = a?.em || agora();
    return `<div class="cel-doc">
      <div class="cel-doc-cab"><b>TERMO DE RESPONSABILIDADE Nº ${esc(t.numero)}</b><small>${esc(orgao(t.unidadeId))} · Setor de Patrimônio</small></div>
      <p><b>Unidade:</b> ${esc(VP.nome('unidades', t.unidadeId))}${inv ? ` · <b>Inventário:</b> ${esc(inv.numero)}` : ''}</p>
      <p>Eu, <b>${esc(r.nome || nomeResp(t.responsavelId))}</b>, matrícula ${esc(r.matricula || '________')}, cargo ${esc(r.cargo || '________')}, declaro que recebi os bens abaixo, conferidos nesta data, e assumo a responsabilidade pela sua guarda, conservação e uso adequado. Comprometo-me a comunicar ao Setor de Patrimônio qualquer transferência, dano, extravio ou furto.</p>
      <table><thead><tr><th>Plaqueta</th><th>Bem</th><th>Estado</th>${completo ? '<th>Local</th>' : ''}</tr></thead><tbody>
        ${linhas.map((b) => `<tr><td>${esc(b.plaqueta)}</td><td>${esc(b.descricao)}</td><td>${esc(nomeEstado(leit(b).estado ?? b.estado))}</td>${completo ? `<td>${esc(leit(b).localizacao ?? b.localizacao ?? '')}</td>` : ''}</tr>`).join('')}
        ${!completo && bens.length > linhas.length ? `<tr><td colspan="3">+ ${bens.length - linhas.length} bem(ns) (lista completa no PDF)</td></tr>` : ''}
      </tbody></table>
      <p><b>Total:</b> ${bens.length} bem(ns)</p>
      <p class="cel-lei">Fundamento: ${esc(completo ? FUNDAMENTO_PDF : FUNDAMENTO_TELA)}.</p>
      <p>${esc(VP.nome('unidades', t.unidadeId))}, ${esc(dataExtenso(quando))}.</p>
      ${a?.situacao === 'recusado' ? `<div class="cel-recusa"><b>Recusa de assinatura.</b> Em ${esc(u.data(dataLocal(a.em)))}, às ${esc(horaLocal(a.em))}, ${esc(r.nome || '')} recusou-se a assinar este termo.${a.motivo ? ` Motivo informado: "${esc(a.motivo)}".` : ''} A recusa não afasta a responsabilidade pelos bens, nos termos do fundamento acima. Testemunha: ${esc(a.testemunha)}, que realizou o inventário.</div>` : ''}
      <div class="cel-doc-ass">
        <div>${a?.situacao === 'assinado' && a.imagem?.dataURL ? `<img src="${esc(a.imagem.dataURL)}" alt="Assinatura">` : ''}<span>${a?.situacao === 'recusado' ? 'Recusou-se a assinar' : `${esc(r.nome || '')}<br>Responsável`}</span></div>
        <div>${a?.situacao === 'recusado' && a.imagemTestemunha?.dataURL ? `<img src="${esc(a.imagemTestemunha.dataURL)}" alt="Assinatura da testemunha">` : ''}<span>${esc(a?.testemunha || inv?.criadoPor || quem())}<br>${a?.situacao === 'recusado' ? 'Testemunha' : 'Inventariante'}</span></div>
      </div>
      ${a ? `<p class="cel-doc-reg">Assinatura ${a.situacao === 'recusado' ? 'da testemunha ' : ''}feita na tela do celular em ${esc(u.data(dataLocal(a.em)))} às ${esc(horaLocal(a.em))}, registrada por ${esc(a.registradoPor || '')}.</p>` : ''}
    </div>`;
  };
  // PDF (imprimir ou salvar como PDF pelo navegador) com a lista completa e todas as citações
  IC.imprimirTermo = (t) => {
    const inv = t.inventarioId ? VP.db.pega('inventarios', t.inventarioId) : null;
    ui.imprimir(IC.textoTermo(t, { completo: true, inv }), `Termo de responsabilidade ${t.numero}`);
  };

  // ------------------------------------------------------------------ telas do celular
  const ICONES = {
    inventariar: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M16 8v8"/>',
    abastecer: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M8 7h4"/>',
    etiquetar: '<path d="M3 4h8l10 10-7 7L4 11z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    termo: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8 11h6M8 14h8"/><path d="M8 18c1-1.5 2-1.5 2.3 0 .3 1.2 1.2 1 2.2-.3"/>',
    transferir: '<path d="M4 8h15M15 4l4 4-4 4"/><path d="M20 16H5M9 12l-4 4 4 4"/>',
    veiculo: '<path d="M5 17h14M6 17l1.5-6h9L18 17M7.5 11 9 7h6l1.5 4"/><circle cx="7" cy="19" r="1"/><circle cx="17" cy="19" r="1"/>',
    avaria: '<path d="M19.8 8.3A4.5 4.5 0 0 1 13.2 12.7L6.2 19.7A1.32 1.32 0 0 1 4.3 17.8L11.3 10.8A4.5 4.5 0 0 1 15.7 4.2L16.2 7.8z"/>',
    consultar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    enviar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'
  };
  const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const atalho = (href, ic, titulo, sub, extra = '') => `<a class="cel-atalho" href="${href}" ${extra}>${svg(ICONES[ic])}<b>${esc(titulo)}</b><small>${esc(sub)}</small></a>`;

  T.campo = () => {
    const ab = IC.abertos();
    return {
      titulo: 'Início rápido',
      html: `<div class="cel">
        <p class="cel-faixa"><span>Olá, ${esc(quem())}</span><span>${ab.length ? `<b>${ab.length}</b> inventário(s) aberto(s)` : ''}</span></p>
        <a class="cel-principal" href="#campo-inventarios">${svg(ICONES.inventariar)}<span><b>Inventariar</b><small>Ler QR Code ou código de barras</small></span></a>
        <div class="cel-atalhos">
          ${atalho('../app-campo/#abastecimento', 'abastecer', 'Abastecer', 'Litros, valor, km e cupom')}
          ${atalho('#campo-etiquetar', 'etiquetar', 'Etiquetar e fotografar', 'Cadastrar ou editar bem no local')}
          ${atalho('#campo-termo', 'termo', 'Termo de responsabilidade', 'Gerar e assinar na hora')}
          ${atalho('#transferencias', 'transferir', 'Transferir', 'Entre unidades')}
          ${atalho('../app-campo/#viagem', 'veiculo', 'Veículo', 'Saída e retorno, checklist')}
          ${atalho('#manutencao', 'avaria', 'Avaria / chamado', 'Dano ou conserto')}
          ${atalho('#campo-consultar', 'consultar', 'Consultar bem', 'Ver ficha pela plaqueta')}
          ${atalho('../app-campo/#registros', 'enviar', 'Enviar registros', 'Abastecimentos e saídas guardados no aparelho')}
        </div></div>`
    };
  };

  // --- escolher ou abrir inventário
  T['campo-inventarios'] = () => {
    if (!podeCampo()) return semAcesso('Inventariar');
    const ab = IC.abertos().sort((a, b) => String(b.abertoEm).localeCompare(String(a.abertoEm)));
    const unidades = VP.db.lista('unidades').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return {
      titulo: 'Inventariar',
      html: `<div class="cel">
        ${ab.length ? `<h3 class="cel-h">Continuar um inventário</h3><ul class="cel-lista">${ab.map((i) => { const p = IC.progresso(i); return `<li><a href="#campo-inventario/${esc(i.id)}" data-continuar="${esc(i.id)}"><span class="cel-lista-topo"><b>${esc(i.nome)}</b><span class="cel-etq ${i.pendenteResposta ? 'cel-etq-alerta' : ''}">${esc(i.pendenteResposta ? (i.pendenteResposta.tipo === 'recusa' ? 'recusado: corrigir' : 'esclarecimento pedido') : 'aberto')}</span></span>
          <span class="cel-barra"><i style="width:${p.total ? Math.round(p.lidos / p.total * 100) : 0}%"></i></span><small>${p.lidos} de ${p.total} lidos · aberto por ${esc(i.criadoPor || '')} em ${u.data(dataLocal(i.abertoEm))}</small></a></li>`; }).join('')}</ul>` : '<p class="ajuda">Nenhum inventário aberto. Abra um novo escolhendo a unidade.</p>'}
        <h3 class="cel-h">Novo inventário</h3>
        ${unidades.length ? `<form class="cel-form" data-novo-inv><label class="cel-rotulo">Unidade (ex.: a escola)<select data-unidade required><option value="">Escolha…</option>${unidades.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</select></label>
          <button class="botao primario cel-largo">Abrir inventário</button>
          <p class="ajuda">O sistema guarda onde cada bem deveria estar, para comparar no fim. Nada muda no cadastro até a análise.</p></form>` : '<p class="aviso-inline">Nenhuma unidade cadastrada. Cadastre em Cadastros → Unidades.</p>'}
      </div>`,
      ligar() {
        document.querySelector('[data-novo-inv]')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const un = e.target.querySelector('[data-unidade]').value; if (!un) return;
          const inv = await IC.criar(un);
          ui.aviso(`Inventário ${inv.numero} aberto.`);
          VP.app.ir('#campo-inventario/' + inv.id);
        });
      }
    };
  };

  // --- leitura: câmera e digitação na mesma tela; o item abre embaixo, sem outra tela
  T['campo-inventario'] = (id) => {
    if (!podeCampo()) return semAcesso('Inventário');
    const inv = VP.db.pega('inventarios', id);
    if (!inv) return { titulo: 'Inventário', html: '<p>Inventário não encontrado. <a href="#campo-inventarios">Voltar</a></p>' };
    if (inv.situacao !== 'aberto') return { titulo: inv.nome, html: `<p class="aviso-inline">Este inventário está <b>${esc(IC.situacaoTexto(inv))}</b>. ${inv.situacao === 'em-analise' ? 'Aguarde a análise; se pedirem esclarecimento ou recusarem, ele volta a abrir aqui com o pedido.' : ''}</p><p><a href="#campo-inventarios">Voltar</a></p>` };
    const p = IC.progresso(inv);
    const ultimos = Object.entries(inv.leituras).sort((a, b) => String(b[1].em).localeCompare(String(a[1].em))).slice(0, 4);
    return {
      titulo: `Inventário · ${VP.nome('unidades', inv.unidadeId)}`,
      html: `<div class="cel cel-com-barra">
        ${avisoPedido(inv)}
        <div data-leitor>${LE.html()}</div>
        <div data-item hidden></div>
        <div data-painel>
          <p class="cel-contador"><b>${p.lidos} de ${p.total}</b> lidos · faltam ${p.faltam}${p.extras ? ` · ${p.extras} a mais (de fora ou sem cadastro)` : ''}</p>
          <span class="cel-barra"><i style="width:${p.total ? Math.round(p.lidos / p.total * 100) : 0}%"></i></span>
          ${ultimos.length ? `<h3 class="cel-h">Últimos lidos</h3><ul class="cel-lista cel-ultimos">${ultimos.map(([bid]) => { const b = VP.db.pega('bens', bid); return b ? `<li><button type="button" data-reabrir="${esc(bid)}"><span>${esc(b.plaqueta)} · ${esc(b.descricao)}</span><span class="cel-ok">✓</span></button></li>` : ''; }).join('')}</ul>` : ''}
        </div>
        <div class="cel-barra-acoes"><button type="button" class="botao" data-sem-plaqueta>+ Sem plaqueta</button><a class="botao primario" href="#campo-concluir/${esc(inv.id)}">Concluir</a></div>
      </div>`,
      ligar() {
        const raiz = document.getElementById('conteudo');
        const itemEl = raiz.querySelector('[data-item]'), leitorEl = raiz.querySelector('[data-leitor]'), painel = raiz.querySelector('[data-painel]');
        const barra = raiz.querySelector('.cel-barra-acoes');
        // Com o item aberto, a barra de baixo some (não cobre os botões do item)
        const mostrarLeitor = () => { itemEl.hidden = true; itemEl.innerHTML = ''; leitorEl.hidden = false; painel.hidden = false; barra.hidden = false; LE.pausar(false); };
        const abrirForm = (html, aoSalvar) => {
          LE.pausar(true); leitorEl.hidden = true; painel.hidden = true; barra.hidden = true; itemEl.hidden = false; itemEl.innerHTML = html;
          const fotos = [];
          const prev = itemEl.querySelector('[data-previa]');
          itemEl.querySelector('[data-fotos]')?.addEventListener('change', async (e) => {
            fotos.push(...(await ui.lerArquivos(e.target.files)).map((f) => Object.assign(f, { id: f.id || u.id() })));
            prev.innerHTML = fotos.map((f) => `<img src="${f.dataURL}" alt="Foto">`).join('');
            e.target.value = '';
          });
          itemEl.querySelectorAll('[data-estado] button').forEach((bt) => bt.addEventListener('click', () => {
            itemEl.querySelectorAll('[data-estado] button').forEach((x) => x.setAttribute('aria-pressed', String(x === bt)));
            itemEl.querySelector('[data-estado]').dataset.valor = bt.dataset.v;
          }));
          itemEl.querySelector('[data-cancelar]').addEventListener('click', mostrarLeitor);
          itemEl.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = await aoSalvar(itemEl, fotos);
            if (msg) { ui.aviso(msg); return; }
            VP.app.render();
          });
          window.scrollTo(0, 0);
        };
        const botoesEstado = (atual) => `<div class="cel-estados" data-estado data-valor="${esc(atual ?? '')}">${Object.entries(L.estados).reverse().map(([k, n]) => `<button type="button" data-v="${k}" aria-pressed="${String(String(atual) === k)}">${esc(n)}</button>`).join('')}</div>`;
        const opResp = (sel) => `<option value="">Sem responsável</option>${VP.db.lista('responsaveis').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((r) => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}`;
        const abrirBem = (b, origem) => {
          const l = inv.leituras[b.id];
          const de = inv.esperados[b.id] ? '' : `<div class="aviso-inline">Este bem está cadastrado em <b>${esc(VP.nome('unidades', b.unidadeId))}</b>. Se salvar, ele aparece na análise como achado aqui (vira transferência se aprovado).</div>`;
          const ja = l ? `<div class="aviso-inline">Já lido neste inventário em ${esc(u.data(dataLocal(l.em)))} às ${esc(horaLocal(l.em))}. Salvar de novo substitui a leitura anterior (não conta duas vezes).</div>` : '';
          abrirForm(`<form class="cel-form">
            <div class="cel-bem"><b>${esc(b.descricao)}</b><span>Plaqueta ${esc(b.plaqueta)} · ${origem === 'camera' ? 'lida pela câmera' : 'digitada'}</span></div>${de}${ja}
            <dl class="cel-ficha"><dt>No cadastro: unidade</dt><dd>${esc(VP.nome('unidades', b.unidadeId))}</dd><dt>Responsável</dt><dd>${esc(nomeResp(b.responsavelId))}</dd><dt>Estado</dt><dd>${esc(nomeEstado(b.estado))}</dd><dt>Sala / local</dt><dd>${esc(b.localizacao || '—')}</dd></dl>
            <label class="cel-rotulo">Estado de conservação hoje</label>${botoesEstado(l?.estado ?? b.estado)}
            <label class="cel-rotulo">Responsável agora<select data-resp>${opResp(l?.responsavelId ?? b.responsavelId)}</select></label>
            <label class="cel-rotulo">Sala / local<input data-local value="${esc(l?.localizacao ?? b.localizacao ?? '')}"></label>
            <label class="cel-rotulo">Observação<input data-obs value="${esc(l?.observacao || '')}" placeholder="Opcional"></label>
            <label class="cel-rotulo">Fotos<input type="file" accept="image/*" capture="environment" multiple data-fotos></label>
            <div class="cel-fotos" data-previa>${(l?.fotos || []).map((f) => `<img src="${f.dataURL}" alt="Foto">`).join('')}</div>
            <p class="aviso-inline">Isto <b>não muda o cadastro agora</b>. Fica na seção Inventário do bem até a análise.</p>
            <div class="cel-linha"><button type="button" class="botao" data-cancelar>Voltar à câmera</button><button class="botao primario">Salvar e ler o próximo</button></div>
          </form>`, async (el, fotos) => {
            const estado = Number(el.querySelector('[data-estado]').dataset.valor) || Number(b.estado) || null;
            inv.leituras[b.id] = {
              unidadeId: inv.unidadeId, data: hoje(), em: agora(), por: quem(), origem,
              antes: l?.antes || { unidadeId: b.unidadeId, localizacao: b.localizacao || '', estado: b.estado, responsavelId: b.responsavelId || '' },
              estado, responsavelId: el.querySelector('[data-resp]').value, localizacao: el.querySelector('[data-local]').value.trim(),
              observacao: el.querySelector('[data-obs]').value.trim(), fotos: (l?.fotos || []).concat(fotos)
            };
            await VP.db.gravar('inventarios', inv);
            ui.aviso(`${b.plaqueta} salvo no inventário.`);
          });
        };
        const abrirSobra = (plaqueta) => abrirForm(`<form class="cel-form">
            <div class="cel-bem"><b>${plaqueta ? `Plaqueta ${esc(plaqueta)} sem cadastro` : 'Bem sem plaqueta'}</b><span>Vai para a análise como sobra; o cadastro é feito na Gestão.</span></div>
            <label class="cel-rotulo">O que é o bem?<input data-desc required placeholder="Ex.: Cadeira azul"></label>
            <label class="cel-rotulo">Estado de conservação</label>${botoesEstado('')}
            <label class="cel-rotulo">Sala / local<input data-local></label>
            <label class="cel-rotulo">Fotos<input type="file" accept="image/*" capture="environment" multiple data-fotos></label>
            <div class="cel-fotos" data-previa></div>
            <div class="cel-linha"><button type="button" class="botao" data-cancelar>Voltar à câmera</button><button class="botao primario">Salvar e ler o próximo</button></div>
          </form>`, async (el, fotos) => {
          const descricao = el.querySelector('[data-desc]').value.trim();
          if (!descricao) return 'Escreva o que é o bem.';
          inv.sobras = (inv.sobras || []).concat([{ id: u.id(), plaqueta: plaqueta || '', semPlaqueta: !plaqueta, descricao, unidadeId: inv.unidadeId, data: hoje(), em: agora(), por: quem(),
            estado: Number(el.querySelector('[data-estado]').dataset.valor) || null, localizacao: el.querySelector('[data-local]').value.trim(), fotos }]);
          await VP.db.gravar('inventarios', inv);
          ui.aviso('Sobra registrada no inventário.');
        });
        LE.ligar(leitorEl, (cod, origem) => {
          const b = LE.acharBem(cod);
          if (b) abrirBem(b, origem); else abrirSobra(LE.normalizar(cod));
        });
        raiz.querySelector('[data-sem-plaqueta]').addEventListener('click', () => abrirSobra(''));
        raiz.querySelectorAll('[data-reabrir]').forEach((el) => el.addEventListener('click', () => abrirBem(VP.db.pega('bens', el.dataset.reabrir), inv.leituras[el.dataset.reabrir]?.origem || 'digitado')));
      }
    };
  };

  // --- concluir: resumo e termos
  T['campo-concluir'] = (id) => {
    if (!podeCampo()) return semAcesso('Concluir');
    const inv = VP.db.pega('inventarios', id);
    if (!inv) return { titulo: 'Concluir', html: '<p>Inventário não encontrado.</p>' };
    const r = IC.resumo(inv);
    const termos = IC.termos(inv);
    const grupos = IC.gruposTermo(inv);
    const prontos = termos.filter((t) => t.assinaturaCelular).length;
    const todosProntos = grupos.length > 0 && termos.length === grupos.length && prontos === grupos.length && grupos.every((g) => termos.some((t) => t.responsavelId === g.responsavelId && [...t.bens].sort().join('|') === g.bens.join('|')));
    return {
      titulo: 'Concluir e enviar',
      html: `<div class="cel cel-com-barra">
        <h3 class="cel-h">${esc(inv.nome)}</h3>
        <div class="cel-resumo">
          <div><b>${r.lidos.length}</b><span>bens lidos</span></div>
          <div class="ruim"><b>${r.faltaram.length}</b><span>faltaram (não achados)</span></div>
          <div class="atencao"><b>${r.deFora.length + r.sobras.length}</b><span>sobraram (de fora ou sem cadastro)</span></div>
          <div class="atencao"><b>${r.respDePara.reduce((t, x) => t + x.n, 0)}</b><span>mudam de responsável</span></div>
          <div><b>${r.estado}</b><span>mudam de estado</span></div>
          <div><b>${r.fotos}</b><span>fotos novas</span></div>
        </div>
        ${r.respDePara.length ? `<h3 class="cel-h">Responsáveis (de → para)</h3><ul class="cel-lista">${r.respDePara.map((x) => `<li class="cel-li">${esc(x.texto)} · ${x.n} bem(ns)</li>`).join('')}</ul>` : ''}
        <h3 class="cel-h">Termos de responsabilidade</h3>
        ${grupos.length ? `<ul class="cel-lista">${grupos.map((g) => { const t = termos.find((x) => x.responsavelId === g.responsavelId && [...x.bens].sort().join('|') === g.bens.join('|')); const a = t?.assinaturaCelular; return `<li class="cel-li">${esc(nomeResp(g.responsavelId))} · ${g.bens.length} bem(ns) · ${a ? (a.situacao === 'recusado' ? '<b>recusou (com testemunha)</b>' : '<b>assinado</b>') : 'falta assinar'}</li>`; }).join('')}</ul>` : '<p class="ajuda">Nenhum bem lido com responsável: não há termo a assinar.</p>'}
        ${avisoPedido(inv)}
        <label class="cel-rotulo">${inv.pendenteResposta ? 'Explique o que você fez (obrigatório)' : 'Observação (opcional): explique o que for preciso'}<textarea data-obs-envio rows="3">${esc(inv.obsRascunho || '')}</textarea></label>
        ${IC.conversa(inv).length ? `<details class="cel-historico"><summary>Histórico de observações, esclarecimentos e recusas (${IC.conversa(inv).length})</summary>${IC.blocoConversa(inv)}</details>` : ''}
        <h3 class="cel-h">Planilha</h3>
        <div class="cel-linha">${botoesPlanilha(inv)}</div>
        <p class="ajuda">Baixe, corrija e importe de volta. Célula vazia não muda nada; nada é apagado e as fotos não mudam.</p>
        <p class="ajuda">Depois de enviar, o inventário vai para análise na Gestão. Nada muda no cadastro até alguém aprovar.</p>
        <div class="cel-barra-acoes"><a class="botao" href="#campo-inventario/${esc(inv.id)}">Voltar a ler</a>
          ${grupos.length && !todosProntos ? `<button type="button" class="botao primario" data-ir-termo>Ver termo e assinar</button>` : `<button type="button" class="botao primario" data-enviar ${r.lidos.length || r.sobras.length ? '' : 'disabled'}>Enviar para análise</button>`}</div>
      </div>`,
      ligar() {
        ligarPlanilha(inv);
        // Rascunho da observação guardado no inventário (não se perde ao ir assinar o termo)
        document.querySelector('[data-obs-envio]').addEventListener('change', async (e) => { inv.obsRascunho = e.target.value; await VP.db.gravar('inventarios', inv); });
        document.querySelector('[data-ir-termo]')?.addEventListener('click', async () => {
          const lista = await IC.prepararTermos(inv);
          const falta = lista.find((t) => !t.assinaturaCelular);
          VP.app.ir('#campo-assinar/' + (falta || lista[0]).id);
        });
        document.querySelector('[data-enviar]')?.addEventListener('click', async () => {
          const obs = document.querySelector('[data-obs-envio]').value.trim();
          if (inv.pendenteResposta && !obs) { ui.aviso('Explique o que você fez sobre o pedido antes de enviar.'); document.querySelector('[data-obs-envio]').focus(); return; }
          if (!await ui.confirmar(`Enviar <b>${esc(inv.nome)}</b> para análise?<br>${r.lidos.length} lidos, ${r.faltaram.length} faltaram, ${r.deFora.length + r.sobras.length} sobraram.`, { sim: 'Enviar', titulo: 'Enviar para análise' })) return;
          if (obs) inv.conversa = (inv.conversa || []).concat([{ tipo: inv.pendenteResposta ? 'resposta' : 'envio', em: agora(), por: quem(), texto: obs }]);
          delete inv.pendenteResposta; delete inv.obsRascunho;
          inv.situacao = 'em-analise'; inv.enviadoEm = agora(); inv.enviadoPor = quem();
          historico(inv, 'Enviado para análise pelo celular');
          await VP.db.gravar('inventarios', inv);
          ui.aviso('Inventário enviado para análise.');
          VP.app.ir('#campo');
        });
      }
    };
  };

  // --- termo na tela: assinar com o dedo, ou "Não quer assinar" com testemunha (quem fez o inventário ou o termo)
  T['campo-assinar'] = (id, query = {}) => {
    if (!podeCampo()) return semAcesso('Termo');
    const t = VP.db.pega('termosResp', id);
    if (!t) return { titulo: 'Termo', html: '<p>Termo não encontrado.</p>' };
    const inv = t.inventarioId ? VP.db.pega('inventarios', t.inventarioId) : null;
    const recusa = query.recusa === '1';
    const r = VP.db.pega('responsaveis', t.responsavelId) || {};
    const voltar = inv ? `#campo-concluir/${inv.id}` : '#campo-termo';
    return {
      titulo: recusa ? 'Recusa de assinatura' : 'Termo de responsabilidade',
      html: `<div class="cel cel-com-barra">
        ${IC.textoTermo(t, { inv })}
        ${t.assinaturaCelular ? `<p class="aviso-inline">Este termo já foi ${t.assinaturaCelular.situacao === 'recusado' ? 'registrado com recusa' : 'assinado'}. Assinar de novo substitui o registro anterior.</p>` : ''}
        ${recusa ? `<label class="cel-rotulo">Motivo (se a pessoa disser)<input data-motivo placeholder="Opcional"></label>
          ${quadroAssinatura(`Assinatura da testemunha: ${quem()}`, 'Quem fez o inventário assina')}`
          : quadroAssinatura(`Assinatura de ${r.nome || nomeResp(t.responsavelId)}`, 'Assine com o dedo')}
        <div class="cel-barra-acoes">${recusa ? `<a class="botao" href="#campo-assinar/${esc(t.id)}">Voltar</a><button type="button" class="botao primario" data-registrar-recusa>Registrar recusa</button>`
          : `<a class="botao perigo" href="#campo-assinar/${esc(t.id)}?recusa=1">Não quer assinar</a><button type="button" class="botao primario" data-assinar>Assinar</button>`}</div>
        <p class="cel-pdf"><button type="button" class="botao pequeno" data-pdf>Ver PDF do termo</button></p>
      </div>`,
      ligar() {
        const raiz = document.getElementById('conteudo');
        const pad = ligarAssinatura(raiz);
        raiz.querySelector('[data-pdf]').addEventListener('click', () => IC.imprimirTermo(t));
        const proximo = async () => {
          const lista = inv ? IC.termos(inv) : [];
          const falta = lista.find((x) => !x.assinaturaCelular);
          VP.app.ir(falta ? '#campo-assinar/' + falta.id : voltar);
        };
        raiz.querySelector('[data-assinar]')?.addEventListener('click', async () => {
          if (pad.vazia()) { ui.aviso('Assine no quadro antes de continuar.'); return; }
          t.assinaturaCelular = { situacao: 'assinado', em: agora(), registradoPor: quem(), imagem: { id: u.id(), nome: `assinatura-termo-${t.numero.replace('/', '-')}.png`, tipo: 'image/png', dataURL: pad.imagem() } };
          t.historico = (t.historico || []).concat([{ data: agora(), descricao: `Assinado na tela do celular por ${r.nome || ''}`, usuario: quem() }]);
          if (!inv) { t.situacao = 'assinado'; t.assinado = { data: hoje(), eletronico: true }; }
          await VP.db.gravar('termosResp', t);
          ui.aviso('Termo assinado.');
          await proximo();
        });
        raiz.querySelector('[data-registrar-recusa]')?.addEventListener('click', async () => {
          if (pad.vazia()) { ui.aviso('A testemunha precisa assinar no quadro.'); return; }
          t.assinaturaCelular = { situacao: 'recusado', em: agora(), registradoPor: quem(), testemunha: quem(), motivo: raiz.querySelector('[data-motivo]').value.trim(),
            imagemTestemunha: { id: u.id(), nome: `testemunha-termo-${t.numero.replace('/', '-')}.png`, tipo: 'image/png', dataURL: pad.imagem() } };
          t.historico = (t.historico || []).concat([{ data: agora(), descricao: `Recusa de assinatura registrada; testemunha ${quem()}`, usuario: quem() }]);
          if (!inv) { t.situacao = 'recusado'; t.recusadoEm = hoje(); }
          await VP.db.gravar('termosResp', t);
          ui.aviso('Recusa registrada com testemunha.');
          await proximo();
        });
      }
    };
  };

  // --- termo avulso (botão "Termo de responsabilidade"): escolhe o responsável e assina os bens que já são dele
  T['campo-termo'] = () => {
    if (!podeCampo()) return semAcesso('Termo de responsabilidade');
    const resps = VP.db.lista('responsaveis').map((r) => ({ r, n: VP.db.lista('bens').filter((b) => b.responsavelId === r.id && b.status !== 'baixado').length })).filter((x) => x.n).sort((a, b) => a.r.nome.localeCompare(b.r.nome, 'pt-BR'));
    return {
      titulo: 'Termo de responsabilidade',
      html: `<div class="cel">
        <p class="ajuda">Gera o termo com os bens que já estão com a pessoa, para assinar agora na tela. Para mudar quem é o responsável, use o Inventariar (passa pela análise).</p>
        ${resps.length ? `<form class="cel-form" data-novo-termo><label class="cel-rotulo">Responsável<select data-resp required><option value="">Escolha…</option>${resps.map((x) => `<option value="${esc(x.r.id)}">${esc(x.r.nome)} (${x.n} bens)</option>`).join('')}</select></label>
          <label class="cel-rotulo">Unidade (opcional: só os bens desta unidade)<select data-un><option value="">Todas</option>${VP.db.lista('unidades').map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</select></label>
          <button class="botao primario cel-largo">Gerar termo</button></form>` : '<p class="aviso-inline">Nenhum responsável com bens. Cadastre em Cadastros → Responsáveis.</p>'}
      </div>`,
      ligar() {
        document.querySelector('[data-novo-termo]')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const resp = e.target.querySelector('[data-resp]').value; const un = e.target.querySelector('[data-un]').value;
          const bens = VP.db.lista('bens').filter((b) => b.responsavelId === resp && b.status !== 'baixado' && (!un || b.unidadeId === un));
          if (!bens.length) { ui.aviso('Nenhum bem deste responsável nesta unidade.'); return; }
          const ano = hoje().slice(0, 4);
          const n = VP.db.lista('termosResp', true).filter((t) => String(t.numero).endsWith('/' + ano)).length + 1;
          const t = { id: u.id(), numero: `${n}/${ano}`, responsavelId: resp, unidadeId: un || bens[0].unidadeId || '', bens: bens.map((b) => b.id), origem: 'celular', emitidoEm: hoje(), prazo: u.somaDias(hoje(), VP.termos?.prazoDias() || 15), situacao: 'aguardando', historico: [{ data: agora(), descricao: 'Termo gerado pelo celular', usuario: quem() }] };
          await VP.db.gravar('termosResp', t);
          VP.app.ir('#campo-assinar/' + t.id);
        });
      }
    };
  };

  // --- consultar e etiquetar: lê a plaqueta e abre a ficha (ou oferece cadastrar)
  const telaLer = (titulo, explicacao, naoAchou) => () => ({
    titulo,
    html: `<div class="cel"><p class="ajuda">${explicacao}</p><div data-leitor>${LE.html()}</div><div data-msg></div></div>`,
    ligar() {
      const raiz = document.getElementById('conteudo');
      LE.ligar(raiz.querySelector('[data-leitor]'), (cod) => {
        const b = LE.acharBem(cod);
        if (b) { VP.app.ir('#bem/' + b.id); return; }
        raiz.querySelector('[data-msg]').innerHTML = naoAchou(LE.normalizar(cod));
      });
    }
  });
  T['campo-consultar'] = telaLer('Consultar bem', 'Leia a etiqueta ou digite a plaqueta: a ficha do bem abre sozinha.', (c) => `<p class="aviso-inline">Plaqueta <b>${esc(c)}</b> não encontrada no cadastro.</p>`);
  T['campo-etiquetar'] = telaLer('Etiquetar e fotografar', 'Leia a etiqueta nova ou digite a plaqueta. Se o bem existir, a ficha abre para trocar a foto e editar. Se não existir, cadastre o bem.',
    (c) => `<p class="aviso-inline">Plaqueta <b>${esc(c)}</b> não está cadastrada.</p>${podeAprovar() ? '<a class="botao primario cel-largo" href="#novo-bem/movel">Cadastrar novo bem</a>' : '<p class="ajuda">Cadastrar bem é do gestor ou do administrador. Para registrar o bem achado, use Inventariar → Sem plaqueta.</p>'}`);

  // ------------------------------------------------------------------ Gestão: análise e aprovação
  T['inventario-analise'] = (id, query = {}) => {
    const inv = VP.db.pega('inventarios', id);
    if (!inv) return { titulo: 'Análise', html: '<p>Inventário não encontrado.</p>' };
    const r = IC.resumo(inv);
    const aba = query.aba || 'mudancas';
    const termos = IC.termos(inv);
    const pode = podeAprovar() && inv.situacao === 'em-analise';
    const abas = [['mudancas', `Mudanças (${r.mudancas.length})`], ['faltaram', `Faltaram (${r.faltaram.length})`], ['sobraram', `Sobraram (${r.deFora.length + r.sobras.length})`], ['sem', `Sem mudança (${r.semMudanca.length})`], ['termos', `Termos e assinaturas (${termos.length})`]];
    const fotos = (lista) => (lista || []).map((f) => `<img src="${f.dataURL}" alt="Foto">`).join('');
    let corpo = '';
    if (aba === 'mudancas') corpo = r.mudancas.length ? `<table class="tabela"><thead><tr>${pode ? '<th></th>' : ''}<th>Plaqueta</th><th>Bem</th><th>O que muda (de → para)</th><th>Fotos</th></tr></thead><tbody>${r.mudancas.map(({ b, lista }) => `<tr>${pode ? `<td><input type="checkbox" data-aplicar="${esc(b.id)}" checked aria-label="Aplicar mudanças do bem ${esc(b.plaqueta)}"></td>` : ''}<td><a href="#bem/${esc(b.id)}">${esc(b.plaqueta)}</a></td><td>${esc(b.descricao)}${inv.esperados[b.id] ? '' : ' <span class="selo-atencao">de outra unidade</span>'}</td>
        <td>${lista.map((m) => `${esc(m.rotulo)}: ${m.de ? `<s>${esc(m.de)}</s> → ` : ''}<b>${esc(m.para)}</b>${m.campo === 'estado' && m.para === 'Imprestável' ? ' <span class="selo-alerta">vai para baixa</span>' : ''}`).join('<br>')}</td><td class="cel-mini">${fotos(inv.leituras[b.id].fotos)}</td></tr>`).join('')}</tbody></table>` : '<p class="ajuda">Nenhuma mudança.</p>';
    else if (aba === 'faltaram') corpo = r.faltaram.length ? `<table class="tabela"><thead><tr><th>Plaqueta</th><th>Bem</th><th>Responsável</th></tr></thead><tbody>${r.faltaram.map((b) => `<tr><td><a href="#bem/${esc(b.id)}">${esc(b.plaqueta)}</a></td><td>${esc(b.descricao)}</td><td>${esc(nomeResp(b.responsavelId))}</td></tr>`).join('')}</tbody></table><p class="ajuda">Ao aprovar, cada bem que faltou recebe o registro "não localizado" com o número do inventário. O cadastro não muda.</p>` : '<p class="ajuda">Nenhum bem faltou.</p>';
    else if (aba === 'sobraram') corpo = `${r.deFora.length ? `<h3>Bens de outra unidade achados aqui</h3><ul>${r.deFora.map((b) => `<li><a href="#bem/${esc(b.id)}">${esc(b.plaqueta)}</a> · ${esc(b.descricao)} (cadastro: ${esc(VP.nome('unidades', b.unidadeId))})</li>`).join('')}</ul>` : ''}
        ${r.sobras.length ? `<h3>Sem cadastro ou sem plaqueta</h3><table class="tabela"><thead><tr><th>Plaqueta</th><th>O que é</th><th>Estado</th><th>Local</th><th>Fotos</th></tr></thead><tbody>${r.sobras.map((s) => `<tr><td>${esc(s.plaqueta || 'sem plaqueta')}</td><td>${esc(s.descricao)}</td><td>${esc(s.estado ? nomeEstado(s.estado) : '')}</td><td>${esc(s.localizacao || '')}</td><td class="cel-mini">${fotos(s.fotos)}</td></tr>`).join('')}</tbody></table><p class="ajuda">Sobras não viram bem sozinhas: cadastre pela tela Novo bem.</p>` : ''}${!r.deFora.length && !r.sobras.length ? '<p class="ajuda">Nada sobrou.</p>' : ''}`;
    else if (aba === 'sem') corpo = r.semMudanca.length ? `<ul>${r.semMudanca.map((b) => `<li>${esc(b.plaqueta)} · ${esc(b.descricao)}</li>`).join('')}</ul>` : '<p class="ajuda">Nenhum.</p>';
    else corpo = termos.length ? `<table class="tabela"><thead><tr><th>Termo</th><th>Responsável</th><th>Bens</th><th>Assinatura</th><th></th></tr></thead><tbody>${termos.map((t) => `<tr><td>${esc(t.numero)}</td><td>${esc(nomeResp(t.responsavelId))}</td><td>${t.bens.length}</td><td>${t.assinaturaCelular ? (t.assinaturaCelular.situacao === 'recusado' ? `Recusou · testemunha ${esc(t.assinaturaCelular.testemunha)}` : 'Assinado na tela') : 'Sem assinatura (segue o prazo normal)'}</td><td><button type="button" class="botao pequeno" data-pdf="${esc(t.id)}">PDF</button></td></tr>`).join('')}</tbody></table>` : '<p class="ajuda">Sem termos.</p>';
    return {
      titulo: `Análise do inventário ${inv.numero}`,
      acoes: `<a class="botao" href="#inventario">‹ Inventário</a> ${botoesPlanilha(inv)}`,
      html: `<p class="ajuda">${esc(VP.nome('unidades', inv.unidadeId))} · aberto por ${esc(inv.criadoPor || '')}${inv.enviadoEm ? ` · enviado por ${esc(inv.enviadoPor || '')} em ${u.data(dataLocal(inv.enviadoEm))} às ${esc(horaLocal(inv.enviadoEm))}` : ''} · situação: <b>${esc(IC.situacaoTexto(inv))}</b></p>
        <div class="resumo-linha">${VP.graficos.numero('Bens lidos', u.inteiro(r.lidos.length))}${VP.graficos.numero('Faltaram', u.inteiro(r.faltaram.length))}${VP.graficos.numero('Sobraram', u.inteiro(r.deFora.length + r.sobras.length))}${VP.graficos.numero('Mudam de responsável', u.inteiro(r.respDePara.reduce((t, x) => t + x.n, 0)))}${VP.graficos.numero('Mudam de estado', u.inteiro(r.estado))}</div>
        <nav class="abas">${abas.map(([k, n]) => `<a href="#inventario-analise/${esc(inv.id)}?aba=${k}" class="${k === aba ? 'ativa' : ''}">${esc(n)}</a>`).join('')}</nav>
        <section class="cartao">${corpo}</section>
        <section class="cartao"><h3>Observações, esclarecimentos e recusas</h3>${IC.blocoConversa(inv)}${inv.situacao === 'aberto' && inv.pendenteResposta ? '<p class="aviso-inline">Aguardando resposta de quem fez o inventário.</p>' : ''}</section>
        ${pode ? `<div class="barra-acoes"><button class="botao" data-esclarecer>Pedir esclarecimento</button><button class="botao perigo" data-recusar>Recusar</button><button class="botao primario" data-aprovar>Aprovar mudanças marcadas</button></div>
          <p class="ajuda">Ao aprovar: os dados do inventário substituem os do bem (só os marcados), cada bem guarda o antes e o depois com o número ${esc(inv.numero)}, e os termos de responsabilidade passam a valer.</p>` : ''}
        ${inv.situacao === 'encerrado' ? `<p class="aviso-inline">Aprovado por ${esc(inv.aprovadoPor || '')} em ${u.data(dataLocal(inv.aprovadoEm))}.</p>` : ''}`,
      ligar() {
        const raiz = document.getElementById('conteudo');
        raiz.querySelectorAll('[data-pdf]').forEach((el) => el.addEventListener('click', () => IC.imprimirTermo(VP.db.pega('termosResp', el.dataset.pdf))));
        ligarPlanilha(inv);
        // Esclarecimento = só explicar; recusa = erro ou algo a alterar. Os dois reabrem o inventário no celular com o texto à vista.
        const devolver = (tipo) => ui.formulario({
          titulo: tipo === 'recusa' ? 'Recusar inventário' : 'Pedir esclarecimento', largura: 'pequena', textoSalvar: tipo === 'recusa' ? 'Recusar e devolver' : 'Pedir esclarecimento',
          intro: `<p class="ajuda">${tipo === 'recusa' ? 'Use quando há erro ou algo a alterar.' : 'Use quando só falta explicar algo.'} O inventário volta a abrir no celular com o seu texto; quem fez revê e explica o que fez ao enviar de novo. Nada muda nos bens.</p>`,
          campos: [{ chave: 'texto', rotulo: tipo === 'recusa' ? 'O que está errado ou precisa ser alterado?' : 'O que precisa ser esclarecido?', tipo: 'area', obrigatorio: true }],
          salvar: async (v) => {
            inv.situacao = 'aberto';
            inv.pendenteResposta = { tipo, texto: v.texto, em: agora(), por: quem() };
            inv.conversa = (inv.conversa || []).concat([{ tipo, em: agora(), por: quem(), texto: v.texto }]);
            historico(inv, `${tipo === 'recusa' ? 'Recusado' : 'Esclarecimento pedido'}: ${v.texto}`);
            await VP.db.gravar('inventarios', inv);
            ui.aviso(tipo === 'recusa' ? 'Inventário recusado: volta a abrir no celular para corrigir.' : 'Esclarecimento pedido: o inventário volta a abrir no celular.'); VP.app.ir('#inventario');
          }
        });
        raiz.querySelector('[data-esclarecer]')?.addEventListener('click', () => devolver('esclarecimento'));
        raiz.querySelector('[data-recusar]')?.addEventListener('click', () => devolver('recusa'));
        raiz.querySelector('[data-aprovar]')?.addEventListener('click', async () => {
          // Fora da aba Mudanças, todos os bens com mudança contam como marcados
          const caixas = [...raiz.querySelectorAll('[data-aplicar]')];
          const desmarcados = caixas.filter((c) => !c.checked).map((c) => c.dataset.aplicar);
          if (!await ui.confirmar(`Aprovar <b>${esc(inv.numero)}</b>?<br>${r.mudancas.length - desmarcados.length} bem(ns) com mudança serão atualizados${desmarcados.length ? `; ${desmarcados.length} desmarcado(s) ficam como estão` : ''}.`, { titulo: 'Aprovar inventário', sim: 'Aprovar' })) return;
          const res = await IC.aprovar(inv, desmarcados);
          ui.resultado({ titulo: `Inventário ${inv.numero} aprovado`, sucesso: res.sucesso, falhas: res.falhas });
          VP.app.render();
        });
      }
    };
  };

  // Aplica o inventário aprovado: só os bens marcados mudam; todos lidos ganham o registro com o número do inventário
  IC.aprovar = async (inv, desmarcados = []) => {
    const bens = [], eventos = [], sucesso = [], falhas = [];
    for (const [id, l] of Object.entries(inv.leituras)) {
      const b = VP.db.pega('bens', id);
      if (!b) { falhas.push({ item: id, motivo: 'Bem não encontrado (excluído?)' }); continue; }
      const lista = IC.mudancas(inv, id);
      const aplicar = !desmarcados.includes(id);
      const antes = { unidadeId: b.unidadeId, localizacao: b.localizacao || '', estado: b.estado, responsavelId: b.responsavelId || '' };
      if (aplicar && lista.length) {
        if (l.unidadeId && l.unidadeId !== b.unidadeId) {
          eventos.push(VP.novoEvento(b.id, 'transferencia', { descricao: `Transferência pelo inventário ${inv.numero}: ${VP.nome('unidades', b.unidadeId)} → ${VP.nome('unidades', l.unidadeId)}`, extra: { de: b.unidadeId, para: l.unidadeId, inventarioId: inv.id } }));
          b.unidadeId = l.unidadeId;
        }
        if (l.estado) b.estado = Number(l.estado);
        if (l.responsavelId !== undefined) b.responsavelId = l.responsavelId;
        if (l.localizacao !== undefined) b.localizacao = l.localizacao;
        if ((l.fotos || []).length) b.fotos = l.fotos.map((f) => Object.assign({}, f, { id: u.id() })).concat(b.fotos || []);
      }
      const depois = { unidadeId: b.unidadeId, localizacao: b.localizacao || '', estado: b.estado, responsavelId: b.responsavelId || '' };
      const texto = aplicar && lista.length ? lista.map((m) => (m.de ? `${m.rotulo}: ${m.de} → ${m.para}` : `${m.rotulo}: ${m.para}`)).join('; ') : (lista.length ? 'mudanças não aprovadas' : 'sem mudança');
      eventos.push(VP.novoEvento(b.id, 'inventario', { descricao: `Conferido no inventário ${inv.numero} (${texto})`, extra: { inventarioId: inv.id, numero: inv.numero, antes, depois, aplicado: aplicar, observacao: l.observacao || '', lidoEm: l.em, lidoPor: l.por } }));
      b.ultimoInventario = { id: inv.id, numero: inv.numero, data: hoje() };
      bens.push(b);
      sucesso.push(`${b.plaqueta}: ${texto}`);
    }
    for (const id of Object.keys(inv.esperados).filter((x) => !inv.leituras[x])) {
      if (!VP.db.pega('bens', id)) continue;
      eventos.push(VP.novoEvento(id, 'inventario', { descricao: `Não localizado no inventário ${inv.numero}`, extra: { inventarioId: inv.id, numero: inv.numero, naoLocalizado: true } }));
    }
    // Termos: o assinado na tela vale como assinado; a recusa com testemunha fica registrada; sem assinatura segue o prazo normal
    const termos = IC.termos(inv);
    const idsBens = new Set(termos.flatMap((t) => t.bens));
    const antigos = VP.db.lista('termosResp').filter((t) => t.situacao === 'aguardando' && !t.inventarioId && t.bens.some((x) => idsBens.has(x)));
    for (const t of antigos) { t.situacao = 'cancelado'; t.canceladoEm = hoje(); t.historico = (t.historico || []).concat([{ data: agora(), descricao: `Cancelado: substituído pelo termo do inventário ${inv.numero}`, usuario: quem() }]); }
    for (const t of termos) {
      const a = t.assinaturaCelular;
      if (a?.situacao === 'assinado') { t.situacao = 'assinado'; t.assinado = { data: dataLocal(a.em), eletronico: true }; }
      else if (a?.situacao === 'recusado') { t.situacao = 'recusado'; t.recusadoEm = dataLocal(a.em); }
      else { t.situacao = 'aguardando'; t.prazo = u.somaDias(hoje(), VP.termos?.prazoDias() || 15); }
      t.historico = (t.historico || []).concat([{ data: agora(), descricao: `Inventário ${inv.numero} aprovado`, usuario: quem() }]);
    }
    inv.situacao = 'encerrado'; inv.encerradoEm = hoje(); inv.aprovadoEm = agora(); inv.aprovadoPor = quem();
    inv.analise = { desmarcados };
    historico(inv, `Aprovado${desmarcados.length ? ` (${desmarcados.length} bem(ns) desmarcado(s))` : ''}`);
    await VP.db.gravarVarias({ bens, eventos, inventarios: [inv], termosResp: termos.concat(antigos) });
    return { sucesso, falhas };
  };

  // ------------------------------------------------------------------ peças usadas por outras telas
  // Cartão na tela Inventário da Gestão
  IC.cartaoGestao = () => {
    const l = IC.lista().sort((a, b) => String(b.abertoEm).localeCompare(String(a.abertoEm)));
    if (!l.length) return '';
    return `<section class="cartao"><h3>Inventários pelo celular (por unidade)</h3>
      <table class="tabela"><thead><tr><th>Inventário</th><th>Situação</th><th>Lidos</th><th>Aberto por</th><th></th></tr></thead><tbody>
      ${l.map((i) => { const p = IC.progresso(i); return `<tr><td>${esc(i.nome)}</td><td>${i.situacao === 'em-analise' ? '<b>em análise</b>' : esc(IC.situacaoTexto(i))}</td><td>${p.lidos} de ${p.total}${p.extras ? ` (+${p.extras})` : ''}</td><td>${esc(i.criadoPor || '')}</td><td><a class="botao pequeno ${i.situacao === 'em-analise' ? 'primario' : ''}" href="#inventario-analise/${esc(i.id)}">${i.situacao === 'em-analise' ? 'Analisar' : 'Ver'}</a></td></tr>`; }).join('')}
      </tbody></table></section>`;
  };
  // Seção "Inventário" na ficha do bem: leitura em aberto (editável) e inventários anteriores
  IC.secaoFicha = (b) => {
    const abertos = IC.lista().filter((i) => i.situacao !== 'encerrado' && i.leituras[b.id]);
    const anteriores = VP.eventosDoBem(b.id).filter((e) => e.tipo === 'inventario').sort((a, c) => String(c.criadoEm).localeCompare(String(a.criadoEm)));
    if (!abertos.length && !anteriores.length) return '';
    return `<section class="cartao secao" id="sec-inventario"><header><h3>Inventário</h3></header>
      ${abertos.map((i) => { const l = i.leituras[b.id]; return `<div class="inv-ficha"><p><b>${esc(i.nome)}</b> <span class="selo-atencao">${esc(IC.situacaoTexto(i))}</span></p>
        <dl class="dados"><dt>Lido em</dt><dd>${esc(u.data(dataLocal(l.em)))} ${esc(horaLocal(l.em))}, por ${esc(l.por || '')} (${l.origem === 'camera' ? 'câmera' : 'digitado'})</dd>
        <dt>Estado</dt><dd>${esc(nomeEstado(l.estado))} (no cadastro: ${esc(nomeEstado(b.estado))})</dd>
        <dt>Responsável</dt><dd>${esc(nomeResp(l.responsavelId))} (no cadastro: ${esc(nomeResp(b.responsavelId))})</dd>
        <dt>Sala / local</dt><dd>${esc(l.localizacao || '—')}</dd>${l.observacao ? `<dt>Observação</dt><dd>${esc(l.observacao)}</dd>` : ''}</dl>
        ${(l.fotos || []).length ? `<div class="cel-mini">${l.fotos.map((f) => `<img src="${f.dataURL}" alt="Foto do inventário">`).join('')}</div>` : ''}
        ${podeCampo() ? `<button class="botao pequeno" data-inv-editar="${esc(i.id)}">Editar leitura</button>` : ''}</div>`; }).join('')}
      ${anteriores.length ? `<table class="tabela" data-sem-planilha><thead><tr><th>Data</th><th>Inventário</th><th>Resultado</th></tr></thead><tbody>${anteriores.map((e) => `<tr><td>${u.data(e.data)}</td><td>${esc(e.dados?.numero || '')}</td><td>${esc(e.descricao)}</td></tr>`).join('')}</tbody></table>` : ''}
    </section>`;
  };
  IC.ligarFicha = (b) => {
    document.querySelectorAll('[data-inv-editar]').forEach((el) => el.addEventListener('click', () => {
      const inv = VP.db.pega('inventarios', el.dataset.invEditar); const l = inv.leituras[b.id];
      ui.formulario({
        titulo: `Editar leitura · ${inv.numero}`, largura: 'media',
        campos: [
          { chave: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: Object.entries(L.estados).reverse(), vazio: false, largura: 'meia' },
          { chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: VP.opc('responsaveis'), largura: 'meia' },
          { chave: 'localizacao', rotulo: 'Sala / local' }, { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
        valores: { estado: l.estado, responsavelId: l.responsavelId, localizacao: l.localizacao, observacao: l.observacao },
        salvar: async (v) => {
          Object.assign(l, { estado: Number(v.estado), responsavelId: v.responsavelId || '', localizacao: v.localizacao || '', observacao: v.observacao || '', editadoEm: agora(), editadoPor: quem() });
          historico(inv, `Leitura do bem ${b.plaqueta} editada na ficha`);
          await VP.db.gravar('inventarios', inv);
          ui.aviso('Leitura do inventário atualizada (o cadastro só muda na aprovação).');
          VP.app.render();
        }
      });
    }));
  };
})();
