/* VitalPat Patrimônio · Gestão — unir cadastros do mesmo bem (duas plaquetas no mesmo bem).
   Comum no inventário: a plaqueta caiu, alguém colocou outra e o bem ficou com dois cadastros.
   A pessoa confere dado por dado, escolhe o que fica no cadastro que continua ativo, informa o motivo
   e desativa o outro (baixa "Cadastro duplicado"). Nada é apagado: os dois guardam no histórico que eram
   o mesmo bem, e a união pode ser desfeita. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, ui = VP.ui, L = VP.LISTAS, esc = u.esc;
  const UN = VP.unirCadastros = {};
  const pega = (o, c) => c.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const poe = (o, c, v) => { const p = c.split('.'); let x = o; while (p.length > 1) { const k = p.shift(); x[k] = x[k] || {}; x = x[k]; } x[p[0]] = v; };
  UN.TIPO_BAIXA = 'Cadastro duplicado (mesmo bem)';
  // Dados conferidos lado a lado. mostrar: como aparece; os demais são copiados como estão.
  UN.CAMPOS = [
    { c: 'descricao', t: 'Descrição' }, { c: 'complemento', t: 'Complemento' },
    { c: 'classificacaoId', t: 'Classificação', mostrar: (v) => VP.nome('classificacoes', v) },
    { c: 'unidadeId', t: 'Unidade', mostrar: (v) => VP.nome('unidades', v) }, { c: 'localizacao', t: 'Localização' },
    { c: 'responsavelId', t: 'Responsável', mostrar: (v) => (v ? VP.nome('responsaveis', v) : '') },
    { c: 'estado', t: 'Estado', mostrar: (v) => L.estados[v] || '' },
    { c: 'detalhes.marca', t: 'Marca' }, { c: 'detalhes.modelo', t: 'Modelo' }, { c: 'detalhes.serie', t: 'Número de série' }, { c: 'detalhes.cor', t: 'Cor' },
    { c: 'dataAquisicao', t: 'Data de aquisição', mostrar: (v) => u.data(v) },
    { c: 'fornecedorId', t: 'Fornecedor', mostrar: (v) => (v ? VP.nome('fornecedores', v) : '') },
    { c: 'nf.numero', t: 'Nota fiscal' }
  ];
  const txt = (f, b) => { const v = pega(b, f.c); return v == null || v === '' ? '—' : f.mostrar ? f.mostrar(v) || '—' : String(v); };

  // 1) pede a plaqueta do outro cadastro
  UN.abrir = (b) => ui.formulario({
    titulo: 'Unir cadastros do mesmo bem', largura: 'media', textoSalvar: 'Conferir',
    intro: `<p class="ajuda">Use quando o mesmo bem tem <b>dois cadastros</b> (duas plaquetas). Digite a plaqueta do outro cadastro: na próxima tela você confere dado por dado e escolhe o que fica.</p><p>Este cadastro: <b>${esc(b.plaqueta)}</b> · ${esc(b.descricao)}</p>`,
    campos: [{ chave: 'plaqueta', rotulo: 'Plaqueta do outro cadastro', obrigatorio: true }],
    salvar: (v) => {
      const pl = String(v.plaqueta).trim();
      const o = VP.db.lista('bens').find((x) => String(x.plaqueta) === pl);
      if (!o) return `Não há bem ativo com a plaqueta ${pl}.`;
      if (o.id === b.id) return 'É o mesmo cadastro.';
      if (o.status === 'baixado') return 'O outro cadastro já está baixado.';
      setTimeout(() => UN.conferir(b, o), 50);
    }
  });

  // 2) conferência lado a lado
  UN.conferir = (a, b) => {
    const linhas = UN.CAMPOS.map((f, i) => {
      const va = txt(f, a), vb = txt(f, b), igual = va === vb;
      return `<tr class="${igual ? '' : 'difere'}"><th>${esc(f.t)}</th>
        <td><label><input type="radio" name="u-${i}" value="a" ${igual || va !== '—' || vb === '—' ? 'checked' : ''}> ${esc(va)}</label></td>
        <td><label><input type="radio" name="u-${i}" value="b" ${!igual && va === '—' && vb !== '—' ? 'checked' : ''}> ${esc(vb)}</label></td></tr>`;
    }).join('');
    const corpo = `<p class="ajuda">Escolha, em cada linha, o dado que vai ficar no cadastro que continua ativo. As linhas em destaque são diferentes. O valor contábil do cadastro desativado sai pela baixa "${UN.TIPO_BAIXA}" (o bem estava contado duas vezes).</p>
      <div class="tabela-rolagem"><table class="tabela tabela-unir" data-sem-planilha><thead><tr><th></th><th>Plaqueta ${esc(a.plaqueta)}</th><th>Plaqueta ${esc(b.plaqueta)}</th></tr></thead><tbody>
        <tr><th>Fica ativo</th><td><label><input type="radio" name="fica" value="a" checked> Este (${esc(a.plaqueta)})</label></td><td><label><input type="radio" name="fica" value="b"> Este (${esc(b.plaqueta)})</label></td></tr>
        <tr><th>Valor contábil</th><td>${u.moeda(VP.saldo(a).liquido)}</td><td>${u.moeda(VP.saldo(b).liquido)}</td></tr>
        ${linhas}</tbody></table></div>
      <label>Motivo (obrigatório) <textarea data-unir-motivo rows="2" placeholder="Ex.: inventário 2026 achou as duas plaquetas no mesmo armário; a 1023 caiu e foi colocada a 4512"></textarea></label>
      <p class="erro-form" role="alert"></p>`;
    ui.modal({ titulo: 'Unir cadastros: conferir dado por dado', largura: 'grande', corpo, botoes: [{ texto: 'Cancelar' }, { texto: 'Unir e desativar o outro', classe: 'primario', fecha: false, acao: async (d, fechar) => {
      const motivo = d.querySelector('[data-unir-motivo]').value.trim();
      if (!motivo) { d.querySelector('.erro-form').textContent = 'Escreva o motivo.'; return false; }
      const fica = d.querySelector('input[name="fica"]:checked').value;
      const escolha = UN.CAMPOS.map((f, i) => d.querySelector(`input[name="u-${i}"]:checked`).value);
      const r = await UN.unir(fica === 'a' ? a : b, fica === 'a' ? b : a, UN.CAMPOS.map((f, i) => ({ c: f.c, de: (escolha[i] === fica) ? 'mantido' : 'outro' })), motivo);
      fechar();
      ui.resultado({ titulo: 'Cadastros unidos', sucesso: r });
      VP.app.ir('#bem/' + (fica === 'a' ? a.id : b.id));
    } }] });
  };

  // 3) une: K continua, O é desativado (baixa). escolhas: [{ c, de: 'mantido' | 'outro' }]
  UN.unir = async (K, O, escolhas, motivo) => {
    const hoje = VP.Plataforma.hoje();
    const antesK = {}, mudancas = [];
    for (const e of escolhas.filter((x) => x.de === 'outro')) {
      const f = UN.CAMPOS.find((x) => x.c === e.c);
      const va = pega(K, e.c), vo = pega(O, e.c);
      if (String(va ?? '') === String(vo ?? '')) continue;
      antesK[e.c] = va ?? null; poe(K, e.c, vo);
      mudancas.push({ campo: f.t, antes: va == null || va === '' ? '—' : f.mostrar ? f.mostrar(va) : va, depois: vo == null || vo === '' ? '—' : f.mostrar ? f.mostrar(vo) : vo });
    }
    VP.registrarPlaquetaAnterior(K, { plaqueta: O.plaqueta, data: hoje, motivo: 'Duas plaquetas no mesmo bem (cadastros unidos)', observacao: motivo });
    for (const p of VP.plaquetasAnteriores(O)) if (!VP.plaquetasAnteriores(K).some((x) => String(x.plaqueta) === String(p.plaqueta))) VP.registrarPlaquetaAnterior(K, Object.assign({}, p, { observacao: `${p.observacao || ''} (veio do cadastro ${O.plaqueta})`.trim() }));
    K.fotos = (K.fotos || []).concat((O.fotos || []).filter((f) => !(K.fotos || []).some((x) => x.id === f.id)));
    K.anexos = (K.anexos || []).concat((O.anexos || []).filter((f) => !(K.anexos || []).some((x) => x.id === f.id)));
    const uniao = { id: u.id(), bemId: O.id, codigo: O.codigo, plaqueta: O.plaqueta, data: hoje, motivo, antesK, statusO: O.status, usuario: VP.sessao?.usuario || 'demonstração' };
    K.unioes = (K.unioes || []).concat([uniao]);
    const s = VP.saldo(O, hoje);
    O.status = 'baixado'; O.unidoA = K.id;
    const evBaixa = VP.novoEvento(O.id, 'baixa', { data: hoje, valor: s.liquido, descricao: `Baixa — ${UN.TIPO_BAIXA}: é o mesmo bem que a plaqueta ${K.plaqueta}`, extra: { tipoBaixa: UN.TIPO_BAIXA, motivo, data: hoje, bemMantidoId: K.id, uniaoId: uniao.id } });
    uniao.eventoBaixaId = evBaixa.id;
    const evK = VP.novoEvento(K.id, 'alteracao', { data: hoje, descricao: `Unido com o cadastro ${O.codigo} (plaqueta ${O.plaqueta}): era o mesmo bem. Motivo: ${motivo}`, extra: { mudancas, uniaoId: uniao.id, bemDesativadoId: O.id } });
    await VP.db.gravarVarias({ bens: [K, O], eventos: [evBaixa, evK] });
    return [`Continua ativo: ${K.plaqueta} · ${K.descricao}${mudancas.length ? ` (${mudancas.length} dado(s) trazidos do outro)` : ''}`, `Desativado (baixa "${UN.TIPO_BAIXA}"): ${O.plaqueta} · ${O.descricao}`, 'Os dois guardam no histórico que eram o mesmo bem, com o motivo.'];
  };

  // Desfazer: o outro cadastro volta como estava (baixa estornada) e os dados trazidos voltam ao que eram
  UN.desfazer = async (K, uniaoId) => {
    const un = (K.unioes || []).find((x) => x.id === uniaoId && !x.desfeitaEm);
    const O = un && VP.db.pega('bens', un.bemId);
    if (!un || !O) return false;
    for (const [c, v] of Object.entries(un.antesK || {})) poe(K, c, v);
    const evB = VP.db.pega('eventos', un.eventoBaixaId);
    const evs = [];
    if (evB && !evB.cancelado) { evB.cancelado = true; evB.motivoCancelamento = 'União de cadastros desfeita'; evB.canceladoEm = VP.Plataforma.agoraISO(); evs.push(evB, VP.novoEvento(O.id, 'estorno', { valor: evB.valor, descricao: 'Estorno da baixa "Cadastro duplicado": união desfeita', extra: { eventoId: evB.id } })); }
    O.status = un.statusO || 'ativo'; delete O.unidoA;
    un.desfeitaEm = VP.Plataforma.agoraISO();
    evs.push(VP.novoEvento(K.id, 'alteracao', { descricao: `União com o cadastro ${O.plaqueta} desfeita (a plaqueta ${O.plaqueta} continua no registro de plaquetas anteriores, marcada como desfeita)` }));
    for (const p of K.plaquetasAnteriores || []) if (String(p.plaqueta) === String(O.plaqueta) && !p.desfeitaEm) { p.desfeitaEm = VP.Plataforma.hoje(); p.observacao = `${p.observacao || ''} · união desfeita`.trim(); }
    if (String(K.plaquetaAnterior) === String(O.plaqueta)) K.plaquetaAnterior = '';
    await VP.db.gravarVarias({ bens: [K, O], eventos: evs });
    return true;
  };
})();
