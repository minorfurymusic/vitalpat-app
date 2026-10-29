/* VitalPat Patrimônio · Gestão — laudo técnico para baixa (28/10/2026).
   Modelo enviado pelo usuário (documentos reais de 2014 de um órgão estadual; nomes não copiados): uma comunicação de
   encaminhamento com a lista dos bens e um laudo por bem, com os dados do bem, a característica de inservível, o parecer
   técnico, quem fez, o chefe e o "Aprovo" da autoridade. O sistema preenche o que já está no cadastro; a pessoa escreve o parecer.
   Características: Ocioso, Recuperável, Antieconômico, Irrecuperável [A conferir: classificação do Decreto federal 9.373/2018;
   conferir a regra do município no PDF de legislação do usuário]. O laudo não dá baixa sozinho: a baixa continua sendo decisão da pessoa. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui;
  const LB = VP.laudosBaixa = {};
  const hoje = () => VP.Plataforma.hoje();
  LB.CARACTERISTICAS = {
    ocioso: ['Ocioso', 'Em condições de uso, mas sem aproveitamento pelo órgão.'],
    recuperavel: ['Recuperável', 'Com defeito, mas o conserto vale a pena (custo até metade do valor de mercado).'],
    antieconomico: ['Antieconômico', 'Conserto caro ou rendimento ruim por uso prolongado, desgaste ou obsolescência.'],
    irrecuperavel: ['Irrecuperável', 'Não pode mais ser usado: perdeu as características ou o conserto é inviável.']
  };
  const MAX_INDIVIDUAL = 15; // até este número de bens, cada um tem característica e parecer próprios
  // laudos já emitidos ficam no evento do bem (observação com extra.laudo): daí sai o próximo número e quem assinou da última vez
  LB.emitidos = () => VP.db.lista('eventos').filter((e) => !e.cancelado && e.dados?.laudo).map((e) => e.dados.laudo);
  LB.proximoNumero = (ano) => LB.emitidos().filter((l) => String(l.ano) === String(ano)).reduce((m, l) => Math.max(m, Number(l.numero) || 0), 0) + 1;
  const ultimo = () => LB.emitidos().sort((a, b) => String(b.emitidoEm || '').localeCompare(String(a.emitidoEm || '')))[0] || {};
  LB.ultimoDoBem = (bemId) => VP.eventosDoBem(bemId).filter((e) => e.dados?.laudo).map((e) => e.dados.laudo).pop() || null;

  const tipoDoBem = (b) => VP.nome('produtos', b.produtoId) || VP.db.pega('classificacoes', b.classificacaoId)?.nome || '';
  const anoInc = (b) => String(b.dataIncorporacao || b.dataAquisicao || '').slice(0, 4);
  const assinatura = (rotulo, nome) => `<div class="laudo-ass"><span></span><b>${esc(rotulo)}</b>${nome ? `<br>${esc(nome)}` : ''}</div>`;

  LB.html = (bens, v, itens) => {
    const ci = `<h1>Comunicação ${v.ci ? 'nº ' + esc(v.ci) : ''}</h1>
      <p>${esc(v.local || '')}${v.local ? ', ' : ''}${u.data(v.data)}</p><p>Para: <b>${esc(v.destino || '')}</b> · Assunto: <b>Laudos de baixa de bens</b></p>
      <p>Encaminhamos os bens da tabela abaixo para que sejam iniciados os procedimentos de baixa e retirados do termo de responsabilidade de quem responde pela guarda. Seguem os laudos técnicos que confirmam a situação de cada um.</p>
      <table class="tabela doc"><thead><tr><th>Item</th><th>Bem</th><th>Tombamento</th><th>Característica</th><th>Laudo</th></tr></thead><tbody>
      ${itens.map((x, i) => `<tr><td>${String(i + 1).padStart(2, '0')}</td><td>${esc(x.bem.descricao)}</td><td>${esc(x.bem.plaqueta || x.bem.codigo)}</td><td>${esc(LB.CARACTERISTICAS[x.car][0])}</td><td>${esc(x.numero)}/${esc(v.ano)}</td></tr>`).join('')}
      </tbody></table><div class="assinaturas">${['Responsável técnico'].map((r) => `<div><span></span>${r}${v.tecnico ? ' — ' + esc(v.tecnico) : ''}</div>`).join('')}</div>`;
    const laudos = itens.map((x) => {
      const b = x.bem, d = b.detalhes || {};
      return `<div class="laudo-pagina"><h1>Laudo técnico nº ${esc(x.numero)}/${esc(v.ano)}</h1><p><b>Assunto:</b> laudo técnico de bem para baixa patrimonial</p>
        <h2>Responsável técnico</h2><table class="tabela doc"><tbody><tr><th>Nome</th><td>${esc(v.tecnico || '')}</td><th>Matrícula</th><td>${esc(v.matricula || '')}</td></tr><tr><th>Função</th><td colspan="3">${esc(v.funcao || '')}</td></tr></tbody></table>
        <h2>Dados do bem</h2><table class="tabela doc"><tbody>
          <tr><th>Tipo</th><td>${esc(tipoDoBem(b))}</td><th>Marca</th><td>${esc(d.marca || '')}</td></tr>
          <tr><th>Modelo</th><td>${esc(d.modelo || '')}</td><th>Nº de série</th><td>${esc(d.serie || '')}</td></tr>
          <tr><th>Tombamento (plaqueta)</th><td>${esc(b.plaqueta || '')} · código ${esc(b.codigo)}</td><th>Ano de incorporação</th><td>${esc(anoInc(b))}</td></tr>
          <tr><th>Característica de inservível</th><td colspan="3"><b>${esc(LB.CARACTERISTICAS[x.car][0])}</b> — ${esc(LB.CARACTERISTICAS[x.car][1])}</td></tr>
          <tr><th>Descrição</th><td colspan="3">${esc(b.descricao)}${b.complemento && b.complemento !== b.descricao ? ' — ' + esc(b.complemento) : ''}</td></tr>
          <tr><th>Unidade</th><td colspan="3">${esc(VP.nome('unidades', b.unidadeId))}</td></tr></tbody></table>
        <h2>Parecer</h2><p class="laudo-parecer">${esc(x.parecer).replace(/\n/g, '<br>')}</p>
        <p>Data: ${u.data(v.data)}</p>
        <div class="laudo-assinaturas">${assinatura('Responsável técnico', v.tecnico)}${assinatura('Chefe responsável', v.chefe)}</div>
        <p class="laudo-aprovo"><b>Aprovo:</b> ${esc(v.autoridade || '')} <span class="laudo-linha"></span></p></div>`;
    }).join('');
    return `<div class="doc-laudos">${ci}${laudos}</div>`;
  };

  LB.abrir = (bens, depois) => {
    bens = bens.filter((b) => b.status !== 'baixado');
    if (!bens.length) return ui.aviso('Os bens escolhidos já estão baixados.', 'erro');
    const ano = hoje().slice(0, 4), u0 = ultimo();
    const individual = bens.length <= MAX_INDIVIDUAL;
    const opCar = Object.entries(LB.CARACTERISTICAS).map(([k, [n]]) => [k, n]);
    const campos = [
      { chave: 'numero', rotulo: 'Nº do primeiro laudo', tipo: 'numero', obrigatorio: true, largura: 'meia', ajuda: 'Os seguintes vêm em sequência.' }, { chave: 'ano', rotulo: 'Ano', obrigatorio: true, largura: 'meia' },
      { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'ci', rotulo: 'Nº da comunicação de encaminhamento', largura: 'meia' },
      { chave: 'destino', rotulo: 'Para (setor que recebe)', largura: 'meia' }, { chave: 'local', rotulo: 'Local', largura: 'meia' },
      { chave: 'tecnico', rotulo: 'Responsável técnico (nome)', obrigatorio: true, largura: 'meia' }, { chave: 'matricula', rotulo: 'Matrícula', largura: 'meia' },
      { chave: 'funcao', rotulo: 'Função (ex.: analista de suporte, mecânico, engenheiro)', largura: 'meia' }, { chave: 'chefe', rotulo: 'Chefe responsável', largura: 'meia' },
      { chave: 'autoridade', rotulo: 'Quem aprova ("Aprovo")' },
      { chave: 'car', rotulo: individual ? 'Característica (para todos; dá para mudar bem a bem abaixo)' : 'Característica (vale para todos)', tipo: 'select', opcoes: opCar, vazio: false },
      { chave: 'parecer', rotulo: individual ? 'Parecer (para todos; dá para mudar bem a bem abaixo)' : 'Parecer (vale para todos)', tipo: 'area', obrigatorio: true, ajuda: 'O estado do bem, o que está danificado, se é obsoleto e por que o conserto não vale a pena.' }
    ].concat(individual && bens.length > 1 ? bens.flatMap((b, i) => [{ chave: `c${i}`, rotulo: `${b.plaqueta || b.codigo} · ${b.descricao}: característica`, tipo: 'select', opcoes: opCar, largura: 'meia' }, { chave: `p${i}`, rotulo: 'Parecer só deste bem (vazio = o de cima)', largura: 'meia' }]) : []);
    ui.formulario({
      titulo: `Laudo técnico para baixa — ${bens.length} bem(ns)`, largura: 'media', textoSalvar: 'Gerar e imprimir',
      intro: `<p class="ajuda">Modelo de laudo enviado pelo usuário: uma comunicação com a lista dos bens e um laudo para cada bem, com os dados do cadastro. Quem assina é quem tem competência técnica sobre o bem (ex.: informática para computadores, oficina para veículos). <b>O laudo não dá baixa sozinho</b>: depois, use Baixa ou Lote de baixa e cite o nº do laudo.</p>${individual ? '' : `<p class="aviso-inline">Mais de ${MAX_INDIVIDUAL} bens: a característica e o parecer valem para todos. Para pareceres diferentes, faça em grupos menores.</p>`}`,
      campos,
      valores: { numero: LB.proximoNumero(ano), ano, data: hoje(), destino: u0.destino || 'Setor de Patrimônio', local: u0.local || '', tecnico: u0.tecnico || '', matricula: u0.matricula || '', funcao: u0.funcao || '', chefe: u0.chefe || '', autoridade: u0.autoridade || '', car: 'irrecuperavel' },
      salvar: async (v) => {
        const n0 = Math.floor(Number(v.numero) || 0);
        if (n0 < 1) return 'Informe o nº do primeiro laudo.';
        const usados = new Set(LB.emitidos().filter((l) => String(l.ano) === String(v.ano)).map((l) => Number(l.numero)));
        const repetido = bens.map((_, i) => n0 + i).find((n) => usados.has(n));
        if (repetido) return `O laudo nº ${repetido}/${v.ano} já foi emitido. Próximo livre: ${LB.proximoNumero(v.ano)}.`;
        const itens = bens.map((b, i) => ({ bem: b, numero: n0 + i, car: (individual && v[`c${i}`]) || v.car, parecer: (individual && v[`p${i}`]) || v.parecer }));
        const agora = VP.Plataforma.agoraISO();
        const comum = { ano: v.ano, data: v.data, ci: v.ci, destino: v.destino, local: v.local, tecnico: v.tecnico, matricula: v.matricula, funcao: v.funcao, chefe: v.chefe, autoridade: v.autoridade, emitidoEm: agora };
        const evs = itens.map((x) => VP.novoEvento(x.bem.id, 'observacao', { data: v.data, descricao: `Laudo técnico nº ${x.numero}/${v.ano} para baixa: ${LB.CARACTERISTICAS[x.car][0]}`, extra: { laudo: Object.assign({ numero: x.numero, caracteristica: x.car, parecer: x.parecer }, comum) } }));
        await VP.db.gravarVarias({ eventos: evs });
        ui.imprimir(LB.html(bens, v, itens), 'Laudos técnicos para baixa');
        depois && depois();
      }
    });
  };
})();
