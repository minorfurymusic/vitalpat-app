/* VitalPat Patrimônio · Gestão — Painel, Entradas, Transferências, Inventário, Financeiro e Histórico. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS, A = VP.acoes;
  const T = VP.telas;
  const opc = (...a) => VP.opc(...a);

  // Escolher bens digitando códigos/plaquetas (ex.: 1,2,6-10) — usado por várias telas
  VP.escolherBens = (titulo, aoEscolher, { incluirBaixados = false } = {}) => ui.formulario({
    titulo, largura: 'media', textoSalvar: 'Continuar',
    intro: '<p class="ajuda">Digite códigos ou faixas (ex.: <b>1, 2, 6-10</b>) ou plaquetas separadas por vírgula. Para escolher pela lista, use a tela Bens e marque os itens.</p>',
    campos: [{ chave: 'codigos', rotulo: 'Códigos ou plaquetas', obrigatorio: true }],
    salvar: (v) => {
      const faixa = u.faixas(v.codigos);
      const plaquetas = new Set(String(v.codigos).split(/[;,\s]+/).filter(Boolean));
      const bens = VP.db.lista('bens').filter((b) => (incluirBaixados || b.status !== 'baixado') && ((faixa && faixa(b.codigo)) || plaquetas.has(b.plaqueta)));
      if (!bens.length) return 'Nenhum bem encontrado com esses códigos.';
      setTimeout(() => aoEscolher(bens), 0);
      return null;
    }
  });

  // ======================================================== PAINEL
  T.painel = () => {
    const bens = VP.db.lista('bens').filter((b) => b.status !== 'baixado');
    const total = bens.reduce((t, b) => t + VP.saldo(b).liquido, 0);
    const pend = VP.pendencias();
    const ult = VP.ultimoFechamento();
    const porUnidade = [...u.agruparSoma(bens, 'unidadeId', (b) => VP.saldo(b).liquido)].map(([id, v]) => ({ rotulo: VP.db.pega('unidades', id)?.nome || 'Sem unidade', valor: v, link: '#unidade/' + id })).sort((a, b) => b.valor - a.valor);
    const porEstado = Object.entries(L.estados).reverse().map(([k, n]) => ({ rotulo: n, valor: bens.filter((b) => String(b.estado) === k).length, link: '#bens' }));
    const hoje = VP.Plataforma.hoje().slice(0, 7);
    const meses = Array.from({ length: 12 }, (_, i) => u.somaMeses(hoje, i - 11));
    const inc = VP.db.lista('eventos').filter((e) => e.tipo === 'incorporacao' && !e.cancelado);
    const porMes = meses.map((m) => ({ rotulo: u.mesNome(m), valor: inc.filter((e) => e.data.slice(0, 7) === m).reduce((t, e) => t + (e.valor || 0), 0) }));
    const icone = { critico: '⛔', atencao: '⚠️', info: 'ℹ️' };
    const nivelTxt = { critico: 'Urgente', atencao: 'Atenção', info: 'Para saber' };
    return {
      titulo: 'Painel',
      acoes: '<a class="botao primario" href="#novo-bem">+ Novo bem</a>',
      html: `
        <div class="resumo-linha grande">
          ${G.numero('Bens em uso', u.inteiro(bens.length), `${u.inteiro(bens.filter((b) => b.status === 'desuso').length)} em desuso`, '#bens')}
          ${G.numero('Valor contábil total', u.moedaCurta(total), u.moeda(total), '#relatorio/resumo')}
          ${G.numero('Depreciação do último mês fechado', ult ? u.moedaCurta(ult.total) : '—', ult ? u.mesExtenso(ult.mes) : 'nenhum mês fechado', '#financeiro/fechamento')}
          ${G.numero('Pendências', u.inteiro(pend.length), pend.length ? 'veja a lista abaixo' : 'tudo em dia')}
        </div>
        <div class="grade-painel">
          <section class="cartao"><h3>Central de pendências</h3>
            ${pend.length ? `<ul class="pendencias">${pend.map((p) => `<li class="p-${p.nivel}"><a href="${esc(p.link)}"><span class="p-icone" aria-hidden="true">${icone[p.nivel]}</span><span class="p-nivel">${nivelTxt[p.nivel]}</span><span class="p-texto">${esc(p.titulo)}</span><b class="p-qtd">${p.qtd > 1 || !(p.chave === 'fechamento' || p.chave.startsWith('cadastro-')) ? u.inteiro(p.qtd) : ''}</b></a></li>`).join('')}</ul>` : '<p class="tudo-certo">✓ Nenhuma pendência.</p>'}
          </section>
          <section class="cartao"><h3>Valor contábil por unidade</h3>${G.barrasH(porUnidade, { formato: u.moedaCurta, titulo: 'Valor por unidade' })}</section>
          <section class="cartao"><h3>Bens por estado de conservação</h3>${G.barrasH(porEstado, { titulo: 'Bens por estado', mostrarZeros: true })}</section>
          <section class="cartao"><h3>Incorporações nos últimos 12 meses (R$)</h3>${G.colunas(porMes, { formato: u.moeda, formatoEixo: u.moedaCurta, titulo: 'Incorporações por mês' })}</section>
        </div>`
    };
  };

  // ======================================================== ENTRADAS (itens a incorporar)
  T.entradas = () => {
    const cfg = VP.config();
    const v = VP.estado.filtrosEntradas = VP.estado.filtrosEntradas || { ativo: 'sim' };
    const desenhar = () => {
      const f = ui.limparValores(v);
      let itens = VP.db.lista('itensIncorporar');
      if (f.ativo === 'sim') itens = itens.filter((i) => i.ativo); else if (f.ativo === 'nao') itens = itens.filter((i) => !i.ativo);
      if (f.entidadeId) itens = itens.filter((i) => i.entidadeId === f.entidadeId);
      if (f.saldo) itens = itens.filter((i) => i.quantidade - (i.incorporados || 0) > 0);
      if (f.busca) { const t = u.normalizar(f.busca); itens = itens.filter((i) => u.normalizar(`${i.descricao} ${VP.nome('fornecedores', i.fornecedorId)} ${i.empenho?.numero} ${i.ordemCompra?.numero}`).includes(t)); }
      const colunas = [
        { chave: 'oc', titulo: 'Ordem de compra', valor: (i) => `${i.ordemCompra?.numero}/${i.ordemCompra?.ano}` },
        { chave: 'empenho', titulo: 'Empenho', valor: (i) => `${i.empenho?.numero}/${i.empenho?.ano}${i.empenho?.sub ? '-' + i.empenho.sub : ''}` },
        { chave: 'emissao', titulo: 'Emissão', valor: (i) => u.data(i.empenho?.emissao), oculta: true },
        { chave: 'fornecedor', titulo: 'Fornecedor', valor: (i) => VP.nome('fornecedores', i.fornecedorId) },
        { chave: 'descricao', titulo: 'Item' },
        { chave: 'qtd', titulo: 'Quantidade', num: true, valor: (i) => i.quantidade },
        { chave: 'saldo', titulo: 'Falta incorporar', num: true, html: (i) => { const s = i.quantidade - (i.incorporados || 0); return `${G.medidor((i.incorporados || 0) / i.quantidade, `${i.incorporados || 0} de ${i.quantidade}`)}${s ? '' : ' ✓'}`; }, valor: (i) => i.quantidade - (i.incorporados || 0) },
        { chave: 'vu', titulo: 'Valor unitário', num: true, valor: (i) => i.valorUnitario, formato: u.moeda },
        { chave: 'total', titulo: 'Total', num: true, soma: true, valor: (i) => i.valorUnitario * i.quantidade, formato: u.moeda },
        { chave: 'liq', titulo: 'Liquidado', valor: (i) => (i.liquidado ? 'Sim' : 'Não') },
        { chave: 'entidade', titulo: 'Entidade', valor: (i) => VP.nome('entidades', i.entidadeId), oculta: true },
        { chave: 'acoes', titulo: '', html: (i) => `${i.ativo && i.quantidade - (i.incorporados || 0) > 0 ? `<button class="botao pequeno primario" data-incorporar="${esc(i.id)}">Incorporar</button>` : ''} <button class="botao pequeno" data-ativar="${esc(i.id)}">${i.ativo ? 'Desativar' : 'Ativar'}</button>` }
      ];
      return `
        <p class="ajuda">Itens comprados que ainda não viraram bens. <b>Incorporar</b> cria todos os bens de uma vez, já com empenho, fornecedor e valor.${cfg.incorporaSoLiquidados ? ' A configuração só deixa incorporar itens com empenho liquidado.' : ''}</p>
        ${ui.filtros({ id: 'entradas', valores: v, placeholder: 'Buscar item, fornecedor, empenho…', defs: [
          { chave: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [['sim', 'Ativos'], ['nao', 'Desativados']] },
          { chave: 'entidadeId', rotulo: 'Entidade', tipo: 'select', opcoes: opc('entidades') },
          { chave: 'saldo', rotulo: 'Só com saldo a incorporar', tipo: 'bool' }], aoMudar: () => atualizar() })}
        ${ui.tabela({ id: 'entradas', colunas, linhas: itens, nomePlanilha: 'itens-a-incorporar', vazio: 'Nenhum item.' })}`;
    };
    const atualizar = () => { document.getElementById('area-entradas').innerHTML = desenhar(); ligar(); };
    const ligar = () => {
      ui.ligarTabela('entradas');
      const area = document.getElementById('area-entradas');
      area.querySelectorAll('[data-ativar]').forEach((b) => b.addEventListener('click', async () => {
        const i = VP.db.pega('itensIncorporar', b.dataset.ativar); i.ativo = !i.ativo; await VP.db.gravar('itensIncorporar', i); atualizar();
      }));
      area.querySelectorAll('[data-incorporar]').forEach((b) => b.addEventListener('click', () => incorporar(VP.db.pega('itensIncorporar', b.dataset.incorporar), atualizar)));
    };
    return {
      titulo: 'Entradas: itens a incorporar',
      acoes: '<button class="botao" data-novo-item>+ Registrar compra</button> <button class="botao" data-importar-itens>Importar planilha</button> <a class="botao" href="#novo-bem">Bem avulso</a>',
      html: `<div id="area-entradas">${desenhar()}</div>`,
      ligar() {
        ligar();
        document.querySelector('[data-novo-item]').addEventListener('click', () => novoItem(atualizar));
        document.querySelector('[data-importar-itens]').addEventListener('click', () => importarItens(atualizar));
      }
    };
  };
  const incorporar = (item, depois) => {
    const cfg = VP.config();
    if (cfg.incorporaSoLiquidados && !item.liquidado) return ui.resultado({ titulo: 'Incorporar', falhas: [{ item: item.descricao, motivo: 'Empenho ainda não liquidado (veja Configurações)' }] });
    const p = VP.db.pega('produtos', item.produtoId);
    const saldo = item.quantidade - (item.incorporados || 0);
    ui.formulario({
      titulo: `Incorporar: ${item.descricao}`, largura: 'media', textoSalvar: 'Incorporar',
      intro: `<p>Empenho <b>${esc(item.empenho.numero)}/${esc(item.empenho.ano)}</b> · ${esc(VP.nome('fornecedores', item.fornecedorId))} · ${u.moeda(item.valorUnitario)} cada · faltam <b>${saldo}</b>.</p>`,
      campos: [
        { chave: 'quantidade', rotulo: 'Quantos bens criar agora', tipo: 'numero', padrao: saldo, obrigatorio: true, largura: 'meia' },
        { chave: 'dataIncorporacao', rotulo: 'Data de incorporação', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true, largura: 'meia' },
        { chave: 'classificacaoId', rotulo: 'Classificação', tipo: 'select', opcoes: VP.opcClassificacoes(), padrao: p?.classificacaoId, obrigatorio: true },
        { chave: 'unidadeId', rotulo: 'Unidade que recebe', tipo: 'select', opcoes: opc('unidades'), obrigatorio: cfg.obrigaUnidade, largura: 'meia' },
        { chave: 'responsavelId', rotulo: 'Responsável (vazio = o da unidade)', tipo: 'select', opcoes: opc('responsaveis'), largura: 'meia' },
        { chave: 'nf.numero', rotulo: 'Nota fiscal', largura: 'meia' }, { chave: 'nf.emissao', rotulo: 'Emissão da nota', tipo: 'data', largura: 'meia' }],
      salvar: async (v) => {
        const q = Math.floor(v.quantidade || 0);
        if (q < 1 || q > saldo) return `Informe de 1 a ${saldo}.`;
        const dc = VP.dadosDaClassificacao(v.classificacaoId);
        if (cfg.obrigaContas && !dc.contaId) return 'A classificação escolhida não tem conta contábil.';
        const bens = await VP.criarBens({ descricao: item.descricao, complemento: item.descricao, produtoId: item.produtoId, classificacaoId: v.classificacaoId, unidadeId: v.unidadeId, responsavelId: v.responsavelId, dataAquisicao: item.empenho.emissao, dataIncorporacao: v.dataIncorporacao, valor: item.valorUnitario, quantidade: q, fornecedorId: item.fornecedorId, entidadeId: item.entidadeId, situacaoAquisicao: 'Compra', nf: v.nf, origem: { empenho: `${item.empenho.ano}/${item.empenho.numero}`, item: item.descricao, quantidade: item.quantidade, valorUnitario: item.valorUnitario, ordemCompra: `${item.ordemCompra.numero}/${item.ordemCompra.ano}` }, origemTexto: `empenho ${item.empenho.numero}/${item.empenho.ano}` });
        item.incorporados = (item.incorporados || 0) + q;
        if (VP.termos) await VP.termos.abrir(bens, 'incorporação');
        await VP.db.gravar('itensIncorporar', item);
        ui.resultado({ titulo: 'Bens incorporados', sucesso: bens.map((b) => `${b.codigo} · plaqueta ${b.plaqueta} · ${b.descricao}`), extra: `<p><a class="botao" href="#relatorio/etiquetas" onclick="VP.estado.etiquetasIds=${esc(JSON.stringify(bens.map((b) => b.id)))}">Imprimir etiquetas destes bens</a></p>` });
        depois();
      }
    });
  };
  const camposItem = () => [
    { chave: 'entidadeId', rotulo: 'Entidade', tipo: 'select', opcoes: opc('entidades'), obrigatorio: true },
    { chave: 'produtoId', rotulo: 'Produto', tipo: 'select', opcoes: opc('produtos'), obrigatorio: true },
    { chave: 'fornecedorNome', rotulo: 'Fornecedor', obrigatorio: true, largura: 'meia', sugestoes: VP.db.lista('fornecedores').map((f) => f.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')), placeholder: 'Digite para procurar', ajuda: 'Se não existir, é cadastrado com esta compra.' },
    { chave: 'fornecedorDoc', rotulo: 'CNPJ do fornecedor (se for novo)', largura: 'meia' },
    { chave: 'oc', rotulo: 'Ordem de compra (número/ano)', largura: 'meia' }, { chave: 'empenho', rotulo: 'Empenho (número/ano)', largura: 'meia', ajuda: 'Pode ficar vazio na ordem de compra; informe depois.' },
    { chave: 'emissao', rotulo: 'Emissão do empenho', tipo: 'data', largura: 'meia' }, { chave: 'liquidado', rotulo: 'Empenho liquidado', tipo: 'bool', largura: 'meia' },
    { chave: 'quantidade', rotulo: 'Quantidade', tipo: 'numero', obrigatorio: true, largura: 'meia' }, { chave: 'valorUnitario', rotulo: 'Valor unitário', tipo: 'moeda', obrigatorio: true, largura: 'meia' }];
  const montarItem = (v) => {
    const [on, oa] = String(v.oc || '').split('/');
    const [en, ea] = String(v.empenho || '').split('/');
    const p = VP.db.pega('produtos', v.produtoId);
    return { entidadeId: v.entidadeId, produtoId: v.produtoId, descricao: p?.nome || v.descricao || '', fornecedorId: v.fornecedorId, ordemCompra: { numero: on || '', ano: oa || '' }, empenho: { numero: en || '', ano: ea || String(v.emissao || '').slice(0, 4), sub: 1, emissao: v.emissao }, quantidade: Math.floor(v.quantidade), valorUnitario: v.valorUnitario, incorporados: 0, ativo: true, liquidado: !!v.liquidado, unidadeMedida: 'UN' };
  };
  // Fornecedor da compra: acha pelo CNPJ ou nome; se não existir, cadastra (regra do usuário, 14/10/2026)
  const fornecedorDaCompra = async (nome, doc, novos) => {
    const d = String(doc || '').replace(/\D/g, ''), n = u.normalizar(nome).trim();
    const todos = VP.db.lista('fornecedores').concat(novos || []);
    let f = (d.length >= 11 && todos.find((x) => String(x.documento || '').replace(/\D/g, '') === d)) || todos.find((x) => u.normalizar(x.nome).trim() === n);
    if (f) return { f, novo: false };
    f = { id: u.id(), nome: String(nome).trim(), documento: String(doc || '').trim(), contato: '', criadoPelaCompra: true };
    if (novos) novos.push(f); else await VP.db.gravar('fornecedores', f);
    return { f, novo: true };
  };
  // Entidade da compra: pelo nome ou CNPJ; vazio = a única cadastrada
  const entidadeDaCompra = (txt) => {
    const ents = VP.db.lista('entidades');
    const t = String(txt || '').trim();
    if (!t) return ents.length === 1 ? { id: ents[0].id } : { erro: ents.length ? 'Informe a entidade (há mais de uma cadastrada)' : 'Nenhuma entidade cadastrada (Cadastros → Entidades)' };
    const d = t.replace(/\D/g, '');
    const e = (d.length >= 11 && ents.find((x) => String(x.documento || '').replace(/\D/g, '') === d)) || ents.find((x) => u.normalizar(x.nome) === u.normalizar(t));
    return e ? { id: e.id } : { erro: `Entidade não encontrada: ${t}` };
  };
  const novoItem = (depois) => ui.formulario({
    titulo: 'Registrar compra (item a incorporar)', largura: 'media', campos: camposItem(),
    salvar: async (v) => {
      const { f, novo } = await fornecedorDaCompra(v.fornecedorNome, v.fornecedorDoc);
      await VP.db.gravar('itensIncorporar', montarItem(Object.assign(v, { fornecedorId: f.id })));
      ui.aviso(novo ? `Item registrado. Fornecedor novo cadastrado: ${f.nome}.` : 'Item registrado.'); depois();
    }
  });
  const importarItens = (depois) => ui.modal({
    titulo: 'Importar itens comprados (planilha)', largura: 'media',
    corpo: `<p class="ajuda">Planilha CSV com as colunas: <b>entidade;ordem_compra;empenho;emissao;fornecedor;cnpj_fornecedor;produto;quantidade;valor_unitario;liquidado</b>. Produto pelo nome, como está nos Cadastros. Fornecedor que não existe é cadastrado. Entidade vazia = a única cadastrada. Para importar tudo de uma vez (cadastros e compras), use <a href="#planilhas/importar">Exportar e importar</a>. <button type="button" class="botao pequeno" data-modelo>Baixar modelo</button></p>
      <input type="file" accept=".csv,text/csv" data-arquivo>
      <div data-previa></div>`,
    botoes: [{ texto: 'Cancelar' }, { texto: 'Importar', classe: 'primario', acao: async (d) => {
      const linhas = d._linhas || [];
      const ok = linhas.filter((l) => !l.erro);
      // fornecedores que não existem: cadastrados agora (um por nome/CNPJ)
      const novos = [];
      for (const l of ok) l.item.fornecedorId = (await fornecedorDaCompra(l.fornecedor, l.cnpj, novos)).f.id;
      if (novos.length) await VP.db.gravar('fornecedores', novos);
      await VP.db.gravar('itensIncorporar', ok.map((l) => l.item));
      ui.resultado({ titulo: 'Importação de itens', sucesso: ok.map((l) => `${l.item.descricao} × ${l.item.quantidade}`).concat(novos.map((f) => `Fornecedor novo cadastrado: ${f.nome}`)), falhas: linhas.filter((l) => l.erro).map((l) => ({ item: `Linha ${l.n}`, motivo: l.erro })) });
      depois();
    } }]
  }).el.addEventListener('change', async (e) => {
    const d = e.currentTarget;
    if (!e.target.matches('[data-arquivo]')) return;
    const texto = (await e.target.files[0].text()).replace(/^﻿/, '');
    const [cab, ...rs] = texto.split(/\r?\n/).filter((l) => l.trim());
    const cols = cab.split(';').map((c) => u.normalizar(c));
    const idx = (n) => cols.indexOf(n);
    d._linhas = rs.map((r, k) => {
      const c = r.split(';');
      const col = (n) => (idx(n) >= 0 ? String(c[idx(n)] ?? '').trim() : '');
      const prod = VP.db.lista('produtos').find((p) => u.normalizar(p.nome) === u.normalizar(c[idx('produto')]));
      const emissao = col('emissao').split('/').reverse().join('-');
      const ent = entidadeDaCompra(col('entidade'));
      if (ent.erro) return { n: k + 2, erro: ent.erro };
      if (!col('fornecedor')) return { n: k + 2, erro: 'Fornecedor vazio' };
      if (!prod) return { n: k + 2, erro: `Produto não encontrado: ${c[idx('produto')]}` };
      if (!u.num(c[idx('quantidade')]) || !u.num(c[idx('valor_unitario')])) return { n: k + 2, erro: 'Quantidade ou valor inválido' };
      return { n: k + 2, fornecedor: col('fornecedor'), cnpj: col('cnpj_fornecedor'), item: montarItem({ entidadeId: ent.id, produtoId: prod.id, fornecedorId: '', oc: col('ordem_compra'), empenho: col('empenho'), emissao, quantidade: u.num(c[idx('quantidade')]), valorUnitario: u.num(c[idx('valor_unitario')]), liquidado: /^s/i.test(c[idx('liquidado')] || '') }) };
    });
    d.querySelector('[data-previa]').innerHTML = `<p><b>Prévia:</b> ${d._linhas.filter((l) => !l.erro).length} linha(s) certa(s), ${d._linhas.filter((l) => l.erro).length} com erro.</p>`;
  });
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-modelo]')) ui.baixarCSV('modelo-itens', ['entidade', 'ordem_compra', 'empenho', 'emissao', 'fornecedor', 'cnpj_fornecedor', 'produto', 'quantidade', 'valor_unitario', 'liquidado'], [['', '2231/2026', '850/2026', '01/10/2026', 'Comercial Exemplo Ltda', '00.000.000/0001-91', 'Cadeira giratória', 4, 489.9, 'sim']]);
  });

  // ======================================================== TRANSFERÊNCIAS
  T.transferencias = () => {
    const v = VP.estado.filtrosTransf = VP.estado.filtrosTransf || { situacao: 'pendente' };
    const desenhar = () => {
      const f = ui.limparValores(v);
      let lista = VP.db.lista('transferencias').sort((a, b) => b.data.localeCompare(a.data));
      if (f.situacao) lista = lista.filter((t) => t.situacao === f.situacao);
      if (f.tipo) lista = lista.filter((t) => t.tipo === f.tipo);
      const colunas = [
        { chave: 'data', titulo: 'Data', valor: (t) => u.data(t.data), ordenar: (t) => t.data },
        { chave: 'tipo', titulo: 'Tipo', valor: (t) => L.tiposTransferencia[t.tipo] },
        { chave: 'bens', titulo: 'Bens', html: (t) => `${t.bens.length} · <small>${t.bens.slice(0, 3).map((id) => esc(VP.db.pega('bens', id)?.descricao || '')).join(', ')}${t.bens.length > 3 ? '…' : ''}</small>`, valor: (t) => t.bens.length },
        { chave: 'de', titulo: 'De', valor: (t) => VP.nome('unidades', t.origemUnidadeId) },
        { chave: 'para', titulo: 'Para', valor: (t) => (t.tipo === 'interna' ? VP.nome('unidades', t.destinoUnidadeId) : t.tipo === 'externa' ? t.destinoExterno : VP.nome('entidades', t.entidadeDestinoId)) },
        { chave: 'situacao', titulo: 'Situação', html: (t) => `<span class="selo-status t-${esc(t.situacao)}">${esc({ pendente: 'Aguardando aceite', aceita: 'Feita', recusada: 'Recusada', devolvida: 'Devolvida' }[t.situacao] || t.situacao)}</span>`, valor: (t) => t.situacao },
        { chave: 'acoes', titulo: '', html: (t) => `${t.situacao === 'pendente' ? `<button class="botao pequeno primario" data-aceitar="${t.id}">Aceitar</button> <button class="botao pequeno" data-recusar="${t.id}">Recusar</button>` : ''} ${t.tipo === 'externa' && t.situacao === 'aceita' ? `<button class="botao pequeno" data-devolver="${t.id}">Registrar volta</button>` : ''} <button class="botao pequeno" data-termo="${t.id}">Termo</button>` }];
      return `${ui.filtros({ id: 'transf', valores: v, busca: false, defs: [
        { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: [['pendente', 'Aguardando aceite'], ['aceita', 'Feitas'], ['recusada', 'Recusadas'], ['devolvida', 'Devolvidas']] },
        { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposTransferencia) }], aoMudar: () => atualizar() })}
        ${ui.tabela({ id: 'transferencias', colunas, linhas: lista, nomePlanilha: 'transferencias', vazio: 'Nenhuma transferência.' })}`;
    };
    const atualizar = () => { document.getElementById('area-transf').innerHTML = desenhar(); ligar(); };
    const ligar = () => {
      ui.ligarTabela('transferencias');
      const area = document.getElementById('area-transf');
      const pega = (el, k) => VP.db.pega('transferencias', el.dataset[k]);
      area.querySelectorAll('[data-aceitar]').forEach((el) => el.addEventListener('click', async () => { await A.efetivarTransferencia(pega(el, 'aceitar')); ui.aviso('Transferência aceita: bens no novo local.'); atualizar(); }));
      area.querySelectorAll('[data-recusar]').forEach((el) => el.addEventListener('click', () => ui.formulario({
        titulo: 'Recusar transferência', largura: 'pequena', campos: [{ chave: 'motivo', rotulo: 'Motivo da recusa', tipo: 'area', obrigatorio: true }],
        salvar: async (x) => { const t = pega(el, 'recusar'); t.situacao = 'recusada'; t.motivoRecusa = x.motivo; t.dataResposta = VP.Plataforma.hoje(); await VP.db.gravar('transferencias', t); atualizar(); }
      })));
      area.querySelectorAll('[data-devolver]').forEach((el) => el.addEventListener('click', async () => {
        const t = pega(el, 'devolver');
        const bens = t.bens.map((id) => VP.db.pega('bens', id)).filter((b) => b && b.status === 'cedido');
        for (const b of bens) b.status = 'ativo';
        t.situacao = 'devolvida'; t.dataVolta = VP.Plataforma.hoje();
        await VP.db.gravarVarias({ bens, transferencias: [t], eventos: bens.map((b) => VP.novoEvento(b.id, 'retorno', { descricao: `Voltou de ${t.destinoExterno}` })) });
        ui.aviso('Volta registrada.'); atualizar();
      }));
      area.querySelectorAll('[data-termo]').forEach((el) => el.addEventListener('click', () => VP.documentos.termoTransferencia(pega(el, 'termo'))));
    };
    return {
      titulo: 'Transferências',
      acoes: '<button class="botao primario" data-nova-transf>+ Nova transferência</button>',
      html: `<p class="ajuda">Interna, externa (empréstimo, cessão, conserto fora) e entre entidades, numa tela só. Também dá para transferir marcando bens na lista de Bens.</p><div id="area-transf">${desenhar()}</div>`,
      ligar() { ligar(); document.querySelector('[data-nova-transf]').addEventListener('click', () => VP.escolherBens('Nova transferência: quais bens?', (bens) => A.transferir(bens, atualizar))); }
    };
  };

  // ======================================================== INVENTÁRIO (A2.3)
  T.inventario = () => {
    const aberto = VP.db.lista('inventarios').find((i) => i.situacao === 'aberto');
    const antigos = VP.db.lista('inventarios').filter((i) => i.situacao !== 'aberto').sort((a, b) => b.dataCorte.localeCompare(a.dataCorte));
    if (!aberto) {
      return {
        titulo: 'Inventário',
        acoes: '<button class="botao primario" data-abrir>Abrir inventário</button>',
        html: `<div class="cartao"><p>Nenhum inventário aberto. Ao abrir, o sistema tira uma "foto" de onde cada bem deveria estar (data de corte). Cada bem é conferido <b>uma vez</b>, mesmo que mude de lugar durante o inventário.</p></div>
          <h3>Inventários anteriores</h3>
          ${antigos.length ? `<ul class="lista-simples">${antigos.map((i) => { const p = VP.progressoInventario(i); return `<li><b>${esc(i.nome)}</b> · corte ${u.data(i.dataCorte)} · encerrado em ${u.data(i.encerradoEm)} · ${p.localizados} localizados, ${p.transferidos} em outro local, ${p.naoLocalizados} não localizados, ${p.sobras} sobras · <a href="#relatorio/inventario?id=${esc(i.id)}">Relatório</a></li>`; }).join('')}</ul>` : '<p class="vazio">Nenhum.</p>'}`,
        ligar() {
          document.querySelector('[data-abrir]').addEventListener('click', () => ui.formulario({
            titulo: 'Abrir inventário', largura: 'media', textoSalvar: 'Abrir',
            campos: [{ chave: 'nome', rotulo: 'Nome', padrao: `Inventário anual ${VP.Plataforma.hoje().slice(0, 4)}`, obrigatorio: true }, { chave: 'dataCorte', rotulo: 'Data de corte', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true }, { chave: 'comissaoId', rotulo: 'Comissão (designada por ato)', tipo: 'select', opcoes: opc('comissoes') }, { chave: 'congelar', rotulo: 'Durante o inventário, transferências precisam de dupla aprovação', tipo: 'bool' }],
            salvar: async (v) => {
              const esperados = Object.fromEntries(VP.db.lista('bens').filter((b) => b.status !== 'baixado').map((b) => [b.id, b.unidadeId]));
              await VP.db.gravar('inventarios', { nome: v.nome, dataCorte: v.dataCorte, comissaoId: v.comissaoId, congelar: v.congelar, situacao: 'aberto', esperados, leituras: {}, sobras: [], abertoEm: VP.Plataforma.agoraISO() });
              ui.aviso('Inventário aberto.'); VP.app.render();
            }
          }));
        }
      };
    }
    const p = VP.progressoInventario(aberto);
    const porUnidade = VP.db.lista('unidades').map((un) => {
      const ids = Object.entries(aberto.esperados).filter(([, x]) => x === un.id).map(([id]) => id);
      const conf = ids.filter((id) => aberto.leituras[id]).length;
      const chegaram = Object.entries(aberto.leituras).filter(([id, l]) => l.unidadeId === un.id && aberto.esperados[id] !== un.id).length;
      return { un, total: ids.length, conf, chegaram };
    }).filter((x) => x.total || x.chegaram);
    return {
      titulo: 'Inventário: ' + aberto.nome,
      acoes: '<button class="botao" data-importar-app>Importar do aplicativo de campo</button> <button class="botao" data-procura>Lista "procura-se"</button> <button class="botao" data-cruzar>Cruzar sobras × não localizados</button> <button class="botao primario" data-encerrar>Encerrar</button>',
      html: `
        <div class="resumo-linha">
          ${G.numero('Conferido', u.pct(p.total ? p.conferidos / p.total : 0), `${u.inteiro(p.conferidos)} de ${u.inteiro(p.total)} bens`)}
          ${G.numero('Localizados no lugar', u.inteiro(p.localizados))}
          ${G.numero('Achados em outro local', u.inteiro(p.transferidos))}
          ${G.numero('Ainda não localizados', u.inteiro(p.naoLocalizados))}
          ${G.numero('Sobras (sem cadastro)', u.inteiro(p.sobras))}
        </div>
        <section class="cartao"><h3>Progresso por unidade</h3>${G.empilhadas(porUnidade.map((x) => ({ rotulo: x.un.nome, a: x.conf, b: x.total - x.conf })), ['Conferidos', 'Faltam'])}</section>
        <section class="cartao"><h3>Conferir por unidade</h3>
          <ul class="lista-unidades">${porUnidade.map((x) => `<li><span><b>${esc(x.un.nome)}</b><small>${x.conf} de ${x.total} conferidos${x.chegaram ? ` · ${x.chegaram} chegaram de outro local` : ''}</small></span>${G.medidor(x.total ? x.conf / x.total : 1, '')}<button class="botao pequeno" data-conferir="${esc(x.un.id)}">Conferir</button></li>`).join('')}</ul>
        </section>`,
      ligar() {
        document.querySelectorAll('[data-conferir]').forEach((el) => el.addEventListener('click', () => conferirUnidade(aberto, el.dataset.conferir)));
        document.querySelector('[data-importar-app]').addEventListener('click', () => importarDoApp(aberto));
        document.querySelector('[data-procura]').addEventListener('click', () => VP.documentos.procuraSe(aberto));
        document.querySelector('[data-cruzar]').addEventListener('click', () => cruzar(aberto));
        document.querySelector('[data-encerrar]').addEventListener('click', () => encerrarInventario(aberto));
      }
    };
  };
  const registrarLeitura = (inv, bem, unidadeId, estado, origem = 'manual') => {
    inv.leituras[bem.id] = { unidadeId, data: VP.Plataforma.hoje(), estado: estado ? Number(estado) : Number(bem.estado), origem };
  };
  const conferirUnidade = (inv, unidadeId) => {
    const un = VP.db.pega('unidades', unidadeId);
    const desenhar = () => {
      const ids = Object.entries(inv.esperados).filter(([, x]) => x === unidadeId).map(([id]) => id);
      const linhas = ids.map((id) => VP.db.pega('bens', id)).filter(Boolean);
      return `<div class="leitor-linha"><label>Ler ou digitar plaqueta <input data-leitura placeholder="Plaqueta e Enter" autocomplete="off"></label></div>
        <p class="ajuda">Marque o que foi achado. Se o bem estiver em mau estado, mude o estado.</p>
        <table class="tabela"><thead><tr><th>Achado</th><th>Plaqueta</th><th>Bem</th><th>Estado</th><th>Situação</th></tr></thead><tbody>
        ${linhas.map((b) => { const l = inv.leituras[b.id]; return `<tr><td><input type="checkbox" data-achei="${esc(b.id)}" ${l ? 'checked' : ''} ${l && l.unidadeId !== unidadeId ? 'disabled' : ''}></td><td>${esc(b.plaqueta)}</td><td>${esc(b.descricao)}</td><td><select data-estado="${esc(b.id)}">${Object.entries(L.estados).reverse().map(([k, n]) => `<option value="${k}" ${String(l?.estado ?? b.estado) === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td><td>${l ? (l.unidadeId === unidadeId ? '✓ no lugar' : `achado em ${esc(VP.nome('unidades', l.unidadeId))}`) : '—'}</td></tr>`; }).join('')}
        ${Object.entries(inv.leituras).filter(([id, l]) => l.unidadeId === unidadeId && inv.esperados[id] !== unidadeId).map(([id]) => { const b = VP.db.pega('bens', id); return `<tr class="chegou"><td>✓</td><td>${esc(b.plaqueta)}</td><td>${esc(b.descricao)}</td><td>${esc(L.estados[inv.leituras[id].estado])}</td><td>veio de ${esc(VP.nome('unidades', inv.esperados[id]))}</td></tr>`; }).join('')}
        ${(inv.sobras || []).filter((s) => s.unidadeId === unidadeId).map((s) => `<tr class="sobra"><td>＋</td><td>${esc(s.plaqueta)}</td><td>${esc(s.descricao)}</td><td></td><td>sobra (sem cadastro)</td></tr>`).join('')}
        </tbody></table>`;
    };
    const m = ui.modal({ titulo: `Conferir: ${un.nome}`, largura: 'grande', corpo: `<div data-conf>${desenhar()}</div>`, botoes: [{ texto: 'Fechar', classe: 'primario', acao: () => VP.app.render() }] });
    const redesenhar = () => { m.el.querySelector('[data-conf]').innerHTML = desenhar(); m.el.querySelector('[data-leitura]').focus(); };
    const salvar = () => VP.db.gravar('inventarios', inv);
    m.el.addEventListener('change', async (e) => {
      if (e.target.dataset.achei) {
        const b = VP.db.pega('bens', e.target.dataset.achei);
        if (e.target.checked) registrarLeitura(inv, b, unidadeId, m.el.querySelector(`[data-estado="${b.id}"]`).value); else delete inv.leituras[b.id];
        await salvar(); redesenhar();
      } else if (e.target.dataset.estado && inv.leituras[e.target.dataset.estado]) {
        inv.leituras[e.target.dataset.estado].estado = Number(e.target.value); await salvar();
      }
    });
    m.el.addEventListener('keydown', async (e) => {
      if (!e.target.matches('[data-leitura]') || e.key !== 'Enter') return;
      e.preventDefault();
      const pl = e.target.value.trim(); e.target.value = '';
      if (!pl) return;
      const b = VP.db.lista('bens').find((x) => x.plaqueta === pl);
      if (!b) {
        ui.formulario({ titulo: `Plaqueta ${pl} sem cadastro`, largura: 'pequena', textoSalvar: 'Registrar sobra', campos: [{ chave: 'descricao', rotulo: 'O que é o bem?', obrigatorio: true }],
          salvar: async (v) => { inv.sobras.push({ id: u.id(), plaqueta: pl, descricao: v.descricao, unidadeId, data: VP.Plataforma.hoje() }); await salvar(); redesenhar(); } });
        return;
      }
      const l = inv.leituras[b.id];
      const esperado = inv.esperados[b.id];
      if (l && l.unidadeId !== unidadeId) {
        // caso (a): já conferido em outro local
        const mover = await ui.confirmar(`<b>${esc(b.descricao)}</b> já foi conferido em <b>${esc(VP.nome('unidades', l.unidadeId))}</b> em ${u.data(l.data)}. Ele foi trazido para cá?`, { sim: 'Sim, foi movido', titulo: 'Já conferido' });
        if (!mover) { ui.aviso('Nada registrado: leitura repetida.'); return; }
      } else if (!l && esperado && esperado !== unidadeId) {
        // caso (b): bem de outra unidade achado aqui
        const ok = await ui.confirmar(`<b>${esc(b.descricao)}</b> deveria estar em <b>${esc(VP.nome('unidades', esperado))}</b>. Registrar que está aqui? (vira transferência ao encerrar)`, { sim: 'Registrar aqui', titulo: 'Bem de outra unidade' });
        if (!ok) return;
      } else if (l) { ui.aviso('Já conferido aqui.'); return; }
      registrarLeitura(inv, b, unidadeId);
      await salvar(); redesenhar();
      ui.aviso(`${b.plaqueta} conferido.`);
    });
  };
  // Lê os registros do aplicativo de campo (mesmo aparelho/navegador, mesmo endereço)
  const importarDoApp = async (inv) => {
    let regs = [];
    try {
      regs = await new Promise((ok, erro) => {
        const req = indexedDB.open('vitalpat-patrimonio');
        req.onupgradeneeded = () => { req.transaction.abort(); ok([]); };
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('registros')) return ok([]);
          const g = db.transaction('registros').objectStore('registros').getAll();
          g.onsuccess = () => ok(g.result); g.onerror = () => erro(g.error);
        };
        req.onerror = () => ok([]);
      });
    } catch (_) { regs = []; }
    // Com servidor: também os registros que os aparelhos já enviaram (sem repetir os que estão neste navegador)
    for (const r of VP.db.lista('registrosCampo')) if (!regs.some((x) => x.id === r.id)) regs.push(r);
    const daqui = regs.filter((r) => r.situacao !== 'lixeira');
    const sucesso = [], falhas = [], eventos = [];
    const unidadePorNome = (nome) => VP.db.lista('unidades').find((x) => u.normalizar(x.nome) === u.normalizar(nome));
    const nomesApp = { U1: 'Escola Municipal Exemplo A', U2: 'Escola Municipal Exemplo B', U3: 'Posto de Saúde Centro (exemplo)', U4: 'Garagem Municipal (exemplo)' };
    for (const r of daqui) {
      if (r.tipo === 'bem') {
        const un = unidadePorNome(nomesApp[r.dados.unidade] || r.dados.unidade);
        const b = VP.db.lista('bens').find((x) => x.plaqueta === String(r.dados.plaqueta));
        if (!un) { falhas.push({ item: `Plaqueta ${r.dados.plaqueta}`, motivo: 'Unidade do aplicativo não encontrada nos cadastros' }); continue; }
        if (!b) { inv.sobras.push({ id: u.id(), plaqueta: r.dados.plaqueta, descricao: r.dados.descricao || 'Sem descrição', unidadeId: un.id, data: r.criadoEm.slice(0, 10), origem: 'app' }); sucesso.push(`Plaqueta ${r.dados.plaqueta}: sobra em ${un.nome}`); continue; }
        registrarLeitura(inv, b, un.id, VP.estadoDoCampo(r.dados), 'app');
        sucesso.push(`Plaqueta ${b.plaqueta}: conferido em ${un.nome}`);
      } else if (r.tipo === 'abastecimento' || r.tipo === 'viagem') {
        const b = VP.db.lista('bens').find((x) => x.veiculo?.placa === r.dados.placa);
        if (!b) { falhas.push({ item: `Veículo ${r.dados.placa}`, motivo: 'Placa não cadastrada como bem (pode ser veículo alugado)' }); continue; }
        if (VP.db.lista('eventos').some((e) => e.dados?.origemAppId === r.id)) continue;
        if (r.tipo === 'abastecimento') eventos.push(VP.novoEvento(b.id, 'abastecimento', { data: r.criadoEm.slice(0, 10), valor: r.dados.valor, descricao: `${r.dados.litros} L de ${r.dados.combustivel} · km ${r.dados.km}`, extra: { litros: r.dados.litros, km: r.dados.km, origemAppId: r.id } }));
        else eventos.push(VP.novoEvento(b.id, 'observacao', { data: r.criadoEm.slice(0, 10), descricao: `${r.dados.movimento} · km ${r.dados.km} · ${r.dados.destino || ''}${r.dados.temProblema ? ' · checklist com problema' : ''}`, extra: { origemAppId: r.id } }));
        sucesso.push(`Veículo ${r.dados.placa}: ${r.tipo}`);
      }
    }
    await VP.db.gravar('inventarios', inv);
    if (eventos.length) await VP.db.gravar('eventos', eventos);
    ui.resultado({ titulo: 'Importação do aplicativo de campo', sucesso, falhas, extra: daqui.length ? '' : '<p>Nenhum registro do aplicativo de campo encontrado neste navegador. Abra o aplicativo de campo neste mesmo aparelho e endereço, ou aguarde a versão com servidor.</p>' });
    VP.app.render();
  };
  const cruzar = (inv) => {
    const nao = Object.keys(inv.esperados).filter((id) => !inv.leituras[id]).map((id) => VP.db.pega('bens', id)).filter(Boolean);
    const sugestoes = [];
    for (const s of inv.sobras || []) {
      const t = u.normalizar(s.descricao).split(/\s+/);
      const cand = nao.map((b) => ({ b, pontos: t.filter((x) => x.length > 2 && u.normalizar(b.descricao).includes(x)).length })).filter((x) => x.pontos).sort((a, b) => b.pontos - a.pontos).slice(0, 3);
      if (cand.length) sugestoes.push({ s, cand });
    }
    ui.modal({
      titulo: 'Cruzar sobras × não localizados', largura: 'grande',
      corpo: sugestoes.length ? `<p class="ajuda">Sugestões pelo nome. Confirme só quando tiver certeza (por exemplo, a plaqueta caiu ou foi trocada).</p>${sugestoes.map(({ s, cand }) => `<div class="cartao"><b>Sobra: ${esc(s.descricao)}</b> (plaqueta ${esc(s.plaqueta)}, em ${esc(VP.nome('unidades', s.unidadeId))})<ul>${cand.map(({ b }) => `<li>${esc(b.codigo)} · ${esc(b.descricao)} · esperado em ${esc(VP.nome('unidades', inv.esperados[b.id]))} <button type="button" class="botao pequeno" data-casar="${esc(s.id)}|${esc(b.id)}">É este</button></li>`).join('')}</ul></div>`).join('')}` : '<p>Nenhuma sugestão: não há sobras parecidas com bens não localizados.</p>',
      botoes: [{ texto: 'Fechar', acao: () => VP.app.render() }]
    }).el.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-casar]'); if (!c) return;
      const [sid, bid] = c.dataset.casar.split('|');
      const s = inv.sobras.find((x) => x.id === sid);
      const b = VP.db.pega('bens', bid);
      registrarLeitura(inv, b, s.unidadeId);
      inv.leituras[b.id].plaquetaLida = s.plaqueta;
      inv.sobras = inv.sobras.filter((x) => x.id !== sid);
      await VP.db.gravar('inventarios', inv);
      c.closest('.cartao').innerHTML = `✓ ${esc(s.descricao)} ligado ao bem ${esc(b.codigo)}.`;
    });
  };
  const encerrarInventario = async (inv) => {
    const p = VP.progressoInventario(inv);
    if (!await ui.confirmar(`Encerrar <b>${esc(inv.nome)}</b>?<br>${p.localizados} localizados, ${p.transferidos} achados em outro local (viram transferência), ${p.naoLocalizados} não localizados, ${p.sobras} sobras.<br>Os estados conferidos atualizam os bens.`, { titulo: 'Encerrar inventário', sim: 'Encerrar' })) return;
    const bens = [], eventos = [];
    for (const [id, l] of Object.entries(inv.leituras)) {
      const b = VP.db.pega('bens', id); if (!b) continue;
      if (l.unidadeId !== inv.esperados[id]) {
        eventos.push(VP.novoEvento(b.id, 'transferencia', { descricao: `Transferência pelo inventário: ${VP.nome('unidades', inv.esperados[id])} → ${VP.nome('unidades', l.unidadeId)}`, extra: { de: inv.esperados[id], para: l.unidadeId, inventarioId: inv.id } }));
        b.unidadeId = l.unidadeId;
        b.responsavelId = VP.db.pega('unidades', l.unidadeId)?.responsavelId || b.responsavelId;
      }
      if (l.estado) b.estado = l.estado;
      if (l.plaquetaLida && l.plaquetaLida !== b.plaqueta) { VP.registrarPlaquetaAnterior(b, { plaqueta: b.plaqueta, motivo: `Plaqueta trocada no ${inv.nome}`, observacao: `Nova plaqueta: ${l.plaquetaLida}` }); b.plaqueta = l.plaquetaLida; }
      eventos.push(VP.novoEvento(b.id, 'inventario', { descricao: `Conferido no ${inv.nome}`, extra: { inventarioId: inv.id, estado: l.estado } }));
      bens.push(b);
    }
    inv.situacao = 'encerrado';
    inv.encerradoEm = VP.Plataforma.hoje();
    await VP.db.gravarVarias({ bens, eventos, inventarios: [inv] });
    ui.aviso('Inventário encerrado.');
    VP.app.ir('#relatorio/inventario?id=' + inv.id);
  };

  // ======================================================== FINANCEIRO
  T.financeiro = (aba = 'fechamento') => {
    const abas = { fechamento: 'Fechar o mês', reavaliacao: 'Reavaliação', melhorias: 'Melhorias', baixas: 'Baixas', contabilidade: 'Para a contabilidade' };
    const nav = `<nav class="abas" aria-label="Financeiro">${Object.entries(abas).map(([k, n]) => `<a href="#financeiro/${k}" class="${k === aba ? 'ativa' : ''}">${n}</a>`).join('')}</nav>`;
    const t = (F[aba] || F.fechamento)();
    return { titulo: 'Financeiro', acoes: t.acoes || '', html: nav + t.html, ligar: t.ligar };
  };
  const F = {};
  F.fechamento = () => {
    const cfg = VP.config();
    const ult = VP.ultimoFechamento();
    const hojeYM = VP.Plataforma.hoje().slice(0, 7);
    const proximo = ult ? u.somaMeses(ult.mes, 1) : u.somaMeses(hojeYM, -1);
    const pronto = proximo < hojeYM;
    const meses = cfg.depreciacaoAnual ? Array.from({ length: 12 }, (_, i) => `${proximo.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`).filter((m) => m >= proximo && m < hojeYM) : [proximo];
    const itens = pronto ? VP.calcularFechamento(proximo) : [];
    const total = itens.reduce((t, x) => t + x.valor, 0);
    const porConta = [...u.agruparSoma(itens, (x) => x.bem.contaId, 'valor')].map(([c, v]) => ({ rotulo: VP.nome('contas', c), valor: v })).sort((a, b) => b.valor - a.valor);
    const hist = VP.db.lista('fechamentos').sort((a, b) => b.mes.localeCompare(a.mes) || b.fechadoEm.localeCompare(a.fechadoEm));
    return {
      html: `
        <section class="cartao">
          <h3>${pronto ? `Fechar ${u.mesExtenso(proximo)}${cfg.depreciacaoAnual && meses.length > 1 ? ` (e mais ${meses.length - 1} mês(es) do ano — depreciação anual)` : ''}` : `Mês de ${u.mesExtenso(proximo)} ainda não terminou`}</h3>
          ${pronto ? `<p>O fechamento calcula a depreciação de todos os bens de uma vez. Antes de confirmar, veja a prévia. Se algo estiver errado, dá para <b>desfazer</b> o último fechamento.</p>
          <div class="resumo-linha">${G.numero('Bens que depreciam', u.inteiro(itens.length))}${G.numero('Total do mês', u.moeda(total))}</div>
          <h4>Por conta</h4>${G.barrasH(porConta, { formato: u.moeda })}
          <button class="botao primario grande" data-fechar>Fechar ${cfg.depreciacaoAnual && meses.length > 1 ? 'os meses' : 'o mês'}</button>` : '<p>Volte depois do fim do mês.</p>'}
        </section>
        <section class="cartao"><h3>Fechamentos</h3>
          <table class="tabela"><thead><tr><th>Mês</th><th class="num">Bens</th><th class="num">Total</th><th>Situação</th><th>Quando</th><th></th></tr></thead><tbody>
          ${hist.map((f, i) => `<tr><td>${u.mesExtenso(f.mes)}</td><td class="num">${u.inteiro(f.qtd)}</td><td class="num">${u.moeda(f.total)}</td><td>${f.situacao === 'fechado' ? 'Fechado' : 'Desfeito'}</td><td>${u.data(f.fechadoEm)}</td><td>${f.situacao === 'fechado' && f.id === ult?.id && i === hist.findIndex((x) => x.situacao === 'fechado') ? '<button class="botao pequeno" data-desfazer>Desfazer</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum.</td></tr>'}
          </tbody></table></section>`,
      ligar() {
        document.querySelector('[data-fechar]')?.addEventListener('click', async () => {
          if (!await ui.confirmar(`Lançar a depreciação de ${meses.map(u.mesExtenso).join(', ')}?`, { titulo: 'Fechar', sim: 'Fechar' })) return;
          const feitos = [];
          for (const m of meses) { const f = await VP.aplicarFechamento(m); feitos.push(`${u.mesExtenso(m)}: ${f.qtd} bens, ${u.moeda(f.total)}`); }
          ui.resultado({ titulo: 'Fechamento', sucesso: feitos });
          VP.app.render();
        });
        document.querySelector('[data-desfazer]')?.addEventListener('click', async () => {
          if (!await ui.confirmar(`Desfazer o fechamento de ${u.mesExtenso(ult.mes)}? Os lançamentos ficam no histórico como desfeitos.`, { sim: 'Desfazer', classe: 'perigo' })) return;
          const n = await VP.desfazerFechamento(ult);
          ui.aviso(`${n} lançamentos desfeitos.`); VP.app.render();
        });
      }
    };
  };
  F.reavaliacao = () => {
    const cfg = VP.config();
    const v = VP.estado.filtrosReav = VP.estado.filtrosReav || {};
    if (VP.estado.reavaliarIds) { for (const k of Object.keys(v)) delete v[k]; v._ids = VP.estado.reavaliarIds; VP.estado.reavaliarIds = null; }
    const bloco = () => (v._ids ? VP.filtrarBens({ ids: v._ids }) : (Object.keys(ui.limparValores(v)).length ? VP.filtrarBens(Object.assign({}, ui.limparValores(v))) : []));
    const desenhar = () => {
      const bens = bloco();
      // controle da classe inteira (A2.13): quanto de cada classe já foi reavaliado no ano
      const ano = VP.Plataforma.hoje().slice(0, 4);
      const classes = [...new Set(bens.map((b) => VP.db.pega('classificacoes', b.classificacaoId)?.paiId || b.classificacaoId))];
      const cobertura = classes.map((cid) => {
        const ids = VP.subClassificacoes(cid);
        const todos = VP.db.lista('bens').filter((b) => b.status !== 'baixado' && ids.has(b.classificacaoId));
        const feitos = todos.filter((b) => VP.eventosDoBem(b.id).some((e) => e.tipo === 'reavaliacao' && e.data.startsWith(ano)));
        const noBloco = todos.filter((b) => bens.includes(b) && !feitos.includes(b));
        return { nome: VP.nome('classificacoes', cid), total: todos.length, feitos: feitos.length, noBloco: noBloco.length };
      });
      const hist = VP.db.lista('reavaliacoes').sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      return `
        <section class="cartao"><h3>1. Montar o bloco</h3>
          <p class="ajuda">Escolha por unidade ou combine filtros (classe, conta, estado, idade…). Também dá para marcar bens na lista de Bens e clicar em “Reavaliar”.</p>
          ${v._ids ? `<p>Bloco com <b>${v._ids.length}</b> bens marcados na lista. <button class="botao pequeno" data-limpar-ids>Usar filtros</button></p>` : ui.filtros({ id: 'reav', valores: v, busca: true, placeholder: 'Buscar bens…', defs: [
            { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opc('unidades') },
            { chave: 'classificacaoId', rotulo: 'Classificação', tipo: 'select', opcoes: VP.opcClassificacoes() },
            { chave: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: opc('contas', (c) => c.tipo === 'ativo') },
            { chave: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: Object.entries(L.estados).reverse() },
            { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposBem) },
            { chave: 'anoAte', rotulo: 'Comprados até o ano', tipo: 'texto', tamanho: 5 },
            { chave: 'totalmenteDepreciados', rotulo: 'Totalmente depreciados', tipo: 'bool' }], aoMudar: () => atualizar() })}
          <p><b>${u.inteiro(bens.length)}</b> bens no bloco · valor contábil atual <b>${u.moeda(bens.reduce((t, b) => t + VP.saldo(b).liquido, 0))}</b></p>
          ${cobertura.length ? `<h4>Classe inteira</h4><p class="ajuda">A reavaliação vale para a classe inteira de bens. Trabalhar por bloco organiza a comissão; o fechamento é por classe.</p>
            ${G.empilhadas(cobertura.map((c) => ({ rotulo: c.nome, a: c.feitos + c.noBloco, b: c.total - c.feitos - c.noBloco })), ['Reavaliados no ano + este bloco', 'Faltam na classe'])}
            ${cobertura.filter((c) => c.total - c.feitos - c.noBloco > 0).map((c) => `<p class="aviso-inline">Faltam <b>${c.total - c.feitos - c.noBloco}</b> bens da classe <b>${esc(c.nome)}</b> em outros blocos para fechar a reavaliação desta classe neste ano.</p>`).join('')}` : ''}
        </section>
        ${bens.length ? `<section class="cartao"><h3>2. Valor novo e prévia</h3>
          ${ui.campos([
            { chave: 'forma', rotulo: 'Como calcular o valor novo', tipo: 'select', vazio: false, padrao: cfg.formaReavaliacao, opcoes: [['percentual', 'Percentual sobre o valor atual'], ['informado', 'Informar bem a bem (ou importar a planilha do laudo)'], ['referencia', 'Valor de referência por bem (ex.: planta de valores do IPTU) — igual a informar']] },
            { chave: 'percentual', rotulo: 'Percentual (ex.: 10 ou -15)', tipo: 'numero', largura: 'meia' },
            { chave: 'vidaUtilMeses', rotulo: 'Nova vida útil (meses, opcional)', tipo: 'numero', largura: 'meia' },
            { chave: 'residualPct', rotulo: 'Novo residual % (opcional)', tipo: 'numero', largura: 'meia' },
            { chave: 'data', rotulo: 'Data da reavaliação', tipo: 'data', padrao: VP.Plataforma.hoje(), largura: 'meia' },
            { chave: 'laudo', rotulo: 'Laudo nº', obrigatorio: true, largura: 'meia' },
            { chave: 'comissaoId', rotulo: 'Comissão', tipo: 'select', opcoes: opc('comissoes'), largura: 'meia' }])}
          <p><label class="botao pequeno">Importar planilha do laudo (plaqueta;valor)<input type="file" accept=".csv" data-planilha-laudo hidden></label></p>
          <div class="tabela-rolagem"><table class="tabela" data-previa-reav><thead><tr><th>Bem</th><th class="num">Valor atual</th><th class="num">Valor novo</th><th class="num">Diferença</th><th>Tirar do bloco</th></tr></thead><tbody>
          ${bens.map((b) => `<tr data-bem="${esc(b.id)}"><td>${esc(b.codigo)} · ${esc(b.descricao)}<br><small>${esc(VP.nome('unidades', b.unidadeId))}</small></td><td class="num" data-atual="${VP.saldo(b).liquido}">${u.moeda(VP.saldo(b).liquido)}</td><td class="num"><input class="valor-novo" inputmode="decimal" size="10" data-novo="${esc(b.id)}"></td><td class="num" data-dif></td><td><input type="checkbox" data-tirar="${esc(b.id)}" aria-label="Tirar do bloco"></td></tr>`).join('')}
          </tbody><tfoot><tr><td><b>Total</b></td><td class="num" data-tot-atual></td><td class="num" data-tot-novo></td><td class="num" data-tot-dif></td><td></td></tr></tfoot></table></div>
          <h4>3. Aprovação</h4>
          <label class="linha-check"><input type="checkbox" data-ok-comissao> A comissão assinou o laudo</label>
          <label class="linha-check"><input type="checkbox" data-ok-contabil> O setor contábil aprovou</label>
          <p class="erro-form" role="alert"></p>
          <button class="botao primario grande" data-aplicar-reav>Aplicar reavaliação</button>
        </section>` : ''}
        <section class="cartao"><h3>Blocos já reavaliados</h3>
          <table class="tabela"><thead><tr><th>Data</th><th>Laudo</th><th class="num">Bens</th><th class="num">Antes</th><th class="num">Depois</th><th>Situação</th><th></th></tr></thead><tbody>
          ${hist.map((r) => `<tr><td>${u.data(r.data)}</td><td>${esc(r.laudo)}</td><td class="num">${r.qtd}</td><td class="num">${u.moeda(r.antes)}</td><td class="num">${u.moeda(r.depois)}</td><td>${r.situacao === 'aplicada' ? 'Aplicada' : 'Desfeita'}</td><td>${r.situacao === 'aplicada' ? `<button class="botao pequeno" data-desfazer-reav="${esc(r.id)}">Desfazer</button> ` : ''}<button class="botao pequeno" data-laudo-reav="${esc(r.id)}">Laudo</button></td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhum.</td></tr>'}
          </tbody></table></section>`;
    };
    const atualizar = () => { document.getElementById('area-reav').innerHTML = desenhar(); ligar(); };
    const recalcular = () => {
      const area = document.getElementById('area-reav');
      const forma = area.querySelector('[name=forma]')?.value;
      const pct = u.num(area.querySelector('[name=percentual]')?.value);
      let ta = 0, tn = 0;
      area.querySelectorAll('[data-previa-reav] tbody tr').forEach((tr) => {
        const atual = Number(tr.querySelector('[data-atual]').dataset.atual);
        const inp = tr.querySelector('[data-novo]');
        const tirar = tr.querySelector('[data-tirar]').checked;
        if (forma === 'percentual' && pct != null && !inp.dataset.manual) inp.value = (Math.round(atual * (1 + pct / 100) * 100) / 100).toFixed(2).replace('.', ',');
        const novo = u.num(inp.value);
        const dif = novo != null ? novo - atual : null;
        tr.classList.toggle('tirado', tirar);
        tr.querySelector('[data-dif]').innerHTML = dif == null ? '—' : `<span class="${Math.abs(dif) > atual * 0.5 ? 'destaque-dif' : ''}">${u.moeda(dif)}</span>`;
        if (!tirar && novo != null) { ta += atual; tn += novo; }
      });
      const set = (s, x) => { const el = area.querySelector(s); if (el) el.textContent = u.moeda(x); };
      set('[data-tot-atual]', ta); set('[data-tot-novo]', tn); set('[data-tot-dif]', tn - ta);
    };
    const ligar = () => {
      const area = document.getElementById('area-reav');
      area.querySelector('[data-limpar-ids]')?.addEventListener('click', () => { delete v._ids; atualizar(); });
      area.addEventListener('input', (e) => { if (e.target.dataset.novo) e.target.dataset.manual = '1'; recalcular(); });
      area.addEventListener('change', async (e) => {
        if (e.target.matches('[name=forma]') || e.target.matches('[name=percentual]')) { area.querySelectorAll('[data-novo]').forEach((i) => delete i.dataset.manual); }
        if (e.target.matches('[data-planilha-laudo]')) {
          const texto = (await e.target.files[0].text()).replace(/^﻿/, '');
          let n = 0;
          for (const l of texto.split(/\r?\n/)) {
            const [pl, val] = l.split(';');
            const b = VP.db.lista('bens').find((x) => x.plaqueta === String(pl).trim());
            const inp = b && area.querySelector(`[data-novo="${b.id}"]`);
            if (inp && u.num(val) != null) { inp.value = String(u.num(val)).replace('.', ','); inp.dataset.manual = '1'; n++; }
          }
          ui.aviso(`${n} valores lidos da planilha.`);
        }
        recalcular();
      });
      area.querySelector('[data-aplicar-reav]')?.addEventListener('click', async () => {
        const err = area.querySelector('.erro-form');
        const { valores: x, faltando } = ui.lerCampos(area, [{ chave: 'laudo', rotulo: 'Laudo nº', obrigatorio: true }, { chave: 'data', rotulo: 'Data', tipo: 'data' }, { chave: 'vidaUtilMeses', tipo: 'numero' }, { chave: 'residualPct', tipo: 'numero' }, { chave: 'comissaoId' }, { chave: 'forma' }]);
        if (faltando.length) { err.textContent = 'Preencha o número do laudo.'; return; }
        if (!area.querySelector('[data-ok-comissao]').checked || !area.querySelector('[data-ok-contabil]').checked) { err.textContent = 'Marque as duas aprovações (comissão e setor contábil).'; return; }
        const linhas = [...area.querySelectorAll('[data-previa-reav] tbody tr')].filter((tr) => !tr.querySelector('[data-tirar]').checked);
        const falhas = [], evs = [], bens = [];
        const loteId = 'reav-' + u.id();
        let antes = 0, depois = 0;
        for (const tr of linhas) {
          const b = VP.db.pega('bens', tr.dataset.bem);
          const novo = u.num(tr.querySelector('[data-novo]').value);
          if (novo == null || novo < 0) { falhas.push({ item: `${b.codigo} · ${b.descricao}`, motivo: 'Sem valor novo' }); continue; }
          const s = VP.saldo(b, x.data);
          const residual = x.residualPct != null ? Math.round(novo * x.residualPct) / 100 : Math.min(s.residual, novo);
          evs.push(VP.novoEvento(b.id, 'reavaliacao', { data: x.data, valor: Math.round((novo - s.liquido) * 100) / 100, loteId, descricao: `Reavaliação — laudo ${x.laudo}`, extra: { valorAnterior: s.liquido, valorNovo: novo, vidaUtilMeses: x.vidaUtilMeses || s.vidaUtilMeses, residual, laudo: x.laudo, comissaoId: x.comissaoId } }));
          antes += s.liquido; depois += novo; bens.push(b);
        }
        if (!evs.length) { ui.resultado({ titulo: 'Reavaliação', falhas }); return; }
        const reg = { id: loteId, loteId, data: x.data, laudo: x.laudo, comissaoId: x.comissaoId, qtd: evs.length, antes, depois, situacao: 'aplicada', criadoEm: VP.Plataforma.agoraISO(), bens: bens.map((b) => b.id) };
        await VP.db.gravarVarias({ eventos: evs, reavaliacoes: [reg] });
        delete v._ids;
        ui.resultado({ titulo: 'Reavaliação aplicada', sucesso: bens.map((b) => `${b.codigo} · ${b.descricao}`), falhas, extra: `<p>Antes: <b>${u.moeda(antes)}</b> · Depois: <b>${u.moeda(depois)}</b> · Diferença: <b>${u.moeda(depois - antes)}</b></p>` });
        atualizar();
      });
      area.querySelectorAll('[data-desfazer-reav]').forEach((el) => el.addEventListener('click', async () => {
        const r = VP.db.pega('reavaliacoes', el.dataset.desfazerReav);
        const evs = VP.db.lista('eventos').filter((e) => e.loteId === r.loteId && !e.cancelado);
        const depoisDela = evs.filter((e) => VP.eventosDoBem(e.bemId).some((x) => VP.LISTAS.eventos[x.tipo]?.grupo === 'financeiro' && x.data > e.data && x.tipo !== 'estorno'));
        if (depoisDela.length) return ui.resultado({ titulo: 'Desfazer reavaliação', falhas: depoisDela.map((e) => ({ item: VP.db.pega('bens', e.bemId).descricao, motivo: 'Já tem lançamento depois da reavaliação (desfaça o fechamento antes)' })) });
        if (!await ui.confirmar(`Desfazer a reavaliação do laudo ${esc(r.laudo)} (${r.qtd} bens)?`, { sim: 'Desfazer', classe: 'perigo' })) return;
        for (const e of evs) { e.cancelado = true; e.motivoCancelamento = 'Reavaliação desfeita'; }
        r.situacao = 'desfeita';
        await VP.db.gravarVarias({ eventos: evs, reavaliacoes: [r] });
        ui.aviso('Reavaliação desfeita.'); atualizar();
      }));
      area.querySelectorAll('[data-laudo-reav]').forEach((el) => el.addEventListener('click', () => VP.documentos.laudoReavaliacao(VP.db.pega('reavaliacoes', el.dataset.laudoReav))));
      recalcular();
    };
    return { html: `<div id="area-reav">${desenhar()}</div>`, ligar };
  };
  F.melhorias = () => {
    const evs = VP.db.lista('eventos').filter((e) => e.tipo === 'agregacao').sort((a, b) => b.data.localeCompare(a.data));
    return {
      acoes: '<button class="botao primario" data-nova-melhoria>+ Nova melhoria</button>',
      html: `<p class="ajuda">Melhoria (agregação) soma ao valor do bem. Pintura comum e consertos são manutenção e não somam.</p>
        ${ui.tabela({ id: 'melhorias', nomePlanilha: 'melhorias', linhas: evs, colunas: [
          { chave: 'data', titulo: 'Data', valor: (e) => u.data(e.data), ordenar: (e) => e.data },
          { chave: 'bem', titulo: 'Bem', html: (e) => `<a href="#bem/${esc(e.bemId)}">${esc(VP.db.pega('bens', e.bemId)?.descricao || '')}</a>`, valor: (e) => VP.db.pega('bens', e.bemId)?.descricao },
          { chave: 'descricao', titulo: 'O que foi feito' },
          { chave: 'valor', titulo: 'Valor', num: true, soma: true, formato: u.moeda, valor: (e) => (e.cancelado ? 0 : e.valor) },
          { chave: 'sit', titulo: 'Situação', valor: (e) => (e.cancelado ? 'Estornada' : 'Ativa') }] })}`,
      ligar() {
        ui.ligarTabela('melhorias');
        document.querySelector('[data-nova-melhoria]').addEventListener('click', () => VP.escolherBens('Melhoria: em qual bem?', (bens) => A.melhoria(bens[0], () => VP.app.render())));
      }
    };
  };
  F.baixas = () => {
    const evs = VP.db.lista('eventos').filter((e) => e.tipo === 'baixa').sort((a, b) => b.data.localeCompare(a.data));
    return {
      acoes: '<button class="botao primario" data-nova-baixa>+ Nova baixa</button>',
      html: ui.tabela({ id: 'baixas', nomePlanilha: 'baixas', linhas: evs, colunas: [
        { chave: 'data', titulo: 'Data', valor: (e) => u.data(e.data), ordenar: (e) => e.data },
        { chave: 'bem', titulo: 'Bem', html: (e) => `<a href="#bem/${esc(e.bemId)}">${esc(VP.db.pega('bens', e.bemId)?.descricao || '')}</a>`, valor: (e) => VP.db.pega('bens', e.bemId)?.descricao },
        { chave: 'tipo', titulo: 'Tipo', valor: (e) => e.dados.tipoBaixa },
        { chave: 'motivo', titulo: 'Motivo', valor: (e) => e.dados.motivo },
        { chave: 'doc', titulo: 'Documento', valor: (e) => e.dados.documento },
        { chave: 'valor', titulo: 'Valor que saiu', num: true, soma: true, formato: u.moeda, valor: (e) => e.valor },
        { chave: 'termo', titulo: '', html: (e) => `<button class="botao pequeno" data-termo-baixa="${esc(e.id)}">Termo</button>` }] }),
      ligar() {
        ui.ligarTabela('baixas');
        document.querySelector('[data-nova-baixa]').addEventListener('click', () => VP.escolherBens('Baixa: quais bens?', (bens) => A.baixa(bens, () => VP.app.render())));
        document.querySelectorAll('[data-termo-baixa]').forEach((el) => el.addEventListener('click', () => { const e = VP.db.pega('eventos', el.dataset.termoBaixa); VP.documentos.termoBaixa([VP.db.pega('bens', e.bemId)], e.dados); }));
      }
    };
  };
  F.contabilidade = () => {
    const movs = VP.movimentosAContabilizar().sort((a, b) => a.data.localeCompare(b.data));
    const porTipo = [...u.agruparSoma(movs, (e) => L.eventos[e.tipo].nome, 'valor')].map(([k, v]) => ({ rotulo: k, valor: Math.abs(v) }));
    const exps = VP.db.lista('exportacoes').sort((a, b) => b.data.localeCompare(a.data));
    const linhaContabil = (e) => {
      const b = VP.db.pega('bens', e.bemId) || {};
      const dc = b.depreciacao || {};
      const deb = e.tipo === 'depreciacao' ? dc.contaDebito : e.tipo === 'baixa' ? dc.contaCredito : b.contaId;
      const cred = e.tipo === 'depreciacao' ? dc.contaCredito : e.tipo === 'baixa' ? b.contaId : '';
      return [u.data(e.data), L.eventos[e.tipo].nome, b.codigo, b.descricao, VP.db.pega('contas', deb)?.codigo || '', VP.db.pega('contas', cred)?.codigo || '', Math.abs(e.valor || 0), VP.nome('entidades', b.entidadeId)];
    };
    return {
      html: `<p class="ajuda">O VitalPat não faz lançamento contábil (o sistema contábil oficial é único — Decreto 10.540/2020). Aqui sai o <b>arquivo para o setor contábil lançar</b>, e o sistema marca o que já foi enviado.</p>
        <div class="resumo-linha">${G.numero('Movimentos a enviar', u.inteiro(movs.length))}${G.numero('Valor total', u.moeda(movs.reduce((t, e) => t + Math.abs(e.valor || 0), 0)))}</div>
        <section class="cartao"><h3>Por tipo</h3>${G.barrasH(porTipo, { formato: u.moeda })}</section>
        ${movs.length ? '<button class="botao primario grande" data-gerar-arquivo>Gerar arquivo para a contabilidade</button>' : ''}
        <section class="cartao"><h3>Arquivos já gerados</h3><ul class="lista-simples">${exps.map((x) => `<li>${u.data(x.data)} · ${x.qtd} movimentos · ${u.moeda(x.total)}</li>`).join('') || '<li class="vazio">Nenhum.</li>'}</ul></section>`,
      ligar() {
        document.querySelector('[data-gerar-arquivo]')?.addEventListener('click', async () => {
          ui.baixarCSV('para-contabilidade', ['Data', 'Tipo', 'Código do bem', 'Bem', 'Conta débito', 'Conta crédito', 'Valor', 'Entidade'], movs.map(linhaContabil));
          for (const e of movs) e.contabilizado = true;
          await VP.db.gravarVarias({ eventos: movs, exportacoes: [{ data: VP.Plataforma.hoje(), qtd: movs.length, total: movs.reduce((t, e) => t + Math.abs(e.valor || 0), 0) }] });
          ui.resultado({ titulo: 'Arquivo gerado', sucesso: [`${movs.length} movimentos marcados como enviados`] });
          VP.app.render();
        });
      }
    };
  };

  // ======================================================== HISTÓRICO (eventos patrimoniais, movimentação geral, observações)
  T.historico = () => {
    const v = VP.estado.filtrosHist = VP.estado.filtrosHist || {};
    const desenhar = () => {
      const f = ui.limparValores(v);
      let evs = VP.db.lista('eventos');
      if (f.tipo) evs = evs.filter((e) => e.tipo === f.tipo);
      if (f.grupo) evs = evs.filter((e) => L.eventos[e.tipo]?.grupo === f.grupo);
      if (f.de) evs = evs.filter((e) => e.data >= f.de);
      if (f.ate) evs = evs.filter((e) => e.data <= f.ate);
      if (f.unidadeId) evs = evs.filter((e) => VP.db.pega('bens', e.bemId)?.unidadeId === f.unidadeId);
      if (f.cancelados !== true) evs = evs.filter((e) => !e.cancelado);
      if (f.busca) { const t = u.normalizar(f.busca); evs = evs.filter((e) => u.normalizar(`${e.descricao} ${VP.db.pega('bens', e.bemId)?.descricao} ${VP.db.pega('bens', e.bemId)?.codigo} ${e.usuario}`).includes(t)); }
      evs.sort((a, b) => (b.data + b.criadoEm).localeCompare(a.data + a.criadoEm));
      const porTipo = [...u.agruparSoma(evs, (e) => L.eventos[e.tipo]?.nome || e.tipo)].map(([k, n]) => ({ rotulo: k, valor: n })).sort((a, b) => b.valor - a.valor);
      return `${ui.filtros({ id: 'hist', valores: v, placeholder: 'Buscar no histórico (bem, descrição, usuário)…', defs: [
          { chave: 'grupo', rotulo: 'Grupo', tipo: 'select', opcoes: [['financeiro', 'Financeiro'], ['fisico', 'Físico'], ['registro', 'Registros']] },
          { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.eventos).map(([k, x]) => [k, x.nome]) },
          { chave: 'de', rotulo: 'De', tipo: 'data' }, { chave: 'ate', rotulo: 'Até', tipo: 'data' },
          { chave: 'unidadeId', rotulo: 'Unidade do bem', tipo: 'select', opcoes: opc('unidades') },
          { chave: 'cancelados', rotulo: 'Mostrar desfeitos/estornados', tipo: 'bool' }], aoMudar: (_, o) => atualizar(o) })}
        <section class="cartao"><h3>Eventos por tipo</h3>${G.barrasH(porTipo, { titulo: 'Eventos por tipo' })}</section>
        ${ui.tabela({ id: 'historico', nomePlanilha: 'historico', linhas: evs, porPagina: 100, colunas: [
          { chave: 'data', titulo: 'Data', valor: (e) => u.data(e.data), ordenar: (e) => e.data },
          { chave: 'tipo', titulo: 'Tipo', valor: (e) => L.eventos[e.tipo]?.nome || e.tipo },
          { chave: 'bem', titulo: 'Bem', html: (e) => { const b = VP.db.pega('bens', e.bemId); return b ? `<a href="#bem/${esc(b.id)}">${esc(b.codigo)} · ${esc(b.descricao)}</a>` : '—'; }, valor: (e) => VP.db.pega('bens', e.bemId)?.descricao },
          { chave: 'descricao', titulo: 'Descrição' },
          { chave: 'valor', titulo: 'Valor', num: true, formato: (x) => (x == null ? '' : u.moeda(x)) },
          { chave: 'usuario', titulo: 'Usuário' },
          { chave: 'sit', titulo: 'Situação', valor: (e) => (e.cancelado ? 'Desfeito/estornado' : 'Válido') }] })}`;
    };
    const atualizar = (o) => { const a = document.getElementById('area-hist'); a.innerHTML = desenhar(); ui.ligarTabela('historico'); if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); } };
    return { titulo: 'Histórico', html: `<p class="ajuda">Todos os eventos patrimoniais (financeiros, físicos e registros) num só lugar.</p><div id="area-hist">${desenhar()}</div>`, ligar() { ui.ligarTabela('historico'); } };
  };
})();
