/* VitalPat Cemitério · Gestão — plaquetas numeradas (decisão do usuário, 07/10/2026).
   Número sequencial de 000000 até o limite (padrão 100.000). O sistema gera os números em lotes (+10, +30, +50…);
   cada plaqueta é ligada a um túmulo por uma pessoa (com prévia), e a ligação pode ser desfeita (fica no histórico).
   O QR Code da plaqueta leva o número. O código antigo (quadra-aléia-número) continua valendo na busca. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos;
  const T = VP.telas;
  const E = VP.plaquetas = {};
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const agora = () => VP.Plataforma.agoraISO();
  E.LIMITE_PADRAO = 100000;
  E.texto = (n) => String(n).padStart(6, '0');
  E.limite = () => VP.config().limitePlaquetas || E.LIMITE_PADRAO;
  E.todas = () => VP.db.lista('plaquetas').sort((a, b) => a.numero - b.numero);
  E.proximo = () => { const l = VP.db.lista('plaquetas', true); return l.length ? Math.max(...l.map((p) => p.numero)) + 1 : 0; };
  E.livres = () => E.todas().filter((p) => p.situacao === 'livre');
  E.daTumulo = (t) => (t.plaqueta != null ? VP.db.pega('plaquetas', E.texto(t.plaqueta)) : null);
  // O QR leva o número da plaqueta quando o túmulo já tem uma; senão, o código de posição
  VP.codigoQR = (t) => (t.plaqueta != null ? E.texto(t.plaqueta) : VP.codigoTumulo(t));

  const novaPlaqueta = (n, lote) => ({ id: E.texto(n), numero: n, tumuloId: null, situacao: 'livre', lote, historico: [{ quando: agora(), acao: 'número gerado', usuario: usuario() }], criadoEm: agora() });
  E.gerar = async (qtd) => {
    const ini = E.proximo();
    const fim = ini + qtd - 1;
    if (!Number.isInteger(qtd) || qtd < 1) return { erro: 'Informe uma quantidade inteira maior que zero.' };
    if (qtd > 5000) return { erro: 'No máximo 5.000 números por vez.' };
    if (fim > E.limite()) return { erro: `Passaria do limite de ${u.inteiro(E.limite())} (último número seria ${u.inteiro(fim)}).` };
    const lote = { id: 'lote-' + u.id(), de: ini, ate: fim, qtd, criadoEm: agora(), usuario: usuario() };
    const docs = [];
    for (let n = ini; n <= fim; n++) docs.push(novaPlaqueta(n, lote.id));
    await VP.db.gravarVarias({ plaquetas: docs, meta: [Object.assign({}, VP.db.pega('meta', 'lotesPlaquetas') || { id: 'lotesPlaquetas', lotes: [] }, { lotes: ((VP.db.pega('meta', 'lotesPlaquetas') || {}).lotes || []).concat(lote) })] });
    return { lote, docs };
  };
  // Liga a plaqueta ao túmulo (grava nos dois e na linha do tempo)
  const ligar = (pl, t, motivo) => {
    pl.tumuloId = t.id; pl.situacao = 'vinculada';
    pl.historico = (pl.historico || []).concat({ quando: agora(), acao: `ligada a ${VP.codigoTumulo(t)}`, nota: motivo || '', usuario: usuario() });
    t.plaqueta = pl.numero;
    return VP.novoEvento(t.id, 'qr', { descricao: `Plaqueta nº ${E.texto(pl.numero)} ligada a este túmulo${motivo ? ' — ' + motivo : ''}`, extra: { plaqueta: pl.numero } });
  };
  E.vincular = (t, depois) => {
    if (t.plaqueta != null) return ui.aviso(`Este túmulo já tem a plaqueta nº ${E.texto(t.plaqueta)}. Desligue antes.`, 'erro');
    const sugestao = E.livres()[0];
    ui.formulario({
      titulo: 'Ligar plaqueta — ' + VP.codigoTumulo(t), largura: 'pequena',
      intro: `<p class="ajuda">Digite o número impresso na plaqueta que foi afixada neste túmulo. ${sugestao ? `Próximo número livre: <b>${E.texto(sugestao.numero)}</b>.` : 'Não há números livres: gere mais em Plaquetas.'}</p>`,
      campos: [{ chave: 'numero', rotulo: 'Número da plaqueta', obrigatorio: true, padrao: sugestao ? E.texto(sugestao.numero) : '' }, { chave: 'afixada', rotulo: 'A plaqueta já está afixada no túmulo', tipo: 'bool', padrao: true }],
      salvar: async (x) => {
        if (!/^\d{1,6}$/.test(x.numero)) return 'Número com até 6 dígitos.';
        const pl = VP.db.pega('plaquetas', E.texto(Number(x.numero)));
        if (!pl) return 'Este número ainda não foi gerado. Gere mais números em Plaquetas.';
        if (pl.situacao === 'vinculada') return `Este número já está ligado ao túmulo ${VP.codigoTumulo(VP.db.pega('tumulos', pl.tumuloId) || {})}.`;
        if (pl.situacao === 'inutilizada') return 'Este número foi inutilizado (plaqueta perdida ou danificada).';
        const ev = ligar(pl, t, 'ligação manual');
        const antes = t.qrAfixado;
        if (x.afixada) t.qrAfixado = true;
        await VP.db.gravarVarias({ plaquetas: [pl], tumulos: [t], eventos: [ev].concat(x.afixada && !antes ? [VP.novoEvento(t.id, 'qr', { descricao: 'Plaqueta QR afixada' })] : []) });
        ui.aviso(`Plaqueta ${E.texto(pl.numero)} ligada.`); depois && depois();
      }
    });
  };
  E.desvincular = (t, depois) => {
    const pl = E.daTumulo(t);
    if (!pl) return;
    ui.formulario({
      titulo: `Desligar plaqueta nº ${E.texto(pl.numero)}`, largura: 'pequena',
      campos: [{ chave: 'destino', rotulo: 'O que aconteceu com a plaqueta', tipo: 'select', opcoes: [['livre', 'Foi ligada por engano: o número volta a ficar livre'], ['inutilizada', 'Perdida ou danificada: o número fica inutilizado']], obrigatorio: true }, { chave: 'motivo', rotulo: 'Motivo', tipo: 'area', obrigatorio: true }],
      salvar: async (x) => {
        pl.historico = (pl.historico || []).concat({ quando: agora(), acao: `desligada de ${VP.codigoTumulo(t)} (${x.destino === 'livre' ? 'voltou a ficar livre' : 'inutilizada'})`, nota: x.motivo, usuario: usuario() });
        pl.situacao = x.destino; pl.tumuloId = null;
        delete t.plaqueta;
        await VP.db.gravarVarias({ plaquetas: [pl], tumulos: [t], eventos: [VP.novoEvento(t.id, 'qr', { descricao: `Plaqueta nº ${E.texto(pl.numero)} desligada (${x.destino === 'livre' ? 'número livre de novo' : 'inutilizada'}): ${x.motivo}`, extra: { plaqueta: pl.numero } })] });
        ui.aviso('Plaqueta desligada.'); depois && depois();
      }
    });
  };
  // Numerar em lote os túmulos marcados que ainda não têm plaqueta: prévia → confirmação → resultado
  E.numerarLote = async (tumulos, depois) => {
    const sem = VP.ordenarTumulos(tumulos.filter((t) => t.plaqueta == null));
    const com = tumulos.length - sem.length;
    if (!sem.length) return ui.aviso('Todos os túmulos marcados já têm plaqueta.', 'erro');
    const livres = E.livres();
    const faltam = Math.max(0, sem.length - livres.length);
    if (E.proximo() + faltam - 1 > E.limite()) return ui.aviso(`Não há números suficientes até o limite de ${u.inteiro(E.limite())}.`, 'erro');
    const previa = sem.slice(0, 8).map((t, i) => `<li>${esc(VP.codigoTumulo(t))} → <b>${E.texto(i < livres.length ? livres[i].numero : E.proximo() + (i - livres.length))}</b></li>`).join('');
    if (!await ui.confirmar(`Ligar plaquetas a <b>${sem.length}</b> túmulo(s), na ordem do mapa (quadra, aléia, número)?${com ? ` ${com} marcado(s) já têm plaqueta e ficam como estão.` : ''} ${livres.length ? `Usa primeiro os ${Math.min(livres.length, sem.length)} números livres` : ''}${faltam ? ` e gera ${faltam} número(s) novo(s)` : ''}.<ul>${previa}${sem.length > 8 ? '<li>…</li>' : ''}</ul>Cada ligação pode ser desfeita depois na ficha do túmulo.`, { titulo: 'Numerar plaquetas', sim: 'Ligar plaquetas' })) return;
    if (faltam) { const r = await E.gerar(faltam); if (r.erro) return ui.aviso(r.erro, 'erro'); }
    const disp = E.livres();
    const pls = [], evs = [], ok = [];
    sem.forEach((t, i) => { const pl = disp[i]; evs.push(ligar(pl, t, 'numeração em lote')); pls.push(pl); ok.push(`${VP.codigoTumulo(t)} → ${E.texto(pl.numero)}`); });
    await VP.db.gravarVarias({ plaquetas: pls, tumulos: sem, eventos: evs });
    ui.resultado({ titulo: 'Plaquetas ligadas', sucesso: ok, extra: '<p class="ajuda">Para imprimir: Relatórios → Etiquetas QR (o QR leva o número da plaqueta).</p>' });
    depois && depois();
  };

  T.plaquetas = () => {
    const todas = E.todas();
    const cont = (s) => todas.filter((p) => p.situacao === s).length;
    const lotes = ((VP.db.pega('meta', 'lotesPlaquetas') || {}).lotes || []).slice().reverse();
    const semPlaqueta = VP.db.lista('tumulos').filter((t) => t.plaqueta == null).length;
    return {
      titulo: 'Plaquetas',
      acoes: '<button class="botao primario" data-gerar-plaq>Gerar mais números</button>',
      html: `<div class="resumo-linha">${G.numero('Números gerados', u.inteiro(todas.length), todas.length ? `${E.texto(todas[0].numero)} a ${E.texto(todas[todas.length - 1].numero)}` : '')}${G.numero('Ligados a túmulos', u.inteiro(cont('vinculada')))}${G.numero('Livres (para imprimir ou afixar)', u.inteiro(cont('livre')))}${G.numero('Inutilizados', u.inteiro(cont('inutilizada')))}${G.numero('Túmulos sem plaqueta', u.inteiro(semPlaqueta), '', '#tumulos?semPlaqueta=1')}</div>
        <section class="cartao"><p>Próximo número: <b>${E.texto(E.proximo())}</b> · limite: <b>${u.inteiro(E.limite())}</b> (ajustável em Configurações).</p>
          <div class="linha-botoes">${[10, 30, 50, 100].map((n) => `<button class="botao" data-mais="${n}">+${n}</button>`).join('')}</div>
          <p class="ajuda">Para ligar plaquetas a vários túmulos de uma vez: menu Túmulos → marque os túmulos → "Numerar plaquetas". Para um túmulo só: ficha do túmulo → "Ligar plaqueta".</p></section>
        <section class="cartao"><h3>Lotes gerados</h3>${lotes.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Números</th><th class="num">Quantidade</th><th class="num">Ainda livres</th><th>Por</th><th></th></tr></thead><tbody>${lotes.map((l) => `<tr><td>${u.data(l.criadoEm)}</td><td>${E.texto(l.de)} a ${E.texto(l.ate)}</td><td class="num">${u.inteiro(l.qtd)}</td><td class="num">${u.inteiro(todas.filter((p) => p.lote === l.id && p.situacao === 'livre').length)}</td><td>${esc(l.usuario || '')}</td><td><button class="botao pequeno" data-imprimir-lote="${esc(l.id)}">Imprimir os livres</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhum número gerado ainda.</p>'}</section>
        <div id="etq-plaq"></div>`,
      ligar() {
        const re = () => VP.app.render();
        const gerar = async (n) => { const r = await E.gerar(n); if (r.erro) return ui.aviso(r.erro, 'erro'); ui.aviso(`Gerados ${n} números: ${E.texto(r.lote.de)} a ${E.texto(r.lote.ate)}.`); re(); };
        document.querySelectorAll('[data-mais]').forEach((b) => b.addEventListener('click', () => gerar(Number(b.dataset.mais))));
        document.querySelector('[data-gerar-plaq]').addEventListener('click', () => ui.formulario({ titulo: 'Gerar mais números', largura: 'pequena', campos: [{ chave: 'qtd', rotulo: 'Quantos números', tipo: 'numero', obrigatorio: true }], salvar: async (x) => { const r = await E.gerar(Number(x.qtd)); if (r.erro) return r.erro; ui.aviso(`Gerados ${x.qtd} números: ${E.texto(r.lote.de)} a ${E.texto(r.lote.ate)}.`); re(); return null; } }));
        document.querySelectorAll('[data-imprimir-lote]').forEach((b) => b.addEventListener('click', () => {
          const l = E.todas().filter((p) => p.lote === b.dataset.imprimirLote && p.situacao === 'livre');
          if (!l.length) return ui.aviso('Nenhum número livre neste lote.', 'erro');
          const html = `<div class="folha-etiquetas">${l.map((p) => `<div class="etiqueta"><div class="etq-qr">${G.qr(E.texto(p.numero), 2)}</div><div class="etq-txt"><small>${esc(VP.nomeEntidade())}</small><b class="etq-numero">${E.texto(p.numero)}</b><span>Plaqueta do cemitério</span></div></div>`).join('')}</div>`;
          document.getElementById('etq-plaq').innerHTML = `<p><b>${l.length}</b> plaquetas. <button class="botao primario" data-imp-plaq>Imprimir</button></p>${html}`;
          document.querySelector('[data-imp-plaq]').addEventListener('click', () => ui.imprimir(html, 'Plaquetas numeradas'));
        }));
      }
    };
  };
})();
