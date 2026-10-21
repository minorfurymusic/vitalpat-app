/* VitalPat Patrimônio · Gestão — baixa em lote (leilão, doação ou outro destino de vários bens de uma vez).
   Os bens inservíveis normalmente saem por leilão: monta-se um lote, incluem-se os bens, anexa-se a ata
   (foto ou PDF) e confirma-se. Cada bem recebe a baixa (sai da lista de bens em uso), mas NUNCA é apagado:
   continua consultável, com a ata ligada ao lote e o histórico. Antes de confirmar, o lote pode ser editado. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, ui = VP.ui, L = VP.LISTAS, esc = u.esc;
  const T = VP.telas;
  const LB = VP.baixaLote = {};
  const pode = () => !VP.servidor?.ativo || VP.servidor.podeAlterar();
  const ano = () => VP.Plataforma.hoje().slice(0, 4);
  LB.lista = (incl = false) => VP.db.lista('lotesBaixa', incl);
  LB.proximoNumero = () => `${LB.lista(true).filter((x) => String(x.numero).endsWith('/' + ano())).length + 1}/${ano()}`;
  LB.SITUACAO = { rascunho: 'Em montagem', confirmado: 'Baixa confirmada' };
  const bensDo = (lote) => (lote.bens || []).map((id) => VP.db.pega('bens', id)).filter(Boolean);
  const hist = (x, descricao) => { x.historico = (x.historico || []).concat([{ data: VP.Plataforma.agoraISO(), descricao, usuario: VP.sessao?.usuario || 'demonstração' }]); };
  // bem já incluído em outro lote ainda em montagem
  const emOutroLote = (bemId, loteId) => LB.lista().find((l) => l.id !== loteId && l.situacao === 'rascunho' && (l.bens || []).includes(bemId));
  const opcMotivos = () => VP.db.lista('motivos').filter((m) => m.tipo === 'baixa').map((m) => [m.nome, m.nome]);

  const camposLote = () => [
    { chave: 'numero', rotulo: 'Número do lote', obrigatorio: true, largura: 'meia' },
    { chave: 'tipoBaixa', rotulo: 'Tipo de baixa', tipo: 'select', opcoes: L.tiposBaixa.map((x) => [x, x]), vazio: false, largura: 'meia' },
    { chave: 'descricao', rotulo: 'Descrição', placeholder: 'Ex.: Leilão de bens inservíveis — veículos e móveis', obrigatorio: true },
    { chave: 'edital', rotulo: 'Edital / processo', largura: 'meia' },
    { chave: 'data', rotulo: 'Data do leilão (ou da baixa)', tipo: 'data', padrao: VP.Plataforma.hoje(), obrigatorio: true, largura: 'meia' },
    { chave: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: opcMotivos(), largura: 'meia' },
    { chave: 'avaliacao', rotulo: 'Avaliação prévia (laudo nº)', largura: 'meia' },
    { chave: 'justificativa', rotulo: 'Justificativa de interesse público', tipo: 'area' },
    { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }];

  LB.novo = () => ui.formulario({
    titulo: 'Novo lote de baixa', largura: 'media', valores: { numero: LB.proximoNumero(), tipoBaixa: 'Alienação (leilão)', descricao: 'Leilão de bens inservíveis' },
    intro: '<p class="ajuda">Monte o lote, inclua os bens e anexe a ata. A baixa só acontece quando você <b>confirmar</b>; até lá dá para mudar tudo.</p>',
    campos: camposLote(), textoSalvar: 'Criar lote',
    salvar: async (v) => {
      if (LB.lista().some((x) => x.numero === v.numero)) return 'Já existe lote com este número.';
      const x = Object.assign({ id: u.id(), situacao: 'rascunho', bens: [], valores: {}, ata: [], historico: [], criadoEm: VP.Plataforma.agoraISO() }, v);
      hist(x, 'Lote criado');
      await VP.db.gravar('lotesBaixa', x);
      VP.app.ir('#baixa-lote/' + x.id);
    }
  });

  LB.incluir = async (lote, bens) => {
    const ok = [], falhas = [];
    for (const b of bens) {
      const nome = `${b.plaqueta} · ${b.descricao}`;
      const outro = emOutroLote(b.id, lote.id);
      if (b.excluido) falhas.push({ item: nome, motivo: 'Está na Lixeira' });
      else if (b.status === 'baixado') falhas.push({ item: nome, motivo: 'Já baixado' });
      else if ((lote.bens || []).includes(b.id)) falhas.push({ item: nome, motivo: 'Já está neste lote' });
      else if (outro) falhas.push({ item: nome, motivo: `Já está no lote ${outro.numero}` });
      else { lote.bens.push(b.id); ok.push(nome); }
    }
    if (ok.length) { hist(lote, `${ok.length} bem(ns) incluído(s)`); await VP.db.gravar('lotesBaixa', lote); }
    return { ok, falhas };
  };

  // Confirma a baixa de todos os bens do lote. Nada é apagado: cada bem fica "Baixado", com a baixa e o lote no histórico.
  LB.confirmar = async (lote) => {
    const bens = bensDo(lote);
    const precisaDoc = ['Alienação (leilão)', 'Doação', 'Permuta'].includes(lote.tipoBaixa);
    const faltam = [];
    if (!bens.length) faltam.push('incluir pelo menos um bem');
    if (!(lote.ata || []).length) faltam.push('anexar a ata (foto ou PDF)');
    if (precisaDoc && (!lote.avaliacao || !lote.justificativa)) faltam.push('informar a avaliação prévia e a justificativa (venda, doação e permuta — Lei 14.133/2021, art. 76)');
    if (!lote.motivo) faltam.push('escolher o motivo');
    if (faltam.length) return ui.resultado({ titulo: 'Ainda não dá para confirmar', falhas: faltam.map((f) => ({ item: 'Falta', motivo: f })) });
    const total = bens.reduce((t, b) => t + VP.saldo(b, lote.data).liquido, 0);
    const arrem = Object.values(lote.valores || {}).reduce((t, v) => t + (Number(v) || 0), 0);
    if (!await ui.confirmar(`Confirmar a baixa de <b>${bens.length} bem(ns)</b> do lote <b>${esc(lote.numero)}</b>?<br>Valor contábil que sai: <b>${u.moeda(total)}</b>${arrem ? ` · Valor arrematado: <b>${u.moeda(arrem)}</b>` : ''}<br><br>Os bens saem da lista de bens em uso. Nada é apagado: continuam consultáveis, com a ata ligada.`, { titulo: 'Confirmar baixa do lote', sim: 'Confirmar baixa', classe: 'perigo' })) return;
    const validos = [], falhas = [];
    for (const b of bens) {
      const nome = `${b.plaqueta} · ${b.descricao}`;
      if (b.status === 'baixado') falhas.push({ item: nome, motivo: 'Já estava baixado' });
      else if (lote.data < (b.dataIncorporacao || '')) falhas.push({ item: nome, motivo: `Data da baixa antes da incorporação (${u.data(b.dataIncorporacao)})` });
      else if (b.tipo === 'imovel' && precisaDoc) falhas.push({ item: nome, motivo: 'Imóvel: faça a baixa pela ficha (exige lei autorizativa)' });
      else validos.push(b);
    }
    const dados = { tipoBaixa: lote.tipoBaixa, motivo: lote.motivo, data: lote.data, documento: lote.edital || '', avaliacao: lote.avaliacao || '', justificativa: lote.justificativa || '', loteBaixaId: lote.id, loteNumero: lote.numero };
    const evs = validos.map((b) => {
      const s = VP.saldo(b, lote.data);
      b.status = 'baixado'; b.loteBaixaId = lote.id;
      return VP.novoEvento(b.id, 'baixa', { data: lote.data, valor: s.liquido, descricao: `Baixa — ${lote.tipoBaixa} · lote ${lote.numero}`, extra: Object.assign({ valorArrematado: lote.valores?.[b.id] ?? null }, dados) });
    });
    lote.situacao = 'confirmado'; lote.confirmadoEm = VP.Plataforma.agoraISO();
    lote.resultado = { baixados: validos.map((b) => b.id), falhas, valorContabil: u.r2 ? u.r2(total) : Math.round(total * 100) / 100 };
    hist(lote, `Baixa confirmada: ${validos.length} bem(ns)${falhas.length ? `, ${falhas.length} não` : ''}`);
    await VP.db.gravarVarias({ bens: validos, eventos: evs, lotesBaixa: [lote] });
    ui.resultado({ titulo: `Lote ${lote.numero}: baixa confirmada`, sucesso: validos.map((b) => `${b.plaqueta} · ${b.descricao}`), falhas,
      extra: validos.length && VP.config().termoDeBaixa ? '<p><button type="button" class="botao" data-termo-lote>Imprimir termo de baixa</button></p>' : '' });
    setTimeout(() => document.querySelector('[data-termo-lote]')?.addEventListener('click', () => VP.documentos.termoBaixa(validos, dados)), 50);
    VP.app.render();
  };

  // Da lista de bens: incluir os marcados num lote em montagem (ou num lote novo)
  LB.escolherLote = (bens, depois) => {
    const abertos = LB.lista().filter((l) => l.situacao === 'rascunho');
    ui.formulario({
      titulo: `Incluir ${bens.length} bem(ns) em lote de baixa`, largura: 'media', textoSalvar: 'Incluir',
      intro: abertos.length ? '' : '<p class="ajuda">Nenhum lote em montagem: será criado um lote novo.</p>',
      campos: [{ chave: 'loteId', rotulo: 'Lote', tipo: 'select', vazio: false, opcoes: abertos.map((l) => [l.id, `${l.numero} · ${l.descricao}`]).concat([['__novo', 'Criar lote novo']]) }],
      salvar: async (v) => {
        let lote = VP.db.pega('lotesBaixa', v.loteId);
        if (!lote) { lote = { id: u.id(), numero: LB.proximoNumero(), tipoBaixa: 'Alienação (leilão)', descricao: 'Leilão de bens inservíveis', data: VP.Plataforma.hoje(), situacao: 'rascunho', bens: [], valores: {}, ata: [], historico: [], criadoEm: VP.Plataforma.agoraISO() }; hist(lote, 'Lote criado pela lista de bens'); }
        const r = await LB.incluir(lote, bens);
        if (!r.ok.length) await VP.db.gravar('lotesBaixa', lote);
        ui.resultado({ titulo: `Lote ${lote.numero}`, sucesso: r.ok, falhas: r.falhas, extra: `<p><a class="botao" href="#baixa-lote/${esc(lote.id)}" onclick="document.querySelector('dialog.janela[open]')?.close()">Abrir o lote</a></p>` });
        depois && depois();
      }
    });
  };

  // ------------------------------------------------------------------ telas
  T['baixa-lote'] = (id) => (id ? telaLote(id) : telaLista());

  const telaLista = () => {
    const lotes = LB.lista().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const insv = VP.db.lista('bens').filter((b) => b.status === 'inservivel').length;
    return {
      titulo: 'Baixa em lote',
      acoes: pode() ? '<button class="botao primario" data-novo-lote>+ Novo lote</button>' : '',
      html: `<p class="ajuda">Para baixar vários bens de uma vez (normalmente os inservíveis vendidos em leilão): monte o lote, inclua os bens, anexe a ata do leilão (foto ou PDF) e confirme. Os bens saem da lista de bens em uso, mas <b>nunca são apagados</b>: ficam consultáveis, com a baixa e a ata no histórico.</p>
        <p><a class="botao" href="#bens/moveis?status=inservivel">Ver bens inservíveis (${u.inteiro(insv)})</a></p>
        ${ui.tabela({ id: 'lotes-baixa', linhas: lotes, nomePlanilha: 'lotes-de-baixa', vazio: 'Nenhum lote ainda.', colunas: [
          { chave: 'numero', titulo: 'Lote', html: (x) => `<a href="#baixa-lote/${esc(x.id)}">${esc(x.numero)}</a>`, valor: (x) => x.numero },
          { chave: 'descricao', titulo: 'Descrição' },
          { chave: 'tipoBaixa', titulo: 'Tipo' },
          { chave: 'data', titulo: 'Data', valor: (x) => u.data(x.data), ordenar: (x) => x.data },
          { chave: 'qtd', titulo: 'Bens', num: true, valor: (x) => (x.bens || []).length },
          { chave: 'ata', titulo: 'Ata', valor: (x) => ((x.ata || []).length ? 'Anexada' : 'Falta') },
          { chave: 'situacao', titulo: 'Situação', valor: (x) => LB.SITUACAO[x.situacao] || x.situacao }] })}`,
      ligar() {
        ui.ligarTabela('lotes-baixa');
        document.querySelector('[data-novo-lote]')?.addEventListener('click', () => LB.novo());
      }
    };
  };

  const telaLote = (id) => {
    const lote = VP.db.pega('lotesBaixa', id);
    if (!lote || lote.excluido) return { titulo: 'Baixa em lote', html: '<p class="aviso-inline">Lote não encontrado.</p><p><a class="botao" href="#baixa-lote">‹ Lotes</a></p>' };
    const aberto = lote.situacao === 'rascunho' && pode();
    const bens = bensDo(lote);
    const dataRef = lote.data || VP.Plataforma.hoje();
    const total = bens.reduce((t, b) => t + (b.status === 'baixado' && lote.situacao === 'confirmado' ? (VP.eventosDoBem(b.id).find((e) => e.tipo === 'baixa' && e.dados?.loteBaixaId === lote.id)?.valor || 0) : VP.saldo(b, dataRef).liquido), 0);
    const arrem = Object.values(lote.valores || {}).reduce((t, v) => t + (Number(v) || 0), 0);
    const insvFora = VP.db.lista('bens').filter((b) => b.status === 'inservivel' && !lote.bens.includes(b.id) && !emOutroLote(b.id, lote.id));
    const G = VP.graficos;
    return {
      titulo: `Lote de baixa ${lote.numero}`,
      acoes: `<a class="botao" href="#baixa-lote">‹ Lotes</a>${aberto ? ' <button class="botao" data-editar-lote>Editar dados</button> <button class="botao perigo" data-excluir-lote>Excluir lote</button>' : ''}`,
      html: `
        <div class="resumo-linha">${G.numero('Situação', LB.SITUACAO[lote.situacao])}${G.numero('Bens', u.inteiro(bens.length))}${G.numero('Valor contábil', u.moeda(total))}${G.numero('Valor arrematado', u.moeda(arrem))}</div>
        <section class="cartao secao"><h3>Dados do lote</h3><dl class="dados">
          <dt>Descrição</dt><dd>${esc(lote.descricao)}</dd><dt>Tipo de baixa</dt><dd>${esc(lote.tipoBaixa)}</dd><dt>Data</dt><dd>${u.data(lote.data)}</dd>
          <dt>Edital / processo</dt><dd>${esc(lote.edital || '—')}</dd><dt>Motivo</dt><dd>${esc(lote.motivo || '—')}</dd><dt>Avaliação prévia</dt><dd>${esc(lote.avaliacao || '—')}</dd>
          <dt>Justificativa</dt><dd>${esc(lote.justificativa || '—')}</dd>${lote.observacao ? `<dt>Observação</dt><dd>${esc(lote.observacao)}</dd>` : ''}</dl></section>
        <section class="cartao secao" id="ata-lote"><h3>Ata do leilão (foto ou PDF)</h3>
          ${(lote.ata || []).length ? `<ul class="lista-anexos">${lote.ata.map((a) => `<li><a href="${esc(a.dataURL || a.url || '#')}" download="${esc(a.nome)}" target="_blank" rel="noopener">${esc(a.nome)}</a> <small>${u.data(a.data)}</small>${aberto ? ` <button class="botao pequeno" data-tirar-ata="${esc(a.id)}">Tirar</button>` : ''}</li>`).join('')}</ul>` : '<p class="aviso-inline">Nenhuma ata anexada ainda. Ela é obrigatória para confirmar a baixa.</p>'}
          ${aberto ? '<label class="botao">Anexar ata<input type="file" accept="image/*,application/pdf" multiple data-anexar-ata hidden></label>' : ''}
        </section>
        <section class="cartao secao"><h3>Bens do lote</h3>
          ${aberto ? `<div class="linha-filtros">
            <label>Plaquetas (separe com espaço, vírgula ou uma por linha) <textarea data-plaquetas rows="2" placeholder="Ex.: 1023 1045 1102"></textarea></label>
            <button class="botao" data-incluir-plaquetas>Incluir</button>
            ${insvFora.length ? `<button class="botao" data-incluir-inserviveis>Incluir todos os inservíveis (${u.inteiro(insvFora.length)})</button>` : ''}
          </div>` : ''}
          ${ui.tabela({ id: 'bens-lote', linhas: bens, nomePlanilha: 'lote-' + String(lote.numero).replace(/\W+/g, '-'), vazio: 'Nenhum bem no lote.', colunas: [
            { chave: 'plaqueta', titulo: 'Plaqueta', html: (b) => `<a href="#bem/${esc(b.id)}">${esc(b.plaqueta)}</a>`, valor: (b) => b.plaqueta },
            { chave: 'descricao', titulo: 'Descrição' },
            { chave: 'unidade', titulo: 'Unidade', valor: (b) => VP.nome('unidades', b.unidadeId) },
            { chave: 'situacao', titulo: 'Situação', valor: (b) => L.status[b.status] || b.status },
            { chave: 'estado', titulo: 'Estado', valor: (b) => L.estados[b.estado] || '' },
            { chave: 'contabil', titulo: 'Valor contábil', num: true, soma: true, valor: (b) => VP.saldo(b, dataRef).liquido, formato: u.moeda },
            { chave: 'arrematado', titulo: 'Valor arrematado', num: true, valor: (b) => Number(lote.valores?.[b.id]) || 0, formato: u.moeda, html: (b) => (aberto ? `<input class="campo-valor" inputmode="decimal" data-arrematado="${esc(b.id)}" value="${lote.valores?.[b.id] != null ? esc(String(lote.valores[b.id]).replace('.', ',')) : ''}" aria-label="Valor arrematado">` : u.moeda(Number(lote.valores?.[b.id]) || 0)) },
            ...(aberto ? [{ chave: '_tirar', titulo: '', html: (b) => `<button class="botao pequeno" data-tirar-bem="${esc(b.id)}">Tirar</button>` }] : [])] })}
        </section>
        ${aberto ? '<p class="linha-botoes"><button class="botao primario" data-confirmar-lote>Confirmar baixa do lote</button></p>' : lote.situacao === 'confirmado' ? `<p class="linha-botoes"><button class="botao" data-termo-lote2>Imprimir termo de baixa</button> <span class="ajuda">Confirmado em ${u.data(String(lote.confirmadoEm).slice(0, 10))}.</span></p>` : ''}
        <section class="cartao secao"><h3>Histórico do lote</h3><ul class="lista-simples">${(lote.historico || []).map((h) => `<li>${esc(new Date(h.data).toLocaleString('pt-BR'))} · ${esc(h.descricao)} <small>${esc(h.usuario || '')}</small></li>`).join('')}</ul></section>`,
      ligar() {
        const re = () => VP.app.render();
        ui.ligarTabela('bens-lote');
        document.querySelector('[data-editar-lote]')?.addEventListener('click', () => ui.formulario({ titulo: `Editar lote ${lote.numero}`, largura: 'media', valores: lote, campos: camposLote(), salvar: async (v) => {
          if (LB.lista().some((x) => x.numero === v.numero && x.id !== lote.id)) return 'Já existe lote com este número.';
          Object.assign(lote, v); hist(lote, 'Dados do lote alterados'); await VP.db.gravar('lotesBaixa', lote); re();
        } }));
        document.querySelector('[data-excluir-lote]')?.addEventListener('click', async () => {
          if (!await ui.confirmar(`Mover o lote <b>${esc(lote.numero)}</b> para a Lixeira? Os bens continuam como estão (nenhuma baixa foi feita).`, { sim: 'Mover para a Lixeira', classe: 'perigo' })) return;
          lote.excluido = true; lote.excluidoEm = VP.Plataforma.agoraISO(); hist(lote, 'Lote movido para a Lixeira');
          await VP.db.gravar('lotesBaixa', lote); VP.app.ir('#baixa-lote');
        });
        document.querySelector('[data-incluir-plaquetas]')?.addEventListener('click', async () => {
          const pls = document.querySelector('[data-plaquetas]').value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
          if (!pls.length) return ui.aviso('Digite pelo menos uma plaqueta.', 'erro');
          const porPl = new Map(VP.db.lista('bens', true).map((b) => [String(b.plaqueta), b]));
          const achados = pls.map((p) => porPl.get(p)).filter(Boolean);
          const r = await LB.incluir(lote, achados);
          r.falhas.push(...pls.filter((p) => !porPl.has(p)).map((p) => ({ item: `Plaqueta ${p}`, motivo: 'Não existe' })));
          ui.resultado({ titulo: 'Incluir bens no lote', sucesso: r.ok, falhas: r.falhas }); re();
        });
        document.querySelector('[data-incluir-inserviveis]')?.addEventListener('click', async () => {
          const r = await LB.incluir(lote, insvFora);
          ui.resultado({ titulo: 'Incluir bens inservíveis', sucesso: r.ok, falhas: r.falhas }); re();
        });
        document.querySelectorAll('[data-tirar-bem]').forEach((el) => el.addEventListener('click', async () => {
          lote.bens = lote.bens.filter((x) => x !== el.dataset.tirarBem); delete (lote.valores || {})[el.dataset.tirarBem];
          const b = VP.db.pega('bens', el.dataset.tirarBem); hist(lote, `Tirado do lote: ${b?.plaqueta || ''} · ${b?.descricao || ''}`);
          await VP.db.gravar('lotesBaixa', lote); re();
        }));
        document.querySelectorAll('[data-arrematado]').forEach((el) => el.addEventListener('change', async () => {
          const v = u.num(el.value); lote.valores = lote.valores || {};
          if (v == null) delete lote.valores[el.dataset.arrematado]; else lote.valores[el.dataset.arrematado] = v;
          await VP.db.gravar('lotesBaixa', lote);
        }));
        document.querySelector('[data-anexar-ata]')?.addEventListener('change', async (e) => {
          const arqs = await ui.lerArquivos(e.target.files); e.target.value = '';
          if (!arqs.length) return;
          lote.ata = (lote.ata || []).concat(arqs.map((a) => Object.assign(a, { tipoAnexo: 'Ata do leilão' })));
          hist(lote, `Ata anexada: ${arqs.map((a) => a.nome).join(', ')}`);
          await VP.db.gravar('lotesBaixa', lote); ui.aviso('Ata anexada.'); re();
        });
        document.querySelectorAll('[data-tirar-ata]').forEach((el) => el.addEventListener('click', async () => {
          const a = lote.ata.find((x) => x.id === el.dataset.tirarAta);
          // a ata tirada não é apagada: fica guardada no histórico do lote
          lote.ataRetirada = (lote.ataRetirada || []).concat([Object.assign({}, a, { retiradaEm: VP.Plataforma.agoraISO() })]);
          lote.ata = lote.ata.filter((x) => x.id !== a.id); hist(lote, `Ata retirada: ${a.nome}`);
          await VP.db.gravar('lotesBaixa', lote); re();
        }));
        document.querySelector('[data-confirmar-lote]')?.addEventListener('click', () => LB.confirmar(lote));
        document.querySelector('[data-termo-lote2]')?.addEventListener('click', () => VP.documentos.termoBaixa((lote.resultado?.baixados || []).map((x) => VP.db.pega('bens', x)).filter(Boolean), { tipoBaixa: lote.tipoBaixa, motivo: lote.motivo, data: lote.data, documento: lote.edital || '', avaliacao: lote.avaliacao || '', justificativa: lote.justificativa || '', loteNumero: lote.numero }));
      }
    };
  };
})();
