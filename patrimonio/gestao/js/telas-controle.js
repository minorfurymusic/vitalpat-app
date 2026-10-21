/* VitalPat Patrimônio · Gestão — Itens de controle (fora do balancete).
   Bens de pequeno valor (padrão: abaixo de R$ 300, ajustável em Configurações) ou de pouca durabilidade: cadastro simples,
   sem plaqueta (código interno C-000001), sem depreciação e fora do balancete, da contabilidade e do inventário oficial.
   [A conferir] base legal do limite (Portaria STN 448/2002, MCASP) — pendência no checklist. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const C = VP.controle = {};
  const hoje = () => VP.Plataforma.hoje();
  const pode = () => !VP.servidor?.ativo || VP.servidor.podeAlterar();
  const opc = (col) => VP.db.lista(col).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map((x) => [x.id, x.nome]);
  const pega = (o, c) => c.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const poe = (o, c, v) => { const ks = c.split('.'); let x = o; for (const k of ks.slice(0, -1)) { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; } x[ks.at(-1)] = v; };

  C.lista = (incluirExcluidos = false) => VP.db.lista('bensControle', incluirExcluidos);
  C.proximoCodigo = () => 'C-' + String(C.lista(true).reduce((m, x) => Math.max(m, Number(String(x.codigo || '').replace(/\D/g, '')) || 0), 0) + 1).padStart(6, '0');
  C.total = (x) => (Number(x.quantidade) || 0) * (Number(x.valorUnitario) || 0);
  C.fimVida = (x) => (x.vidaUtilAnos && x.dataEntrada ? u.somaMeses(x.dataEntrada.slice(0, 7), Math.round(x.vidaUtilAnos * 12)) + x.dataEntrada.slice(7) : '');
  C.vencido = (x) => !!C.fimVida(x) && C.fimVida(x) <= hoje() && x.situacao !== 'baixado';
  const hist = (x, descricao) => { x.historico = (x.historico || []).concat([{ data: VP.Plataforma.agoraISO(), descricao, usuario: VP.sessao?.usuario || 'demonstração' }]); };

  // ------------------------------------------------------------------ colunas da planilha (exportar e importar)
  C.CAMPOS = [
    { k: 'codigo', t: 'Código', tipo: 'texto', ajuda: 'C-000001. Vazio = item novo com código automático; preenchido = atualiza o item.' },
    { k: 'descricao', t: 'Descrição', tipo: 'texto', obrig: true, ajuda: 'Ex.: Grampeador, Lixeira 50 L, Ventilador de mesa.' },
    { k: 'quantidade', t: 'Quantidade', tipo: 'numero', ajuda: 'Vazio = 1.' },
    { k: 'valorUnitario', t: 'Valor unitário', tipo: 'moeda', ajuda: 'Em reais.' },
    { k: 'unidadeId', t: 'Unidade', tipo: 'ref', ref: 'unidades', obrig: true, ajuda: 'Nome ou código da unidade (aba Listas).' },
    { k: 'localizacao', t: 'Local na unidade', tipo: 'texto' },
    { k: 'responsavelId', t: 'Responsável', tipo: 'ref', ref: 'responsaveis' },
    { k: 'dataEntrada', t: 'Data de entrada', tipo: 'data', ajuda: 'dd/mm/aaaa. Vazio = hoje.' },
    { k: 'vidaUtilAnos', t: 'Vida útil prevista (anos)', tipo: 'numero' },
    { k: 'estado', t: 'Estado', tipo: 'estado' },
    { k: 'fornecedorId', t: 'Fornecedor', tipo: 'ref', ref: 'fornecedores' },
    { k: 'nf.numero', t: 'Nota fiscal', tipo: 'texto' },
    { k: 'observacao', t: 'Observação', tipo: 'texto' }
  ];
  C.EXTRAS = [
    { k: '_total', t: 'Valor total', ler: (x) => Math.round(C.total(x) * 100) / 100 },
    { k: '_situacao', t: 'Situação', ler: (x) => (x.situacao === 'baixado' ? `Baixado em ${u.data(x.baixa?.data)} (${x.baixa?.motivo || ''})` : C.vencido(x) ? 'Fim da vida útil prevista' : 'Em uso') },
    { k: '_fimVida', t: 'Fim da vida útil', ler: (x) => u.data(C.fimVida(x)) }
  ];
  C.colunasExportar = () => C.CAMPOS.concat(C.EXTRAS);
  const lerCampo = (x, c) => {
    if (c.ler) return c.ler(x);
    const v = pega(x, c.k);
    if (v == null || v === '') return '';
    if (c.tipo === 'ref') return VP.nome(c.ref, v);
    if (c.tipo === 'data') return u.data(v);
    if (c.tipo === 'estado') return L.estados[v] || v;
    return v;
  };
  C.filtrar = (f = {}) => {
    let l = C.lista();
    if (f.unidadeId) l = l.filter((x) => x.unidadeId === f.unidadeId);
    if (f.status === 'ativos') l = l.filter((x) => x.situacao !== 'baixado'); else if (f.status === 'baixados') l = l.filter((x) => x.situacao === 'baixado');
    if (f.local) l = l.filter((x) => u.normalizar(x.localizacao).includes(u.normalizar(f.local)));
    return l.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  };
  C.exportar = (f, chaves) => {
    const cols = C.colunasExportar().filter((c) => chaves.includes(c.k));
    const l = C.filtrar(f);
    const cab = cols.map((c) => c.t), linha = (x) => cols.map((c) => lerCampo(x, c));
    let abas = [{ nome: 'Itens de controle', cabecalho: cab, linhas: l.map(linha) }];
    if (f.porUnidade && l.length) {
      const g = new Map(); for (const x of l) { const k = x.unidadeId || ''; if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
      abas = [...g.entries()].map(([id, xs]) => ({ nome: id ? VP.nome('unidades', id) : 'Sem unidade', cabecalho: cab, linhas: xs.map(linha) }));
    }
    VP.baixarXLSX('itens-de-controle', abas);
    return l.length;
  };
  C.abaModelo = () => ({ nome: 'Itens de controle', cabecalho: C.CAMPOS.map((c) => c.t), linhas: [C.CAMPOS.map((c) => ({ descricao: 'EXEMPLO — apague esta linha', quantidade: 10, valorUnitario: 25.9, unidadeId: VP.db.lista('unidades')[0]?.nome || '', dataEntrada: '15/03/2024', vidaUtilAnos: 2, estado: 'Novo' }[c.k] ?? ''))] });
  C.instrucoes = () => [['Itens de controle', `Bens de pequeno valor (até ${u.moeda(VP.config().limiteControle)}) e pouca durabilidade (até ${VP.config().limiteControleMeses} meses). Não ganham plaqueta, não depreciam e não entram no balancete. Código C-000001: vazio = item novo; preenchido = atualiza o item.`]]
    .concat(C.CAMPOS.map((c) => [c.t + (c.obrig ? ' (obrigatória para item novo)' : ''), c.ajuda || '']));

  // ------------------------------------------------------------------ importação (chamada pela tela Exportar e importar)
  C.previaImportacao = (a) => {
    const P = VP.planilhas;
    const itens = [], vistos = new Map();
    a.linhas.forEach((lin, i) => {
      const it = { aba: a.nome, cj: 'controle', linha: i + 2, valores: {}, erros: [], avisos: [], mudancas: [] };
      a.mapa.forEach((k, col) => {
        if (!k) return;
        const c = C.CAMPOS.find((x) => x.k === k); if (!c) return;
        const r = P.converter(c, lin[col]);
        if (r.erro) it.erros.push(`${c.t}: ${r.erro}`); else if (!r.vazio) it.valores[k] = r.v;
      });
      it.descricao = it.valores.descricao || '';
      it.codigoControle = it.valores.codigo ? String(it.valores.codigo).trim().toUpperCase() : '';
      it.plaqueta = it.codigoControle;
      if (/^exemplo/i.test(it.descricao)) it.erros.unshift('Linha de EXEMPLO do modelo: apague-a da planilha');
      if (it.codigoControle) { if (vistos.has(it.codigoControle)) it.erros.push(`Código repetido no arquivo (já está na linha ${vistos.get(it.codigoControle)})`); else vistos.set(it.codigoControle, it.linha); }
      const existe = it.codigoControle ? C.lista(true).find((x) => String(x.codigo).toUpperCase() === it.codigoControle) : null;
      if (existe && existe.excluido) it.erros.push('Este código é de um item que está na Lixeira; restaure-o antes');
      else if (existe) {
        it.controleId = existe.id;
        for (const [k, v] of Object.entries(it.valores)) {
          if (k === 'codigo') continue;
          const antes = pega(existe, k);
          if (typeof v === 'number' ? antes != null && antes !== '' && Number(antes) === v : String(antes ?? '') === String(v)) continue;
          it.mudancas.push({ k, t: C.CAMPOS.find((c) => c.k === k).t, antes: antes ?? '', depois: v });
        }
        it.classe = it.erros.length ? 'erro' : it.mudancas.length ? 'alterado' : 'igual';
      } else {
        if (it.codigoControle) it.erros.push(`Não existe item com o código ${it.codigoControle} (deixe vazio para item novo)`);
        for (const c of C.CAMPOS) if (c.obrig && it.valores[c.k] == null) it.erros.push(`${c.t} é obrigatória para item novo`);
        it.classe = it.erros.length ? 'erro' : 'novo';
      }
      if (it.classe === 'novo' && (it.valores.valorUnitario || 0) > VP.config().limiteControle) it.avisos.push(`Valor unitário acima de ${u.moeda(VP.config().limiteControle)}: confira se não é bem do patrimônio`);
      it.marcado = it.classe === 'novo' || it.classe === 'alterado';
      itens.push(it);
    });
    return itens;
  };
  C.aplicarImportacao = (itens, reg, extra, sucesso, falhas) => {
    let n = Number(C.proximoCodigo().replace(/\D/g, ''));
    for (const it of itens) {
      try {
        if (it.classe === 'novo') {
          const v = it.valores;
          const x = { id: u.id(), codigo: 'C-' + String(n++).padStart(6, '0'), descricao: v.descricao, quantidade: v.quantidade || 1, valorUnitario: v.valorUnitario || 0, unidadeId: v.unidadeId || '', localizacao: v.localizacao || '', responsavelId: v.responsavelId || VP.db.pega('unidades', v.unidadeId)?.responsavelId || '', dataEntrada: v.dataEntrada || hoje(), vidaUtilAnos: v.vidaUtilAnos || null, estado: v.estado || 8, fornecedorId: v.fornecedorId || '', nf: { numero: v['nf.numero'] || '' }, observacao: v.observacao || '', situacao: 'ativo', fotos: [], anexos: [], historico: [], criadoEm: VP.Plataforma.agoraISO() };
          hist(x, 'Incluído pela importação de planilha');
          extra.bensControle.push(x); reg.controleNovos.push(x.id);
          sucesso.push(`Item de controle novo: ${x.codigo} · ${x.descricao}`);
        } else {
          const x = VP.db.pega('bensControle', it.controleId);
          const antes = {};
          for (const m of it.mudancas) { antes[m.k] = pega(x, m.k) ?? null; poe(x, m.k, m.depois); }
          hist(x, 'Atualizado pela importação de planilha: ' + it.mudancas.map((m) => m.t).join(', '));
          extra.bensControle.push(x); reg.controleAlterados.push({ id: x.id, antes });
          sucesso.push(`Item de controle atualizado: ${x.codigo} · ${x.descricao}`);
        }
      } catch (e) { falhas.push({ item: `${it.aba}, linha ${it.linha}`, motivo: e.message }); }
    }
  };
  C.desfazerImportacao = (reg, grava, sucesso, falhas) => {
    grava.bensControle = [];
    for (const id of reg.controleNovos || []) {
      const x = VP.db.pega('bensControle', id); if (!x) { falhas.push({ item: id, motivo: 'Item não encontrado' }); continue; }
      x.excluido = true; x.excluidoEm = VP.Plataforma.agoraISO(); hist(x, 'Importação desfeita: movido para a Lixeira');
      grava.bensControle.push(x); sucesso.push(`Para a Lixeira: ${x.codigo} · ${x.descricao}`);
    }
    for (const a of reg.controleAlterados || []) {
      const x = VP.db.pega('bensControle', a.id); if (!x) { falhas.push({ item: a.id, motivo: 'Item não encontrado' }); continue; }
      for (const [k, v] of Object.entries(a.antes)) poe(x, k, v);
      hist(x, 'Importação desfeita: valores anteriores restaurados');
      grava.bensControle.push(x); sucesso.push(`Restaurado: ${x.codigo} · ${x.descricao}`);
    }
  };

  // ------------------------------------------------------------------ cadastro e ações
  const campos = (novo) => [
    { chave: 'descricao', rotulo: 'Descrição', obrigatorio: true },
    { chave: 'quantidade', rotulo: 'Quantidade', tipo: 'numero', padrao: 1, largura: 'meia' },
    { chave: 'valorUnitario', rotulo: 'Valor unitário (R$)', tipo: 'moeda', largura: 'meia' },
    ...(novo ? [{ chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opc('unidades'), obrigatorio: true, largura: 'meia' }, { chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: opc('responsaveis'), largura: 'meia' }] : []),
    { chave: 'localizacao', rotulo: 'Local na unidade', placeholder: 'Ex.: Almoxarifado, Sala 3', largura: 'meia' },
    { chave: 'dataEntrada', rotulo: 'Data de entrada', tipo: 'data', padrao: hoje(), largura: 'meia' },
    { chave: 'vidaUtilAnos', rotulo: 'Vida útil prevista (anos)', tipo: 'numero', largura: 'meia', ajuda: 'Para avisar quando deve ser trocado.' },
    { chave: 'estado', rotulo: 'Estado', tipo: 'select', opcoes: Object.entries(L.estados).reverse(), padrao: 8, vazio: false, largura: 'meia' },
    { chave: 'fornecedorId', rotulo: 'Fornecedor', tipo: 'select', opcoes: opc('fornecedores'), largura: 'meia' },
    { chave: 'nf.numero', rotulo: 'Nota fiscal', largura: 'meia' },
    { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }];
  C.novo = (depois, valores = {}) => ui.formulario({
    titulo: 'Novo item de controle', largura: 'media', valores,
    intro: `<p class="ajuda">Para bens de pequeno valor (até ${u.moeda(VP.config().limiteControle)}) <b>e</b> pouca durabilidade (até ${VP.config().limiteControleMeses} meses). Se passar de um dos dois, é patrimônio com plaqueta. Não ganha plaqueta, não deprecia e não entra no balancete.</p>`,
    campos: campos(true).concat([{ chave: 'arquivos', rotulo: 'Foto ou nota (opcional)', tipo: 'arquivo', multiplo: true }]),
    salvar: async (v) => {
      if (!(v.quantidade > 0)) return 'Quantidade deve ser maior que zero.';
      const anexos = v.arquivos?.length ? await ui.lerArquivos(v.arquivos) : [];
      for (const a of anexos) a.tipoAnexo = VP.anexos ? VP.anexos.tipoSugerido(a.nome, a.tipo) : 'Outro';
      const x = { id: u.id(), codigo: C.proximoCodigo(), descricao: v.descricao, quantidade: v.quantidade, valorUnitario: v.valorUnitario || 0, unidadeId: v.unidadeId, responsavelId: v.responsavelId || VP.db.pega('unidades', v.unidadeId)?.responsavelId || '', localizacao: v.localizacao || '', dataEntrada: v.dataEntrada || hoje(), vidaUtilAnos: v.vidaUtilAnos || null, estado: Number(v.estado || 8), fornecedorId: v.fornecedorId || '', nf: v.nf || {}, observacao: v.observacao || '', situacao: 'ativo', fotos: [], anexos, historico: [], criadoEm: VP.Plataforma.agoraISO() };
      hist(x, 'Incluído');
      await VP.db.gravar('bensControle', x);
      ui.aviso(`Item ${x.codigo} incluído.`);
      depois && depois(x);
    }
  });
  // Monta um item de controle sem gravar (nota fiscal e importação de bens mandam para cá o que a pessoa escolheu)
  C.montar = (v, codigo, texto) => {
    const x = { id: u.id(), codigo, descricao: v.descricao, quantidade: v.quantidade || 1, valorUnitario: v.valorUnitario || 0, unidadeId: v.unidadeId || '', localizacao: v.localizacao || '', responsavelId: v.responsavelId || VP.db.pega('unidades', v.unidadeId)?.responsavelId || '', dataEntrada: v.dataEntrada || hoje(), vidaUtilAnos: v.vidaUtilAnos || null, estado: Number(v.estado || 8), fornecedorId: v.fornecedorId || '', nf: v.nf || {}, observacao: v.observacao || '', situacao: 'ativo', fotos: [], anexos: [], historico: [], criadoEm: VP.Plataforma.agoraISO() };
    if (v.centroCustoPendente) x.centroCustoPendente = v.centroCustoPendente;
    hist(x, texto);
    return x;
  };
  C.editar = (x, depois) => ui.formulario({
    titulo: `Editar ${x.codigo}`, largura: 'media', valores: x, campos: campos(false),
    salvar: async (v) => {
      const mud = [];
      for (const c of campos(false)) { const a = pega(x, c.chave), d = pega(v, c.chave); if (String(a ?? '') !== String(d ?? '')) { mud.push(c.rotulo); poe(x, c.chave, d); } }
      if (!mud.length) return;
      hist(x, 'Alterado: ' + mud.join(', '));
      await VP.db.gravar('bensControle', x); ui.aviso('Alterado.'); depois && depois();
    }
  });
  C.entregar = (x, depois) => ui.formulario({
    titulo: `Entregar ou transferir ${x.codigo}`, largura: 'pequena', valores: { unidadeId: x.unidadeId, responsavelId: x.responsavelId, localizacao: x.localizacao },
    campos: [{ chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opc('unidades'), obrigatorio: true }, { chave: 'responsavelId', rotulo: 'Responsável (quem recebe)', tipo: 'select', opcoes: opc('responsaveis') }, { chave: 'localizacao', rotulo: 'Local' }, { chave: 'motivo', rotulo: 'Observação' }],
    salvar: async (v) => {
      hist(x, `Entregue/transferido: ${VP.nome('unidades', x.unidadeId)} → ${VP.nome('unidades', v.unidadeId)}${v.responsavelId ? ` (${VP.nome('responsaveis', v.responsavelId)})` : ''}${v.motivo ? ' · ' + v.motivo : ''}`);
      Object.assign(x, { unidadeId: v.unidadeId, responsavelId: v.responsavelId || '', localizacao: v.localizacao || '' });
      await VP.db.gravar('bensControle', x); ui.aviso('Registrado.'); depois && depois();
    }
  });
  C.baixa = (x, depois) => ui.formulario({
    titulo: `Dar baixa em ${x.codigo}`, largura: 'pequena',
    intro: '<p class="ajuda">O item sai do uso (quebrou, gastou, foi doado). Fica no histórico; não é apagado.</p>',
    campos: [{ chave: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: ['Gasto / fim da vida útil', 'Quebrado sem conserto', 'Extraviado', 'Doado', 'Outro'].map((m) => [m, m]), obrigatorio: true }, { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: hoje() }, { chave: 'obs', rotulo: 'Observação' }],
    salvar: async (v) => {
      x.situacao = 'baixado'; x.baixa = { data: v.data || hoje(), motivo: v.motivo, obs: v.obs || '' };
      hist(x, `Baixa: ${v.motivo}${v.obs ? ' · ' + v.obs : ''}`);
      await VP.db.gravar('bensControle', x); ui.aviso('Baixa registrada.'); depois && depois();
    }
  });
  C.excluir = async (x, depois) => {
    if (!await ui.confirmar(`Mover ${esc(x.codigo)} para a Lixeira? Use só para cadastro feito por engano (para tirar de uso, use "Dar baixa").`, { titulo: 'Excluir (Lixeira)', sim: 'Mover para a Lixeira', classe: 'perigo' })) return;
    x.excluido = true; x.excluidoEm = VP.Plataforma.agoraISO(); hist(x, 'Movido para a Lixeira');
    await VP.db.gravar('bensControle', x); ui.aviso('Na Lixeira.'); depois && depois();
  };
  C.anexar = (x, depois) => ui.formulario({
    titulo: `Anexar em ${x.codigo}`, largura: 'pequena', textoSalvar: 'Anexar',
    campos: [{ chave: 'arquivos', rotulo: 'Fotos ou documentos', tipo: 'arquivo', multiplo: true, obrigatorio: true }],
    salvar: async (v) => {
      if (!v.arquivos?.length) return 'Escolha um arquivo.';
      const arqs = await ui.lerArquivos(v.arquivos);
      for (const a of arqs) a.tipoAnexo = VP.anexos ? VP.anexos.tipoSugerido(a.nome, a.tipo) : 'Outro';
      x.anexos = (x.anexos || []).concat(arqs); hist(x, `Anexado: ${arqs.map((a) => a.nome).join(', ')}`);
      await VP.db.gravar('bensControle', x); ui.aviso('Anexado.'); depois && depois();
    }
  });
  C.ficha = (x) => {
    const anexos = (x.anexos || []).filter((a) => !a.excluido);
    const corpo = `<dl class="dados"><dt>Código</dt><dd>${esc(x.codigo)}</dd><dt>Descrição</dt><dd>${esc(x.descricao)}</dd><dt>Quantidade</dt><dd>${u.inteiro(x.quantidade)}</dd><dt>Valor unitário</dt><dd>${u.moeda(x.valorUnitario || 0)}</dd><dt>Valor total</dt><dd>${u.moeda(C.total(x))}</dd>
      <dt>Unidade</dt><dd>${esc(VP.nome('unidades', x.unidadeId))}</dd><dt>Local</dt><dd>${esc(x.localizacao || '—')}</dd><dt>Responsável</dt><dd>${esc(x.responsavelId ? VP.nome('responsaveis', x.responsavelId) : '—')}</dd>
      <dt>Entrada</dt><dd>${u.data(x.dataEntrada)}</dd><dt>Vida útil prevista</dt><dd>${x.vidaUtilAnos ? `${x.vidaUtilAnos} ano(s) · até ${u.data(C.fimVida(x))}${C.vencido(x) ? ' <b>(vencida)</b>' : ''}` : '—'}</dd><dt>Estado</dt><dd>${esc(L.estados[x.estado] || '—')}</dd>
      <dt>Fornecedor</dt><dd>${esc(x.fornecedorId ? VP.nome('fornecedores', x.fornecedorId) : '—')}</dd><dt>Nota fiscal</dt><dd>${esc(x.nf?.numero || '—')}</dd><dt>Situação</dt><dd>${x.situacao === 'baixado' ? `Baixado em ${u.data(x.baixa?.data)} · ${esc(x.baixa?.motivo || '')}` : 'Em uso'}</dd><dt>Observação</dt><dd>${esc(x.observacao || '—')}</dd></dl>
      <h4>Anexos (${anexos.length})</h4>${anexos.length ? `<ul class="anexos-lista">${anexos.map((a) => `<li>${/^image\//.test(a.tipo) && a.dataURL ? `<img src="${esc(a.dataURL)}" alt="">` : ''}<span class="anexo-nome"><a href="${esc(a.dataURL || '#')}" download="${esc(a.nome)}" target="_blank" rel="noopener">${esc(a.nome)}</a></span></li>`).join('')}</ul>` : '<p class="vazio">Nenhum.</p>'}
      <h4>Histórico</h4><ul class="lista-simples">${(x.historico || []).slice().reverse().map((h) => `<li>${esc(new Date(h.data).toLocaleString('pt-BR'))} · ${esc(h.descricao)} <small>(${esc(h.usuario || '')})</small></li>`).join('')}</ul>`;
    const re = () => VP.app.render();
    const botoes = [{ texto: 'Fechar' }];
    if (pode() && x.situacao !== 'baixado') botoes.unshift(
      { texto: 'Excluir', classe: 'perigo', acao: () => { C.excluir(x, re); } },
      { texto: 'Dar baixa', acao: () => { C.baixa(x, re); } },
      { texto: 'Anexar', acao: () => { C.anexar(x, re); } },
      { texto: 'Entregar / transferir', acao: () => { C.entregar(x, re); } },
      { texto: 'Editar', classe: 'primario', acao: () => { C.editar(x, re); } });
    ui.modal({ titulo: `${x.codigo} · ${x.descricao}`, corpo, botoes, largura: 'media' });
  };

  // ------------------------------------------------------------------ tela
  T.controle = (_, query = {}) => {
    const f = VP.estado.filtrosControle = VP.estado.filtrosControle || { unidadeId: '', status: 'ativos', busca: '' };
    if (query.unidade) f.unidadeId = query.unidade;
    let l = C.filtrar(f);
    if (f.busca) { const b = u.normalizar(f.busca); l = l.filter((x) => u.normalizar(`${x.codigo} ${x.descricao} ${x.localizacao} ${VP.nome('unidades', x.unidadeId)}`).includes(b)); }
    const ativos = C.lista().filter((x) => x.situacao !== 'baixado');
    const vencidos = ativos.filter(C.vencido);
    return {
      titulo: 'Itens de controle',
      acoes: `<a class="botao" href="#planilhas/exportar">Exportar / importar</a> ${pode() ? '<button class="botao primario" data-novo-controle>+ Novo item</button>' : ''}`,
      html: `<p class="ajuda">Bens de pequeno valor (até ${u.moeda(VP.config().limiteControle)}) <b>e</b> de pouca durabilidade (até ${VP.config().limiteControleMeses} meses) — regra ajustável em Configurações. Se passar de um dos dois, é patrimônio com plaqueta. São controlados aqui, <b>sem plaqueta, sem depreciação e fora do balancete</b>.</p>
        <div class="resumo-linha">${G.numero('Itens em uso', u.inteiro(ativos.length))}${G.numero('Quantidade', u.inteiro(ativos.reduce((t, x) => t + (Number(x.quantidade) || 0), 0)))}${G.numero('Valor total (informativo)', u.moeda(ativos.reduce((t, x) => t + C.total(x), 0)))}${G.numero('Fim da vida útil', u.inteiro(vencidos.length), 'para avaliar troca')}</div>
        <div class="linha-filtros">
          <label>Unidade <select data-fc="unidadeId"><option value="">Todas</option>${opc('unidades').map(([id, n]) => `<option value="${esc(id)}" ${id === f.unidadeId ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <label>Situação <select data-fc="status"><option value="ativos" ${f.status === 'ativos' ? 'selected' : ''}>Em uso</option><option value="baixados" ${f.status === 'baixados' ? 'selected' : ''}>Com baixa</option><option value="todos" ${f.status === 'todos' ? 'selected' : ''}>Todos</option></select></label>
          <label>Buscar <input data-fc="busca" value="${esc(f.busca)}" placeholder="Código, nome, local"></label>
        </div>
        ${ui.tabela({ id: 'controle', linhas: l, porPagina: 50, nomePlanilha: 'itens-de-controle', vazio: 'Nenhum item de controle.', colunas: [
          { chave: 'codigo', titulo: 'Código', html: (x) => `<a href="#controle" data-ver-controle="${esc(x.id)}">${esc(x.codigo)}</a>`, valor: (x) => x.codigo },
          { chave: 'descricao', titulo: 'Descrição' },
          { chave: 'quantidade', titulo: 'Qtd.', num: true, soma: true },
          { chave: 'valorUnitario', titulo: 'Valor unit.', num: true, formato: u.moeda },
          { chave: 'total', titulo: 'Total', num: true, soma: true, valor: (x) => C.total(x), formato: u.moeda },
          { chave: 'unidade', titulo: 'Unidade', valor: (x) => VP.nome('unidades', x.unidadeId) },
          { chave: 'localizacao', titulo: 'Local' },
          { chave: 'responsavel', titulo: 'Responsável', valor: (x) => (x.responsavelId ? VP.nome('responsaveis', x.responsavelId) : ''), oculta: true },
          { chave: 'dataEntrada', titulo: 'Entrada', valor: (x) => u.data(x.dataEntrada), ordenar: (x) => x.dataEntrada },
          { chave: 'fim', titulo: 'Fim da vida útil', valor: (x) => u.data(C.fimVida(x)), ordenar: (x) => C.fimVida(x) || '9', html: (x) => (C.vencido(x) ? `<b class="erro-txt">${u.data(C.fimVida(x))}</b>` : esc(u.data(C.fimVida(x)))) },
          { chave: 'estado', titulo: 'Estado', valor: (x) => L.estados[x.estado] || '' },
          { chave: 'situacao', titulo: 'Situação', valor: (x) => (x.situacao === 'baixado' ? 'Com baixa' : 'Em uso') }] })}`,
      ligar() {
        const re = () => VP.app.render();
        ui.ligarTabela('controle');
        document.querySelector('[data-novo-controle]')?.addEventListener('click', () => C.novo(re));
        document.querySelectorAll('[data-fc]').forEach((el) => el.addEventListener(el.tagName === 'INPUT' ? 'change' : 'change', () => { f[el.dataset.fc] = el.value; re(); }));
        document.getElementById('conteudo').onclick = (e) => { const a = e.target.closest('[data-ver-controle]'); if (!a) return; e.preventDefault(); C.ficha(VP.db.pega('bensControle', a.dataset.verControle)); };
      }
    };
  };
})();
