/* VitalPat Cemitério · Gestão — etapa 2: vistorias (V1 a V5), triagem de possível abandono,
   ordens de serviço (limpeza, conserto, acidente) e registros recebidos do aplicativo de campo.
   Regra do DOSSIE.md B2: o sistema só aponta indícios; a situação do túmulo muda apenas por decisão de uma pessoa. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const E = VP.etapa2 = {};
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  E.seloSituacao = (t) => { const s = VP.situacaoAtual(t); return `<span class="selo-status s-${s}">${esc(L.situacoes[s])}</span>`; };
  E.seloOrdem = (o) => `<span class="selo-status os-${esc(o.situacao)}">${esc(L.situacoesOrdem[o.situacao] || o.situacao)}</span>`;
  E.notas = (v) => `<span class="notas-vistoria" title="Estrutura, limpeza, identificação, tampa">${VP.ITENS_NOTA.map((k) => esc(v[k])).join(' · ')} = <b>${VP.notaVistoria(v)}</b></span>`;
  const miniaturas = (fotos) => ((fotos || []).length ? `<span class="miniaturas">${fotos.filter((f) => f.dataURL).map((f) => `<a href="${esc(f.dataURL)}" target="_blank" rel="noopener"><img src="${esc(f.dataURL)}" alt="Foto"></a>`).join('')}</span>` : '—');

  // ===================================================================== VISTORIA (formulário da Gestão)
  const OPC_NOTA = [['0', '0 — sem problema'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4 — muito grave']];
  E.novaVistoria = (t, depois) => {
    const campos = [
      { chave: 'data', rotulo: 'Data da vistoria', tipo: 'data', obrigatorio: true, padrao: VP.Plataforma.hoje(), largura: 'meia' },
      ...VP.ITENS_NOTA.map((k) => ({ chave: k, rotulo: L.itensVistoria[k], tipo: 'select', opcoes: OPC_NOTA, obrigatorio: true, largura: 'meia' })),
      { chave: 'v5', rotulo: 'Há sinais de visita recente (flores, velas, limpeza)?', tipo: 'select', opcoes: [['sim', 'Sim'], ['nao', 'Não']], obrigatorio: true },
      { chave: 'observacao', rotulo: 'Observação', tipo: 'area' },
      { chave: 'fotos', rotulo: 'Fotos', tipo: 'arquivo', multiplo: true, aceita: 'image/*' }];
    ui.formulario({
      titulo: 'Vistoria — ' + VP.codigoTumulo(t), campos, largura: 'media',
      intro: '<p class="ajuda">Notas de 0 (sem problema) a 4 (muito grave). A vistoria só registra o que foi visto; nenhuma medida é tomada sobre o túmulo.</p>',
      salvar: async (x) => {
        if (x.data > VP.Plataforma.hoje()) return 'A data não pode ser no futuro.';
        const fotos = await ui.lerArquivos(x.fotos);
        const v = { id: u.id(), tumuloId: t.id, data: x.data, v1: x.v1, v2: x.v2, v3: x.v3, v4: x.v4, v5: x.v5, observacao: x.observacao, fotos, origem: 'gestao', usuario: usuario(), criadoEm: VP.Plataforma.agoraISO() };
        await VP.db.gravarVarias({ vistorias: [v], eventos: [VP.novoEvento(t.id, 'vistoria', { data: x.data, descricao: `Vistoria: notas ${VP.ITENS_NOTA.map((k) => v[k]).join(', ')} (soma ${VP.notaVistoria(v)}), visita recente: ${x.v5 === 'sim' ? 'sim' : 'não'}`, extra: { vistoriaId: v.id } })] });
        ui.aviso('Vistoria registrada.');
        if ((+v.v1 >= 3 || +v.v4 >= 3) && !VP.ordensDe(t.id).some(VP.ordemAberta)) {
          setTimeout(async () => { if (await ui.confirmar('Estrutura ou tampa com nota 3 ou 4 indica risco. Abrir uma ordem de serviço de conserto agora?', { titulo: 'Risco no túmulo', sim: 'Abrir ordem' })) E.novaOrdem(t, depois, { tipo: 'reparo', prioridade: 'urgente', descricao: 'Risco apontado na vistoria de ' + u.data(v.data) }); }, 50);
        }
        depois && depois();
      }
    });
  };

  // ===================================================================== SITUAÇÃO (decisão humana)
  E.mudarSituacao = (t, depois) => {
    const atual = VP.situacaoAtual(t);
    const pa = VP.processoAberto && VP.processoAberto(t.id);
    if (pa) return ui.aviso(`Este túmulo tem o processo ${pa.numero} aberto. A situação muda pela decisão do processo (menu Processos).`, 'erro');
    const sug = VP.sugestaoTriagem(t);
    const campos = [
      { chave: 'para', rotulo: 'Nova situação', tipo: 'select', opcoes: Object.entries(L.situacoes).filter(([k]) => k !== atual && k !== 'declarado'), obrigatorio: true },
      { chave: 'motivo', rotulo: 'Motivo da decisão', tipo: 'area', obrigatorio: true },
      { chave: 'processo', rotulo: 'Nº do processo administrativo', largura: 'meia', ajuda: 'Obrigatório para "Abandono em apuração" e "Abandono declarado".' },
      { chave: 'revisor', rotulo: 'Quem revisou (comissão ou servidor designado)', largura: 'meia', ajuda: 'Obrigatório para "Abandono em apuração".' },
      { chave: 'ato', rotulo: 'Nº do ato publicado', largura: 'meia', ajuda: 'Obrigatório para "Abandono declarado".' },
      { chave: 'dataAto', rotulo: 'Data da publicação', tipo: 'data', largura: 'meia' }];
    ui.formulario({
      titulo: 'Mudar situação — ' + VP.codigoTumulo(t), campos, largura: 'media',
      intro: `<p>Situação atual: ${E.seloSituacao(t)} · Sugestão do sistema: <b>${esc(L.situacoes[sug.nivel])}</b> <span class="sugestao">(${esc(sug.motivo)})</span></p>
        <p class="aviso-inline">Esta mudança só registra a decisão de uma pessoa. Nada é feito no túmulo pelo sistema. "Abandono em apuração" abre o processo administrativo e exige 2 vistorias em datas diferentes (com intervalo mínimo), pelo menos 1 indicador documental e a revisão de uma comissão ou servidor designado. "Abandono declarado" só sai pela decisão do processo.</p>`,
      salvar: async (x) => {
        if (x.para === 'apuracao') {
          const faltas = VP.requisitosApuracao(t);
          if (faltas.length) return 'Ainda não pode: ' + faltas.join(' ');
          if (!x.processo || !x.revisor) return 'Informe o nº do processo e quem revisou.';
          // Abandono em apuração = abre o processo administrativo (etapa 4)
          await VP.etapa4.abrir(t, x);
          ui.aviso(`Processo ${x.processo} aberto.`);
          depois && depois();
          return null;
        }
        if (x.para === 'declarado') return 'O abandono só é declarado pela decisão do processo administrativo.';
        const reg = { de: atual, para: x.para, data: VP.Plataforma.hoje(), motivo: x.motivo, processo: x.processo || '', revisor: x.revisor || '', ato: x.ato || '', dataAto: x.dataAto || '', usuario: usuario(), quando: VP.Plataforma.agoraISO() };
        t.situacao = x.para;
        t.situacaoHist = (t.situacaoHist || []).concat(reg);
        if (x.processo) t.processo = x.processo;
        await VP.db.gravarVarias({ tumulos: [t], eventos: [VP.novoEvento(t.id, 'situacao', { descricao: `${L.situacoes[atual]} → ${L.situacoes[x.para]}. Motivo: ${x.motivo}${x.processo ? ' · Processo ' + x.processo : ''}${x.ato ? ' · Ato ' + x.ato : ''}`, extra: reg })] });
        ui.aviso('Situação registrada.');
        depois && depois();
      }
    });
  };

  // ===================================================================== INDICADORES DOCUMENTAIS
  E.indicadores = (t, depois) => {
    const campos = Object.entries(L.indicadores).map(([k, n]) => ({ chave: k, rotulo: `${k} — ${n}`, tipo: 'bool' }))
      .concat([{ chave: 'excecaoHistorica', rotulo: 'Túmulo de valor histórico, artístico ou de personalidade (exceção: consultar o órgão de patrimônio cultural antes de qualquer medida)', tipo: 'bool' }]);
    const valores = Object.fromEntries(Object.keys(L.indicadores).map((k) => [k, (t.indicadores || []).includes(k)]));
    valores.excecaoHistorica = !!t.excecaoHistorica;
    ui.formulario({
      titulo: 'Indicadores documentais — ' + VP.codigoTumulo(t), campos, valores, largura: 'media',
      intro: '<p class="ajuda">Marque o que foi conferido em documento (DOSSIE.md B2-A). D1 também é marcado sozinho quando a concessão temporária cadastrada no túmulo está vencida.</p>',
      salvar: async (x) => {
        const antes = { indicadores: t.indicadores || [], excecaoHistorica: !!t.excecaoHistorica };
        t.indicadores = Object.keys(L.indicadores).filter((k) => x[k]);
        t.excecaoHistorica = !!x.excecaoHistorica;
        if (JSON.stringify(antes) === JSON.stringify({ indicadores: t.indicadores, excecaoHistorica: t.excecaoHistorica })) return null;
        await VP.db.gravarVarias({ tumulos: [t], eventos: [VP.novoEvento(t.id, 'indicador', { descricao: `Indicadores: ${t.indicadores.join(', ') || 'nenhum'}${t.excecaoHistorica ? ' · exceção histórica' : ''}`, extra: { antes } })] });
        ui.aviso('Indicadores salvos.');
        depois && depois();
      }
    });
  };

  // ===================================================================== ORDENS DE SERVIÇO
  E.novaOrdem = (t, depois, padrao = {}) => {
    const campos = [
      ...(t ? [] : [{ chave: 'codigo', rotulo: 'Código do túmulo (deixe vazio se for uma área do cemitério)', placeholder: 'Ex.: Q01-A1-6' }, { chave: 'local', rotulo: 'Local (se não for um túmulo)' }]),
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposOrdem), obrigatorio: true, largura: 'meia' },
      { chave: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: Object.entries(L.prioridades), vazio: false, largura: 'meia' },
      { chave: 'origem', rotulo: 'Quem pediu', tipo: 'select', opcoes: Object.entries(L.origensOrdem).filter(([k]) => k !== 'campo'), vazio: false, largura: 'meia' },
      { chave: 'solicitante', rotulo: 'Nome e contato de quem pediu', largura: 'meia', ajuda: 'Só quando for pedido da família ou aviso da população.' },
      { chave: 'descricao', rotulo: 'O que fazer', tipo: 'area', obrigatorio: true },
      { chave: 'prazo', rotulo: 'Prazo', tipo: 'data', largura: 'meia' },
      { chave: 'responsavel', rotulo: 'Equipe ou responsável', largura: 'meia' }];
    ui.formulario({
      titulo: 'Nova ordem de serviço' + (t ? ' — ' + VP.codigoTumulo(t) : ''), campos, largura: 'media',
      valores: Object.assign({ prioridade: 'normal', origem: 'funcionario', prazo: somaDias(VP.Plataforma.hoje(), VP.config().prazoOrdemDias) }, padrao),
      salvar: async (x) => {
        let alvo = t;
        if (!alvo && x.codigo) { alvo = VP.acharPorCodigo(x.codigo); if (!alvo) return 'Túmulo não encontrado com este código.'; }
        if (!alvo && !x.local) return 'Informe o código do túmulo ou o local.';
        const o = { id: u.id(), numero: VP.proximoNumeroOrdem(), tumuloId: alvo?.id || null, local: x.local || '', tipo: x.tipo, prioridade: x.prioridade, origem: x.origem, solicitante: x.solicitante || '', descricao: x.descricao, prazo: x.prazo || '', responsavel: x.responsavel || '', situacao: 'aberta', abertaEm: VP.Plataforma.hoje(), historico: [{ quando: VP.Plataforma.agoraISO(), acao: 'aberta', usuario: usuario() }], usuario: usuario(), criadoEm: VP.Plataforma.agoraISO() };
        const ev = alvo ? [VP.novoEvento(alvo.id, 'ordem', { descricao: `Ordem ${o.numero} aberta: ${L.tiposOrdem[o.tipo]} — ${o.descricao}`, extra: { ordemId: o.id } })] : [];
        await VP.db.gravarVarias({ ordensServico: [o], eventos: ev });
        ui.aviso(`Ordem ${o.numero} aberta.`);
        depois && depois();
      }
    });
  };
  // Mudança de andamento: iniciar, concluir (com foto) ou cancelar. Tudo fica no histórico da ordem.
  E.andamentoOrdem = (o, acao, depois) => {
    const nomes = { andamento: 'Iniciar', concluida: 'Concluir', cancelada: 'Cancelar', aberta: 'Reabrir' };
    const campos = [{ chave: 'nota', rotulo: acao === 'concluida' ? 'O que foi feito' : 'Observação', tipo: 'area', obrigatorio: acao !== 'andamento' }];
    if (acao === 'concluida') campos.push({ chave: 'fotos', rotulo: 'Fotos do serviço feito', tipo: 'arquivo', multiplo: true, aceita: 'image/*' });
    ui.formulario({
      titulo: `${nomes[acao]} ordem ${o.numero}`, campos, largura: 'pequena', textoSalvar: nomes[acao],
      salvar: async (x) => {
        const fotos = acao === 'concluida' ? await ui.lerArquivos(x.fotos) : [];
        await E.gravarAndamento(o, acao, x.nota || '', fotos);
        ui.aviso('Ordem atualizada.');
        depois && depois();
      }
    });
  };
  E.gravarAndamento = (o, acao, nota, fotos = [], extra = {}) => {
    const de = o.situacao;
    o.situacao = acao;
    if (acao === 'concluida') { o.concluidaEm = VP.Plataforma.hoje(); o.fotosConclusao = (o.fotosConclusao || []).concat(fotos); }
    if (acao === 'aberta') delete o.concluidaEm;
    o.historico = (o.historico || []).concat(Object.assign({ quando: VP.Plataforma.agoraISO(), acao: L.situacoesOrdem[acao], de, nota, usuario: usuario() }, extra));
    const ev = o.tumuloId ? [VP.novoEvento(o.tumuloId, 'ordem', { descricao: `Ordem ${o.numero}: ${L.situacoesOrdem[de]} → ${L.situacoesOrdem[acao]}${nota ? ' — ' + nota : ''}`, extra: { ordemId: o.id } })] : [];
    return VP.db.gravarVarias({ ordensServico: [o], eventos: ev });
  };
  E.verOrdem = (o, depois) => {
    const t = o.tumuloId ? VP.db.pega('tumulos', o.tumuloId) : null;
    const acoes = [];
    if (o.situacao === 'aberta') acoes.push(['andamento', 'Iniciar']);
    if (VP.ordemAberta(o)) acoes.push(['concluida', 'Concluir'], ['cancelada', 'Cancelar']);
    if (!VP.ordemAberta(o)) acoes.push(['aberta', 'Reabrir']);
    const m = ui.modal({
      titulo: `Ordem de serviço ${o.numero}`, largura: 'media',
      corpo: `<p>${E.seloOrdem(o)} ${VP.ordemAtrasada(o) ? '<span class="atrasada">Atrasada</span>' : ''}</p>
        <dl class="dados"><dt>Túmulo ou local</dt><dd>${t ? `<a href="#tumulo/${esc(t.id)}" data-fechar-ir>${esc(VP.codigoTumulo(t))}</a> · ${esc(VP.rotuloTumulo(t))}` : esc(o.local || '—')}</dd>
        <dt>Tipo</dt><dd>${esc(L.tiposOrdem[o.tipo])}</dd><dt>Prioridade</dt><dd>${esc(L.prioridades[o.prioridade] || '—')}</dd>
        <dt>Quem pediu</dt><dd>${esc(L.origensOrdem[o.origem] || '—')}${o.solicitante ? ' · ' + esc(o.solicitante) : ''}</dd>
        <dt>O que fazer</dt><dd>${esc(o.descricao)}</dd><dt>Aberta em</dt><dd>${u.data(o.abertaEm)}</dd><dt>Prazo</dt><dd>${u.data(o.prazo)}</dd>
        <dt>Responsável</dt><dd>${esc(o.responsavel || '—')}</dd>${o.concluidaEm ? `<dt>Concluída em</dt><dd>${u.data(o.concluidaEm)}</dd>` : ''}</dl>
        ${(o.fotos || []).length ? `<h4>Fotos do pedido</h4>${miniaturas(o.fotos)}` : ''}
        ${(o.fotosConclusao || []).length ? `<h4>Fotos do serviço feito</h4>${miniaturas(o.fotosConclusao)}` : ''}
        <h4>Histórico</h4><ol class="lista-simples">${(o.historico || []).map((h) => `<li>${u.data(String(h.quando).slice(0, 10))} — <b>${esc(h.acao)}</b>${h.nota ? ': ' + esc(h.nota) : ''} <small>(${esc(h.usuario || '')})</small></li>`).join('')}</ol>`,
      botoes: acoes.map(([a, n]) => ({ texto: n, classe: a === 'concluida' ? 'primario' : a === 'cancelada' ? 'perigo' : '', acao: () => { E.andamentoOrdem(o, a, depois); } }))
        .concat([{ texto: 'Excluir', classe: 'perigo', acao: async () => {
          if (!await ui.confirmar(`Mover a ordem ${esc(o.numero)} para a Lixeira? Use só para ordem aberta por engano.`, { sim: 'Mover para a Lixeira', classe: 'perigo' })) return;
          o.excluido = true; o.excluidoEm = VP.Plataforma.agoraISO();
          await VP.db.gravar('ordensServico', o); ui.aviso('Na Lixeira.'); depois && depois();
        } }, { texto: 'Fechar' }])
    });
    m.el.querySelector('[data-fechar-ir]')?.addEventListener('click', () => m.fechar());
  };

  T.ordens = (_, query) => {
    const v = VP.estado.filtrosOrdens = VP.estado.filtrosOrdens || { situacao: 'aberta' };
    if (Object.keys(query).length) { for (const k of Object.keys(v)) delete v[k]; Object.assign(v, Object.fromEntries(Object.entries(query).map(([k, x]) => [k, x === '1' ? true : x]))); }
    const defs = [
      { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: [['aberta', 'Aberta ou em andamento']].concat(Object.entries(L.situacoesOrdem).filter(([k]) => k !== 'aberta')) },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposOrdem) },
      { chave: 'origem', rotulo: 'Quem pediu', tipo: 'select', opcoes: Object.entries(L.origensOrdem) },
      { chave: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: Object.entries(L.prioridades) },
      { chave: 'atrasadas', rotulo: 'Atrasadas', tipo: 'bool' }];
    const filtrar = () => {
      const f = ui.limparValores(v);
      let l = VP.db.lista('ordensServico');
      if (f.situacao === 'aberta') l = l.filter(VP.ordemAberta); else if (f.situacao) l = l.filter((o) => o.situacao === f.situacao);
      for (const k of ['tipo', 'origem', 'prioridade']) if (f[k]) l = l.filter((o) => o[k] === f[k]);
      if (f.atrasadas) l = l.filter(VP.ordemAtrasada);
      if (f.busca) { const b = u.normalizar(f.busca); l = l.filter((o) => u.normalizar([o.numero, o.descricao, o.local, o.responsavel, o.solicitante, o.tumuloId ? VP.codigoTumulo(VP.db.pega('tumulos', o.tumuloId) || {}) : ''].join(' ')).includes(b)); }
      return l.sort((a, b) => ({ urgente: 0, alta: 1, normal: 2 }[a.prioridade] ?? 3) - ({ urgente: 0, alta: 1, normal: 2 }[b.prioridade] ?? 3) || String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
    };
    const tumOrdem = (o) => (o.tumuloId ? VP.db.pega('tumulos', o.tumuloId) : null);
    const colunas = [
      { chave: 'numero', titulo: 'Nº' },
      { chave: 'tumulo', titulo: 'Túmulo ou local', html: (o) => { const t = tumOrdem(o); return t ? `<a href="#tumulo/${esc(t.id)}">${esc(VP.codigoTumulo(t))}</a>` : esc(o.local); }, valor: (o) => { const t = tumOrdem(o); return t ? VP.codigoTumulo(t) : o.local; } },
      { chave: 'tipo', titulo: 'Tipo', valor: (o) => L.tiposOrdem[o.tipo] },
      { chave: 'origem', titulo: 'Quem pediu', valor: (o) => L.origensOrdem[o.origem] },
      { chave: 'prioridade', titulo: 'Prioridade', valor: (o) => L.prioridades[o.prioridade] },
      { chave: 'descricao', titulo: 'O que fazer' },
      { chave: 'situacao', titulo: 'Situação', html: E.seloOrdem, valor: (o) => L.situacoesOrdem[o.situacao] },
      { chave: 'abertaEm', titulo: 'Aberta em', valor: (o) => u.data(o.abertaEm), ordenar: (o) => o.abertaEm },
      { chave: 'prazo', titulo: 'Prazo', html: (o) => `<span class="${VP.ordemAtrasada(o) ? 'atrasada' : ''}">${u.data(o.prazo)}</span>`, valor: (o) => u.data(o.prazo), ordenar: (o) => o.prazo || '9' },
      { chave: 'responsavel', titulo: 'Responsável' },
      { chave: 'solicitante', titulo: 'Contato de quem pediu', oculta: true }];
    const desenhar = () => {
      const l = filtrar();
      const todas = VP.db.lista('ordensServico');
      return `<div class="resumo-linha">${G.numero('Abertas ou em andamento', u.inteiro(todas.filter(VP.ordemAberta).length))}${G.numero('Atrasadas', u.inteiro(todas.filter(VP.ordemAtrasada).length), '', '#ordens?situacao=aberta&atrasadas=1')}${G.numero('Pedidos da família ou população em aberto', u.inteiro(todas.filter((o) => VP.ordemAberta(o) && (o.origem === 'familia' || o.origem === 'populacao')).length))}${G.numero('Concluídas', u.inteiro(todas.filter((o) => o.situacao === 'concluida').length))}</div>
        <div class="linha-filtros">${ui.filtros({ id: 'os', defs, valores: v, placeholder: 'Buscar por nº, túmulo, descrição, responsável…', aoMudar: (_x, o) => atualizar(o) })}</div>
        ${ui.tabela({ id: 'ordens', colunas, linhas: l, porPagina: 50, nomePlanilha: 'ordens-de-servico', vazio: 'Nenhuma ordem de serviço neste filtro.', aoClicar: (o) => E.verOrdem(o, () => VP.app.render()) })}`;
    };
    const atualizar = (o) => {
      const a = document.getElementById('area-os'); if (!a) return;
      a.innerHTML = desenhar(); ui.ligarTabela('ordens');
      if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    };
    return {
      titulo: 'Ordens de serviço',
      acoes: '<button class="botao" data-imprimir-os>Imprimir lista</button> <button class="botao primario" data-nova-os>+ Nova ordem</button>',
      html: `<p class="ajuda">Limpeza, conserto, acidentes e pedidos da família ou da população. Os pedidos chegam pelo atendimento (aqui) e, no futuro, pelo portal do titular e pelo protocolo da prefeitura.</p><div id="area-os">${desenhar()}</div>`,
      ligar() {
        ui.ligarTabela('ordens');
        document.querySelector('[data-nova-os]').addEventListener('click', () => E.novaOrdem(null, () => VP.app.render()));
        document.querySelector('[data-imprimir-os]').addEventListener('click', () => {
          const l = filtrar();
          ui.imprimir(`<h2>Ordens de serviço (${l.length})</h2><table class="tabela"><thead><tr><th>Nº</th><th>Túmulo ou local</th><th>Tipo</th><th>Prioridade</th><th>O que fazer</th><th>Prazo</th><th>Responsável</th><th>Feito (assinatura)</th></tr></thead><tbody>${l.map((o) => { const t = tumOrdem(o); return `<tr><td>${esc(o.numero)}</td><td>${t ? esc(VP.codigoTumulo(t) + ' · ' + VP.rotuloTumulo(t)) : esc(o.local)}</td><td>${esc(L.tiposOrdem[o.tipo])}</td><td>${esc(L.prioridades[o.prioridade])}</td><td>${esc(o.descricao)}</td><td>${u.data(o.prazo)}</td><td>${esc(o.responsavel)}</td><td></td></tr>`; }).join('')}</tbody></table>`, 'Ordens de serviço');
        });
      }
    };
  };

  // ===================================================================== FICHA DO TÚMULO: seção da etapa 2
  E.secaoFicha = (t) => {
    const vs = VP.vistoriasDe(t.id);
    const os = VP.ordensDe(t.id);
    const sug = VP.sugestaoTriagem(t);
    const sit = VP.situacaoAtual(t);
    const faltas = sit === 'indicio' ? VP.requisitosApuracao(t) : null;
    return `<section class="cartao secao"><header><h3>Situação e vistorias</h3>${E.seloSituacao(t)}</header>
        <p class="sugestao">Sugestão do sistema: <b>${esc(L.situacoes[sug.nivel])}</b> (${esc(sug.motivo)}). ${VP.sugestaoDiferente(t) ? '<b>Diferente da situação gravada — confira.</b>' : ''}</p>
        ${t.excecaoHistorica ? '<p class="aviso-inline">Marcado como túmulo de valor histórico, artístico ou de personalidade.</p>' : ''}
        <p>Indicadores documentais: ${VP.indicadoresDe(t).length ? VP.indicadoresDe(t).map((k) => `<span class="selo-status" title="${esc(L.indicadores[k])}">${esc(k)}</span>`).join(' ') : 'nenhum'}</p>
        ${VP.etapa4.secaoFicha(t)}
        ${faltas ? (faltas.length ? `<p class="ajuda">Para passar a "Abandono em apuração" ainda falta:</p><ul class="requisitos">${faltas.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="ajuda">Requisitos para "Abandono em apuração" atendidos. A decisão continua sendo de uma pessoa.</p>') : ''}
        <div class="linha-botoes"><button class="botao" data-e2="vistoria">Nova vistoria</button><button class="botao" data-e2="situacao">Mudar situação</button><button class="botao" data-e2="indicadores">Indicadores documentais</button><button class="botao" data-e2="ordem">Nova ordem de serviço</button></div>
        <h4>Vistorias (${vs.length})</h4>
        ${vs.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Data</th><th>Notas (estrutura · limpeza · identificação · tampa)</th><th>Visita recente</th><th>Origem</th><th>Fotos</th></tr></thead><tbody>${vs.map((v) => `<tr><td>${u.data(v.data)}</td><td>${E.notas(v)}</td><td>${v.v5 === 'sim' ? 'Sim' : 'Não'}</td><td>${v.origem === 'campo' ? 'Aplicativo de campo' : 'Gestão'}${v.observacao ? `<br><small>${esc(v.observacao)}</small>` : ''}</td><td>${miniaturas(v.fotos)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhuma vistoria.</p>'}
        <h4>Ordens de serviço (${os.length})</h4>
        ${os.length ? `<ul class="lista-simples">${os.map((o) => `<li><button class="botao pequeno" data-ver-os="${esc(o.id)}">${esc(o.numero)}</button> ${esc(L.tiposOrdem[o.tipo])} — ${esc(o.descricao)} ${E.seloOrdem(o)} ${VP.ordemAtrasada(o) ? '<span class="atrasada">Atrasada</span>' : ''}</li>`).join('')}</ul>` : '<p class="vazio">Nenhuma.</p>'}
        ${(t.situacaoHist || []).length ? `<h4>Decisões sobre a situação</h4><ol class="lista-simples">${t.situacaoHist.map((h) => `<li>${u.data(h.data)} — ${esc(L.situacoes[h.de])} → <b>${esc(L.situacoes[h.para])}</b>: ${esc(h.motivo)}${h.processo ? ' · Processo ' + esc(h.processo) : ''}${h.revisor ? ' · Revisão: ' + esc(h.revisor) : ''}${h.ato ? ` · Ato ${esc(h.ato)} de ${u.data(h.dataAto)}` : ''} <small>(${esc(h.usuario)})</small></li>`).join('')}</ol>` : ''}
      </section>`;
  };
  E.ligarFicha = (t, recarrega) => {
    document.querySelectorAll('[data-e2]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.e2;
      if (a === 'vistoria') return E.novaVistoria(t, recarrega);
      if (a === 'situacao') return E.mudarSituacao(t, recarrega);
      if (a === 'indicadores') return E.indicadores(t, recarrega);
      if (a === 'ordem') return E.novaOrdem(t, recarrega);
    }));
    document.querySelectorAll('[data-ver-os]').forEach((b) => b.addEventListener('click', () => E.verOrdem(VP.db.pega('ordensServico', b.dataset.verOs), recarrega)));
  };

  // ===================================================================== TRIAGEM (revisão em lote, na mesma grade)
  T.triagem = () => {
    const v = VP.estado.filtrosTriagem = VP.estado.filtrosTriagem || { difere: true };
    const defs = [
      { chave: 'difere', rotulo: 'Só onde a sugestão difere da situação gravada', tipo: 'bool' },
      { chave: 'situacao', rotulo: 'Situação gravada', tipo: 'select', opcoes: Object.entries(L.situacoes) },
      { chave: 'sugestao', rotulo: 'Sugestão do sistema', tipo: 'select', opcoes: Object.entries(L.situacoes).slice(0, 3) },
      { chave: 'quadraId', rotulo: 'Quadra', tipo: 'select', opcoes: VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem).map((q) => [q.id, q.nome]) },
      { chave: 'risco', rotulo: 'Com risco (estrutura ou tampa 3 ou 4)', tipo: 'bool' },
      { chave: 'comIndicador', rotulo: 'Com indicador documental', tipo: 'bool' }];
    const filtrar = () => {
      const f = ui.limparValores(v);
      let l = VP.filtrarTumulos({ quadraId: f.quadraId, situacao: f.situacao, sugestao: f.sugestao, risco: f.risco, busca: f.busca });
      if (f.difere) l = l.filter(VP.sugestaoDiferente);
      if (f.comIndicador) l = l.filter((t) => VP.indicadoresDe(t).length);
      return l;
    };
    const colunas = [
      { chave: 'codigo', titulo: 'Código', html: (t) => `<a href="#tumulo/${esc(t.id)}">${esc(VP.codigoTumulo(t))}</a>`, valor: (t) => VP.codigoTumulo(t) },
      { chave: 'local', titulo: 'Quadra · aléia · nº', valor: VP.rotuloTumulo },
      { chave: 'situacao', titulo: 'Situação gravada', html: E.seloSituacao, valor: (t) => L.situacoes[VP.situacaoAtual(t)] },
      { chave: 'sugestao', titulo: 'Sugestão do sistema', html: (t) => { const s = VP.sugestaoTriagem(t); return `<span class="selo-status s-${s.nivel}">${esc(L.situacoes[s.nivel])}</span> <small>${esc(s.motivo)}</small>`; }, valor: (t) => L.situacoes[VP.sugestaoTriagem(t).nivel] },
      { chave: 'nv', titulo: 'Vistorias', num: true, valor: (t) => VP.vistoriasDe(t.id).length },
      { chave: 'ultima', titulo: 'Última vistoria', valor: (t) => u.data(VP.vistoriasDe(t.id)[0]?.data), ordenar: (t) => VP.vistoriasDe(t.id)[0]?.data || '' },
      { chave: 'ind', titulo: 'Indicadores', valor: (t) => VP.indicadoresDe(t).join(', ') },
      { chave: 'risco', titulo: 'Risco', valor: (t) => (VP.temRisco(t) ? 'Sim' : '') }];
    const desenhar = () => {
      const l = filtrar();
      const tum = VP.db.lista('tumulos');
      const cont = (k) => tum.filter((t) => VP.situacaoAtual(t) === k).length;
      return `<div class="resumo-linha">${Object.entries(L.situacoes).map(([k, n]) => G.numero(n, u.inteiro(cont(k)), '', '#tumulos?situacao=' + k)).join('')}</div>
        <div class="linha-filtros">${ui.filtros({ id: 'tri', defs, valores: v, placeholder: 'Buscar por código, quadra, aléia, número…', aoMudar: (_x, o) => atualizar(o) })}</div>
        <div id="barra-tri" class="barra-lote" hidden></div>
        ${ui.tabela({ id: 'triagem', colunas, linhas: l, selecao: true, porPagina: 100, nomePlanilha: 'triagem-abandono', vazio: 'Nenhum túmulo neste filtro.' })}`;
    };
    const atualizar = (o) => {
      const a = document.getElementById('area-tri'); if (!a) return;
      a.innerHTML = desenhar(); ligar();
      if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    };
    const barra = (sel) => {
      const el = document.getElementById('barra-tri');
      el.hidden = !sel.size;
      if (!sel.size) return;
      el.innerHTML = `<b>${u.inteiro(sel.size)} marcado(s):</b> <button class="botao pequeno primario" data-aceitar>Aceitar a sugestão do sistema</button>`;
      el.querySelector('[data-aceitar]').addEventListener('click', () => aceitar([...sel].map((id) => VP.db.pega('tumulos', id)), () => { sel.clear(); atualizar(); }));
    };
    const aceitar = async (tumulos, depois) => {
      if (!await ui.confirmar(`Gravar a situação sugerida pelo sistema em <b>${tumulos.length}</b> túmulo(s)? Você está decidindo por eles; fica registrado no histórico de cada um com o seu nome. "Abandono em apuração" e "Abandono declarado" nunca são feitos em lote.`, { titulo: 'Aceitar sugestão', sim: 'Aceitar' })) return;
      const ok = [], falhas = [], gravar = [], eventos = [];
      for (const t of tumulos) {
        const atual = VP.situacaoAtual(t);
        const s = VP.sugestaoTriagem(t);
        if (atual === 'apuracao' || atual === 'declarado') { falhas.push({ item: VP.rotuloTumulo(t), motivo: 'Já está em processo; mude pela ficha do túmulo.' }); continue; }
        if (s.nivel === atual) { falhas.push({ item: VP.rotuloTumulo(t), motivo: 'Já está na situação sugerida.' }); continue; }
        const reg = { de: atual, para: s.nivel, data: VP.Plataforma.hoje(), motivo: 'Sugestão da triagem aceita: ' + s.motivo, processo: '', revisor: '', ato: '', dataAto: '', usuario: usuario(), quando: VP.Plataforma.agoraISO(), lote: true };
        t.situacao = s.nivel; t.situacaoHist = (t.situacaoHist || []).concat(reg);
        gravar.push(t);
        eventos.push(VP.novoEvento(t.id, 'situacao', { descricao: `${L.situacoes[atual]} → ${L.situacoes[s.nivel]} (sugestão aceita: ${s.motivo})`, extra: reg }));
        ok.push(`${VP.rotuloTumulo(t)}: ${L.situacoes[atual]} → ${L.situacoes[s.nivel]}`);
      }
      if (gravar.length) await VP.db.gravarVarias({ tumulos: gravar, eventos });
      ui.resultado({ titulo: 'Triagem: sugestões aceitas', sucesso: ok, falhas });
      depois();
    };
    const ligar = () => { ui.ligarTabela('triagem', barra); barra(ui.tabelas.triagem.selecionados); };
    const cfg = VP.config();
    return {
      titulo: 'Triagem de possível abandono',
      acoes: '<a class="botao" href="#relatorio/triagem">Relatório por quadra</a>',
      html: `<section class="cartao"><p><b>Como o sistema sugere</b> (a partir da última vistoria): soma das notas de estrutura, limpeza, identificação e tampa (0 a 16). A partir de <b>${cfg.notaAtencao}</b> (ou um item com nota 3 ou 4) sugere <b>Atenção</b>; a partir de <b>${cfg.notaIndicio}</b> e <b>sem sinais de visita</b> sugere <b>Indício de abandono</b>. Sinais de visita sempre reduzem para Atenção. Os limites ficam em Configurações.</p>
        <p class="ajuda">A sugestão nunca muda o túmulo sozinha: marque na lista e aceite, ou decida na ficha. "Abandono em apuração" só pela ficha, com 2 vistorias com pelo menos ${cfg.intervaloVistoriasDias} dias entre elas, 1 indicador documental e revisão da comissão ou servidor designado.</p></section>
        <div id="area-tri">${desenhar()}</div>`,
      ligar
    };
  };
  E.relatorioTriagem = () => {
    const quadras = VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem);
    const linhas = quadras.map((q) => {
      const l = VP.db.lista('tumulos').filter((t) => t.quadraId === q.id);
      const x = { id: q.id, quadra: q.nome, total: l.length, vistoriados: l.filter((t) => VP.vistoriasDe(t.id).length).length, risco: l.filter(VP.temRisco).length };
      for (const k of Object.keys(L.situacoes)) x[k] = l.filter((t) => VP.situacaoAtual(t) === k).length;
      return x;
    }).filter((x) => x.total);
    const tot = (k) => linhas.reduce((s, x) => s + x[k], 0);
    return {
      titulo: 'Triagem de abandono por quadra',
      acoes: '<a class="botao" href="#relatorios">‹ Relatórios</a> <button class="botao primario" data-imprimir>Imprimir / PDF</button>',
      html: `<div id="corpo-relatorio">
        <div class="resumo-linha">${G.numero('Túmulos vistoriados', u.inteiro(tot('vistoriados')), u.pct(tot('total') ? tot('vistoriados') / tot('total') : 0))}${G.numero('Atenção', u.inteiro(tot('atencao')))}${G.numero('Indício de abandono', u.inteiro(tot('indicio')))}${G.numero('Em apuração', u.inteiro(tot('apuracao')))}${G.numero('Declarados', u.inteiro(tot('declarado')))}${G.numero('Com risco', u.inteiro(tot('risco')))}</div>
        <div class="grade-graficos"><section class="cartao"><h3>Indício, apuração e declarados por quadra</h3>${G.barrasH(linhas.map((x) => ({ rotulo: x.quadra, valor: x.indicio + x.apuracao + x.declarado, link: '#triagem' })).sort((a, b) => b.valor - a.valor))}</section>
        <section class="cartao"><h3>Vistoriados por quadra</h3>${G.empilhadas(linhas.map((x) => ({ rotulo: x.quadra, a: x.vistoriados, b: x.total - x.vistoriados })), ['Vistoriados', 'Falta vistoriar'])}</section></div>
        ${ui.tabela({ id: 'rel-tri', linhas, nomePlanilha: 'triagem-por-quadra', colunas: [{ chave: 'quadra', titulo: 'Quadra' }, { chave: 'total', titulo: 'Túmulos', num: true, soma: true }, { chave: 'vistoriados', titulo: 'Vistoriados', num: true, soma: true }].concat(Object.entries(L.situacoes).map(([k, n]) => ({ chave: k, titulo: n, num: true, soma: true }))).concat([{ chave: 'risco', titulo: 'Com risco', num: true, soma: true }]) })}
        <p class="ajuda">Situação gravada por decisão de uma pessoa. Nenhum túmulo muda de situação sozinho.</p></div>`,
      ligar() {
        ui.ligarTabela('rel-tri');
        document.querySelector('[data-imprimir]').addEventListener('click', () => { const c = document.getElementById('corpo-relatorio').cloneNode(true); c.querySelectorAll('.tabela-barra,.paginacao').forEach((x) => x.remove()); ui.imprimir(c.innerHTML, 'Triagem de abandono por quadra'); });
      }
    };
  };

  // ===================================================================== VISTORIAS e REGISTROS DO APLICATIVO
  // Registro do app → vistoria/ordem só depois que uma pessoa confere o túmulo (nunca automático) e pode ser desfeito.
  const TIPOS_REG = { tumulo: 'Vistoria de túmulo', ocorrencia: 'Aviso de problema', conclusaoOS: 'Ordem de serviço feita' };
  const fotosDoRegistro = (r) => (r.fotos || []).map((f, i) => (typeof f === 'string' ? { id: `${r.id}-${i + 1}`, dataURL: f, tipo: 'image/jpeg', data: String(r.criadoEm).slice(0, 10) } : Object.assign({ id: `${r.id}-${i + 1}`, data: String(r.criadoEm).slice(0, 10) }, f)));
  const resumoRegistro = (r) => {
    const d = r.dados || {};
    if (r.tipo === 'tumulo') return `Notas ${d.estrutura} · ${d.limpeza} · ${d.identificacao} · ${d.tampa} · visita recente: ${d.sinaisDeVisita}${d.observacao ? ' · ' + d.observacao : ''}`;
    if (r.tipo === 'ocorrencia') return `${L.tiposOrdem[d.tipoOrdem] || d.tipoOrdem || ''}: ${d.descricao || ''}`;
    if (r.tipo === 'conclusaoOS') return `Ordem ${d.numeroOrdem || ''}: ${d.nota || ''}`;
    return '';
  };
  const vincular = async (r, codigo) => {
    const d = r.dados || {};
    const quando = String(r.criadoEm || VP.Plataforma.agoraISO());
    const marca = { conferido: true, conferidoEm: VP.Plataforma.agoraISO(), conferidoPor: usuario() };
    if (r.tipo === 'conclusaoOS') {
      // Só pela identificação da ordem: o número sozinho pode coincidir com outra ordem
      const o = VP.db.pega('ordensServico', d.ordemId);
      if (!o || o.excluido) throw new Error('Ordem de serviço não encontrada');
      if (!VP.ordemAberta(o)) throw new Error(`A ordem ${o.numero} já está ${L.situacoesOrdem[o.situacao].toLowerCase()}`);
      await E.gravarAndamento(o, 'concluida', d.nota || 'Concluída no aplicativo de campo', fotosDoRegistro(r), { registroCampoId: r.id });
      Object.assign(r, marca, { vinculo: { colecao: 'ordensServico', id: o.id, acao: 'concluida' } });
      await VP.db.gravar('registrosCampo', r);
      return `Ordem ${o.numero} concluída`;
    }
    const t = VP.acharPorCodigo(codigo);
    if (!t) throw new Error('Túmulo não encontrado com o código ' + (codigo || '(vazio)'));
    if (r.tipo === 'tumulo') {
      const sim = (x) => (/^s/i.test(String(x)) ? 'sim' : 'nao');
      const v = { id: 'vc-' + r.id, tumuloId: t.id, data: quando.slice(0, 10), v1: String(d.estrutura), v2: String(d.limpeza), v3: String(d.identificacao), v4: String(d.tampa), v5: sim(d.sinaisDeVisita), observacao: d.observacao || '', fotos: fotosDoRegistro(r), gps: r.gps || null, origem: 'campo', registroCampoId: r.id, usuario: r.usuario || 'aplicativo de campo', conferidoPor: usuario(), criadoEm: VP.Plataforma.agoraISO() };
      Object.assign(r, marca, { vinculo: { colecao: 'vistorias', id: v.id, tumuloId: t.id } });
      await VP.db.gravarVarias({ vistorias: [v], registrosCampo: [r], eventos: [VP.novoEvento(t.id, 'vistoria', { data: v.data, descricao: `Vistoria do aplicativo de campo conferida: notas ${VP.ITENS_NOTA.map((k) => v[k]).join(', ')} (soma ${VP.notaVistoria(v)})`, extra: { vistoriaId: v.id, registroCampoId: r.id } })] });
      return `${VP.codigoTumulo(t)}: vistoria de ${u.data(v.data)}`;
    }
    if (r.tipo === 'ocorrencia') {
      const o = { id: 'oc-' + r.id, numero: VP.proximoNumeroOrdem(), tumuloId: t.id, local: '', tipo: d.tipoOrdem || 'outro', prioridade: d.tipoOrdem === 'acidente' ? 'urgente' : 'normal', origem: 'campo', solicitante: '', descricao: d.descricao || '', prazo: somaDias(VP.Plataforma.hoje(), VP.config().prazoOrdemDias), responsavel: '', situacao: 'aberta', abertaEm: VP.Plataforma.hoje(), fotos: fotosDoRegistro(r), historico: [{ quando: VP.Plataforma.agoraISO(), acao: 'aberta (aviso do aplicativo de campo)', usuario: usuario() }], registroCampoId: r.id, usuario: usuario(), criadoEm: VP.Plataforma.agoraISO() };
      Object.assign(r, marca, { vinculo: { colecao: 'ordensServico', id: o.id, tumuloId: t.id, acao: 'criada' } });
      await VP.db.gravarVarias({ ordensServico: [o], registrosCampo: [r], eventos: [VP.novoEvento(t.id, 'ordem', { descricao: `Ordem ${o.numero} aberta pelo aviso do aplicativo de campo: ${o.descricao}`, extra: { ordemId: o.id, registroCampoId: r.id } })] });
      return `${VP.codigoTumulo(t)}: ordem ${o.numero} aberta`;
    }
    throw new Error('Tipo de registro desconhecido');
  };
  const desfazerVinculo = async (r) => {
    const vc = r.vinculo || {};
    const alvo = VP.db.pega(vc.colecao, vc.id);
    const docs = { registrosCampo: [r], eventos: [] };
    if (alvo && vc.acao === 'concluida') {
      await E.gravarAndamento(alvo, 'andamento', 'Conclusão do aplicativo desfeita na conferência');
    } else if (alvo) {
      alvo.excluido = true; alvo.excluidoEm = VP.Plataforma.agoraISO();
      docs[vc.colecao] = [alvo];
      if (vc.tumuloId) docs.eventos.push(VP.novoEvento(vc.tumuloId, 'alteracao', { descricao: 'Vínculo com registro do aplicativo desfeito (foi para a Lixeira)', extra: { registroCampoId: r.id } }));
    }
    r.conferido = false; r.vinculoDesfeito = (r.vinculoDesfeito || []).concat(Object.assign({ quando: VP.Plataforma.agoraISO(), usuario: usuario() }, vc));
    delete r.vinculo; delete r.descartado;
    await VP.db.gravarVarias(docs);
  };

  T.vistorias = (aba = 'todas') => {
    const abas = `<nav class="abas"><a href="#vistorias" class="${aba !== 'recebidos' ? 'ativa' : ''}">Vistorias</a><a href="#vistorias/recebidos" class="${aba === 'recebidos' ? 'ativa' : ''}">Recebidos do aplicativo (${VP.registrosParaConferir().length})</a></nav>`;
    if (aba === 'recebidos') return recebidos(abas);
    const v = VP.estado.filtrosVistorias = VP.estado.filtrosVistorias || {};
    const defs = [
      { chave: 'origem', rotulo: 'Origem', tipo: 'select', opcoes: [['gestao', 'Gestão'], ['campo', 'Aplicativo de campo']] },
      { chave: 'quadraId', rotulo: 'Quadra', tipo: 'select', opcoes: VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem).map((q) => [q.id, q.nome]) },
      { chave: 'de', rotulo: 'Desde', tipo: 'data' }, { chave: 'ate', rotulo: 'Até', tipo: 'data' },
      { chave: 'semVisita', rotulo: 'Sem sinais de visita', tipo: 'bool' }];
    const tum = (x) => VP.db.pega('tumulos', x.tumuloId);
    const filtrar = () => {
      const f = ui.limparValores(v);
      let l = VP.db.lista('vistorias').filter((x) => tum(x) && !tum(x).excluido);
      if (f.origem) l = l.filter((x) => (x.origem === 'campo' ? 'campo' : 'gestao') === f.origem);
      if (f.quadraId) l = l.filter((x) => tum(x).quadraId === f.quadraId);
      if (f.de) l = l.filter((x) => x.data >= f.de);
      if (f.ate) l = l.filter((x) => x.data <= f.ate);
      if (f.semVisita) l = l.filter((x) => x.v5 !== 'sim');
      if (f.busca) { const b = u.normalizar(f.busca); l = l.filter((x) => u.normalizar(VP.codigoTumulo(tum(x)) + ' ' + VP.rotuloTumulo(tum(x)) + ' ' + (x.observacao || '')).includes(b)); }
      return l.sort((a, b) => b.data.localeCompare(a.data));
    };
    const colunas = [
      { chave: 'data', titulo: 'Data', valor: (x) => u.data(x.data), ordenar: (x) => x.data },
      { chave: 'codigo', titulo: 'Túmulo', html: (x) => `<a href="#tumulo/${esc(x.tumuloId)}">${esc(VP.codigoTumulo(tum(x)))}</a>`, valor: (x) => VP.codigoTumulo(tum(x)) },
      { chave: 'local', titulo: 'Quadra · aléia · nº', valor: (x) => VP.rotuloTumulo(tum(x)) },
      { chave: 'v1', titulo: 'Estrutura', num: true }, { chave: 'v2', titulo: 'Limpeza', num: true }, { chave: 'v3', titulo: 'Identificação', num: true }, { chave: 'v4', titulo: 'Tampa', num: true },
      { chave: 'soma', titulo: 'Soma', num: true, valor: VP.notaVistoria },
      { chave: 'v5', titulo: 'Visita recente', valor: (x) => (x.v5 === 'sim' ? 'Sim' : 'Não') },
      { chave: 'origem', titulo: 'Origem', valor: (x) => (x.origem === 'campo' ? 'Aplicativo de campo' : 'Gestão') },
      { chave: 'fotos', titulo: 'Fotos', num: true, valor: (x) => (x.fotos || []).length },
      { chave: 'observacao', titulo: 'Observação', oculta: true }, { chave: 'usuario', titulo: 'Quem registrou', oculta: true }];
    const desenhar = () => {
      const l = filtrar();
      const todas = VP.db.lista('vistorias');
      const vistoriados = new Set(todas.map((x) => x.tumuloId)).size;
      const total = VP.db.lista('tumulos').length;
      return `<div class="resumo-linha">${G.numero('Vistorias', u.inteiro(todas.length))}${G.numero('Túmulos vistoriados', u.inteiro(vistoriados), u.pct(total ? vistoriados / total : 0))}${G.numero('Com risco', u.inteiro(VP.db.lista('tumulos').filter(VP.temRisco).length), '', '#tumulos?risco=1')}${G.numero('Recebidos para conferir', u.inteiro(VP.registrosParaConferir().length), '', '#vistorias/recebidos')}</div>
        <div class="linha-filtros">${ui.filtros({ id: 'vis', defs, valores: v, placeholder: 'Buscar por código, quadra, observação…', aoMudar: (_x, o) => atualizar(o) })}</div>
        ${ui.tabela({ id: 'vistorias', colunas, linhas: l, porPagina: 100, nomePlanilha: 'vistorias', vazio: 'Nenhuma vistoria neste filtro.', aoClicar: (x) => VP.app.ir('#tumulo/' + x.tumuloId) })}`;
    };
    const atualizar = (o) => {
      const a = document.getElementById('area-vis'); if (!a) return;
      a.innerHTML = desenhar(); ui.ligarTabela('vistorias');
      if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    };
    return {
      titulo: 'Vistorias',
      acoes: '<button class="botao primario" data-nova-vis>+ Nova vistoria</button>',
      html: `${abas}<div id="area-vis">${desenhar()}</div>`,
      ligar() {
        ui.ligarTabela('vistorias');
        document.querySelector('[data-nova-vis]').addEventListener('click', () => ui.formulario({
          titulo: 'Nova vistoria', largura: 'pequena', campos: [{ chave: 'codigo', rotulo: 'Código do túmulo', obrigatorio: true, placeholder: 'Ex.: Q01-A1-6' }],
          textoSalvar: 'Continuar',
          salvar: (x) => { const t = VP.acharPorCodigo(x.codigo); if (!t) return 'Túmulo não encontrado com este código.'; setTimeout(() => E.novaVistoria(t, () => VP.app.render()), 50); return null; }
        }));
      }
    };
  };

  const recebidos = (abas) => {
    const st = VP.estado.recebidos = VP.estado.recebidos || { codigos: {} };
    const pendentes = () => VP.registrosParaConferir().sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
    const codigoDe = (r) => st.codigos[r.id] ?? (r.dados?.codigo || '');
    const achado = (r) => (r.tipo === 'conclusaoOS' ? null : VP.acharPorCodigo(codigoDe(r)));
    const desenhar = () => {
      const l = pendentes();
      const feitos = VP.db.lista('registrosCampo').filter((r) => r.conferido).sort((a, b) => String(b.conferidoEm).localeCompare(String(a.conferidoEm))).slice(0, 200);
      return `<section class="cartao"><p>Registros enviados pelo aplicativo de campo. <b>Nada entra no cadastro sozinho:</b> confira o túmulo de cada linha (dá para corrigir o código aqui mesmo), marque e confirme. Depois, se preciso, dá para desfazer.</p>
          <div class="linha-botoes"><label class="botao">Importar arquivo do aplicativo<input type="file" accept=".json" data-arquivo-app hidden></label><span class="ajuda">Sem servidor (ou sem internet no campo), use no aplicativo “Baixar cópia completa” e importe o arquivo aqui.</span></div></section>
        <div id="barra-rec" class="barra-lote" hidden></div>
        ${ui.tabela({ id: 'recebidos', linhas: l, selecao: true, porPagina: 100, nomePlanilha: 'registros-do-aplicativo', vazio: 'Nenhum registro aguardando conferência.', colunas: [
          { chave: 'quando', titulo: 'Data e hora', valor: (r) => new Date(r.criadoEm).toLocaleString('pt-BR'), ordenar: (r) => r.criadoEm },
          { chave: 'tipo', titulo: 'Tipo', valor: (r) => TIPOS_REG[r.tipo] || r.tipo },
          { chave: 'codigo', titulo: 'Código lido no campo', html: (r) => (r.tipo === 'conclusaoOS' ? esc(r.dados?.numeroOrdem || '') : `<input class="codigo-campo" data-codigo="${esc(r.id)}" value="${esc(codigoDe(r))}" aria-label="Código do túmulo">`), valor: codigoDe },
          { chave: 'tumulo', titulo: 'Túmulo encontrado', html: (r) => { if (r.tipo === 'conclusaoOS') { const o = VP.db.pega('ordensServico', r.dados?.ordemId); return o && !o.excluido ? `Ordem ${esc(o.numero)} · ${esc(L.situacoesOrdem[o.situacao])}` : '<span class="atrasada">Ordem não encontrada</span>'; } const t = achado(r); return t ? `<a href="#tumulo/${esc(t.id)}" target="_blank">${esc(VP.rotuloTumulo(t))}</a>` : '<span class="atrasada">Não encontrado — corrija o código</span>'; }, valor: (r) => (achado(r) ? VP.rotuloTumulo(achado(r)) : '') },
          { chave: 'resumo', titulo: 'O que foi registrado', valor: resumoRegistro },
          { chave: 'fotos', titulo: 'Fotos', html: (r) => miniaturas(fotosDoRegistro(r)), valor: (r) => (r.fotos || []).length },
          { chave: 'gps', titulo: 'Localização', valor: (r) => (r.gps ? `${r.gps.lat}, ${r.gps.lon} (±${r.gps.precisao} m)` : '—'), oculta: true },
          { chave: 'usuario', titulo: 'Quem registrou', valor: (r) => r.usuario || '', oculta: true }] })}
        <section class="cartao"><h3>Já conferidos (últimos ${feitos.length})</h3>
          <table class="tabela"><thead><tr><th>Data do registro</th><th>Tipo</th><th>Resultado</th><th>Conferido por</th><th></th></tr></thead><tbody>
          ${feitos.map((r) => `<tr><td>${new Date(r.criadoEm).toLocaleString('pt-BR')}</td><td>${esc(TIPOS_REG[r.tipo] || r.tipo)}</td><td>${r.descartado ? 'Descartado' : r.vinculo?.tumuloId ? `<a href="#tumulo/${esc(r.vinculo.tumuloId)}">${esc(VP.codigoTumulo(VP.db.pega('tumulos', r.vinculo.tumuloId) || {}))}</a>` : esc(r.vinculo?.colecao === 'ordensServico' ? 'Ordem de serviço' : '—')}</td><td>${esc(r.conferidoPor || '')} · ${u.data(r.conferidoEm)}</td><td><button class="botao pequeno" data-desfazer-rec="${esc(r.id)}">Desfazer</button></td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhum.</td></tr>'}
          </tbody></table></section>`;
    };
    const atualizar = () => {
      const a = document.getElementById('area-rec'); if (!a) return;
      a.innerHTML = desenhar(); ligar();
      const aba = document.querySelector('.abas a[href="#vistorias/recebidos"]');
      if (aba) aba.textContent = `Recebidos do aplicativo (${VP.registrosParaConferir().length})`;
    };
    const barra = (sel) => {
      const el = document.getElementById('barra-rec');
      el.hidden = !sel.size;
      if (!sel.size) return;
      el.innerHTML = `<b>${u.inteiro(sel.size)} marcado(s):</b> <button class="botao pequeno primario" data-confirmar-rec>Confirmar e lançar no túmulo</button> <button class="botao pequeno perigo" data-descartar-rec>Descartar</button>`;
      el.querySelector('[data-confirmar-rec]').addEventListener('click', async () => {
        const regs = [...sel].map((id) => VP.db.pega('registrosCampo', id)).filter(Boolean);
        const ok = [], falhas = [];
        for (const r of regs) {
          try { ok.push(await vincular(r, codigoDe(r))); } catch (e) { falhas.push({ item: `${TIPOS_REG[r.tipo] || r.tipo} de ${new Date(r.criadoEm).toLocaleString('pt-BR')} (${codigoDe(r) || r.dados?.numeroOrdem || ''})`, motivo: e.message }); }
        }
        sel.clear();
        ui.resultado({ titulo: 'Registros do aplicativo conferidos', sucesso: ok, falhas });
        atualizar();
      });
      el.querySelector('[data-descartar-rec]').addEventListener('click', async () => {
        if (!await ui.confirmar(`Descartar ${sel.size} registro(s)? Eles não entram no cadastro, mas continuam guardados (podem ser recuperados em “Já conferidos” → Desfazer).`, { sim: 'Descartar', classe: 'perigo' })) return;
        const regs = [...sel].map((id) => VP.db.pega('registrosCampo', id)).filter(Boolean);
        for (const r of regs) Object.assign(r, { conferido: true, descartado: true, conferidoEm: VP.Plataforma.agoraISO(), conferidoPor: usuario() });
        await VP.db.gravarVarias({ registrosCampo: regs });
        sel.clear();
        ui.resultado({ titulo: 'Registros descartados', sucesso: regs.map((r) => `${TIPOS_REG[r.tipo] || r.tipo} de ${new Date(r.criadoEm).toLocaleString('pt-BR')}`) });
        atualizar();
      });
    };
    const ligar = () => {
      ui.ligarTabela('recebidos', barra); barra(ui.tabelas.recebidos.selecionados);
      const a = document.getElementById('area-rec');
      // onchange (e não addEventListener): a área é a mesma a cada redesenho, e o evento não pode acumular
      a.onchange = (e) => {
        const c = e.target.closest('[data-codigo]'); if (!c) return;
        st.codigos[c.dataset.codigo] = c.value.trim().toUpperCase();
        atualizar();
      };
      a.querySelector('[data-arquivo-app]').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        let regs;
        try { regs = JSON.parse(await f.text()); } catch (_) { return ui.aviso('Arquivo inválido.', 'erro'); }
        if (!Array.isArray(regs) || regs.some((r) => !r || !r.id || !r.tipo || !r.dados)) return ui.aviso('Este arquivo não é uma cópia do aplicativo de campo do cemitério.', 'erro');
        const novos = [], falhas = [];
        for (const r of regs) {
          if (r.situacao === 'lixeira') { falhas.push({ item: `Registro ${r.id}`, motivo: 'Estava na Lixeira do aplicativo' }); continue; }
          if (VP.db.pega('registrosCampo', r.id)) { falhas.push({ item: `Registro ${r.id}`, motivo: 'Já recebido antes' }); continue; }
          if (!TIPOS_REG[r.tipo]) { falhas.push({ item: `Registro ${r.id}`, motivo: 'Tipo desconhecido' }); continue; }
          novos.push(Object.assign({}, r, { fotos: fotosDoRegistro(r), situacao: 'recebido', origem: 'arquivo do aplicativo: ' + f.name, recebidoEm: VP.Plataforma.agoraISO(), historico: undefined }));
        }
        if (novos.length) await VP.db.gravarVarias({ registrosCampo: novos });
        ui.resultado({ titulo: 'Arquivo do aplicativo recebido', sucesso: novos.map((r) => `${TIPOS_REG[r.tipo]} de ${new Date(r.criadoEm).toLocaleString('pt-BR')}`), falhas, extra: '<p class="ajuda">Os registros ficam aguardando conferência nesta tela.</p>' });
        atualizar();
      });
      a.querySelectorAll('[data-desfazer-rec]').forEach((b) => b.addEventListener('click', async () => {
        const r = VP.db.pega('registrosCampo', b.dataset.desfazerRec);
        if (!await ui.confirmar('Desfazer esta conferência? O que foi lançado vai para a Lixeira (ou a ordem volta para "Em andamento") e o registro volta para a lista de conferência.', { sim: 'Desfazer', classe: 'perigo' })) return;
        await desfazerVinculo(r);
        ui.aviso('Conferência desfeita.');
        atualizar();
      }));
    };
    return { titulo: 'Vistorias', html: `${abas}<div id="area-rec">${desenhar()}</div>`, ligar };
  };
})();
