/* VitalPat Cemitério · Gestão — telas da etapa 1: painel, mapa, túmulos, ficha, importação (De/Para),
   localização exata (levantamento da empresa), relatórios, cadastros, configurações e Lixeira. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas = {};
  VP.estado = VP.estado || { filtros: {}, listaAtual: [] };

  const opc = (col, filtro) => VP.db.lista(col).filter(filtro || (() => true)).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true })).map((x) => [x.id, x.nome]);
  const seloOcup = (t) => `<span class="selo-status o-${esc(t.ocupacao)}">${esc(L.ocupacao[t.ocupacao] || '—')}</span>`;
  const seloGeo = (t) => (VP.coordenadaExata(t) ? '<span class="selo-status g-exata">Localização exata</span>' : VP.temCoordenada(t) ? '<span class="selo-status g-aprox">Localização aproximada</span>' : '<span class="selo-status g-sem">Aguardando levantamento</span>');

  // ===================================================================== PAINEL
  T.painel = () => {
    const r = VP.resumo();
    const pend = VP.pendencias();
    const porQuadra = VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem).map((q) => {
      const l = VP.db.lista('tumulos').filter((t) => t.quadraId === q.id);
      return { rotulo: q.nome, a: l.filter((t) => t.ocupacao === 'ocupado').length, b: l.filter((t) => t.ocupacao !== 'ocupado').length };
    }).filter((x) => x.a + x.b);
    const icone = { critico: '⛔', atencao: '⚠️', info: 'ℹ️' };
    const nivel = { critico: 'Urgente', atencao: 'Atenção', info: 'Para saber' };
    return {
      titulo: 'Painel do cemitério',
      acoes: '<a class="botao primario" href="#mapa">Ver mapa</a>',
      html: `
        <div class="resumo-linha grande">
          ${G.numero('Túmulos cadastrados', u.inteiro(r.total), `${VP.db.lista('quadras').length} quadras`, '#tumulos')}
          ${G.numero('Ocupação', u.pct(r.total ? r.ocupado / r.total : 0), `${u.inteiro(r.ocupado)} ocupados`, '#mapa')}
          ${G.numero('Vagos', u.inteiro(r.vago), `${u.inteiro(r.reservado)} reservados`, '#tumulos?ocupacao=vago')}
          ${G.numero('Com localização exata', u.pct(r.total ? r.exata / r.total : 0), `${u.inteiro(r.exata)} de ${u.inteiro(r.total)}`, '#levantamento')}
        </div>
        <div class="grade-painel">
          <section class="cartao"><h3>Central de pendências</h3>
            ${pend.length ? `<ul class="pendencias">${pend.map((p) => `<li class="p-${p.nivel}"><a href="${esc(p.link)}"><span class="p-icone" aria-hidden="true">${icone[p.nivel]}</span><span class="p-nivel">${nivel[p.nivel]}</span><span class="p-texto">${esc(p.titulo)}</span><b class="p-qtd">${u.inteiro(p.qtd)}</b></a></li>`).join('')}</ul>` : '<p class="tudo-certo">✓ Nenhuma pendência.</p>'}
          </section>
          <section class="cartao"><h3>Ocupação por quadra</h3>${G.empilhadas(porQuadra, ['Ocupados', 'Vagos, reservados ou sem informação'])}</section>
          <section class="cartao"><h3>Por tipo</h3>${G.barrasH(Object.entries(L.tipos).map(([k, n]) => ({ rotulo: n, valor: VP.db.lista('tumulos').filter((t) => t.tipo === k).length })))}</section>
          <section class="cartao"><h3>Situação dos túmulos</h3>${G.barrasH(Object.entries(L.situacoes).map(([k, n]) => ({ rotulo: n, valor: VP.db.lista('tumulos').filter((t) => VP.situacaoAtual(t) === k).length, link: '#tumulos?situacao=' + k })), { mostrarZeros: true })}<p class="ajuda">Situação gravada por decisão de uma pessoa. <a href="#triagem">Triagem</a> · <a href="#ordens">Ordens de serviço</a> (${u.inteiro(VP.db.lista('ordensServico').filter(VP.ordemAberta).length)} abertas)</p></section>
          <section class="cartao"><h3>Levantamento de campo</h3>${G.barrasH([{ rotulo: 'Com localização exata', valor: r.exata }, { rotulo: 'Com localização aproximada', valor: r.comCoordenada - r.exata }, { rotulo: 'Com foto', valor: r.comFoto }, { rotulo: 'Com plaqueta QR', valor: r.comQr }], { mostrarZeros: true })}<p class="ajuda">A localização exata vem do levantamento da empresa especializada (menu Localização).</p></section>
        </div>`
    };
  };

  // ===================================================================== MAPA ESQUEMÁTICO
  // Funciona já, sem coordenadas: quadra → aléia → número. Quando houver levantamento, o mapa real usa as mesmas fichas.
  const MODOS = {
    ocupacao: { nome: 'Ocupação', classe: (t) => 'c-' + t.ocupacao, legenda: [['c-ocupado', 'Ocupado'], ['c-vago', 'Vago'], ['c-reservado', 'Reservado'], ['c-nao-informado', 'Não informado']] },
    tipo: { nome: 'Tipo', classe: (t) => ({ sepultura: 'c-ocupado', jazigo: 'c-vago', gaveta: 'c-reservado' }[t.tipo] || 'c-nao-informado'), legenda: [['c-ocupado', 'Sepultura'], ['c-vago', 'Jazigo'], ['c-reservado', 'Gaveta'], ['c-nao-informado', 'Outro']] },
    levantamento: { nome: 'Localização', classe: (t) => (VP.coordenadaExata(t) ? 'c-ocupado' : VP.temCoordenada(t) ? 'c-vago' : 'c-nao-informado'), legenda: [['c-ocupado', 'Exata'], ['c-vago', 'Aproximada'], ['c-nao-informado', 'Aguardando levantamento']] },
    situacao: { nome: 'Situação (abandono)', classe: (t) => 'c-s-' + VP.situacaoAtual(t), legenda: Object.entries(L.situacoes).map(([k, n]) => ['c-s-' + k, n]) },
    vistoria: { nome: 'Vistoria', classe: (t) => { const v = VP.vistoriasDe(t.id)[0]; if (!v) return 'c-nao-informado'; return VP.temRisco(t) ? 'c-s-apuracao' : VP.notaVistoria(v) >= VP.config().notaAtencao ? 'c-s-atencao' : 'c-s-regular'; }, legenda: [['c-s-regular', 'Vistoriado, sem problema'], ['c-s-atencao', 'Vistoriado, com problemas'], ['c-s-apuracao', 'Com risco (estrutura ou tampa)'], ['c-nao-informado', 'Sem vistoria']] },
    concessao: { nome: 'Concessão', classe: (t) => { const c = VP.concessaoAtual(t.id); return !c ? 'c-nao-informado' : VP.concessaoVencida(c) ? 'c-s-apuracao' : c.tipo === 'perpetua' ? 'c-s-declarado' : 'c-s-regular'; }, legenda: [['c-s-declarado', 'Perpétua'], ['c-s-regular', 'Temporária vigente'], ['c-s-apuracao', 'Concessão vencida'], ['c-nao-informado', 'Sem concessão']] },
    campo: { nome: 'Foto e plaqueta', classe: (t) => ((t.fotos || []).length && t.qrAfixado ? 'c-ocupado' : (t.fotos || []).length || t.qrAfixado ? 'c-vago' : 'c-nao-informado'), legenda: [['c-ocupado', 'Foto e plaqueta'], ['c-vago', 'Só um dos dois'], ['c-nao-informado', 'Nenhum']] }
  };
  VP.MODOS_MAPA = MODOS;
  T.mapa = (param, query) => {
    if (param === 'real') return VP.mapaReal.tela();
    const v = VP.estado.mapa = VP.estado.mapa || { modo: 'ocupacao', quadraId: '' };
    if (query.quadra) v.quadraId = query.quadra;
    const desenhar = () => {
      const modo = MODOS[v.modo];
      const quadras = VP.db.lista('quadras').filter((q) => !v.quadraId || q.id === v.quadraId).sort((a, b) => a.ordem - b.ordem);
      const busca = VP.normNumero(v.busca || '');
      const todos = VP.db.lista('tumulos');
      const contagem = new Map(modo.legenda.map(([c]) => [c, 0]));
      const blocos = quadras.map((q) => {
        const tq = todos.filter((t) => t.quadraId === q.id);
        const aleias = [...new Set(tq.map((t) => t.aleia))].sort((a, b) => u.ordemNumero(VP.normAleia(a), VP.normAleia(b)));
        return `<section class="cartao quadra-mapa"><header><h3>${esc(q.nome)}</h3><small>${u.inteiro(tq.length)} túmulos · ${esc(L.tiposQuadra[q.tipo] || '')}</small></header>
          <div class="esquema">${aleias.map((a) => `<div class="aleia"><span class="aleia-rotulo" title="Aléia ${esc(a)}">${esc(a)}</span><div class="covas">${tq.filter((t) => t.aleia === a).sort((x, y) => u.ordemNumero(VP.normNumero(x.numero), VP.normNumero(y.numero))).map((t) => {
            const c = modo.classe(t); contagem.set(c, (contagem.get(c) || 0) + 1);
            const achou = busca && VP.normNumero(t.numero) === busca;
            return `<a href="#tumulo/${esc(t.id)}" class="cova ${c} ${achou ? 'achada' : ''}" title="${esc(`${q.nome} · Aléia ${t.aleia} · Nº ${t.numero} — ${L.ocupacao[t.ocupacao]} · ${L.tipos[t.tipo]}`)}" aria-label="${esc(`Nº ${t.numero}`)}"></a>`;
          }).join('')}</div></div>`).join('')}</div></section>`;
      }).join('');
      return `${VP.mapaReal.abas('posicao')}<div class="linha-filtros">
          <label>Colorir por <select data-modo>${Object.entries(MODOS).map(([k, m]) => `<option value="${k}" ${k === v.modo ? 'selected' : ''}>${m.nome}</option>`).join('')}</select></label>
          <label>Quadra <select data-quadra><option value="">Todas</option>${opc('quadras').map(([id, n]) => `<option value="${id}" ${id === v.quadraId ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <label>Achar número <input data-achar value="${esc(v.busca || '')}" size="8" placeholder="Ex.: 15"></label>
        </div>
        <div class="legenda">${modo.legenda.map(([c, n]) => `<span><i class="${c}"></i>${esc(n)} (${u.inteiro(contagem.get(c) || 0)})</span>`).join('')}</div>
        <p class="ajuda">Cada quadradinho é um túmulo; cada linha é uma aléia. Clique para abrir a ficha. Este é o mapa por posição (quadra, aléia, número). Quando o levantamento da empresa chegar, a mesma ficha mostra a localização exata e o botão para o Google Maps.</p>
        <div class="grade-quadras">${blocos || '<p class="vazio">Nenhum túmulo.</p>'}</div>`;
    };
    const atualizar = () => { document.getElementById('area-mapa').innerHTML = desenhar(); ligar(); };
    const ligar = () => {
      const a = document.getElementById('area-mapa');
      a.querySelector('[data-modo]').addEventListener('change', (e) => { v.modo = e.target.value; atualizar(); });
      a.querySelector('[data-quadra]').addEventListener('change', (e) => { v.quadraId = e.target.value; atualizar(); });
      a.querySelector('[data-achar]').addEventListener('change', (e) => { v.busca = e.target.value; atualizar(); a.querySelector('.cova.achada')?.scrollIntoView({ block: 'center' }); });
      VP.estado.listaAtual = VP.filtrarTumulos({ quadraId: v.quadraId }).map((t) => t.id);
    };
    return { titulo: 'Mapa do cemitério', acoes: '<a class="botao" href="#tumulos">Ver em lista</a> <a class="botao" href="#relatorio/fotografico">Relatório com fotos e mapa</a>', html: `<div id="area-mapa">${desenhar()}</div>`, ligar };
  };

  // ===================================================================== LISTA DE TÚMULOS
  T.tumulos = (_, query) => {
    const v = VP.estado.filtros;
    if (Object.keys(query).length) { for (const k of Object.keys(v)) delete v[k]; Object.assign(v, Object.fromEntries(Object.entries(query).map(([k, x]) => [k, x === '1' ? true : x]))); }
    const defs = [
      { chave: 'cemiterioId', rotulo: 'Cemitério', tipo: 'select', opcoes: opc('cemiterios') },
      { chave: 'quadraId', rotulo: 'Quadra', tipo: 'select', opcoes: opc('quadras') },
      { chave: 'aleia', rotulo: 'Aléia', tipo: 'texto', tamanho: 6 },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tipos) },
      { chave: 'ocupacao', rotulo: 'Ocupação', tipo: 'select', opcoes: Object.entries(L.ocupacao) },
      { chave: 'semCoordenada', rotulo: 'Aguardando localização', tipo: 'bool' },
      { chave: 'comCoordenada', rotulo: 'Com localização', tipo: 'bool' },
      { chave: 'semFoto', rotulo: 'Sem foto', tipo: 'bool' },
      { chave: 'semQr', rotulo: 'Sem plaqueta QR', tipo: 'bool' },
      { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(L.situacoes) },
      { chave: 'risco', rotulo: 'Com risco (estrutura ou tampa)', tipo: 'bool' },
      { chave: 'semVistoria', rotulo: 'Sem vistoria', tipo: 'bool' },
      { chave: 'semPlaqueta', rotulo: 'Sem plaqueta numerada', tipo: 'bool' },
      { chave: 'concessao', rotulo: 'Concessão', tipo: 'select', opcoes: [['perpetua', 'Perpétua'], ['temporaria', 'Temporária'], ['vencida', 'Temporária vencida'], ['sem', 'Sem concessão']] },
      { chave: 'permanenciaVencida', rotulo: 'Gaveta com permanência vencida', tipo: 'bool' }];
    const colunas = [
      { chave: 'codigo', titulo: 'Código', valor: (t) => VP.codigoTumulo(t) },
      { chave: 'quadra', titulo: 'Quadra', valor: (t) => VP.nome('quadras', t.quadraId), ordenar: (t) => VP.db.pega('quadras', t.quadraId)?.ordem },
      { chave: 'aleia', titulo: 'Aléia', ordenar: (t) => Number(VP.normAleia(t.aleia)) || 999 },
      { chave: 'numero', titulo: 'Número', html: (t) => `<a href="#tumulo/${esc(t.id)}">${esc(t.numero)}</a>`, valor: (t) => t.numero, ordenar: (t) => parseInt(t.numero, 10) || 0 },
      { chave: 'tipo', titulo: 'Tipo', valor: (t) => L.tipos[t.tipo] },
      { chave: 'ocupacao', titulo: 'Ocupação', html: seloOcup, valor: (t) => L.ocupacao[t.ocupacao] },
      { chave: 'geo', titulo: 'Localização', html: seloGeo, valor: (t) => (VP.coordenadaExata(t) ? 'Exata' : VP.temCoordenada(t) ? 'Aproximada' : 'Aguardando') },
      { chave: 'lat', titulo: 'Latitude', valor: (t) => t.geo?.lat ?? '', oculta: true },
      { chave: 'lon', titulo: 'Longitude', valor: (t) => t.geo?.lon ?? '', oculta: true },
      { chave: 'medidas', titulo: 'Medidas (m)', valor: (t) => (t.comprimento ? `${String(t.comprimento).replace('.', ',')} × ${String(t.largura).replace('.', ',')}` : ''), oculta: true },
      { chave: 'foto', titulo: 'Foto', valor: (t) => ((t.fotos || []).length ? 'Sim' : 'Não') },
      { chave: 'qr', titulo: 'Plaqueta QR', valor: (t) => (t.qrAfixado ? 'Sim' : 'Não') },
      { chave: 'plaqueta', titulo: 'Nº da plaqueta', valor: (t) => (t.plaqueta != null ? VP.plaquetas.texto(t.plaqueta) : ''), ordenar: (t) => t.plaqueta ?? 1e9 },
      { chave: 'situacao', titulo: 'Situação', html: (t) => VP.etapa2.seloSituacao(t), valor: (t) => L.situacoes[VP.situacaoAtual(t)] },
      { chave: 'concessao', titulo: 'Concessão', html: (t) => VP.etapa3.seloConcessao(VP.concessaoAtual(t.id)), valor: (t) => { const c = VP.concessaoAtual(t.id); return !c ? 'Sem concessão' : VP.concessaoVencida(c) ? 'Temporária vencida' : L.tiposConcessao[c.tipo]; }, oculta: true },
      { chave: 'sepultados', titulo: 'Sepultados', valor: (t) => VP.sepultadosAtivos(t.id).map((x) => x.falecido).join('; '), oculta: true },
      { chave: 'ultimaVistoria', titulo: 'Última vistoria', valor: (t) => u.data(VP.vistoriasDe(t.id)[0]?.data), ordenar: (t) => VP.vistoriasDe(t.id)[0]?.data || '', oculta: true }];
    const desenhar = () => {
      const lista = VP.filtrarTumulos(ui.limparValores(v));
      VP.estado.listaAtual = lista.map((t) => t.id);
      const r = VP.resumo(lista);
      return `<div class="resumo-linha">${G.numero('Túmulos no filtro', u.inteiro(r.total))}${G.numero('Ocupados', u.inteiro(r.ocupado))}${G.numero('Vagos', u.inteiro(r.vago))}${G.numero('Com localização exata', u.inteiro(r.exata))}</div>
        <div class="linha-filtros">${ui.filtros({ id: 'tum', defs, valores: v, placeholder: 'Buscar por código, quadra, aléia, número…', aoMudar: (_x, o) => atualizar(o) })}</div>
        <div id="barra-lote" class="barra-lote" hidden></div>
        ${ui.tabela({ id: 'tumulos', colunas, linhas: lista, selecao: true, porPagina: 100, nomePlanilha: 'tumulos', aoClicar: (t) => VP.app.ir('#tumulo/' + t.id) })}`;
    };
    const atualizar = (o) => {
      const a = document.getElementById('area-tum');
      a.innerHTML = desenhar(); ligar();
      if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    };
    const barra = (sel) => {
      const el = document.getElementById('barra-lote');
      el.hidden = !sel.size;
      if (!sel.size) return;
      el.innerHTML = `<b>${u.inteiro(sel.size)} marcado(s):</b>
        <button class="botao pequeno" data-lote="ocupacao">Definir ocupação</button>
        <button class="botao pequeno" data-lote="tipo">Definir tipo</button>
        <button class="botao pequeno" data-lote="qr">Plaqueta QR afixada</button>
        <button class="botao pequeno" data-lote="numerar">Numerar plaquetas</button>
        <button class="botao pequeno" data-lote="etiquetas">Etiquetas QR</button>
        <button class="botao pequeno perigo" data-lote="excluir">Excluir</button>`;
      el.querySelectorAll('[data-lote]').forEach((b) => b.addEventListener('click', () => lote(b.dataset.lote, [...sel].map((id) => VP.db.pega('tumulos', id)), () => { sel.clear(); atualizar(); })));
    };
    const ligar = () => { ui.ligarTabela('tumulos', barra); barra(ui.tabelas.tumulos.selecionados); };
    return { titulo: 'Túmulos', acoes: '<a class="botao" href="#mapa">Ver no mapa</a> <button class="botao primario" data-novo-tum>+ Novo túmulo</button>', html: `<div id="area-tum">${desenhar()}</div>`, ligar() { ligar(); document.querySelector('[data-novo-tum]').addEventListener('click', () => editarTumulo(null)); } };
  };
  const lote = (acao, tumulos, depois) => {
    const aplicar = async (fn, desc) => {
      const evs = tumulos.map((t) => { const antes = fn(t); return VP.novoEvento(t.id, acao === 'qr' ? 'qr' : 'alteracao', { descricao: desc, extra: { antes } }); });
      await VP.db.gravarVarias({ tumulos, eventos: evs });
      ui.resultado({ titulo: desc, sucesso: tumulos.map(VP.rotuloTumulo) });
      depois();
    };
    if (acao === 'ocupacao' || acao === 'tipo') {
      const lista = acao === 'ocupacao' ? L.ocupacao : L.tipos;
      return ui.formulario({ titulo: `${acao === 'ocupacao' ? 'Ocupação' : 'Tipo'} — ${tumulos.length} túmulo(s)`, largura: 'pequena', campos: [{ chave: 'valor', rotulo: acao === 'ocupacao' ? 'Ocupação' : 'Tipo', tipo: 'select', opcoes: Object.entries(lista), obrigatorio: true }],
        salvar: (x) => aplicar((t) => { const a = t[acao]; t[acao] = x.valor; return a; }, `${acao === 'ocupacao' ? 'Ocupação' : 'Tipo'}: ${lista[x.valor]}`) });
    }
    if (acao === 'qr') return aplicar((t) => { const a = t.qrAfixado; t.qrAfixado = true; return a; }, 'Plaqueta QR afixada');
    if (acao === 'numerar') return VP.plaquetas.numerarLote(tumulos, depois);
    if (acao === 'etiquetas') { VP.estado.etiquetasIds = tumulos.map((t) => t.id); return VP.app.ir('#relatorio/etiquetas'); }
    if (acao === 'excluir') return excluir(tumulos, depois);
  };
  const excluir = async (tumulos, depois) => {
    if (!await ui.confirmar(`Mover ${tumulos.length} túmulo(s) para a Lixeira? Use só para cadastro feito por engano. Pode ser restaurado depois.`, { titulo: 'Excluir (Lixeira)', sim: 'Mover para a Lixeira', classe: 'perigo' })) return;
    for (const t of tumulos) { t.excluido = true; t.excluidoEm = VP.Plataforma.agoraISO(); }
    await VP.db.gravarVarias({ tumulos, eventos: tumulos.map((t) => VP.novoEvento(t.id, 'alteracao', { descricao: 'Movido para a Lixeira' })) });
    ui.aviso('Na Lixeira.');
    depois();
  };

  // ===================================================================== FICHA DO TÚMULO
  const camposTumulo = () => [
    { chave: 'cemiterioId', rotulo: 'Cemitério', tipo: 'select', opcoes: opc('cemiterios'), obrigatorio: true, largura: 'meia' },
    { chave: 'quadraId', rotulo: 'Quadra', tipo: 'select', opcoes: opc('quadras'), obrigatorio: true, largura: 'meia' },
    { chave: 'aleia', rotulo: 'Aléia', largura: 'meia' }, { chave: 'numero', rotulo: 'Número', obrigatorio: true, largura: 'meia' },
    { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tipos), vazio: false, largura: 'meia' },
    { chave: 'ocupacao', rotulo: 'Ocupação', tipo: 'select', opcoes: Object.entries(L.ocupacao), vazio: false, largura: 'meia' },
    { chave: 'comprimento', rotulo: 'Comprimento (m)', tipo: 'numero', largura: 'meia' }, { chave: 'largura', rotulo: 'Largura (m)', tipo: 'numero', largura: 'meia' },
    { chave: 'qrAfixado', rotulo: 'Plaqueta QR afixada no túmulo', tipo: 'bool' },
    { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }];
  const editarTumulo = (t) => ui.formulario({
    titulo: t ? 'Editar túmulo' : 'Novo túmulo', campos: camposTumulo(), valores: t || { cemiterioId: VP.db.lista('cemiterios')[0]?.id, tipo: 'sepultura', ocupacao: 'nao-informado' }, largura: 'media',
    salvar: async (v) => {
      const q = VP.db.pega('quadras', v.quadraId);
      const chave = VP.chaveTumulo(v.cemiterioId, q?.nome, v.aleia, v.numero);
      const outro = VP.acharTumulo(chave);
      if (outro && outro.id !== t?.id) return `Já existe este túmulo (${VP.rotuloTumulo(outro)}).`;
      const novo = !t;
      const doc = t || { id: u.id(), fotos: [], anexos: [], geo: null, criadoEm: VP.Plataforma.agoraISO() };
      const mud = [];
      for (const [k, x] of Object.entries(v)) if (JSON.stringify(doc[k] ?? '') !== JSON.stringify(x ?? '')) { mud.push({ campo: k, antes: doc[k] ?? '', depois: x }); doc[k] = x; }
      if (!mud.length && !novo) return null;
      await VP.db.gravarVarias({ tumulos: [doc], eventos: [VP.novoEvento(doc.id, novo ? 'cadastro' : 'alteracao', { descricao: novo ? 'Túmulo cadastrado' : 'Alterado: ' + mud.map((m) => m.campo).join(', '), extra: { mudancas: mud } })] });
      ui.aviso('Salvo.');
      VP.app.ir('#tumulo/' + doc.id);
    }
  });
  T.tumulo = (id) => {
    const t = VP.db.pega('tumulos', id);
    if (!t || t.excluido) return { titulo: 'Túmulo', html: '<p>Túmulo não encontrado. Veja a <a href="#lixeira">Lixeira</a>.</p>' };
    const q = VP.db.pega('quadras', t.quadraId);
    const lista = VP.estado.listaAtual || [];
    const pos = lista.indexOf(id);
    const ant = pos > 0 ? lista[pos - 1] : null, prox = pos >= 0 && pos < lista.length - 1 ? lista[pos + 1] : null;
    const evs = VP.db.lista('eventos').filter((e) => e.tumuloId === id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    const g = t.geo;
    const vizinhos = VP.db.lista('tumulos').filter((x) => x.quadraId === t.quadraId && x.aleia === t.aleia).sort((a, b) => u.ordemNumero(VP.normNumero(a.numero), VP.normNumero(b.numero)));
    const k = vizinhos.indexOf(t);
    const trecho = vizinhos.slice(Math.max(0, k - 6), k + 7);
    return {
      titulo: VP.codigoTumulo(t),
      acoes: `<a class="botao" href="#mapa?quadra=${esc(t.quadraId)}">‹ Mapa</a> ${ant ? `<a class="botao" href="#tumulo/${esc(ant)}">‹ Anterior</a>` : ''} ${prox ? `<a class="botao" href="#tumulo/${esc(prox)}">Próximo ›</a>` : ''}`,
      html: `
        <div class="ficha-topo cartao">
          <div class="ficha-foto">${t.fotos?.[0] ? `<img src="${t.fotos[0].dataURL}" alt="Foto do túmulo">` : '<div class="sem-foto-grande"><small>Sem foto</small></div>'}<label class="botao pequeno">Adicionar foto<input type="file" accept="image/*" data-foto multiple hidden></label></div>
          <div class="ficha-principal">
            <div class="ficha-titulo"><h2>${esc(q?.nome || '')} · Aléia ${esc(t.aleia || '—')} · Nº ${esc(t.numero)}</h2>${seloOcup(t)}</div>
            <p class="ficha-sub">${esc(L.tipos[t.tipo])} · ${esc(VP.nome('cemiterios', t.cemiterioId))} · Código <b>${esc(VP.codigoTumulo(t))}</b></p>
            <div class="resumo-linha">${G.numero('Medidas', t.comprimento ? `${String(t.comprimento).replace('.', ',')} × ${String(t.largura).replace('.', ',')} m` : '—')}${G.numero('Plaqueta QR', t.qrAfixado ? 'Afixada' : 'Não afixada')}${G.numero('Fotos', u.inteiro((t.fotos || []).length))}</div>
            <h4>Posição na aléia</h4><div class="trecho-aleia">${trecho.map((x) => `<a href="#tumulo/${esc(x.id)}" class="cova-txt c-${esc(x.ocupacao)} ${x.id === t.id ? 'atual' : ''}" title="${esc(L.ocupacao[x.ocupacao])}">${esc(x.numero)}</a>`).join('')}</div>
          </div>
          <div class="ficha-qr" title="QR Code do túmulo">${G.qr(VP.codigoQR(t), 3)}<small>${t.plaqueta != null ? `Plaqueta <b>${VP.plaquetas.texto(t.plaqueta)}</b>` : esc(VP.codigoTumulo(t))}</small>${t.plaqueta != null ? '<button class="botao pequeno" data-plaq="desligar">Desligar plaqueta</button>' : '<button class="botao pequeno" data-plaq="ligar">Ligar plaqueta</button>'}</div>
        </div>
        <div class="barra-acoes"><button class="botao" data-acao="editar">Editar</button><button class="botao" data-acao="local">Informar localização</button><button class="botao" data-acao="gps">Usar GPS deste aparelho</button><button class="botao" data-acao="observacao">Observação</button><button class="botao" data-acao="etiqueta">Etiqueta QR</button><button class="botao perigo" data-acao="excluir">Excluir</button></div>
        <div class="grade-secoes">
          <section class="cartao secao"><header><h3>Localização</h3>${seloGeo(t)}</header>
            ${g ? `<dl class="dados"><dt>Latitude</dt><dd>${esc(g.lat)}</dd><dt>Longitude</dt><dd>${esc(g.lon)}</dd><dt>Precisão</dt><dd>${g.precisao != null ? esc(String(g.precisao).replace('.', ',')) + ' m' : '—'}</dd><dt>Origem</dt><dd>${esc(L.fontesGeo[g.fonte] || g.fonte)}</dd><dt>Data</dt><dd>${u.data(g.data)}</dd><dt>Contorno</dt><dd>${g.poligono ? g.poligono.length + ' pontos' : '—'}</dd></dl>
              <p><a class="botao" target="_blank" rel="noopener" href="${esc(VP.linkGoogleMaps(g.lat, g.lon))}">Ver no Google Maps</a></p>`
              : '<p>Ainda sem coordenada. A localização exata virá do <a href="#levantamento">levantamento da empresa especializada</a>. Enquanto isso, o túmulo é achado pela quadra, aléia e número (mapa) e pela plaqueta QR.</p>'}
          </section>
          <section class="cartao secao"><header><h3>Dados</h3></header><dl class="dados"><dt>Cemitério</dt><dd>${esc(VP.nome('cemiterios', t.cemiterioId))}</dd><dt>Quadra</dt><dd>${esc(q?.nome || '')} (${esc(L.tiposQuadra[q?.tipo] || '')})</dd><dt>Aléia</dt><dd>${esc(t.aleia || '—')}</dd><dt>Número</dt><dd>${esc(t.numero)}</dd><dt>Tipo</dt><dd>${esc(L.tipos[t.tipo])}</dd><dt>Ocupação</dt><dd>${esc(L.ocupacao[t.ocupacao])}</dd><dt>Observação</dt><dd>${esc(t.observacao || '—')}</dd></dl></section>
          <section class="cartao secao"><header><h3>Fotos</h3></header>${(t.fotos || []).length ? `<div class="galeria-fotos">${t.fotos.map((f) => `<a href="${f.dataURL}" target="_blank" rel="noopener"><img src="${f.dataURL}" alt=""><small>${u.data(f.data)}</small></a>`).join('')}</div>` : '<p class="vazio">Nenhuma foto.</p>'}</section>
        </div>
        ${VP.etapa3.secaoFicha(t)}
        ${VP.etapa2.secaoFicha(t)}
        <section class="cartao secao linha-do-tempo-cartao"><header><h3>Linha do tempo</h3></header>
          ${evs.length ? `<ol class="linha-do-tempo">${evs.map((e) => `<li class="ev"><span class="ev-data">${u.data(e.data)}</span><span class="ev-corpo"><b>${esc(L.eventos[e.tipo] || e.tipo)}</b><br><small>${esc(e.descricao)} · por ${esc(e.usuario)}</small></span><span></span></li>`).join('')}</ol>` : `<p class="vazio">Cadastrado em ${u.data(t.criadoEm)}. Nenhuma alteração ainda.</p>`}
        </section>`,
      ligar() {
        const c = document.getElementById('conteudo');
        const recarrega = () => VP.app.render();
        VP.etapa2.ligarFicha(t, recarrega);
        VP.etapa3.ligarFicha(t, recarrega);
        c.querySelector('[data-plaq]')?.addEventListener('click', (e) => (e.currentTarget.dataset.plaq === 'ligar' ? VP.plaquetas.vincular(t, recarrega) : VP.plaquetas.desvincular(t, recarrega)));
        c.querySelector('[data-foto]').addEventListener('change', async (e) => {
          const fotos = await ui.lerArquivos(e.target.files);
          if (!fotos.length) return;
          t.fotos = fotos.concat(t.fotos || []).slice(0, 12);
          await VP.db.gravarVarias({ tumulos: [t], eventos: [VP.novoEvento(t.id, 'foto', { descricao: `${fotos.length} foto(s) adicionada(s)` })] });
          ui.aviso('Foto adicionada.'); recarrega();
        });
        c.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', () => {
          const a = b.dataset.acao;
          if (a === 'editar') return editarTumulo(t);
          if (a === 'excluir') return excluir([t], () => VP.app.ir('#tumulos'));
          if (a === 'etiqueta') return lote('etiquetas', [t]);
          if (a === 'observacao') return ui.formulario({ titulo: 'Observação', largura: 'pequena', campos: [{ chave: 'texto', rotulo: 'Observação', tipo: 'area', obrigatorio: true }], salvar: async (x) => { await VP.db.gravar('eventos', VP.novoEvento(t.id, 'observacao', { descricao: x.texto })); recarrega(); } });
          if (a === 'local') return informarLocal(t, recarrega);
          if (a === 'gps') {
            if (!navigator.geolocation) return ui.aviso('Este aparelho não tem GPS disponível.', 'erro');
            navigator.geolocation.getCurrentPosition(async (p) => {
              await gravarGeo(t, { lat: p.coords.latitude, lon: p.coords.longitude, precisao: Math.round(p.coords.accuracy * 10) / 10, fonte: 'gps-celular' });
              ui.aviso(`Posição aproximada gravada (erro de até ${Math.round(p.coords.accuracy)} m).`); recarrega();
            }, () => ui.aviso('Não foi possível ler o GPS.', 'erro'), { enableHighAccuracy: true, timeout: 15000 });
          }
        }));
      }
    };
  };
  const gravarGeo = (t, geo, loteId = null) => {
    const antes = t.geo || null;
    t.geo = Object.assign({ data: VP.Plataforma.hoje(), poligono: null }, geo);
    return VP.db.gravarVarias({ tumulos: [t], eventos: [VP.novoEvento(t.id, 'georreferenciamento', { loteId, descricao: `${L.fontesGeo[geo.fonte] || geo.fonte}: ${geo.lat.toFixed(7)}, ${geo.lon.toFixed(7)}${geo.precisao != null ? ` (±${geo.precisao} m)` : ''}`, extra: { antes } })] });
  };
  const informarLocal = (t, depois) => ui.formulario({
    titulo: 'Informar localização', largura: 'pequena',
    intro: '<p class="ajuda">Use quando a empresa enviar a coordenada de um túmulo só. Para muitos túmulos de uma vez, use o menu Localização → Importar levantamento.</p>',
    campos: [{ chave: 'lat', rotulo: 'Latitude (ex.: -27,2140123)', obrigatorio: true }, { chave: 'lon', rotulo: 'Longitude (ex.: -49,6431234)', obrigatorio: true }, { chave: 'precisao', rotulo: 'Precisão (metros)', tipo: 'numero' }, { chave: 'fonte', rotulo: 'Origem', tipo: 'select', vazio: false, opcoes: Object.entries(L.fontesGeo), padrao: 'levantamento' }],
    salvar: async (x) => {
      const lat = u.num(x.lat), lon = u.num(x.lon);
      const erro = VP.validarCoordenada(lat, lon);
      if (erro) return erro;
      await gravarGeo(t, { lat, lon, precisao: x.precisao, fonte: x.fonte });
      ui.aviso('Localização gravada.'); depois();
    }
  });

  // ===================================================================== IMPORTAR PLANILHA (De/Para com área de espera e prévia — A2.2)
  const CAMPOS_IMPORT = [
    ['numero', 'Número / sepultura (obrigatório)'], ['aleia', 'Aléia'], ['quadra', 'Quadra'], ['tipo', 'Tipo'],
    ['comprimento', 'Comprimento'], ['largura', 'Largura'], ['observacao', 'Observação']];
  const achaCabecalho = (linhas) => {
    for (let i = 0; i < Math.min(12, linhas.length); i++) if ((linhas[i] || []).some((c) => /sepult|n[uú]mero|cova|jazigo/i.test(String(c)))) return i;
    return -1;
  };
  const sugerir = (cabecalhos, campo) => {
    const regras = { numero: /sepult|n[uú]mero|cova/i, aleia: /al[eé]ia/i, quadra: /^quadra/i, tipo: /^tipo/i, comprimento: /comp/i, largura: /larg/i, observacao: /obs/i };
    return cabecalhos.find((h) => regras[campo].test(h)) || '';
  };
  T.importar = () => {
    const st = VP.estado.importacao = VP.estado.importacao || {};
    const desenhar = () => {
      const hist = VP.db.lista('importacoes').sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      const abasValidas = (st.abas || []).filter((a) => a.cab >= 0);
      const cabecalhos = [...new Set(abasValidas.flatMap((a) => (a.linhas[a.cab] || []).map((c) => String(c)).filter(Boolean)))];
      const modelos = ui.pref.ler('modelos-depara', {});
      return `
        <section class="cartao"><h3>1. Arquivo (fica numa área de espera; nada é gravado ainda)</h3>
          <p class="ajuda">Planilha .xlsx (todas as abas) ou .csv. Exemplo: a "lista de chãos" limpa (quadra = nome da aba; colunas Sepultura e Aléia).</p>
          <div class="linha-botoes"><label class="botao primario">Escolher planilha<input type="file" accept=".xlsx,.csv" data-arquivo hidden></label>
          <label>Cemitério <select data-cemiterio>${opc('cemiterios').map(([id, n]) => `<option value="${id}" ${id === st.cemiterioId ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>
          ${st.nomeArquivo ? `<p><b>${esc(st.nomeArquivo)}</b>: ${st.abas.length} aba(s), ${abasValidas.length} com cabeçalho reconhecido, ${u.inteiro(abasValidas.reduce((t, a) => t + a.linhas.length - a.cab - 1, 0))} linhas.</p>` : ''}
        </section>
        ${st.abas ? `<section class="cartao"><h3>2. Ligar as colunas (De/Para)</h3>
          ${Object.keys(modelos).length ? `<p>Modelo salvo: <select data-modelo-depara><option value="">—</option>${Object.keys(modelos).map((m) => `<option>${esc(m)}</option>`).join('')}</select></p>` : ''}
          <div class="form-grade">${CAMPOS_IMPORT.map(([k, n]) => `<div class="campo meia"><label>${esc(n)}</label><select data-mapa="${k}"><option value="">— não usar —</option>${k === 'quadra' ? `<option value="__aba" ${st.mapa?.quadra === '__aba' ? 'selected' : ''}>Nome da aba</option>` : ''}${cabecalhos.map((h) => `<option ${st.mapa?.[k] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>`).join('')}</div>
          <p><label>Salvar esta ligação como modelo <input data-nome-modelo placeholder="Ex.: Lista de chãos — layout limpo"></label></p>
          <h4>Abas</h4><div class="lista-marcar">${st.abas.map((a, i) => `<label><input type="checkbox" data-aba="${i}" ${a.usar ? 'checked' : ''} ${a.cab < 0 ? 'disabled' : ''}> ${esc(a.nome)} <small>(${a.cab < 0 ? 'sem cabeçalho' : u.inteiro(a.linhas.length - a.cab - 1) + ' linhas'})</small></label>`).join('')}</div>
          <button class="botao primario" data-previa>3. Gerar prévia</button>
        </section>` : ''}
        ${st.previa ? previaHtml(st.previa) : ''}
        <section class="cartao"><h3>Importações feitas</h3>
          <table class="tabela"><thead><tr><th>Quando</th><th>Arquivo</th><th class="num">Novos</th><th class="num">Alterados</th><th class="num">Conflitos</th><th>Situação</th><th></th></tr></thead><tbody>
          ${hist.map((i) => `<tr><td>${u.data(i.criadoEm)}</td><td>${esc(i.arquivo)} <small>${esc(i.tipo === 'levantamento' ? '(localização)' : '')}</small></td><td class="num">${u.inteiro((i.novos || []).length)}</td><td class="num">${u.inteiro((i.alterados || []).length)}</td><td class="num">${u.inteiro((i.conflitos || []).length)}</td><td>${i.situacao === 'aplicada' ? 'Aplicada' : 'Desfeita'}</td><td>${i.situacao === 'aplicada' ? `<button class="botao pequeno" data-desfazer="${esc(i.id)}">Desfazer</button>` : ''} ${(i.conflitos || []).length ? `<button class="botao pequeno" data-conflitos="${esc(i.id)}">Ver conflitos</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhuma.</td></tr>'}
          </tbody></table></section>`;
    };
    const previaHtml = (p) => `<section class="cartao" id="previa"><h3>4. Prévia (nada gravado ainda)</h3>
        <div class="resumo-linha">${['novo', 'igual', 'alterado', 'conflito', 'erro'].map((k) => G.numero({ novo: 'Novos', igual: 'Iguais (ignorados)', alterado: 'Alterados', conflito: 'Conflitos', erro: 'Erros' }[k], u.inteiro(p.linhas.filter((l) => l.classe === k).length))).join('')}</div>
        ${p.quadrasNovas.length ? `<p class="aviso-inline">Serão criadas ${p.quadrasNovas.length} quadra(s): ${esc(p.quadrasNovas.join(', '))}.</p>` : ''}
        <label class="linha-check"><input type="checkbox" data-aplicar="novo" checked> Criar os túmulos novos</label>
        <label class="linha-check"><input type="checkbox" data-aplicar="alterado" checked> Atualizar os alterados (o valor anterior vai para o histórico)</label>
        <p class="ajuda">Conflitos (o mesmo túmulo duas vezes no arquivo) e erros não são gravados; ficam listados para revisão.</p>
        ${ui.tabela({ id: 'previa-imp', linhas: p.linhas, porPagina: 100, nomePlanilha: 'previa-importacao', chave: 'n', colunas: [
          { chave: 'classe', titulo: 'Resultado', html: (l) => `<span class="selo-status imp-${l.classe}">${esc({ novo: 'Novo', igual: 'Igual', alterado: 'Alterado', conflito: 'Conflito', erro: 'Erro' }[l.classe])}</span>`, valor: (l) => l.classe },
          { chave: 'origem', titulo: 'Origem', valor: (l) => `${l.aba} · linha ${l.linha}` },
          { chave: 'quadra', titulo: 'Quadra' }, { chave: 'aleia', titulo: 'Aléia' }, { chave: 'numero', titulo: 'Número' },
          { chave: 'detalhe', titulo: 'Detalhe', valor: (l) => l.detalhe || '' }] })}
        <button class="botao primario grande" data-aplicar-imp>Aplicar importação</button></section>`;
    const lerMapa = () => {
      const a = document.getElementById('area-imp');
      st.mapa = Object.fromEntries([...a.querySelectorAll('[data-mapa]')].map((s) => [s.dataset.mapa, s.value]));
      a.querySelectorAll('[data-aba]').forEach((c) => { st.abas[+c.dataset.aba].usar = c.checked; });
    };
    const gerarPrevia = () => {
      lerMapa();
      if (!st.mapa.numero) return ui.aviso('Ligue a coluna do número.', 'erro');
      const cemId = st.cemiterioId || VP.db.lista('cemiterios')[0]?.id;
      const linhas = [];
      const vistas = new Map();
      const quadrasNovas = new Set();
      let n = 0;
      for (const aba of st.abas.filter((x) => x.usar && x.cab >= 0)) {
        const cab = aba.linhas[aba.cab].map((c) => String(c));
        const col = (campo) => (st.mapa[campo] && st.mapa[campo] !== '__aba' ? cab.indexOf(st.mapa[campo]) : -1);
        for (let i = aba.cab + 1; i < aba.linhas.length; i++) {
          const r = aba.linhas[i] || [];
          const pega = (c) => (col(c) >= 0 ? String(r[col(c)] ?? '').trim() : '');
          const numero = pega('numero');
          if (!numero && r.every((x) => x === '' || x == null)) continue;
          const quadra = st.mapa.quadra === '__aba' ? aba.nome : pega('quadra');
          const l = { n: ++n, aba: aba.nome, linha: i + 1, quadra, aleia: pega('aleia'), numero, tipoTxt: pega('tipo'), comprimento: u.num(pega('comprimento')), largura: u.num(pega('largura')), observacao: pega('observacao') };
          if (!numero) { l.classe = 'erro'; l.detalhe = 'Sem número'; linhas.push(l); continue; }
          if (/^(sepultura|quadra)/i.test(numero) || !/\d/.test(numero)) { l.classe = 'erro'; l.detalhe = 'Não parece número de túmulo (cabeçalho repetido ou texto)'; linhas.push(l); continue; }
          if (!quadra) { l.classe = 'erro'; l.detalhe = 'Sem quadra'; linhas.push(l); continue; }
          if (/jazig/i.test(numero) || /jazig/i.test(l.tipoTxt)) l.tipo = 'jazigo'; else if (/gavet/i.test(l.tipoTxt) || /gavet/i.test(quadra)) l.tipo = 'gaveta'; else if (/oss[aá]r/i.test(l.tipoTxt)) l.tipo = 'ossario'; else if (l.tipoTxt) l.tipo = 'sepultura';
          const chave = VP.chaveTumulo(cemId, quadra, l.aleia, numero);
          if (vistas.has(chave)) { l.classe = 'conflito'; l.detalhe = `Repetido no arquivo (já na linha ${vistas.get(chave).linha} da aba ${vistas.get(chave).aba})`; linhas.push(l); continue; }
          vistas.set(chave, l);
          const existe = VP.acharTumulo(chave);
          if (!existe) {
            l.classe = 'novo';
            if (!VP.db.lista('quadras').some((q) => q.cemiterioId === cemId && VP.normQuadra(q.nome) === VP.normQuadra(quadra))) quadrasNovas.add(quadra);
          } else {
            l.existeId = existe.id;
            const dif = [];
            if (l.tipo && existe.tipo !== l.tipo) dif.push(`tipo: ${L.tipos[existe.tipo]} → ${L.tipos[l.tipo]}`);
            if (l.comprimento != null && existe.comprimento !== l.comprimento) dif.push(`comprimento: ${existe.comprimento ?? '—'} → ${l.comprimento}`);
            if (l.largura != null && existe.largura !== l.largura) dif.push(`largura: ${existe.largura ?? '—'} → ${l.largura}`);
            if (l.observacao && existe.observacao !== l.observacao) dif.push('observação');
            l.classe = dif.length ? 'alterado' : 'igual';
            l.detalhe = dif.join('; ');
          }
          linhas.push(l);
        }
      }
      st.previa = { linhas, quadrasNovas: [...quadrasNovas], cemiterioId: cemId };
      const nome = document.querySelector('[data-nome-modelo]')?.value.trim();
      if (nome) { const m = ui.pref.ler('modelos-depara', {}); m[nome] = st.mapa; ui.pref.gravar('modelos-depara', m); }
      atualizar();
      document.getElementById('previa')?.scrollIntoView();
    };
    const aplicar = async () => {
      const p = st.previa;
      const usar = Object.fromEntries([...document.querySelectorAll('[data-aplicar]')].map((c) => [c.dataset.aplicar, c.checked]));
      const loteId = 'imp-' + u.id();
      const quadras = [], tumulos = [], eventos = [], alterados = [];
      const pegaQuadra = (nome) => {
        let q = VP.db.lista('quadras').concat(quadras).find((x) => x.cemiterioId === p.cemiterioId && VP.normQuadra(x.nome) === VP.normQuadra(nome));
        if (!q) {
          const ordem = VP.db.lista('quadras', true).length + quadras.length + 1;
          q = { id: u.id(), cemiterioId: p.cemiterioId, nome, codigo: (String(nome).match(/\d+\s*[A-Z]?/i)?.[0] || String(ordem)).replace(/\s+/g, ''), tipo: /gavet/i.test(nome) ? 'gaveteiro' : /crian|infant/i.test(nome) ? 'infantil' : 'comum', ordem, geo: null, loteId };
          quadras.push(q);
        }
        return q;
      };
      for (const l of p.linhas) {
        if (l.classe === 'novo' && usar.novo) {
          const q = pegaQuadra(l.quadra);
          const t = { id: u.id(), cemiterioId: p.cemiterioId, quadraId: q.id, aleia: l.aleia, numero: l.numero, tipo: l.tipo || (q.tipo === 'gaveteiro' ? 'gaveta' : 'sepultura'), ocupacao: 'nao-informado', comprimento: l.comprimento, largura: l.largura, observacao: l.observacao, fotos: [], anexos: [], qrAfixado: false, geo: null, criadoEm: VP.Plataforma.agoraISO(), loteId };
          tumulos.push(t);
          eventos.push(VP.novoEvento(t.id, 'importacao', { loteId, descricao: `Criado pela importação de ${st.nomeArquivo} (${l.aba}, linha ${l.linha})` }));
        } else if (l.classe === 'alterado' && usar.alterado) {
          const t = VP.db.pega('tumulos', l.existeId);
          const antes = { tipo: t.tipo, comprimento: t.comprimento, largura: t.largura, observacao: t.observacao };
          if (l.tipo) t.tipo = l.tipo;
          if (l.comprimento != null) t.comprimento = l.comprimento;
          if (l.largura != null) t.largura = l.largura;
          if (l.observacao) t.observacao = l.observacao;
          tumulos.push(t);
          alterados.push({ id: t.id, antes });
          eventos.push(VP.novoEvento(t.id, 'importacao', { loteId, descricao: `Atualizado pela importação de ${st.nomeArquivo}: ${l.detalhe}`, extra: { antes } }));
        }
      }
      const reg = { id: loteId, tipo: 'planilha', arquivo: st.nomeArquivo, criadoEm: VP.Plataforma.agoraISO(), situacao: 'aplicada', novos: tumulos.filter((t) => t.loteId === loteId).map((t) => t.id), alterados, quadrasCriadas: quadras.map((q) => q.id), conflitos: p.linhas.filter((l) => l.classe === 'conflito').map((l) => ({ aba: l.aba, linha: l.linha, quadra: l.quadra, aleia: l.aleia, numero: l.numero, detalhe: l.detalhe })), erros: p.linhas.filter((l) => l.classe === 'erro').length };
      await VP.db.gravarVarias({ quadras, tumulos, eventos, importacoes: [reg] });
      const falhas = p.linhas.filter((l) => l.classe === 'conflito' || l.classe === 'erro').map((l) => ({ item: `${l.aba}, linha ${l.linha} (${l.quadra} · ${l.aleia} · ${l.numero})`, motivo: l.detalhe }));
      ui.resultado({ titulo: 'Importação aplicada', sucesso: [`${reg.novos.length} túmulos criados`, `${alterados.length} túmulos atualizados`, `${quadras.length} quadras criadas`, `${p.linhas.filter((l) => l.classe === 'igual').length} linhas iguais ignoradas`], falhas });
      st.previa = null; st.abas = null; st.nomeArquivo = null;
      atualizar();
    };
    const desfazer = async (id) => {
      const reg = VP.db.pega('importacoes', id);
      if (!await ui.confirmar(`Desfazer a importação de <b>${esc(reg.arquivo)}</b>? Os túmulos criados vão para a Lixeira e os alterados voltam ao valor anterior. Nada é apagado.`, { sim: 'Desfazer', classe: 'perigo' })) return;
      const tumulos = [], quadras = [], eventos = [];
      for (const tid of reg.novos || []) { const t = VP.db.pega('tumulos', tid); if (t) { t.excluido = true; t.excluidoEm = VP.Plataforma.agoraISO(); tumulos.push(t); } }
      for (const a of reg.alterados || []) {
        const t = VP.db.pega('tumulos', a.id); if (!t) continue;
        if (reg.tipo === 'levantamento') t.geo = a.antes; else Object.assign(t, a.antes);
        tumulos.push(t);
        eventos.push(VP.novoEvento(t.id, 'alteracao', { descricao: `Importação ${reg.arquivo} desfeita`, extra: { loteDesfeito: reg.id } }));
      }
      for (const qid of reg.quadrasCriadas || []) { const q = VP.db.pega('quadras', qid); if (q && !VP.db.lista('tumulos').some((t) => t.quadraId === qid && !tumulos.includes(t))) { q.excluido = true; q.excluidoEm = VP.Plataforma.agoraISO(); quadras.push(q); } }
      reg.situacao = 'desfeita'; reg.desfeitaEm = VP.Plataforma.agoraISO();
      await VP.db.gravarVarias({ tumulos, quadras, eventos, importacoes: [reg] });
      ui.aviso('Importação desfeita.');
      atualizar();
    };
    // A pessoa pode ter mudado de tela enquanto uma importação grande gravava
    const atualizar = () => { const a = document.getElementById('area-imp'); if (!a) return; a.innerHTML = desenhar(); ligar(); };
    const ligar = () => {
      const a = document.getElementById('area-imp');
      if (st.previa) ui.ligarTabela('previa-imp');
      a.querySelector('[data-arquivo]').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const abas = await VP.lerArquivoPlanilha(f);
          st.abas = abas.map((x) => { const cab = achaCabecalho(x.linhas); return Object.assign(x, { cab, usar: cab >= 0 }); });
          st.nomeArquivo = f.name; st.previa = null;
          const cabs = [...new Set(st.abas.filter((x) => x.cab >= 0).flatMap((x) => x.linhas[x.cab].map(String)))];
          st.mapa = Object.fromEntries(CAMPOS_IMPORT.map(([k]) => [k, sugerir(cabs, k)]));
          if (!st.mapa.quadra) st.mapa.quadra = '__aba';
          atualizar();
        } catch (err) { ui.aviso('Não foi possível ler a planilha: ' + err.message, 'erro'); }
      });
      a.querySelector('[data-cemiterio]').addEventListener('change', (e) => { st.cemiterioId = e.target.value; });
      a.querySelector('[data-modelo-depara]')?.addEventListener('change', (e) => { const m = ui.pref.ler('modelos-depara', {})[e.target.value]; if (m) { st.mapa = m; atualizar(); } });
      a.querySelector('[data-previa]')?.addEventListener('click', gerarPrevia);
      a.querySelector('[data-aplicar-imp]')?.addEventListener('click', aplicar);
      a.querySelectorAll('[data-desfazer]').forEach((b) => b.addEventListener('click', () => desfazer(b.dataset.desfazer)));
      a.querySelectorAll('[data-conflitos]').forEach((b) => b.addEventListener('click', () => {
        const reg = VP.db.pega('importacoes', b.dataset.conflitos);
        ui.modal({ titulo: 'Conflitos para revisar', largura: 'grande', corpo: `<p class="ajuda">O mesmo túmulo apareceu mais de uma vez no arquivo. Só a primeira linha foi usada; confira na planilha original.</p><table class="tabela"><thead><tr><th>Aba</th><th>Linha</th><th>Quadra</th><th>Aléia</th><th>Número</th><th>Detalhe</th></tr></thead><tbody>${reg.conflitos.map((c) => `<tr><td>${esc(c.aba)}</td><td>${c.linha}</td><td>${esc(c.quadra)}</td><td>${esc(c.aleia)}</td><td>${esc(c.numero)}</td><td>${esc(c.detalhe)}</td></tr>`).join('')}</tbody></table>`, botoes: [{ texto: 'Baixar lista', fecha: false, acao: () => { ui.baixarCSV('conflitos', ['Aba', 'Linha', 'Quadra', 'Aléia', 'Número', 'Detalhe'], reg.conflitos.map((c) => [c.aba, c.linha, c.quadra, c.aleia, c.numero, c.detalhe])); return false; } }, { texto: 'Fechar', classe: 'primario' }] });
      }));
    };
    return { titulo: 'Importar planilha', html: `<div id="area-imp">${desenhar()}</div>`, ligar };
  };

  // ===================================================================== LOCALIZAÇÃO EXATA (pronto para o levantamento da empresa)
  T.levantamento = () => {
    const r = VP.resumo();
    const porQuadra = VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem).map((q) => { const l = VP.db.lista('tumulos').filter((t) => t.quadraId === q.id); return { rotulo: q.nome, a: l.filter(VP.coordenadaExata).length, b: l.filter((t) => !VP.coordenadaExata(t)).length }; }).filter((x) => x.a + x.b);
    const comCoord = VP.db.lista('tumulos').filter(VP.temCoordenada);
    return {
      titulo: 'Localização exata (levantamento)',
      acoes: '<button class="botao" data-modelo-lev>Baixar lista para a empresa</button> <label class="botao primario">Importar levantamento<input type="file" accept=".csv,.geojson,.json" data-arquivo-lev hidden></label>',
      html: `
        <div class="resumo-linha">${G.numero('Com localização exata', u.inteiro(r.exata), u.pct(r.total ? r.exata / r.total : 0))}${G.numero('Aproximada (GPS do celular ou à mão)', u.inteiro(r.comCoordenada - r.exata))}${G.numero('Aguardando levantamento', u.inteiro(r.total - r.comCoordenada))}${G.numero('Quadras com contorno', u.inteiro(VP.db.lista('quadras').filter((q) => q.geo?.poligono).length))}</div>
        <section class="cartao"><h3>Como funciona</h3>
          <ol class="lista-simples">
            <li><b>Baixar lista para a empresa:</b> sai uma planilha com todos os túmulos (quadra, aléia, número e código do QR) e colunas vazias de latitude, longitude e precisão.</li>
            <li>A empresa especializada mede cada túmulo (drone, GNSS de precisão) e devolve <b>a mesma planilha preenchida</b> (CSV) ou um arquivo <b>GeoJSON</b> com pontos ou contornos dos túmulos e das quadras.</li>
            <li><b>Importar levantamento:</b> o sistema mostra a prévia (encontrados, não encontrados, coordenadas que serão trocadas, erros) e só grava quando você confirmar. A coordenada antiga vai para o histórico, e dá para desfazer.</li>
            <li>Coordenada com precisão de até <b>${String(VP.config().precisaoMaximaLevantamento).replace('.', ',')} m</b> conta como exata (ajustável em Configurações). O GPS do celular erra de 3 a 15 m e fica marcado como aproximado.</li>
          </ol>
          <p class="ajuda">Formato CSV: <code>quadra;aleia;numero;latitude;longitude;precisao_m</code> (decimal com vírgula ou ponto). GeoJSON: cada feição com <code>properties</code> {quadra, aleia, numero} para túmulo, ou {tipo: "quadra", quadra} para o contorno de uma quadra; geometria Point ou Polygon (WGS84, longitude e latitude).</p>
          <p class="ajuda">A foto aérea (ortofoto) do cemitério e o ponto central ficam no cadastro do cemitério, prontos para o mapa com fundo de satélite.</p>
        </section>
        <section class="cartao"><h3>Por quadra</h3>${G.empilhadas(porQuadra, ['Com localização exata', 'Falta'])}</section>
        ${comCoord.length ? `<p><button class="botao" data-kml>Baixar para o Google Earth (KML)</button> <span class="ajuda">${u.inteiro(comCoord.length)} túmulos com coordenada.</span></p>` : ''}`,
      ligar() {
        document.querySelector('[data-modelo-lev]').addEventListener('click', () => ui.baixarCSV('levantamento-tumulos', ['quadra', 'aleia', 'numero', 'codigo_qr', 'latitude', 'longitude', 'precisao_m'], VP.ordenarTumulos(VP.db.lista('tumulos')).map((t) => [VP.nome('quadras', t.quadraId), t.aleia, t.numero, VP.codigoTumulo(t), t.geo?.lat ?? '', t.geo?.lon ?? '', t.geo?.precisao ?? ''])));
        document.querySelector('[data-arquivo-lev]').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) importarLevantamento(f); e.target.value = ''; });
        document.querySelector('[data-kml]')?.addEventListener('click', () => {
          const pts = VP.ordenarTumulos(VP.db.lista('tumulos').filter(VP.temCoordenada));
          const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(VP.nomeEntidade())} — túmulos</name>${pts.map((t) => `<Placemark><name>${esc(VP.codigoTumulo(t))}</name><description>${esc(`${VP.rotuloTumulo(t)} · ${L.ocupacao[t.ocupacao]} · ${L.fontesGeo[t.geo.fonte] || ''}`)}</description><Point><coordinates>${t.geo.lon},${t.geo.lat},0</coordinates></Point></Placemark>`).join('')}</Document></kml>`;
          ui.baixar(`tumulos-${VP.Plataforma.hoje()}.kml`, kml, 'application/vnd.google-earth.kml+xml');
        });
      }
    };
  };
  const importarLevantamento = async (arquivo) => {
    const cemId = VP.db.lista('cemiterios')[0]?.id;
    const itens = []; // {tipo:'tumulo'|'quadra', quadra, aleia, numero, lat, lon, precisao, poligono, origem}
    try {
      if (/\.(geo)?json$/i.test(arquivo.name)) {
        const gj = JSON.parse(await arquivo.text());
        (gj.features || []).forEach((f, i) => {
          const pr = f.properties || {};
          const g = f.geometry || {};
          let lat = null, lon = null, poligono = null;
          if (g.type === 'Point') { lon = g.coordinates[0]; lat = g.coordinates[1]; }
          else if (g.type === 'Polygon') { poligono = g.coordinates[0].map(([x, y]) => [y, x]); const c = VP.centroide(poligono); lat = c?.lat; lon = c?.lon; }
          itens.push({ tipo: u.normalizar(pr.tipo) === 'quadra' ? 'quadra' : 'tumulo', quadra: pr.quadra, aleia: pr.aleia ?? pr['aléia'] ?? '', numero: pr.numero ?? pr['número'] ?? '', lat, lon, precisao: u.num(pr.precisao_m ?? pr.precisao), poligono, origem: `feição ${i + 1}` });
        });
      } else {
        const [aba] = VP.lerCSV(await arquivo.text());
        const cab = aba.linhas[0].map((c) => u.normalizar(c));
        const i = (n) => cab.findIndex((c) => c.startsWith(n));
        aba.linhas.slice(1).forEach((l, k) => itens.push({ tipo: 'tumulo', quadra: l[i('quadra')], aleia: l[i('aleia')] ?? '', numero: l[i('numero')], lat: u.num(l[i('latitude')]), lon: u.num(l[i('longitude')]), precisao: u.num(l[i('precisao')]), origem: `linha ${k + 2}` }));
      }
    } catch (e) { return ui.aviso('Não foi possível ler o arquivo: ' + e.message, 'erro'); }
    const grupos = { aplicar: [], trocar: [], naoAchados: [], erros: [], quadras: [], semCoord: 0 };
    for (const it of itens) {
      if (it.lat == null && it.lon == null) { grupos.semCoord++; continue; }
      const erro = VP.validarCoordenada(it.lat, it.lon);
      if (erro) { grupos.erros.push({ item: `${it.origem} (${it.quadra || ''} ${it.aleia || ''} ${it.numero || ''})`, motivo: erro }); continue; }
      if (it.tipo === 'quadra') {
        const q = VP.db.lista('quadras').find((x) => VP.normQuadra(x.nome) === VP.normQuadra(it.quadra));
        if (q) grupos.quadras.push({ q, it }); else grupos.naoAchados.push({ item: `${it.origem}: quadra ${it.quadra}`, motivo: 'Quadra não cadastrada' });
        continue;
      }
      const t = VP.acharTumulo(VP.chaveTumulo(cemId, it.quadra, it.aleia, it.numero));
      if (!t) { grupos.naoAchados.push({ item: `${it.origem}: ${it.quadra} · ${it.aleia} · ${it.numero}`, motivo: 'Túmulo não cadastrado (importe a planilha antes ou confira a numeração)' }); continue; }
      (VP.temCoordenada(t) ? grupos.trocar : grupos.aplicar).push({ t, it });
    }
    ui.modal({
      titulo: 'Prévia do levantamento (nada gravado ainda)', largura: 'media',
      corpo: `<div class="resumo-linha">${G.numero('Túmulos que recebem localização', u.inteiro(grupos.aplicar.length))}${G.numero('Túmulos que trocam a localização', u.inteiro(grupos.trocar.length))}${G.numero('Contornos de quadra', u.inteiro(grupos.quadras.length))}${G.numero('Não encontrados', u.inteiro(grupos.naoAchados.length))}${G.numero('Com erro', u.inteiro(grupos.erros.length))}</div>
        ${grupos.semCoord ? `<p class="ajuda">${grupos.semCoord} linha(s) sem coordenada foram ignoradas.</p>` : ''}
        ${grupos.trocar.length ? '<label class="linha-check"><input type="checkbox" data-trocar checked> Trocar as localizações que já existem (a anterior fica no histórico)</label>' : ''}`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Gravar localizações', classe: 'primario', acao: async (d) => {
        const trocar = d.querySelector('[data-trocar]')?.checked !== false;
        const loteId = 'lev-' + u.id();
        const tumulos = [], eventos = [], alterados = [], quadras = [];
        for (const { t, it } of grupos.aplicar.concat(trocar ? grupos.trocar : [])) {
          alterados.push({ id: t.id, antes: t.geo || null });
          t.geo = { lat: it.lat, lon: it.lon, precisao: it.precisao, fonte: 'levantamento', data: VP.Plataforma.hoje(), poligono: it.poligono || null };
          tumulos.push(t);
          eventos.push(VP.novoEvento(t.id, 'georreferenciamento', { loteId, descricao: `Levantamento ${arquivo.name}: ${it.lat}, ${it.lon}${it.precisao != null ? ` (±${it.precisao} m)` : ''}`, extra: { antes: alterados[alterados.length - 1].antes } }));
        }
        for (const { q, it } of grupos.quadras) { q.geo = { poligono: it.poligono, lat: it.lat, lon: it.lon, fonte: 'levantamento', data: VP.Plataforma.hoje() }; quadras.push(q); }
        await VP.db.gravarVarias({ tumulos, eventos, quadras, importacoes: [{ id: loteId, tipo: 'levantamento', arquivo: arquivo.name, criadoEm: VP.Plataforma.agoraISO(), situacao: 'aplicada', novos: [], alterados, quadrasCriadas: [], conflitos: [] }] });
        ui.resultado({ titulo: 'Levantamento gravado', sucesso: tumulos.map(VP.rotuloTumulo).concat(quadras.map((q) => 'Contorno: ' + q.nome)), falhas: grupos.naoAchados.concat(grupos.erros) });
        VP.app.render();
      } }]
    });
  };

  // ===================================================================== RELATÓRIOS
  T.relatorios = () => ({
    titulo: 'Relatórios',
    html: `<div class="galeria">
      <a class="cartao-relatorio" href="#relatorio/ocupacao"><b>Ocupação por quadra</b><span>Ocupados, vagos e reservados, por quadra e por tipo.</span></a>
      <a class="cartao-relatorio" href="#levantamento"><b>Localização exata</b><span>Andamento do levantamento por quadra e arquivo para o Google Earth.</span></a>
      <a class="cartao-relatorio" href="#relatorio/triagem"><b>Triagem de abandono por quadra</b><span>Vistoriados, atenção, indício, em apuração e declarados.</span></a>
      <a class="cartao-relatorio" href="#ordens"><b>Ordens de serviço</b><span>Abertas, atrasadas e pedidos da família, com lista para imprimir.</span></a>
      <a class="cartao-relatorio" href="#vagas"><b>Painel de vagas</b><span>Vagas por tipo e quadra, sepultamentos por mês, previsão em 3 cenários e vagas que podem voltar.</span></a>
      <a class="cartao-relatorio" href="#sepultamentos"><b>Agenda de sepultamentos</b><span>Agendados por dia, para imprimir.</span></a>
      <a class="cartao-relatorio" href="#relatorio/fotografico"><b>Relatório fotográfico com mapa</b><span>Fotos de cada túmulo, situação, última vistoria e mapa dos pontos, por quadra.</span></a>
      <a class="cartao-relatorio" href="#mapa/real"><b>Mapa sobre a imagem</b><span>Túmulos com coordenada sobre a foto aérea ou o mapa de ruas, com link para o Google Maps.</span></a>
      <a class="cartao-relatorio" href="#relatorio/etiquetas"><b>Etiquetas QR dos túmulos</b><span>Plaquetas prontas para imprimir, por quadra ou aléia.</span></a>
    </div>`
  });
  T.relatorio = (chave) => {
    if (chave === 'etiquetas') return etiquetas();
    if (chave === 'triagem') return VP.etapa2.relatorioTriagem();
    if (chave === 'fotografico') return VP.mapaReal.relatorioFotos();
    const quadras = VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem);
    const linhas = quadras.map((q) => { const l = VP.db.lista('tumulos').filter((t) => t.quadraId === q.id); const r = VP.resumo(l); return Object.assign({ id: q.id, quadra: q.nome }, r, { taxa: r.total ? r.ocupado / r.total : 0 }); }).filter((x) => x.total);
    const r = VP.resumo();
    return {
      titulo: 'Ocupação por quadra',
      acoes: '<a class="botao" href="#relatorios">‹ Relatórios</a> <button class="botao primario" data-imprimir>Imprimir / PDF</button>',
      html: `<div id="corpo-relatorio">
        <div class="resumo-linha">${G.numero('Túmulos', u.inteiro(r.total))}${G.numero('Ocupados', u.inteiro(r.ocupado), u.pct(r.total ? r.ocupado / r.total : 0))}${G.numero('Vagos', u.inteiro(r.vago))}${G.numero('Reservados', u.inteiro(r.reservado))}${G.numero('Sem informação', u.inteiro(r['nao-informado']))}</div>
        <div class="grade-graficos"><section class="cartao"><h3>Ocupação por quadra</h3>${G.empilhadas(linhas.map((x) => ({ rotulo: x.quadra, a: x.ocupado, b: x.total - x.ocupado })), ['Ocupados', 'Livres ou sem informação'])}</section>
        <section class="cartao"><h3>Vagos por quadra</h3>${G.barrasH(linhas.map((x) => ({ rotulo: x.quadra, valor: x.vago, link: '#tumulos?quadraId=' + x.id + '&ocupacao=vago' })).sort((a, b) => b.valor - a.valor))}</section></div>
        ${ui.tabela({ id: 'rel-ocup', linhas, nomePlanilha: 'ocupacao-por-quadra', colunas: [{ chave: 'quadra', titulo: 'Quadra' }, { chave: 'total', titulo: 'Túmulos', num: true, soma: true }, { chave: 'ocupado', titulo: 'Ocupados', num: true, soma: true }, { chave: 'vago', titulo: 'Vagos', num: true, soma: true }, { chave: 'reservado', titulo: 'Reservados', num: true, soma: true }, { chave: 'nao-informado', titulo: 'Sem informação', num: true, soma: true }, { chave: 'taxa', titulo: 'Ocupação', num: true, valor: (x) => x.taxa, formato: u.pct }] })}</div>`,
      ligar() {
        ui.ligarTabela('rel-ocup');
        document.querySelector('[data-imprimir]').addEventListener('click', () => { const c = document.getElementById('corpo-relatorio').cloneNode(true); c.querySelectorAll('.tabela-barra,.paginacao').forEach((x) => x.remove()); ui.imprimir(c.innerHTML, 'Ocupação por quadra'); });
      }
    };
  };
  const etiquetas = () => {
    const ids = VP.estado.etiquetasIds;
    return {
      titulo: 'Etiquetas QR dos túmulos',
      acoes: '<a class="botao" href="#relatorios">‹ Relatórios</a>',
      html: `<div class="cartao">${ids ? `<p><b>${ids.length}</b> túmulos escolhidos. <button class="botao pequeno" data-limpar-ids>Escolher por quadra</button></p>` : ui.campos([{ chave: 'quadraId', rotulo: 'Quadra', tipo: 'select', opcoes: opc('quadras'), largura: 'meia' }, { chave: 'aleia', rotulo: 'Aléia (opcional)', largura: 'meia' }])}<button class="botao primario" data-gerar>Gerar etiquetas</button></div><div id="etq"></div>`,
      ligar() {
        document.querySelector('[data-limpar-ids]')?.addEventListener('click', () => { VP.estado.etiquetasIds = null; VP.app.render(); });
        document.querySelector('[data-gerar]').addEventListener('click', () => {
          const c = document.getElementById('conteudo');
          const lista = ids ? VP.ordenarTumulos(ids.map((id) => VP.db.pega('tumulos', id)).filter(Boolean)) : VP.filtrarTumulos(ui.limparValores({ quadraId: c.querySelector('[name=quadraId]').value, aleia: c.querySelector('[name=aleia]').value }));
          if (!lista.length) return ui.aviso('Nenhum túmulo.', 'erro');
          const html = `<div class="folha-etiquetas">${lista.map((t) => `<div class="etiqueta"><div class="etq-qr">${G.qr(VP.codigoQR(t), 2)}</div><div class="etq-txt"><small>${esc(VP.nome('cemiterios', t.cemiterioId))}</small><b class="${t.plaqueta != null ? 'etq-numero' : ''}">${esc(VP.codigoQR(t))}</b><span>${esc(VP.rotuloTumulo(t))}</span></div></div>`).join('')}</div>`;
          document.getElementById('etq').innerHTML = `<p><b>${lista.length}</b> etiquetas. <button class="botao primario" data-imp>Imprimir</button></p>${html}`;
          document.querySelector('[data-imp]').addEventListener('click', () => ui.imprimir(html, 'Etiquetas dos túmulos'));
        });
      }
    };
  };

  // ===================================================================== CADASTROS
  const CAD = {
    cemiterios: { titulo: 'Cemitérios', campos: () => [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'endereco', rotulo: 'Endereço' }, { chave: 'bairro', rotulo: 'Bairro', largura: 'meia' }, { chave: 'cidade', rotulo: 'Cidade', largura: 'meia' },
      { chave: 'geo.lat', rotulo: 'Ponto central: latitude', largura: 'meia' }, { chave: 'geo.lon', rotulo: 'Ponto central: longitude', largura: 'meia' },
      { chave: 'geo.ortofoto.url', rotulo: 'Foto aérea (ortofoto): endereço da imagem', ajuda: 'Entregue pela empresa do levantamento. Usada como fundo do mapa.' },
      { chave: 'geo.ortofoto.sul', rotulo: 'Limite sul (latitude)', largura: 'meia' }, { chave: 'geo.ortofoto.norte', rotulo: 'Limite norte (latitude)', largura: 'meia' },
      { chave: 'geo.ortofoto.oeste', rotulo: 'Limite oeste (longitude)', largura: 'meia' }, { chave: 'geo.ortofoto.leste', rotulo: 'Limite leste (longitude)', largura: 'meia' }],
    colunas: [{ chave: 'nome', titulo: 'Nome' }, { chave: 'bairro', titulo: 'Bairro' }, { chave: 'tum', titulo: 'Túmulos', num: true, valor: (c) => VP.db.lista('tumulos').filter((t) => t.cemiterioId === c.id).length }, { chave: 'geo', titulo: 'Ponto central', valor: (c) => (c.geo?.lat ? `${c.geo.lat}, ${c.geo.lon}` : '—') }, { chave: 'orto', titulo: 'Foto aérea', valor: (c) => (c.geo?.ortofoto?.url ? 'Sim' : 'Não') }] },
    funerarias: { titulo: 'Funerárias', campos: () => [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'cnpj', rotulo: 'CNPJ', largura: 'meia' }, { chave: 'telefone', rotulo: 'Telefone', largura: 'meia' },
      { chave: 'responsavel', rotulo: 'Responsável', largura: 'meia' }, { chave: 'email', rotulo: 'E-mail', largura: 'meia' }],
    colunas: [{ chave: 'nome', titulo: 'Nome' }, { chave: 'cnpj', titulo: 'CNPJ' }, { chave: 'telefone', titulo: 'Telefone' }, { chave: 'responsavel', titulo: 'Responsável' }, { chave: 'sep', titulo: 'Sepultamentos', num: true, valor: (f) => VP.db.lista('sepultamentos').filter((x) => x.funerariaId === f.id).length }] },
    quadras: { titulo: 'Quadras', campos: () => [
      { chave: 'cemiterioId', rotulo: 'Cemitério', tipo: 'select', opcoes: opc('cemiterios'), obrigatorio: true }, { chave: 'nome', rotulo: 'Nome', obrigatorio: true, largura: 'meia' }, { chave: 'codigo', rotulo: 'Código (vai no QR)', obrigatorio: true, largura: 'meia' },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposQuadra), vazio: false, largura: 'meia' }, { chave: 'ordem', rotulo: 'Ordem no mapa', tipo: 'numero', largura: 'meia' }],
    colunas: [{ chave: 'ordem', titulo: 'Ordem', num: true }, { chave: 'nome', titulo: 'Nome', html: (q) => `<a href="#mapa?quadra=${esc(q.id)}">${esc(q.nome)}</a>`, valor: (q) => q.nome }, { chave: 'codigo', titulo: 'Código' }, { chave: 'tipo', titulo: 'Tipo', valor: (q) => L.tiposQuadra[q.tipo] }, { chave: 'tum', titulo: 'Túmulos', num: true, valor: (q) => VP.db.lista('tumulos').filter((t) => t.quadraId === q.id).length }, { chave: 'cont', titulo: 'Contorno no mapa', valor: (q) => (q.geo?.poligono ? 'Sim' : 'Não') }] }
  };
  const pegaC = (o, c) => c.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  T.cadastros = (qual = 'quadras') => {
    const c = CAD[qual] || CAD.quadras;
    const lista = VP.db.lista(qual).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));
    const editar = (x) => {
      const valores = {}; for (const f of c.campos()) valores[f.chave] = pegaC(x || {}, f.chave);
      ui.formulario({ titulo: (x ? 'Editar: ' : 'Novo: ') + c.titulo, campos: c.campos(), valores, largura: 'media', salvar: async (v) => {
        const doc = x || { id: u.id() };
        Object.assign(doc, v);
        if (qual === 'cemiterios' && doc.geo) {
          for (const k of ['lat', 'lon']) doc.geo[k] = u.num(doc.geo[k]);
          if (doc.geo.ortofoto) for (const k of ['sul', 'norte', 'oeste', 'leste']) doc.geo.ortofoto[k] = u.num(doc.geo.ortofoto[k]);
          if (doc.geo.lat != null && VP.validarCoordenada(doc.geo.lat, doc.geo.lon)) return VP.validarCoordenada(doc.geo.lat, doc.geo.lon);
        }
        if (qual === 'quadras' && doc.ordem == null) doc.ordem = VP.db.lista('quadras', true).length + 1;
        await VP.db.gravar(qual, doc); ui.aviso('Salvo.'); VP.app.render();
      } });
    };
    return {
      titulo: 'Cadastros',
      acoes: '<button class="botao primario" data-novo>+ Novo</button>',
      html: `<nav class="abas">${Object.entries(CAD).map(([k, x]) => `<a href="#cadastros/${k}" class="${k === qual ? 'ativa' : ''}">${esc(x.titulo)}</a>`).join('')}</nav>
        ${ui.tabela({ id: 'cad-' + qual, linhas: lista, nomePlanilha: qual, colunas: c.colunas.concat([{ chave: '_a', titulo: '', html: (x) => `<button class="botao pequeno" data-editar="${esc(x.id)}">Editar</button> <button class="botao pequeno perigo" data-excluir="${esc(x.id)}">Excluir</button>` }]) })}`,
      ligar() {
        ui.ligarTabela('cad-' + qual);
        document.querySelector('[data-novo]').addEventListener('click', () => editar(null));
        // onclick (e não addEventListener): a área de conteúdo é a mesma entre telas, e o clique não pode acumular
        document.getElementById('conteudo').onclick = async (e) => {
          const ed = e.target.closest('[data-editar]'); if (ed) return editar(VP.db.pega(qual, ed.dataset.editar));
          const ex = e.target.closest('[data-excluir]'); if (!ex) return;
          const x = VP.db.pega(qual, ex.dataset.excluir);
          const uso = qual === 'funerarias' ? VP.db.lista('sepultamentos').filter((s) => s.funerariaId === x.id).length : VP.db.lista('tumulos').filter((t) => (qual === 'quadras' ? t.quadraId : t.cemiterioId) === x.id).length;
          if (uso) return ui.aviso(`Não dá para excluir: ${uso} ${qual === 'funerarias' ? 'sepultamento(s)' : 'túmulo(s)'} usam este cadastro.`, 'erro');
          if (!await ui.confirmar(`Mover <b>${esc(x.nome)}</b> para a Lixeira?`, { sim: 'Mover para a Lixeira', classe: 'perigo' })) return;
          x.excluido = true; x.excluidoEm = VP.Plataforma.agoraISO(); await VP.db.gravar(qual, x); VP.app.render();
        };
      }
    };
  };

  // ===================================================================== CONFIGURAÇÕES
  T.configuracoes = () => {
    const cfg = VP.config();
    const campos = [{ chave: 'entidade', rotulo: 'Nome da prefeitura (sai nos documentos)' }, { chave: 'precisaoMaximaLevantamento', rotulo: 'Precisão máxima para considerar a localização exata (metros)', tipo: 'numero', ajuda: 'Combine com a empresa do levantamento. Covas ficam a cerca de 1,5 m uma da outra.' },
      { chave: 'notaAtencao', rotulo: 'Triagem: soma das notas da vistoria para sugerir "Atenção" (0 a 16)', tipo: 'numero', largura: 'meia' },
      { chave: 'notaIndicio', rotulo: 'Triagem: soma das notas para sugerir "Indício de abandono" (0 a 16)', tipo: 'numero', largura: 'meia' },
      { chave: 'intervaloVistoriasDias', rotulo: 'Dias mínimos entre a 1ª e a 2ª vistoria para "Abandono em apuração"', tipo: 'numero', largura: 'meia', ajuda: 'O dossiê sugere de 90 a 180 dias. Confira a lei do município.' },
      { chave: 'prazoOrdemDias', rotulo: 'Prazo padrão das ordens de serviço (dias)', tipo: 'numero', largura: 'meia' },
      { chave: 'permanenciaAdultoAnos', rotulo: 'Permanência em gaveta: adulto (anos)', tipo: 'numero', largura: 'meia', ajuda: 'Padrão 5 (Rio do Sul). Confira a lei do município.' },
      { chave: 'permanenciaCriancaAnos', rotulo: 'Permanência em gaveta: criança (anos)', tipo: 'numero', largura: 'meia', ajuda: 'Padrão 3 (Rio do Sul).' },
      { chave: 'exumacaoMinimaAnos', rotulo: 'Exumação: mínimo de anos depois do sepultamento', tipo: 'numero', largura: 'meia', ajuda: 'Padrão 5 (referência: Bom Retiro). Ordem judicial ou policial não tem mínimo.' },
      { chave: 'guardaOssarioAnos', rotulo: 'Ossário: anos de guarda para a família retirar', tipo: 'numero', largura: 'meia', ajuda: 'Padrão 3 (referência: Joinville).' },
      { chave: 'limitePlaquetas', rotulo: 'Plaquetas: maior número permitido', tipo: 'numero', largura: 'meia', ajuda: 'Padrão 100.000. Os números vão de 000000 até este.' },
      { chave: 'prazoManifestacaoDias', rotulo: 'Processo: prazo para manifestação (dias)', tipo: 'numero', largura: 'meia', ajuda: 'Referências: Rio do Sul 15 úteis + 10 corridos; Joinville 30 úteis; Bom Retiro até 60.' },
      { chave: 'prazoManifestacaoUteis', rotulo: 'Processo: contar só dias úteis (segunda a sexta; feriados não descontados)', tipo: 'bool', largura: 'meia' },
      { chave: 'prazoTermoDias', rotulo: 'Processo: prazo padrão do termo de compromisso (dias)', tipo: 'numero', largura: 'meia' },
      { chave: 'exigirAvisoTumulo', rotulo: 'Processo: exigir aviso (placa com foto) no túmulo antes de declarar', tipo: 'bool', largura: 'meia' },
      { chave: 'exigirAR', rotulo: 'Processo: exigir carta com AR (pendência jurídica; hoje a prefeitura usa e-mail e WhatsApp)', tipo: 'bool' },
      { chave: 'leiPermiteRetomadaPerpetua', rotulo: 'A lei municipal permite retomar concessão perpétua por abandono', tipo: 'bool', ajuda: 'Deixe desmarcado até conferir a lei. Desmarcado, túmulo com concessão perpétua não passa a "Abandono em apuração".' }];
    return {
      titulo: 'Configurações',
      acoes: '<button class="botao primario" data-salvar>Salvar</button>',
      html: `<form id="form-cfg" class="cartao">${ui.campos(campos, cfg)}</form>
        <section class="cartao"><h3>Cópia de segurança</h3>${VP.servidor.ativo ? '<p class="ajuda">Os dados ficam guardados no servidor da prefeitura, com histórico de cada alteração. Você pode baixar uma cópia completa para guardar.</p><div class="linha-botoes"><button class="botao" data-backup>Baixar cópia completa</button></div>' : `<p class="ajuda">Nesta demonstração os dados ficam neste navegador.</p>
          <div class="linha-botoes"><button class="botao" data-backup>Baixar cópia completa</button><label class="botao">Restaurar cópia<input type="file" accept=".json" data-restaurar hidden></label><button class="botao perigo" data-reset>Voltar aos dados de exemplo</button></div>`}</section>`,
      ligar() {
        document.querySelector('[data-salvar]').addEventListener('click', async () => { const { valores } = ui.lerCampos(document.getElementById('form-cfg'), campos);
          for (const k of ['notaAtencao', 'notaIndicio', 'intervaloVistoriasDias', 'prazoOrdemDias', 'permanenciaAdultoAnos', 'permanenciaCriancaAnos', 'exumacaoMinimaAnos', 'guardaOssarioAnos', 'prazoManifestacaoDias', 'prazoTermoDias', 'limitePlaquetas']) if (valores[k] == null || valores[k] < 0) return ui.aviso('Preencha todos os números das Configurações.', 'erro');
          if (valores.notaAtencao > valores.notaIndicio) return ui.aviso('A nota de "Atenção" precisa ser menor ou igual à de "Indício".', 'erro');
          await VP.salvarConfig(Object.assign({}, cfg, valores)); ui.aviso('Configurações salvas.'); });
        document.querySelector('[data-backup]').addEventListener('click', () => ui.baixar(`vitalpat-cemiterio-copia-${VP.Plataforma.hoje()}.json`, JSON.stringify({ sistema: 'VitalPat Cemitério', versao: 1, geradoEm: VP.Plataforma.agoraISO(), dados: Object.fromEntries(VP.COLECOES.map((c) => [c, VP.db.lista(c, true)])) }), 'application/json'));
        document.querySelector('[data-restaurar]')?.addEventListener('change', async (e) => {
          try {
            const dump = JSON.parse(await e.target.files[0].text());
            if (dump.sistema !== 'VitalPat Cemitério') return ui.aviso('Este arquivo não é uma cópia do VitalPat Cemitério.', 'erro');
            if (!await ui.confirmar('Substituir todos os dados deste navegador pela cópia?', { sim: 'Restaurar', classe: 'perigo' })) return;
            await VP.db.limparTudo();
            await VP.db.gravarVarias(Object.fromEntries(VP.COLECOES.filter((c) => dump.dados[c]).map((c) => [c, dump.dados[c]])));
            ui.aviso('Cópia restaurada.'); VP.app.ir('#painel');
          } catch (_) { ui.aviso('Não foi possível ler a cópia.', 'erro'); }
        });
        document.querySelector('[data-reset]')?.addEventListener('click', async () => {
          if (!await ui.confirmar('Apagar os dados deste navegador e voltar ao cemitério de exemplo (fictício)?', { sim: 'Voltar aos dados de exemplo', classe: 'perigo' })) return;
          await VP.db.limparTudo(); await VP.criarDadosExemplo(); VP.app.ir('#painel');
        });
      }
    };
  };

  // ===================================================================== LIXEIRA
  T.lixeira = () => {
    const itens = [];
    for (const c of ['tumulos', 'quadras', 'cemiterios', 'vistorias', 'ordensServico', 'concessoes', 'sepultamentos', 'exumacoes', 'funerarias']) for (const x of VP.db.lista(c, true).filter((d) => d.excluido)) itens.push({ id: c + '|' + x.id, col: c, x });
    return {
      titulo: 'Lixeira',
      html: `<div id="area-lix"><p class="ajuda">Nada é apagado de verdade. O que foi excluído fica aqui e pode voltar.</p>${ui.tabela({ id: 'lixeira', linhas: itens, vazio: 'A Lixeira está vazia.', nomePlanilha: 'lixeira', colunas: [
        { chave: 'tipo', titulo: 'O que é', valor: (i) => ({ tumulos: 'Túmulo', quadras: 'Quadra', cemiterios: 'Cemitério', vistorias: 'Vistoria', ordensServico: 'Ordem de serviço', concessoes: 'Concessão', sepultamentos: 'Sepultamento', exumacoes: 'Exumação', funerarias: 'Funerária' }[i.col]) },
        { chave: 'nome', titulo: 'Nome', valor: (i) => { const tu = VP.db.pega('tumulos', i.x.tumuloId); return i.col === 'tumulos' ? VP.rotuloTumulo(i.x) : i.col === 'vistorias' ? `${tu ? VP.codigoTumulo(tu) : '?'} · ${u.data(i.x.data)}` : i.col === 'ordensServico' ? `Ordem ${i.x.numero}${tu ? ' · ' + VP.codigoTumulo(tu) : ''}` : i.col === 'concessoes' ? `Concessão ${i.x.numero} · ${i.x.titular}` : i.col === 'sepultamentos' || i.col === 'exumacoes' ? `${i.x.falecido}${tu ? ' · ' + VP.codigoTumulo(tu) : ''}` : i.x.nome; } },
        { chave: 'quando', titulo: 'Excluído em', valor: (i) => u.data(i.x.excluidoEm) },
        { chave: 'a', titulo: '', html: (i) => `<button class="botao pequeno" data-restaurar="${esc(i.id)}">Restaurar</button>` }] })}</div>`,
      ligar() {
        ui.ligarTabela('lixeira');
        document.getElementById('area-lix').addEventListener('click', async (e) => {
          const r = e.target.closest('[data-restaurar]'); if (!r) return;
          const [col, id] = r.dataset.restaurar.split('|');
          const x = VP.db.pega(col, id);
          if (col === 'tumulos') { const outro = VP.acharTumulo(VP.chaveDe(x)); if (outro && outro.id !== x.id) return ui.aviso(`Já existe outro túmulo igual (${VP.rotuloTumulo(outro)}).`, 'erro'); }
          delete x.excluido; delete x.excluidoEm;
          await VP.db.gravar(col, x);
          ui.aviso('Restaurado.'); VP.app.render();
        });
      }
    };
  };
})();
