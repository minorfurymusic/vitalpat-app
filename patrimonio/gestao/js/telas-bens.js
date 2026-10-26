/* VitalPat Patrimônio · Gestão — Bens: lista, ficha em uma página, inclusão e ações (uma ou em lote). */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas = VP.telas || {};
  const A = VP.acoes = VP.acoes || {};

  const opc = (col, filtro) => VP.db.lista(col).filter(filtro || (() => true)).sort((a, b) => String(a.codigo || a.nome).localeCompare(String(b.codigo || b.nome), 'pt-BR', { numeric: true })).map((x) => [x.id, col === 'unidades' || col === 'contas' ? `${x.codigo} · ${x.nome}` : (col === 'classificacoes' ? `${'— '.repeat(x.nivel === 'grupo' ? 0 : x.nivel === 'classe' ? 1 : 2)}${x.nome}` : x.nome)]);
  const opcClassificacoes = () => {
    const todas = VP.db.lista('classificacoes');
    const r = [];
    const desce = (pai, nivel) => todas.filter((c) => (c.paiId || '') === pai).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach((c) => { r.push([c.id, `${'— '.repeat(nivel)}${c.nome}`]); desce(c.id, nivel + 1); });
    desce('', 0);
    return r;
  };
  VP.opc = opc;
  VP.opcClassificacoes = opcClassificacoes;
  const etiquetaStatus = (b) => `<span class="selo-status s-${esc(b.status)}">${esc(L.status[b.status] || b.status)}</span>`;
  const estadoTxt = (e) => L.estados[e] || '—';
  VP.etiquetaStatus = etiquetaStatus;

  // Sem foto: mostra as iniciais do bem (configuração "Mostrar foto do bem nas listas")
  const miniatura = (b) => {
    if (!VP.config().usaAparencia) return '';
    if (b.fotos?.[0]) return `<img class="mini" src="${b.fotos[0].dataURL}" alt="">`;
    const ini = String(b.descricao || '?').split(/\s+/).filter((x) => x.length > 2).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
    return `<span class="mini sem-foto t-${esc(b.tipo)}" aria-hidden="true">${esc(ini)}</span>`;
  };

  // ======================================================== LISTA DE BENS
  // Abas: bens móveis e bens imóveis ficam separados; veículos ficam na Frota (continuam sendo patrimônio).
  const GRUPOS = {
    moveis: { titulo: 'Bens móveis', tipos: ['movel', 'intangivel'], novo: 'movel' },
    imoveis: { titulo: 'Bens imóveis', tipos: ['imovel', 'infraestrutura'], novo: 'imovel' }
  };
  VP.GRUPOS_BENS = GRUPOS;
  const filtrosBens = (grupo) => {
    const cfg = VP.config();
    const defs = [
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposBem).filter(([k]) => !grupo || grupo.tipos.includes(k)) },
      { chave: 'status', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(L.status) },
      { chave: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: Object.entries(L.estados).reverse() },
      { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opc('unidades') },
      { chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: opc('responsaveis') },
      { chave: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: opc('contas', (c) => c.tipo === 'ativo') },
      { chave: 'minha', rotulo: 'Minha responsabilidade', tipo: 'bool' },
      { chave: 'semResponsavel', rotulo: 'Sem responsável', tipo: 'bool' },
      { chave: 'aguardando', rotulo: 'Aguardando avaliação', tipo: 'bool' },
      { chave: 'conferir', rotulo: 'Importação a conferir', tipo: 'bool' },
      { chave: 'depreciados', rotulo: 'Totalmente depreciados', tipo: 'bool' },
      { chave: 'baixados', rotulo: 'Mostrar baixados', tipo: 'bool' },
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto' },
      { chave: 'bairro', rotulo: 'Bairro', tipo: 'texto' },
      { chave: 'logradouro', rotulo: 'Logradouro', tipo: 'texto' },
      { chave: 'anoDe', rotulo: 'Comprado a partir do ano', tipo: 'texto', tamanho: 5 },
      { chave: 'anoAte', rotulo: 'Comprado até o ano', tipo: 'texto', tamanho: 5 },
      { chave: 'valorMin', rotulo: 'Valor mínimo', tipo: 'texto', tamanho: 8 },
      { chave: 'valorMax', rotulo: 'Valor máximo', tipo: 'texto', tamanho: 8 }
    ];
    if (cfg.filtroPorClassificacao) defs.splice(3, 0, { chave: 'classificacaoId', rotulo: 'Classificação', tipo: 'select', opcoes: opcClassificacoes() });
    return defs;
  };
  const aplicarFiltros = (v, grupo) => {
    const f = ui.limparValores(v);
    return VP.filtrarBens(Object.assign({}, f, { tipos: grupo ? grupo.tipos : null }, {
      totalmenteDepreciados: !!f.depreciados,
      valorMin: f.valorMin != null ? u.num(f.valorMin) : null,
      valorMax: f.valorMax != null ? u.num(f.valorMax) : null
    }));
  };

  const colunasBens = () => {
    const cfg = VP.config();
    return [
      { chave: 'descricao', titulo: 'Bem', html: (b) => `<span class="celula-bem">${miniatura(b)}<span><a href="#bem/${esc(b.id)}">${esc(b.descricao)}</a><small>${esc(VP.nome('classificacoes', b.classificacaoId))}</small></span></span>`, exportar: (b) => b.descricao },
      { chave: 'codigo', titulo: 'Código', num: true },
      { chave: 'plaqueta', titulo: 'Plaqueta' },
      { chave: 'plaquetaAnterior', titulo: 'Plaqueta anterior', oculta: !cfg.plaquetaAnteriorRelatorio },
      { chave: 'tipo', titulo: 'Tipo', valor: (b) => L.tiposBem[b.tipo], oculta: true },
      { chave: 'unidade', titulo: 'Unidade', valor: (b) => VP.nome('unidades', b.unidadeId) },
      { chave: 'responsavel', titulo: 'Responsável', valor: (b) => (b.responsavelId ? VP.nome('responsaveis', b.responsavelId) : '— sem responsável —') },
      { chave: 'dataAquisicao', titulo: 'Aquisição', valor: (b) => u.data(b.dataAquisicao), ordenar: (b) => b.dataAquisicao },
      { chave: 'inicioDep', titulo: 'Início da depreciação', valor: (b) => (VP.naoDeprecia(b) ? 'Não deprecia' : u.data(b.depreciacao?.inicio)), oculta: true },
      { chave: 'valor', titulo: 'Valor contábil', num: true, soma: true, valor: (b) => VP.saldo(b).liquido, formato: u.moeda },
      { chave: 'consumo', titulo: 'Vida útil usada', html: (b) => { const s = VP.saldo(b); return VP.naoDeprecia(b) ? '<small>—</small>' : G.medidor(s.consumido, u.pct(s.consumido)); }, valor: (b) => VP.saldo(b).consumido, exportar: (b) => Math.round(VP.saldo(b).consumido * 100) + '%' },
      { chave: 'status', titulo: 'Situação', html: etiquetaStatus, valor: (b) => L.status[b.status] },
      { chave: 'estado', titulo: 'Estado', valor: (b) => estadoTxt(b.estado), ordenar: (b) => Number(b.estado) },
      { chave: 'conta', titulo: 'Conta', valor: (b) => VP.nome('contas', b.contaId), oculta: true },
      { chave: 'caracteristicas', titulo: 'Características', valor: (b) => [b.detalhes?.marca, b.detalhes?.modelo, b.detalhes?.cor, b.veiculo?.placa].filter(Boolean).join(' · '), oculta: true },
      { chave: 'score', titulo: 'Score', num: true, valor: (b) => VP.score(b)?.valor ?? '', oculta: true }
    ];
  };

  VP.estado = VP.estado || { filtrosBens: {}, listaAtual: [] };

  T.bens = (aba, query) => {
    const grupo = GRUPOS[aba] || null;
    const chaveFiltro = grupo ? 'filtrosBens_' + aba : 'filtrosBens';
    const v = VP.estado[chaveFiltro] = VP.estado[chaveFiltro] || {};
    if (query.semResponsavel) { for (const k of Object.keys(v)) delete v[k]; v.semResponsavel = true; }
    if (query.depreciados) { for (const k of Object.keys(v)) delete v[k]; v.depreciados = true; }
    if (query.aguardando) { for (const k of Object.keys(v)) delete v[k]; v.aguardando = true; }
    if (query.conferir) { for (const k of Object.keys(v)) delete v[k]; v.conferir = true; }
    if (query.unidade) { for (const k of Object.keys(v)) delete v[k]; v.unidadeId = query.unidade; }
    if (query.estado) { for (const k of Object.keys(v)) delete v[k]; v.estado = String(query.estado); }
    if (query.status) { for (const k of Object.keys(v)) delete v[k]; v.status = String(query.status); }
    const desenhar = () => {
      const bens = aplicarFiltros(v, grupo);
      VP.estado.listaAtual = bens.map((b) => b.id);
      const total = bens.reduce((t, b) => t + VP.saldo(b).liquido, 0);
      const salvos = VP.db.lista('filtrosSalvos');
      return `
        <div class="resumo-linha">
          ${G.numero('Bens no filtro', u.inteiro(bens.length))}
          ${G.numero('Valor contábil', u.moedaCurta(total), u.moeda(total))}
          ${G.numero('Em desuso', u.inteiro(bens.filter((b) => b.status === 'desuso').length))}
          ${G.numero('Sem responsável', u.inteiro(bens.filter((b) => !b.responsavelId && b.status !== 'baixado').length))}
        </div>
        ${salvos.length ? `<div class="filtros-salvos"><span>Filtros salvos:</span>${salvos.map((s) => `<button type="button" class="botao pequeno" data-filtro-salvo="${esc(s.id)}">${esc(s.nome)}</button>`).join('')}</div>` : ''}
        <div class="linha-filtros">${grupo ? '' : '<p class="ajuda">Todos os bens, de todos os tipos. Use as abas Bens móveis, Bens imóveis e Frota no menu para ver cada grupo.</p>'}${ui.filtros({ id: 'bens', defs: filtrosBens(grupo), valores: v, placeholder: 'Buscar por código (ex.: 1,2,6-10), plaqueta, nome, local, responsável, placa…', aoMudar: (_v, origem) => { atualizar(origem); } })}
          <button type="button" class="botao pequeno" data-salvar-filtro>Salvar filtro</button></div>
        <div id="barra-lote" class="barra-lote" hidden></div>
        ${ui.tabela({ id: 'bens', colunas: colunasBens(), linhas: bens, selecao: true, aoClicar: (b) => VP.app.ir('#bem/' + b.id), nomePlanilha: 'bens', vazio: 'Nenhum bem com estes filtros.' })}`;
    };
    const atualizar = (origem) => {
      const area = document.getElementById('area-bens');
      const foco = origem === 'busca' ? document.activeElement?.selectionStart : null;
      area.innerHTML = desenhar();
      ligar();
      if (origem === 'busca') { const b = area.querySelector('.busca'); b.focus(); if (foco != null) b.setSelectionRange(foco, foco); }
    };
    const ligar = () => {
      ui.ligarTabela('bens', (sel) => barraLote(sel));
      barraLote(ui.tabelas.bens.selecionados);
      const area = document.getElementById('area-bens');
      area.querySelectorAll('[data-filtro-salvo]').forEach((b) => b.addEventListener('click', () => {
        const s = VP.db.pega('filtrosSalvos', b.dataset.filtroSalvo);
        for (const k of Object.keys(v)) delete v[k];
        Object.assign(v, s.valores);
        atualizar();
      }));
      area.querySelector('[data-salvar-filtro]').addEventListener('click', () => ui.formulario({
        titulo: 'Salvar filtro', largura: 'pequena', campos: [{ chave: 'nome', rotulo: 'Nome do filtro', obrigatorio: true, placeholder: 'Ex.: Computadores das escolas' }],
        salvar: async (x) => { await VP.db.gravar('filtrosSalvos', { nome: x.nome, valores: ui.limparValores(v) }); ui.aviso('Filtro salvo.'); atualizar(); }
      }));
    };
    const barraLote = (sel) => {
      const el = document.getElementById('barra-lote');
      if (!el) return;
      el.hidden = !sel.size;
      if (!sel.size) return;
      el.innerHTML = `<b>${u.inteiro(sel.size)} marcado(s):</b>
        <button class="botao pequeno" data-lote="transferir">Transferir</button>
        <button class="botao pequeno" data-lote="desuso">Desuso</button>
        <button class="botao pequeno" data-lote="retorno">Volta ao uso</button>
        <button class="botao pequeno" data-lote="inservivel">Inservível</button>
        <button class="botao pequeno" data-lote="baixa">Baixa</button>
        <button class="botao pequeno" data-lote="loteBaixa">Incluir em lote de baixa</button>
        <button class="botao pequeno" data-lote="reavaliar">Reavaliar</button>
        <button class="botao pequeno" data-lote="complementares">Dados complementares</button>
        <button class="botao pequeno" data-lote="seguro">Seguro e garantia</button>
        <button class="botao pequeno" data-lote="vistoria">Vistoria</button>
        <button class="botao pequeno" data-lote="etiquetas">Etiquetas</button>
        <button class="botao pequeno" data-lote="termo">Termo de responsabilidade</button>
        <button class="botao pequeno" data-lote="recebimento">Recebimento</button>
        <button class="botao pequeno perigo" data-lote="excluir">Excluir</button>`;
      el.querySelectorAll('[data-lote]').forEach((b) => b.addEventListener('click', () => {
        const bens = [...sel].map((id) => VP.db.pega('bens', id)).filter(Boolean);
        A.lote(b.dataset.lote, bens, () => { sel.clear(); atualizar(); });
      }));
    };
    return {
      titulo: grupo ? grupo.titulo : 'Todos os bens',
      acoes: `${grupo === GRUPOS.imoveis ? '<a class="botao" href="#imoveis">Situação dos imóveis</a> ' : ''}<a class="botao primario" href="#novo-bem/${grupo ? grupo.novo : 'movel'}">+ Novo ${grupo === GRUPOS.imoveis ? 'imóvel' : 'bem'}</a> <a class="botao" href="#entradas">Itens a incorporar</a>`,
      html: `<div id="area-bens">${desenhar()}</div>`,
      ligar
    };
  };

  // Ações em lote (também usadas pela ficha com 1 bem)
  A.lote = (acao, bens, depois) => {
    const mapa = {
      transferir: () => A.transferir(bens, depois), desuso: () => A.desuso(bens, depois), retorno: () => A.retorno(bens, depois), inservivel: () => A.inservivel(bens, depois),
      baixa: () => A.baixa(bens, depois), loteBaixa: () => VP.baixaLote.escolherLote(bens, depois), reavaliar: () => { VP.estado.reavaliarIds = bens.map((b) => b.id); VP.app.ir('#financeiro/reavaliacao'); },
      complementares: () => A.complementares(bens, depois), seguro: () => A.seguroGarantia(bens, depois), vistoria: () => A.vistoria(bens, depois),
      etiquetas: () => { VP.estado.etiquetasIds = bens.map((b) => b.id); VP.app.ir('#relatorio/etiquetas'); },
      termo: () => VP.documentos.termoResponsabilidade(bens), recebimento: () => VP.termos.recebimento(bens, depois), excluir: () => A.excluir(bens, depois)
    };
    mapa[acao]();
  };

  // ======================================================== FICHA DO BEM (uma página)
  T.bem = (id) => {
    const b = VP.db.pega('bens', id);
    if (!b) return { titulo: 'Bem não encontrado', html: '<p>Este bem não existe ou foi excluído. Veja a <a href="#lixeira">Lixeira</a>.</p>' };
    const s = VP.saldo(b);
    const sc = VP.score(b);
    const tx = VP.taxas(b);
    const lista = VP.estado.listaAtual || [];
    const pos = lista.indexOf(id);
    const ant = pos > 0 ? lista[pos - 1] : null, prox = pos >= 0 && pos < lista.length - 1 ? lista[pos + 1] : null;
    const evs = VP.eventosDoBem(id);
    const custos = evs.filter((e) => e.tipo === 'manutencao' || e.tipo === 'despesa' || e.tipo === 'abastecimento');
    const inicial = evs.filter((e) => e.tipo === 'depreciacao' && e.dados.saldoInicial).reduce((t, e) => t + e.valor, 0);
    const manual = evs.filter((e) => e.tipo === 'depreciacao' && !e.loteId && !e.dados.saldoInicial).reduce((t, e) => t + e.valor, 0);
    const umAno = u.somaDias(VP.Plataforma.hoje(), -365);
    const automatica = evs.filter((e) => e.tipo === 'depreciacao' && e.loteId).reduce((t, e) => t + e.valor, 0);
    const cartao = (titulo, chave, linhas, extra = '') => `<section class="cartao secao" id="sec-${chave}"><header><h3>${esc(titulo)}</h3>${chave && b.status !== 'baixado' ? `<button class="botao pequeno" data-editar="${chave}">Editar</button>` : ''}</header>${linhas.length ? `<dl class="dados">${linhas.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === '' || v == null ? '<span class="vazio">—</span>' : esc(v)}</dd>`).join('')}</dl>` : ''}${extra}</section>`;
    const foto = b.fotos?.[0] ? `<img src="${b.fotos[0].dataURL}" alt="Foto do bem">` : `<div class="sem-foto-grande">${miniatura(b)}<small>Sem foto</small></div>`;
    const proj = VP.projecao(b);
    const abast = evs.filter((e) => e.tipo === 'abastecimento');
    const litros = abast.reduce((t, e) => t + (e.dados.litros || 0), 0);
    const html = `
      <div class="ficha-topo cartao">
        <div class="ficha-foto">${foto}<label class="botao pequeno">Trocar foto<input type="file" accept="image/*" data-foto hidden></label></div>
        <div class="ficha-principal">
          <div class="ficha-titulo"><h2>${esc(b.descricao)}</h2>${etiquetaStatus(b)}</div>
          <p class="ficha-sub">Código <b>${esc(b.codigo)}</b> · Plaqueta <b>${esc(b.plaqueta)}</b> · ${esc(L.tiposBem[b.tipo])} · ${esc(VP.nome('classificacoes', b.classificacaoId))}</p>
          <div class="resumo-linha">
            ${G.numero('Valor contábil', u.moeda(s.liquido), b.status === 'baixado' ? 'Bem baixado' : `Aquisição ${u.moeda(VP.eventosDoBem(id).find((e) => e.tipo === 'incorporacao')?.valor || 0)}`)}
            ${G.numero('Depreciação acumulada', u.moeda(s.acumulada), VP.naoDeprecia(b) ? 'Não deprecia' : `${u.moeda(tx.mensal)} por mês`)}
            ${G.numero('Estado', estadoTxt(b.estado), sc ? `Score ${sc.valor} · ${sc.faixa}` : '')}
            ${G.numero('Responsável', b.responsavelId ? VP.nome('responsaveis', b.responsavelId) : 'Sem responsável', VP.nome('unidades', b.unidadeId))}
          </div>
          ${VP.naoDeprecia(b) ? '' : `<div class="ficha-vida"><span>Vida útil usada</span>${G.medidor(s.consumido, `${u.pct(s.consumido)} de ${s.vidaUtilMeses} meses`)}</div>`}
        </div>
        <div class="ficha-qr" title="QR Code da plaqueta">${G.qr(b.plaqueta, 3)}<small>${esc(b.plaqueta)}</small></div>
      </div>
      ${b.status !== 'baixado' && Number(b.estado) === 1 ? '<p class="aviso-inline">Este bem está <b>Imprestável</b> (sem conserto). O caminho é a baixa. <button class="botao pequeno perigo" data-acao="baixa">Iniciar baixa</button></p>' : ''}
      ${VP.termos ? VP.termos.doBem(b.id).map((t) => `<p class="aviso-inline ${VP.termos.vencido(t) ? 'erro-txt' : ''}">Termo de responsabilidade <b>${esc(t.numero)}</b> (${esc(VP.nome('responsaveis', t.responsavelId))}) <b>${VP.termos.vencido(t) ? 'vencido' : 'aguardando assinatura'}</b> — prazo ${u.data(t.prazo)}. <a href="#termos">Imprimir ou anexar assinado</a></p>`).join('') : ''}
      ${b.unidoA ? `<p class="aviso-inline">Cadastro desativado: era o mesmo bem que <a href="#bem/${esc(b.unidoA)}">${esc(VP.db.pega('bens', b.unidoA)?.plaqueta || '')}</a> (cadastros unidos).</p>` : ''}
      ${(b.unioes || []).filter((x) => !x.desfeitaEm).map((x) => `<p class="aviso-inline">Unido com o cadastro <a href="#bem/${esc(x.bemId)}">${esc(x.plaqueta)}</a> em ${u.data(x.data)} — ${esc(x.motivo)} <button class="botao pequeno" data-desfazer-uniao="${esc(x.id)}">Desfazer união</button></p>`).join('')}
      ${VP.aguardandoAvaliacao(b) ? `<p class="aviso-inline">Bem <b>aguardando avaliação</b>: entrou com valor R$ 0${b.dataAquisicaoDesconhecida ? ' e data de aquisição desconhecida' : ''}. O valor entra pela <a href="#financeiro/reavaliacao">Reavaliação</a> (laudo da comissão).</p>` : ''}
      ${b.conferenciaImportacao?.pendente ? `<p class="aviso-inline">Importação <b>aguardando conferência manual</b>: ${esc(b.conferenciaImportacao.motivo)} <button class="botao pequeno" data-conferido>Conferido</button></p>` : ''}
      ${b.centroCustoPendente ? `<p class="aviso-inline erro-txt">Bem <b>sem centro de custo</b>: o código ${esc(b.centroCustoPendente)} veio da importação e ainda não está cadastrado. <a href="#centros-pendentes">Ligar a uma unidade</a>.</p>` : ''}
      ${b.loteBaixaId ? `<p class="aviso-inline">Baixado no lote <a href="#baixa-lote/${esc(b.loteBaixaId)}">${esc(VP.db.pega('lotesBaixa', b.loteBaixaId)?.numero || '')}</a> (ata no lote).</p>` : ''}
      ${b.status === 'inservivel' ? '<p class="aviso-inline">Bem <b>inservível</b>: disponível para leilão, doação ou transferência. Inclua num lote em <a href="#baixa-lote">Baixa em lote (leilão)</a> ou use “Volta ao uso” se voltar a servir.</p>' : ''}
      <div class="barra-acoes">
        ${b.status === 'baixado' ? '<span class="aviso-inline">Bem baixado: só consulta e impressão.</span>' : `
        <button class="botao" data-acao="transferir">Transferir</button>
        ${['desuso', 'cedido', 'manutencao', 'inservivel'].includes(b.status) ? '<button class="botao" data-acao="retorno">Volta ao uso</button>' : '<button class="botao" data-acao="desuso">Desuso</button>'}
        ${b.status !== 'inservivel' ? '<button class="botao" data-acao="inservivel">Inservível</button>' : ''}
        <button class="botao" data-acao="manutencao">Manutenção / despesa</button>
        <button class="botao" data-acao="vistoria">Vistoria</button>
        <button class="botao" data-acao="observacao">Observação</button>
        <button class="botao" data-acao="anexar">Anexar arquivo</button>
        <button class="botao" data-acao="melhoria">Melhoria</button>
        <button class="botao" data-acao="reavaliar">Reavaliar</button>
        ${b.depreciacao?.metodo === 'unidades' ? '<button class="botao" data-acao="unidades">Unidades produzidas</button>' : ''}
        <button class="botao" data-acao="replicar">Replicar</button>
        <button class="botao" data-acao="recebimento">Recebimento</button>
        <button class="botao" data-acao="unir" title="O mesmo bem tem dois cadastros (duas plaquetas)">Unir cadastros</button>
        <button class="botao" data-acao="baixa">Baixa</button>`}
        <button class="botao" data-acao="imprimir">Imprimir ficha</button>
        <button class="botao" data-acao="etiqueta">Etiqueta</button>
        ${b.status !== 'baixado' ? '<button class="botao perigo" data-acao="excluir">Excluir</button>' : ''}
      </div>
      <div class="grade-secoes">
        ${cartao('Identificação', 'identificacao', [['Produto', VP.nome('produtos', b.produtoId)], ['Complemento', b.complemento], ['Tombamento', b.detalhes?.tombamento], ['Data do tombamento', u.data(b.detalhes?.dataTombamento)], ['Plaqueta anterior', b.plaquetaAnterior], ['Como entrou', b.situacaoAquisicao], ['Data de aquisição', b.dataAquisicaoDesconhecida ? `Desconhecida (entrou no sistema em ${u.data(b.dataAquisicao)})` : u.data(b.dataAquisicao)], ['Data de incorporação', u.data(b.dataIncorporacao)], ['Comissão', b.comissaoId ? VP.nome('comissoes', b.comissaoId) : ''], ['Exercícios anteriores', b.exerciciosAnteriores ? 'Sim' : 'Não'], ['Entidade', VP.nome('entidades', b.entidadeId)], ['Criticidade de uso', ['', 'Baixa', 'Média', 'Alta'][b.criticidade || 2]]])}
        ${(() => { const ants = VP.plaquetasAnteriores(b); return `<section class="cartao secao" id="sec-plaquetas"><header><h3>Plaquetas</h3>${b.status !== 'baixado' ? '<span><button class="botao pequeno" data-plaq-trocar>Trocar plaqueta</button> <button class="botao pequeno" data-plaq-mais title="Registrar uma plaqueta antiga deste bem">+ Plaqueta anterior</button></span>' : ''}</header>
          <p>Plaqueta atual: <b>${esc(b.plaqueta)}</b></p>
          ${ants.length ? `<div class="tabela-rolagem"><table class="tabela" data-sem-planilha><thead><tr><th>Plaqueta anterior</th><th>Data</th><th>Motivo</th><th>Observação</th><th>Quem</th></tr></thead><tbody>${ants.map((a) => `<tr><td>${esc(a.plaqueta)}</td><td>${u.data(a.data)}</td><td>${esc(a.motivo || '')}</td><td>${esc(a.observacao || '')}</td><td>${esc(a.usuario || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="ajuda">Nenhuma plaqueta anterior.</p>'}</section>`; })()}
        ${cartao('Local e responsáveis', 'local', [['Unidade', VP.nome('unidades', b.unidadeId)], ['Localização', b.localizacao], ['Responsável', b.responsavelId ? VP.nome('responsaveis', b.responsavelId) : ''], ['Responsáveis adicionais', (b.responsaveisAdicionais || []).map((r) => VP.nome('responsaveis', r)).join(', ')], b.endereco ? ['Endereço', [b.endereco.logradouro, b.endereco.bairro, b.endereco.cidade].filter(Boolean).join(', ')] : null])}
        ${cartao('Origem e compra', 'origem', [['Fornecedor', VP.nome('fornecedores', b.fornecedorId)], ['Empenho', b.origem?.empenho], ['Item do empenho', b.origem?.item], ['Quantidade', b.origem?.quantidade], ['Valor unitário', b.origem?.valorUnitario != null ? u.moeda(b.origem.valorUnitario) : ''], ['Nota fiscal', [b.nf?.numero, b.nf?.serie].filter(Boolean).join(' / série ')], ['Emissão da nota', u.data(b.nf?.emissao)], ['Licitação', [b.origem?.licitacao?.modalidade, b.origem?.licitacao?.processo && 'processo ' + b.origem.licitacao.processo, b.origem?.licitacao?.numero && 'nº ' + b.origem.licitacao.numero].filter(Boolean).join(' · ')],
          b.origem?.ordemCompra && ['Ordem de compra', b.origem.ordemCompra], b.origem?.af && ['AF (autorização de fornecimento)', b.origem.af], b.nf?.chave && ['Chave da nota', b.nf.chave],
          ...[['dotacao', 'Dotação'], ['orgao', 'Órgão'], ['unidade', 'Unidade orçamentária'], ['acao', 'Ação'], ['elemento', 'Elemento'], ['vinculo', 'Vínculo']].map(([k, r]) => b.origem?.orcamento?.[k] && [r, b.origem.orcamento[k]])])}
        ${cartao('Detalhes', 'detalhes', [['Marca', b.detalhes?.marca], ['Modelo', b.detalhes?.modelo], ['Cor', b.detalhes?.cor], ['Número de série', b.detalhes?.serie], ['RFID', b.detalhes?.rfid], ['Texto jurídico', [b.detalhes?.textoJuridico?.categoria, b.detalhes?.textoJuridico?.numeroAno].filter(Boolean).join(' · ')]], (b.medidas || []).length ? `<h4>Medidas</h4><dl class="dados">${b.medidas.map((m) => `<dt>${esc(m.nome)}</dt><dd>${esc(m.valor)}</dd>`).join('')}</dl>` : '')}
        ${b.tipo === 'imovel' || b.imovel ? cartao('Imóvel: registro e uso', 'imovel', [['Matrícula', b.imovel?.matricula], ['Ligações de água e luz', b.imovel?.ligacoes], ['Cartório', b.imovel?.cartorio], ['Situação do registro', b.imovel?.situacaoRegistro], ['O que impede o registro', b.imovel?.motivoPendencia], ['Classificação de uso', b.imovel?.uso], ['Afetado', b.imovel?.afetado == null ? '' : b.imovel.afetado ? 'Sim' : 'Não'], ['Inscrição imobiliária (IPTU)', b.imovel?.inscricaoIptu], ['Escritura', b.imovel?.escritura], ['Área do terreno', b.imovel?.areaTerreno ? u.inteiro(b.imovel.areaTerreno) + ' m²' : ''], ['Área construída', b.imovel?.areaConstruida ? u.inteiro(b.imovel.areaConstruida) + ' m²' : ''], ['Valor do terreno', b.imovel?.valorTerreno ? u.moeda(b.imovel.valorTerreno) : ''], ['Origem', b.imovel?.origemArea], ['Proprietário na matrícula', b.imovel?.proprietarioMatricula], ['Último registro na matrícula', b.imovel?.ultimoRegistroMatricula ? u.data(b.imovel.ultimoRegistroMatricula) : '']], (b.conferenciaImportacao?.motivo ? `<p class="ajuda">Origem: ${esc(b.conferenciaImportacao.motivo)}</p>` : '')) + (VP.imoveis ? VP.imoveis.secoesFicha(b) : '') : ''}
        ${b.tipo === 'veiculo' ? cartao('Veículo', 'veiculo', [['Placa', b.veiculo?.placa], ['RENAVAM', b.veiculo?.renavam], ['Chassi', b.veiculo?.chassi], ['Combustível', b.veiculo?.combustivel], ['Ano/modelo', b.veiculo?.anoModelo], ['Tanque (litros)', b.veiculo?.capacidadeTanque], ['Abastecimentos registrados', abast.length ? `${abast.length} · ${u.inteiro(litros)} L · ${u.moeda(abast.reduce((t, e) => t + e.valor, 0))}` : '']]) : ''}
        ${cartao('Seguro e garantia', 'seguro', [['Seguradora', b.seguro?.seguradoraId ? VP.nome('seguradoras', b.seguro.seguradoraId) : ''], ['Corretora', b.seguro?.corretoraId ? VP.nome('seguradoras', b.seguro.corretoraId) : ''], ['Apólice', b.seguro?.apolice], ['Vigência', b.seguro?.inicio ? `${u.data(b.seguro.inicio)} a ${u.data(b.seguro.termino)}` : ''], ['Valor do seguro', b.seguro?.valor ? u.moeda(b.seguro.valor) : ''], ['Franquia', b.seguro?.franquia ? u.moeda(b.seguro.franquia) : ''], ['Garantia', b.garantia?.termino ? `${VP.nome('tiposGarantia', b.garantia.tipoId)} até ${u.data(b.garantia.termino)}` : ''], ['Fornecedor da garantia', b.garantia?.fornecedorId ? VP.nome('fornecedores', b.garantia.fornecedorId) : '']])}
        ${cartao('Valores e contas', 'valores', [['Conta contábil', VP.nome('contas', b.contaId)], ['Valor base (aquisição, reavaliação e melhorias)', u.moeda(s.base)], ['Melhorias somadas', u.moeda(s.agregado)], ['Valor residual', u.moeda(s.residual)], ['Depreciação acumulada', u.moeda(s.acumulada)], ['Valor contábil (líquido)', u.moeda(s.liquido)]])}
        ${cartao('Depreciação', 'depreciacao', VP.naoDeprecia(b) ? [['Situação', b.depreciacao?.automatica === false ? 'Não deprecia automaticamente' : 'Classificação não deprecia (ex.: terreno)']] : [['Depreciar automaticamente', b.depreciacao?.automatica ? 'Sim' : 'Não'], ['Método', L.metodos[b.depreciacao?.metodo] || ''], ['Início', s.inicio ? u.mesExtenso(s.inicio) : ''], ['Vida útil', s.vidaUtilMeses ? `${s.vidaUtilMeses} meses` : ''], ['Residual', b.depreciacao?.residualTipo === 'percentual' ? `${b.depreciacao.residual}% (${u.moeda(s.residual)})` : u.moeda(s.residual)], ['Valor a depreciar', u.moeda(s.depreciavel)], ['Taxa mensal / anual', `${u.moeda(tx.mensal)} / ${u.moeda(tx.anual)} (${u.pct(tx.percentualAnual)} ao ano)`], inicial ? ['Acumulado até a implantação do sistema', u.moeda(inicial)] : null, ['Acumulado manual', u.moeda(manual)], ['Acumulado automático (fechamentos)', u.moeda(automatica)], ['Acumulado total', u.moeda(inicial + manual + automatica)], ['Conta de débito', VP.nome('contas', b.depreciacao?.contaDebito)], ['Conta de crédito', VP.nome('contas', b.depreciacao?.contaCredito)]], proj.length ? `<h4>Valor ao longo da vida útil</h4>${G.linha(proj, { largura: 330, altura: 190, formato: u.moeda, formatoEixo: u.moedaCurta, rotuloX: u.mesNome, marcaX: VP.Plataforma.hoje().slice(0, 7), titulo: 'Valor do bem ao longo da vida útil' })}` : '')}
        <section class="cartao secao"><header><h3>Despesas e manutenções</h3></header>
          ${custos.length ? `<div class="resumo-linha">${G.numero('Últimos 12 meses', u.moeda(custos.filter((e) => e.data >= umAno).reduce((t, e) => t + (e.valor || 0), 0)))}${G.numero('Total registrado', u.moeda(custos.reduce((t, e) => t + (e.valor || 0), 0)))}</div>` : '<p class="vazio">Nenhuma despesa registrada.</p>'}
        </section>
        ${VP.auditoria ? VP.auditoria.secaoTrilha(b) : ''}
        ${VP.anexos.secaoFicha(b)}
      </div>
      <section class="cartao secao linha-do-tempo-cartao">
        <header><h3>Linha do tempo</h3>
          <div class="segmentos" role="group" aria-label="Filtrar linha do tempo">
            <button class="ativo" data-grupo="">Tudo</button><button data-grupo="financeiro">Financeiro</button><button data-grupo="fisico">Físico</button><button data-grupo="registro">Registros</button>
          </div></header>
        <div id="linha-tempo">${linhaDoTempo(b, '')}</div>
      </section>`;
    return {
      titulo: `Bem ${b.codigo}`,
      acoes: `<a class="botao" href="#${b.tipo === 'veiculo' ? 'frota/veiculos' : ['imovel', 'infraestrutura'].includes(b.tipo) ? 'bens/imoveis' : 'bens/moveis'}">‹ Lista</a> ${ant ? `<a class="botao" href="#bem/${esc(ant)}" title="Bem anterior">‹ Anterior</a>` : ''} ${prox ? `<a class="botao" href="#bem/${esc(prox)}" title="Próximo bem">Próximo ›</a>` : ''}`,
      html,
      ligar() {
        const area = document.getElementById('conteudo');
        const recarrega = () => VP.app.render();
        area.querySelectorAll('[data-editar]').forEach((el) => el.addEventListener('click', () => A.editarSecao(b, el.dataset.editar, recarrega)));
        area.querySelector('[data-conferido]')?.addEventListener('click', async () => {
          if (!await ui.confirmar('Confirmar que este bem foi <b>conferido</b> (vistoria feita e dados certos)?', { sim: 'Conferido' })) return;
          b.conferenciaImportacao = Object.assign({}, b.conferenciaImportacao, { pendente: false, conferidoEm: VP.Plataforma.agoraISO(), conferidoPor: VP.sessao?.usuario || '' });
          await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `Importação conferida (${b.conferenciaImportacao.motivo})` })] });
          ui.aviso('Conferido.'); recarrega();
        });
        area.querySelectorAll('[data-acao]').forEach((el) => el.addEventListener('click', () => {
          const a = el.dataset.acao;
          const um = [b];
          if (a === 'imprimir') return VP.documentos.fichaBem(b);
          if (a === 'etiqueta') return A.lote('etiquetas', um);
          if (a === 'excluir') return A.excluir(um, () => VP.app.ir('#bens'));
          if (a === 'manutencao') return A.manutencao(b, recarrega);
          if (a === 'observacao') return A.observacao(b, recarrega);
          if (a === 'anexar') return A.anexar(b, recarrega);
          if (a === 'melhoria') return A.melhoria(b, recarrega);
          if (a === 'replicar') return A.replicar(b, recarrega);
          if (a === 'unir') return VP.unirCadastros.abrir(b);
          if (a === 'recebimento') return VP.termos.recebimento([b], recarrega);
          if (a === 'unidades') return A.unidadesProduzidas(b, recarrega);
          return A.lote(a === 'reavaliar' ? 'reavaliar' : a, um, recarrega);
        }));
        const MOTIVOS_PLAQ = ['Plaqueta caiu / perdida', 'Plaqueta danificada (ilegível)', 'Duas plaquetas no mesmo bem (achado no inventário)', 'Troca de padrão de plaqueta', 'Correção de cadastro', 'Outro'].map((x) => [x, x]);
        const conferePlaq = (pl) => { const d = VP.donoDaPlaqueta(pl); return d && d.id !== b.id ? `A plaqueta ${pl} já é (ou foi) do bem ${d.codigo} · ${d.descricao}. Se for o mesmo bem, use "Unir cadastros".` : null; };
        area.querySelectorAll('[data-desfazer-uniao]').forEach((el) => el.addEventListener('click', async () => {
          if (!await ui.confirmar('Desfazer a união? O outro cadastro volta a ficar ativo (a baixa é estornada) e os dados trazidos dele voltam ao que eram. Tudo fica no histórico.', { sim: 'Desfazer união', classe: 'perigo' })) return;
          await VP.unirCadastros.desfazer(b, el.dataset.desfazerUniao); ui.aviso('União desfeita.'); recarrega();
        }));
        area.querySelector('[data-plaq-mais]')?.addEventListener('click', () => ui.formulario({
          titulo: '+ Plaqueta anterior', largura: 'media', textoSalvar: 'Registrar',
          intro: '<p class="ajuda">Registre uma plaqueta antiga deste bem (por exemplo, a que caiu e foi trocada). Fica no histórico com data e motivo. Não muda a plaqueta atual.</p>',
          campos: [{ chave: 'plaqueta', rotulo: 'Plaqueta antiga', obrigatorio: true, largura: 'meia' }, { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true, largura: 'meia' }, { chave: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: MOTIVOS_PLAQ, obrigatorio: true }, { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
          salvar: async (v) => {
            v.plaqueta = String(v.plaqueta).trim();
            if (v.plaqueta === String(b.plaqueta) || VP.plaquetasAnteriores(b).some((x) => String(x.plaqueta) === v.plaqueta)) return 'Esta plaqueta já está registrada neste bem.';
            const c = conferePlaq(v.plaqueta); if (c) return c;
            VP.registrarPlaquetaAnterior(b, v);
            await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { data: v.data, descricao: `Plaqueta anterior registrada: ${v.plaqueta} (${v.motivo})`, extra: { plaquetaAnterior: v.plaqueta, motivo: v.motivo, observacao: v.observacao || '' } })] });
            ui.aviso('Plaqueta anterior registrada.'); recarrega();
          }
        }));
        area.querySelector('[data-plaq-trocar]')?.addEventListener('click', () => ui.formulario({
          titulo: 'Trocar plaqueta', largura: 'media', textoSalvar: 'Trocar',
          intro: `<p class="ajuda">A plaqueta atual (<b>${esc(b.plaqueta)}</b>) vai para o registro de plaquetas anteriores, com data e motivo. Plaqueta nunca é reaproveitada.</p>`,
          campos: [{ chave: 'nova', rotulo: 'Nova plaqueta', obrigatorio: true, largura: 'meia' }, { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true, largura: 'meia' }, { chave: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: MOTIVOS_PLAQ, obrigatorio: true }, { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
          salvar: async (v) => {
            const nova = String(v.nova).trim();
            if (nova === String(b.plaqueta)) return 'É a mesma plaqueta.';
            if (VP.plaquetasAnteriores(b).some((x) => String(x.plaqueta) === nova)) return 'Esta plaqueta já foi deste bem: plaqueta não é reaproveitada.';
            const c = conferePlaq(nova); if (c) return c;
            const antiga = b.plaqueta;
            VP.registrarPlaquetaAnterior(b, { plaqueta: antiga, data: v.data, motivo: v.motivo, observacao: [`Trocada pela ${nova}`, v.observacao].filter(Boolean).join(' · ') });
            b.plaqueta = nova;
            await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { data: v.data, descricao: `Plaqueta trocada: ${antiga} → ${nova} (${v.motivo})`, extra: { mudancas: [{ campo: 'Plaqueta', antes: antiga, depois: nova }], motivo: v.motivo } })] });
            ui.aviso('Plaqueta trocada.'); recarrega();
          }
        }));
        area.querySelector('[data-foto]')?.addEventListener('change', async (e) => {
          const fotos = await ui.lerArquivos(e.target.files);
          if (!fotos.length) return;
          b.fotos = [fotos[0], ...(b.fotos || [])].slice(0, 6);
          await VP.db.gravar('bens', b);
          ui.aviso('Foto atualizada.');
          recarrega();
        });
        area.querySelectorAll('[data-grupo]').forEach((el) => el.addEventListener('click', () => {
          area.querySelectorAll('[data-grupo]').forEach((x) => x.classList.toggle('ativo', x === el));
          document.getElementById('linha-tempo').innerHTML = linhaDoTempo(b, el.dataset.grupo);
          ligarEstorno(b);
        }));
        ligarEstorno(b);
        if (VP.imoveis && (b.tipo === 'imovel' || b.imovel)) VP.imoveis.ligarFicha(b, recarrega);
        VP.anexos.ligarFicha(b, recarrega);
        if (VP.auditoria) VP.auditoria.ligarTrilha(b);
      }
    };
  };

  const linhaDoTempo = (b, grupo) => {
    const evs = VP.db.lista('eventos').filter((e) => e.bemId === b.id && (!grupo || L.eventos[e.tipo]?.grupo === grupo))
      .sort((x, y) => (y.data + y.criadoEm).localeCompare(x.data + x.criadoEm));
    if (!evs.length) return '<p class="vazio">Nada registrado.</p>';
    return `<ol class="linha-do-tempo">${evs.map((e) => {
      const tp = L.eventos[e.tipo] || { nome: e.tipo, grupo: 'registro' };
      const pode = !e.cancelado && ['agregacao', 'reavaliacao', 'manutencao', 'despesa'].includes(e.tipo) || (!e.cancelado && e.tipo === 'depreciacao' && !e.loteId && !e.dados.saldoInicial);
      return `<li class="ev g-${tp.grupo} ${e.cancelado ? 'cancelado' : ''}">
        <span class="ev-data">${u.data(e.data)}</span>
        <span class="ev-corpo"><b>${esc(tp.nome)}</b>${e.valor != null ? ` · ${u.moeda(e.valor)}` : ''}${e.tipo === 'reavaliacao' && e.dados.valorNovo != null ? ` · novo valor ${u.moeda(e.dados.valorNovo)}` : ''}<br><small>${esc(e.descricao)}${e.dados.motivo ? ' · ' + esc(e.dados.motivo) : ''}${e.cancelado ? ` · <b>desfeito/estornado</b>${e.motivoCancelamento ? ' (' + esc(e.motivoCancelamento) + ')' : ''}` : ''} · por ${esc(e.usuario)}</small></span>
        ${pode && b.status !== 'baixado' ? `<button class="botao pequeno" data-estornar="${esc(e.id)}">Estornar</button>` : ''}
      </li>`;
    }).join('')}</ol>`;
  };
  const ligarEstorno = (b) => document.querySelectorAll('[data-estornar]').forEach((el) => el.addEventListener('click', async () => {
    const e = VP.db.pega('eventos', el.dataset.estornar);
    if (!await ui.confirmar(`Estornar "${L.eventos[e.tipo].nome}" de ${u.data(e.data)}? O lançamento fica no histórico como estornado e é criado um estorno.`, { sim: 'Estornar', classe: 'perigo' })) return;
    e.cancelado = true; e.motivoCancelamento = 'Estornado'; e.canceladoEm = VP.Plataforma.agoraISO();
    const est = VP.novoEvento(b.id, 'estorno', { valor: e.valor, descricao: `Estorno de ${L.eventos[e.tipo].nome} de ${u.data(e.data)}`, extra: { eventoId: e.id } });
    await VP.db.gravarVarias({ eventos: [e, est] });
    ui.aviso('Estornado.');
    VP.app.render();
  }));

  // ======================================================== EDITAR POR SEÇÃO (com registro do que mudou)
  const pegaCaminho = (o, c) => c.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const poeCaminho = (o, c, v) => { const p = c.split('.'); let x = o; while (p.length > 1) { const k = p.shift(); x[k] = x[k] || {}; x = x[k]; } x[p[0]] = v; };
  const secoes = (b) => ({
    identificacao: { titulo: 'Identificação', campos: [
      { chave: 'descricao', rotulo: 'Descrição', obrigatorio: true },
      { chave: 'produtoId', rotulo: 'Produto', tipo: 'select', opcoes: opc('produtos') },
      { chave: 'complemento', rotulo: 'Complemento', tipo: 'area' },
      { chave: 'classificacaoId', rotulo: 'Classificação', tipo: 'select', opcoes: opcClassificacoes(), obrigatorio: true },
      { chave: 'detalhes.tombamento', rotulo: 'Número de tombamento', largura: 'meia' }, { chave: 'detalhes.dataTombamento', rotulo: 'Data do tombamento', tipo: 'data', largura: 'meia' },
      { chave: 'situacaoAquisicao', rotulo: 'Como entrou', tipo: 'select', opcoes: L.situacoesAquisicao.map((x) => [x, x]) },
      { chave: 'dataAquisicao', rotulo: 'Data de aquisição', tipo: 'data', largura: 'meia' }, { chave: 'dataIncorporacao', rotulo: 'Data de incorporação', tipo: 'data', largura: 'meia' },
      { chave: 'comissaoId', rotulo: 'Comissão', tipo: 'select', opcoes: opc('comissoes') },
      { chave: 'exerciciosAnteriores', rotulo: 'Bem de exercícios anteriores', tipo: 'bool' },
      { chave: 'entidadeId', rotulo: 'Entidade', tipo: 'select', opcoes: opc('entidades') },
      { chave: 'criticidade', rotulo: 'Criticidade de uso', tipo: 'select', opcoes: [[1, 'Baixa'], [2, 'Média'], [3, 'Alta']], ajuda: 'Bem essencial (ex.: geladeira de vacinas) = alta. Entra no score.' }] },
    local: { titulo: 'Local e responsáveis', aviso: 'Para mudar de unidade, use “Transferir” (fica registrado e gera termo).', campos: [
      { chave: 'localizacao', rotulo: 'Localização dentro da unidade', placeholder: 'Ex.: Sala 12' },
      { chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: opc('responsaveis') },
      { chave: 'responsaveisAdicionais', rotulo: 'Responsáveis adicionais (segure Ctrl para marcar vários)', tipo: 'multi', opcoes: opc('responsaveis') },
      { chave: 'endereco.logradouro', rotulo: 'Logradouro (imóveis e infraestrutura)' }, { chave: 'endereco.bairro', rotulo: 'Bairro', largura: 'meia' }, { chave: 'endereco.cidade', rotulo: 'Cidade', largura: 'meia' }] },
    origem: { titulo: 'Origem e compra', campos: [
      { chave: 'fornecedorId', rotulo: 'Fornecedor', tipo: 'select', opcoes: opc('fornecedores') },
      { chave: 'origem.empenho', rotulo: 'Empenho (ano/número)', largura: 'meia' }, { chave: 'origem.item', rotulo: 'Item do empenho', largura: 'meia' },
      { chave: 'origem.quantidade', rotulo: 'Quantidade', tipo: 'numero', largura: 'meia' }, { chave: 'origem.valorUnitario', rotulo: 'Valor unitário', tipo: 'moeda', largura: 'meia' },
      { chave: 'nf.numero', rotulo: 'Nota fiscal', largura: 'meia' }, { chave: 'nf.serie', rotulo: 'Série', largura: 'meia' }, { chave: 'nf.emissao', rotulo: 'Emissão da nota', tipo: 'data' },
      { chave: 'origem.licitacao.modalidade', rotulo: 'Licitação: modalidade', largura: 'meia' }, { chave: 'origem.licitacao.processo', rotulo: 'Processo', largura: 'meia' }, { chave: 'origem.licitacao.numero', rotulo: 'Número da licitação', largura: 'meia' }] },
    detalhes: { titulo: 'Detalhes', campos: [
      { chave: 'estado', rotulo: 'Estado de conservação', tipo: 'select', opcoes: Object.entries(L.estados).reverse() },
      { chave: 'detalhes.marca', rotulo: 'Marca', largura: 'meia' }, { chave: 'detalhes.modelo', rotulo: 'Modelo', largura: 'meia' },
      { chave: 'detalhes.cor', rotulo: 'Cor', largura: 'meia' }, { chave: 'detalhes.serie', rotulo: 'Número de série', largura: 'meia' },
      { chave: 'detalhes.rfid', rotulo: 'RFID' },
      { chave: 'detalhes.identificacao', rotulo: 'Identificação do animal (chip, brinco) — semoventes', largura: 'meia' }, { chave: 'detalhes.vigenciaFim', rotulo: 'Vigência até (licença, direito) — intangíveis', tipo: 'data', largura: 'meia' },
      { chave: 'detalhes.textoJuridico.categoria', rotulo: 'Texto jurídico: categoria', largura: 'meia' }, { chave: 'detalhes.textoJuridico.numeroAno', rotulo: 'Número/ano', largura: 'meia' },
      { chave: '_medidas', rotulo: 'Medidas (uma por linha: nome = valor)', tipo: 'area', ajuda: 'Ex.: Área construída (m²) = 850' }] },
    imovel: { titulo: 'Imóvel: documentos e uso', campos: [
      { chave: 'imovel.matricula', rotulo: 'Matrícula', largura: 'meia' }, { chave: 'imovel.cartorio', rotulo: 'Cartório', largura: 'meia' },
      { chave: 'imovel.ligacoes', rotulo: 'Ligações de água e luz (matrícula CASAN, unidade CELESC)', ajuda: 'Mais de uma: separe com ";". Ex.: Luz 1.004.706.011-01; Água 233761-4' },
      { chave: 'imovel.situacaoRegistro', rotulo: 'Situação do registro', tipo: 'select', opcoes: ['Registrado', 'Em regularização', 'Sem registro', 'Posse'].map((x) => [x, x]) },
      { chave: 'imovel.uso', rotulo: 'Classificação de uso', tipo: 'select', opcoes: ['Uso comum do povo', 'Uso especial', 'Dominical'].map((x) => [x, x]), ajuda: 'Uso comum e uso especial não podem ser vendidos enquanto afetados (Código Civil, arts. 98–103).' },
      { chave: 'imovel.afetado', rotulo: 'Afetado (em uso para um serviço público ou pelo povo)', tipo: 'bool' },
      { chave: 'imovel.motivoPendencia', rotulo: 'O que impede o registro (se não estiver registrado)', tipo: 'area', ajuda: 'O TCE/SC pede o motivo de cada imóvel não registrado.' },
      { chave: 'imovel.inscricaoIptu', rotulo: 'Inscrição imobiliária (IPTU)', largura: 'meia' }, { chave: 'imovel.escritura', rotulo: 'Escritura (livro, folha, data)', largura: 'meia' },
      { chave: 'imovel.areaTerreno', rotulo: 'Área do terreno (m²)', tipo: 'numero', largura: 'meia' }, { chave: 'imovel.areaConstruida', rotulo: 'Área construída (m²)', tipo: 'numero', largura: 'meia' },
      { chave: 'imovel.valorTerreno', rotulo: 'Valor do terreno (não deprecia)', tipo: 'moeda', largura: 'meia', ajuda: 'Separado da edificação. Informativo para o relatório.' },
      { chave: 'imovel.origemArea', rotulo: 'Origem', tipo: 'select', opcoes: ['Compra', 'Doação', 'Desapropriação', 'Dação em pagamento', 'Área pública de loteamento', 'Outra'].map((x) => [x, x]), largura: 'meia' }] },
    veiculo: { titulo: 'Veículo', campos: [
      { chave: 'veiculo.placa', rotulo: 'Placa', largura: 'meia' }, { chave: 'veiculo.renavam', rotulo: 'RENAVAM', largura: 'meia' }, { chave: 'veiculo.chassi', rotulo: 'Chassi' },
      { chave: 'veiculo.combustivel', rotulo: 'Combustível', tipo: 'select', opcoes: ['Gasolina', 'Etanol', 'Flex', 'Diesel', 'Elétrico', 'GNV'].map((x) => [x, x]), largura: 'meia' },
      { chave: 'veiculo.anoModelo', rotulo: 'Ano/modelo', largura: 'meia' }, { chave: 'veiculo.capacidadeTanque', rotulo: 'Tanque (litros)', tipo: 'numero', largura: 'meia' }] },
    seguro: { titulo: 'Seguro e garantia', campos: camposSeguro() },
    valores: { titulo: 'Valores e contas', aviso: 'O valor do bem só muda por reavaliação, melhoria ou baixa (para ficar registrado). Aqui muda só a conta.', campos: [
      { chave: 'contaId', rotulo: 'Conta contábil', tipo: 'select', opcoes: opc('contas', (c) => c.tipo === 'ativo'), obrigatorio: VP.config().obrigaContas }] },
    depreciacao: { titulo: 'Depreciação', aviso: 'Mudar vida útil ou residual vale daqui para frente (não recalcula o passado). Exige justificativa.', campos: [
      { chave: 'depreciacao.automatica', rotulo: 'Depreciar automaticamente no fechamento do mês', tipo: 'bool' },
      { chave: 'depreciacao.metodo', rotulo: 'Método', tipo: 'select', opcoes: Object.entries(L.metodos), vazio: false },
      { chave: 'depreciacao.inicio', rotulo: 'Início da depreciação', tipo: 'data', largura: 'meia' }, { chave: 'depreciacao.vidaUtilMeses', rotulo: 'Vida útil (meses)', tipo: 'numero', largura: 'meia' },
      { chave: 'depreciacao.residualTipo', rotulo: 'Residual em', tipo: 'select', opcoes: [['percentual', 'Percentual (%)'], ['valor', 'Valor (R$)']], vazio: false, largura: 'meia' }, { chave: 'depreciacao.residual', rotulo: 'Residual', tipo: 'numero', largura: 'meia' },
      { chave: 'depreciacao.producaoTotal', rotulo: 'Produção total estimada (método por unidades)', tipo: 'numero' },
      { chave: 'depreciacao.contaDebito', rotulo: 'Conta de débito', tipo: 'select', opcoes: opc('contas'), largura: 'meia' }, { chave: 'depreciacao.contaCredito', rotulo: 'Conta de crédito', tipo: 'select', opcoes: opc('contas'), largura: 'meia' },
      { chave: '_justificativa', rotulo: 'Justificativa da mudança', tipo: 'area', obrigatorio: true }] }
  });
  function camposSeguro() {
    return [
      { chave: 'seguro.seguradoraId', rotulo: 'Seguradora', tipo: 'select', opcoes: opc('seguradoras', (s) => !s.corretora), largura: 'meia' }, { chave: 'seguro.corretoraId', rotulo: 'Corretora', tipo: 'select', opcoes: opc('seguradoras', (s) => s.corretora), largura: 'meia' },
      { chave: 'seguro.apolice', rotulo: 'Apólice', largura: 'meia' }, { chave: 'seguro.adesao', rotulo: 'Data de adesão', tipo: 'data', largura: 'meia' },
      { chave: 'seguro.inicio', rotulo: 'Início do seguro', tipo: 'data', largura: 'meia' }, { chave: 'seguro.termino', rotulo: 'Término do seguro', tipo: 'data', largura: 'meia' },
      { chave: 'seguro.valor', rotulo: 'Valor do seguro', tipo: 'moeda', largura: 'meia' }, { chave: 'seguro.franquia', rotulo: 'Valor da franquia', tipo: 'moeda', largura: 'meia' },
      { chave: 'garantia.fornecedorId', rotulo: 'Garantia: fornecedor', tipo: 'select', opcoes: opc('fornecedores'), largura: 'meia' }, { chave: 'garantia.tipoId', rotulo: 'Tipo de garantia', tipo: 'select', opcoes: opc('tiposGarantia'), largura: 'meia' },
      { chave: 'garantia.inicio', rotulo: 'Início da garantia', tipo: 'data', largura: 'meia' }, { chave: 'garantia.termino', rotulo: 'Término da garantia', tipo: 'data', largura: 'meia' },
      { chave: 'garantia.observacao', rotulo: 'Observação da garantia', tipo: 'area' }];
  }

  A.editarSecao = (b, chave, depois) => {
    const sec = secoes(b)[chave];
    const valores = {};
    for (const c of sec.campos) valores[c.chave] = pegaCaminho(b, c.chave);
    valores._medidas = (b.medidas || []).map((m) => `${m.nome} = ${m.valor}`).join('\n');
    const campos = sec.campos.map((c) => (c.tipo === 'multi' ? Object.assign({}, c, { tipo: 'select' }) : c));
    const d = ui.formulario({
      titulo: 'Editar: ' + sec.titulo, campos, valores, largura: 'grande',
      intro: sec.aviso ? `<p class="aviso-inline">${esc(sec.aviso)}</p>` : '',
      salvar: async (v, dlg) => {
        const mudou = [];
        for (const c of sec.campos) {
          if (c.chave.startsWith('_')) continue;
          let novo = pegaCaminho(v, c.chave);
          if (c.tipo === 'multi') novo = [...dlg.querySelector(`[name="${CSS.escape(c.chave)}"]`).selectedOptions].map((o) => o.value).filter(Boolean);
          if (c.tipo === 'numero' || c.tipo === 'moeda') novo = novo ?? null;
          if (c.chave === 'criticidade' || c.chave === 'estado') novo = novo === '' ? null : Number(novo);
          const antigo = pegaCaminho(b, c.chave);
          if (JSON.stringify(antigo ?? '') !== JSON.stringify(novo ?? '')) { mudou.push({ campo: c.rotulo, antes: antigo ?? '', depois: novo ?? '' }); poeCaminho(b, c.chave, novo); }
        }
        if (chave === 'detalhes') {
          const medidas = String(v._medidas || '').split('\n').map((l) => l.split('=')).filter((p) => p[0]?.trim()).map(([n, ...r]) => ({ nome: n.trim(), valor: r.join('=').trim() }));
          if (JSON.stringify(medidas) !== JSON.stringify(b.medidas || [])) { mudou.push({ campo: 'Medidas', antes: (b.medidas || []).length + ' itens', depois: medidas.length + ' itens' }); b.medidas = medidas; }
        }
        if (chave === 'local' && VP.config().obrigaUnidade && !b.unidadeId) return 'A configuração exige unidade para todo bem.';
        if (!mudou.length) return null;
        const ev = VP.novoEvento(b.id, 'alteracao', { descricao: `Alterado: ${mudou.map((m) => m.campo).join(', ')}`, extra: { mudancas: mudou, justificativa: v._justificativa || '' } });
        await VP.db.gravarVarias({ bens: [b], eventos: [ev] });
        if (VP.termos && mudou.some((m) => m.campo === 'Responsável')) await VP.termos.abrir([b], 'troca de responsável');
        ui.aviso('Alterações salvas e registradas no histórico.');
        depois();
      }
    });
    // seleção múltipla para responsáveis adicionais
    const multi = sec.campos.find((c) => c.tipo === 'multi');
    if (multi) {
      const sel = d.el.querySelector(`[name="${CSS.escape(multi.chave)}"]`);
      sel.multiple = true; sel.size = 5;
      [...sel.options].forEach((o) => { o.selected = (b.responsaveisAdicionais || []).includes(o.value); });
    }
  };

  // ======================================================== NOVO BEM
  // O nome é digitado livre, com sugestões do catálogo e dos bens já cadastrados. Igual a um existente → oferece puxar as informações.
  // Classificação: mesma ideia. O que for novo entra sozinho nos Cadastros (produto e classificação) ao incluir o bem.
  // Nota fiscal (XML da NF-e): abre todos os itens; os dados da nota valem, e cada diferença com o cadastro anterior é mostrada para conferência.
  const GRUPO_DO_TIPO = { movel: 'moveis', intangivel: 'moveis', imovel: 'imoveis', infraestrutura: 'imoveis', veiculo: 'frota' };
  const tiposDoMesmoGrupo = (tipo) => Object.keys(GRUPO_DO_TIPO).filter((k) => GRUPO_DO_TIPO[k] === GRUPO_DO_TIPO[tipo]);
  const caminhoClassificacao = (c) => { const r = []; let x = c; while (x) { r.unshift(x.nome); x = x.paiId ? VP.db.pega('classificacoes', x.paiId) : null; } return r.join(' › '); };
  const classificacoesDoTipo = (tipo) => VP.db.lista('classificacoes').filter((c) => tiposDoMesmoGrupo(tipo).includes(VP.dadosDaClassificacao(c.id).tipoBem || 'movel'));
  const acharClassificacao = (texto, tipo) => {
    const t = u.normalizar(texto);
    if (!t) return null;
    return classificacoesDoTipo(tipo).find((c) => u.normalizar(caminhoClassificacao(c)) === t) || classificacoesDoTipo(tipo).find((c) => u.normalizar(c.nome) === t) || null;
  };
  VP.caminhoClassificacao = caminhoClassificacao; VP.acharClassificacao = acharClassificacao; // usados na importação por planilha
  const opcMaes = (tipo) => classificacoesDoTipo(tipo).filter((c) => c.nivel !== 'subclasse').map((c) => [c.id, caminhoClassificacao(c)]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const maeSugerida = (tipo) => { const ops = classificacoesDoTipo(tipo).filter((c) => c.nivel !== 'subclasse' && VP.dadosDaClassificacao(c.id).contaId); return (ops.find((c) => c.paiId) || ops[0])?.id || ''; };
  // Dados contábeis que o bem vai ter: da classificação existente, ou da classe-mãe se a classificação for nova
  const dadosPrevistos = (texto, paiId, tipo) => { const c = acharClassificacao(texto, tipo); return VP.dadosDaClassificacao(c ? c.id : paiId); };
  // O que já se sabe sobre um nome: catálogo de produtos e o bem mais recente com a mesma descrição
  VP.infoAnterior = (nome) => {
    const t = u.normalizar(nome);
    if (!t) return null;
    const produto = VP.db.lista('produtos').find((p) => u.normalizar(p.nome) === t) || null;
    const bem = VP.db.lista('bens', true).filter((b) => u.normalizar(b.descricao) === t).sort((a, b) => String(b.dataIncorporacao).localeCompare(String(a.dataIncorporacao)))[0] || null;
    if (!produto && !bem) return null;
    return {
      produto, bem, nome: produto?.nome || bem.descricao,
      classificacaoId: produto?.classificacaoId || bem?.classificacaoId || '',
      marca: bem?.detalhes?.marca || '', modelo: bem?.detalhes?.modelo || '',
      fornecedorId: bem?.fornecedorId || '', valor: bem?.origem?.valorUnitario ?? null,
      ncm: produto?.ncm || '', unidadeMedida: produto?.unidadeMedida || ''
    };
  };
  // Garante produto e classificação nos Cadastros (cria o que for novo)
  const garantirCadastros = async ({ tipo, nome, classificacaoTexto, classificacaoId, paiId, ncm, unidadeMedida }) => {
    const criados = [];
    let cl = classificacaoId ? VP.db.pega('classificacoes', classificacaoId) : acharClassificacao(classificacaoTexto, tipo);
    if (!cl) {
      const grupo = (paiId && VP.db.pega('classificacoes', paiId)) || VP.db.lista('classificacoes').find((c) => !c.paiId && (c.tipoBem || 'movel') === tipo) || VP.db.lista('classificacoes').find((c) => !c.paiId && tiposDoMesmoGrupo(tipo).includes(c.tipoBem || 'movel'));
      const nomeCl = String(classificacaoTexto || '').split('›').pop().trim();
      cl = { id: u.id(), nome: nomeCl, paiId: grupo?.id || '', nivel: !grupo ? 'grupo' : grupo.paiId ? 'subclasse' : 'classe', tipoBem: grupo ? '' : tipo, criadoPeloBem: true };
      await VP.db.gravar('classificacoes', cl);
      criados.push(`Classificação nova "${nomeCl}" criada${grupo ? ` dentro de "${grupo.nome}"` : ''}. Vida útil e conta vêm do grupo; confira em Cadastros → Classificações.`);
    }
    let p = VP.db.lista('produtos').find((x) => u.normalizar(x.nome) === u.normalizar(nome));
    if (!p) {
      p = { id: u.id(), nome, classificacaoId: cl.id, ncm: ncm || '', unidadeMedida: unidadeMedida || '', criadoPeloBem: true };
      await VP.db.gravar('produtos', p);
      criados.push(`Produto novo "${nome}" incluído no catálogo (Cadastros → Produtos).`);
    } else if ((ncm && !p.ncm) || (unidadeMedida && !p.unidadeMedida)) { p.ncm = p.ncm || ncm; p.unidadeMedida = p.unidadeMedida || unidadeMedida; await VP.db.gravar('produtos', p); }
    return { classificacao: cl, produto: p, criados };
  };

  T['novo-bem'] = (tipoParam) => {
    const tipo = L.tiposBem[tipoParam] ? tipoParam : 'movel';
    const cfg = VP.config();
    const nomeTipo = { movel: 'bem móvel', imovel: 'bem imóvel', veiculo: 'veículo (patrimônio)', intangivel: 'bem intangível', infraestrutura: 'bem de infraestrutura', semovente: 'semovente (animal)' }[tipo];
    if (VP.servidor?.ativo && !VP.servidor.podeAlterar()) return { titulo: 'Novo bem', html: '<p class="aviso-inline">Seu papel só consulta: cadastrar bens é do administrador ou do gestor.</p>' };
    // Lista vazia: diz onde cadastrar (os dados vêm da prefeitura; ver Painel → pendências)
    const faltaCadastro = (tabela, nome, aba) => (VP.db.lista(tabela).length ? '' : `Nenhum ${nome} cadastrado. Cadastre em Cadastros → ${aba} (dados a receber da prefeitura).`);
    const campos = [
      { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opc('unidades'), obrigatorio: cfg.obrigaUnidade, largura: 'meia', ajuda: faltaCadastro('unidades', 'local (unidade)', 'Unidades') },
      { chave: 'responsavelId', rotulo: 'Responsável (vem da unidade)', tipo: 'select', opcoes: opc('responsaveis'), largura: 'meia', ajuda: faltaCadastro('responsaveis', 'responsável', 'Responsáveis') },
      // dono do bem: a prefeitura ou um fundo. Vem da unidade; com uma entidade só, já vem marcada
      { chave: 'entidadeId', rotulo: 'Entidade (dona do bem: prefeitura ou fundo)', tipo: 'select', opcoes: opc('entidades'), largura: 'meia', padrao: VP.db.lista('entidades').length === 1 ? VP.db.lista('entidades')[0].id : '', ajuda: VP.db.lista('entidades').length ? 'Vem da unidade. Em nome de quem o bem foi comprado.' : 'Nenhuma entidade cadastrada. Cadastre a prefeitura e cada fundo em Cadastros → Entidades e fundos (nome e CNPJ).' },
      { chave: 'dataAquisicao', rotulo: 'Data de aquisição', tipo: 'data', obrigatorio: true, largura: 'meia', padrao: VP.Plataforma.hoje() },
      { chave: 'valor', rotulo: 'Valor de aquisição (R$)', tipo: 'moeda', obrigatorio: true, largura: 'meia' },
      // Valor residual sempre informado, em % ou R$ (decisão do usuário, 14/10/2026): vem da classificação e pode ser ajustado
      { chave: 'residualTipo', rotulo: 'Valor residual em', tipo: 'select', opcoes: [['percentual', 'Percentual (%)'], ['valor', 'Dinheiro (R$)']], vazio: false, padrao: 'percentual', largura: 'meia' },
      { chave: 'residual', rotulo: 'Valor residual', tipo: 'moeda', largura: 'meia', ajuda: 'Vem da classificação. O valor do bem nunca fica abaixo dele.' },
      { chave: 'quantidade', rotulo: 'Quantidade (gera um bem para cada)', tipo: 'numero', padrao: 1, largura: 'meia' },
      { chave: 'situacaoAquisicao', rotulo: 'Como entrou', tipo: 'select', opcoes: L.situacoesAquisicao.map((x) => [x, x]), padrao: 'Compra', vazio: false, largura: 'meia' },
      { chave: 'fornecedorId', rotulo: 'Fornecedor', tipo: 'select', opcoes: opc('fornecedores'), largura: 'meia', ajuda: VP.db.lista('fornecedores').length ? '' : 'Nenhum fornecedor ainda. Ele é cadastrado sozinho pela compra (Entradas) ou pela nota fiscal.' },
      { chave: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: Object.entries(L.estados).reverse(), padrao: 8, vazio: false, largura: 'meia' }
    ];
    if (cfg.codigoManual) campos.splice(0, 0, { chave: 'codigo', rotulo: 'Código do bem', tipo: 'numero', obrigatorio: true });
    if (!cfg.tombamentoAutomatico) campos.push({ chave: 'plaqueta', rotulo: 'Plaqueta (primeira, as próximas seguem a sequência)' });
    const mais = [
      { chave: 'nf.numero', rotulo: 'Nota fiscal', largura: 'meia' }, { chave: 'nf.emissao', rotulo: 'Emissão da nota', tipo: 'data', largura: 'meia' },
      { chave: 'origem.empenho', rotulo: 'Empenho (ano/número)', largura: 'meia' }, { chave: 'detalhes.marca', rotulo: 'Marca', largura: 'meia' },
      { chave: 'detalhes.modelo', rotulo: 'Modelo', largura: 'meia' }, { chave: 'detalhes.serie', rotulo: 'Número de série (um bem)', largura: 'meia' },
      { chave: 'localizacao', rotulo: 'Localização na unidade' }, { chave: 'complemento', rotulo: 'Complemento', tipo: 'area' }];
    const nomes = [...new Set(VP.db.lista('produtos').map((p) => p.nome).concat(VP.db.lista('bens').filter((b) => tiposDoMesmoGrupo(tipo).includes(b.tipo)).map((b) => b.descricao)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const classes = classificacoesDoTipo(tipo).map(caminhoClassificacao).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      titulo: 'Novo ' + nomeTipo,
      acoes: `${['imovel', 'infraestrutura'].includes(tipo) && VP.matricula ? '<button class="botao" data-nova-matricula>Cadastrar pela matrícula (PDF)</button> ' : ''}<label class="botao">Importar nota fiscal (XML)<input type="file" accept=".xml,text/xml" data-nfe hidden></label> <label class="botao">Importar PDF (nota ou ordem de compra)<input type="file" accept=".pdf,application/pdf" data-nf-pdf hidden></label> <a class="botao" href="#${tipo === 'veiculo' ? 'frota/veiculos' : 'bens/' + GRUPO_DO_TIPO[tipo]}">Cancelar</a>`,
      html: `<form class="cartao form-novo" id="form-novo" autocomplete="off">
          <p class="ajuda">Digite o nome do bem. Se já existir um igual (no catálogo ou em outro bem), o sistema oferece puxar as informações. Vida útil, valor residual e contas vêm da classificação; código e plaqueta são automáticos.</p>
          <div id="nf-pdf-info" class="achado" aria-live="polite"></div>
          <div class="form-grade">
            <div class="campo"><label for="f-descricao">Nome do bem <span class="obrig" title="obrigatório">*</span></label><input id="f-descricao" name="descricao" list="dl-nomes" placeholder="Ex.: Cadeira giratória"><datalist id="dl-nomes">${nomes.map((n) => `<option value="${esc(n)}">`).join('')}</datalist><div id="achado-nome" class="achado" aria-live="polite"></div></div>
            <div class="campo"><label for="f-classificacao">Classificação <span class="obrig" title="obrigatório">*</span></label><input id="f-classificacao" name="classificacaoTexto" list="dl-classes" placeholder="Digite para procurar ou criar"><datalist id="dl-classes">${classes.map((n) => `<option value="${esc(n)}">`).join('')}</datalist><div id="achado-classe" class="achado" aria-live="polite"></div></div>
          </div>
          ${ui.campos(campos)}
          <section class="detalhes-bem"><h4>Detalhes do bem</h4><p class="ajuda">Preencha o que tiver em mãos agora. O que faltar pode ser completado depois, na ficha do bem.</p>${ui.campos(mais)}</section>
          <div id="previa-novo" class="previa"></div>
          <p class="erro-form" role="alert"></p>
          <button class="botao primario grande" type="submit">Incluir</button>
        </form>`,
      ligar() {
        const f = document.getElementById('form-novo');
        document.querySelector('[data-nova-matricula]')?.addEventListener('click', () => VP.matricula.cadastrarNovo());
        const el = (n) => f.elements[n];
        const mostrarClasse = () => {
          const c = acharClassificacao(el('classificacaoTexto').value, tipo);
          const box = document.getElementById('achado-classe');
          const txt = el('classificacaoTexto').value.trim();
          const maeAtual = box.querySelector('[data-mae]')?.value || maeSugerida(tipo);
          box.innerHTML = !txt ? '' : c ? `<span class="ok-txt">✓ ${esc(caminhoClassificacao(c))}</span>` : `<span class="novo-txt">Classificação nova: será criada nos Cadastros ao incluir o bem.</span>
            <label class="mae">Fica dentro de <select data-mae>${opcMaes(tipo).map(([id, n]) => `<option value="${esc(id)}" ${id === maeAtual ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label><small>A conta e a vida útil vêm daqui.</small>`;
          box.querySelector('[data-mae]')?.addEventListener('change', previa);
          return c;
        };
        const usarAnterior = (info) => {
          const c = VP.db.pega('classificacoes', info.classificacaoId);
          if (c) el('classificacaoTexto').value = caminhoClassificacao(c);
          if (info.marca) el('detalhes.marca').value = info.marca;
          if (info.modelo) el('detalhes.modelo').value = info.modelo;
          if (info.fornecedorId) el('fornecedorId').value = info.fornecedorId;
          if (info.valor != null && !el('valor').value) el('valor').value = String(info.valor).replace('.', ',');
          mostrarClasse(); previa();
          document.getElementById('achado-nome').innerHTML = '<span class="ok-txt">✓ Informações do cadastro anterior aplicadas. Confira e ajuste o que mudou.</span>';
        };
        const mostrarNome = () => {
          const info = VP.infoAnterior(el('descricao').value);
          const box = document.getElementById('achado-nome');
          if (!info) { box.innerHTML = el('descricao').value.trim() ? '<span class="novo-txt">Nome novo: entra no catálogo de produtos ao incluir o bem.</span>' : ''; return; }
          const partes = [info.classificacaoId && `classificação ${VP.nome('classificacoes', info.classificacaoId)}`, info.marca && `marca ${info.marca}`, info.modelo && `modelo ${info.modelo}`, info.valor != null && `último valor ${u.moeda(info.valor)}`].filter(Boolean);
          box.innerHTML = `<span>Já cadastrado: <b>${esc(info.nome)}</b>${partes.length ? ` (${esc(partes.join(', '))})` : ''}.</span> <button type="button" class="botao pequeno primario" data-usar-anterior>Usar as informações</button>`;
          box.querySelector('[data-usar-anterior]').addEventListener('click', () => usarAnterior(info));
        };
        let ultimaAnalise = null;
        const previa = () => {
          const { valores: v } = ui.lerCampos(f, campos);
          const texto = el('classificacaoTexto').value.trim();
          const dc = texto ? dadosPrevistos(texto, document.querySelector('#achado-classe [data-mae]')?.value, tipo) : null;
          const qtd = Math.max(1, Math.floor(v.quantidade || 1));
          const campoRes = el('residual');
          if (campoRes && !campoRes.dataset.mexido) { campoRes.value = dc && !dc.naoDeprecia && dc.residualPct != null ? String(dc.residualPct).replace('.', ',') : ''; el('residualTipo').value = 'percentual'; }
          const lim = VP.config().limiteControle;
          // Classificador: item barato E de pouca durabilidade pode ser item de controle. Só sugere; a pessoa decide.
          const an = VP.controle && VP.classificador && tipo === 'movel' && v.valor > 0 && v.valor <= lim ? VP.classificador.analisar({ descricao: el('descricao').value, valor: v.valor, classificacaoId: texto ? acharClassificacao(texto, tipo)?.id : '', tipo }) : null;
          ultimaAnalise = an;
          const dica = !an ? '' : an.sugestao === 'controle'
            ? `<p class="aviso-inline" id="dica-controle">Sugestão: <b>item de controle</b> (sem plaqueta, fora do balancete) — ${esc(an.motivo)}${an.fonteVida ? ` (${esc(an.fonteVida)})` : ''}. Você decide. <button type="button" class="botao pequeno" data-ir-controle>Cadastrar como item de controle</button></p>`
            : !an.certeza ? `<p class="ajuda" id="dica-controle">Valor até ${u.moeda(lim)}, mas o sistema não sabe quanto este item dura. Se durar até ${VP.config().limiteControleMeses} meses, pode ser <b>item de controle</b>. <button type="button" class="botao pequeno" data-ir-controle>Cadastrar como item de controle</button></p>` : '';
          document.getElementById('previa-novo').innerHTML = dica + (dc ? `<b>Prévia:</b> ${qtd} bem(ns) a partir do código ${cfg.codigoManual ? (v.codigo || '?') : VP.proximoCodigo()} · conta ${esc(VP.nome('contas', dc.contaId))} · ${dc.naoDeprecia ? 'não deprecia' : `vida útil ${dc.vidaUtilMeses || '?'} meses, residual ${dc.residualPct ?? 0}%`}${v.valor ? ` · total ${u.moeda(v.valor * qtd)}` : ''}` : '');
          document.querySelector('[data-ir-controle]')?.addEventListener('click', () => VP.controle.novo(async (x) => { await VP.classificador.registrarDecisoes([{ descricao: x.descricao, escolha: 'controle', valor: x.valorUnitario, sugerido: ultimaAnalise?.sugestao }]); VP.app.ir('#controle'); }, { descricao: el('descricao').value, quantidade: v.quantidade || 1, valorUnitario: v.valor, unidadeId: v.unidadeId, responsavelId: v.responsavelId, fornecedorId: v.fornecedorId, estado: v.estado }));
        };
        el('descricao').addEventListener('input', mostrarNome);
        el('classificacaoTexto').addEventListener('input', () => { mostrarClasse(); previa(); });
        ['residual', 'residualTipo'].forEach((k) => el(k).addEventListener('input', () => { el('residual').dataset.mexido = '1'; }));
        f.addEventListener('change', (e) => {
          if (e.target.name === 'unidadeId') { const un = VP.db.pega('unidades', e.target.value); if (un?.responsavelId) el('responsavelId').value = un.responsavelId; if (un?.entidadeId) el('entidadeId').value = un.entidadeId; }
          previa();
        });
        f.addEventListener('input', previa);
        // PDF da nota (DANFE) ou da ordem de compra: o sistema lê, preenche o formulário e abre a conferência dos itens.
        // Os dois podem ser usados juntos: os valores vêm da nota; ordem de compra, empenho e dotação vêm da ordem de compra.
        // Cada PDF fica anexado em cada bem incluído.
        let pdfNota = null, nfLida = null, ocLida = null;
        const mostrarPdf = () => {
          const box = document.getElementById('nf-pdf-info');
          box.innerHTML = (pdfNota ? `<div><span class="ok-txt">✓ Nota fiscal (PDF): <b>${esc(pdfNota.nome)}</b>${nfLida?.itens.length ? ` · nota ${esc(nfLida.numero)}, ${nfLida.itens.length} item(ns) lido(s)` : ''}. Vai junto em cada bem incluído.</span> <button type="button" class="botao pequeno" data-tirar-pdf="nota">Tirar</button>${nfLida?.itens.length ? ' <button type="button" class="botao pequeno" data-conferir="nota">Conferir itens</button>' : ''}</div>` : '')
            + (ocLida ? `<div><span class="ok-txt">✓ Ordem de compra (PDF): <b>${esc(ocLida.anexo.nome)}</b> · ${esc(ocLida.numero)}/${esc(ocLida.ano)}, ${ocLida.itens.length} item(ns) lido(s). Vai junto em cada bem incluído.</span> <button type="button" class="botao pequeno" data-tirar-pdf="oc">Tirar</button>${ocLida.itens.length ? ' <button type="button" class="botao pequeno" data-conferir="oc">Conferir itens</button>' : ''}</div>` : '');
          box.querySelectorAll('[data-tirar-pdf]').forEach((x) => x.addEventListener('click', () => { if (x.dataset.tirarPdf === 'oc') ocLida = null; else { pdfNota = null; nfLida = null; } mostrarPdf(); }));
          box.querySelectorAll('[data-conferir]').forEach((x) => x.addEventListener('click', () => (x.dataset.conferir === 'oc' ? importarNotaFiscal(ocLida, tipo, pdfNota, ocLida) : importarNotaFiscal(nfLida, tipo, pdfNota, ocLida))));
        };
        // Preenche o formulário com o que foi lido (um item só: nome, quantidade e valor também)
        const preencher = (doc) => {
          const cnpj = String((doc.doOC ? doc.fornecedor.cnpj : doc.emitente.cnpj) || '').replace(/\D/g, '');
          const forn = cnpj && VP.db.lista('fornecedores').find((x) => String(x.documento || '').replace(/\D/g, '') === cnpj);
          if (forn) el('fornecedorId').value = forn.id;
          if (doc.doOC) { if (doc.empenho) el('origem.empenho').value = doc.empenho; }
          else { if (doc.numero) el('nf.numero').value = doc.numero; if (doc.emissao) el('nf.emissao').value = doc.emissao; }
          if (doc.itens.length === 1 && !(doc.doOC && nfLida?.itens.length)) {
            const it = doc.itens[0];
            el('descricao').value = it.nome; el('quantidade').value = String(Math.max(1, Math.round(it.quantidade)));
            el('valor').value = String(it.valorUnitario).replace('.', ',');
            mostrarNome(); previa();
          }
        };
        document.querySelector('[data-nf-pdf]').addEventListener('change', async (e) => {
          const arq = e.target.files[0]; e.target.value = ''; if (!arq) return;
          let anexo;
          try { anexo = await lerPdfNota(arq); } catch (err) { return ui.aviso(err.message, 'erro'); }
          if (!VP.notaPdf) { pdfNota = anexo; return mostrarPdf(); }
          ui.aviso('Lendo o PDF…');
          let lido;
          try { lido = await VP.notaPdf.lerDocumento(arq); } catch (err) { pdfNota = anexo; mostrarPdf(); return ui.aviso(`Não foi possível ler este PDF (${err.message}). Ele fica anexado como nota fiscal; preencha os dados.`, 'erro'); }
          if (lido.oc) {
            ocLida = Object.assign(lido.oc, { anexo });
            mostrarPdf(); preencher(ocLida);
            if (nfLida?.itens.length) importarNotaFiscal(nfLida, tipo, pdfNota, ocLida);
            else if (ocLida.itens.length) importarNotaFiscal(ocLida, tipo, pdfNota, ocLida);
            else ui.aviso(`Não deu para ler os itens desta ordem de compra: ${ocLida.avisos.join(' ')}`, 'erro');
            return;
          }
          pdfNota = anexo; nfLida = lido.nf;
          mostrarPdf(); preencher(nfLida);
          if (nfLida.itens.length) importarNotaFiscal(nfLida, tipo, pdfNota, ocLida);
          else ui.aviso(`Não deu para ler os itens deste PDF: ${nfLida.avisos.join(' ')} Ele fica anexado; preencha os dados.`, 'erro');
        });
        document.querySelector('[data-nfe]').addEventListener('change', async (e) => { const arq = e.target.files[0]; e.target.value = ''; if (arq) importarNotaFiscal(arq, tipo, pdfNota, ocLida); });
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const erro = f.querySelector('.erro-form');
          const lidos = ui.lerCampos(f, campos.concat(mais));
          const v = lidos.valores;
          v.descricao = el('descricao').value.trim();
          const textoCl = el('classificacaoTexto').value.trim();
          const faltando = lidos.faltando.concat(!v.descricao ? ['Nome do bem'] : [], !textoCl ? ['Classificação'] : []);
          if (faltando.length) { erro.textContent = 'Preencha: ' + faltando.join(', '); return; }
          if (cfg.codigoManual && VP.db.lista('bens', true).some((x) => x.codigo === v.codigo)) { erro.textContent = 'Já existe bem com este código.'; return; }
          const dcRes = dadosPrevistos(textoCl, document.querySelector('#achado-classe [data-mae]')?.value || '', tipo);
          if (!dcRes.naoDeprecia) {
            if (v.residual == null) { erro.textContent = 'Informe o Valor residual (em % ou R$). O valor do bem nunca fica abaixo dele.'; return; }
            if (v.residual < 0 || (v.residualTipo === 'percentual' && v.residual >= 100) || (v.residualTipo === 'valor' && v.residual >= v.valor)) { erro.textContent = v.residualTipo === 'valor' ? 'O valor residual (R$) deve ser menor que o valor de aquisição.' : 'O valor residual (%) deve ser de 0 a 99.'; return; }
          }
          const paiId = document.querySelector('#achado-classe [data-mae]')?.value || '';
          // Confere a conta ANTES de criar qualquer cadastro (não deixa classificação solta)
          if (cfg.obrigaContas && !dadosPrevistos(textoCl, paiId, tipo).contaId) { erro.textContent = 'Esta classificação não tem conta contábil. Escolha em "Fica dentro de" uma classe com conta, ou ajuste em Cadastros → Classificações.'; return; }
          const cad = await garantirCadastros({ tipo, nome: v.descricao, classificacaoTexto: textoCl, paiId });
          let criados;
          try { criados = await VP.criarBens(Object.assign({}, v, { produtoId: cad.produto.id, classificacaoId: cad.classificacao.id, tipo, quantidade: Math.max(1, Math.floor(v.quantidade || 1)), pdfNota, pdfOC: ocLida?.anexo, origem: Object.assign({}, v.origem, origemDaOC(ocLida)) })); } catch (err) { erro.textContent = err.message; return; }
          if (VP.termos) await VP.termos.abrir(criados, 'novo bem');
          if (ultimaAnalise && VP.classificador) await VP.classificador.registrarDecisoes([{ descricao: v.descricao, escolha: 'patrimonio', valor: v.valor, sugerido: ultimaAnalise.sugestao }]);
          ui.resultado({ titulo: 'Bens incluídos', sucesso: criados.map((b) => `${b.codigo} · plaqueta ${b.plaqueta} · ${b.descricao}`).concat(cad.criados, pdfNota ? [`Nota fiscal (PDF) anexada em cada bem: ${pdfNota.nome}`] : [], ocLida ? [`Ordem de compra ${ocLida.numero}/${ocLida.ano} (PDF) anexada em cada bem`] : []) });
          VP.estado.listaAtual = criados.map((b) => b.id);
          VP.app.ir('#bem/' + criados[0].id);
        });
      }
    };
  };

  // ---------------------------------------------------------------- nota fiscal eletrônica (XML da NF-e)
  VP.lerNFe = (xmlTexto) => {
    const doc = new DOMParser().parseFromString(xmlTexto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('O arquivo não é um XML válido.');
    const tag = (raiz, nome) => raiz?.getElementsByTagName(nome)[0]?.textContent?.trim() || '';
    const infNFe = doc.getElementsByTagName('infNFe')[0];
    if (!infNFe) throw new Error('Este XML não é de uma nota fiscal eletrônica (NF-e).');
    const ide = infNFe.getElementsByTagName('ide')[0], emit = infNFe.getElementsByTagName('emit')[0];
    const itens = [...infNFe.getElementsByTagName('det')].map((d) => {
      const p = d.getElementsByTagName('prod')[0];
      return { n: Number(d.getAttribute('nItem')) || 0, codigo: tag(p, 'cProd'), nome: tag(p, 'xProd'), ncm: tag(p, 'NCM'), unidade: tag(p, 'uCom'), quantidade: u.num(tag(p, 'qCom')) || 1, valorUnitario: u.num(tag(p, 'vUnCom')) || 0, valorTotal: u.num(tag(p, 'vProd')) || 0 };
    });
    return {
      numero: tag(ide, 'nNF'), serie: tag(ide, 'serie'), emissao: (tag(ide, 'dhEmi') || tag(ide, 'dEmi')).slice(0, 10),
      chave: (infNFe.getAttribute('Id') || '').replace(/^NFe/, ''),
      emitente: { cnpj: tag(emit, 'CNPJ') || tag(emit, 'CPF'), nome: tag(emit, 'xNome') }, itens
    };
  };
  // PDF da nota fiscal (DANFE): anexado em cada bem (tipo "Nota fiscal"); a leitura dos dados fica em nota-pdf.js.
  const lerPdfNota = async (arq) => {
    if (!/pdf$/i.test(arq.type || '') && !/\.pdf$/i.test(arq.name || '')) throw new Error('Escolha o arquivo PDF da nota fiscal.');
    const lim = VP.anexos?.LIMITE_MB || 10;
    if (arq.size > lim * 1048576) throw new Error(`O PDF passa de ${lim} MB. Reduza antes de anexar.`);
    return (await ui.lerArquivos([arq]))[0];
  };
  const copiaNota = (a, tipoAnexo = 'Nota fiscal') => Object.assign({}, a, { id: u.id(), tipoAnexo });
  // Dados da ordem de compra que vão para a origem do bem (como vêm no documento, sem converter)
  const origemDaOC = (oc) => (oc ? { ordemCompra: `${oc.numero}/${oc.ano}`, orcamento: oc.orcamento, finalidade: oc.finalidade } : {});
  const entidadeDoCnpj = (cnpj) => { const d = String(cnpj || '').replace(/\D/g, ''); return d ? VP.db.lista('entidades').find((x) => String(x.documento || x.cnpj || '').replace(/\D/g, '') === d) : null; };
  // fonte: o arquivo XML, ou a nota já lida do PDF (VP.notaPdf, mesmo formato)
  // oc: ordem de compra lida do PDF (opcional). Com nota, os valores vêm da nota; sem nota, os itens vêm da ordem de compra.
  const importarNotaFiscal = async (fonte, tipo, pdf = null, oc = null) => {
    let nf = fonte.doPDF ? fonte : null;
    if (fonte.doOC) nf = { numero: '', serie: '', emissao: fonte.data, chave: '', emitente: { cnpj: fonte.fornecedor.cnpj, nome: fonte.fornecedor.nome }, itens: fonte.itens, avisos: fonte.avisos, doOC: true };
    if (!nf) try { nf = VP.lerNFe(await fonte.text()); } catch (e) { return ui.aviso(e.message, 'erro'); }
    if (!nf.itens.length) return ui.aviso(nf.doOC ? 'A ordem de compra não tem itens.' : 'A nota não tem itens.', 'erro');
    const avisosOC = [];
    if (oc && !nf.doOC && oc.fornecedor.cnpj && nf.emitente.cnpj && oc.fornecedor.cnpj.replace(/\D/g, '') !== nf.emitente.cnpj.replace(/\D/g, '')) avisosOC.push(`O fornecedor da ordem de compra ${oc.numero}/${oc.ano} (${oc.fornecedor.nome}) é diferente do da nota (${nf.emitente.nome || nf.emitente.cnpj}). Confira se são da mesma compra.`);
    const entidade = oc ? entidadeDoCnpj(oc.entidadeCnpj) : null;
    const cnpj = nf.emitente.cnpj.replace(/\D/g, '');
    const fornecedor = VP.db.lista('fornecedores').find((x) => String(x.documento || '').replace(/\D/g, '') === cnpj && cnpj);
    const classes = classificacoesDoTipo(tipo).map(caminhoClassificacao).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    // Diferenças entre a nota e o cadastro anterior (a nota vale; a pessoa pode escolher o anterior)
    const linhas = nf.itens.map((it) => {
      const ant = VP.infoAnterior(it.nome);
      const difs = [];
      if (ant) {
        if (ant.valor != null && Math.abs(ant.valor - it.valorUnitario) > 0.005) difs.push({ campo: 'valor', rotulo: 'Valor unitário', nota: u.moeda(it.valorUnitario), anterior: u.moeda(ant.valor) });
        if (ant.fornecedorId && fornecedor && ant.fornecedorId !== fornecedor.id) difs.push({ campo: 'fornecedor', rotulo: 'Fornecedor', nota: fornecedor.nome, anterior: VP.nome('fornecedores', ant.fornecedorId) });
        if (ant.fornecedorId && !fornecedor) difs.push({ campo: 'fornecedor', rotulo: 'Fornecedor', nota: `${nf.emitente.nome} (novo)`, anterior: VP.nome('fornecedores', ant.fornecedorId) });
        if (ant.ncm && it.ncm && ant.ncm !== it.ncm) difs.push({ campo: 'ncm', rotulo: 'NCM', nota: it.ncm, anterior: ant.ncm });
        if (ant.unidadeMedida && it.unidade && u.normalizar(ant.unidadeMedida) !== u.normalizar(it.unidade)) difs.push({ campo: 'unidade', rotulo: 'Unidade de medida', nota: it.unidade, anterior: ant.unidadeMedida });
      }
      // Classificador: sugere item de controle (barato E pouca durabilidade) ou patrimônio. A pessoa decide em cada item.
      const an = VP.classificador && VP.controle ? VP.classificador.analisar({ descricao: it.nome, valor: it.valorUnitario, classificacaoId: ant?.classificacaoId, tipo }) : null;
      return { it, ant, difs, an };
    });
    const nSugControle = linhas.filter((l) => l.an?.sugestao === 'controle').length;
    const corpo = `
      <p>${nf.doOC ? `<b>Ordem de compra ${esc(oc.numero)}/${esc(oc.ano)}</b> · ${esc(nf.emitente.nome)} (${esc(nf.emitente.cnpj)}) · de ${u.data(nf.emissao)}` : `<b>Nota ${esc(nf.numero)}${nf.serie ? '/' + esc(nf.serie) : ''}</b> · ${esc(nf.emitente.nome)} (${esc(nf.emitente.cnpj)}) · emitida em ${u.data(nf.emissao)}${nf.af ? ` · AF ${esc(nf.af)}` : ''}`} · ${nf.itens.length} item(ns)</p>
      ${nf.doPDF || nf.doOC ? `<p class="aviso-inline"><b>Dados lidos do PDF ${nf.doOC ? 'da ordem de compra' : 'da nota'}.</b> Confira cada item com o PDF antes de incluir.${nf.avisos.concat(avisosOC).length ? '<br>' + nf.avisos.concat(avisosOC).map(esc).join('<br>') : ''}</p>` : avisosOC.length ? `<p class="aviso-inline">${avisosOC.map(esc).join('<br>')}</p>` : ''}
      ${oc ? `<div class="ajuda" id="dados-oc"><b>Da ordem de compra ${esc(oc.numero)}/${esc(oc.ano)}</b> (vai para a origem de cada bem): ${[['Empenho', oc.empenho], ['Dotação', oc.orcamento.dotacao], ['Órgão', oc.orcamento.orgao], ['Unidade orçamentária', oc.orcamento.unidade], ['Ação', oc.orcamento.acao], ['Elemento', oc.orcamento.elemento], ['Vínculo', oc.orcamento.vinculo], ['Entidade', entidade?.nome]].filter(([, x]) => x).map(([k, x]) => `${k}: ${esc(x)}`).join(' · ')}</div>` : ''}
      ${fornecedor ? '' : '<p class="aviso-inline">Fornecedor ainda não cadastrado: será incluído em Cadastros → Fornecedores.</p>'}
      <div class="form-grade">${ui.campos([
        { chave: 'unidadeId', rotulo: 'Unidade que recebe', tipo: 'select', opcoes: opc('unidades'), largura: 'meia' },
        { chave: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: Object.entries(L.estados).reverse(), padrao: 8, vazio: false, largura: 'meia' },
        { chave: 'empenho', rotulo: 'Empenho (ano/número)', largura: 'meia', padrao: oc?.empenho || '' }, { chave: 'dataIncorporacao', rotulo: 'Data de incorporação', tipo: 'data', padrao: VP.Plataforma.hoje(), largura: 'meia' },
        { chave: 'recebidoPor', rotulo: 'Recebido por (quem conferiu e recebeu)', largura: 'meia' }].concat(pdf || nf.doOC ? [] : [{ chave: 'pdfNota', rotulo: 'PDF da nota fiscal (opcional): vai junto em cada bem', tipo: 'arquivo', aceita: '.pdf,application/pdf', largura: 'meia' }]))}</div>
      ${pdf ? `<p class="ajuda">Nota fiscal (PDF): <b>${esc(pdf.nome)}</b>. Vai junto em cada bem e item de controle incluído.</p>` : ''}
      ${nSugControle ? `<p class="aviso-inline" id="aviso-sug-controle"><b>${nSugControle} de ${linhas.length} item(ns)</b> foram sugeridos como <b>item de controle</b> (sem plaqueta, fora do balancete): custam até ${u.moeda(VP.config().limiteControle)} e duram até ${VP.config().limiteControleMeses} meses. Confira em cada item o campo "Vai para" e mude se precisar.</p>` : ''}
      <p class="ajuda">Os dados da nota valem. Quando um item já existe no cadastro e alguma informação mudou, ela aparece em destaque: confira e escolha, em cada uma, se fica a da nota ou a anterior.</p>
      <datalist id="dl-classes-nf">${classes.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="itens-nf">${linhas.map((l, i) => `
        <div class="item-nf ${l.an?.sugestao === 'controle' ? 'vai-controle' : ''}" data-i="${i}">
          <label class="linha-check"><input type="checkbox" data-incluir checked> <b>${esc(l.it.nome)}</b></label>
          <div class="item-nf-dados">${u.inteiro(l.it.quantidade)} ${esc(l.it.unidade || 'un')} × ${u.moeda(l.it.valorUnitario)} = <b>${u.moeda(l.it.valorTotal || l.it.quantidade * l.it.valorUnitario)}</b>${l.it.ncm ? ` · NCM ${esc(l.it.ncm)}` : ''}</div>
          ${l.an ? VP.classificador.seletor(l.an, 'data-destino') : ''}
          <div class="item-nf-sit">${l.ant ? `<span class="selo-status s-ativo">Já cadastrado</span>` : '<span class="selo-status t-pendente">Novo: entra no catálogo</span>'}</div>
          <label class="item-nf-classe">Classificação <input data-classe list="dl-classes-nf" value="${esc(l.ant?.classificacaoId ? caminhoClassificacao(VP.db.pega('classificacoes', l.ant.classificacaoId) || {}) : '')}" placeholder="Digite para procurar ou criar"></label>
          <label class="item-nf-classe">Se a classificação for nova, fica dentro de <select data-mae>${opcMaes(tipo).map(([id, n]) => `<option value="${esc(id)}" ${id === maeSugerida(tipo) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          ${l.difs.length ? `<div class="difs"><p class="aviso-inline">Mudou em relação ao cadastro anterior. Confira:</p>${l.difs.map((d, k) => `
            <div class="dif"><span>${esc(d.rotulo)}</span>
              <label><input type="radio" name="d-${i}-${k}" value="nota" checked> Da nota: <b>${esc(d.nota)}</b></label>
              <label><input type="radio" name="d-${i}-${k}" value="anterior"> Anterior: ${esc(d.anterior)}</label></div>`).join('')}</div>` : ''}
        </div>`).join('')}</div>
      <p class="erro-form" role="alert"></p>`;
    // item de controle não precisa de classificação: os campos somem quando "Vai para" é item de controle
    setTimeout(() => document.querySelectorAll('.item-nf [data-destino]').forEach((el) => el.addEventListener('change', () => el.closest('.item-nf').classList.toggle('vai-controle', el.value === 'controle'))), 0);
    ui.modal({ titulo: nf.doOC ? 'Conferir itens da ordem de compra' : 'Conferir itens da nota fiscal', largura: 'grande', corpo, botoes: [{ texto: 'Cancelar' }, { texto: 'Incluir bens', classe: 'primario', fecha: false, acao: async (d, fechar) => {
      const geral = ui.lerCampos(d, [{ chave: 'unidadeId' }, { chave: 'estado' }, { chave: 'empenho' }, { chave: 'dataIncorporacao' }, { chave: 'recebidoPor' }]).valores;
      const escolhidos = linhas.map((l, i) => ({ l, box: d.querySelector(`.item-nf[data-i="${i}"]`) })).filter((x) => x.box.querySelector('[data-incluir]').checked);
      if (!escolhidos.length) { d.querySelector('.erro-form').textContent = 'Marque pelo menos um item.'; return false; }
      const destino = (x) => x.box.querySelector('[data-destino]')?.value || 'patrimonio';
      const paraControle = escolhidos.filter((x) => destino(x) === 'controle');
      const paraBens = escolhidos.filter((x) => destino(x) !== 'controle');
      const semClasse = paraBens.filter((x) => !x.box.querySelector('[data-classe]').value.trim());
      if (semClasse.length) { d.querySelector('.erro-form').textContent = `Informe a classificação de: ${semClasse.map((x) => x.l.it.nome).join(', ')}`; return false; }
      const semConta = VP.config().obrigaContas ? paraBens.filter((x) => !dadosPrevistos(x.box.querySelector('[data-classe]').value, x.box.querySelector('[data-mae]').value, tipo).contaId) : [];
      if (semConta.length) { d.querySelector('.erro-form').textContent = `Sem conta contábil: ${semConta.map((x) => x.l.it.nome).join(', ')}. Escolha uma classe com conta em "fica dentro de".`; return false; }
      let pdfN = pdf;
      const pdfEscolhido = d.querySelector('input[name="pdfNota"]')?.files?.[0];
      if (!pdfN && pdfEscolhido) { try { pdfN = await lerPdfNota(pdfEscolhido); } catch (e) { d.querySelector('.erro-form').textContent = e.message; return false; } }
      let forn = fornecedor;
      const sucesso = [], falhas = [], avisos = [];
      if (pdfN) avisos.push(`Nota fiscal (PDF) anexada em cada bem e item de controle: ${pdfN.nome}`);
      if (oc) avisos.push(`Ordem de compra ${oc.numero}/${oc.ano}${oc.anexo ? ' (PDF)' : ''} ligada a cada bem${oc.anexo ? ' e anexada' : ''}.`);
      const nfDoBem = nf.doOC ? {} : { numero: nf.numero, serie: nf.serie, emissao: nf.emissao, chave: nf.chave, af: nf.af || '' };
      if (!forn) { forn = { id: u.id(), nome: nf.emitente.nome || `Fornecedor CNPJ ${nf.emitente.cnpj}`, documento: nf.emitente.cnpj, criadoPelaNota: true }; await VP.db.gravar('fornecedores', forn); avisos.push(`Fornecedor "${forn.nome}" incluído nos Cadastros.`); }
      // Itens de controle: sem plaqueta, sem classificação, fora do balancete
      if (paraControle.length) {
        let n = Number(VP.controle.proximoCodigo().replace(/\D/g, ''));
        const itensC = paraControle.map(({ l }) => VP.controle.montar({ descricao: l.it.nome, quantidade: Math.max(1, Math.round(l.it.quantidade)), valorUnitario: l.it.valorUnitario, unidadeId: geral.unidadeId, dataEntrada: geral.dataIncorporacao || nf.emissao, estado: Number(geral.estado || 8), fornecedorId: forn.id, nf: nfDoBem, vidaUtilAnos: l.an?.vidaUtilMeses ? Math.round(l.an.vidaUtilMeses / 12 * 10) / 10 : null }, 'C-' + String(n++).padStart(6, '0'), nf.doOC ? `Incluído pela ordem de compra ${oc.numero}/${oc.ano} (item ${l.it.n})` : `Incluído pela nota fiscal ${nf.numero} (item ${l.it.n})`));
        if (pdfN) itensC.forEach((x) => x.anexos.push(copiaNota(pdfN)));
        if (oc?.anexo) itensC.forEach((x) => x.anexos.push(copiaNota(oc.anexo, 'Ordem de compra')));
        await VP.db.gravar('bensControle', itensC);
        for (const x of itensC) sucesso.push(`Item de controle ${x.codigo} · ${x.descricao} (${u.inteiro(x.quantidade)} un., sem plaqueta)`);
      }
      await VP.classificador?.registrarDecisoes(escolhidos.filter(({ l }) => l.an).map((x) => ({ descricao: x.l.it.nome, escolha: destino(x), valor: x.l.it.valorUnitario, sugerido: x.l.an.sugestao })));
      const todosCriados = [];
      for (const { l, box } of paraBens) {
        const escolha = (campo) => { const k = l.difs.findIndex((x) => x.campo === campo); return k < 0 ? 'nota' : box.querySelector(`input[name="d-${box.dataset.i}-${k}"]:checked`).value; };
        const cad = await garantirCadastros({ tipo, nome: l.it.nome, classificacaoTexto: box.querySelector('[data-classe]').value, paiId: box.querySelector('[data-mae]').value, ncm: escolha('ncm') === 'nota' ? l.it.ncm : l.ant?.ncm, unidadeMedida: escolha('unidade') === 'nota' ? l.it.unidade : l.ant?.unidadeMedida });
        avisos.push(...cad.criados);
        const valor = escolha('valor') === 'nota' ? l.it.valorUnitario : l.ant.valor;
        const fornecedorId = escolha('fornecedor') === 'nota' ? forn.id : l.ant.fornecedorId;
        const qtd = Math.max(1, Math.round(l.it.quantidade));
        try {
          const criados = await VP.criarBens({ descricao: l.it.nome, produtoId: cad.produto.id, classificacaoId: cad.classificacao.id, tipo, unidadeId: geral.unidadeId, dataAquisicao: nf.emissao || VP.Plataforma.hoje(), dataIncorporacao: geral.dataIncorporacao, valor, quantidade: qtd, situacaoAquisicao: 'Compra', fornecedorId, estado: geral.estado || 8,
            nf: nfDoBem, origem: Object.assign({ empenho: geral.empenho || '' }, origemDaOC(oc), nf.af ? { af: nf.af } : {}), entidadeId: entidade?.id, detalhes: l.ant ? { marca: l.ant.marca, modelo: l.ant.modelo } : {}, origemTexto: nf.doOC ? `ordem de compra ${oc.numero}/${oc.ano} item ${l.it.n}` : `NF ${nf.numero} item ${l.it.n}`, pdfNota: pdfN, pdfOC: oc?.anexo });
          todosCriados.push(...criados);
          sucesso.push(`${l.it.nome}: ${criados.length} bem(ns), códigos ${criados[0].codigo}${criados.length > 1 ? ' a ' + criados[criados.length - 1].codigo : ''}${l.difs.length ? ' (diferenças conferidas)' : ''}`);
        } catch (e) { falhas.push({ item: l.it.nome, motivo: e.message }); }
      }
      if (todosCriados.length && geral.recebidoPor) {
        const docRec = nf.doOC ? `Ordem de compra ${oc.numero}/${oc.ano}` : `NF ${nf.numero}`;
        const evs = todosCriados.map((b) => { b.recebimento = { por: geral.recebidoPor, data: geral.dataIncorporacao || VP.Plataforma.hoje(), documento: docRec }; return VP.novoEvento(b.id, 'recebimento', { data: b.recebimento.data, descricao: `Recebido por ${geral.recebidoPor} · ${docRec}`, extra: { recebidoPor: geral.recebidoPor, documento: docRec } }); });
        await VP.db.gravarVarias({ bens: todosCriados, eventos: evs });
      }
      if (todosCriados.length && VP.termos) { const tt = await VP.termos.abrir(todosCriados, 'nota fiscal'); if (tt.length) avisos.push(`${tt.length} termo(s) de responsabilidade aguardando assinatura (prazo ${VP.termos.prazoDias()} dias) — menu Termos.`); }
      fechar();
      ui.resultado({ titulo: `${nf.doOC ? `Ordem de compra ${oc.numero}/${oc.ano}` : `Nota ${nf.numero}`}: ${paraControle.length ? 'bens e itens de controle incluídos' : 'bens incluídos'}`, sucesso: sucesso.concat(avisos), falhas });
      VP.app.ir('#bens/' + (GRUPO_DO_TIPO[tipo] === 'frota' ? 'moveis' : GRUPO_DO_TIPO[tipo]));
    } }] });
  };

  // Cria N bens + incorporação (usado em Novo bem, Replicar e Itens a incorporar)
  VP.criarBens = async (v) => {
    const { bens, eventos } = VP.montarBens(v);
    if (v.pdfNota) for (const b of bens) b.anexos.push(copiaNota(v.pdfNota));
    if (v.pdfOC) for (const b of bens) b.anexos.push(copiaNota(v.pdfOC, 'Ordem de compra'));
    await VP.db.gravarVarias({ bens, eventos });
    return bens;
  };
  // Monta os bens sem gravar (a importação por planilha monta muitos e grava de uma vez). codigoInicial: para vários lotes seguidos.
  VP.montarBens = (v, codigoInicial = null, ctxPlaquetas = null) => {
    const cfg = VP.config();
    const dc = VP.dadosDaClassificacao(v.classificacaoId);
    const grupo = VP.grupoDe(v.classificacaoId);
    const unidade = VP.db.pega('unidades', v.unidadeId);
    let codigo = cfg.codigoManual && v.codigo ? v.codigo : codigoInicial || VP.proximoCodigo();
    const ctx = ctxPlaquetas || VP.contextoPlaquetas();
    const plTexto = v.plaqueta != null && v.plaqueta !== '' ? String(v.plaqueta).trim() : '';
    const plNum = plTexto && /^\d+$/.test(plTexto) ? Number(plTexto) : null;
    if (plTexto && !plNum && (v.quantidade || 1) > 1) throw new Error('Plaqueta com letras só vale para 1 bem por vez');
    const bens = [], eventos = [];
    for (let i = 0; i < (v.quantidade || 1); i++) {
      const pl = plTexto ? (plNum ? String(plNum + i) : plTexto) : ctx.proxima();
      if (plTexto && !v._plaquetaConferida) { if (ctx.emUso(pl)) { const d = VP.donoDaPlaqueta(pl); throw new Error(`A plaqueta ${pl} já é usada${d ? ` (bem ${d.codigo} · ${d.descricao}${d.status === 'baixado' ? ', baixado' : d.excluido ? ', na Lixeira' : ''})` : ''}. Plaqueta não é reaproveitada.`); } ctx.reservar(pl); }
      const b = {
        id: u.id(), codigo, plaqueta: pl, plaquetaAnterior: '', tipo: v.tipo || dc.tipoBem || grupo?.tipoBem || 'movel', status: 'ativo', estado: Number(v.estado || 7),
        descricao: v.descricao, complemento: v.complemento || v.descricao, produtoId: v.produtoId || '', classificacaoId: v.classificacaoId,
        unidadeId: v.unidadeId || '', localizacao: v.localizacao || '', responsavelId: v.responsavelId || unidade?.responsavelId || '', responsaveisAdicionais: [],
        dataAquisicao: v.dataAquisicao, dataIncorporacao: v.dataIncorporacao || VP.Plataforma.hoje(), situacaoAquisicao: v.situacaoAquisicao || 'Compra',
        comissaoId: '', exerciciosAnteriores: false, entidadeId: v.entidadeId || VP.db.pega('unidades', v.unidadeId)?.entidadeId || (VP.db.lista('entidades').length === 1 ? VP.db.lista('entidades')[0].id : VP.db.pega('entidades', 'E1') ? 'E1' : ''), fornecedorId: v.fornecedorId || '', contaId: dc.contaId || '',
        origem: Object.assign({ quantidade: v.quantidade || 1, valorUnitario: v.valor }, v.origem || {}), nf: v.nf || {},
        detalhes: Object.assign({ tombamento: cfg.tombamentoAutomatico ? String(codigo) : '', dataTombamento: cfg.tombamentoAutomatico ? VP.Plataforma.hoje() : '', textoJuridico: {} }, v.detalhes || {}, i > 0 ? { serie: '' } : {}),
        endereco: null, medidas: [], veiculo: v.tipo === 'veiculo' || dc.tipoBem === 'veiculo' || grupo?.tipoBem === 'veiculo' ? {} : null, seguro: null, garantia: null, fotos: [], anexos: [], criticidade: 2,
        depreciacao: { automatica: !dc.naoDeprecia, metodo: 'linear', inicio: u.somaMeses(v.dataIncorporacao || VP.Plataforma.hoje(), 1) + '-01', vidaUtilMeses: dc.vidaUtilMeses || 0, residualTipo: v.residualTipo || 'percentual', residual: v.residual ?? dc.residualPct ?? 0, producaoTotal: 0, contaDebito: 'C_VPD', contaCredito: dc.contaDepreciacaoId || '' }
      };
      bens.push(b);
      eventos.push(VP.novoEvento(b.id, 'incorporacao', { data: b.dataIncorporacao, valor: v.valor, descricao: `Incorporação — ${b.situacaoAquisicao}${v.origemTexto ? ' · ' + v.origemTexto : ''}`, extra: { contaDebito: b.contaId } }));
      codigo++;
    }
    return { bens, eventos };
  };

  // ======================================================== AÇÕES
  const ultimaDataFisica = (b) => VP.eventosDoBem(b.id).filter((e) => L.eventos[e.tipo]?.grupo === 'fisico').map((e) => e.data).sort().pop() || '';
  const separarBaixados = (bens) => ({ ok: bens.filter((b) => b.status !== 'baixado'), falhas: bens.filter((b) => b.status === 'baixado').map((b) => ({ item: `${b.codigo} · ${b.descricao}`, motivo: 'Bem já baixado' })) });

  A.transferir = (bens, depois) => {
    const cfg = VP.config();
    const campos = [
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposTransferencia), vazio: false },
      { chave: 'destinoUnidadeId', rotulo: 'Unidade de destino (interna)', tipo: 'select', opcoes: opc('unidades') },
      { chave: 'responsavelDestinoId', rotulo: 'Responsável no destino', tipo: 'select', opcoes: opc('responsaveis') },
      { chave: 'destinoExterno', rotulo: 'Para onde vai (externa)', placeholder: 'Ex.: Oficina Exemplo, Associação X' },
      { chave: 'retornoPrevisto', rotulo: 'Volta prevista (externa)', tipo: 'data', largura: 'meia' },
      { chave: 'entidadeDestinoId', rotulo: 'Entidade de destino (entre entidades)', tipo: 'select', opcoes: opc('entidades'), largura: 'meia' },
      { chave: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: VP.db.lista('motivos').filter((m) => m.tipo === 'transferencia').map((m) => [m.nome, m.nome]) },
      { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true, largura: 'meia' },
      { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }];
    ui.formulario({
      titulo: `Transferir ${bens.length} bem(ns)`, campos, largura: 'media',
      intro: cfg.exigeAceiteTransferencia ? '<p class="aviso-inline">Transferência interna fica <b>aguardando aceite</b> de quem recebe (configuração). Externa e entre entidades valem na hora.</p>' : '',
      textoSalvar: 'Transferir',
      salvar: async (v) => {
        if (v.tipo === 'interna' && !v.destinoUnidadeId) return 'Escolha a unidade de destino.';
        if (v.tipo === 'externa' && !v.destinoExterno) return 'Diga para onde o bem vai.';
        if (v.tipo === 'entidade' && !v.entidadeDestinoId) return 'Escolha a entidade de destino.';
        const { ok, falhas } = separarBaixados(bens);
        const validos = [];
        for (const b of ok) {
          if (cfg.validaTransferenciaRetroativa && v.data < ultimaDataFisica(b)) falhas.push({ item: `${b.codigo} · ${b.descricao}`, motivo: `Data anterior à última movimentação (${u.data(ultimaDataFisica(b))})` });
          else if (v.tipo === 'interna' && b.unidadeId === v.destinoUnidadeId) falhas.push({ item: `${b.codigo} · ${b.descricao}`, motivo: 'Já está nesta unidade' });
          else validos.push(b);
        }
        if (!validos.length) { ui.resultado({ titulo: 'Transferência', falhas }); return null; }
        const t = { id: u.id(), tipo: v.tipo, bens: validos.map((b) => b.id), origens: Object.fromEntries(validos.map((b) => [b.id, b.unidadeId])), origemUnidadeId: validos[0].unidadeId, destinoUnidadeId: v.destinoUnidadeId, responsavelDestinoId: v.responsavelDestinoId, destinoExterno: v.destinoExterno, retornoPrevisto: v.retornoPrevisto, entidadeDestinoId: v.entidadeDestinoId, motivo: v.motivo, data: v.data, observacao: v.observacao, situacao: 'pendente' };
        await VP.db.gravar('transferencias', t);
        if (!(cfg.exigeAceiteTransferencia && v.tipo === 'interna')) await A.efetivarTransferencia(t);
        ui.resultado({
          titulo: t.situacao === 'pendente' ? 'Transferência enviada para aceite' : 'Transferência feita', sucesso: validos.map((b) => `${b.codigo} · ${b.descricao}`), falhas,
          extra: `<p><button type="button" class="botao" onclick="VP.documentos.termoTransferencia(VP.db.pega('transferencias','${t.id}'))">Imprimir termo de transferência</button></p>`
        });
        depois && depois();
      }
    });
  };
  A.efetivarTransferencia = async (t) => {
    const bens = t.bens.map((id) => VP.db.pega('bens', id)).filter(Boolean);
    const evs = [];
    for (const b of bens) {
      if (t.tipo === 'interna') {
        evs.push(VP.novoEvento(b.id, 'transferencia', { data: t.data, descricao: `Transferência interna: ${VP.nome('unidades', b.unidadeId)} → ${VP.nome('unidades', t.destinoUnidadeId)}`, extra: { de: b.unidadeId, para: t.destinoUnidadeId, transferenciaId: t.id, motivo: t.motivo } }));
        b.unidadeId = t.destinoUnidadeId;
        if (t.responsavelDestinoId) b.responsavelId = t.responsavelDestinoId;
        else b.responsavelId = VP.db.pega('unidades', t.destinoUnidadeId)?.responsavelId || b.responsavelId;
      } else if (t.tipo === 'externa') {
        evs.push(VP.novoEvento(b.id, 'saida_externa', { data: t.data, descricao: `Saída externa para ${t.destinoExterno}${t.retornoPrevisto ? ' · volta prevista ' + u.data(t.retornoPrevisto) : ''}`, extra: { transferenciaId: t.id, motivo: t.motivo } }));
        b.status = 'cedido';
      } else {
        evs.push(VP.novoEvento(b.id, 'transferencia', { data: t.data, descricao: `Transferência entre entidades: ${VP.nome('entidades', b.entidadeId)} → ${VP.nome('entidades', t.entidadeDestinoId)}`, extra: { deEntidade: b.entidadeId, paraEntidade: t.entidadeDestinoId, transferenciaId: t.id, motivo: t.motivo } }));
        b.entidadeId = t.entidadeDestinoId;
      }
    }
    t.situacao = 'aceita';
    t.dataResposta = VP.Plataforma.hoje();
    await VP.db.gravarVarias({ bens, eventos: evs, transferencias: [t] });
    if (t.tipo === 'interna' && VP.termos) await VP.termos.abrir(bens, 'transferência'); // novo responsável: termo aguardando assinatura
  };

  const acaoSimples = (titulo, campos, aplicar, { filtro = () => null } = {}) => (bens, depois) => ui.formulario({
    titulo: `${titulo} — ${bens.length} bem(ns)`, campos, largura: 'media', textoSalvar: titulo,
    salvar: async (v) => {
      const { ok, falhas } = separarBaixados(bens);
      const feitos = [], bensGravar = [], evs = [];
      for (const b of ok) {
        const motivo = filtro(b);
        if (motivo) { falhas.push({ item: `${b.codigo} · ${b.descricao}`, motivo }); continue; }
        const ev = aplicar(b, v);
        if (ev) evs.push(...[].concat(ev));
        bensGravar.push(b);
        feitos.push(`${b.codigo} · ${b.descricao}`);
      }
      await VP.db.gravarVarias({ bens: bensGravar, eventos: evs });
      ui.resultado({ titulo, sucesso: feitos, falhas });
      depois && depois();
    }
  });

  // as opções de motivo dependem dos cadastros, por isso a janela é montada na hora
  A.desuso = (bens, depois) => {
    const f = acaoSimples('Desuso', [
      { chave: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: VP.db.lista('motivos').filter((m) => m.tipo === 'desuso').map((m) => [m.nome, m.nome]), obrigatorio: true },
      { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true },
      { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
    (b, v) => { b.status = 'desuso'; return VP.novoEvento(b.id, 'desuso', { data: v.data, descricao: v.observacao || 'Bem colocado em desuso', extra: { motivo: v.motivo } }); },
    { filtro: (b) => (b.status === 'desuso' ? 'Já está em desuso' : null) });
    return f(bens, depois);
  };
  A.retorno = acaoSimples('Volta ao uso', [
    { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true },
    { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
  (b, v) => { const antes = b.status; b.status = 'ativo'; return VP.novoEvento(b.id, 'retorno', { data: v.data, descricao: (v.observacao || 'Bem voltou ao uso') + ` (estava: ${L.status[antes]})` }); },
  { filtro: (b) => (b.status === 'ativo' ? 'Já está em uso' : null) });
  // Inservível (livro de controle patrimonial): não serve mais para a unidade, mas pode ser vendido, doado ou transferido
  A.inservivel = acaoSimples('Declarar inservível', [
    { chave: 'motivo', rotulo: 'Por que não serve mais', tipo: 'select', opcoes: [['Ocioso', 'Ocioso (em condições de uso, sem aproveitamento)'], ['Antieconômico', 'Antieconômico (manutenção cara ou rendimento baixo)'], ['Irrecuperável', 'Irrecuperável (conserto não compensa)'], ['Obsoleto', 'Obsoleto']], obrigatorio: true },
    { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true },
    { chave: 'laudo', rotulo: 'Laudo / parecer (número ou observação)', tipo: 'area' }],
  (b, v) => { const antes = b.status; b.status = 'inservivel'; return VP.novoEvento(b.id, 'inservivel', { data: v.data, descricao: `Declarado inservível: ${v.motivo}${v.laudo ? ' · ' + v.laudo : ''} (estava: ${L.status[antes]})`, extra: { motivo: v.motivo, laudo: v.laudo || '' } }); },
  { filtro: (b) => (b.status === 'inservivel' ? 'Já está como inservível' : null) });
  A.vistoria = acaoSimples('Vistoria', [
    { chave: 'estado', rotulo: 'Estado encontrado', tipo: 'select', opcoes: Object.entries(L.estados).reverse(), obrigatorio: true },
    { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true },
    { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
  (b, v) => { b.estado = Number(v.estado); return VP.novoEvento(b.id, 'vistoria', { data: v.data, descricao: v.observacao || 'Vistoria', extra: { estado: Number(v.estado) } }); });

  A.complementares = (bens, depois) => ui.formulario({
    titulo: `Dados complementares — ${bens.length} bem(ns)`, largura: 'media', textoSalvar: 'Aplicar',
    intro: '<p class="ajuda">Só os campos preenchidos são aplicados. Os vazios ficam como estão em cada bem.</p>',
    campos: [
      { chave: 'detalhes.marca', rotulo: 'Marca', largura: 'meia' }, { chave: 'detalhes.modelo', rotulo: 'Modelo', largura: 'meia' },
      { chave: 'detalhes.cor', rotulo: 'Cor', largura: 'meia' }, { chave: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: Object.entries(L.estados).reverse(), largura: 'meia' },
      { chave: 'localizacao', rotulo: 'Localização na unidade' }, { chave: 'criticidade', rotulo: 'Criticidade', tipo: 'select', opcoes: [[1, 'Baixa'], [2, 'Média'], [3, 'Alta']] },
      { chave: 'detalhes.textoJuridico.categoria', rotulo: 'Texto jurídico: categoria', largura: 'meia' }, { chave: 'detalhes.textoJuridico.numeroAno', rotulo: 'Número/ano', largura: 'meia' }],
    salvar: async (v) => {
      const pares = [];
      const junta = (o, pre = '') => { for (const [k, x] of Object.entries(o)) { if (x && typeof x === 'object') junta(x, pre + k + '.'); else if (x !== '' && x != null) pares.push([pre + k, x]); } };
      junta(v);
      if (!pares.length) return 'Preencha pelo menos um campo.';
      const { ok, falhas } = separarBaixados(bens);
      const evs = ok.map((b) => {
        const mud = pares.map(([c, x]) => ({ campo: c, antes: pegaCaminho(b, c) ?? '', depois: x }));
        for (const [c, x] of pares) poeCaminho(b, c, c === 'estado' || c === 'criticidade' ? Number(x) : x);
        return VP.novoEvento(b.id, 'alteracao', { descricao: 'Dados complementares em lote', extra: { mudancas: mud } });
      });
      await VP.db.gravarVarias({ bens: ok, eventos: evs });
      ui.resultado({ titulo: 'Dados complementares', sucesso: ok.map((b) => `${b.codigo} · ${b.descricao}`), falhas });
      depois && depois();
    }
  });
  A.seguroGarantia = (bens, depois) => ui.formulario({
    titulo: `Seguro e garantia — ${bens.length} bem(ns)`, largura: 'grande', textoSalvar: 'Aplicar', campos: camposSeguro(),
    intro: '<p class="ajuda">Só os campos preenchidos são aplicados.</p>',
    salvar: async (v) => {
      const { ok, falhas } = separarBaixados(bens);
      for (const b of ok) {
        for (const g of ['seguro', 'garantia']) for (const [k, x] of Object.entries(v[g] || {})) if (x !== '' && x != null) { b[g] = b[g] || {}; b[g][k] = x; }
      }
      await VP.db.gravarVarias({ bens: ok, eventos: ok.map((b) => VP.novoEvento(b.id, 'alteracao', { descricao: 'Seguro/garantia atualizados em lote' })) });
      ui.resultado({ titulo: 'Seguro e garantia', sucesso: ok.map((b) => `${b.codigo} · ${b.descricao}`), falhas });
      depois && depois();
    }
  });

  A.baixa = (bens, depois) => {
    const cfg = VP.config();
    ui.formulario({
      titulo: `Baixa — ${bens.length} bem(ns)`, largura: 'media', textoSalvar: 'Dar baixa',
      intro: `<p class="aviso-inline">A baixa tira o bem do patrimônio (valor contábil vai a zero). Venda e doação exigem interesse público justificado e avaliação prévia; imóveis exigem também lei autorizativa (Lei 14.133/2021, art. 76).</p><p>Valor contábil que sai: <b>${u.moeda(bens.reduce((t, b) => t + VP.saldo(b).liquido, 0))}</b></p>`,
      campos: [
        { chave: 'tipoBaixa', rotulo: 'Tipo de baixa', tipo: 'select', opcoes: L.tiposBaixa.map((x) => [x, x]), obrigatorio: true },
        { chave: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: VP.db.lista('motivos').filter((m) => m.tipo === 'baixa').map((m) => [m.nome, m.nome]), obrigatorio: true },
        { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true, largura: 'meia' },
        { chave: 'documento', rotulo: 'Processo / laudo / boletim de ocorrência', largura: 'meia' },
        { chave: 'leiAutorizativa', rotulo: 'Lei autorizativa (imóveis)', largura: 'meia' },
        { chave: 'avaliacao', rotulo: 'Avaliação prévia (laudo nº)', largura: 'meia' },
        { chave: 'justificativa', rotulo: 'Justificativa de interesse público', tipo: 'area' }],
      salvar: async (v) => {
        const precisaDoc = ['Alienação (leilão)', 'Doação', 'Permuta'].includes(v.tipoBaixa);
        if (precisaDoc && (!v.avaliacao || !v.justificativa)) return 'Venda, doação e permuta exigem avaliação prévia e justificativa (Lei 14.133, art. 76).';
        if (['Furto / roubo', 'Extravio'].includes(v.tipoBaixa) && !v.documento) return 'Informe o boletim de ocorrência ou o processo.';
        const { ok, falhas } = separarBaixados(bens);
        const validos = [];
        for (const b of ok) {
          if (v.data < (b.dataIncorporacao || '')) falhas.push({ item: `${b.codigo} · ${b.descricao}`, motivo: `Data da baixa antes da incorporação (${u.data(b.dataIncorporacao)})` });
          else if (b.tipo === 'imovel' && precisaDoc && !v.leiAutorizativa) falhas.push({ item: `${b.codigo} · ${b.descricao}`, motivo: 'Imóvel: falta a lei autorizativa' });
          else if (b.imovel && ['Uso comum do povo', 'Uso especial'].includes(b.imovel.uso) && precisaDoc) falhas.push({ item: `${b.codigo} · ${b.descricao}`, motivo: `Imóvel de ${b.imovel.uso.toLowerCase()} precisa ser desafetado antes` });
          else validos.push(b);
        }
        const evs = validos.map((b) => { const s = VP.saldo(b, v.data); b.status = 'baixado'; return VP.novoEvento(b.id, 'baixa', { data: v.data, valor: s.liquido, descricao: `Baixa — ${v.tipoBaixa}`, extra: Object.assign({}, v) }); });
        await VP.db.gravarVarias({ bens: validos, eventos: evs });
        ui.resultado({
          titulo: 'Baixa', sucesso: validos.map((b) => `${b.codigo} · ${b.descricao}`), falhas,
          extra: validos.length && cfg.termoDeBaixa ? `<p><button type="button" class="botao" data-termo-baixa>Imprimir termo de baixa</button></p>` : ''
        });
        setTimeout(() => document.querySelector('[data-termo-baixa]')?.addEventListener('click', () => VP.documentos.termoBaixa(validos, v)), 50);
        depois && depois();
      }
    });
  };

  A.excluir = async (bens, depois) => {
    const comMov = bens.filter((b) => VP.eventosDoBem(b.id).some((e) => e.tipo !== 'incorporacao' && e.tipo !== 'alteracao'));
    const texto = `Mover ${bens.length} bem(ns) para a Lixeira? Use só para cadastro feito por engano — para tirar um bem do patrimônio, use <b>Baixa</b>.${comMov.length ? `<br><br><b>Atenção:</b> ${comMov.length} deles já têm movimentações.` : ''} Pode ser restaurado depois.`;
    if (!await ui.confirmar(texto, { titulo: 'Excluir (Lixeira)', sim: 'Mover para a Lixeira', classe: 'perigo' })) return;
    for (const b of bens) { b.excluido = true; b.excluidoEm = VP.Plataforma.agoraISO(); }
    await VP.db.gravarVarias({ bens, eventos: bens.map((b) => VP.novoEvento(b.id, 'alteracao', { descricao: 'Movido para a Lixeira' })) });
    ui.aviso(`${bens.length} bem(ns) na Lixeira.`);
    depois && depois();
  };

  A.manutencao = (b, depois) => ui.formulario({
    titulo: 'Manutenção ou despesa', largura: 'media',
    campos: [
      { chave: 'tipo', rotulo: 'O que foi', tipo: 'select', opcoes: [['manutencao', 'Manutenção (conserto, revisão)'], ['despesa', 'Despesa (peças, licença, acessórios)'], ['abastecimento', 'Abastecimento (veículo)']], vazio: false },
      { chave: 'motivo', rotulo: 'Tipo de manutenção', tipo: 'select', opcoes: VP.db.lista('motivos').filter((m) => m.tipo === 'manutencao').map((m) => [m.nome, m.nome]) },
      { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true, largura: 'meia' },
      { chave: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true, largura: 'meia' },
      { chave: 'fornecedorId', rotulo: 'Fornecedor / oficina', tipo: 'select', opcoes: opc('fornecedores') },
      { chave: 'litros', rotulo: 'Litros (abastecimento)', tipo: 'numero', largura: 'meia' }, { chave: 'km', rotulo: 'Quilometragem', tipo: 'numero', largura: 'meia' },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'area' },
      { chave: 'emConserto', rotulo: 'O bem ficou fora, em conserto', tipo: 'bool' }],
    salvar: async (v) => {
      const ev = VP.novoEvento(b.id, v.tipo, { data: v.data, valor: v.valor, descricao: v.descricao || (v.tipo === 'abastecimento' ? `${v.litros || '?'} L` : 'Manutenção'), extra: { motivo: v.motivo, fornecedorId: v.fornecedorId, litros: v.litros, km: v.km } });
      if (v.emConserto) b.status = 'manutencao';
      await VP.db.gravarVarias({ eventos: [ev], bens: [b] });
      ui.aviso('Registrado.');
      depois();
    }
  });
  A.observacao = (b, depois) => ui.formulario({
    titulo: 'Observação', largura: 'pequena', campos: [{ chave: 'texto', rotulo: 'Observação', tipo: 'area', obrigatorio: true }, { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje() }],
    salvar: async (v) => { await VP.db.gravar('eventos', VP.novoEvento(b.id, 'observacao', { data: v.data, descricao: v.texto })); ui.aviso('Observação registrada.'); depois(); }
  });
  A.anexar = (b, depois) => VP.anexos.anexar(b, depois); // cadastro de anexos com tipo: telas-anexos.js
  A.replicar = (b, depois) => ui.formulario({
    titulo: 'Replicar bem', largura: 'pequena', textoSalvar: 'Replicar',
    intro: `<p>Cria cópias de <b>${esc(b.descricao)}</b> com códigos e plaquetas novos, mesmo valor de aquisição e mesma classificação.</p>`,
    campos: [{ chave: 'quantidade', rotulo: 'Quantas cópias', tipo: 'numero', padrao: 1, obrigatorio: true }],
    salvar: async (v) => {
      const q = Math.floor(v.quantidade || 0);
      if (q < 1 || q > 500) return 'Informe de 1 a 500.';
      const inc = VP.eventosDoBem(b.id).find((e) => e.tipo === 'incorporacao');
      const criados = await VP.criarBens({ descricao: b.descricao, complemento: b.complemento, produtoId: b.produtoId, classificacaoId: b.classificacaoId, unidadeId: b.unidadeId, responsavelId: b.responsavelId, dataAquisicao: b.dataAquisicao, dataIncorporacao: VP.Plataforma.hoje(), valor: inc?.valor || 0, quantidade: q, situacaoAquisicao: b.situacaoAquisicao, fornecedorId: b.fornecedorId, entidadeId: b.entidadeId, estado: b.estado, origem: b.origem, nf: b.nf, detalhes: Object.assign({}, b.detalhes, { serie: '' }), origemTexto: `réplica do bem ${b.codigo}` });
      ui.resultado({ titulo: 'Cópias criadas', sucesso: criados.map((x) => `${x.codigo} · plaqueta ${x.plaqueta}`) });
      depois();
    }
  });
  A.unidadesProduzidas = (b, depois) => ui.formulario({
    titulo: 'Unidades produzidas no mês', largura: 'pequena',
    campos: [{ chave: 'mes', rotulo: 'Mês', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true }, { chave: 'quantidade', rotulo: 'Unidades (horas, km, peças…)', tipo: 'numero', obrigatorio: true }],
    salvar: async (v) => { await VP.db.gravar('eventos', VP.novoEvento(b.id, 'unidades', { data: v.mes, descricao: `${v.quantidade} unidades`, extra: { quantidade: v.quantidade } })); ui.aviso('Registrado. Entra no próximo fechamento do mês.'); depois(); }
  });
  A.melhoria = (b, depois) => {
    const s = VP.saldo(b);
    ui.formulario({
      titulo: 'Melhoria (agregação de valor)', largura: 'media', textoSalvar: 'Somar ao valor',
      intro: `<p class="aviso-inline"><b>Melhoria</b> aumenta capacidade, vida útil ou serviço (ex.: ampliação, troca de toda a tubulação, recapeamento completo) e soma ao valor. <b>Manutenção</b> só mantém o bem (limpeza, conserto, <b>pintura comum</b>) e <b>não</b> aumenta o valor. Na dúvida, registre como manutenção.</p><p>Valor contábil hoje: <b>${u.moeda(s.liquido)}</b></p>`,
      campos: [
        { chave: 'tipoGasto', rotulo: 'Este gasto é', tipo: 'select', opcoes: [['melhoria', 'Melhoria — aumenta valor ou vida útil'], ['manutencao', 'Manutenção — só mantém (registrar como despesa)']], vazio: false },
        { chave: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true, largura: 'meia' }, { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true, largura: 'meia' },
        { chave: 'vidaUtilMeses', rotulo: 'Nova vida útil restante (meses, opcional)', tipo: 'numero' },
        { chave: 'descricao', rotulo: 'O que foi feito', tipo: 'area', obrigatorio: true },
        { chave: 'documento', rotulo: 'Documento (nota, medição, contrato)' },
        { chave: 'aprovado', rotulo: 'Setor contábil aprovou somar ao valor', tipo: 'bool' }],
      salvar: async (v) => {
        if (v.tipoGasto === 'manutencao') {
          await VP.db.gravar('eventos', VP.novoEvento(b.id, 'manutencao', { data: v.data, valor: v.valor, descricao: v.descricao, extra: { documento: v.documento } }));
          ui.aviso('Registrado como manutenção (não muda o valor).');
          return depois();
        }
        if (!v.aprovado) return 'Melhoria só soma ao valor com aprovação do setor contábil.';
        // nova vida útil = meses já passados no ciclo + meses que ainda faltam (informados)
        if (v.vidaUtilMeses && s.inicio) b.depreciacao.vidaUtilMeses = Math.max(0, u.mesesEntre(s.inicio, v.data.slice(0, 7))) + Math.floor(v.vidaUtilMeses);
        await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'agregacao', { data: v.data, valor: v.valor, descricao: v.descricao, extra: { documento: v.documento, tipoGasto: 'melhoria' } })] });
        ui.aviso('Melhoria somada ao valor do bem.');
        depois();
      }
    });
  };
})();
