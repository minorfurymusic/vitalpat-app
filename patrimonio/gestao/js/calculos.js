/* VitalPat Patrimônio · Gestão — cálculos (sem tela): valores, depreciação, score, pendências, filtros. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u;
  const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

  // ------------------------------------------------------------- índice de eventos
  let indice = null;
  const gravarOriginal = VP.db.gravar.bind(VP.db);
  // Ao gravar, descarta índices e textos de busca que ficaram velhos
  VP.db.gravar = (col, docs) => {
    if (col === 'eventos') indice = null;
    if (col === 'bens') for (const d of (Array.isArray(docs) ? docs : [docs])) delete d._busca;
    return gravarOriginal(col, docs);
  };
  const gravarVariasOriginal = VP.db.gravarVarias.bind(VP.db);
  VP.db.gravarVarias = (mapa) => {
    if (mapa.eventos) indice = null;
    for (const d of (mapa.bens || [])) delete d._busca;
    return gravarVariasOriginal(mapa);
  };
  VP.invalidarIndice = () => { indice = null; };

  VP.eventosDoBem = (bemId) => {
    if (!indice) {
      indice = new Map();
      const todos = VP.db.lista('eventos').filter((e) => !e.cancelado)
        .sort((a, b) => (a.data + a.criadoEm).localeCompare(b.data + b.criadoEm));
      for (const e of todos) {
        if (!indice.has(e.bemId)) indice.set(e.bemId, []);
        indice.get(e.bemId).push(e);
      }
    }
    return indice.get(bemId) || [];
  };

  // ------------------------------------------------------------- valores do bem
  // Ciclo atual = desde a incorporação ou a última reavaliação.
  VP.saldo = (bem, ate = null) => {
    const evs = VP.eventosDoBem(bem.id).filter((e) => !ate || e.data <= ate);
    let base = 0, acumuladaCiclo = 0, acumuladaTotal = 0, agregado = 0;
    let marco = null; // evento que iniciou o ciclo
    let baixado = null;
    for (const e of evs) {
      if (e.tipo === 'incorporacao') { base = e.valor || 0; acumuladaCiclo = 0; marco = e; }
      else if (e.tipo === 'reavaliacao') { base = e.dados.valorNovo ?? e.valor ?? base; acumuladaCiclo = 0; marco = e; }
      else if (e.tipo === 'agregacao') { base += e.valor || 0; agregado += e.valor || 0; }
      else if (e.tipo === 'depreciacao') { acumuladaCiclo += e.valor || 0; acumuladaTotal += e.valor || 0; }
      else if (e.tipo === 'baixa') { baixado = e; }
    }
    const p = bem.depreciacao || {};
    const vida = (marco && marco.tipo === 'reavaliacao' && marco.dados.vidaUtilMeses) || p.vidaUtilMeses || 0;
    let residual = 0;
    if (marco && marco.tipo === 'reavaliacao' && marco.dados.residual != null) residual = marco.dados.residual;
    else residual = p.residualTipo === 'percentual' ? base * (p.residual || 0) / 100 : (p.residual || 0);
    residual = Math.min(residual, base);
    let inicio = null;
    if (marco) {
      inicio = marco.tipo === 'incorporacao' && p.inicio ? p.inicio.slice(0, 7) : u.somaMeses(marco.data, 1);
    }
    const liquido = baixado ? 0 : r2(base - acumuladaCiclo);
    const depreciavel = Math.max(0, base - residual);
    return {
      base: r2(base), residual: r2(residual), acumulada: r2(acumuladaCiclo), acumuladaTotal: r2(acumuladaTotal),
      agregado: r2(agregado), liquido, liquidoAntesDaBaixa: r2(base - acumuladaCiclo),
      vidaUtilMeses: vida, inicio, depreciavel: r2(depreciavel),
      consumido: depreciavel > 0 ? Math.min(1, acumuladaCiclo / depreciavel) : (vida ? 1 : 0),
      marco, baixado
    };
  };

  VP.naoDeprecia = (bem) => {
    const p = bem.depreciacao || {};
    if (!p.automatica) return true;
    const cl = VP.db.pega('classificacoes', bem.classificacaoId);
    return !!(cl && cl.naoDeprecia);
  };

  // Valor da depreciação de um bem num mês (AAAA-MM)
  VP.quotaMes = (bem, ym) => {
    if (VP.naoDeprecia(bem)) return 0;
    const s = VP.saldo(bem, u.fimDoMes(u.somaMeses(ym, -1)));
    if (s.baixado || (bem.status === 'baixado' && !VP.eventosDoBem(bem.id).some((e) => e.tipo === 'baixa'))) return 0;
    if (!s.inicio || ym < s.inicio || !s.vidaUtilMeses) return 0;
    const restante = r2(s.depreciavel - s.acumulada);
    if (restante <= 0) return 0;
    const p = bem.depreciacao || {};
    let q = 0;
    if (p.metodo === 'somaDigitos') {
      const n = s.vidaUtilMeses;
      const k = u.mesesEntre(s.inicio, ym) + 1;
      if (k > n) return 0;
      q = s.depreciavel * (n - k + 1) / (n * (n + 1) / 2);
    } else if (p.metodo === 'unidades') {
      const total = p.producaoTotal || 0;
      if (!total) return 0;
      const qtd = VP.eventosDoBem(bem.id).filter((e) => e.tipo === 'unidades' && e.data.slice(0, 7) === ym)
        .reduce((t, e) => t + (e.dados.quantidade || 0), 0);
      q = s.depreciavel * qtd / total;
    } else {
      q = s.depreciavel / s.vidaUtilMeses;
    }
    return r2(Math.min(q, restante));
  };

  // Taxas para mostrar na ficha (referência: método linear)
  VP.taxas = (bem) => {
    const s = VP.saldo(bem);
    const mensal = s.vidaUtilMeses ? r2(s.depreciavel / s.vidaUtilMeses) : 0;
    return { mensal, anual: r2(mensal * 12), percentualAnual: s.base ? mensal * 12 / s.base : 0 };
  };

  // Projeção mês a mês do valor líquido até o fim da vida útil (para o gráfico)
  VP.projecao = (bem) => {
    const s = VP.saldo(bem);
    if (!s.inicio || !s.vidaUtilMeses || VP.naoDeprecia(bem)) return [];
    const p = bem.depreciacao || {};
    const pts = [];
    let acum = 0;
    for (let k = 0; k <= s.vidaUtilMeses; k++) {
      const ym = u.somaMeses(s.inicio, k);
      pts.push({ x: ym, y: r2(s.base - acum) });
      let q;
      if (p.metodo === 'somaDigitos') q = s.depreciavel * (s.vidaUtilMeses - k) / (s.vidaUtilMeses * (s.vidaUtilMeses + 1) / 2);
      else q = s.depreciavel / s.vidaUtilMeses; // unidades: aproximação linear para a projeção
      acum = Math.min(s.depreciavel, acum + Math.max(0, q));
    }
    return pts;
  };

  // ------------------------------------------------------------- score do bem (A2.4)
  VP.score = (bem) => {
    if (bem.status === 'baixado') return null;
    const s = VP.saldo(bem);
    const hoje = VP.Plataforma.hoje();
    const umAno = u.somaDias(hoje, -365);
    const evs = VP.eventosDoBem(bem.id);
    const custo = evs.filter((e) => (e.tipo === 'manutencao' || e.tipo === 'despesa') && e.data >= umAno)
      .reduce((t, e) => t + (e.valor || 0), 0);
    const vistoriaRecente = evs.some((e) => (e.tipo === 'vistoria' || e.tipo === 'inventario') && e.data >= umAno);
    const estado = (Math.min(7, Number(bem.estado) || 4) - 1) / 6; // escala de 8: Ótimo e Novo contam como o máximo; Imprestável = 0
    const vida = VP.naoDeprecia(bem) ? 0.5 : 1 - s.consumido;
    const custoRel = 1 - Math.min(1, custo / Math.max(1, s.base));
    const v = Math.round(100 * (0.40 * estado + 0.30 * vida + 0.20 * custoRel + 0.10 * (vistoriaRecente ? 1 : 0.3)));
    const faixa = v >= 75 ? 'Manter' : v >= 55 ? 'Atenção' : v >= 35 ? 'Reformar' : 'Substituir ou baixar';
    return { valor: v, faixa, custo12m: r2(custo) };
  };

  // ------------------------------------------------------------- filtros da lista de bens
  VP.subClassificacoes = (id) => {
    const ids = new Set([id]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const c of VP.db.lista('classificacoes')) if (ids.has(c.paiId) && !ids.has(c.id)) { ids.add(c.id); mudou = true; }
    }
    return ids;
  };

  VP.textoBusca = (b) => {
    if (!b._busca) {
      b._busca = u.normalizar([b.codigo, b.plaqueta, b.plaquetaAnterior, ...(b.plaquetasAnteriores || []).map((a) => a.plaqueta), b.descricao, b.complemento,
        VP.nome('unidades', b.unidadeId), VP.nome('responsaveis', b.responsavelId), b.localizacao,
        b.detalhes?.marca, b.detalhes?.modelo, b.detalhes?.serie, b.veiculo?.placa, b.endereco?.logradouro, b.endereco?.bairro].join(' | '));
    }
    return b._busca;
  };

  VP.filtrarBens = (f = {}) => {
    const cfg = VP.config();
    let lista = VP.db.lista('bens');
    if (!f.baixados) lista = lista.filter((b) => b.status !== 'baixado');
    if (f.busca) {
      const faixa = u.faixas(f.busca);
      const umNumero = /^\s*\d+\s*$/.test(f.busca) ? String(f.busca).trim() : null;
      // um número sozinho: código, plaqueta atual ou plaqueta anterior (com 35 mil bens importados, código e plaqueta não coincidem)
      if (umNumero) lista = lista.filter((b) => String(b.codigo) === umNumero || String(b.plaqueta) === umNumero || String(b.plaquetaAnterior || '') === umNumero || (b.plaquetasAnteriores || []).some((a) => String(a.plaqueta) === umNumero));
      else if (faixa) lista = lista.filter((b) => faixa(b.codigo));
      else {
        const termos = u.normalizar(f.busca).split(/\s+/).filter(Boolean);
        lista = lista.filter((b) => { const t = VP.textoBusca(b); return termos.every((x) => t.includes(x)); });
      }
    }
    if (f.tipo) lista = lista.filter((b) => b.tipo === f.tipo);
    if (f.tipos) lista = lista.filter((b) => f.tipos.includes(b.tipo));
    if (f.status) lista = lista.filter((b) => b.status === f.status);
    if (f.estado) lista = lista.filter((b) => String(b.estado) === String(f.estado));
    if (f.unidadeId) lista = lista.filter((b) => b.unidadeId === f.unidadeId);
    if (f.classificacaoId) { const ids = VP.subClassificacoes(f.classificacaoId); lista = lista.filter((b) => ids.has(b.classificacaoId)); }
    if (f.contaId) lista = lista.filter((b) => b.contaId === f.contaId);
    if (f.responsavelId) lista = lista.filter((b) => b.responsavelId === f.responsavelId || (b.responsaveisAdicionais || []).includes(f.responsavelId));
    if (f.minha && cfg.usuarioResponsavelId) lista = lista.filter((b) => b.responsavelId === cfg.usuarioResponsavelId);
    if (f.semResponsavel) lista = lista.filter((b) => !b.responsavelId);
    for (const k of ['cidade', 'bairro', 'logradouro']) {
      if (f[k]) { const t = u.normalizar(f[k]); lista = lista.filter((b) => u.normalizar(b.endereco?.[k] || VP.db.pega('unidades', b.unidadeId)?.[k]).includes(t)); }
    }
    if (f.anoDe) lista = lista.filter((b) => (b.dataAquisicao || '') >= `${f.anoDe}-01-01`);
    if (f.anoAte) lista = lista.filter((b) => (b.dataAquisicao || '') <= `${f.anoAte}-12-31`);
    if (f.valorMin != null || f.valorMax != null) {
      lista = lista.filter((b) => { const v = VP.saldo(b).liquido; return (f.valorMin == null || v >= f.valorMin) && (f.valorMax == null || v <= f.valorMax); });
    }
    if (f.totalmenteDepreciados) lista = lista.filter((b) => { const s = VP.saldo(b); return s.vidaUtilMeses && s.consumido >= 1 && b.status !== 'baixado'; });
    if (f.ids) { const ids = new Set(f.ids); lista = lista.filter((b) => ids.has(b.id)); }
    return lista.sort((a, b) => a.codigo - b.codigo);
  };

  // ------------------------------------------------------------- pendências (central do painel)
  VP.pendencias = () => {
    const cfg = VP.config();
    const hoje = VP.Plataforma.hoje();
    const bens = VP.db.lista('bens').filter((b) => b.status !== 'baixado');
    const p = [];
    const add = (chave, nivel, titulo, qtd, link, detalhe = '') => { if (qtd > 0) p.push({ chave, nivel, titulo, qtd, link, detalhe }); };

    // Cadastros básicos vazios: dados que a prefeitura precisa enviar (lista completa em dados-da-prefeitura.md)
    for (const [tabela, nome, nivel, filtro] of [
      ['entidades', 'Entidades e fundos (CNPJ da prefeitura e de cada fundo)', 'critico'],
      ['unidades', 'Unidades (centros de custo e locais)', 'critico'],
      ['classificacoes', 'Classificações com vida útil e valor residual', 'critico', (c) => !c.aClassificar],
      ['contas', 'Contas contábeis', 'atencao'],
      ['responsaveis', 'Responsáveis pelos bens', 'atencao']]) { // fornecedores: cadastrados sozinhos pela compra ou pela nota (14/10/2026)
      const l = VP.db.lista(tabela);
      if (!(filtro ? l.filter(filtro) : l).length) add('cadastro-' + tabela, nivel, `Cadastro vazio: ${nome} — dados a receber da prefeitura`, 1, '#cadastros/' + tabela, 'Peça à prefeitura (planilha ou relatório do sistema atual) e cadastre ou importe.');
    }
    const aClassificar = new Set(VP.db.lista('classificacoes').filter((c) => c.aClassificar).map((c) => c.id));
    if (aClassificar.size) add('a-classificar', 'atencao', 'Bens importados a classificar (depreciando como "Demais bens" até classificar)', bens.filter((b) => aClassificar.has(b.classificacaoId)).length, '#bens', 'Na lista de bens, filtre pela classificação "A classificar" e use a edição em lote.');
    const limiteSeguro = u.somaDias(hoje, cfg.avisoSeguroDias);
    const semCentro = bens.filter((b) => b.centroCustoPendente).length + VP.db.lista('bensControle').filter((x) => x.centroCustoPendente && x.situacao !== 'baixado').length;
    add('sem-centro-custo', 'critico', 'Bens sem centro de custo (código não cadastrado na importação)', semCentro, '#centros-pendentes', 'Ligue cada código a uma unidade (ou cadastre a unidade com esse código).');
    if (VP.termos) { const ag = VP.termos.lista().filter((t) => t.situacao === 'aguardando'); const venc = ag.filter(VP.termos.vencido); add('termos-vencidos', 'critico', 'Termos de responsabilidade vencidos (não voltaram assinados no prazo)', venc.length, '#termos?situacao=vencidos'); add('termos-aguardando', 'atencao', 'Termos de responsabilidade aguardando assinatura', ag.length - venc.length, '#termos'); }
    add('imprestaveis', 'critico', 'Bens imprestáveis aguardando baixa', bens.filter((b) => Number(b.estado) === 1).length, '#bens?estado=1', 'Bem em estado "Imprestável" não tem conserto: abra a ficha e use "Iniciar baixa".');
    add('inserviveis', 'info', 'Bens inservíveis disponíveis (para leilão, doação ou transferência)', bens.filter((b) => b.status === 'inservivel').length, '#bens?status=inservivel');
    add('lotes-baixa', 'info', 'Lotes de baixa em montagem (falta confirmar)', VP.db.lista('lotesBaixa').filter((l) => l.situacao === 'rascunho').length, '#baixa-lote');
    add('seguro-vencido', 'critico', 'Seguros vencidos', bens.filter((b) => b.seguro?.termino && b.seguro.termino < hoje).length, '#relatorio/seguros');
    add('seguro-vence', 'atencao', `Seguros vencendo em até ${cfg.avisoSeguroDias} dias`, bens.filter((b) => b.seguro?.termino && b.seguro.termino >= hoje && b.seguro.termino <= limiteSeguro).length, '#relatorio/seguros');
    const limiteGar = u.somaDias(hoje, cfg.avisoGarantiaDias);
    add('garantia-vence', 'atencao', `Garantias vencendo em até ${cfg.avisoGarantiaDias} dias`, bens.filter((b) => b.garantia?.termino && b.garantia.termino >= hoje && b.garantia.termino <= limiteGar).length, '#relatorio/seguros');

    const mesAtual = hoje.slice(0, 7);
    const ultimo = VP.ultimoFechamento();
    const proximo = ultimo ? u.somaMeses(ultimo.mes, 1) : u.somaMeses(mesAtual, -1);
    if (proximo < mesAtual) add('fechamento', 'atencao', `Mês de ${u.mesExtenso(proximo)} pronto para fechar (depreciação)`, 1, '#financeiro/fechamento');

    const limiteReav = `${Number(hoje.slice(0, 4)) - cfg.reavaliacaoAnos}${hoje.slice(4)}`;
    add('reavaliacao', 'atencao', `Bens sem reavaliação há mais de ${cfg.reavaliacaoAnos} anos`, bens.filter((b) => { const s = VP.saldo(b); return b.tipo !== 'intangivel' && s.marco && s.marco.data < limiteReav; }).length, '#financeiro/reavaliacao');
    add('depreciados', 'info', 'Bens totalmente depreciados ainda em uso (avaliar reavaliação)', bens.filter((b) => { const s = VP.saldo(b); return s.vidaUtilMeses && s.consumido >= 1; }).length, '#bens?depreciados=1');

    const itens = VP.db.lista('itensIncorporar').filter((i) => i.ativo && (i.quantidade - (i.incorporados || 0)) > 0 && (!cfg.incorporaSoLiquidados || i.liquidado));
    add('incorporar', 'atencao', 'Itens comprados aguardando incorporação', itens.length, '#entradas');
    add('transferencias', 'atencao', 'Transferências aguardando aceite', VP.db.lista('transferencias').filter((t) => t.situacao === 'pendente').length, '#transferencias');
    add('sem-responsavel', 'critico', 'Bens sem responsável', bens.filter((b) => !b.responsavelId).length, '#bens?semResponsavel=1');
    add('contabilizar', 'info', 'Movimentos financeiros a enviar para a contabilidade', VP.movimentosAContabilizar().length, '#financeiro/contabilidade');
    const inv = VP.db.lista('inventarios').find((i) => i.situacao === 'aberto');
    if (inv) {
      const pr = VP.progressoInventario(inv);
      add('inventario', 'info', `Inventário ${inv.nome} em andamento (${u.pct(pr.total ? pr.conferidos / pr.total : 0)} conferido)`, 1, '#inventario');
    }
    const ordem = { critico: 0, atencao: 1, info: 2 };
    // Frota: um item por tipo de alerta (o detalhe fica no painel da Frota)
    if (VP.imoveis) {
      const ai = VP.imoveis.alertas();
      add('imo-docs', 'atencao', 'Imóveis: documentos vencidos (habite-se, AVCB, alvarás, laudos)', ai.docsVencidos.length, '#imoveis/documentos');
      add('imo-cessoes', 'atencao', 'Imóveis: cessões ou comodatos vencidos', ai.cessoesVencidas.length, '#imoveis/cessoes');
      add('imo-pend', 'atencao', 'Imóveis: pendências de regularização atrasadas', ai.pendAtrasadas.length, '#imoveis/pendencias');
      add('imo-motivo', 'info', 'Imóveis não registrados sem o motivo informado (TCE/SC)', ai.semMotivo.length, '#imoveis');
    }
    if (VP.manutencao) {
      const am = VP.manutencao.alertas();
      add('cham-atrasados', 'atencao', 'Chamados de manutenção atrasados', am.atrasados.length, '#manutencao/chamados?abertos=1&atrasados=1');
      add('cham-urgentes', 'critico', 'Chamados urgentes em aberto', am.urgentes.length, '#manutencao/chamados');
      add('cham-revisao', 'info', 'Chamados aguardando revisão', am.revisao.length, '#manutencao/chamados?situacao=revisao');
    }
    if (VP.frota) { const af = VP.frota.alertas(); add('frota-critico', 'critico', 'Frota: alertas urgentes (CNH, manutenção, multas, documentos)', af.filter((a) => a.nivel === 'critico').length, '#frota'); add('frota-atencao', 'atencao', 'Frota: itens para conferir', af.filter((a) => a.nivel === 'atencao').length, '#frota'); }
    return p.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  };

  VP.ultimoFechamento = () => VP.db.lista('fechamentos').filter((f) => f.situacao === 'fechado').sort((a, b) => b.mes.localeCompare(a.mes))[0] || null;

  VP.movimentosAContabilizar = () => VP.db.lista('eventos')
    .filter((e) => !e.cancelado && !e.contabilizado && VP.LISTAS.eventos[e.tipo]?.grupo === 'financeiro' && e.tipo !== 'estorno');

  // ------------------------------------------------------------- inventário
  VP.progressoInventario = (inv) => {
    const ids = Object.keys(inv.esperados || {});
    const leituras = inv.leituras || {};
    let localizados = 0, transferidos = 0;
    for (const id of ids) {
      const l = leituras[id];
      if (!l) continue;
      if (l.unidadeId === inv.esperados[id]) localizados++; else transferidos++;
    }
    const total = ids.length;
    return { total, localizados, transferidos, conferidos: localizados + transferidos, naoLocalizados: total - localizados - transferidos, sobras: (inv.sobras || []).length };
  };

  // Contas contábeis sugeridas pela classificação (sobe na árvore até achar)
  VP.dadosDaClassificacao = (clId) => {
    let c = VP.db.pega('classificacoes', clId);
    const r = {};
    while (c) {
      for (const k of ['contaId', 'contaDepreciacaoId', 'vidaUtilMeses', 'residualPct', 'tipoBem']) if (r[k] == null && c[k] != null && c[k] !== '') r[k] = c[k];
      if (r.naoDeprecia == null && c.naoDeprecia != null) r.naoDeprecia = c.naoDeprecia;
      c = c.paiId ? VP.db.pega('classificacoes', c.paiId) : null;
    }
    return r;
  };

  VP.grupoDe = (clId) => {
    let c = VP.db.pega('classificacoes', clId);
    while (c && c.paiId) c = VP.db.pega('classificacoes', c.paiId);
    return c;
  };

  // ------------------------------------------------------------- fechamento do mês (depreciação)
  VP.calcularFechamento = (ym) => {
    const r = [];
    for (const b of VP.db.lista('bens')) {
      if (VP.saldo(b, u.fimDoMes(ym)).baixado) continue;
      if ((b.dataIncorporacao || b.dataAquisicao || '9999').slice(0, 7) > ym) continue;
      const v = VP.quotaMes(b, ym);
      if (v > 0) r.push({ bem: b, valor: v });
    }
    return r;
  };

  VP.aplicarFechamento = async (ym, itens = null) => {
    const lista = itens || VP.calcularFechamento(ym);
    const loteId = 'fech-' + ym + '-' + u.id();
    const data = u.fimDoMes(ym);
    const eventos = lista.map((x) => VP.novoEvento(x.bem.id, 'depreciacao', {
      data, valor: x.valor, loteId, descricao: `Depreciação de ${u.mesExtenso(ym)}`,
      extra: { contaDebito: x.bem.depreciacao?.contaDebito || '', contaCredito: x.bem.depreciacao?.contaCredito || '' }
    }));
    const total = r2(lista.reduce((t, x) => t + x.valor, 0));
    const fech = { id: loteId, mes: ym, loteId, situacao: 'fechado', qtd: eventos.length, total, fechadoEm: VP.Plataforma.agoraISO(), usuario: VP.sessao?.usuario || 'demonstração' };
    await VP.db.gravarVarias({ eventos, fechamentos: [fech] });
    return fech;
  };

  // Fecha, em ordem, todos os meses já terminados que ainda não foram fechados, até "ateYM" (inclusive)
  VP.mesesPendentes = (ateYM) => {
    const hojeYM = VP.Plataforma.hoje().slice(0, 7);
    const ult = VP.ultimoFechamento();
    const r = [];
    for (let m = ult ? u.somaMeses(ult.mes, 1) : u.somaMeses(hojeYM, -1); m < hojeYM && m <= ateYM; m = u.somaMeses(m, 1)) r.push(m);
    return r;
  };
  VP.fecharMesesPendentes = async (ateYM) => {
    const feitos = [];
    for (const m of VP.mesesPendentes(ateYM)) feitos.push(await VP.aplicarFechamento(m));
    return feitos;
  };

  VP.desfazerFechamento = async (fech) => {
    const evs = VP.db.lista('eventos').filter((e) => e.loteId === fech.loteId && !e.cancelado);
    for (const e of evs) { e.cancelado = true; e.canceladoEm = VP.Plataforma.agoraISO(); e.motivoCancelamento = 'Fechamento desfeito'; }
    fech.situacao = 'desfeito';
    fech.desfeitoEm = VP.Plataforma.agoraISO();
    await VP.db.gravarVarias({ eventos: evs, fechamentos: [fech] });
    return evs.length;
  };

  // Plaquetas em uso (bens ativos, baixados, na Lixeira e plaquetas anteriores): nenhuma é reaproveitada.
  // A plaqueta automática é a maior já usada + 1 (pula as que existirem). extras: plaquetas que ainda vão entrar (ex.: linhas da planilha).
  VP.contextoPlaquetas = (extras = []) => {
    const usadas = new Set();
    let max = 1000;
    const add = (p) => { if (p == null || p === '') return; const s = String(p).trim(); usadas.add(s); const n = Number(s); if (Number.isInteger(n) && n > max && n < 1e9) max = n; };
    for (const b of VP.db.lista('bens', true)) { add(b.plaqueta); add(b.plaquetaAnterior); for (const a of b.plaquetasAnteriores || []) add(a.plaqueta); }
    extras.forEach(add);
    return {
      usadas,
      emUso: (p) => usadas.has(String(p).trim()),
      proxima() { let n = max + 1; while (usadas.has(String(n))) n++; max = n; usadas.add(String(n)); return String(n); },
      reservar(p) { add(p); }
    };
  };
  // Plaquetas anteriores do bem (registro com data e motivo; inclui o campo antigo "plaqueta anterior")
  VP.plaquetasAnteriores = (b) => {
    const l = (b.plaquetasAnteriores || []).slice();
    if (b.plaquetaAnterior && !l.some((a) => String(a.plaqueta) === String(b.plaquetaAnterior))) l.unshift({ plaqueta: b.plaquetaAnterior, data: '', motivo: 'Registrada antes (campo "Plaqueta anterior")' });
    return l;
  };
  // Registra uma plaqueta no histórico de plaquetas do bem (nunca apaga)
  VP.registrarPlaquetaAnterior = (b, dados) => {
    b.plaquetasAnteriores = VP.plaquetasAnteriores(b).concat([Object.assign({ data: VP.Plataforma.hoje(), usuario: VP.sessao?.usuario || 'demonstração', registradoEm: VP.Plataforma.agoraISO() }, dados)]);
    b.plaquetaAnterior = String(dados.plaqueta); // o campo antigo mostra a mais recente
    b._busca = null;
  };
  // Quem usa esta plaqueta (agora ou como plaqueta anterior)
  VP.donoDaPlaqueta = (p) => { const s = String(p).trim(); return VP.db.lista('bens', true).find((b) => String(b.plaqueta) === s || String(b.plaquetaAnterior || '') === s || (b.plaquetasAnteriores || []).some((a) => String(a.plaqueta) === s)) || null; };
  VP.proximoCodigo = () => VP.db.lista('bens', true).reduce((m, b) => Math.max(m, b.codigo || 0), 0) + 1;
})();
