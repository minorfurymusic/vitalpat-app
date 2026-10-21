/* VitalPat Cemitério · Gestão — etapa 3: concessões, sepultamentos (agenda e funerárias), exumações, ossário e painel de vagas.
   Prazos vêm de Configurações (cada município confere a sua lei). Nenhuma exumação acontece sozinha:
   o sistema só agenda o que uma pessoa pediu, barra o que a regra não permite e registra o que foi feito. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const E = VP.etapa3 = {};
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const tum = (id) => VP.db.pega('tumulos', id);
  const cod = (id) => { const t = tum(id); return t ? VP.codigoTumulo(t) : '—'; };
  const linkTum = (id) => (tum(id) ? `<a href="#tumulo/${esc(id)}">${esc(cod(id))}</a>` : '—');
  const opcFunerarias = () => VP.db.lista('funerarias').sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map((f) => [f.id, f.nome]);
  // CPF na tela sempre mascarado (LGPD); completo só no cadastro
  E.cpfMascarado = (cpf) => { const d = String(cpf || '').replace(/\D/g, ''); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : (cpf ? '***' : '—'); };
  const numeroNovo = (col) => {
    const ano = hoje().slice(0, 4);
    return `${VP.db.lista(col, true).filter((x) => String(x.numero).endsWith('/' + ano)).length + 1}/${ano}`;
  };
  const selo = (classe, texto) => `<span class="selo-status ${classe}">${esc(texto)}</span>`;
  E.seloConcessao = (c) => (!c ? selo('s-sem', 'Sem concessão') : VP.concessaoVencida(c) ? selo('s-apuracao', 'Temporária vencida') : c.situacao === 'encerrada' ? selo('os-cancelada', 'Encerrada') : selo(c.tipo === 'perpetua' ? 's-declarado' : 's-regular', L.tiposConcessao[c.tipo]));
  E.seloSepultamento = (x) => selo({ agendado: 'os-aberta', sepultado: 's-regular', exumado: 'os-andamento', cancelado: 'os-cancelada' }[x.situacao] || '', L.situacoesSepultamento[x.situacao] || x.situacao);
  const evento = (tid, tipo, descricao, extra = {}) => VP.novoEvento(tid, tipo, { descricao, extra });

  // ===================================================================== CONCESSÕES
  E.novaConcessao = (t, depois) => {
    if (VP.concessaoAtual(t.id)) return ui.aviso('Este túmulo já tem concessão vigente. Encerre-a antes (o histórico fica guardado).', 'erro');
    const campos = [
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposConcessao), obrigatorio: true, largura: 'meia' },
      { chave: 'documento', rotulo: 'Título de aforamento ou documento', largura: 'meia' },
      { chave: 'inicio', rotulo: 'Início', tipo: 'data', obrigatorio: true, largura: 'meia' },
      { chave: 'fim', rotulo: 'Fim (obrigatório na temporária)', tipo: 'data', largura: 'meia' },
      { chave: 'titular', rotulo: 'Titular (nome completo)', obrigatorio: true },
      { chave: 'cpf', rotulo: 'CPF do titular', largura: 'meia', ajuda: 'Aparece mascarado nas telas.' },
      { chave: 'telefone', rotulo: 'Telefone', largura: 'meia' },
      { chave: 'email', rotulo: 'E-mail', largura: 'meia' }, { chave: 'endereco', rotulo: 'Endereço para correspondência', largura: 'meia' },
      { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }];
    ui.formulario({
      titulo: 'Nova concessão — ' + VP.codigoTumulo(t), campos, largura: 'media',
      salvar: async (x) => {
        if (x.tipo === 'temporaria' && !x.fim) return 'Informe o fim da concessão temporária.';
        if (x.fim && x.fim <= x.inicio) return 'O fim precisa ser depois do início.';
        if (x.cpf && x.cpf.replace(/\D/g, '').length !== 11) return 'CPF precisa ter 11 números.';
        const c = Object.assign({ id: u.id(), numero: numeroNovo('concessoes'), tumuloId: t.id, situacao: 'vigente', titulares: [], historico: [{ quando: agora(), acao: 'cadastrada', usuario: usuario() }], usuario: usuario(), criadoEm: agora() }, x);
        if (c.tipo === 'perpetua') c.fim = '';
        await VP.db.gravarVarias({ concessoes: [c], eventos: [evento(t.id, 'concessao', `Concessão ${c.numero} (${L.tiposConcessao[c.tipo].toLowerCase()}) cadastrada para ${c.titular}`, { concessaoId: c.id })] });
        ui.aviso(`Concessão ${c.numero} cadastrada.`); depois && depois();
      }
    });
  };
  E.trocarTitular = (c, depois) => ui.formulario({
    titulo: 'Trocar titular — concessão ' + c.numero, largura: 'media',
    intro: `<p class="ajuda">Titular atual: <b>${esc(c.titular)}</b>. Ele fica guardado no histórico da concessão.</p>`,
    campos: [{ chave: 'titular', rotulo: 'Novo titular (nome completo)', obrigatorio: true }, { chave: 'cpf', rotulo: 'CPF', largura: 'meia' }, { chave: 'telefone', rotulo: 'Telefone', largura: 'meia' }, { chave: 'email', rotulo: 'E-mail', largura: 'meia' }, { chave: 'endereco', rotulo: 'Endereço', largura: 'meia' }, { chave: 'motivo', rotulo: 'Motivo (ex.: sucessão por falecimento, documento nº)', tipo: 'area', obrigatorio: true }],
    salvar: async (x) => {
      if (x.cpf && x.cpf.replace(/\D/g, '').length !== 11) return 'CPF precisa ter 11 números.';
      c.titulares = (c.titulares || []).concat({ titular: c.titular, cpf: c.cpf, telefone: c.telefone, email: c.email, endereco: c.endereco, ate: hoje() });
      Object.assign(c, { titular: x.titular, cpf: x.cpf, telefone: x.telefone, email: x.email, endereco: x.endereco });
      c.historico = (c.historico || []).concat({ quando: agora(), acao: 'titular trocado', nota: x.motivo, usuario: usuario() });
      await VP.db.gravarVarias({ concessoes: [c], eventos: [evento(c.tumuloId, 'concessao', `Concessão ${c.numero}: novo titular ${x.titular}. Motivo: ${x.motivo}`, { concessaoId: c.id })] });
      ui.aviso('Titular trocado.'); depois && depois();
    }
  });
  E.renovarConcessao = (c, depois) => ui.formulario({
    titulo: 'Renovar concessão ' + c.numero, largura: 'pequena',
    campos: [{ chave: 'fim', rotulo: 'Novo fim', tipo: 'data', obrigatorio: true }, { chave: 'motivo', rotulo: 'Motivo ou documento', tipo: 'area', obrigatorio: true }],
    salvar: async (x) => {
      if (x.fim <= (c.fim || c.inicio)) return 'O novo fim precisa ser depois do fim atual.';
      c.historico = (c.historico || []).concat({ quando: agora(), acao: 'renovada', de: c.fim, para: x.fim, nota: x.motivo, usuario: usuario() });
      const antes = c.fim; c.fim = x.fim;
      await VP.db.gravarVarias({ concessoes: [c], eventos: [evento(c.tumuloId, 'concessao', `Concessão ${c.numero} renovada: ${u.data(antes)} → ${u.data(x.fim)}. ${x.motivo}`, { concessaoId: c.id })] });
      ui.aviso('Concessão renovada.'); depois && depois();
    }
  });
  E.encerrarConcessao = (c, depois) => ui.formulario({
    titulo: 'Encerrar concessão ' + c.numero, largura: 'pequena',
    intro: '<p class="aviso-inline">Encerrar só registra a decisão (por exemplo, depois do processo administrativo ou de desistência do titular). Nada acontece no túmulo por causa disso.</p>',
    campos: [{ chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: hoje() }, { chave: 'motivo', rotulo: 'Motivo e nº do processo ou documento', tipo: 'area', obrigatorio: true }],
    salvar: async (x) => {
      c.situacao = 'encerrada'; c.encerradaEm = x.data;
      c.historico = (c.historico || []).concat({ quando: agora(), acao: 'encerrada', nota: x.motivo, usuario: usuario() });
      await VP.db.gravarVarias({ concessoes: [c], eventos: [evento(c.tumuloId, 'concessao', `Concessão ${c.numero} encerrada em ${u.data(x.data)}. ${x.motivo}`, { concessaoId: c.id })] });
      ui.aviso('Concessão encerrada.'); depois && depois();
    }
  });

  T.concessoes = (_, query) => {
    const v = VP.estado.filtrosConc = VP.estado.filtrosConc || { situacao: 'vigente' };
    if (Object.keys(query).length) { for (const k of Object.keys(v)) delete v[k]; Object.assign(v, Object.fromEntries(Object.entries(query).map(([k, x]) => [k, x === '1' ? true : x]))); }
    const defs = [
      { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(L.situacoesConcessao) },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(L.tiposConcessao) },
      { chave: 'vencidas', rotulo: 'Temporárias vencidas', tipo: 'bool' },
      { chave: 'vencendo', rotulo: 'Vencendo nos próximos 90 dias', tipo: 'bool' }];
    const daqui90 = () => { const d = new Date(hoje() + 'T12:00:00'); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10); };
    const filtrar = () => {
      const f = ui.limparValores(v);
      let l = VP.db.lista('concessoes').filter((c) => tum(c.tumuloId));
      if (f.situacao) l = l.filter((c) => c.situacao === f.situacao);
      if (f.tipo) l = l.filter((c) => c.tipo === f.tipo);
      if (f.vencidas) l = l.filter(VP.concessaoVencida);
      if (f.vencendo) { const lim = daqui90(); l = l.filter((c) => c.situacao === 'vigente' && c.tipo === 'temporaria' && c.fim >= hoje() && c.fim <= lim); }
      if (f.busca) { const b = u.normalizar(f.busca); l = l.filter((c) => u.normalizar([c.numero, c.titular, c.documento, cod(c.tumuloId)].join(' ')).includes(b)); }
      return l.sort((a, b) => String(a.fim || '9').localeCompare(String(b.fim || '9')));
    };
    const colunas = [
      { chave: 'numero', titulo: 'Nº' },
      { chave: 'tumulo', titulo: 'Túmulo', html: (c) => linkTum(c.tumuloId), valor: (c) => cod(c.tumuloId) },
      { chave: 'tipo', titulo: 'Tipo', html: E.seloConcessao, valor: (c) => (VP.concessaoVencida(c) ? 'Temporária vencida' : L.tiposConcessao[c.tipo]) },
      { chave: 'titular', titulo: 'Titular' },
      { chave: 'cpf', titulo: 'CPF', valor: (c) => E.cpfMascarado(c.cpf) },
      { chave: 'telefone', titulo: 'Telefone', oculta: true },
      { chave: 'inicio', titulo: 'Início', valor: (c) => u.data(c.inicio), ordenar: (c) => c.inicio },
      { chave: 'fim', titulo: 'Fim', html: (c) => `<span class="${VP.concessaoVencida(c) ? 'atrasada' : ''}">${c.fim ? u.data(c.fim) : '—'}</span>`, valor: (c) => u.data(c.fim), ordenar: (c) => c.fim || '9' },
      { chave: 'documento', titulo: 'Documento', oculta: true },
      { chave: 'situacao', titulo: 'Situação', valor: (c) => L.situacoesConcessao[c.situacao] }];
    const desenhar = () => {
      const todas = VP.db.lista('concessoes');
      return `<div class="resumo-linha">${G.numero('Vigentes', u.inteiro(todas.filter((c) => c.situacao === 'vigente').length))}${G.numero('Perpétuas', u.inteiro(todas.filter((c) => c.situacao === 'vigente' && c.tipo === 'perpetua').length))}${G.numero('Temporárias vencidas', u.inteiro(todas.filter(VP.concessaoVencida).length), 'contam como indicador D1', '#concessoes?situacao=vigente&vencidas=1')}${G.numero('Túmulos ocupados sem concessão', u.inteiro(VP.db.lista('tumulos').filter((t) => t.ocupacao === 'ocupado' && t.tipo !== 'ossario' && !VP.concessaoAtual(t.id)).length), '', '#tumulos?ocupacao=ocupado&concessao=sem')}</div>
        <div class="linha-filtros">${ui.filtros({ id: 'conc', defs, valores: v, placeholder: 'Buscar por nº, titular, documento, túmulo…', aoMudar: (_x, o) => atualizar(o) })}</div>
        ${ui.tabela({ id: 'concessoes', colunas, linhas: filtrar(), porPagina: 100, nomePlanilha: 'concessoes', vazio: 'Nenhuma concessão neste filtro.', aoClicar: (c) => VP.app.ir('#tumulo/' + c.tumuloId) })}`;
    };
    const atualizar = (o) => {
      const a = document.getElementById('area-conc'); if (!a) return;
      a.innerHTML = desenhar(); ui.ligarTabela('concessoes');
      if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    };
    return { titulo: 'Concessões', html: `<p class="ajuda">Nova concessão: abra a ficha do túmulo. A concessão temporária vencida vira o indicador D1 da triagem sozinha; nada mais acontece no túmulo.</p><div id="area-conc">${desenhar()}</div>`, ligar() { ui.ligarTabela('concessoes'); } };
  };

  // ===================================================================== SEPULTAMENTOS
  // modo 'agendar' (futuro, fica na agenda) ou 'registrar' (já aconteceu: cadastro de sepultamento antigo)
  E.sepultamento = (t, modo, depois) => {
    const campos = [
      ...(t ? [] : [{ chave: 'codigo', rotulo: 'Código do túmulo', obrigatorio: true, placeholder: 'Ex.: Q01-A1-6' }]),
      { chave: 'falecido', rotulo: 'Nome completo do falecido', obrigatorio: true },
      { chave: 'nascimento', rotulo: 'Nascimento', tipo: 'data', largura: 'meia' }, { chave: 'falecimento', rotulo: 'Falecimento', tipo: 'data', largura: 'meia' },
      { chave: 'data', rotulo: modo === 'agendar' ? 'Data do sepultamento' : 'Data em que foi sepultado', tipo: 'data', obrigatorio: true, largura: 'meia', padrao: modo === 'agendar' ? hoje() : '' },
      ...(modo === 'agendar' ? [{ chave: 'hora', rotulo: 'Hora (ex.: 15:30)', largura: 'meia' }] : [{ chave: 'inumacao', rotulo: 'Nº da inumação (livro)', largura: 'meia' }]),
      { chave: 'crianca', rotulo: 'Criança (prazo de permanência em gaveta menor)', tipo: 'bool' },
      { chave: 'posicao', rotulo: 'Posição no túmulo (ex.: gaveta de cima, lado esquerdo)', largura: 'meia' },
      { chave: 'certidao', rotulo: 'Certidão de óbito nº', largura: 'meia' },
      { chave: 'funerariaId', rotulo: 'Funerária', tipo: 'select', opcoes: opcFunerarias(), largura: 'meia' },
      { chave: 'declarante', rotulo: 'Declarante (nome e contato)', largura: 'meia' },
      { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }];
    ui.formulario({
      titulo: (modo === 'agendar' ? 'Agendar sepultamento' : 'Registrar sepultamento já feito') + (t ? ' — ' + VP.codigoTumulo(t) : ''), campos, largura: 'media',
      salvar: async (x) => {
        const alvo = t || VP.acharPorCodigo(x.codigo);
        if (!alvo) return 'Túmulo não encontrado com este código.';
        if (alvo.tipo === 'ossario') return 'Ossário recebe restos de exumação, não sepultamento.';
        if (['apuracao', 'declarado'].includes(VP.situacaoAtual(alvo))) return 'Este túmulo está em processo de abandono. Resolva a situação antes.';
        if (modo === 'agendar' && x.data < hoje()) return 'Para data passada, use "Registrar sepultamento já feito".';
        if (modo === 'registrar' && x.data > hoje()) return 'Data no futuro: use "Agendar sepultamento".';
        if (x.falecimento && x.data < x.falecimento) return 'O sepultamento não pode ser antes do falecimento.';
        if (x.hora && !/^\d{1,2}:\d{2}$/.test(x.hora)) return 'Hora no formato 15:30.';
        const ativos = VP.sepultamentosDe(alvo.id).filter((s) => s.situacao === 'sepultado' || s.situacao === 'agendado');
        if (alvo.tipo === 'gaveta' && ativos.length) return `Gaveta ocupada ou já agendada (${ativos.map((s) => s.falecido).join(', ')}).`;
        if (modo === 'agendar' && ativos.some((s) => s.situacao === 'agendado' && s.data === x.data)) return 'Já existe sepultamento agendado neste túmulo nesta data.';
        const s = Object.assign({ id: u.id(), numero: numeroNovo('sepultamentos'), tumuloId: alvo.id, situacao: modo === 'agendar' ? 'agendado' : 'sepultado', historico: [{ quando: agora(), acao: modo === 'agendar' ? 'agendado' : 'registrado', usuario: usuario() }], usuario: usuario(), criadoEm: agora() }, x);
        delete s.codigo;
        const docs = { sepultamentos: [s], eventos: [evento(alvo.id, 'sepultamento', `${modo === 'agendar' ? 'Sepultamento agendado para ' + u.data(x.data) + (x.hora ? ' às ' + x.hora : '') : 'Sepultamento registrado (' + u.data(x.data) + ')'}: ${x.falecido}`, { sepultamentoId: s.id })] };
        const extra = [];
        if (alvo.tipo !== 'gaveta' && ativos.length) extra.push(`Atenção: o túmulo já tem ${ativos.length} pessoa(s) sepultada(s) ou agendada(s).`);
        if (modo === 'registrar' && alvo.ocupacao !== 'ocupado') { docs.eventos.push(evento(alvo.id, 'alteracao', `Ocupação: ${L.ocupacao[alvo.ocupacao]} → Ocupado (sepultamento registrado)`, { antes: alvo.ocupacao })); alvo.ocupacao = 'ocupado'; docs.tumulos = [alvo]; }
        await VP.db.gravarVarias(docs);
        ui.aviso((modo === 'agendar' ? 'Sepultamento agendado.' : 'Sepultamento registrado.') + (extra.length ? ' ' + extra.join(' ') : ''));
        depois && depois();
      }
    });
  };
  E.confirmarSepultamento = async (s, depois) => {
    const t = tum(s.tumuloId);
    if (!await ui.confirmar(`Confirmar que <b>${esc(s.falecido)}</b> foi sepultado(a) em ${esc(VP.codigoTumulo(t))} em ${u.data(s.data)}? O túmulo passa a "Ocupado".`, { sim: 'Confirmar sepultamento' })) return;
    s.situacao = 'sepultado';
    s.historico = (s.historico || []).concat({ quando: agora(), acao: 'sepultamento confirmado', usuario: usuario() });
    const docs = { sepultamentos: [s], eventos: [evento(t.id, 'sepultamento', `Sepultamento confirmado: ${s.falecido} (${u.data(s.data)})`, { sepultamentoId: s.id })] };
    if (t.ocupacao !== 'ocupado') { docs.eventos.push(evento(t.id, 'alteracao', `Ocupação: ${L.ocupacao[t.ocupacao]} → Ocupado`, { antes: t.ocupacao })); t.ocupacao = 'ocupado'; docs.tumulos = [t]; }
    await VP.db.gravarVarias(docs);
    ui.aviso('Sepultamento confirmado.'); depois && depois();
  };
  E.cancelarSepultamento = (s, depois) => ui.formulario({
    titulo: 'Cancelar agendamento', largura: 'pequena', campos: [{ chave: 'motivo', rotulo: 'Motivo', tipo: 'area', obrigatorio: true }], textoSalvar: 'Cancelar agendamento',
    salvar: async (x) => {
      s.situacao = 'cancelado';
      s.historico = (s.historico || []).concat({ quando: agora(), acao: 'cancelado', nota: x.motivo, usuario: usuario() });
      await VP.db.gravarVarias({ sepultamentos: [s], eventos: [evento(s.tumuloId, 'sepultamento', `Agendamento cancelado: ${s.falecido}. ${x.motivo}`, { sepultamentoId: s.id })] });
      ui.aviso('Agendamento cancelado.'); depois && depois();
    }
  });

  // Agenda: sepultamentos agendados (os de data passada aparecem primeiro, para confirmar)
  T.sepultamentos = (aba = 'agenda') => {
    const abas = `<nav class="abas"><a href="#sepultamentos" class="${aba !== 'lista' ? 'ativa' : ''}">Agenda</a><a href="#sepultamentos/lista" class="${aba === 'lista' ? 'ativa' : ''}">Todos os sepultados</a></nav>`;
    const fun = (id) => VP.db.pega('funerarias', id)?.nome || '—';
    if (aba === 'lista') {
      const v = VP.estado.filtrosSep = VP.estado.filtrosSep || {};
      const defs = [{ chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(L.situacoesSepultamento) }, { chave: 'quadraId', rotulo: 'Quadra', tipo: 'select', opcoes: VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem).map((q) => [q.id, q.nome]) }, { chave: 'de', rotulo: 'Sepultado desde', tipo: 'data' }, { chave: 'ate', rotulo: 'Sepultado até', tipo: 'data' }, { chave: 'permanencia', rotulo: 'Prazo de permanência vencido', tipo: 'bool' }];
      const filtrar = () => {
        const f = ui.limparValores(v);
        let l = VP.db.lista('sepultamentos').filter((x) => tum(x.tumuloId));
        if (f.situacao) l = l.filter((x) => x.situacao === f.situacao);
        if (f.quadraId) l = l.filter((x) => tum(x.tumuloId).quadraId === f.quadraId);
        if (f.de) l = l.filter((x) => x.data >= f.de);
        if (f.ate) l = l.filter((x) => x.data <= f.ate);
        if (f.permanencia) l = l.filter(VP.permanenciaVencida);
        if (f.busca) { const termos = u.normalizar(f.busca).split(/\s+/); l = l.filter((x) => { const t = u.normalizar([x.falecido, x.numero, x.inumacao, x.certidao, cod(x.tumuloId)].join(' ')); return termos.every((p) => t.includes(p)); }); }
        return l.sort((a, b) => String(b.data).localeCompare(String(a.data)));
      };
      const colunas = [
        { chave: 'falecido', titulo: 'Falecido' }, { chave: 'tumulo', titulo: 'Túmulo', html: (x) => linkTum(x.tumuloId), valor: (x) => cod(x.tumuloId) },
        { chave: 'data', titulo: 'Sepultamento', valor: (x) => u.data(x.data), ordenar: (x) => x.data },
        { chave: 'situacao', titulo: 'Situação', html: E.seloSepultamento, valor: (x) => L.situacoesSepultamento[x.situacao] },
        { chave: 'limite', titulo: 'Permanência até', html: (x) => { const l = VP.limitePermanencia(x); return l ? `<span class="${l < hoje() ? 'atrasada' : ''}">${u.data(l)}</span>` : '—'; }, valor: (x) => u.data(VP.limitePermanencia(x)) },
        { chave: 'falecimento', titulo: 'Falecimento', valor: (x) => u.data(x.falecimento), oculta: true }, { chave: 'inumacao', titulo: 'Nº inumação', oculta: true }, { chave: 'certidao', titulo: 'Certidão', oculta: true },
        { chave: 'funeraria', titulo: 'Funerária', valor: (x) => fun(x.funerariaId), oculta: true }];
      const desenhar = () => `<div class="linha-filtros">${ui.filtros({ id: 'sep', defs, valores: v, placeholder: 'Buscar por nome do falecido, nº, certidão, túmulo…', aoMudar: (_x, o) => atualizar(o) })}</div>
        ${ui.tabela({ id: 'sepultados', colunas, linhas: filtrar(), porPagina: 100, nomePlanilha: 'sepultados', vazio: 'Ninguém neste filtro.', aoClicar: (x) => VP.app.ir('#tumulo/' + x.tumuloId) })}`;
      const atualizar = (o) => { const a = document.getElementById('area-sep'); if (!a) return; a.innerHTML = desenhar(); ui.ligarTabela('sepultados'); if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); } };
      return { titulo: 'Sepultamentos', acoes: '<button class="botao" data-registrar-sep>+ Registrar sepultamento já feito</button>', html: `${abas}<div id="area-sep">${desenhar()}</div>`, ligar() { ui.ligarTabela('sepultados'); document.querySelector('[data-registrar-sep]').addEventListener('click', () => E.sepultamento(null, 'registrar', () => VP.app.render())); } };
    }
    const agendados = VP.db.lista('sepultamentos').filter((x) => x.situacao === 'agendado' && tum(x.tumuloId)).sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
    const dias = [...new Set(agendados.map((x) => x.data))];
    const html = dias.length ? dias.map((d) => `<section class="cartao"><h3>${d < hoje() ? '<span class="atrasada">Já passou — confirmar ou cancelar · </span>' : d === hoje() ? 'Hoje · ' : ''}${u.data(d)}</h3>
        <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Hora</th><th>Falecido</th><th>Túmulo</th><th>Funerária</th><th>Declarante</th><th></th></tr></thead><tbody>
        ${agendados.filter((x) => x.data === d).map((x) => `<tr><td>${esc(x.hora || '—')}</td><td>${esc(x.falecido)}${x.crianca ? ' <small>(criança)</small>' : ''}</td><td>${linkTum(x.tumuloId)} <small>${esc(VP.rotuloTumulo(tum(x.tumuloId)))}</small></td><td>${esc(fun(x.funerariaId))}</td><td>${esc(x.declarante || '')}</td><td><button class="botao pequeno primario" data-confirmar-sep="${esc(x.id)}">Confirmar</button> <button class="botao pequeno perigo" data-cancelar-sep="${esc(x.id)}">Cancelar</button></td></tr>`).join('')}
        </tbody></table></div></section>`).join('') : '<p class="vazio">Nenhum sepultamento agendado.</p>';
    const ultimos = VP.db.lista('sepultamentos').filter((x) => x.situacao === 'sepultado' && x.data >= VP.somaAnos(hoje(), -1));
    return {
      titulo: 'Sepultamentos',
      acoes: '<button class="botao" data-imprimir-agenda>Imprimir agenda</button> <button class="botao primario" data-agendar>+ Agendar sepultamento</button>',
      html: `${abas}<div class="resumo-linha">${G.numero('Agendados', u.inteiro(agendados.length))}${G.numero('Hoje', u.inteiro(agendados.filter((x) => x.data === hoje()).length))}${G.numero('Sepultamentos nos últimos 12 meses', u.inteiro(ultimos.length))}${G.numero('Funerárias cadastradas', u.inteiro(VP.db.lista('funerarias').length), '', '#cadastros/funerarias')}</div>
        <p class="ajuda">A funerária pede, o cemitério agenda e confirma quando o sepultamento acontece (o túmulo passa a "Ocupado"). No futuro, cada funerária poderá fazer o pedido pelo próprio acesso.</p>
        <div id="area-agenda">${html}</div>`,
      ligar() {
        const re = () => VP.app.render();
        document.querySelector('[data-agendar]').addEventListener('click', () => E.sepultamento(null, 'agendar', re));
        document.querySelectorAll('[data-confirmar-sep]').forEach((b) => b.addEventListener('click', () => E.confirmarSepultamento(VP.db.pega('sepultamentos', b.dataset.confirmarSep), re)));
        document.querySelectorAll('[data-cancelar-sep]').forEach((b) => b.addEventListener('click', () => E.cancelarSepultamento(VP.db.pega('sepultamentos', b.dataset.cancelarSep), re)));
        document.querySelector('[data-imprimir-agenda]').addEventListener('click', () => ui.imprimir(`<h2>Agenda de sepultamentos</h2>${document.getElementById('area-agenda').innerHTML.replace(/<button[^>]*>[^<]*<\/button>/g, '')}`, 'Agenda de sepultamentos'));
      }
    };
  };

  // ===================================================================== EXUMAÇÕES E OSSÁRIO
  E.agendarExumacao = (s, depois) => {
    const t = tum(s.tumuloId);
    ui.formulario({
      titulo: `Agendar exumação — ${s.falecido}`, largura: 'media',
      intro: `<p>${esc(VP.codigoTumulo(t))} · sepultado(a) em ${u.data(s.data)}${VP.limitePermanencia(s) ? ` · permanência até ${u.data(VP.limitePermanencia(s))}` : ''}</p><p class="aviso-inline">O sistema só agenda o que foi decidido em processo. A exumação é feita por pessoas, com testemunhas, e registrada depois.</p>`,
      campos: [{ chave: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: Object.entries(L.motivosExumacao), obrigatorio: true },
        { chave: 'processo', rotulo: 'Nº do processo ou da ordem', obrigatorio: true, largura: 'meia' }, { chave: 'dataPrevista', rotulo: 'Data prevista', tipo: 'data', obrigatorio: true, largura: 'meia' },
        { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
      salvar: async (x) => {
        const imp = VP.impedimentosExumacao(s, x.motivo);
        if (imp.length) return 'Não pode agendar: ' + imp.join(' ');
        const e = Object.assign({ id: u.id(), numero: numeroNovo('exumacoes'), sepultamentoId: s.id, tumuloId: s.tumuloId, falecido: s.falecido, situacao: 'agendada', historico: [{ quando: agora(), acao: 'agendada', usuario: usuario() }], usuario: usuario(), criadoEm: agora() }, x);
        await VP.db.gravarVarias({ exumacoes: [e], eventos: [evento(s.tumuloId, 'exumacao', `Exumação ${e.numero} agendada para ${u.data(x.dataPrevista)}: ${s.falecido}. Motivo: ${L.motivosExumacao[x.motivo]}. Processo ${x.processo}`, { exumacaoId: e.id })] });
        ui.aviso(`Exumação ${e.numero} agendada.`); depois && depois();
      }
    });
  };
  E.realizarExumacao = (e, depois) => {
    const s = VP.db.pega('sepultamentos', e.sepultamentoId);
    const nichos = VP.nichosLivres().map((n) => [n.id, `${VP.codigoTumulo(n)} · ${VP.rotuloTumulo(n)}`]);
    ui.formulario({
      titulo: `Registrar exumação ${e.numero} — ${e.falecido}`, largura: 'media',
      intro: '<p class="ajuda">Registre só depois de feita. Duas testemunhas são obrigatórias.</p>',
      campos: [{ chave: 'data', rotulo: 'Data em que foi feita', tipo: 'data', obrigatorio: true, padrao: hoje(), largura: 'meia' }, { chave: 'responsavel', rotulo: 'Responsável', obrigatorio: true, largura: 'meia' },
        { chave: 'testemunha1', rotulo: 'Testemunha 1', obrigatorio: true, largura: 'meia' }, { chave: 'testemunha2', rotulo: 'Testemunha 2', obrigatorio: true, largura: 'meia' },
        { chave: 'destino', rotulo: 'Destino dos restos', tipo: 'select', opcoes: Object.entries(L.destinosExumacao), obrigatorio: true, largura: 'meia' },
        { chave: 'ossarioId', rotulo: `Nicho do ossário (se for para o ossário) — ${nichos.length} livre(s)`, tipo: 'select', opcoes: nichos, largura: 'meia' },
        { chave: 'destinoTexto', rotulo: 'Para onde foi (translado, cremação ou quem recebeu)' },
        { chave: 'fotos', rotulo: 'Fotos', tipo: 'arquivo', multiplo: true, aceita: 'image/*' }, { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
      salvar: async (x) => {
        if (x.data > hoje()) return 'A data não pode ser no futuro.';
        if (x.testemunha1.trim().toLowerCase() === x.testemunha2.trim().toLowerCase()) return 'As testemunhas precisam ser pessoas diferentes.';
        if (x.destino === 'ossario' && !x.ossarioId) return 'Escolha o nicho do ossário.';
        if (x.destino !== 'ossario' && !x.destinoTexto) return 'Informe para onde foram os restos.';
        if (s.situacao !== 'sepultado') return 'Esta pessoa não está mais como sepultada.';
        const fotos = await ui.lerArquivos(x.fotos);
        const t = tum(e.tumuloId);
        const nicho = x.destino === 'ossario' ? tum(x.ossarioId) : null;
        Object.assign(e, { situacao: 'realizada', data: x.data, responsavel: x.responsavel, testemunhas: [x.testemunha1, x.testemunha2], destino: x.destino, ossarioId: nicho?.id || null, destinoTexto: x.destinoTexto || '', fotos, observacaoFinal: x.observacao });
        e.historico = (e.historico || []).concat({ quando: agora(), acao: 'realizada', usuario: usuario() });
        Object.assign(s, { situacao: 'exumado', dataExumacao: x.data, exumacaoId: e.id, destino: x.destino, ossarioId: nicho?.id || null, destinoTexto: x.destinoTexto || '' });
        s.historico = (s.historico || []).concat({ quando: agora(), acao: 'exumado', usuario: usuario() });
        const feito = [`${s.falecido}: exumado(a) em ${u.data(x.data)}`];
        const docs = { exumacoes: [e], sepultamentos: [s], tumulos: [], eventos: [evento(t.id, 'exumacao', `Exumação ${e.numero} feita em ${u.data(x.data)}: ${s.falecido}. Destino: ${L.destinosExumacao[x.destino]}${nicho ? ' ' + VP.codigoTumulo(nicho) : x.destinoTexto ? ' — ' + x.destinoTexto : ''}. Testemunhas: ${x.testemunha1}, ${x.testemunha2}`, { exumacaoId: e.id })] };
        if (nicho) {
          docs.eventos.push(evento(nicho.id, 'ossario', `Recebeu os restos de ${s.falecido} (exumação ${e.numero}, vindos de ${VP.codigoTumulo(t)})`, { exumacaoId: e.id }));
          if (nicho.ocupacao !== 'ocupado') { nicho.ocupacao = 'ocupado'; docs.tumulos.push(nicho); }
          feito.push(`Nicho ${VP.codigoTumulo(nicho)} passou a "Ocupado"`);
        }
        // O túmulo fica vago só se não sobrar ninguém sepultado nele
        const restantes = VP.sepultadosAtivos(t.id).filter((y) => y.id !== s.id);
        if (!restantes.length && t.ocupacao === 'ocupado') {
          docs.eventos.push(evento(t.id, 'alteracao', 'Ocupação: Ocupado → Vago (ninguém mais sepultado)', { antes: 'ocupado' }));
          t.ocupacao = 'vago'; docs.tumulos.push(t);
          feito.push(`${VP.codigoTumulo(t)} passou a "Vago"${VP.concessaoAtual(t.id) ? ' (a concessão continua vigente até alguém encerrar)' : ''}`);
        } else if (restantes.length) feito.push(`${VP.codigoTumulo(t)} continua "Ocupado" (${restantes.length} pessoa(s))`);
        await VP.db.gravarVarias(docs);
        ui.resultado({ titulo: `Exumação ${e.numero} registrada`, sucesso: feito });
        depois && depois();
      }
    });
  };
  E.cancelarExumacao = (e, depois) => ui.formulario({
    titulo: `Cancelar exumação ${e.numero}`, largura: 'pequena', campos: [{ chave: 'motivo', rotulo: 'Motivo (ex.: família regularizou, decisão revista)', tipo: 'area', obrigatorio: true }], textoSalvar: 'Cancelar exumação',
    salvar: async (x) => {
      e.situacao = 'cancelada';
      e.historico = (e.historico || []).concat({ quando: agora(), acao: 'cancelada', nota: x.motivo, usuario: usuario() });
      await VP.db.gravarVarias({ exumacoes: [e], eventos: [evento(e.tumuloId, 'exumacao', `Exumação ${e.numero} cancelada. ${x.motivo}`, { exumacaoId: e.id })] });
      ui.aviso('Exumação cancelada.'); depois && depois();
    }
  });

  T.exumacoes = (aba = 'exumacoes') => {
    const abas = `<nav class="abas"><a href="#exumacoes" class="${aba !== 'ossario' ? 'ativa' : ''}">Exumações</a><a href="#exumacoes/ossario" class="${aba === 'ossario' ? 'ativa' : ''}">Ossário</a></nav>`;
    const re = () => VP.app.render();
    if (aba === 'ossario') {
      const cfg = VP.config();
      const nichos = VP.db.lista('tumulos').filter((t) => t.tipo === 'ossario');
      const restos = VP.db.lista('sepultamentos').filter((s) => s.ossarioId && s.situacao === 'exumado').map((s) => Object.assign({ guardaAte: VP.somaAnos(s.dataExumacao, cfg.guardaOssarioAnos) }, s));
      return {
        titulo: 'Exumações e ossário',
        html: `${abas}<div class="resumo-linha">${G.numero('Nichos no ossário', u.inteiro(nichos.length), '', '#tumulos?tipo=ossario')}${G.numero('Nichos livres', u.inteiro(VP.nichosLivres().length))}${G.numero('Restos guardados', u.inteiro(restos.length))}${G.numero(`Guarda de ${cfg.guardaOssarioAnos} anos já passou`, u.inteiro(restos.filter((r) => r.guardaAte < hoje()).length))}</div>
          ${!nichos.length ? '<p class="aviso-inline">Nenhum nicho de ossário cadastrado. Cadastre túmulos do tipo "Ossário" (menu Túmulos → Novo túmulo, ou pela importação).</p>' : ''}
          <p class="ajuda">Cada resto mortal fica ligado ao cadastro do falecido e ao nicho (etiqueta QR do nicho em Relatórios). O prazo de guarda é a referência para a família retirar; nada é descartado pelo sistema.</p>
          ${ui.tabela({ id: 'ossario', linhas: restos, nomePlanilha: 'ossario', vazio: 'Nenhum resto mortal no ossário.', aoClicar: (s) => VP.app.ir('#tumulo/' + s.ossarioId), colunas: [
            { chave: 'falecido', titulo: 'Falecido' }, { chave: 'nicho', titulo: 'Nicho', html: (s) => linkTum(s.ossarioId), valor: (s) => cod(s.ossarioId) },
            { chave: 'origem', titulo: 'Veio de', html: (s) => linkTum(s.tumuloId), valor: (s) => cod(s.tumuloId) },
            { chave: 'dataExumacao', titulo: 'Exumado em', valor: (s) => u.data(s.dataExumacao), ordenar: (s) => s.dataExumacao },
            { chave: 'guardaAte', titulo: 'Guarda até', html: (s) => `<span class="${s.guardaAte < hoje() ? 'atrasada' : ''}">${u.data(s.guardaAte)}</span>`, valor: (s) => u.data(s.guardaAte) }] })}`,
        ligar() { ui.ligarTabela('ossario'); }
      };
    }
    const lista = VP.db.lista('exumacoes').filter((e) => tum(e.tumuloId)).sort((a, b) => ({ agendada: 0, realizada: 1, cancelada: 2 }[a.situacao] - { agendada: 0, realizada: 1, cancelada: 2 }[b.situacao]) || String(a.dataPrevista).localeCompare(String(b.dataPrevista)));
    return {
      titulo: 'Exumações e ossário',
      html: `${abas}<div class="resumo-linha">${G.numero('Agendadas', u.inteiro(lista.filter((e) => e.situacao === 'agendada').length))}${G.numero('Agendadas com data passada', u.inteiro(lista.filter((e) => e.situacao === 'agendada' && e.dataPrevista < hoje()).length))}${G.numero('Realizadas', u.inteiro(lista.filter((e) => e.situacao === 'realizada').length))}${G.numero('Gavetas com permanência vencida', u.inteiro(VP.db.lista('sepultamentos').filter(VP.permanenciaVencida).length), 'exumação possível; uma pessoa decide', '#tumulos?permanenciaVencida=1')}</div>
        <p class="ajuda">Para agendar, abra a ficha do túmulo e use "Agendar exumação" ao lado do nome. O sistema barra o que a regra não permite (prazo mínimo de ${VP.config().exumacaoMinimaAnos} anos, salvo ordem judicial ou policial; abandono só depois de declarado).</p>
        ${ui.tabela({ id: 'exumacoes', linhas: lista, porPagina: 100, nomePlanilha: 'exumacoes', vazio: 'Nenhuma exumação.', colunas: [
          { chave: 'numero', titulo: 'Nº' }, { chave: 'falecido', titulo: 'Falecido' }, { chave: 'tumulo', titulo: 'Túmulo', html: (e) => linkTum(e.tumuloId), valor: (e) => cod(e.tumuloId) },
          { chave: 'motivo', titulo: 'Motivo', valor: (e) => L.motivosExumacao[e.motivo] }, { chave: 'processo', titulo: 'Processo' },
          { chave: 'dataPrevista', titulo: 'Prevista', html: (e) => `<span class="${e.situacao === 'agendada' && e.dataPrevista < hoje() ? 'atrasada' : ''}">${u.data(e.dataPrevista)}</span>`, valor: (e) => u.data(e.dataPrevista), ordenar: (e) => e.dataPrevista },
          { chave: 'situacao', titulo: 'Situação', html: (e) => selo({ agendada: 'os-aberta', realizada: 'os-concluida', cancelada: 'os-cancelada' }[e.situacao], L.situacoesExumacao[e.situacao]), valor: (e) => L.situacoesExumacao[e.situacao] },
          { chave: 'destino', titulo: 'Destino', valor: (e) => (e.destino ? L.destinosExumacao[e.destino] + (e.ossarioId ? ' ' + cod(e.ossarioId) : '') : '') },
          { chave: 'acoes', titulo: '', html: (e) => (e.situacao === 'agendada' ? `<button class="botao pequeno primario" data-realizar-ex="${esc(e.id)}">Registrar feita</button> <button class="botao pequeno perigo" data-cancelar-ex="${esc(e.id)}">Cancelar</button>` : '') }] })}`,
      ligar() {
        ui.ligarTabela('exumacoes');
        // onclick: a tabela é redesenhada (ordem, página) e o clique não pode acumular
        document.getElementById('tab-exumacoes').onclick = (ev) => {
          const r = ev.target.closest('[data-realizar-ex]'); if (r) return E.realizarExumacao(VP.db.pega('exumacoes', r.dataset.realizarEx), re);
          const c = ev.target.closest('[data-cancelar-ex]'); if (c) return E.cancelarExumacao(VP.db.pega('exumacoes', c.dataset.cancelarEx), re);
        };
      }
    };
  };

  // ===================================================================== FICHA DO TÚMULO: seção da etapa 3
  E.secaoFicha = (t) => {
    const c = VP.concessaoAtual(t.id);
    const outras = VP.concessoesDe(t.id).filter((x) => x !== c);
    const seps = VP.sepultamentosDe(t.id).filter((x) => x.situacao !== 'cancelado');
    const exs = VP.exumacoesDe(t.id);
    const restos = t.tipo === 'ossario' ? VP.restosNoOssario(t.id) : [];
    return `<section class="cartao secao"><header><h3>Concessão e sepultados</h3>${E.seloConcessao(c)}</header>
      ${c ? `<dl class="dados"><dt>Concessão</dt><dd>${esc(c.numero)} · ${esc(L.tiposConcessao[c.tipo])}${c.documento ? ' · ' + esc(c.documento) : ''}</dd><dt>Titular</dt><dd>${esc(c.titular)} · CPF ${esc(E.cpfMascarado(c.cpf))}${c.telefone ? ' · ' + esc(c.telefone) : ''}</dd><dt>Vigência</dt><dd>${u.data(c.inicio)} até ${c.fim ? `<span class="${VP.concessaoVencida(c) ? 'atrasada' : ''}">${u.data(c.fim)}</span>` : 'sem fim (perpétua)'}</dd></dl>
        <div class="linha-botoes"><button class="botao pequeno" data-e3="titular">Trocar titular</button>${c.tipo === 'temporaria' ? '<button class="botao pequeno" data-e3="renovar">Renovar</button>' : ''}<button class="botao pequeno perigo" data-e3="encerrar">Encerrar concessão</button></div>`
        : `<p class="vazio">Sem concessão vigente.</p><div class="linha-botoes"><button class="botao pequeno" data-e3="concessao">Nova concessão</button></div>`}
      ${outras.length ? `<details><summary>Concessões anteriores (${outras.length})</summary><ul class="lista-simples">${outras.map((x) => `<li>${esc(x.numero)} · ${esc(L.tiposConcessao[x.tipo])} · ${esc(x.titular)} · ${u.data(x.inicio)} a ${u.data(x.encerradaEm || x.fim)} (${esc(L.situacoesConcessao[x.situacao])})</li>`).join('')}</ul></details>` : ''}
      <h4>Sepultados (${seps.length})</h4>
      ${t.tipo !== 'ossario' ? '<div class="linha-botoes"><button class="botao pequeno" data-e3="agendar">Agendar sepultamento</button><button class="botao pequeno" data-e3="registrar">Registrar sepultamento já feito</button></div>' : ''}
      ${seps.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Nome</th><th>Sepultamento</th><th>Situação</th><th>Permanência até</th><th></th></tr></thead><tbody>${seps.map((x) => { const l = VP.limitePermanencia(x); return `<tr><td>${esc(x.falecido)}${x.crianca ? ' <small>(criança)</small>' : ''}${x.posicao ? `<br><small>${esc(x.posicao)}</small>` : ''}</td><td>${u.data(x.data)}${x.hora ? ' ' + esc(x.hora) : ''}</td><td>${E.seloSepultamento(x)}${x.dataExumacao ? `<br><small>exumado em ${u.data(x.dataExumacao)}${x.ossarioId ? ' → ' + esc(cod(x.ossarioId)) : ''}</small>` : ''}</td><td>${l ? `<span class="${l < hoje() ? 'atrasada' : ''}">${u.data(l)}</span>` : '—'}</td><td>${x.situacao === 'agendado' ? `<button class="botao pequeno primario" data-confirmar-sep="${esc(x.id)}">Confirmar</button>` : x.situacao === 'sepultado' && !exs.some((e) => e.sepultamentoId === x.id && e.situacao === 'agendada') ? `<button class="botao pequeno" data-exumar="${esc(x.id)}">Agendar exumação</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="vazio">Ninguém registrado.</p>'}
      ${exs.length ? `<h4>Exumações (${exs.length})</h4><ul class="lista-simples">${exs.map((e) => `<li>${esc(e.numero)} · ${esc(e.falecido)} · ${esc(L.motivosExumacao[e.motivo])} · processo ${esc(e.processo)} · ${e.situacao === 'realizada' ? 'feita em ' + u.data(e.data) : 'prevista ' + u.data(e.dataPrevista)} ${selo({ agendada: 'os-aberta', realizada: 'os-concluida', cancelada: 'os-cancelada' }[e.situacao], L.situacoesExumacao[e.situacao])} ${e.situacao === 'agendada' ? `<button class="botao pequeno" data-realizar-ex="${esc(e.id)}">Registrar feita</button>` : ''}</li>`).join('')}</ul>` : ''}
      ${t.tipo === 'ossario' ? `<h4>Restos guardados neste nicho (${restos.length})</h4>${restos.length ? `<ul class="lista-simples">${restos.map((x) => `<li>${esc(x.falecido)} · veio de ${linkTum(x.tumuloId)} · exumado em ${u.data(x.dataExumacao)} · guarda até ${u.data(VP.somaAnos(x.dataExumacao, VP.config().guardaOssarioAnos))}</li>`).join('')}</ul>` : '<p class="vazio">Vazio.</p>'}` : ''}
    </section>`;
  };
  E.ligarFicha = (t, re) => {
    const c = VP.concessaoAtual(t.id);
    document.querySelectorAll('[data-e3]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.e3;
      if (a === 'concessao') return E.novaConcessao(t, re);
      if (a === 'titular') return E.trocarTitular(c, re);
      if (a === 'renovar') return E.renovarConcessao(c, re);
      if (a === 'encerrar') return E.encerrarConcessao(c, re);
      if (a === 'agendar') return E.sepultamento(t, 'agendar', re);
      if (a === 'registrar') return E.sepultamento(t, 'registrar', re);
    }));
    document.querySelectorAll('#conteudo [data-confirmar-sep]').forEach((b) => b.addEventListener('click', () => E.confirmarSepultamento(VP.db.pega('sepultamentos', b.dataset.confirmarSep), re)));
    document.querySelectorAll('#conteudo [data-exumar]').forEach((b) => b.addEventListener('click', () => E.agendarExumacao(VP.db.pega('sepultamentos', b.dataset.exumar), re)));
    document.querySelectorAll('#conteudo [data-realizar-ex]').forEach((b) => b.addEventListener('click', () => E.realizarExumacao(VP.db.pega('exumacoes', b.dataset.realizarEx), re)));
  };

  // ===================================================================== PAINEL DE VAGAS (B7 item 8)
  E.dadosVagas = () => {
    const tum = VP.db.lista('tumulos');
    const tipos = ['sepultura', 'jazigo', 'gaveta', 'ossario'];
    const h = hoje();
    const meses = [];
    for (let i = 35; i >= 0; i--) { const d = new Date(h.slice(0, 7) + '-15T12:00:00'); d.setMonth(d.getMonth() - i); meses.push(d.toISOString().slice(0, 7)); }
    const seps = VP.db.lista('sepultamentos').filter((x) => x.situacao === 'sepultado' || x.situacao === 'exumado');
    const porMes = meses.map((m) => ({ rotulo: m.slice(5) + '/' + m.slice(2, 4), m, valor: seps.filter((x) => String(x.data).startsWith(m)).length }));
    const doze = meses.slice(-12);
    const tipoDe = new Map(tum.map((t) => [t.id, t.tipo]));
    const ritmoTipo = Object.fromEntries(tipos.map((k) => [k, seps.filter((x) => doze.includes(String(x.data).slice(0, 7)) && tipoDe.get(x.tumuloId) === k).length / 12]));
    const livres = Object.fromEntries(tipos.map((k) => [k, tum.filter((t) => t.tipo === k && t.ocupacao === 'vago').length]));
    const anos = (vagas, ritmo) => (ritmo > 0 ? vagas / (ritmo * 12) : null);
    const cenarios = tipos.filter((k) => k !== 'ossario').map((k) => ({ tipo: k, livres: livres[k], ritmo: ritmoTipo[k], atual: anos(livres[k], ritmoTipo[k]), alta: anos(livres[k], ritmoTipo[k] * 1.3), baixa: anos(livres[k], ritmoTipo[k] * 0.7) }));
    const voltam = {
      concessoes: VP.db.lista('concessoes').filter(VP.concessaoVencida).length,
      gavetas: VP.db.lista('sepultamentos').filter(VP.permanenciaVencida).length,
      abandono: tum.filter((t) => ['apuracao', 'declarado'].includes(VP.situacaoAtual(t))).length,
      indicio: tum.filter((t) => VP.situacaoAtual(t) === 'indicio').length
    };
    const porQuadra = VP.db.lista('quadras').sort((a, b) => a.ordem - b.ordem).map((q) => ({ rotulo: q.nome, valor: tum.filter((t) => t.quadraId === q.id && t.ocupacao === 'vago').length, link: `#tumulos?quadraId=${q.id}&ocupacao=vago` }));
    return { livres, porMes, ritmoTipo, cenarios, voltam, porQuadra, naoInformado: tum.filter((t) => t.ocupacao === 'nao-informado').length, nichosLivres: VP.nichosLivres().length, nichos: tum.filter((t) => t.tipo === 'ossario').length, sepsDoze: seps.filter((x) => doze.includes(String(x.data).slice(0, 7))).length };
  };
  T.vagas = () => {
    const d = E.dadosVagas();
    const anosTxt = (a) => (a == null ? 'sem sepultamentos no último ano' : a < 1 ? `${Math.round(a * 12)} mês(es)` : `${a.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`);
    const ritmoMedio = d.sepsDoze / 12;
    const ganho = (n) => (ritmoMedio > 0 && n > 0 ? ` · cerca de ${anosTxt(n / (ritmoMedio * 12))} a mais` : '');
    return {
      titulo: 'Painel de vagas',
      acoes: '<button class="botao primario" data-imprimir>Imprimir / PDF</button>',
      html: `<div id="corpo-relatorio">
        <div class="resumo-linha">${['sepultura', 'jazigo', 'gaveta', 'ossario'].map((k) => G.numero(`${L.tipos[k]} livres`, u.inteiro(d.livres[k]), '', `#tumulos?tipo=${k}&ocupacao=vago`)).join('')}${G.numero('Sem informação de ocupação', u.inteiro(d.naoInformado), 'podem esconder vagas', '#tumulos?ocupacao=nao-informado')}</div>
        <div class="grade-graficos">
          <section class="cartao"><h3>Sepultamentos por mês (36 meses)</h3>${G.colunas(d.porMes, { largura: 520 })}<p class="ajuda">Ritmo dos últimos 12 meses: ${ritmoMedio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por mês.</p></section>
          <section class="cartao"><h3>Vagas livres por quadra</h3>${G.barrasH(d.porQuadra.filter((x) => x.valor).sort((a, b) => b.valor - a.valor), { limite: 15 })}</section>
        </div>
        <section class="cartao"><h3>Quando acaba cada tipo (previsão)</h3>
          <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Tipo</th><th class="num">Livres</th><th class="num">Sepultamentos por mês</th><th>Ritmo atual</th><th>Ritmo 30% maior</th><th>Ritmo 30% menor</th></tr></thead><tbody>
          ${d.cenarios.map((c) => `<tr><td>${esc(L.tipos[c.tipo])}</td><td class="num">${u.inteiro(c.livres)}</td><td class="num">${c.ritmo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td><td>${anosTxt(c.atual)}</td><td>${anosTxt(c.alta)}</td><td>${anosTxt(c.baixa)}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="ajuda">Conta simples: vagas livres ÷ sepultamentos por mês do último ano, em 3 cenários. Serve para planejar (ampliação, novo cemitério, ossário), não é promessa.</p></section>
        <section class="cartao"><h3>Vagas que podem voltar (cada uma depende de decisão e processo)</h3>
          <ul class="lista-simples">
            <li><b>${u.inteiro(d.voltam.concessoes)}</b> concessões temporárias vencidas${ganho(d.voltam.concessoes)}</li>
            <li><b>${u.inteiro(d.voltam.gavetas)}</b> gavetas com prazo de permanência vencido (exumação possível pela lei municipal)${ganho(d.voltam.gavetas)}</li>
            <li><b>${u.inteiro(d.voltam.abandono)}</b> túmulos em processo de abandono (em apuração ou declarado)${ganho(d.voltam.abandono)}</li>
            <li><b>${u.inteiro(d.voltam.indicio)}</b> túmulos com indício de abandono (ainda sem processo)</li>
          </ul></section>
        <section class="cartao"><h3>Ossário</h3>${G.medidor(d.nichos ? (d.nichos - d.nichosLivres) / d.nichos : 0, `${u.inteiro(d.nichos - d.nichosLivres)} de ${u.inteiro(d.nichos)} nichos ocupados · ${u.inteiro(d.nichosLivres)} livres`)}</section>
      </div>`,
      ligar() { document.querySelector('[data-imprimir]').addEventListener('click', () => ui.imprimir(document.getElementById('corpo-relatorio').innerHTML, 'Painel de vagas')); }
    };
  };
})();
