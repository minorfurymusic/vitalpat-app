/* VitalPat Patrimônio · Gestão — recebimento do bem e termo de responsabilidade com prazo.
   Toda vez que alguém passa a ser responsável por bens (novo bem, nota fiscal, transferência, troca de responsável),
   o sistema abre um termo "aguardando assinatura", com prazo (padrão 15 dias, em Configurações).
   O termo é impresso e entregue; o bem fica com pendência até o termo assinado ser anexado.
   Envio do termo por e-mail: pendência para o futuro (precisa de serviço de e-mail no servidor) — não está no código. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, ui = VP.ui, esc = u.esc;
  const T = VP.telas;
  const TR = VP.termos = {};
  const pode = () => !VP.servidor?.ativo || VP.servidor.podeAlterar();
  const hoje = () => VP.Plataforma.hoje();
  const hist = (x, descricao) => { x.historico = (x.historico || []).concat([{ data: VP.Plataforma.agoraISO(), descricao, usuario: VP.sessao?.usuario || 'demonstração' }]); };
  TR.lista = (incl = false) => VP.db.lista('termosResp', incl);
  TR.prazoDias = () => Number(VP.config().prazoTermoDias) || 15;
  TR.vencido = (t) => t.situacao === 'aguardando' && t.prazo < hoje();
  TR.situacaoTexto = (t) => (t.situacao === 'assinado' ? 'Assinado' : t.situacao === 'cancelado' ? 'Cancelado' : TR.vencido(t) ? 'Vencido' : 'Aguardando assinatura');
  TR.doBem = (bemId) => TR.lista().filter((t) => t.situacao === 'aguardando' && (t.bens || []).includes(bemId));
  TR.proximoNumero = () => `${TR.lista(true).filter((t) => String(t.numero).endsWith('/' + hoje().slice(0, 4))).length + 1}/${hoje().slice(0, 4)}`;

  // Abre termos "aguardando assinatura": um por responsável. Não grava se não houver responsável.
  // O termo anterior do mesmo bem que ainda aguardava fica "cancelado" (o bem mudou de mãos antes de assinar).
  TR.montar = (bens, origem) => {
    const porResp = new Map();
    for (const b of bens) { if (!b || !b.responsavelId || b.status === 'baixado') continue; if (!porResp.has(b.responsavelId)) porResp.set(b.responsavelId, []); porResp.get(b.responsavelId).push(b); }
    const novos = [], cancelados = [];
    let n = TR.lista(true).filter((t) => String(t.numero).endsWith('/' + hoje().slice(0, 4))).length;
    for (const [resp, lista] of porResp) {
      for (const ant of TR.lista().filter((t) => t.situacao === 'aguardando' && t.bens.some((id) => lista.some((b) => b.id === id)))) {
        if (ant.responsavelId === resp) continue;
        if (!cancelados.includes(ant)) { ant.situacao = 'cancelado'; ant.canceladoEm = hoje(); hist(ant, `Cancelado: bem passou para ${VP.nome('responsaveis', resp)} antes da assinatura`); cancelados.push(ant); }
      }
      const jaAguardando = TR.lista().find((t) => t.situacao === 'aguardando' && t.responsavelId === resp && lista.every((b) => t.bens.includes(b.id)));
      if (jaAguardando) continue;
      const t = { id: u.id(), numero: `${++n}/${hoje().slice(0, 4)}`, responsavelId: resp, unidadeId: lista[0].unidadeId || '', bens: lista.map((b) => b.id), origem, emitidoEm: hoje(), prazo: u.somaDias(hoje(), TR.prazoDias()), situacao: 'aguardando', historico: [] };
      hist(t, `Termo aberto (${origem}) — prazo de ${TR.prazoDias()} dias para devolver assinado`);
      novos.push(t);
    }
    return { novos, cancelados };
  };
  TR.abrir = async (bens, origem) => {
    const r = TR.montar(bens, origem);
    if (r.novos.length || r.cancelados.length) await VP.db.gravar('termosResp', r.novos.concat(r.cancelados));
    return r.novos;
  };
  TR.imprimir = (t) => VP.documentos.termoResponsabilidade(t.bens.map((id) => VP.db.pega('bens', id)).filter(Boolean), t.responsavelId);

  // Termo assinado: anexa no termo e em cada bem (tipo "Termo de responsabilidade assinado") e fecha a pendência
  TR.anexarAssinado = (t, depois) => ui.formulario({
    titulo: `Termo ${t.numero}: anexar assinado`, largura: 'media', textoSalvar: 'Anexar e fechar a pendência',
    intro: `<p class="ajuda">${esc(VP.nome('responsaveis', t.responsavelId))} · ${t.bens.length} bem(ns). O arquivo (foto ou PDF do termo assinado) fica no termo e na ficha de cada bem.</p>`,
    campos: [{ chave: 'arquivos', rotulo: 'Termo assinado (foto ou PDF)', tipo: 'arquivo', aceita: 'image/*,application/pdf', obrigatorio: true }, { chave: 'data', rotulo: 'Data da assinatura', tipo: 'data', padrao: hoje(), obrigatorio: true }],
    salvar: async (v) => {
      const arqs = v.arquivos?.length ? await ui.lerArquivos(v.arquivos) : [];
      if (!arqs.length) return 'Escolha o arquivo do termo assinado.';
      const a = Object.assign(arqs[0], { tipoAnexo: 'Termo de responsabilidade assinado', descricao: `Termo ${t.numero}` });
      t.situacao = 'assinado'; t.assinado = { data: v.data, anexo: a }; hist(t, `Termo assinado anexado (${a.nome})`);
      const bens = t.bens.map((id) => VP.db.pega('bens', id)).filter(Boolean);
      const evs = [];
      for (const b of bens) {
        b.anexos = (b.anexos || []).concat([Object.assign({}, a, { id: u.id() })]);
        evs.push(VP.novoEvento(b.id, 'observacao', { data: v.data, descricao: `Termo de responsabilidade ${t.numero} assinado por ${VP.nome('responsaveis', t.responsavelId)} (anexado)` }));
      }
      await VP.db.gravarVarias({ termosResp: [t], bens, eventos: evs });
      ui.aviso('Termo assinado anexado. Pendência fechada.');
      depois && depois();
    }
  });

  // Recebimento: quem recebeu, quando, e a foto/arquivo do documento de recebimento assinado
  TR.recebimento = (bens, depois) => ui.formulario({
    titulo: `Registrar recebimento — ${bens.length} bem(ns)`, largura: 'media', textoSalvar: 'Registrar',
    campos: [
      { chave: 'recebidoPor', rotulo: 'Recebido por', obrigatorio: true, placeholder: 'Nome de quem recebeu' },
      { chave: 'data', rotulo: 'Data do recebimento', tipo: 'data', padrao: hoje(), obrigatorio: true, largura: 'meia' },
      { chave: 'documento', rotulo: 'Documento (nota, empenho)', largura: 'meia' },
      { chave: 'arquivos', rotulo: 'Foto do documento de recebimento assinado', tipo: 'arquivo', aceita: 'image/*,application/pdf' },
      { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
    salvar: async (v) => {
      const arqs = v.arquivos?.length ? await ui.lerArquivos(v.arquivos) : [];
      const evs = [];
      for (const b of bens) {
        for (const a of arqs) b.anexos = (b.anexos || []).concat([Object.assign({}, a, { id: u.id(), tipoAnexo: 'Outro', descricao: `Recebimento assinado por ${v.recebidoPor}` })]);
        b.recebimento = { por: v.recebidoPor, data: v.data, documento: v.documento || '' };
        evs.push(VP.novoEvento(b.id, 'recebimento', { data: v.data, descricao: `Recebido por ${v.recebidoPor}${v.documento ? ' · ' + v.documento : ''}${arqs.length ? ' (documento assinado anexado)' : ''}${v.observacao ? ' · ' + v.observacao : ''}`, extra: { recebidoPor: v.recebidoPor, documento: v.documento || '' } }));
      }
      await VP.db.gravarVarias({ bens, eventos: evs });
      ui.aviso('Recebimento registrado.');
      depois && depois();
    }
  });

  // ------------------------------------------------------------------ tela
  T.termos = (_, query = {}) => {
    const f = VP.estado.filtroTermos = VP.estado.filtroTermos || { situacao: 'aguardando' };
    if (query.situacao) f.situacao = query.situacao;
    let l = TR.lista().sort((a, b) => String(b.emitidoEm).localeCompare(String(a.emitidoEm)));
    if (f.situacao === 'aguardando') l = l.filter((t) => t.situacao === 'aguardando');
    else if (f.situacao === 'vencidos') l = l.filter(TR.vencido);
    else if (f.situacao === 'assinados') l = l.filter((t) => t.situacao === 'assinado');
    const ag = TR.lista().filter((t) => t.situacao === 'aguardando');
    const G = VP.graficos;
    return {
      titulo: 'Termos de responsabilidade',
      html: `<p class="ajuda">Quando alguém passa a ser responsável por bens (novo bem, nota fiscal, transferência ou troca de responsável), o sistema abre um termo <b>aguardando assinatura</b>, com prazo de ${TR.prazoDias()} dias (Configurações). Imprima, entregue e, quando voltar assinado, anexe: a pendência fecha e o termo fica na ficha de cada bem. <i>Envio automático por e-mail: previsto para depois.</i></p>
        <div class="resumo-linha">${G.numero('Aguardando assinatura', u.inteiro(ag.length))}${G.numero('Vencidos', u.inteiro(ag.filter(TR.vencido).length))}${G.numero('Assinados', u.inteiro(TR.lista().filter((t) => t.situacao === 'assinado').length))}</div>
        <div class="linha-filtros"><label>Mostrar <select data-ft><option value="aguardando" ${f.situacao === 'aguardando' ? 'selected' : ''}>Aguardando assinatura</option><option value="vencidos" ${f.situacao === 'vencidos' ? 'selected' : ''}>Vencidos</option><option value="assinados" ${f.situacao === 'assinados' ? 'selected' : ''}>Assinados</option><option value="todos" ${f.situacao === 'todos' ? 'selected' : ''}>Todos</option></select></label></div>
        ${ui.tabela({ id: 'termos', linhas: l, nomePlanilha: 'termos-de-responsabilidade', vazio: 'Nenhum termo neste filtro.', colunas: [
          { chave: 'numero', titulo: 'Termo' },
          { chave: 'resp', titulo: 'Responsável', valor: (t) => VP.nome('responsaveis', t.responsavelId) },
          { chave: 'unidade', titulo: 'Unidade', valor: (t) => VP.nome('unidades', t.unidadeId) },
          { chave: 'qtd', titulo: 'Bens', num: true, valor: (t) => t.bens.length },
          { chave: 'origem', titulo: 'Origem' },
          { chave: 'emitidoEm', titulo: 'Aberto em', valor: (t) => u.data(t.emitidoEm), ordenar: (t) => t.emitidoEm },
          { chave: 'prazo', titulo: 'Prazo', valor: (t) => u.data(t.prazo), ordenar: (t) => t.prazo, html: (t) => (TR.vencido(t) ? `<b class="erro-txt">${u.data(t.prazo)}</b>` : u.data(t.prazo)) },
          { chave: 'sit', titulo: 'Situação', valor: (t) => TR.situacaoTexto(t) },
          { chave: '_acoes', titulo: '', html: (t) => `<button class="botao pequeno" data-termo-imp="${esc(t.id)}">Imprimir</button>${t.situacao === 'aguardando' && pode() ? ` <button class="botao pequeno primario" data-termo-ass="${esc(t.id)}">Anexar assinado</button>` : ''}${t.situacao === 'assinado' && t.assinado?.anexo ? ` <a class="botao pequeno" href="${esc(t.assinado.anexo.dataURL || '#')}" download="${esc(t.assinado.anexo.nome)}">Ver assinado</a>` : ''}` }] })}`,
      ligar() {
        const re = () => VP.app.render();
        ui.ligarTabela('termos');
        document.querySelector('[data-ft]').addEventListener('change', (e) => { f.situacao = e.target.value; re(); });
        document.getElementById('conteudo').onclick = (e) => {
          const i = e.target.closest('[data-termo-imp]'); if (i) return TR.imprimir(VP.db.pega('termosResp', i.dataset.termoImp));
          const a = e.target.closest('[data-termo-ass]'); if (a) return TR.anexarAssinado(VP.db.pega('termosResp', a.dataset.termoAss), re);
        };
      }
    };
  };
})();
