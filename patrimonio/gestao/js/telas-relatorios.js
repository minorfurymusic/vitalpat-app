/* VitalPat Patrimônio · Gestão — Relatórios visuais (na hora, sem fila) e documentos para imprimir. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const opc = (...a) => VP.opc(...a);
  const hoje = () => VP.Plataforma.hoje();
  const inicioAno = () => hoje().slice(0, 4) + '-01-01';

  // ---------------------------------------------------------------- filtros comuns
  const F = {
    de: () => ({ chave: 'de', rotulo: 'De', tipo: 'data' }),
    ate: () => ({ chave: 'ate', rotulo: 'Até', tipo: 'data' }),
    unidadeId: () => ({ chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opc('unidades') }),
    classificacaoId: () => ({ chave: 'classificacaoId', rotulo: 'Classificação', tipo: 'select', opcoes: VP.opcClassificacoes() }),
    contaId: () => ({ chave: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: opc('contas', (c) => c.tipo === 'ativo') }),
    tipo: () => ({ chave: 'tipo', rotulo: 'Tipo do bem', tipo: 'select', opcoes: Object.entries(L.tiposBem) }),
    status: () => ({ chave: 'status', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(L.status) }),
    estado: () => ({ chave: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: Object.entries(L.estados).reverse() }),
    entidadeId: () => ({ chave: 'entidadeId', rotulo: 'Entidade', tipo: 'select', opcoes: opc('entidades') }),
    responsavelId: () => ({ chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: opc('responsaveis') }),
    produtoId: () => ({ chave: 'produtoId', rotulo: 'Produto', tipo: 'select', opcoes: opc('produtos') }),
    fornecedorId: () => ({ chave: 'fornecedorId', rotulo: 'Fornecedor', tipo: 'select', opcoes: opc('fornecedores') }),
    bairro: () => ({ chave: 'bairro', rotulo: 'Bairro', tipo: 'texto' }),
    logradouro: () => ({ chave: 'logradouro', rotulo: 'Logradouro', tipo: 'texto' }),
    cidade: () => ({ chave: 'cidade', rotulo: 'Cidade', tipo: 'texto' }),
    baixados: () => ({ chave: 'baixados', rotulo: 'Incluir baixados', tipo: 'bool' })
  };
  const bensDoFiltro = (f) => {
    let b = VP.filtrarBens(f);
    if (f.entidadeId) b = b.filter((x) => x.entidadeId === f.entidadeId);
    if (f.produtoId) b = b.filter((x) => x.produtoId === f.produtoId);
    return b;
  };
  const eventosNoPeriodo = (f, tipos) => {
    const ids = new Set(bensDoFiltro(Object.assign({}, f, { baixados: true })).map((b) => b.id));
    return VP.db.lista('eventos').filter((e) => !e.cancelado && tipos.includes(e.tipo) && ids.has(e.bemId) && (!f.de || e.data >= f.de) && (!f.ate || e.data <= f.ate));
  };
  const mesesDoPeriodo = (de, ate) => { const r = []; for (let m = de.slice(0, 7); m <= ate.slice(0, 7) && r.length < 60; m = u.somaMeses(m, 1)) r.push(m); return r; };
  const porMes = (evs, de, ate, valor = (e) => e.valor || 0) => mesesDoPeriodo(de, ate).map((m) => ({ rotulo: u.mesNome(m), valor: evs.filter((e) => e.data.slice(0, 7) === m).reduce((t, e) => t + valor(e), 0) }));
  const bemCol = { chave: 'bem', titulo: 'Bem', html: (x) => { const b = x.bem || VP.db.pega('bens', x.bemId) || x; return `<a href="#bem/${esc(b.id)}">${esc(b.codigo)} · ${esc(b.descricao)}</a>`; }, valor: (x) => (x.bem || VP.db.pega('bens', x.bemId) || x).descricao };
  const colEv = () => [
    { chave: 'data', titulo: 'Data', valor: (e) => u.data(e.data), ordenar: (e) => e.data }, bemCol,
    { chave: 'descricao', titulo: 'Descrição' },
    { chave: 'unidade', titulo: 'Unidade', valor: (e) => VP.nome('unidades', VP.db.pega('bens', e.bemId)?.unidadeId), oculta: true },
    { chave: 'valor', titulo: 'Valor', num: true, soma: true, formato: u.moeda, valor: (e) => e.valor || 0 }];
  const colBens = (extra = []) => [
    { chave: 'codigo', titulo: 'Código', num: true }, { chave: 'plaqueta', titulo: 'Plaqueta' },
    { chave: 'descricao', titulo: 'Bem', html: (b) => `<a href="#bem/${esc(b.id)}">${esc(b.descricao)}</a>`, exportar: (b) => b.descricao },
    { chave: 'unidade', titulo: 'Unidade', valor: (b) => VP.nome('unidades', b.unidadeId) },
    { chave: 'responsavel', titulo: 'Responsável', valor: (b) => VP.nome('responsaveis', b.responsavelId) },
    { chave: 'classificacao', titulo: 'Classificação', valor: (b) => VP.nome('classificacoes', b.classificacaoId), oculta: true },
    { chave: 'aquisicao', titulo: 'Aquisição', valor: (b) => u.data(b.dataAquisicao), ordenar: (b) => b.dataAquisicao },
    { chave: 'estado', titulo: 'Estado', valor: (b) => L.estados[b.estado] },
    { chave: 'status', titulo: 'Situação', valor: (b) => L.status[b.status] },
    { chave: 'valor', titulo: 'Valor contábil', num: true, soma: true, formato: u.moeda, valor: (b) => VP.saldo(b).liquido }].concat(extra);

  // ---------------------------------------------------------------- catálogo de relatórios
  const R = VP.relatorios = {};
  R.balancete = {
    grupo: 'Visão geral', titulo: 'Balancete patrimonial', descricao: 'Saldo anterior, entradas, saídas, depreciação e saldo final por conta.',
    filtros: ['de', 'ate', 'entidadeId', 'contaId', 'tipo', 'unidadeId', 'classificacaoId', 'cidade', 'bairro', 'logradouro'], padrao: () => ({ de: inicioAno(), ate: hoje() }),
    extras: [{ chave: 'detalhar', rotulo: 'Detalhar bens', tipo: 'bool' }],
    gerar(f) {
      const antes = u.somaDias(f.de, -1);
      const bens = bensDoFiltro(Object.assign({}, f, { baixados: true })).filter((b) => (b.dataIncorporacao || '') <= f.ate);
      const linhas = bens.map((b) => {
        const evs = VP.eventosDoBem(b.id).filter((e) => e.data >= f.de && e.data <= f.ate);
        const ent = evs.filter((e) => e.tipo === 'incorporacao' || e.tipo === 'agregacao' || (e.tipo === 'reavaliacao' && e.valor > 0)).reduce((t, e) => t + (e.valor || 0), 0);
        const sai = evs.filter((e) => e.tipo === 'baixa' || (e.tipo === 'reavaliacao' && e.valor < 0)).reduce((t, e) => t + Math.abs(e.valor || 0), 0);
        const dep = evs.filter((e) => e.tipo === 'depreciacao').reduce((t, e) => t + e.valor, 0);
        return { bem: b, id: b.id, conta: b.contaId, anterior: VP.saldo(b, antes).liquido, entradas: ent, saidas: sai, depreciacao: dep, final: VP.saldo(b, f.ate).liquido };
      });
      const porConta = [...new Set(linhas.map((l) => l.conta))].map((c) => {
        const ls = linhas.filter((l) => l.conta === c);
        const s = (k) => ls.reduce((t, l) => t + l[k], 0);
        return { id: c, conta: VP.nome('contas', c), qtd: ls.length, anterior: s('anterior'), entradas: s('entradas'), saidas: s('saidas'), depreciacao: s('depreciacao'), final: s('final') };
      }).sort((a, b) => b.final - a.final);
      const tot = (k) => porConta.reduce((t, l) => t + l[k], 0);
      const colsValores = ['anterior', 'entradas', 'saidas', 'depreciacao', 'final'].map((k) => ({ chave: k, titulo: { anterior: 'Saldo anterior', entradas: 'Entradas', saidas: 'Saídas', depreciacao: 'Depreciação', final: 'Saldo final' }[k], num: true, soma: true, formato: u.moeda, valor: (l) => l[k] }));
      return {
        resumo: [G.numero('Saldo anterior', u.moedaCurta(tot('anterior')), u.data(antes)), G.numero('Entradas', u.moedaCurta(tot('entradas'))), G.numero('Saídas', u.moedaCurta(tot('saidas'))), G.numero('Depreciação', u.moedaCurta(tot('depreciacao'))), G.numero('Saldo final', u.moedaCurta(tot('final')), u.data(f.ate))],
        graficos: [{ titulo: 'Saldo final por conta', html: G.barrasH(porConta.map((c) => ({ rotulo: c.conta, valor: c.final })), { formato: u.moedaCurta }) },
          { titulo: 'Do saldo anterior ao final', html: G.barrasH([{ rotulo: 'Saldo anterior', valor: tot('anterior') }, { rotulo: '+ Entradas', valor: tot('entradas') }, { rotulo: '− Saídas', valor: tot('saidas'), cor: 'var(--serie-2)' }, { rotulo: '− Depreciação', valor: tot('depreciacao'), cor: 'var(--serie-2)' }, { rotulo: '= Saldo final', valor: tot('final') }], { formato: u.moedaCurta, mostrarZeros: true }) }],
        tabela: f.detalhar ? { linhas, colunas: [bemCol, { chave: 'conta', titulo: 'Conta', valor: (l) => VP.nome('contas', l.conta) }].concat(colsValores) } : { linhas: porConta, colunas: [{ chave: 'conta', titulo: 'Conta' }, { chave: 'qtd', titulo: 'Bens', num: true, soma: true }].concat(colsValores) },
        nota: Math.abs(tot('anterior') + tot('entradas') - tot('saidas') - tot('depreciacao') - tot('final')) < 1 ? 'Conferência: saldo anterior + entradas − saídas − depreciação = saldo final. ✓' : 'Atenção: a soma não fecha — há reavaliação com redução ou estorno no período; confira os bens detalhados.'
      };
    }
  };
  R.resumo = {
    grupo: 'Visão geral', titulo: 'Resumo patrimonial', descricao: 'Quanto há em cada grupo: quantidade, valor de aquisição, depreciação e valor líquido.',
    filtros: ['entidadeId', 'unidadeId', 'contaId', 'tipo', 'cidade', 'bairro', 'logradouro'],
    gerar(f) {
      const bens = bensDoFiltro(f);
      const grupos = new Map();
      for (const b of bens) {
        const g = VP.grupoDe(b.classificacaoId)?.nome || 'Sem classificação';
        const s = VP.saldo(b);
        const x = grupos.get(g) || { grupo: g, id: g, qtd: 0, base: 0, dep: 0, liq: 0 };
        x.qtd++; x.base += s.base; x.dep += s.acumulada; x.liq += s.liquido;
        grupos.set(g, x);
      }
      const ls = [...grupos.values()].sort((a, b) => b.liq - a.liq);
      const t = (k) => ls.reduce((s, x) => s + x[k], 0);
      const porEnt = [...u.agruparSoma(bens, 'entidadeId', (b) => VP.saldo(b).liquido)].map(([k, v]) => ({ rotulo: VP.nome('entidades', k), valor: v }));
      return {
        resumo: [G.numero('Bens', u.inteiro(t('qtd'))), G.numero('Valor base', u.moedaCurta(t('base'))), G.numero('Depreciação acumulada', u.moedaCurta(t('dep'))), G.numero('Valor líquido', u.moedaCurta(t('liq')))],
        cartoes: ls.map((x) => `<div class="cartao-grupo"><b>${esc(x.grupo)}</b><span>${u.inteiro(x.qtd)} bens</span><strong>${u.moedaCurta(x.liq)}</strong>${G.medidor(x.base ? x.dep / x.base : 0, `${u.pct(x.base ? x.dep / x.base : 0)} já depreciado`)}</div>`).join(''),
        graficos: [{ titulo: 'Valor líquido por grupo', html: G.barrasH(ls.map((x) => ({ rotulo: x.grupo, valor: x.liq })), { formato: u.moedaCurta }) }, { titulo: 'Valor líquido por entidade', html: G.barrasH(porEnt, { formato: u.moedaCurta }) }],
        tabela: { linhas: ls, colunas: [{ chave: 'grupo', titulo: 'Grupo' }, { chave: 'qtd', titulo: 'Bens', num: true, soma: true }, { chave: 'base', titulo: 'Valor base', num: true, soma: true, formato: u.moeda }, { chave: 'dep', titulo: 'Depreciação acumulada', num: true, soma: true, formato: u.moeda }, { chave: 'liq', titulo: 'Valor líquido', num: true, soma: true, formato: u.moeda }] }
      };
    }
  };
  R.estatistico = {
    grupo: 'Visão geral', titulo: 'Estatístico', descricao: 'Retrato do patrimônio em gráficos: estado, tipo, unidade, idade, ano de compra, marca.',
    filtros: ['unidadeId', 'classificacaoId', 'tipo', 'status', 'estado', 'contaId', 'produtoId', 'baixados'],
    gerar(f) {
      const bens = bensDoFiltro(f);
      const ano = Number(hoje().slice(0, 4));
      const idade = (b) => ano - Number((b.dataAquisicao || hoje()).slice(0, 4));
      const faixas = [['Até 2 anos', 0, 2], ['3 a 5 anos', 3, 5], ['6 a 10 anos', 6, 10], ['11 a 20 anos', 11, 20], ['Mais de 20 anos', 21, 999]];
      const anos = [...new Set(bens.map((b) => (b.dataAquisicao || '').slice(0, 4)))].filter(Boolean).sort();
      const conta = (fn) => (lista) => [...u.agruparSoma(lista, fn)].map(([k, n]) => ({ rotulo: k || '—', valor: n })).sort((a, b) => b.valor - a.valor);
      const bons = bens.filter((b) => b.estado >= 5).length; // Bom ou melhor (escala de 8)
      const baixas = bens.filter((b) => b.status === 'baixado').map((b) => VP.eventosDoBem(b.id).find((e) => e.tipo === 'baixa')).filter(Boolean);
      return {
        resumo: [G.numero('Bens', u.inteiro(bens.length)), G.numero('Idade média', `${(bens.reduce((t, b) => t + idade(b), 0) / (bens.length || 1)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`), G.numero('Em bom estado ou melhor', u.pct(bens.length ? bons / bens.length : 0)), G.numero('Totalmente depreciados', u.inteiro(bens.filter((b) => { const s = VP.saldo(b); return s.vidaUtilMeses && s.consumido >= 1; }).length))],
        graficos: [
          { titulo: 'Por estado de conservação', html: G.barrasH(Object.entries(L.estados).reverse().map(([k, n]) => ({ rotulo: n, valor: bens.filter((b) => String(b.estado) === k).length })), { mostrarZeros: true }) },
          { titulo: 'Por tipo', html: G.barrasH(conta((b) => L.tiposBem[b.tipo])(bens)) },
          { titulo: 'Por unidade', html: G.barrasH(conta((b) => VP.db.pega('unidades', b.unidadeId)?.nome)(bens)) },
          { titulo: 'Por idade', html: G.barrasH(faixas.map(([n, a, z]) => ({ rotulo: n, valor: bens.filter((b) => idade(b) >= a && idade(b) <= z).length })), { mostrarZeros: true }) },
          { titulo: 'Por ano de compra', html: G.colunas(anos.map((a) => ({ rotulo: a, valor: bens.filter((b) => b.dataAquisicao?.startsWith(a)).length }))) },
          { titulo: 'Marcas mais comuns', html: G.barrasH(conta((b) => b.detalhes?.marca)(bens.filter((b) => b.detalhes?.marca)), { limite: 8 }) },
          f.baixados ? { titulo: 'Motivo das baixas', html: G.barrasH(conta((e) => e.dados.motivo)(baixas)) } : null].filter(Boolean),
        tabela: { linhas: bens, colunas: colBens([{ chave: 'idade', titulo: 'Idade (anos)', num: true, valor: idade }, { chave: 'marca', titulo: 'Marca', valor: (b) => b.detalhes?.marca, oculta: true }]) }
      };
    }
  };
  R.bens = {
    grupo: 'Bens', titulo: 'Relação de bens', descricao: 'Lista com fotos; escolha as informações que entram (detalhes, compra, seguro, responsáveis, depreciação…).',
    filtros: ['de', 'ate', 'tipo', 'unidadeId', 'classificacaoId', 'contaId', 'estado', 'status', 'responsavelId', 'baixados'], padrao: () => ({}),
    gerar(f) {
      let bens = bensDoFiltro(f);
      if (f.de) bens = bens.filter((b) => (b.dataAquisicao || '') >= f.de);
      if (f.ate) bens = bens.filter((b) => (b.dataAquisicao || '') <= f.ate);
      const porUn = [...u.agruparSoma(bens, (b) => VP.db.pega('unidades', b.unidadeId)?.nome)].map(([k, n]) => ({ rotulo: k || '—', valor: n })).sort((a, b) => b.valor - a.valor);
      return {
        resumo: [G.numero('Bens', u.inteiro(bens.length)), G.numero('Valor contábil', u.moedaCurta(bens.reduce((t, b) => t + VP.saldo(b).liquido, 0)))],
        graficos: [{ titulo: 'Bens por unidade', html: G.barrasH(porUn) }],
        tabela: { linhas: bens, colunas: [{ chave: 'foto', titulo: 'Foto', html: (b) => (b.fotos?.[0] ? `<img class="mini" src="${b.fotos[0].dataURL}" alt="">` : ''), exportar: () => '' }].concat(colBens([
          { chave: 'marca', titulo: 'Marca/modelo', valor: (b) => [b.detalhes?.marca, b.detalhes?.modelo].filter(Boolean).join(' '), oculta: true },
          { chave: 'serie', titulo: 'Nº de série', valor: (b) => b.detalhes?.serie, oculta: true },
          { chave: 'fornecedor', titulo: 'Fornecedor', valor: (b) => VP.nome('fornecedores', b.fornecedorId), oculta: true },
          { chave: 'empenho', titulo: 'Empenho', valor: (b) => b.origem?.empenho, oculta: true },
          { chave: 'nf', titulo: 'Nota fiscal', valor: (b) => b.nf?.numero, oculta: true },
          { chave: 'seguro', titulo: 'Seguro até', valor: (b) => u.data(b.seguro?.termino), oculta: true },
          { chave: 'garantia', titulo: 'Garantia até', valor: (b) => u.data(b.garantia?.termino), oculta: true },
          { chave: 'adicionais', titulo: 'Responsáveis adicionais', valor: (b) => (b.responsaveisAdicionais || []).map((r) => VP.nome('responsaveis', r)).join(', '), oculta: true },
          { chave: 'movfisicas', titulo: 'Movimentações físicas', num: true, valor: (b) => VP.eventosDoBem(b.id).filter((e) => L.eventos[e.tipo].grupo === 'fisico').length, oculta: true },
          { chave: 'movfin', titulo: 'Movimentações financeiras', num: true, valor: (b) => VP.eventosDoBem(b.id).filter((e) => L.eventos[e.tipo].grupo === 'financeiro').length, oculta: true },
          { chave: 'dep', titulo: 'Depreciação acumulada', num: true, soma: true, formato: u.moeda, valor: (b) => VP.saldo(b).acumulada, oculta: true },
          { chave: 'plaqAnt', titulo: 'Plaqueta anterior', valor: (b) => b.plaquetaAnterior, oculta: !VP.config().plaquetaAnteriorRelatorio }])) },
        nota: 'Use o botão “Colunas” da tabela para escolher as informações que entram (detalhes, compra, seguro, responsáveis, movimentações, depreciação).'
      };
    }
  };
  R.seguros = {
    grupo: 'Bens', titulo: 'Seguros e garantias', descricao: 'O que está vigente, vencendo e vencido, com calendário de vencimentos.',
    filtros: ['tipo', 'unidadeId', 'fornecedorId', 'cidade', 'bairro', 'logradouro'],
    gerar(f) {
      const cfg = VP.config();
      const h = hoje(), lim = u.somaDias(h, cfg.avisoSeguroDias);
      const bens = bensDoFiltro(f);
      const itens = [];
      for (const b of bens) {
        if (b.seguro?.termino) itens.push({ id: b.id + 's', bem: b, tipo: 'Seguro', termino: b.seguro.termino, quem: VP.nome('seguradoras', b.seguro.seguradoraId), valor: b.seguro.valor || 0 });
        if (b.garantia?.termino && (!f.fornecedorId || b.garantia.fornecedorId === f.fornecedorId)) itens.push({ id: b.id + 'g', bem: b, tipo: 'Garantia', termino: b.garantia.termino, quem: VP.nome('fornecedores', b.garantia.fornecedorId), valor: 0 });
      }
      const sit = (i) => (i.termino < h ? 'Vencido' : i.termino <= lim ? 'Vencendo' : 'Vigente');
      const semSeguro = bens.filter((b) => (b.tipo === 'veiculo' || b.tipo === 'imovel') && !b.seguro?.termino && !(b.classificacaoId && VP.db.pega('classificacoes', b.classificacaoId)?.naoDeprecia)).length;
      const prox = Array.from({ length: 12 }, (_, k) => u.somaMeses(h.slice(0, 7), k));
      return {
        resumo: [G.numero('Vigentes', u.inteiro(itens.filter((i) => sit(i) === 'Vigente').length)), G.numero(`Vencendo em ${cfg.avisoSeguroDias} dias`, u.inteiro(itens.filter((i) => sit(i) === 'Vencendo').length)), G.numero('Vencidos', u.inteiro(itens.filter((i) => sit(i) === 'Vencido').length)), G.numero('Veículos e prédios sem seguro', u.inteiro(semSeguro))],
        graficos: [{ titulo: 'Vencimentos nos próximos 12 meses', html: G.colunas(prox.map((m) => ({ rotulo: u.mesNome(m), valor: itens.filter((i) => i.termino.slice(0, 7) === m).length }))) }],
        tabela: { linhas: itens.sort((a, b) => a.termino.localeCompare(b.termino)), colunas: [{ chave: 'termino', titulo: 'Vence em', valor: (i) => u.data(i.termino), ordenar: (i) => i.termino }, { chave: 'sit', titulo: 'Situação', html: (i) => `<span class="selo-venc v-${sit(i).toLowerCase()}">${sit(i)}</span>`, valor: sit }, { chave: 'tipo', titulo: 'Tipo' }, bemCol, { chave: 'quem', titulo: 'Seguradora / fornecedor' }, { chave: 'valor', titulo: 'Valor do seguro', num: true, soma: true, formato: u.moeda }] }
      };
    }
  };
  R.despesas = {
    grupo: 'Bens', titulo: 'Despesas e manutenções', descricao: 'Quanto custa manter: ranking dos bens mais caros, mês a mês e por fornecedor.',
    filtros: ['de', 'ate', 'tipo', 'unidadeId', 'classificacaoId', 'fornecedorId', 'cidade', 'bairro', 'logradouro'], padrao: () => ({ de: u.somaDias(hoje(), -365), ate: hoje() }),
    extras: [{ chave: 'ausentes', rotulo: 'Só bens fora (em conserto ou cedidos)', tipo: 'bool' }, { chave: 'tipoGasto', rotulo: 'Tipo de gasto', tipo: 'select', opcoes: [['manutencao', 'Manutenção'], ['despesa', 'Despesa'], ['abastecimento', 'Abastecimento']] }],
    gerar(f) {
      let evs = eventosNoPeriodo(f, f.tipoGasto ? [f.tipoGasto] : ['manutencao', 'despesa', 'abastecimento']);
      if (f.fornecedorId) evs = evs.filter((e) => e.dados.fornecedorId === f.fornecedorId);
      if (f.ausentes) evs = evs.filter((e) => ['manutencao', 'cedido'].includes(VP.db.pega('bens', e.bemId)?.status));
      const total = evs.reduce((t, e) => t + e.valor, 0);
      const porBem = [...u.agruparSoma(evs, 'bemId', 'valor')].map(([id, v]) => ({ rotulo: VP.db.pega('bens', id)?.descricao + ' (' + VP.db.pega('bens', id)?.codigo + ')', valor: v, link: '#bem/' + id })).sort((a, b) => b.valor - a.valor);
      const porForn = [...u.agruparSoma(evs.filter((e) => e.dados.fornecedorId), (e) => VP.nome('fornecedores', e.dados.fornecedorId), 'valor')].map(([k, v]) => ({ rotulo: k, valor: v })).sort((a, b) => b.valor - a.valor);
      return {
        resumo: [G.numero('Total gasto', u.moedaCurta(total), u.moeda(total)), G.numero('Manutenções', u.moedaCurta(evs.filter((e) => e.tipo === 'manutencao').reduce((t, e) => t + e.valor, 0))), G.numero('Despesas', u.moedaCurta(evs.filter((e) => e.tipo === 'despesa').reduce((t, e) => t + e.valor, 0))), G.numero('Combustível', u.moedaCurta(evs.filter((e) => e.tipo === 'abastecimento').reduce((t, e) => t + e.valor, 0)))],
        graficos: [{ titulo: 'Bens mais caros de manter', html: G.barrasH(porBem, { formato: u.moeda, limite: 10 }) }, { titulo: 'Gasto por mês', html: G.colunas(porMes(evs, f.de || inicioAno(), f.ate || hoje()), { formato: u.moeda, formatoEixo: u.moedaCurta }) }, { titulo: 'Por fornecedor', html: G.barrasH(porForn, { formato: u.moeda, limite: 8 }) }],
        tabela: { linhas: evs.sort((a, b) => b.data.localeCompare(a.data)), colunas: colEv().concat([{ chave: 'tipo', titulo: 'Tipo', valor: (e) => L.eventos[e.tipo].nome }, { chave: 'forn', titulo: 'Fornecedor', valor: (e) => VP.nome('fornecedores', e.dados.fornecedorId) }, { chave: 'motivo', titulo: 'Motivo', valor: (e) => e.dados.motivo || '' }]) }
      };
    }
  };
  R.incorporacoes = {
    grupo: 'Movimentação', titulo: 'Incorporações', descricao: 'O que entrou no patrimônio, mês a mês e por forma de entrada.',
    filtros: ['de', 'ate', 'tipo', 'unidadeId', 'classificacaoId', 'contaId', 'entidadeId'], padrao: () => ({ de: inicioAno(), ate: hoje() }),
    extras: [{ chave: 'situacaoAquisicao', rotulo: 'Como entrou', tipo: 'select', opcoes: L.situacoesAquisicao.map((x) => [x, x]) }],
    gerar(f) {
      let evs = eventosNoPeriodo(f, ['incorporacao']);
      if (f.situacaoAquisicao) evs = evs.filter((e) => VP.db.pega('bens', e.bemId)?.situacaoAquisicao === f.situacaoAquisicao);
      return {
        resumo: [G.numero('Bens incorporados', u.inteiro(evs.length)), G.numero('Valor', u.moedaCurta(evs.reduce((t, e) => t + e.valor, 0)))],
        graficos: [{ titulo: 'Valor incorporado por mês', html: G.colunas(porMes(evs, f.de || inicioAno(), f.ate || hoje()), { formato: u.moeda, formatoEixo: u.moedaCurta }) }, { titulo: 'Por forma de entrada', html: G.barrasH([...u.agruparSoma(evs, (e) => VP.db.pega('bens', e.bemId)?.situacaoAquisicao, 'valor')].map(([k, v]) => ({ rotulo: k, valor: v })), { formato: u.moedaCurta }) }, { titulo: 'Por classificação', html: G.barrasH([...u.agruparSoma(evs, (e) => VP.grupoDe(VP.db.pega('bens', e.bemId)?.classificacaoId)?.nome, 'valor')].map(([k, v]) => ({ rotulo: k || '—', valor: v })), { formato: u.moedaCurta }) }],
        tabela: { linhas: evs, colunas: colEv().concat([{ chave: 'como', titulo: 'Como entrou', valor: (e) => VP.db.pega('bens', e.bemId)?.situacaoAquisicao }, { chave: 'conta', titulo: 'Conta', valor: (e) => VP.nome('contas', VP.db.pega('bens', e.bemId)?.contaId) }]) }
      };
    }
  };
  R.baixas = {
    grupo: 'Movimentação', titulo: 'Baixas', descricao: 'O que saiu do patrimônio, por motivo, tipo e mês.',
    filtros: ['de', 'ate', 'tipo', 'unidadeId', 'contaId', 'classificacaoId'], padrao: () => ({ de: inicioAno(), ate: hoje() }),
    extras: [{ chave: 'tipoBaixa', rotulo: 'Tipo de baixa', tipo: 'select', opcoes: L.tiposBaixa.map((x) => [x, x]) }],
    gerar(f) {
      let evs = eventosNoPeriodo(f, ['baixa']);
      if (f.tipoBaixa) evs = evs.filter((e) => e.dados.tipoBaixa === f.tipoBaixa);
      return {
        resumo: [G.numero('Bens baixados', u.inteiro(evs.length)), G.numero('Valor que saiu', u.moedaCurta(evs.reduce((t, e) => t + e.valor, 0)))],
        graficos: [{ titulo: 'Por motivo', html: G.barrasH([...u.agruparSoma(evs, (e) => e.dados.motivo)].map(([k, n]) => ({ rotulo: k, valor: n }))) }, { titulo: 'Por tipo de baixa', html: G.barrasH([...u.agruparSoma(evs, (e) => e.dados.tipoBaixa)].map(([k, n]) => ({ rotulo: k, valor: n }))) }, { titulo: 'Por mês', html: G.colunas(porMes(evs, f.de || inicioAno(), f.ate || hoje(), () => 1)) }],
        tabela: { linhas: evs, colunas: colEv().concat([{ chave: 'tipoB', titulo: 'Tipo', valor: (e) => e.dados.tipoBaixa }, { chave: 'mot', titulo: 'Motivo', valor: (e) => e.dados.motivo }, { chave: 'doc', titulo: 'Documento', valor: (e) => e.dados.documento }]) }
      };
    }
  };
  R.depreciacao = {
    grupo: 'Movimentação', titulo: 'Depreciação', descricao: 'Depreciação do ano mês a mês, por classe e acumulada por bem.',
    filtros: ['entidadeId', 'unidadeId', 'classificacaoId', 'contaId', 'tipo'], padrao: () => ({ ano: hoje().slice(0, 4) }),
    extras: [{ chave: 'ano', rotulo: 'Ano', tipo: 'texto', tamanho: 5 }],
    gerar(f) {
      const ano = String(f.ano || hoje().slice(0, 4));
      const evs = eventosNoPeriodo(Object.assign({}, f, { de: `${ano}-01-01`, ate: `${ano}-12-31` }), ['depreciacao']).filter((e) => !e.dados.saldoInicial);
      const bens = bensDoFiltro(Object.assign({}, f, { baixados: true })).filter((b) => !VP.naoDeprecia(b));
      const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
      const linhas = bens.map((b) => ({ bem: b, id: b.id, ano: evs.filter((e) => e.bemId === b.id).reduce((t, e) => t + e.valor, 0), acumulada: VP.saldo(b, `${ano}-12-31`).acumulada, liquido: VP.saldo(b, `${ano}-12-31`).liquido })).filter((l) => l.ano || l.acumulada);
      return {
        resumo: [G.numero(`Depreciação de ${ano}`, u.moedaCurta(evs.reduce((t, e) => t + e.valor, 0))), G.numero('Acumulada no fim do ano', u.moedaCurta(linhas.reduce((t, l) => t + l.acumulada, 0))), G.numero('Bens que depreciam', u.inteiro(linhas.length))],
        graficos: [{ titulo: 'Por mês', html: G.colunas(meses.map((m) => ({ rotulo: u.mesNome(m), valor: evs.filter((e) => e.data.slice(0, 7) === m).reduce((t, e) => t + e.valor, 0) })), { formato: u.moeda, formatoEixo: u.moedaCurta }) }, { titulo: 'Por classificação', html: G.barrasH([...u.agruparSoma(evs, (e) => VP.nome('classificacoes', VP.db.pega('classificacoes', VP.db.pega('bens', e.bemId)?.classificacaoId)?.paiId || ''), 'valor')].map(([k, v]) => ({ rotulo: k, valor: v })).sort((a, b) => b.valor - a.valor), { formato: u.moeda }) }],
        tabela: { linhas, colunas: [bemCol, { chave: 'classe', titulo: 'Classificação', valor: (l) => VP.nome('classificacoes', l.bem.classificacaoId) }, { chave: 'ano', titulo: `Depreciação ${ano}`, num: true, soma: true, formato: u.moeda }, { chave: 'acumulada', titulo: 'Acumulada', num: true, soma: true, formato: u.moeda }, { chave: 'liquido', titulo: 'Valor líquido', num: true, soma: true, formato: u.moeda }] }
      };
    }
  };
  R.movfinanceiras = {
    grupo: 'Movimentação', titulo: 'Movimentações financeiras', descricao: 'Todos os lançamentos que mudam valor: incorporação, depreciação, reavaliação, melhoria, baixa, estorno.',
    filtros: ['de', 'ate', 'entidadeId', 'contaId', 'unidadeId', 'tipo'], padrao: () => ({ de: inicioAno(), ate: hoje() }),
    extras: [{ chave: 'tipoMov', rotulo: 'Tipo de movimentação', tipo: 'select', opcoes: Object.entries(L.eventos).filter(([, x]) => x.grupo === 'financeiro').map(([k, x]) => [k, x.nome]) }],
    gerar(f) {
      const tipos = f.tipoMov ? [f.tipoMov] : Object.keys(L.eventos).filter((k) => L.eventos[k].grupo === 'financeiro');
      const evs = eventosNoPeriodo(f, tipos);
      return {
        resumo: [G.numero('Movimentações', u.inteiro(evs.length)), G.numero('Ainda não enviadas à contabilidade', u.inteiro(evs.filter((e) => !e.contabilizado).length), '', '#financeiro/contabilidade')],
        graficos: [{ titulo: 'Valor por tipo', html: G.barrasH([...u.agruparSoma(evs, (e) => L.eventos[e.tipo].nome, (e) => Math.abs(e.valor || 0))].map(([k, v]) => ({ rotulo: k, valor: v })), { formato: u.moedaCurta }) }],
        tabela: { linhas: evs.sort((a, b) => b.data.localeCompare(a.data)), colunas: colEv().concat([{ chave: 'tp', titulo: 'Tipo', valor: (e) => L.eventos[e.tipo].nome }, { chave: 'env', titulo: 'Enviado à contabilidade', valor: (e) => (e.contabilizado ? 'Sim' : 'Não') }]) }
      };
    }
  };
  R.inventario = {
    grupo: 'Movimentação', titulo: 'Inventário', descricao: 'Progresso e resultado: localizados, achados em outro local, não localizados e sobras, por unidade.',
    filtros: ['unidadeId', 'responsavelId'], extras: [{ chave: 'id', rotulo: 'Inventário', tipo: 'select', opcoes: [] }],
    prepararExtras() { this.extras[0].opcoes = VP.db.lista('inventarios').map((i) => [i.id, `${i.nome} (${i.situacao})`]); },
    padrao: () => { const i = VP.db.lista('inventarios').sort((a, b) => (b.abertoEm || '').localeCompare(a.abertoEm || ''))[0]; return i ? { id: i.id } : {}; },
    gerar(f) {
      const inv = VP.db.pega('inventarios', f.id);
      if (!inv) return { resumo: [], graficos: [], vazio: 'Nenhum inventário ainda. Abra um em Inventário.' };
      const p = VP.progressoInventario(inv);
      let linhas = Object.entries(inv.esperados).map(([id, esp]) => { const b = VP.db.pega('bens', id); const l = inv.leituras[id]; return { id, bem: b, esperado: esp, achado: l?.unidadeId || '', sit: !l ? 'Não localizado' : l.unidadeId === esp ? 'Localizado' : 'Em outro local', estado: l?.estado }; }).filter((x) => x.bem);
      if (f.unidadeId) linhas = linhas.filter((x) => x.esperado === f.unidadeId || x.achado === f.unidadeId);
      if (f.responsavelId) linhas = linhas.filter((x) => x.bem.responsavelId === f.responsavelId);
      const unidades = [...new Set(linhas.map((x) => x.esperado))];
      return {
        resumo: [G.numero('Conferido', u.pct(p.total ? p.conferidos / p.total : 0)), G.numero('Localizados', u.inteiro(p.localizados)), G.numero('Em outro local', u.inteiro(p.transferidos)), G.numero('Não localizados', u.inteiro(p.naoLocalizados)), G.numero('Sobras', u.inteiro(p.sobras))],
        graficos: [{ titulo: 'Por unidade', html: G.empilhadas(unidades.map((un) => { const ls = linhas.filter((x) => x.esperado === un); const c = ls.filter((x) => x.sit !== 'Não localizado').length; return { rotulo: VP.db.pega('unidades', un)?.nome || '—', a: c, b: ls.length - c }; }), ['Conferidos', 'Não localizados']) }],
        tabela: { linhas, colunas: [bemCol, { chave: 'esp', titulo: 'Deveria estar em', valor: (x) => VP.nome('unidades', x.esperado) }, { chave: 'ach', titulo: 'Achado em', valor: (x) => (x.achado ? VP.nome('unidades', x.achado) : '—') }, { chave: 'sit', titulo: 'Situação', html: (x) => `<span class="selo-venc v-${x.sit === 'Localizado' ? 'vigente' : x.sit === 'Em outro local' ? 'vencendo' : 'vencido'}">${x.sit}</span>`, valor: (x) => x.sit }, { chave: 'est', titulo: 'Estado conferido', valor: (x) => L.estados[x.estado] || '—' }] },
        nota: (inv.sobras || []).length ? `Sobras: ${inv.sobras.map((s) => `${s.plaqueta} — ${s.descricao} (${VP.nome('unidades', s.unidadeId)})`).join('; ')}` : ''
      };
    }
  };
  R.imoveis = {
    grupo: 'Prestação de contas (TCE/SC)', titulo: 'Demonstrativo dos imóveis', descricao: 'Localização, situação do registro e valor; lista dos imóveis sem registro e o que impede a regularização (IN TC-20/2015, Anexo V).',
    filtros: ['unidadeId', 'bairro', 'logradouro', 'entidadeId'],
    gerar(f) {
      const bens = bensDoFiltro(Object.assign({}, f, { tipo: 'imovel' }));
      const sit = (b) => b.imovel?.situacaoRegistro || 'Não informado';
      return {
        resumo: [G.numero('Imóveis', u.inteiro(bens.length)), G.numero('Valor', u.moedaCurta(bens.reduce((t, b) => t + VP.saldo(b).liquido, 0))), G.numero('Sem registro ou em regularização', u.inteiro(bens.filter((b) => sit(b) !== 'Registrado').length))],
        graficos: [{ titulo: 'Situação do registro', html: G.barrasH([...u.agruparSoma(bens, sit)].map(([k, n]) => ({ rotulo: k, valor: n }))) }, { titulo: 'Classificação de uso', html: G.barrasH([...u.agruparSoma(bens, (b) => b.imovel?.uso || 'Não informado')].map(([k, n]) => ({ rotulo: k, valor: n }))) }],
        tabela: { linhas: bens, colunas: [bemCol, { chave: 'end', titulo: 'Localização', valor: (b) => [b.endereco?.logradouro, b.endereco?.bairro].filter(Boolean).join(', ') }, { chave: 'mat', titulo: 'Matrícula', valor: (b) => b.imovel?.matricula }, { chave: 'sit', titulo: 'Situação do registro', valor: sit }, { chave: 'uso', titulo: 'Uso', valor: (b) => b.imovel?.uso }, { chave: 'area', titulo: 'Área construída (m²)', valor: (b) => b.medidas?.find((m) => /constru/i.test(m.nome))?.valor || '' }, { chave: 'valor', titulo: 'Valor', num: true, soma: true, formato: u.moeda, valor: (b) => VP.saldo(b).liquido }] }
      };
    }
  };
  R.frota = {
    grupo: 'Prestação de contas (TCE/SC)', titulo: 'Demonstrativo da frota', descricao: 'Veículos com custos de combustível, manutenção e seguro (IN TC-20/2015, Anexo V).',
    filtros: ['de', 'ate', 'unidadeId', 'entidadeId'], padrao: () => ({ de: inicioAno(), ate: hoje() }),
    gerar(f) {
      const bens = bensDoFiltro(Object.assign({}, f, { tipo: 'veiculo', de: undefined, ate: undefined }));
      const custo = (b, tipos) => VP.eventosDoBem(b.id).filter((e) => tipos.includes(e.tipo) && (!f.de || e.data >= f.de) && (!f.ate || e.data <= f.ate)).reduce((t, e) => t + (e.valor || 0), 0);
      const linhas = bens.map((b) => ({ bem: b, id: b.id, comb: custo(b, ['abastecimento']), man: custo(b, ['manutencao', 'despesa']), seg: b.seguro?.valor || 0 })).map((l) => Object.assign(l, { total: l.comb + l.man + l.seg }));
      return {
        resumo: [G.numero('Veículos', u.inteiro(bens.length)), G.numero('Custo total no período', u.moedaCurta(linhas.reduce((t, l) => t + l.total, 0))), G.numero('Combustível', u.moedaCurta(linhas.reduce((t, l) => t + l.comb, 0))), G.numero('Manutenção', u.moedaCurta(linhas.reduce((t, l) => t + l.man, 0)))],
        graficos: [{ titulo: 'Custo por veículo', html: G.barrasH(linhas.map((l) => ({ rotulo: `${l.bem.veiculo?.placa || ''} · ${l.bem.descricao}`, valor: l.total, link: '#bem/' + l.id })).sort((a, b) => b.valor - a.valor), { formato: u.moedaCurta }) }],
        tabela: { linhas, colunas: [{ chave: 'placa', titulo: 'Placa', valor: (l) => l.bem.veiculo?.placa }, bemCol, { chave: 'ano', titulo: 'Ano', valor: (l) => l.bem.veiculo?.anoModelo }, { chave: 'comb', titulo: 'Combustível', num: true, soma: true, formato: u.moeda }, { chave: 'man', titulo: 'Manutenção', num: true, soma: true, formato: u.moeda }, { chave: 'seg', titulo: 'Seguro', num: true, soma: true, formato: u.moeda }, { chave: 'total', titulo: 'Total', num: true, soma: true, formato: u.moeda }] }
      };
    }
  };

  // Itens da galeria que abrem documentos/ferramentas (não são relatório com gráfico)
  const ESPECIAIS = {
    etiquetas: { grupo: 'Bens', titulo: 'Etiquetas com QR Code', descricao: 'Etiquetas prontas para imprimir em folha comum. Também gera etiquetas em branco com numeração futura.' },
    'termo-responsabilidade': { grupo: 'Termos e documentos', titulo: 'Termo de responsabilidade', descricao: 'Por responsável ou por unidade, com lista dos bens e campo de assinatura.' },
    'termo-conferencia': { grupo: 'Termos e documentos', titulo: 'Termo de conferência', descricao: 'Lista para conferir na unidade, com caixas de marcação.' },
    documentos: { grupo: 'Termos e documentos', titulo: 'Parecer de avaliação e laudo de veículo', descricao: 'Parecer técnico de avaliação de bens móveis e laudo de reavaliação de veículo, já preenchidos.' }
  };

  // ---------------------------------------------------------------- galeria
  T.relatorios = () => {
    const todos = Object.entries(R).map(([k, r]) => [k, r]).concat(Object.entries(ESPECIAIS));
    const grupos = [...new Set(todos.map(([, r]) => r.grupo))];
    return {
      titulo: 'Relatórios',
      html: `<p class="ajuda">Todos os relatórios abrem na hora, com números, gráficos e tabela. Em cada um: <b>Imprimir / PDF</b> e <b>Baixar planilha</b> (escolhendo as colunas).</p>
        ${grupos.map((g) => `<h3>${esc(g)}</h3><div class="galeria">${todos.filter(([, r]) => r.grupo === g).map(([k, r]) => `<a class="cartao-relatorio" href="#relatorio/${k}"><b>${esc(r.titulo)}</b><span>${esc(r.descricao)}</span></a>`).join('')}</div>`).join('')}
        <h3>Imóveis</h3><div class="galeria"><a class="cartao-relatorio" href="#imoveis/demonstrativo"><b>Demonstrativo dos bens imóveis (TCE/SC)</b><span>Localização, situação do registro, motivo dos não registrados, uso, área e valor.</span></a><a class="cartao-relatorio" href="#imoveis"><b>Situação dos imóveis</b><span>Documentos vencidos, cessões, pendências de regularização.</span></a><a class="cartao-relatorio" href="#imoveis/mapa"><b>Mapa dos imóveis</b><span>Imóveis no mapa de ruas, com link para o Google Maps e arquivo para o Google Earth (KML).</span></a></div>
        <h3>Fotos</h3><div class="galeria"><a class="cartao-relatorio" href="#relatorio-fotos"><b>Relatório com fotos</b><span>Bens com foto por unidade e estado; imóveis com fotos e mapa.</span></a></div>`
    };
  };

  // ---------------------------------------------------------------- tela de um relatório
  VP.estado.filtrosRel = VP.estado.filtrosRel || {};
  T.relatorio = (chave, query) => {
    if (ESPECIAIS[chave]) return especial(chave, query);
    const r = R[chave];
    if (!r) return { titulo: 'Relatório', html: '<p>Relatório não encontrado.</p>' };
    if (r.prepararExtras) r.prepararExtras();
    const v = VP.estado.filtrosRel[chave] = VP.estado.filtrosRel[chave] || Object.assign({}, r.padrao ? r.padrao() : {});
    if (query.id) v.id = query.id;
    const defs = r.filtros.map((k) => F[k]()).concat(r.extras || []);
    const desenhar = () => {
      const f = ui.limparValores(v);
      // Sem data de início ou fim (filtro removido): usa o período padrão do relatório
      const pad = r.padrao ? r.padrao() : {};
      for (const k of ['de', 'ate']) if (!f[k] && pad[k]) f[k] = pad[k];
      const out = r.gerar(f);
      if (out.vazio) return `${ui.filtros({ id: 'rel', defs, valores: v, busca: false, aoMudar: () => { atualizar(); lancarAntes(); } })}<p class="vazio">${esc(out.vazio)}</p>`;
      return `${ui.filtros({ id: 'rel', defs, valores: v, busca: false, aoMudar: () => { atualizar(); lancarAntes(); } })}
        <div class="relatorio" id="corpo-relatorio">
          <div class="relatorio-filtros-texto">${esc(textoFiltros(defs, f))}</div>
          <div class="resumo-linha">${(out.resumo || []).join('')}</div>
          ${out.cartoes ? `<div class="grade-grupos">${out.cartoes}</div>` : ''}
          <div class="grade-graficos">${(out.graficos || []).map((g) => `<section class="cartao"><h3>${esc(g.titulo)}</h3>${g.html}</section>`).join('')}</div>
          ${out.nota ? `<p class="nota-relatorio">${esc(out.nota)}</p>` : ''}
          ${out.tabela ? ui.tabela({ id: 'rel-' + chave, colunas: out.tabela.colunas, linhas: out.tabela.linhas, nomePlanilha: chave, porPagina: 100 }) : ''}
        </div>`;
    };
    const atualizar = () => { document.getElementById('area-rel').innerHTML = desenhar(); ui.ligarTabela('rel-' + chave); };
    // Depreciação automática ao gerar o balancete (opção em Configurações)
    const lancarAntes = async () => {
      if (chave !== 'balancete' || VP.config().depreciacaoAutomatica !== 'balancete') return;
      const ate = (ui.limparValores(v).ate || VP.Plataforma.hoje()).slice(0, 7);
      if (!VP.mesesPendentes(ate).length) return;
      const feitos = await VP.fecharMesesPendentes(ate);
      ui.resultado({ titulo: 'Depreciação lançada automaticamente', sucesso: feitos.map((x) => `${u.mesExtenso(x.mes)}: ${u.inteiro(x.qtd)} bens · ${u.moeda(x.total)}`), extra: '<p class="ajuda">Feito porque a configuração "Lançar a depreciação automaticamente" está em "Ao gerar o balancete". Para desfazer, use Financeiro → Fechar o mês.</p>' });
      atualizar();
    };
    return {
      titulo: r.titulo,
      acoes: '<a class="botao" href="#relatorios">‹ Relatórios</a> <button class="botao" data-planilha-rel>Baixar planilha</button> <button class="botao primario" data-imprimir-rel>Imprimir / PDF</button>',
      html: `<p class="ajuda">${esc(r.descricao)}</p><div id="area-rel">${desenhar()}</div>`,
      ligar() {
        ui.ligarTabela('rel-' + chave);
        lancarAntes();
        document.querySelector('[data-imprimir-rel]').addEventListener('click', () => {
          const corpo = document.getElementById('corpo-relatorio').cloneNode(true);
          corpo.querySelectorAll('.tabela-barra,.paginacao,button').forEach((x) => x.remove());
          // na impressão vão todas as linhas, não só a página da tela
          const st = ui.tabelas['rel-' + chave];
          if (st) { const por = st.cfg.porPagina; st.cfg.porPagina = 100000; const tmp = document.createElement('div'); tmp.innerHTML = ui._corpoTabela(st); st.cfg.porPagina = por; tmp.querySelectorAll('.tabela-barra,.paginacao').forEach((x) => x.remove()); const alvo = corpo.querySelector('.tabela-area'); if (alvo) alvo.innerHTML = tmp.innerHTML; }
          ui.imprimir(corpo.innerHTML, r.titulo);
        });
        document.querySelector('[data-planilha-rel]').addEventListener('click', () => (ui.tabelas['rel-' + chave] ? ui.exportarTabela('rel-' + chave) : ui.aviso('Este relatório não tem tabela.', 'erro')));
      }
    };
  };
  const textoFiltros = (defs, f) => {
    const p = defs.filter((d) => f[d.chave] !== undefined && f[d.chave] !== false).map((d) => {
      const x = f[d.chave];
      const txt = d.tipo === 'select' ? (d.opcoes.find(([k]) => String(k) === String(x))?.[1] || x) : d.tipo === 'data' ? u.data(x) : d.tipo === 'bool' ? 'sim' : x;
      return `${d.rotulo}: ${txt}`;
    });
    return p.length ? 'Filtros: ' + p.join(' · ') : 'Sem filtros (tudo).';
  };

  // ---------------------------------------------------------------- telas especiais
  const especial = (chave, query) => {
    const e = ESPECIAIS[chave];
    const base = { titulo: e.titulo, acoes: '<a class="botao" href="#relatorios">‹ Relatórios</a>' };
    if (chave === 'etiquetas') {
      const ids = VP.estado.etiquetasIds;
      const campos = [
        { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opc('unidades'), largura: 'meia' }, { chave: 'classificacaoId', rotulo: 'Grupo / classe / subclasse', tipo: 'select', opcoes: VP.opcClassificacoes(), largura: 'meia' },
        { chave: 'produtoId', rotulo: 'Produto', tipo: 'select', opcoes: opc('produtos'), largura: 'meia' }, { chave: 'status', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(L.status), largura: 'meia' },
        { chave: 'tipo', rotulo: 'Tipo do bem', tipo: 'select', opcoes: Object.entries(L.tiposBem), largura: 'meia' }, { chave: 'codigos', rotulo: 'Bens (códigos, ex.: 1,2,6-10)', largura: 'meia' },
        { chave: 'de', rotulo: 'Comprados de', tipo: 'data', largura: 'meia' }, { chave: 'ate', rotulo: 'até', tipo: 'data', largura: 'meia' },
        { chave: 'embranco', rotulo: 'Etiquetas em branco (numeração futura) — quantas', tipo: 'numero', largura: 'meia' }];
      return Object.assign(base, {
        html: `<div class="cartao">${ids ? `<p><b>${ids.length}</b> bens escolhidos na lista. <button class="botao pequeno" data-limpar-ids>Escolher por filtro</button></p>` : ui.campos(campos)}
          <button class="botao primario" data-gerar-etiquetas>Gerar etiquetas</button></div><div id="etiquetas-previa"></div>`,
        ligar() {
          document.querySelector('[data-limpar-ids]')?.addEventListener('click', () => { VP.estado.etiquetasIds = null; VP.app.render(); });
          document.querySelector('[data-gerar-etiquetas]').addEventListener('click', () => {
            let bens, branco = 0;
            if (ids) bens = VP.filtrarBens({ ids, baixados: true });
            else {
              const { valores: x } = ui.lerCampos(document.getElementById('conteudo'), campos);
              const faixa = u.faixas(x.codigos);
              bens = bensDoFiltro(ui.limparValores({ unidadeId: x.unidadeId, classificacaoId: x.classificacaoId, produtoId: x.produtoId, status: x.status, tipo: x.tipo, baixados: x.status === 'baixado' }));
              if (faixa) bens = bens.filter((b) => faixa(b.codigo));
              if (x.de) bens = bens.filter((b) => b.dataAquisicao >= x.de);
              if (x.ate) bens = bens.filter((b) => b.dataAquisicao <= x.ate);
              branco = Math.min(500, Math.floor(x.embranco || 0));
            }
            const prox = Math.max(...VP.db.lista('bens', true).map((b) => Number(b.plaqueta) || 0)) + 1;
            const etq = bens.map((b) => ({ pl: b.plaqueta, txt: b.descricao, sub: VP.db.pega('unidades', b.unidadeId)?.nome || '' }))
              .concat(Array.from({ length: branco }, (_, i) => ({ pl: String(prox + i), txt: '', sub: 'Reservada' })));
            const html = `<div class="folha-etiquetas">${etq.map((x) => `<div class="etiqueta"><div class="etq-qr">${G.qr(x.pl, 2)}</div><div class="etq-txt"><small>${esc(VP.nome('entidades', 'E1'))}</small><b>Nº ${esc(x.pl)}</b><span>${esc(x.txt)}</span><small>${esc(x.sub)}</small></div></div>`).join('')}</div>`;
            document.getElementById('etiquetas-previa').innerHTML = `<p><b>${etq.length}</b> etiquetas. <button class="botao primario" data-imprimir-etq>Imprimir</button></p>${html}`;
            document.querySelector('[data-imprimir-etq]').addEventListener('click', () => ui.imprimir(html, 'Etiquetas patrimoniais'));
          });
        }
      });
    }
    if (chave === 'termo-responsabilidade' || chave === 'termo-conferencia') {
      const campos = [{ chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: opc('responsaveis'), largura: 'meia' }, { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opc('unidades'), largura: 'meia' }, { chave: 'tipo', rotulo: 'Tipo do bem', tipo: 'select', opcoes: Object.entries(L.tiposBem), largura: 'meia' }, { chave: 'status', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(L.status), largura: 'meia' }, { chave: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: opc('contas', (c) => c.tipo === 'ativo'), largura: 'meia' }, { chave: 'de', rotulo: 'Comprados de', tipo: 'data', largura: 'meia' }, { chave: 'ate', rotulo: 'até', tipo: 'data', largura: 'meia' }];
      return Object.assign(base, {
        html: `<div class="cartao">${ui.campos(campos)}<button class="botao primario" data-gerar-termo>Gerar e imprimir</button></div>`,
        ligar() {
          document.querySelector('[data-gerar-termo]').addEventListener('click', () => {
            const { valores: x } = ui.lerCampos(document.getElementById('conteudo'), campos);
            let bens = bensDoFiltro(ui.limparValores({ responsavelId: x.responsavelId, unidadeId: x.unidadeId, tipo: x.tipo, status: x.status, contaId: x.contaId }));
            if (x.de) bens = bens.filter((b) => b.dataAquisicao >= x.de);
            if (x.ate) bens = bens.filter((b) => b.dataAquisicao <= x.ate);
            if (!bens.length) return ui.aviso('Nenhum bem com esses filtros.', 'erro');
            chave === 'termo-responsabilidade' ? VP.documentos.termoResponsabilidade(bens, x.responsavelId) : VP.documentos.termoConferencia(bens, x.unidadeId);
          });
        }
      });
    }
    // documentos diversos
    return Object.assign(base, {
      html: `<div class="cartao">${ui.campos([{ chave: 'modelo', rotulo: 'Documento', tipo: 'select', vazio: false, opcoes: [['parecer', 'Parecer técnico de avaliação para bens móveis'], ['veiculo', 'Laudo de reavaliação de veículo']] }, { chave: 'codigos', rotulo: 'Bens (códigos, ex.: 1,2,6-10)', obrigatorio: true }, { chave: 'comissaoId', rotulo: 'Comissão', tipo: 'select', opcoes: opc('comissoes') }])}
        <button class="botao primario" data-gerar-doc>Gerar e imprimir</button></div>`,
      ligar() {
        document.querySelector('[data-gerar-doc]').addEventListener('click', () => {
          const c = document.getElementById('conteudo');
          const faixa = u.faixas(c.querySelector('[name=codigos]').value);
          const bens = faixa ? VP.db.lista('bens').filter((b) => faixa(b.codigo)) : [];
          if (!bens.length) return ui.aviso('Informe códigos de bens existentes.', 'erro');
          const modelo = c.querySelector('[name=modelo]').value;
          const com = c.querySelector('[name=comissaoId]').value;
          if (modelo === 'veiculo' && bens.some((b) => b.tipo !== 'veiculo')) return ui.aviso('O laudo de veículo é só para veículos.', 'erro');
          modelo === 'parecer' ? VP.documentos.parecerTecnico(bens, com) : VP.documentos.laudoVeiculo(bens, com);
        });
      }
    });
  };

  // ---------------------------------------------------------------- documentos para imprimir
  const assinaturas = (nomes) => `<div class="assinaturas">${nomes.map((n) => `<div><span></span>${esc(n)}</div>`).join('')}</div>`;
  const tabelaBens = (bens, extra = []) => `<table class="tabela doc"><thead><tr><th>Código</th><th>Plaqueta</th><th>Bem</th><th>Estado</th>${extra.map((e) => `<th class="${e.num ? 'num' : ''}">${esc(e.t)}</th>`).join('')}</tr></thead><tbody>${bens.map((b) => `<tr><td>${esc(b.codigo)}</td><td>${esc(b.plaqueta)}</td><td>${esc(b.descricao)}</td><td>${esc(L.estados[b.estado] || '')}</td>${extra.map((e) => `<td class="${e.num ? 'num' : ''}">${e.v(b)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const D = VP.documentos = {};
  D.fichaBem = (b) => {
    const s = VP.saldo(b);
    ui.imprimir(`<div class="doc-ficha"><div class="doc-ficha-topo"><div>${b.fotos?.[0] ? `<img src="${b.fotos[0].dataURL}" alt="">` : ''}</div><div><h1>${esc(b.descricao)}</h1><p>Código ${esc(b.codigo)} · Plaqueta ${esc(b.plaqueta)} · ${esc(L.tiposBem[b.tipo])}</p><p>${esc(VP.nome('unidades', b.unidadeId))} · Responsável: ${esc(VP.nome('responsaveis', b.responsavelId))}</p></div><div class="doc-qr">${G.qr(b.plaqueta, 3)}</div></div>
      <div class="resumo-linha">${G.numero('Valor contábil', u.moeda(s.liquido))}${G.numero('Depreciação acumulada', u.moeda(s.acumulada))}${G.numero('Estado', L.estados[b.estado])}${G.numero('Situação', L.status[b.status])}</div>
      ${document.querySelector('.grade-secoes') ? document.querySelector('.grade-secoes').outerHTML.replace(/<button[^>]*>.*?<\/button>/g, '') : ''}
      <h3>Linha do tempo</h3>${document.getElementById('linha-tempo') ? document.getElementById('linha-tempo').innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '') : ''}</div>`, `Ficha do bem ${b.codigo}`);
  };
  D.termoResponsabilidade = (bens, responsavelId) => {
    const grupos = new Map();
    for (const b of bens) { const r = responsavelId || b.responsavelId || ''; if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(b); }
    ui.imprimir([...grupos].map(([r, lista]) => `<section class="doc-pagina"><h1>Termo de responsabilidade</h1>
      <p>Eu, <b>${esc(r ? VP.nome('responsaveis', r) : '______________________')}</b>, matrícula ${esc(VP.db.pega('responsaveis', r)?.matricula || '________')}, declaro que recebi e sou responsável pela guarda e conservação dos bens abaixo, comprometendo-me a comunicar ao setor de patrimônio qualquer transferência, dano, extravio ou furto.</p>
      ${tabelaBens(lista, [{ t: 'Unidade', v: (b) => esc(VP.nome('unidades', b.unidadeId)) }, { t: 'Valor', num: true, v: (b) => u.moeda(VP.saldo(b).liquido) }])}
      <p>Total: ${lista.length} bens · ${u.moeda(lista.reduce((t, b) => t + VP.saldo(b).liquido, 0))}</p>
      <p>Local e data: ______________________, ${u.data(hoje())}</p>${assinaturas([r ? VP.nome('responsaveis', r) : 'Responsável', 'Setor de patrimônio'])}</section>`).join(''), 'Termo de responsabilidade');
  };
  D.termoConferencia = (bens, unidadeId) => ui.imprimir(`<h1>Termo de conferência</h1><p>Unidade: <b>${esc(unidadeId ? VP.nome('unidades', unidadeId) : 'várias')}</b> · Data: ____/____/______</p>
    <table class="tabela doc"><thead><tr><th>Achado</th><th>Código</th><th>Plaqueta</th><th>Bem</th><th>Local</th><th>Estado</th><th>Observação</th></tr></thead><tbody>${bens.map((b) => `<tr><td>☐</td><td>${esc(b.codigo)}</td><td>${esc(b.plaqueta)}</td><td>${esc(b.descricao)}</td><td>${esc(b.localizacao || '')}</td><td>☐ Ótimo ☐ Bom ☐ Regular ☐ Ruim</td><td></td></tr>`).join('')}</tbody></table>
    ${assinaturas(['Conferido por', 'Responsável pela unidade'])}`, 'Termo de conferência');
  D.termoTransferencia = (t) => {
    const bens = t.bens.map((id) => VP.db.pega('bens', id)).filter(Boolean);
    const para = t.tipo === 'interna' ? VP.nome('unidades', t.destinoUnidadeId) : t.tipo === 'externa' ? t.destinoExterno : VP.nome('entidades', t.entidadeDestinoId);
    ui.imprimir(`<h1>Termo de transferência</h1><p>Tipo: <b>${esc(L.tiposTransferencia[t.tipo])}</b> · Data: ${u.data(t.data)} · Motivo: ${esc(t.motivo || '—')}</p>
      <p>De: <b>${esc(VP.nome('unidades', t.origemUnidadeId))}</b> → Para: <b>${esc(para)}</b>${t.retornoPrevisto ? ` · Volta prevista: ${u.data(t.retornoPrevisto)}` : ''}</p>
      ${tabelaBens(bens, [{ t: 'Valor', num: true, v: (b) => u.moeda(VP.saldo(b).liquido) }])}
      ${t.observacao ? `<p>Observação: ${esc(t.observacao)}</p>` : ''}${assinaturas(['Quem entrega', 'Quem recebe', 'Setor de patrimônio'])}`, 'Termo de transferência');
  };
  D.termoBaixa = (bens, dados) => ui.imprimir(`<h1>Termo de baixa</h1><p>Tipo: <b>${esc(dados.tipoBaixa)}</b> · Motivo: ${esc(dados.motivo)} · Data: ${u.data(dados.data)}</p>
    <p>Documento: ${esc(dados.documento || '—')} · Avaliação prévia: ${esc(dados.avaliacao || '—')} · Lei autorizativa: ${esc(dados.leiAutorizativa || '—')}</p>
    ${dados.justificativa ? `<p>Justificativa: ${esc(dados.justificativa)}</p>` : ''}
    ${tabelaBens(bens, [{ t: 'Valor que saiu', num: true, v: (b) => u.moeda(VP.eventosDoBem(b.id).find((e) => e.tipo === 'baixa')?.valor ?? VP.saldo(b).liquidoAntesDaBaixa) }])}
    ${assinaturas(['Comissão', 'Setor de patrimônio', 'Autoridade competente'])}`, 'Termo de baixa');
  D.laudoReavaliacao = (r) => {
    const evs = VP.db.lista('eventos').filter((e) => e.loteId === r.loteId);
    ui.imprimir(`<h1>Laudo de reavaliação nº ${esc(r.laudo)}</h1><p>Data: ${u.data(r.data)} · Comissão: ${esc(VP.nome('comissoes', r.comissaoId))} ${VP.db.pega('comissoes', r.comissaoId)?.ato ? '(' + esc(VP.db.pega('comissoes', r.comissaoId).ato) + ')' : ''}</p>
      <table class="tabela doc"><thead><tr><th>Bem</th><th class="num">Valor anterior</th><th class="num">Valor novo</th><th class="num">Diferença</th><th>Vida útil (meses)</th></tr></thead><tbody>${evs.map((e) => `<tr><td>${esc(VP.db.pega('bens', e.bemId)?.codigo)} · ${esc(VP.db.pega('bens', e.bemId)?.descricao)}</td><td class="num">${u.moeda(e.dados.valorAnterior)}</td><td class="num">${u.moeda(e.dados.valorNovo)}</td><td class="num">${u.moeda(e.dados.valorNovo - e.dados.valorAnterior)}</td><td>${esc(e.dados.vidaUtilMeses)}</td></tr>`).join('')}</tbody></table>
      <p>Total anterior ${u.moeda(r.antes)} · Total novo ${u.moeda(r.depois)} · Situação: ${esc(r.situacao)}</p>${assinaturas(['Membro da comissão', 'Membro da comissão', 'Membro da comissão'])}`, 'Laudo de reavaliação');
  };
  D.parecerTecnico = (bens, comissaoId) => ui.imprimir(`<h1>Parecer técnico de avaliação para bens móveis</h1>
    <p>A comissão ${esc(VP.nome('comissoes', comissaoId))} avaliou os bens abaixo considerando estado de conservação, vida útil restante e valor de mercado de bens semelhantes.</p>
    ${tabelaBens(bens, [{ t: 'Idade', v: (b) => `${Number(hoje().slice(0, 4)) - Number((b.dataAquisicao || hoje()).slice(0, 4))} anos` }, { t: 'Valor contábil', num: true, v: (b) => u.moeda(VP.saldo(b).liquido) }, { t: 'Valor avaliado', v: () => 'R$ __________' }, { t: 'Vida útil restante', v: () => '_____ meses' }])}
    <p>Critério de avaliação: ______________________________________________</p>${assinaturas(['Membro da comissão', 'Membro da comissão', 'Membro da comissão'])}`, 'Parecer técnico de avaliação');
  D.laudoVeiculo = (bens, comissaoId) => ui.imprimir(bens.map((b) => `<section class="doc-pagina"><h1>Laudo de reavaliação de veículo</h1>
    <p>Veículo: <b>${esc(b.descricao)}</b> · Placa ${esc(b.veiculo?.placa)} · RENAVAM ${esc(b.veiculo?.renavam)} · Chassi ${esc(b.veiculo?.chassi)} · Ano ${esc(b.veiculo?.anoModelo)}</p>
    <p>Valor contábil atual: ${u.moeda(VP.saldo(b).liquido)} · Comissão: ${esc(VP.nome('comissoes', comissaoId))}</p>
    <table class="tabela doc"><tbody>${['Motor', 'Câmbio', 'Suspensão', 'Freios', 'Pneus', 'Lataria', 'Pintura', 'Interior', 'Parte elétrica'].map((x) => `<tr><td>${x}</td><td>☐ Ótimo ☐ Bom ☐ Regular ☐ Ruim</td></tr>`).join('')}</tbody></table>
    <p>Quilometragem: ________ · Valor de referência (tabela de mercado): R$ __________ · Valor avaliado: R$ __________ · Vida útil restante: _____ meses</p>${assinaturas(['Membro da comissão', 'Membro da comissão', 'Membro da comissão'])}</section>`).join(''), 'Laudo de reavaliação de veículo');
  D.procuraSe = (inv) => {
    const nao = Object.keys(inv.esperados).filter((id) => !inv.leituras[id]).map((id) => VP.db.pega('bens', id)).filter(Boolean);
    ui.imprimir(`<h1>Procura-se: bens ainda não localizados</h1><p>${esc(inv.nome)} · ${nao.length} bens. Se encontrar, avise o setor de patrimônio.</p>
      <div class="procura-se">${nao.map((b) => `<div class="cartao">${b.fotos?.[0] ? `<img src="${b.fotos[0].dataURL}" alt="">` : ''}<b>${esc(b.descricao)}</b><span>Plaqueta ${esc(b.plaqueta)}</span><small>Deveria estar em: ${esc(VP.nome('unidades', inv.esperados[b.id]))}</small></div>`).join('')}</div>`, 'Procura-se');
  };
})();
