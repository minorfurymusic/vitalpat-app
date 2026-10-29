/* VitalPat Patrimônio · Gestão — avaliações do imóvel (29/10/2026, pedido do usuário).
   Quem avalia: comissão de servidores (patrimônio, jurídico, engenharia) ou avaliador(es) profissional(is): engenheiro ou
   arquiteto (laudo pela ABNT NBR 14653, com ART/RRT) e/ou corretor de imóveis (PTAM, Resolução COFECI 1.066/2007).
   [A conferir] a aceitação do PTAM de corretor pelo órgão de controle: a engenharia defende que o laudo é privativo de
   engenheiro/arquiteto; há decisões de tribunais regionais aceitando o corretor. A avaliação guarda o parecer, os arquivos
   (laudo em PDF, fotos) e os valores; "Aplicar como reavaliação" usa o mesmo lançamento da tela Reavaliação (dá para desfazer lá). */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui;
  const AV = VP.avaliacoesImovel = {};
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  AV.TIPOS = { comissao: 'Comissão de avaliação (servidores)', profissional: 'Avaliador(es) profissional(is)' };
  AV.PROFISSOES = { engenheiro: 'Engenheiro(a) — CREA, laudo com ART', arquiteto: 'Arquiteto(a) — CAU, laudo com RRT', corretor: 'Corretor(a) de imóveis — CRECI, PTAM', outro: 'Outro' };
  AV.FINALIDADES = ['Reavaliação contábil', 'Venda / alienação', 'Compra', 'Locação', 'Doação ou permuta', 'Seguro', 'Outra'];
  AV.METODOS = ['Comparativo direto de dados de mercado', 'Evolutivo (terreno + construção)', 'Capitalização da renda', 'Custo de reedição', 'Involutivo', 'Outro'];
  const MAX = 3; // avaliadores profissionais por avaliação

  AV.daBem = (bemId) => VP.db.lista('avaliacoesImovel').filter((a) => a.bemId === bemId).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  // aplicada de verdade: o lançamento da reavaliação existe e não foi desfeito na tela Reavaliação
  AV.aplicada = (a) => !!a.aplicada && VP.db.lista('eventos').some((e) => e.loteId === a.aplicada.loteId && !e.cancelado);
  AV.vencida = (a) => !!a.validade && a.validade < hoje();
  AV.quem = (a) => (a.tipo === 'comissao' ? `Comissão: ${VP.nome('comissoes', a.comissaoId) || 'não informada'}` : (a.avaliadores || []).map((x) => `${x.nome} (${(AV.PROFISSOES[x.profissao] || '').split(' — ')[0]}${x.registro ? ', ' + x.registro : ''})`).join('; '));

  AV.nova = (b, depois) => {
    const temCorretor = 'Corretor de imóveis faz o PTAM (parecer de avaliação mercadológica). Para a prefeitura, o órgão de controle costuma pedir laudo de engenheiro ou arquiteto (ABNT NBR 14653, com ART/RRT); o PTAM de corretor é aceito por parte dos tribunais, mas é tema discutido [a conferir].';
    const campos = [
      { chave: 'data', rotulo: 'Data da avaliação', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'finalidade', rotulo: 'Finalidade', tipo: 'select', opcoes: AV.FINALIDADES.map((x) => [x, x]), vazio: false, largura: 'meia' },
      { chave: 'tipo', rotulo: 'Quem avaliou', tipo: 'select', opcoes: Object.entries(AV.TIPOS), vazio: false },
      { chave: 'comissaoId', rotulo: 'Comissão (se foi comissão)', tipo: 'select', opcoes: VP.db.lista('comissoes').map((c) => [c.id, c.nome]), largura: 'meia' }, { chave: 'ato', rotulo: 'Ato que nomeou a comissão', largura: 'meia' },
      ...Array.from({ length: MAX }, (_, i) => [
        { chave: `n${i}`, rotulo: `Avaliador ${i + 1}: nome${i ? ' (opcional)' : ''}`, largura: 'meia' }, { chave: `p${i}`, rotulo: `Avaliador ${i + 1}: profissão`, tipo: 'select', opcoes: Object.entries(AV.PROFISSOES), largura: 'meia' },
        { chave: `r${i}`, rotulo: `Avaliador ${i + 1}: registro (CREA, CAU, CRECI nº)`, largura: 'meia' }, { chave: `d${i}`, rotulo: `Avaliador ${i + 1}: ART, RRT ou nº do PTAM`, largura: 'meia' }]).flat(),
      { chave: 'metodo', rotulo: 'Método (NBR 14653)', tipo: 'select', opcoes: AV.METODOS.map((x) => [x, x]), largura: 'meia' }, { chave: 'validade', rotulo: 'Válida até', tipo: 'data', largura: 'meia', ajuda: 'Data até quando o laudo vale (se o documento disser).' },
      { chave: 'valorTerreno', rotulo: 'Valor do terreno', tipo: 'moeda', largura: 'meia' }, { chave: 'valorConstrucoes', rotulo: 'Valor das construções', tipo: 'moeda', largura: 'meia' },
      { chave: 'valorTotal', rotulo: 'Valor total do imóvel', tipo: 'moeda', largura: 'meia', ajuda: 'Vazio = terreno + construções.' }, { chave: 'documento', rotulo: 'Nº do laudo, parecer ou processo', largura: 'meia' },
      { chave: 'parecer', rotulo: 'Parecer / conclusão', tipo: 'area', obrigatorio: true },
      { chave: 'arquivos', rotulo: 'Laudo, parecer, fotos e outros (PDF ou imagem)', tipo: 'arquivo', multiplo: true, aceita: 'image/*,application/pdf' }];
    ui.formulario({
      titulo: 'Avaliação do imóvel — ' + b.descricao, largura: 'media', textoSalvar: 'Guardar avaliação',
      intro: `<p class="ajuda">Guarde aqui a avaliação feita pela <b>comissão</b> (patrimônio, jurídico, engenharia) ou por <b>avaliadores</b> (engenheiro, arquiteto, corretor; um só ou vários), com o parecer, o laudo e as fotos. Guardar <b>não muda o valor</b> do imóvel: depois, use "Aplicar como reavaliação".</p><p class="ajuda">${esc(temCorretor)}</p>`,
      campos, valores: { data: hoje(), finalidade: 'Reavaliação contábil', tipo: 'comissao', p0: 'engenheiro' },
      salvar: async (v) => {
        const avaliadores = Array.from({ length: MAX }, (_, i) => ({ nome: (v[`n${i}`] || '').trim(), profissao: v[`p${i}`] || 'outro', registro: (v[`r${i}`] || '').trim(), docTecnico: (v[`d${i}`] || '').trim() })).filter((x) => x.nome);
        if (v.tipo === 'comissao' && !v.comissaoId) return 'Escolha a comissão (Cadastros → Comissões).';
        if (v.tipo === 'profissional' && !avaliadores.length) return 'Informe pelo menos um avaliador.';
        const semRegistro = avaliadores.filter((x) => ['engenheiro', 'arquiteto', 'corretor'].includes(x.profissao) && !x.registro);
        if (v.tipo === 'profissional' && semRegistro.length) return `Informe o registro no conselho (CREA, CAU ou CRECI) de: ${semRegistro.map((x) => x.nome).join(', ')}.`;
        const total = v.valorTotal != null && v.valorTotal !== '' ? Number(v.valorTotal) : r2((Number(v.valorTerreno) || 0) + (Number(v.valorConstrucoes) || 0));
        if (!(total > 0)) return 'Informe o valor total (ou o do terreno e o das construções).';
        if (v.validade && v.validade < v.data) return 'A validade não pode ser antes da data da avaliação.';
        const arquivos = await ui.lerArquivos(v.arquivos, { reduzirImagem: true });
        const a = { id: u.id(), bemId: b.id, data: v.data, finalidade: v.finalidade, tipo: v.tipo, comissaoId: v.tipo === 'comissao' ? v.comissaoId : '', ato: v.ato || VP.db.pega('comissoes', v.comissaoId)?.ato || '',
          avaliadores: v.tipo === 'profissional' ? avaliadores : [], metodo: v.metodo || '', validade: v.validade || '', valorTerreno: v.valorTerreno ?? null, valorConstrucoes: v.valorConstrucoes ?? null, valorTotal: total,
          documento: v.documento || '', parecer: v.parecer, arquivos, criadoEm: agora(), usuario: usuario() };
        await VP.db.gravarVarias({ avaliacoesImovel: [a], eventos: [VP.novoEvento(b.id, 'observacao', { data: v.data, descricao: `Avaliação do imóvel (${v.finalidade}): ${u.moeda(total)} · ${AV.quem(a)}`, extra: { avaliacaoId: a.id } })] });
        ui.aviso('Avaliação guardada. O valor do imóvel não mudou.'); depois && depois();
      }
    });
  };

  // Aplica a avaliação como reavaliação contábil: o mesmo lançamento (e o mesmo "desfazer") da tela Financeiro → Reavaliação
  AV.aplicar = (b, a, depois) => {
    const s = VP.saldo(b);
    ui.formulario({
      titulo: 'Aplicar como reavaliação — ' + b.descricao, largura: 'media', textoSalvar: 'Aplicar reavaliação',
      intro: `<p>Valor contábil hoje: <b>${u.moeda(s.liquido)}</b> → valor da avaliação: <b>${u.moeda(a.valorTotal)}</b> (diferença ${u.moeda(a.valorTotal - s.liquido)}).</p>${AV.vencida(a) ? `<p class="aviso-inline">Esta avaliação venceu em ${u.data(a.validade)}. Confira se ainda pode ser usada.</p>` : ''}${a.finalidade !== 'Reavaliação contábil' ? `<p class="aviso-inline">A finalidade desta avaliação é "${esc(a.finalidade)}", não reavaliação contábil. Confira com o setor contábil.</p>` : ''}`,
      campos: [{ chave: 'data', rotulo: 'Data da reavaliação', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'vidaUtilMeses', rotulo: 'Vida útil restante (meses)', tipo: 'numero', largura: 'meia', ajuda: 'Vazio = mantém a atual.' },
        { chave: 'residualPct', rotulo: 'Valor residual (%)', tipo: 'numero', largura: 'meia', ajuda: 'Vazio = mantém o atual (limitado ao novo valor).' }, { chave: 'okContabil', rotulo: 'O setor contábil aprovou', tipo: 'bool' }],
      valores: { data: a.data > hoje() ? hoje() : a.data },
      salvar: async (v) => {
        if (!v.okContabil) return 'A reavaliação só é aplicada com a aprovação do setor contábil.';
        if (v.data < (b.dataIncorporacao || '')) return 'A data não pode ser antes da incorporação.';
        const sd = VP.saldo(b, v.data);
        const residual = v.residualPct != null && v.residualPct !== '' ? r2(a.valorTotal * Number(v.residualPct) / 100) : Math.min(sd.residual, a.valorTotal);
        const loteId = 'reav-' + u.id(), laudo = a.documento || `Avaliação de ${u.data(a.data)}`;
        const ev = VP.novoEvento(b.id, 'reavaliacao', { data: v.data, valor: r2(a.valorTotal - sd.liquido), loteId, descricao: `Reavaliação — ${laudo} (${a.tipo === 'comissao' ? 'comissão' : 'avaliador'})`,
          extra: { valorAnterior: sd.liquido, valorNovo: a.valorTotal, vidaUtilMeses: v.vidaUtilMeses || sd.vidaUtilMeses, residual, laudo, comissaoId: a.comissaoId || '', avaliacaoId: a.id } });
        const reg = { id: loteId, loteId, data: v.data, laudo, comissaoId: a.comissaoId || '', qtd: 1, antes: sd.liquido, depois: a.valorTotal, situacao: 'aplicada', criadoEm: agora(), bens: [b.id], avaliacaoId: a.id };
        a.aplicada = { em: agora(), por: usuario(), loteId, data: v.data };
        if (a.valorTerreno != null && b.imovel) b.imovel.valorTerreno = a.valorTerreno;
        await VP.db.gravarVarias({ eventos: [ev], reavaliacoes: [reg], avaliacoesImovel: [a], bens: [b] });
        ui.resultado({ titulo: 'Reavaliação aplicada', sucesso: [`${b.codigo} · ${b.descricao}: ${u.moeda(sd.liquido)} → ${u.moeda(a.valorTotal)}`], falhas: [], extra: '<p>Para desfazer: Financeiro → Reavaliação, na lista das reavaliações aplicadas.</p>' });
        depois && depois();
      }
    });
  };

  AV.cartao = (b, pode) => {
    const l = AV.daBem(b.id);
    const arq = (x) => (x.arquivos || []).filter((f) => f.dataURL || f.caminho).map((f) => f.dataURL ? `<a href="${esc(f.dataURL)}" target="_blank" rel="noopener" download="${esc(f.nome || 'arquivo')}">${esc(f.nome || 'arquivo')}</a>` : esc(f.nome || 'arquivo')).join(' · ');
    return `<section class="cartao secao" id="sec-avaliacoes"><header><h3>Avaliações do imóvel</h3>${pode ? '<button class="botao pequeno" data-av-nova>+ Avaliação</button>' : ''}</header>
      ${l.length ? `<ul class="lista-conferencia">${l.map((a) => `<li><span class="conf-nome"><b>${u.moeda(a.valorTotal)}</b> · ${u.data(a.data)} · ${esc(a.finalidade)}<br><small>${esc(AV.quem(a))}${a.metodo ? ' · ' + esc(a.metodo) : ''}${a.documento ? ' · ' + esc(a.documento) : ''}</small>
          ${a.parecer ? `<br><small>${esc(a.parecer.length > 160 ? a.parecer.slice(0, 160) + '…' : a.parecer)}</small>` : ''}${(a.arquivos || []).length ? `<br><small>${arq(a)}</small>` : ''}</span>
        <span class="conf-acoes">${AV.aplicada(a) ? `<span class="selo-status im-bom">Aplicada em ${u.data(a.aplicada.data)}</span>` : AV.vencida(a) ? '<span class="selo-status im-ruim">Vencida</span>' : ''}${pode && !AV.aplicada(a) ? ` <button class="botao pequeno" data-av-aplicar="${esc(a.id)}">Aplicar como reavaliação</button>` : ''}</span></li>`).join('')}</ul>`
        : '<p class="vazio">Nenhuma avaliação. Guarde aqui o parecer da comissão ou o laudo dos avaliadores, com fotos.</p>'}</section>`;
  };
  AV.ligar = (b, re) => {
    const area = document.getElementById('conteudo');
    area.querySelector('[data-av-nova]')?.addEventListener('click', () => AV.nova(b, re));
    area.querySelectorAll('[data-av-aplicar]').forEach((el) => el.addEventListener('click', () => AV.aplicar(b, VP.db.pega('avaliacoesImovel', el.dataset.avAplicar), re)));
  };
})();
