/* VitalPat Patrimônio · Gestão — etapa 6: chamados de conserto, manutenção preventiva, vistorias e equipes
   (DOSSIE.md A1.5 VI-01 a VI-06, A1.6 DE-01 a DE-03, A2.6).
   Chamado: aberto → em campo → em revisão → concluído (ou cancelado). A preventiva gera o chamado sozinha com a
   antecedência do plano (é tarefa, não decisão). A vistoria usa checklist; cada item "não conforme" pode virar
   chamado, marcado por quem vistoriou. Concluir um chamado de um bem lança a despesa na linha do tempo do bem. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos;
  const T = VP.telas;
  const E = VP.manutencao = {};
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const selo = (classe, texto) => `<span class="selo-status mn-${classe}">${esc(texto)}</span>`;
  E.SITUACOES = { aberto: 'Aberto', campo: 'Em campo', revisao: 'Em revisão', concluido: 'Concluído', cancelado: 'Cancelado' };
  E.PROXIMA = { aberto: 'campo', campo: 'revisao', revisao: 'concluido' };
  E.TIPOS = { conserto: 'Conserto', reforma: 'Reforma', preventiva: 'Manutenção preventiva', pedido: 'Pedido da unidade', vistoria: 'Não conformidade de vistoria', outro: 'Outro' };
  E.PRIORIDADES = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  // Checklists por tipo de vistoria (VI-06). Texto simples; o município pode pedir outros.
  E.CHECKLISTS = {
    predial: { nome: 'Vistoria predial', itens: ['Telhado e calhas sem goteiras', 'Instalações elétricas (quadros, tomadas, fiação aparente)', 'Instalações hidráulicas e sanitárias', 'Pintura e paredes (mofo, rachaduras)', 'Portas, janelas e fechaduras', 'Acessibilidade (rampas, corrimãos, banheiro adaptado)', 'Extintores no lugar e dentro da validade', 'Caixa d\'água limpa e tampada', 'Iluminação de emergência', 'Limpeza geral e pragas'] },
    climatizacao: { nome: 'Ar-condicionado (PMOC)', itens: ['Filtros limpos', 'Bandejas e drenos sem água parada', 'Serpentinas limpas', 'Etiqueta da última manutenção visível', 'Ruído e vibração normais', 'Temperatura adequada no ambiente'] },
    incendio: { nome: 'Segurança contra incêndio', itens: ['AVCB dentro da validade', 'Extintores carregados e sinalizados', 'Hidrantes e mangueiras em ordem', 'Saídas de emergência desobstruídas', 'Sinalização de rota de fuga', 'Alarme e detectores funcionando'] },
    bem: { nome: 'Vistoria de bem', itens: ['Funcionando', 'Sem danos aparentes', 'Plaqueta legível', 'No local registrado'] }
  };
  E.PLANOS_SUGERIDOS = [['Limpeza do ar-condicionado (PMOC)', 3, 'Lei 13.589/2018 — conferir detalhes'], ['Recarga e inspeção de extintores', 12, 'Normas do Corpo de Bombeiros — conferir'], ['Limpeza da caixa d\'água', 6, 'Normas sanitárias — conferir'], ['Revisão do telhado e calhas', 12, 'Política interna'], ['Revisão das instalações elétricas e do para-raios (SPDA)', 12, 'Política interna'], ['Pintura', 60, 'Política interna']];

  // ------------------------------------------------------------------ regras
  const somaMeses = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(Date.UTC(a, m - 1 + n, d)); if (x.getUTCDate() !== d) x.setUTCDate(0); return x.toISOString().slice(0, 10); };
  E.aberto = (c) => ['aberto', 'campo', 'revisao'].includes(c.situacao);
  E.atrasado = (c) => E.aberto(c) && !!c.prazo && c.prazo < hoje();
  E.proximaData = (pl) => (pl.ultimaData ? somaMeses(pl.ultimaData, pl.cadaMeses) : hoje());
  E.situacaoPlano = (pl) => { const p = E.proximaData(pl); if (p < hoje()) return 'vencido'; if (u.somaDias(hoje(), pl.antecedenciaDias ?? 15) >= p) return 'proximo'; return 'em-dia'; };
  E.numeroNovo = () => { const ano = hoje().slice(0, 4); return `${VP.db.lista('chamados', true).filter((c) => String(c.numero).endsWith('/' + ano)).length + 1}/${ano}`; };
  E.local = (c) => [c.unidadeId ? VP.nome('unidades', c.unidadeId) : '', c.bemId ? (VP.db.pega('bens', c.bemId)?.descricao || '') : ''].filter(Boolean).join(' · ') || '—';
  E.membros = (eqId) => (VP.db.pega('equipes', eqId)?.membros || []).map((id) => VP.nome('responsaveis', id));
  E.alertas = () => {
    const ch = VP.db.lista('chamados');
    return { atrasados: ch.filter(E.atrasado), urgentes: ch.filter((c) => E.aberto(c) && c.prioridade === 'urgente'), revisao: ch.filter((c) => c.situacao === 'revisao'), planosVencidos: VP.db.lista('planosPreventiva').filter((p) => p.ativo !== false && E.situacaoPlano(p) === 'vencido') };
  };
  const novoChamado = (x) => Object.assign({ id: u.id(), numero: E.numeroNovo(), situacao: 'aberto', abertoEm: hoje(), historico: [{ quando: agora(), acao: 'aberto', usuario: usuario() }], fotos: [], usuario: usuario(), criadoEm: agora() }, x);
  const eventoBem = (bemId, descricao, valor = null, extra = {}) => (bemId ? [VP.novoEvento(bemId, valor ? 'manutencao' : 'observacao', { descricao, valor, extra })] : []);
  // Preventiva: cria o chamado do plano quando chega a antecedência (um por vencimento; não duplica)
  E.gerarPreventivas = async () => {
    const novos = [], planos = [];
    for (const pl of VP.db.lista('planosPreventiva')) {
      if (pl.ativo === false || E.situacaoPlano(pl) === 'em-dia') continue;
      const venc = E.proximaData(pl);
      if (pl.chamadoAbertoPara === venc && VP.db.pega('chamados', pl.chamadoAbertoId)) continue;
      const c = novoChamado({ tipo: 'preventiva', origem: 'preventiva', planoId: pl.id, unidadeId: pl.unidadeId || '', bemId: pl.bemId || '', descricao: `${pl.item} (vence em ${u.data(venc)})`, prioridade: venc < hoje() ? 'alta' : 'normal', prazo: venc, equipeId: pl.equipeId || '', custoPrevisto: pl.custoPrevisto || null });
      c.historico[0].acao = 'aberto pela manutenção preventiva';
      pl.chamadoAbertoPara = venc; pl.chamadoAbertoId = c.id;
      novos.push(c); planos.push(pl);
    }
    if (novos.length) await VP.db.gravarVarias({ chamados: novos, planosPreventiva: planos });
    return novos;
  };

  // ------------------------------------------------------------------ ações
  const opcUnid = () => VP.db.lista('unidades').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => [x.id, x.nome]);
  const opcResp = () => VP.db.lista('responsaveis').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => [x.id, x.nome]);
  const opcEquipe = () => VP.db.lista('equipes').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => [x.id, x.nome]);
  const acharBem = (txt) => { const t = String(txt || '').trim(); if (!t) return null; return VP.db.lista('bens').find((b) => String(b.codigo) === t || String(b.plaqueta) === t) || null; };
  E.novoChamado = (depois, padrao = {}) => ui.formulario({
    titulo: 'Novo chamado', largura: 'media',
    campos: [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(E.TIPOS).filter(([k]) => k !== 'preventiva' && k !== 'vistoria'), obrigatorio: true, largura: 'meia' },
      { chave: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: Object.entries(E.PRIORIDADES), vazio: false, largura: 'meia' },
      { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opcUnid(), obrigatorio: true, largura: 'meia' },
      { chave: 'bem', rotulo: 'Bem (código ou plaqueta, se for um bem)', largura: 'meia' },
      { chave: 'descricao', rotulo: 'O que precisa', tipo: 'area', obrigatorio: true },
      { chave: 'solicitante', rotulo: 'Quem pediu', largura: 'meia' }, { chave: 'custoPrevisto', rotulo: 'Custo previsto', tipo: 'moeda', largura: 'meia' },
      { chave: 'equipeId', rotulo: 'Equipe', tipo: 'select', opcoes: opcEquipe(), largura: 'meia' }, { chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: opcResp(), largura: 'meia' },
      { chave: 'prazo', rotulo: 'Prazo', tipo: 'data', largura: 'meia', padrao: u.somaDias(hoje(), 15) },
      { chave: 'fotos', rotulo: 'Fotos', tipo: 'arquivo', multiplo: true, aceita: 'image/*' }],
    valores: padrao,
    salvar: async (x) => {
      const bem = acharBem(x.bem);
      if (x.bem && !bem) return 'Bem não encontrado com este código ou plaqueta.';
      const fotos = await ui.lerArquivos(x.fotos);
      const c = novoChamado({ tipo: x.tipo, origem: 'unidade', prioridade: x.prioridade, unidadeId: x.unidadeId || bem?.unidadeId || '', bemId: bem?.id || '', descricao: x.descricao, solicitante: x.solicitante, custoPrevisto: x.custoPrevisto, equipeId: x.equipeId, responsavelId: x.responsavelId, prazo: x.prazo, fotos });
      await VP.db.gravarVarias({ chamados: [c], eventos: eventoBem(c.bemId, `Chamado ${c.numero} aberto: ${x.descricao}`) });
      ui.aviso(`Chamado ${c.numero} aberto.`); depois && depois();
    }
  });
  E.avancar = (c, depois) => {
    const para = E.PROXIMA[c.situacao];
    const concluir = para === 'concluido';
    ui.formulario({
      titulo: `Chamado ${c.numero}: ${E.SITUACOES[c.situacao]} → ${E.SITUACOES[para]}`, largura: 'pequena',
      intro: `<p>${esc(c.descricao)} · ${esc(E.local(c))}</p>`,
      campos: [{ chave: 'nota', rotulo: concluir ? 'O que foi feito' : 'Observação', tipo: 'area', obrigatorio: concluir || para === 'revisao' }]
        .concat(concluir ? [{ chave: 'custo', rotulo: 'Custo realizado', tipo: 'moeda', largura: 'meia' }, { chave: 'fotos', rotulo: 'Fotos do serviço feito', tipo: 'arquivo', multiplo: true, aceita: 'image/*' }] : [])
        .concat(para === 'campo' ? [{ chave: 'equipeId', rotulo: 'Equipe', tipo: 'select', opcoes: opcEquipe(), largura: 'meia' }, { chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: opcResp(), largura: 'meia' }] : []),
      valores: { equipeId: c.equipeId, responsavelId: c.responsavelId },
      textoSalvar: E.SITUACOES[para],
      salvar: async (x) => {
        if (para === 'campo' && !x.equipeId && !x.responsavelId) return 'Escolha a equipe ou o responsável que vai a campo.';
        const fotos = concluir ? await ui.lerArquivos(x.fotos) : [];
        const de = c.situacao;
        c.situacao = para;
        if (para === 'campo') { c.equipeId = x.equipeId || c.equipeId; c.responsavelId = x.responsavelId || c.responsavelId; }
        if (concluir) { c.concluidoEm = hoje(); c.custoRealizado = x.custo ?? null; c.fotosConclusao = (c.fotosConclusao || []).concat(fotos); }
        c.historico = (c.historico || []).concat({ quando: agora(), acao: `${E.SITUACOES[de]} → ${E.SITUACOES[para]}`, nota: x.nota || '', usuario: usuario() });
        const docs = { chamados: [c], eventos: concluir ? eventoBem(c.bemId, `Chamado ${c.numero} concluído: ${x.nota}`, x.custo || null, { chamadoId: c.id }) : [] };
        if (concluir && c.planoId) { const pl = VP.db.pega('planosPreventiva', c.planoId); if (pl) { pl.ultimaData = hoje(); pl.historico = (pl.historico || []).concat({ quando: agora(), acao: 'feito', chamadoId: c.id, usuario: usuario() }); docs.planosPreventiva = [pl]; } }
        await VP.db.gravarVarias(docs);
        ui.aviso(`Chamado ${c.numero}: ${E.SITUACOES[para].toLowerCase()}.`); depois && depois();
      }
    });
  };
  E.voltar = (c, depois) => ui.formulario({
    titulo: `Devolver chamado ${c.numero} para "Em campo"`, largura: 'pequena', campos: [{ chave: 'nota', rotulo: 'O que falta (revisão não aprovada)', tipo: 'area', obrigatorio: true }], textoSalvar: 'Devolver',
    salvar: async (x) => {
      c.historico = (c.historico || []).concat({ quando: agora(), acao: 'Em revisão → Em campo (revisão não aprovada)', nota: x.nota, usuario: usuario() });
      c.situacao = 'campo';
      await VP.db.gravar('chamados', c); ui.aviso('Devolvido para a equipe.'); depois && depois();
    }
  });
  E.cancelar = (c, depois) => ui.formulario({
    titulo: `Cancelar chamado ${c.numero}`, largura: 'pequena', campos: [{ chave: 'nota', rotulo: 'Motivo', tipo: 'area', obrigatorio: true }], textoSalvar: 'Cancelar chamado',
    salvar: async (x) => {
      c.historico = (c.historico || []).concat({ quando: agora(), acao: `${E.SITUACOES[c.situacao]} → Cancelado`, nota: x.nota, usuario: usuario() });
      c.situacao = 'cancelado';
      if (c.planoId) { const pl = VP.db.pega('planosPreventiva', c.planoId); if (pl && pl.chamadoAbertoId === c.id) { pl.chamadoAbertoId = null; await VP.db.gravar('planosPreventiva', pl); } }
      await VP.db.gravar('chamados', c); ui.aviso('Chamado cancelado.'); depois && depois();
    }
  });
  E.verChamado = (c, depois) => {
    const fotos = (l) => (l || []).filter((f) => f.dataURL).map((f) => `<a href="${esc(f.dataURL)}" target="_blank" rel="noopener"><img src="${esc(f.dataURL)}" alt="Foto" style="width:56px;height:56px;object-fit:cover;border-radius:4px"></a>`).join(' ');
    const botoes = [];
    const pode = !VP.servidor?.ativo || VP.servidor.podeAlterar();
    if (pode && E.PROXIMA[c.situacao]) botoes.push({ texto: E.SITUACOES[E.PROXIMA[c.situacao]], classe: 'primario', acao: () => { E.avancar(c, depois); } });
    if (pode && c.situacao === 'revisao') botoes.push({ texto: 'Devolver para a equipe', acao: () => { E.voltar(c, depois); } });
    if (pode && E.aberto(c)) botoes.push({ texto: 'Cancelar chamado', classe: 'perigo', acao: () => { E.cancelar(c, depois); } });
    botoes.push({ texto: 'Fechar' });
    ui.modal({
      titulo: `Chamado ${c.numero}`, largura: 'media',
      corpo: `<p>${selo(c.situacao, E.SITUACOES[c.situacao])} ${E.atrasado(c) ? selo('atrasado', 'Atrasado') : ''}</p>
        <dl class="dados"><dt>Tipo</dt><dd>${esc(E.TIPOS[c.tipo] || c.tipo)}</dd><dt>Local</dt><dd>${esc(E.local(c))}${c.bemId ? ` · <a href="#bem/${esc(c.bemId)}" data-fechar-ir>abrir o bem</a>` : ''}</dd><dt>O que precisa</dt><dd>${esc(c.descricao)}</dd><dt>Prioridade</dt><dd>${esc(E.PRIORIDADES[c.prioridade] || '')}</dd><dt>Quem pediu</dt><dd>${esc(c.solicitante || (c.origem === 'preventiva' ? 'Manutenção preventiva' : c.origem === 'vistoria' ? 'Vistoria' : '—'))}</dd><dt>Equipe</dt><dd>${esc(VP.db.pega('equipes', c.equipeId)?.nome || '—')}</dd><dt>Responsável</dt><dd>${esc(c.responsavelId ? VP.nome('responsaveis', c.responsavelId) : '—')}</dd><dt>Prazo</dt><dd>${u.data(c.prazo)}</dd><dt>Custo previsto / realizado</dt><dd>${c.custoPrevisto ? u.moeda(c.custoPrevisto) : '—'} / ${c.custoRealizado != null ? u.moeda(c.custoRealizado) : '—'}</dd></dl>
        ${(c.fotos || []).length ? `<h4>Fotos do pedido</h4>${fotos(c.fotos)}` : ''}${(c.fotosConclusao || []).length ? `<h4>Fotos do serviço</h4>${fotos(c.fotosConclusao)}` : ''}
        <h4>Histórico</h4><ol class="lista-simples">${(c.historico || []).map((h) => `<li>${u.data(String(h.quando).slice(0, 10))} — <b>${esc(h.acao)}</b>${h.nota ? ': ' + esc(h.nota) : ''} <small>(${esc(h.usuario || '')})</small></li>`).join('')}</ol>`,
      botoes
    }).el.querySelector('[data-fechar-ir]')?.addEventListener('click', (e) => e.target.closest('dialog').querySelector('[data-fechar]').click());
  };
  E.novaVistoria = (depois) => {
    const tipos = Object.entries(E.CHECKLISTS);
    ui.formulario({
      titulo: 'Nova vistoria', largura: 'pequena',
      campos: [{ chave: 'tipo', rotulo: 'Tipo de vistoria', tipo: 'select', opcoes: tipos.map(([k, v]) => [k, v.nome]), obrigatorio: true }, { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opcUnid(), obrigatorio: true }, { chave: 'bem', rotulo: 'Bem (código ou plaqueta; só na vistoria de bem)' }],
      textoSalvar: 'Continuar',
      salvar: (x) => {
        const bem = acharBem(x.bem);
        if (x.tipo === 'bem' && !bem) return 'Informe o código ou a plaqueta do bem.';
        setTimeout(() => E.preencherVistoria(x.tipo, x.unidadeId, bem, depois), 50);
        return null;
      }
    });
  };
  E.preencherVistoria = (tipo, unidadeId, bem, depois) => {
    const ck = E.CHECKLISTS[tipo];
    const campos = [{ chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: hoje(), largura: 'meia' }, { chave: 'equipeId', rotulo: 'Equipe', tipo: 'select', opcoes: opcEquipe(), largura: 'meia' }]
      .concat(ck.itens.flatMap((it, i) => [{ chave: 'i' + i, rotulo: it, tipo: 'select', opcoes: [['sim', 'Conforme'], ['nao', 'Não conforme'], ['na', 'Não se aplica']], obrigatorio: true, largura: 'meia' }, { chave: 'c' + i, rotulo: 'Se não conforme: abrir chamado', tipo: 'bool', largura: 'meia' }]))
      .concat([{ chave: 'observacao', rotulo: 'Observação', tipo: 'area' }, { chave: 'fotos', rotulo: 'Fotos', tipo: 'arquivo', multiplo: true, aceita: 'image/*' }]);
    ui.formulario({
      titulo: `${ck.nome} — ${VP.nome('unidades', unidadeId)}${bem ? ' · ' + bem.descricao : ''}`, largura: 'grande', campos,
      salvar: async (x) => {
        if (x.data > hoje()) return 'A data não pode ser no futuro.';
        const fotos = await ui.lerArquivos(x.fotos);
        const itens = ck.itens.map((it, i) => ({ item: it, resultado: x['i' + i], abrirChamado: x['i' + i] === 'nao' && !!x['c' + i] }));
        const v = { id: u.id(), tipo, unidadeId, bemId: bem?.id || '', data: x.data, equipeId: x.equipeId, itens, observacao: x.observacao, fotos, naoConformes: itens.filter((i) => i.resultado === 'nao').length, usuario: usuario(), criadoEm: agora() };
        const chamados = itens.filter((i) => i.abrirChamado).map((i) => novoChamado({ tipo: 'vistoria', origem: 'vistoria', vistoriaId: v.id, unidadeId, bemId: bem?.id || '', descricao: `Não conforme na ${ck.nome.toLowerCase()}: ${i.item}`, prioridade: 'normal', prazo: u.somaDias(hoje(), 30), equipeId: x.equipeId || '' }));
        // números diferentes para os chamados abertos juntos
        chamados.forEach((c, k) => { const [n, a] = c.numero.split('/'); c.numero = `${Number(n) + k}/${a}`; });
        v.chamados = chamados.map((c) => c.id);
        await VP.db.gravarVarias({ vistoriasPat: [v], chamados, eventos: eventoBem(v.bemId, `${ck.nome}: ${v.naoConformes} item(ns) não conforme(s)`, null, { vistoriaId: v.id }) });
        ui.resultado({ titulo: 'Vistoria registrada', sucesso: [`${ck.itens.length} itens conferidos, ${v.naoConformes} não conforme(s)`].concat(chamados.map((c) => `Chamado ${c.numero} aberto: ${c.descricao}`)) });
        depois && depois();
      }
    });
  };
  E.editarPlano = (pl, depois) => ui.formulario({
    titulo: pl ? 'Editar plano de manutenção' : 'Novo plano de manutenção preventiva', largura: 'media',
    intro: pl ? '' : `<p class="ajuda">Sugestões (DOSSIE.md A2.6): ${E.PLANOS_SUGERIDOS.map(([n, m]) => `${esc(n)} a cada ${m} meses`).join('; ')}.</p>`,
    campos: [{ chave: 'item', rotulo: 'O que fazer', obrigatorio: true }, { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opcUnid(), obrigatorio: true, largura: 'meia' }, { chave: 'bem', rotulo: 'Bem (código ou plaqueta, opcional)', largura: 'meia' },
      { chave: 'cadaMeses', rotulo: 'A cada quantos meses', tipo: 'numero', obrigatorio: true, largura: 'meia' }, { chave: 'antecedenciaDias', rotulo: 'Abrir o chamado quantos dias antes', tipo: 'numero', largura: 'meia', padrao: 15 },
      { chave: 'ultimaData', rotulo: 'Última vez que foi feito', tipo: 'data', largura: 'meia' }, { chave: 'equipeId', rotulo: 'Equipe', tipo: 'select', opcoes: opcEquipe(), largura: 'meia' },
      { chave: 'custoPrevisto', rotulo: 'Custo previsto', tipo: 'moeda', largura: 'meia' }, { chave: 'base', rotulo: 'Base (lei, norma ou política)', largura: 'meia' }, { chave: 'ativo', rotulo: 'Plano ativo', tipo: 'bool', padrao: true }],
    valores: pl ? Object.assign({ bem: pl.bemId ? VP.db.pega('bens', pl.bemId)?.codigo : '' }, pl) : { ativo: true, antecedenciaDias: 15 },
    salvar: async (x) => {
      const bem = acharBem(x.bem);
      if (x.bem && !bem) return 'Bem não encontrado.';
      if (!(x.cadaMeses > 0)) return 'Informe de quantos em quantos meses.';
      const d = pl || { id: u.id(), historico: [], criadoEm: agora() };
      Object.assign(d, { item: x.item, unidadeId: x.unidadeId, bemId: bem?.id || '', cadaMeses: x.cadaMeses, antecedenciaDias: x.antecedenciaDias ?? 15, ultimaData: x.ultimaData, equipeId: x.equipeId, custoPrevisto: x.custoPrevisto, base: x.base, ativo: !!x.ativo });
      await VP.db.gravar('planosPreventiva', d);
      await E.gerarPreventivas();
      ui.aviso('Plano salvo.'); depois && depois();
    }
  });
  E.editarEquipe = (eq, depois) => ui.formulario({
    titulo: eq ? 'Editar equipe' : 'Nova equipe', largura: 'media',
    campos: [{ chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'area', rotulo: 'Área (ex.: elétrica, obras, patrimônio)', largura: 'meia' }, { chave: 'liderId', rotulo: 'Líder', tipo: 'select', opcoes: opcResp(), largura: 'meia' }].concat(opcResp().map(([id, n]) => ({ chave: 'm_' + id, rotulo: n, tipo: 'bool', largura: 'meia' }))),
    intro: '<p class="ajuda">Marque quem faz parte da equipe.</p>',
    valores: eq ? Object.assign({}, eq, Object.fromEntries((eq.membros || []).map((id) => ['m_' + id, true]))) : {},
    salvar: async (x) => {
      const membros = Object.keys(x).filter((k) => k.startsWith('m_') && x[k]).map((k) => k.slice(2));
      if (!membros.length) return 'Marque pelo menos uma pessoa.';
      const d = eq || { id: u.id(), criadoEm: agora() };
      Object.assign(d, { nome: x.nome, area: x.area, liderId: x.liderId, membros });
      await VP.db.gravar('equipes', d); ui.aviso('Equipe salva.'); depois && depois();
    }
  });

  // ------------------------------------------------------------------ telas
  T.manutencao = (aba = 'painel', query = {}) => {
    const abas = `<nav class="abas">${[['painel', 'Painel'], ['chamados', 'Chamados'], ['preventiva', 'Preventiva'], ['vistorias', 'Vistorias'], ['equipes', 'Equipes']].map(([k, n]) => `<a href="#manutencao${k === 'painel' ? '' : '/' + k}" class="${k === aba ? 'ativa' : ''}">${n}</a>`).join('')}</nav>`;
    const re = () => VP.app.render();
    const ch = VP.db.lista('chamados');
    if (aba === 'chamados') {
      const v = VP.estado.filtrosChamados = VP.estado.filtrosChamados || { abertos: true };
      if (Object.keys(query).length) { for (const k of Object.keys(v)) delete v[k]; Object.assign(v, Object.fromEntries(Object.entries(query).map(([k, x]) => [k, x === '1' ? true : x]))); }
      const defs = [{ chave: 'abertos', rotulo: 'Só em aberto', tipo: 'bool' }, { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(E.SITUACOES) }, { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(E.TIPOS) }, { chave: 'unidadeId', rotulo: 'Unidade', tipo: 'select', opcoes: opcUnid() }, { chave: 'equipeId', rotulo: 'Equipe', tipo: 'select', opcoes: opcEquipe() }, { chave: 'atrasados', rotulo: 'Atrasados', tipo: 'bool' }];
      const filtrar = () => {
        const f = ui.limparValores(v);
        let l = ch.slice();
        if (f.abertos) l = l.filter(E.aberto);
        for (const k of ['situacao', 'tipo', 'unidadeId', 'equipeId']) if (f[k]) l = l.filter((c) => c[k] === f[k]);
        if (f.atrasados) l = l.filter(E.atrasado);
        if (f.busca) { const b = u.normalizar(f.busca); l = l.filter((c) => u.normalizar([c.numero, c.descricao, E.local(c), c.solicitante].join(' ')).includes(b)); }
        return l.sort((a, b) => ({ urgente: 0, alta: 1, normal: 2 }[a.prioridade] ?? 3) - ({ urgente: 0, alta: 1, normal: 2 }[b.prioridade] ?? 3) || String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
      };
      const colunas = [{ chave: 'numero', titulo: 'Nº' }, { chave: 'situacao', titulo: 'Situação', html: (c) => selo(c.situacao, E.SITUACOES[c.situacao]), valor: (c) => E.SITUACOES[c.situacao] }, { chave: 'tipo', titulo: 'Tipo', valor: (c) => E.TIPOS[c.tipo] }, { chave: 'local', titulo: 'Unidade / bem', valor: E.local }, { chave: 'descricao', titulo: 'O que precisa' }, { chave: 'prioridade', titulo: 'Prioridade', valor: (c) => E.PRIORIDADES[c.prioridade] }, { chave: 'equipe', titulo: 'Equipe', valor: (c) => VP.db.pega('equipes', c.equipeId)?.nome || '' }, { chave: 'prazo', titulo: 'Prazo', html: (c) => `<span class="${E.atrasado(c) ? 'mn-atrasado' : ''}">${u.data(c.prazo)}</span>`, valor: (c) => u.data(c.prazo), ordenar: (c) => c.prazo || '9' }, { chave: 'previsto', titulo: 'Custo previsto', num: true, valor: (c) => c.custoPrevisto || 0, formato: u.moeda, oculta: true }, { chave: 'realizado', titulo: 'Custo realizado', num: true, valor: (c) => c.custoRealizado || 0, formato: u.moeda, oculta: true }];
      const desenhar = () => `<div class="linha-filtros">${ui.filtros({ id: 'cham', defs, valores: v, placeholder: 'Buscar por nº, descrição, unidade, bem…', aoMudar: (_x, o) => atualizar(o) })}</div>${ui.tabela({ id: 'chamados', colunas, linhas: filtrar(), porPagina: 100, nomePlanilha: 'chamados', vazio: 'Nenhum chamado neste filtro.', aoClicar: (c) => E.verChamado(c, re) })}`;
      const atualizar = (o) => { const a = document.getElementById('area-cham'); if (!a) return; a.innerHTML = desenhar(); ui.ligarTabela('chamados'); if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); } };
      return { titulo: 'Manutenção', acoes: '<button class="botao primario" data-novo-chamado>+ Novo chamado</button>', html: `${abas}<div id="area-cham">${desenhar()}</div>`, ligar() { ui.ligarTabela('chamados'); document.querySelector('[data-novo-chamado]').addEventListener('click', () => E.novoChamado(re)); } };
    }
    if (aba === 'preventiva') {
      const planos = VP.db.lista('planosPreventiva').sort((a, b) => E.proximaData(a).localeCompare(E.proximaData(b)));
      const sit = (pl) => (pl.ativo === false ? selo('cancelado', 'Inativo') : { vencido: selo('atrasado', 'Vencido'), proximo: selo('revisao', 'Chamado aberto ou perto'), 'em-dia': selo('concluido', 'Em dia') }[E.situacaoPlano(pl)]);
      return {
        titulo: 'Manutenção', acoes: '<button class="botao primario" data-novo-plano>+ Novo plano</button>',
        html: `${abas}<p class="ajuda">Cada plano abre o chamado sozinho quando chega a antecedência. Concluir o chamado marca o plano como feito na data.</p>
          ${ui.tabela({ id: 'planos', linhas: planos, porPagina: 100, nomePlanilha: 'planos-preventiva', vazio: 'Nenhum plano. Ex.: limpeza do ar-condicionado (PMOC) a cada 3 meses.', colunas: [{ chave: 'sit', titulo: 'Situação', html: sit, valor: (pl) => E.situacaoPlano(pl) }, { chave: 'item', titulo: 'O que fazer' }, { chave: 'local', titulo: 'Unidade / bem', valor: E.local }, { chave: 'cada', titulo: 'A cada', valor: (pl) => `${pl.cadaMeses} meses` }, { chave: 'ultima', titulo: 'Última vez', valor: (pl) => u.data(pl.ultimaData) }, { chave: 'proxima', titulo: 'Próxima', valor: (pl) => u.data(E.proximaData(pl)), ordenar: (pl) => E.proximaData(pl) }, { chave: 'equipe', titulo: 'Equipe', valor: (pl) => VP.db.pega('equipes', pl.equipeId)?.nome || '' }, { chave: 'base', titulo: 'Base', oculta: true }], aoClicar: (pl) => E.editarPlano(pl, re) })}`,
        ligar() { ui.ligarTabela('planos'); document.querySelector('[data-novo-plano]').addEventListener('click', () => E.editarPlano(null, re)); }
      };
    }
    if (aba === 'vistorias') {
      const vs = VP.db.lista('vistoriasPat').sort((a, b) => b.data.localeCompare(a.data));
      return {
        titulo: 'Manutenção', acoes: '<button class="botao primario" data-nova-vistoria>+ Nova vistoria</button>',
        html: `${abas}<div class="resumo-linha">${G.numero('Vistorias', u.inteiro(vs.length))}${G.numero('Itens não conformes', u.inteiro(vs.reduce((t, v) => t + v.naoConformes, 0)))}${G.numero('Chamados abertos por vistoria', u.inteiro(ch.filter((c) => c.origem === 'vistoria').length))}</div>
          ${ui.tabela({ id: 'vist-pat', linhas: vs, porPagina: 100, nomePlanilha: 'vistorias', vazio: 'Nenhuma vistoria.', colunas: [{ chave: 'data', titulo: 'Data', valor: (v) => u.data(v.data), ordenar: (v) => v.data }, { chave: 'tipo', titulo: 'Tipo', valor: (v) => E.CHECKLISTS[v.tipo]?.nome }, { chave: 'local', titulo: 'Unidade / bem', valor: E.local }, { chave: 'nc', titulo: 'Não conformes', num: true, valor: (v) => v.naoConformes }, { chave: 'ch', titulo: 'Chamados', num: true, valor: (v) => (v.chamados || []).length }, { chave: 'equipe', titulo: 'Equipe', valor: (v) => VP.db.pega('equipes', v.equipeId)?.nome || '' }, { chave: 'usuario', titulo: 'Quem registrou', oculta: true }], aoClicar: (v) => ui.modal({ titulo: `${E.CHECKLISTS[v.tipo]?.nome} — ${u.data(v.data)}`, largura: 'media', corpo: `<p>${esc(E.local(v))}</p><ul class="lista-simples">${v.itens.map((i) => `<li>${i.resultado === 'nao' ? selo('atrasado', 'Não conforme') : i.resultado === 'sim' ? selo('concluido', 'Conforme') : selo('cancelado', 'Não se aplica')} ${esc(i.item)}</li>`).join('')}</ul>${v.observacao ? `<p>${esc(v.observacao)}</p>` : ''}`, botoes: [{ texto: 'Fechar' }] }) })}`,
        ligar() { ui.ligarTabela('vist-pat'); document.querySelector('[data-nova-vistoria]').addEventListener('click', () => E.novaVistoria(re)); }
      };
    }
    if (aba === 'equipes') {
      const eqs = VP.db.lista('equipes');
      return {
        titulo: 'Manutenção', acoes: '<button class="botao primario" data-nova-equipe>+ Nova equipe</button>',
        html: `${abas}${ui.tabela({ id: 'equipes', linhas: eqs, nomePlanilha: 'equipes', vazio: 'Nenhuma equipe.', colunas: [{ chave: 'nome', titulo: 'Equipe' }, { chave: 'area', titulo: 'Área' }, { chave: 'lider', titulo: 'Líder', valor: (e) => (e.liderId ? VP.nome('responsaveis', e.liderId) : '') }, { chave: 'membros', titulo: 'Pessoas', valor: (e) => E.membros(e.id).join(', ') }, { chave: 'abertos', titulo: 'Chamados em aberto', num: true, valor: (e) => ch.filter((c) => c.equipeId === e.id && E.aberto(c)).length }, { chave: 'atrasados', titulo: 'Atrasados', num: true, valor: (e) => ch.filter((c) => c.equipeId === e.id && E.atrasado(c)).length }], aoClicar: (e) => E.editarEquipe(e, re) })}`,
        ligar() { ui.ligarTabela('equipes'); document.querySelector('[data-nova-equipe]').addEventListener('click', () => E.editarEquipe(null, re)); }
      };
    }
    // Painel (VI-01, DE-02)
    const a = E.alertas();
    const abertos = ch.filter(E.aberto);
    const porSit = ['aberto', 'campo', 'revisao'].map((k) => ({ rotulo: E.SITUACOES[k], valor: ch.filter((c) => c.situacao === k).length, link: `#manutencao/chamados?situacao=${k}` }));
    const porUn = VP.db.lista('unidades').map((un) => { const l = ch.filter((c) => c.unidadeId === un.id && c.situacao !== 'cancelado'); return { un, prev: l.reduce((t, c) => t + (c.custoPrevisto || 0), 0), real: l.reduce((t, c) => t + (c.custoRealizado || 0), 0), abertos: l.filter(E.aberto).length }; }).filter((x) => x.prev || x.real || x.abertos);
    const porEquipe = VP.db.lista('equipes').map((e) => ({ rotulo: e.nome, valor: abertos.filter((c) => c.equipeId === e.id).length, link: `#manutencao/chamados?equipeId=${e.id}` }));
    return {
      titulo: 'Manutenção',
      acoes: '<button class="botao" data-nova-vistoria>+ Vistoria</button> <button class="botao primario" data-novo-chamado>+ Novo chamado</button>',
      html: `${abas}<div class="resumo-linha">${G.numero('Chamados em aberto', u.inteiro(abertos.length), '', '#manutencao/chamados')}${G.numero('Atrasados', u.inteiro(a.atrasados.length), '', '#manutencao/chamados?abertos=1&atrasados=1')}${G.numero('Urgentes', u.inteiro(a.urgentes.length))}${G.numero('Aguardando revisão', u.inteiro(a.revisao.length), '', '#manutencao/chamados?situacao=revisao')}${G.numero('Preventivas vencidas', u.inteiro(a.planosVencidos.length), '', '#manutencao/preventiva')}</div>
        <div class="grade-graficos"><section class="cartao"><h3>Chamados por situação</h3>${G.barrasH(porSit, { mostrarZeros: true })}</section><section class="cartao"><h3>Em aberto por equipe</h3>${G.barrasH(porEquipe, { mostrarZeros: true })}</section></div>
        <section class="cartao"><h3>Custo previsto × realizado por unidade</h3>${porUn.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Unidade</th><th class="num">Em aberto</th><th class="num">Previsto</th><th class="num">Realizado</th></tr></thead><tbody>${porUn.map((x) => `<tr><td><a href="#unidade/${esc(x.un.id)}">${esc(x.un.nome)}</a></td><td class="num">${u.inteiro(x.abertos)}</td><td class="num">${u.moeda(x.prev)}</td><td class="num">${u.moeda(x.real)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Sem chamados.</p>'}</section>
        <p class="ajuda">Fluxo do chamado: aberto → em campo → em revisão → concluído. Concluir pede o que foi feito, o custo e fotos; se o chamado é de um bem, a despesa vai para a linha do tempo dele.</p>`,
      ligar() { document.querySelector('[data-novo-chamado]').addEventListener('click', () => E.novoChamado(re)); document.querySelector('[data-nova-vistoria]').addEventListener('click', () => E.novaVistoria(re)); }
    };
  };
})();
