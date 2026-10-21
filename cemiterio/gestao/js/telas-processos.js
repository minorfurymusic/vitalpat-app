/* VitalPat Cemitério · Gestão — etapa 4: processo administrativo do abandono (DOSSIE.md B2-D).
   Notificação (e-mail e WhatsApp; carta com AR opcional, pendência jurídica), aviso no túmulo, edital em lote,
   prazo para manifestação, defesa ou termo de compromisso, decisão fundamentada e dossiê para imprimir.
   O sistema não envia nada sozinho nem decide nada: prepara o texto, conta os prazos, barra o que falta e registra. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const E = VP.etapa4 = {};
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const tum = (id) => VP.db.pega('tumulos', id);
  const cod = (id) => { const t = tum(id); return t ? VP.codigoTumulo(t) : '—'; };
  const selo = (classe, texto) => `<span class="selo-status ${classe}">${esc(texto)}</span>`;

  // ------------------------------------------------------------------ regras (sem tela)
  VP.processosDe = (tid) => VP.db.lista('processos').filter((p) => p.tumuloId === tid).sort((a, b) => String(b.abertoEm).localeCompare(String(a.abertoEm)));
  VP.processoAberto = (tid) => VP.processosDe(tid).find((p) => p.situacao === 'andamento') || null;
  // Soma dias corridos ou úteis (segunda a sexta; feriados não são descontados — conferir no calendário do município)
  E.somaDias = (iso, n, uteis) => {
    const d = new Date(iso + 'T12:00:00');
    if (!uteis) { d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
    let k = 0;
    while (k < n) { d.setDate(d.getDate() + 1); const s = d.getDay(); if (s !== 0 && s !== 6) k++; }
    return d.toISOString().slice(0, 10);
  };
  // Início do prazo: a ciência mais tardia entre a notificação confirmada e o edital publicado (o mais favorável ao titular)
  E.inicioPrazo = (p) => {
    const recebidas = (p.notificacoes || []).filter((n) => n.resultado === 'entregue').map((n) => n.data).sort();
    const datas = [recebidas[0], p.edital?.data].filter(Boolean).sort();
    return datas.length ? datas[datas.length - 1] : null;
  };
  E.fimPrazo = (p) => { const i = E.inicioPrazo(p); const c = VP.config(); return i ? E.somaDias(i, p.prazoDias ?? c.prazoManifestacaoDias, p.prazoUteis ?? c.prazoManifestacaoUteis) : null; };
  E.defesaPendente = (p) => (p.manifestacoes || []).some((m) => m.tipo === 'defesa' && !m.resposta);
  E.termoEmAberto = (p) => (p.manifestacoes || []).find((m) => m.tipo === 'termo' && m.cumprido == null) || null;
  E.fase = (p) => {
    if (p.situacao !== 'andamento') return 'encerrado';
    if (E.defesaPendente(p)) return 'analise';
    if (E.termoEmAberto(p)) return 'termo';
    const fim = E.fimPrazo(p);
    if (!fim) return (p.notificacoes || []).length ? 'edital' : 'notificacao';
    return fim < hoje() ? 'decisao' : 'prazo';
  };
  // O que falta para declarar o abandono (lista vazia = a autoridade pode decidir)
  E.faltasDeclarar = (p) => {
    const c = VP.config();
    const f = [];
    if (!(p.notificacoes || []).length) f.push('Registrar pelo menos uma tentativa de notificação ao titular ou responsável.');
    if (c.exigirAR && !(p.notificacoes || []).some((n) => n.meio === 'carta')) f.push('Configuração exige carta com AR.');
    if (c.exigirAvisoTumulo && !p.aviso) f.push('Registrar o aviso (placa) colocado no túmulo, com foto.');
    if (!(p.notificacoes || []).some((n) => n.resultado === 'entregue') && !p.edital) f.push('Sem notificação confirmada: publicar edital.');
    const fim = E.fimPrazo(p);
    if (!fim) f.push('O prazo para manifestação ainda não começou.');
    else if (fim >= hoje()) f.push(`O prazo para manifestação termina em ${u.data(fim)}.`);
    if (E.defesaPendente(p)) f.push('Há defesa sem resposta.');
    if (E.termoEmAberto(p)) f.push('Há termo de compromisso sem verificação.');
    const t = tum(p.tumuloId);
    if (t?.excecaoHistorica) f.push('Túmulo de valor histórico: consultar o órgão de patrimônio cultural.');
    if (VP.concessaoAtual(p.tumuloId)?.tipo === 'perpetua' && !c.leiPermiteRetomadaPerpetua) f.push('Concessão perpétua: a lei municipal precisa permitir a retomada (Configurações).');
    return f;
  };
  E.contato = (p) => {
    const c = VP.concessaoAtual(p.tumuloId);
    return { nome: c?.titular || '', telefone: c?.telefone || '', email: c?.email || '', endereco: c?.endereco || '' };
  };
  E.textoNotificacao = (p) => {
    const t = tum(p.tumuloId);
    const ct = E.contato(p);
    const c = VP.config();
    return `${VP.nomeEntidade()}\nProcesso administrativo nº ${p.numero}\n\nPrezado(a) ${ct.nome || 'responsável'},\n\nInformamos que o túmulo ${VP.codigoTumulo(t)} (${VP.rotuloTumulo(t)}, ${VP.nome('cemiterios', t.cemiterioId)}) foi vistoriado e apresenta sinais de possível abandono. Pedimos que entre em contato com a administração do cemitério em até ${c.prazoManifestacaoDias} dias${c.prazoManifestacaoUteis ? ' úteis' : ''} para regularizar a situação ou apresentar sua manifestação.\n\nNenhuma medida será tomada antes do fim deste prazo e da análise da sua manifestação.\n\nAdministração do Cemitério`;
  };
  E.linkWhatsApp = (fone, texto) => { const d = String(fone || '').replace(/\D/g, ''); return `https://wa.me/${d.length <= 11 ? '55' + d : d}?text=${encodeURIComponent(texto)}`; };
  E.linkEmail = (email, p, texto) => `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent('Processo administrativo nº ' + p.numero + ' — cemitério')}&body=${encodeURIComponent(texto)}`;

  // Abre o processo (chamado por "Mudar situação" → Abandono em apuração, depois de conferir os requisitos)
  E.abrir = async (t, x) => {
    const atual = VP.situacaoAtual(t);
    const reg = { de: atual, para: 'apuracao', data: hoje(), motivo: x.motivo, processo: x.processo, revisor: x.revisor, ato: '', dataAto: '', usuario: usuario(), quando: agora() };
    const p = { id: u.id(), numero: x.processo, tumuloId: t.id, abertoEm: hoje(), revisor: x.revisor, motivoAbertura: x.motivo, situacao: 'andamento', notificacoes: [], manifestacoes: [], aviso: null, edital: null, decisao: null, historico: [{ quando: agora(), acao: 'Processo aberto', nota: x.motivo, usuario: usuario() }], usuario: usuario(), criadoEm: agora() };
    t.situacao = 'apuracao'; t.situacaoHist = (t.situacaoHist || []).concat(reg); t.processo = x.processo;
    await VP.db.gravarVarias({ tumulos: [t], processos: [p], eventos: [VP.novoEvento(t.id, 'situacao', { descricao: `${L.situacoes[atual]} → ${L.situacoes.apuracao}. Processo ${x.processo} aberto. Revisão: ${x.revisor}. Motivo: ${x.motivo}`, extra: reg })] });
    return p;
  };
  const gravarPasso = (p, acao, nota, extraDocs = {}) => {
    p.historico = (p.historico || []).concat({ quando: agora(), acao, nota: nota || '', usuario: usuario() });
    const ev = VP.novoEvento(p.tumuloId, 'processo', { descricao: `Processo ${p.numero}: ${acao}${nota ? ' — ' + nota : ''}`, extra: { processoId: p.id } });
    const docs = Object.assign({}, extraDocs);
    docs.processos = (docs.processos || []).concat(p);
    docs.eventos = (docs.eventos || []).concat(ev);
    return VP.db.gravarVarias(docs);
  };

  // ------------------------------------------------------------------ ações
  E.notificar = (p, depois) => {
    const ct = E.contato(p);
    const texto = E.textoNotificacao(p);
    const campos = [
      { chave: 'meio', rotulo: 'Meio', tipo: 'select', opcoes: Object.entries(L.meiosNotificacao), obrigatorio: true, largura: 'meia', padrao: ct.telefone ? 'whatsapp' : 'email' },
      { chave: 'data', rotulo: 'Data do envio', tipo: 'data', obrigatorio: true, padrao: hoje(), largura: 'meia' },
      { chave: 'destinatario', rotulo: 'Para quem', obrigatorio: true, largura: 'meia', padrao: ct.nome },
      { chave: 'contato', rotulo: 'E-mail, telefone ou endereço usado', obrigatorio: true, largura: 'meia', padrao: ct.telefone || ct.email },
      { chave: 'resultado', rotulo: 'Resultado', tipo: 'select', opcoes: Object.entries(L.resultadosNotificacao), obrigatorio: true, largura: 'meia', padrao: 'enviada' },
      { chave: 'comprovante', rotulo: 'Comprovante (print da conversa, e-mail, AR)', tipo: 'arquivo', multiplo: true, aceita: 'image/*,application/pdf' },
      { chave: 'nota', rotulo: 'Observação', tipo: 'area' }];
    ui.formulario({
      titulo: `Notificação — processo ${p.numero}`, campos, largura: 'media',
      intro: `<p class="ajuda">O sistema não envia nada sozinho. Use os botões para abrir o WhatsApp ou o e-mail já com o texto, envie, e registre aqui com o comprovante.</p>
        <details><summary>Texto da notificação</summary><pre class="texto-notificacao">${esc(texto)}</pre></details>
        <div class="linha-botoes">${ct.telefone ? `<a class="botao pequeno" target="_blank" rel="noopener" href="${esc(E.linkWhatsApp(ct.telefone, texto))}">Abrir no WhatsApp</a>` : ''}${ct.email ? `<a class="botao pequeno" href="${esc(E.linkEmail(ct.email, p, texto))}">Abrir no e-mail</a>` : ''}<button type="button" class="botao pequeno" data-copiar-texto>Copiar texto</button>${!ct.telefone && !ct.email ? '<span class="ajuda">Titular sem telefone e e-mail no cadastro da concessão.</span>' : ''}</div>`,
      salvar: async (x) => {
        if (x.data > hoje()) return 'A data não pode ser no futuro.';
        if (x.data < p.abertoEm) return 'A notificação não pode ser anterior à abertura do processo.';
        const comprovante = await ui.lerArquivos(x.comprovante);
        p.notificacoes = (p.notificacoes || []).concat({ id: u.id(), meio: x.meio, data: x.data, destinatario: x.destinatario, contato: x.contato, resultado: x.resultado, comprovante, nota: x.nota, usuario: usuario() });
        await gravarPasso(p, `Notificação por ${L.meiosNotificacao[x.meio].toLowerCase()} (${L.resultadosNotificacao[x.resultado].toLowerCase()})`, `${x.destinatario} · ${x.contato}`);
        ui.aviso('Notificação registrada.'); depois && depois();
      }
    });
    setTimeout(() => document.querySelector('dialog.janela[open] [data-copiar-texto]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(texto); ui.aviso('Texto copiado.'); } catch (_) { ui.aviso('Não foi possível copiar; selecione o texto acima.', 'erro'); } }), 0);
  };
  E.atualizarNotificacao = (p, n, depois) => ui.formulario({
    titulo: 'Atualizar resultado da notificação', largura: 'pequena',
    campos: [{ chave: 'resultado', rotulo: 'Resultado', tipo: 'select', opcoes: Object.entries(L.resultadosNotificacao), obrigatorio: true, padrao: n.resultado }, { chave: 'data', rotulo: 'Data da confirmação ou da resposta', tipo: 'data', obrigatorio: true, padrao: hoje() }, { chave: 'nota', rotulo: 'Observação', tipo: 'area' }],
    salvar: async (x) => {
      const antes = n.resultado;
      n.resultado = x.resultado;
      if (x.resultado === 'entregue') n.data = x.data; // ciência conta a partir da confirmação
      n.historico = (n.historico || []).concat({ quando: agora(), de: antes, para: x.resultado, nota: x.nota, usuario: usuario() });
      await gravarPasso(p, `Notificação atualizada: ${L.resultadosNotificacao[antes].toLowerCase()} → ${L.resultadosNotificacao[x.resultado].toLowerCase()}`, x.nota);
      ui.aviso('Atualizado.'); depois && depois();
    }
  });
  E.aviso = (p, depois) => ui.formulario({
    titulo: `Aviso no túmulo — processo ${p.numero}`, largura: 'pequena',
    campos: [{ chave: 'data', rotulo: 'Data em que a placa foi colocada', tipo: 'data', obrigatorio: true, padrao: hoje() }, { chave: 'fotos', rotulo: 'Foto da placa no túmulo', tipo: 'arquivo', multiplo: true, aceita: 'image/*' }, { chave: 'nota', rotulo: 'Observação', tipo: 'area' }],
    salvar: async (x) => {
      const fotos = await ui.lerArquivos(x.fotos);
      if (!fotos.length) return 'A foto da placa é a prova do aviso. Anexe pelo menos uma.';
      p.aviso = { data: x.data, fotos, nota: x.nota, usuario: usuario() };
      await gravarPasso(p, 'Aviso (placa) colocado no túmulo', u.data(x.data));
      ui.aviso('Aviso registrado.'); depois && depois();
    }
  });
  E.manifestacao = (p, depois) => ui.formulario({
    titulo: `Manifestação — processo ${p.numero}`, largura: 'media',
    intro: '<p class="ajuda">Defesa escrita (será analisada e respondida) ou termo de compromisso (a família se compromete a reformar ou limpar até um prazo).</p>',
    campos: [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: [['defesa', 'Defesa escrita'], ['termo', 'Termo de compromisso']], obrigatorio: true, largura: 'meia' },
      { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: hoje(), largura: 'meia' },
      { chave: 'quem', rotulo: 'Quem se manifestou (nome e vínculo)', obrigatorio: true },
      { chave: 'texto', rotulo: 'Resumo do que foi dito ou combinado', tipo: 'area', obrigatorio: true },
      { chave: 'prazo', rotulo: 'Prazo do termo (se for termo)', tipo: 'data', largura: 'meia', padrao: E.somaDias(hoje(), VP.config().prazoTermoDias, false) },
      { chave: 'arquivos', rotulo: 'Documento assinado', tipo: 'arquivo', multiplo: true, aceita: 'image/*,application/pdf' }],
    salvar: async (x) => {
      if (x.tipo === 'termo' && !x.prazo) return 'Informe o prazo do termo.';
      if (x.tipo === 'termo' && x.prazo <= x.data) return 'O prazo do termo precisa ser depois da data.';
      const arquivos = await ui.lerArquivos(x.arquivos);
      p.manifestacoes = (p.manifestacoes || []).concat({ id: u.id(), tipo: x.tipo, data: x.data, quem: x.quem, texto: x.texto, prazo: x.tipo === 'termo' ? x.prazo : '', arquivos, cumprido: x.tipo === 'termo' ? null : undefined, resposta: '', usuario: usuario() });
      await gravarPasso(p, x.tipo === 'termo' ? `Termo de compromisso assinado (prazo ${u.data(x.prazo)})` : 'Defesa escrita recebida', x.quem);
      ui.aviso('Manifestação registrada.'); depois && depois();
    }
  });
  E.responderDefesa = (p, m, depois) => ui.formulario({
    titulo: 'Responder defesa', largura: 'media',
    intro: `<p><b>${esc(m.quem)}</b> (${u.data(m.data)}): ${esc(m.texto)}</p>`,
    campos: [{ chave: 'resposta', rotulo: 'Análise e resposta fundamentada', tipo: 'area', obrigatorio: true }, { chave: 'acolhida', rotulo: 'A defesa foi acolhida (o processo deve ser arquivado)', tipo: 'bool' }],
    salvar: async (x) => {
      Object.assign(m, { resposta: x.resposta, acolhida: !!x.acolhida, respondidaEm: hoje(), respondidaPor: usuario() });
      await gravarPasso(p, `Defesa respondida (${x.acolhida ? 'acolhida' : 'não acolhida'})`, x.resposta);
      ui.aviso('Resposta registrada.' + (x.acolhida ? ' Registre a decisão de arquivar.' : '')); depois && depois();
    }
  });
  E.verificarTermo = (p, m, depois) => ui.formulario({
    titulo: 'Verificar termo de compromisso', largura: 'pequena',
    intro: `<p>Prazo: ${u.data(m.prazo)}. Faça uma vistoria antes de verificar.</p>`,
    campos: [{ chave: 'cumprido', rotulo: 'Resultado', tipo: 'select', opcoes: [['sim', 'Cumprido'], ['nao', 'Não cumprido']], obrigatorio: true }, { chave: 'nota', rotulo: 'O que foi visto', tipo: 'area', obrigatorio: true }],
    salvar: async (x) => {
      if (x.cumprido === 'nao' && m.prazo >= hoje()) return 'O prazo do termo ainda não terminou.';
      Object.assign(m, { cumprido: x.cumprido === 'sim', verificadoEm: hoje(), notaVerificacao: x.nota, verificadoPor: usuario() });
      await gravarPasso(p, `Termo de compromisso ${x.cumprido === 'sim' ? 'cumprido' : 'não cumprido'}`, x.nota);
      ui.aviso('Verificação registrada.'); depois && depois();
    }
  });
  E.decidir = (p, depois) => {
    const faltas = E.faltasDeclarar(p);
    ui.formulario({
      titulo: `Decisão — processo ${p.numero}`, largura: 'media',
      intro: `<p class="aviso-inline">A decisão é da autoridade competente. O sistema só registra e confere o que falta para declarar o abandono.</p>
        ${faltas.length ? `<p><b>Para declarar o abandono ainda falta:</b></p><ul class="requisitos">${faltas.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p class="ajuda">Arquivar (regularizado ou outro motivo) pode ser decidido a qualquer momento.</p>` : '<p>Requisitos para declarar o abandono atendidos.</p>'}`,
      campos: [{ chave: 'resultado', rotulo: 'Decisão', tipo: 'select', opcoes: Object.entries(L.resultadosProcesso), obrigatorio: true },
        { chave: 'fundamentacao', rotulo: 'Fundamentação', tipo: 'area', obrigatorio: true },
        { chave: 'autoridade', rotulo: 'Autoridade que decidiu (nome e cargo)', obrigatorio: true },
        { chave: 'ato', rotulo: 'Nº do ato publicado (obrigatório para declarar)', largura: 'meia' }, { chave: 'dataAto', rotulo: 'Data da publicação', tipo: 'data', largura: 'meia' }],
      salvar: async (x) => {
        if (x.resultado === 'declarado') {
          if (faltas.length) return 'Ainda não pode declarar: ' + faltas.join(' ');
          if (!x.ato || !x.dataAto) return 'Informe o nº do ato e a data da publicação.';
          if (x.dataAto > hoje()) return 'A data da publicação não pode ser no futuro.';
        }
        const t = tum(p.tumuloId);
        const atual = VP.situacaoAtual(t);
        const para = x.resultado === 'declarado' ? 'declarado' : 'regular';
        p.decisao = { data: hoje(), resultado: x.resultado, fundamentacao: x.fundamentacao, autoridade: x.autoridade, ato: x.ato || '', dataAto: x.dataAto || '', usuario: usuario() };
        p.situacao = 'encerrado'; p.resultado = x.resultado; p.encerradoEm = hoje();
        const reg = { de: atual, para, data: hoje(), motivo: `Decisão do processo ${p.numero}: ${L.resultadosProcesso[x.resultado]}. ${x.fundamentacao}`, processo: p.numero, revisor: x.autoridade, ato: x.ato || '', dataAto: x.dataAto || '', usuario: usuario(), quando: agora() };
        t.situacao = para; t.situacaoHist = (t.situacaoHist || []).concat(reg);
        const ev = VP.novoEvento(t.id, 'situacao', { descricao: `${L.situacoes[atual]} → ${L.situacoes[para]} (decisão do processo ${p.numero}${x.ato ? ', ato ' + x.ato : ''})`, extra: reg });
        await gravarPasso(p, `Decisão: ${L.resultadosProcesso[x.resultado]}`, x.fundamentacao, { tumulos: [t], eventos: [ev] });
        ui.resultado({ titulo: `Processo ${p.numero} encerrado`, sucesso: [`Decisão: ${L.resultadosProcesso[x.resultado]}`, `${VP.codigoTumulo(t)}: ${L.situacoes[atual]} → ${L.situacoes[para]}`].concat(para === 'declarado' ? ['Exumação, se for o caso, é agendada pela ficha do túmulo (motivo "Abandono declarado"), respeitando o prazo mínimo.'] : []) });
        depois && depois();
      }
    });
  };

  // Edital em lote: um texto com vários túmulos (para quem não foi localizado ou não confirmou o recebimento)
  E.edital = (depois) => {
    const candidatos = VP.db.lista('processos').filter((p) => p.situacao === 'andamento' && !p.edital && tum(p.tumuloId));
    if (!candidatos.length) return ui.aviso('Nenhum processo aberto sem edital.', 'erro');
    const linha = (p) => { const t = tum(p.tumuloId); const ct = E.contato(p); return `${VP.codigoTumulo(t)} — ${VP.rotuloTumulo(t)}${ct.nome ? ' — titular: ' + ct.nome : ''} — processo ${p.numero}`; };
    ui.formulario({
      titulo: 'Gerar edital', largura: 'media',
      intro: `<p class="ajuda">Marque os processos que vão no edital (normalmente os sem notificação confirmada). Depois de publicar, registre o número e a data: o prazo de cada processo passa a contar dessa data.</p>
        <div class="lista-marcar">${candidatos.map((p) => `<label><input type="checkbox" data-proc="${esc(p.id)}" ${(p.notificacoes || []).some((n) => n.resultado === 'entregue') ? '' : 'checked'}> ${esc(linha(p))} <small>(${(p.notificacoes || []).some((n) => n.resultado === 'entregue') ? 'notificação confirmada' : 'sem notificação confirmada'})</small></label>`).join('')}</div>`,
      campos: [{ chave: 'numero', rotulo: 'Nº do edital', obrigatorio: true, largura: 'meia' }, { chave: 'data', rotulo: 'Data da publicação', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'veiculo', rotulo: 'Onde foi publicado (ex.: Diário Oficial dos Municípios — DOM/SC)', obrigatorio: true, padrao: 'Diário Oficial dos Municípios (DOM/SC)' }],
      textoSalvar: 'Registrar publicação',
      salvar: async (x, d) => {
        const ids = [...d.querySelectorAll('[data-proc]:checked')].map((c) => c.dataset.proc);
        if (!ids.length) return 'Marque pelo menos um processo.';
        if (x.data > hoje()) return 'Registre depois de publicado (data no futuro).';
        const procs = ids.map((id) => VP.db.pega('processos', id));
        const cedo = procs.filter((pr) => String(pr.abertoEm) > x.data);
        if (cedo.length) return `O edital não pode ser anterior à abertura do processo (${cedo.map((pr) => pr.numero).join(', ')}).`;
        const c = VP.config();
        const texto = `${VP.nomeEntidade()}\nEDITAL Nº ${x.numero}\n\nA administração do cemitério municipal torna público que os túmulos abaixo apresentam sinais de abandono, apurados em processo administrativo. Os titulares, sucessores ou interessados têm ${c.prazoManifestacaoDias} dias${c.prazoManifestacaoUteis ? ' úteis' : ''}, a contar desta publicação, para procurar a administração do cemitério e regularizar a situação ou apresentar manifestação.\n\n${procs.map(linha).join('\n')}\n\nNenhuma medida será tomada antes do fim do prazo e da análise das manifestações.`;
        const ed = { id: u.id(), numero: x.numero, data: x.data, veiculo: x.veiculo, processoIds: ids, texto, usuario: usuario(), criadoEm: agora() };
        const docs = { editais: [ed], processos: [], eventos: [] };
        for (const p of procs) {
          p.edital = { editalId: ed.id, numero: x.numero, data: x.data, veiculo: x.veiculo };
          p.historico = (p.historico || []).concat({ quando: agora(), acao: `Edital ${x.numero} publicado`, nota: `${x.veiculo}, ${u.data(x.data)}`, usuario: usuario() });
          docs.processos.push(p);
          docs.eventos.push(VP.novoEvento(p.tumuloId, 'processo', { descricao: `Processo ${p.numero}: edital ${x.numero} publicado em ${u.data(x.data)} (${x.veiculo})`, extra: { processoId: p.id, editalId: ed.id } }));
        }
        await VP.db.gravarVarias(docs);
        ui.resultado({ titulo: `Edital ${x.numero} registrado`, sucesso: procs.map(linha), extra: `<details open><summary>Texto do edital</summary><pre class="texto-notificacao">${esc(texto)}</pre></details>` });
        depois && depois();
      }
    });
  };

  // ------------------------------------------------------------------ telas
  const seloFase = (p) => { const f = E.fase(p); return selo({ notificacao: 'os-aberta', edital: 'os-andamento', prazo: 's-atencao', analise: 's-indicio', termo: 's-indicio', decisao: 's-apuracao', encerrado: 'os-concluida' }[f], f === 'encerrado' ? L.resultadosProcesso[p.resultado] || 'Encerrado' : L.fasesProcesso[f]); };
  T.processos = (id) => {
    if (id) return detalhe(id);
    const v = VP.estado.filtrosProc = VP.estado.filtrosProc || { aberto: true };
    const defs = [{ chave: 'aberto', rotulo: 'Só em andamento', tipo: 'bool' }, { chave: 'fase', rotulo: 'Fase', tipo: 'select', opcoes: Object.entries(L.fasesProcesso) }];
    const filtrar = () => {
      const f = ui.limparValores(v);
      let l = VP.db.lista('processos').filter((p) => tum(p.tumuloId));
      if (f.aberto) l = l.filter((p) => p.situacao === 'andamento');
      if (f.fase) l = l.filter((p) => E.fase(p) === f.fase);
      if (f.busca) { const b = u.normalizar(f.busca); l = l.filter((p) => u.normalizar([p.numero, cod(p.tumuloId), E.contato(p).nome].join(' ')).includes(b)); }
      return l.sort((a, b) => String(E.fimPrazo(a) || '9').localeCompare(String(E.fimPrazo(b) || '9')));
    };
    const colunas = [
      { chave: 'numero', titulo: 'Processo', html: (p) => `<a href="#processos/${esc(p.id)}">${esc(p.numero)}</a>`, valor: (p) => p.numero },
      { chave: 'tumulo', titulo: 'Túmulo', html: (p) => `<a href="#tumulo/${esc(p.tumuloId)}">${esc(cod(p.tumuloId))}</a>`, valor: (p) => cod(p.tumuloId) },
      { chave: 'titular', titulo: 'Titular', valor: (p) => E.contato(p).nome },
      { chave: 'aberto', titulo: 'Aberto em', valor: (p) => u.data(p.abertoEm), ordenar: (p) => p.abertoEm },
      { chave: 'fase', titulo: 'Fase', html: seloFase, valor: (p) => L.fasesProcesso[E.fase(p)] },
      { chave: 'notif', titulo: 'Notificações', num: true, valor: (p) => (p.notificacoes || []).length },
      { chave: 'edital', titulo: 'Edital', valor: (p) => (p.edital ? `${p.edital.numero} (${u.data(p.edital.data)})` : '') },
      { chave: 'prazo', titulo: 'Prazo até', html: (p) => { const f = E.fimPrazo(p); return f ? `<span class="${f < hoje() && p.situacao === 'andamento' ? 'atrasada' : ''}">${u.data(f)}</span>` : '—'; }, valor: (p) => u.data(E.fimPrazo(p)) }];
    const desenhar = () => {
      const todos = VP.db.lista('processos');
      const ab = todos.filter((p) => p.situacao === 'andamento');
      return `<div class="resumo-linha">${G.numero('Em andamento', u.inteiro(ab.length))}${G.numero('Aguardando notificação', u.inteiro(ab.filter((p) => E.fase(p) === 'notificacao').length))}${G.numero('Prontos para decisão', u.inteiro(ab.filter((p) => E.fase(p) === 'decisao').length))}${G.numero('Abandonos declarados', u.inteiro(todos.filter((p) => p.resultado === 'declarado').length))}${G.numero('Arquivados', u.inteiro(todos.filter((p) => p.situacao === 'encerrado' && p.resultado !== 'declarado').length))}</div>
        <div class="linha-filtros">${ui.filtros({ id: 'proc', defs, valores: v, placeholder: 'Buscar por processo, túmulo, titular…', aoMudar: (_x, o) => atualizar(o) })}</div>
        ${ui.tabela({ id: 'processos', colunas, linhas: filtrar(), porPagina: 100, nomePlanilha: 'processos-abandono', vazio: 'Nenhum processo neste filtro. Para abrir, use na ficha do túmulo "Mudar situação" → Abandono em apuração.', aoClicar: (p) => VP.app.ir('#processos/' + p.id) })}`;
    };
    const atualizar = (o) => { const a = document.getElementById('area-proc'); if (!a) return; a.innerHTML = desenhar(); ui.ligarTabela('processos'); if (o === 'busca') { const b = a.querySelector('.busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); } };
    const c = VP.config();
    return {
      titulo: 'Processos de abandono',
      acoes: '<button class="botao primario" data-edital>Gerar edital</button>',
      html: `<section class="cartao"><ol class="lista-simples"><li>Abrir: ficha do túmulo → "Mudar situação" → Abandono em apuração (com os requisitos da triagem).</li><li>Notificar o titular por e-mail ou WhatsApp e registrar com comprovante${c.exigirAR ? ' (carta com AR exigida)' : ''}; colocar o aviso (placa) no túmulo, com foto.</li><li>Sem confirmação de recebimento: edital (em lote).</li><li>Prazo de ${c.prazoManifestacaoDias} dias${c.prazoManifestacaoUteis ? ' úteis' : ''} para manifestação; defesa respondida ou termo de compromisso verificado.</li><li>Decisão fundamentada da autoridade, com ato publicado. Dossiê completo para imprimir.</li></ol>
        <p class="ajuda">O sistema não envia nem decide nada sozinho. Os prazos são ajustáveis em Configurações; confira a lei do município.</p></section>
        <div id="area-proc">${desenhar()}</div>`,
      ligar() { ui.ligarTabela('processos'); document.querySelector('[data-edital]').addEventListener('click', () => E.edital(() => VP.app.render())); }
    };
  };
  const listaArquivos = (l) => ((l || []).length ? `<span class="miniaturas">${l.filter((f) => f.dataURL).map((f) => (String(f.tipo || '').startsWith('image') || String(f.dataURL).startsWith('data:image') ? `<a href="${esc(f.dataURL)}" target="_blank" rel="noopener"><img src="${esc(f.dataURL)}" alt="Arquivo"></a>` : `<a href="${esc(f.dataURL)}" target="_blank" rel="noopener">${esc(f.nome || 'arquivo')}</a>`)).join('')}</span>` : '');
  const detalhe = (id) => {
    const p = VP.db.pega('processos', id);
    if (!p || !tum(p.tumuloId)) return { titulo: 'Processo', html: '<p>Processo não encontrado.</p>' };
    const t = tum(p.tumuloId);
    const ct = E.contato(p);
    const aberto = p.situacao === 'andamento';
    const fim = E.fimPrazo(p);
    const faltas = aberto ? E.faltasDeclarar(p) : [];
    const html = `
      <div class="resumo-linha">${G.numero('Fase', E.fase(p) === 'encerrado' ? (L.resultadosProcesso[p.resultado] || 'Encerrado') : L.fasesProcesso[E.fase(p)])}${G.numero('Túmulo', VP.codigoTumulo(t), VP.rotuloTumulo(t), '#tumulo/' + t.id)}${G.numero('Prazo começou', u.data(E.inicioPrazo(p)))}${G.numero('Prazo até', u.data(fim))}</div>
      <section class="cartao"><h3>Dados</h3><dl class="dados"><dt>Aberto em</dt><dd>${u.data(p.abertoEm)} por ${esc(p.usuario || '')}</dd><dt>Revisão</dt><dd>${esc(p.revisor)}</dd><dt>Motivo</dt><dd>${esc(p.motivoAbertura)}</dd><dt>Titular</dt><dd>${esc(ct.nome || '— (sem concessão cadastrada)')}${ct.telefone ? ' · ' + esc(ct.telefone) : ''}${ct.email ? ' · ' + esc(ct.email) : ''}</dd><dt>Indicadores</dt><dd>${esc(VP.indicadoresDe(t).join(', ') || '—')}</dd><dt>Vistorias</dt><dd>${VP.vistoriasDe(t.id).map((v) => `${u.data(v.data)} (nota ${VP.notaVistoria(v)})`).join(' · ') || '—'}</dd></dl></section>
      ${aberto ? `<div class="barra-acoes"><button class="botao" data-p4="notificar">Registrar notificação</button><button class="botao" data-p4="aviso">${p.aviso ? 'Trocar' : 'Registrar'} aviso no túmulo</button><button class="botao" data-p4="manifestacao">Registrar manifestação</button><button class="botao primario" data-p4="decidir">Decisão</button></div>` : ''}
      <section class="cartao"><h3>Notificações (${(p.notificacoes || []).length})</h3>
        ${(p.notificacoes || []).length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Data</th><th>Meio</th><th>Para</th><th>Resultado</th><th>Comprovante</th><th></th></tr></thead><tbody>${p.notificacoes.map((n) => `<tr><td>${u.data(n.data)}</td><td>${esc(L.meiosNotificacao[n.meio])}</td><td>${esc(n.destinatario)}<br><small>${esc(n.contato)}</small></td><td>${esc(L.resultadosNotificacao[n.resultado])}</td><td>${listaArquivos(n.comprovante) || '—'}</td><td>${aberto ? `<button class="botao pequeno" data-atualizar-notif="${esc(n.id)}">Atualizar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhuma notificação registrada.</p>'}</section>
      <section class="cartao"><h3>Aviso no túmulo e edital</h3>
        <p>Aviso (placa): ${p.aviso ? `colocado em ${u.data(p.aviso.data)} ${listaArquivos(p.aviso.fotos)}` : '<span class="atrasada">não registrado</span>'}</p>
        <p>Edital: ${p.edital ? `nº ${esc(p.edital.numero)}, ${esc(p.edital.veiculo)}, ${u.data(p.edital.data)}` : 'não publicado (use "Gerar edital" na lista de processos)'}</p></section>
      <section class="cartao"><h3>Manifestações (${(p.manifestacoes || []).length})</h3>
        ${(p.manifestacoes || []).length ? `<ul class="lista-simples">${p.manifestacoes.map((m) => `<li><b>${m.tipo === 'termo' ? 'Termo de compromisso' : 'Defesa'}</b> · ${u.data(m.data)} · ${esc(m.quem)}: ${esc(m.texto)} ${listaArquivos(m.arquivos)}
          ${m.tipo === 'termo' ? `<br>Prazo ${u.data(m.prazo)} · ${m.cumprido == null ? `<span class="atrasada">não verificado</span> ${aberto ? `<button class="botao pequeno" data-verificar-termo="${esc(m.id)}">Verificar</button>` : ''}` : m.cumprido ? 'cumprido' : 'não cumprido'}` : `<br>${m.resposta ? `Resposta (${u.data(m.respondidaEm)}, ${m.acolhida ? 'acolhida' : 'não acolhida'}): ${esc(m.resposta)}` : `<span class="atrasada">sem resposta</span> ${aberto ? `<button class="botao pequeno" data-responder="${esc(m.id)}">Responder</button>` : ''}`}`}</li>`).join('')}</ul>` : '<p class="vazio">Nenhuma.</p>'}</section>
      ${aberto ? `<section class="cartao"><h3>Para declarar o abandono</h3>${faltas.length ? `<ul class="requisitos">${faltas.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p>Requisitos atendidos. A decisão é da autoridade.</p>'}</section>` : `<section class="cartao"><h3>Decisão</h3><dl class="dados"><dt>Resultado</dt><dd>${esc(L.resultadosProcesso[p.decisao?.resultado] || '')}</dd><dt>Data</dt><dd>${u.data(p.decisao?.data)}</dd><dt>Autoridade</dt><dd>${esc(p.decisao?.autoridade || '')}</dd><dt>Fundamentação</dt><dd>${esc(p.decisao?.fundamentacao || '')}</dd>${p.decisao?.ato ? `<dt>Ato</dt><dd>${esc(p.decisao.ato)} de ${u.data(p.decisao.dataAto)}</dd>` : ''}</dl></section>`}
      <section class="cartao"><h3>Histórico do processo</h3><ol class="lista-simples">${(p.historico || []).map((h) => `<li>${u.data(String(h.quando).slice(0, 10))} — <b>${esc(h.acao)}</b>${h.nota ? ': ' + esc(h.nota) : ''} <small>(${esc(h.usuario || '')})</small></li>`).join('')}</ol></section>`;
    return {
      titulo: 'Processo ' + p.numero,
      acoes: '<a class="botao" href="#processos">‹ Processos</a> <button class="botao" data-dossie>Dossiê (imprimir / PDF)</button>',
      html,
      ligar() {
        const re = () => VP.app.render();
        document.querySelectorAll('[data-p4]').forEach((b) => b.addEventListener('click', () => ({ notificar: E.notificar, aviso: E.aviso, manifestacao: E.manifestacao, decidir: E.decidir })[b.dataset.p4](p, re)));
        document.querySelectorAll('[data-atualizar-notif]').forEach((b) => b.addEventListener('click', () => E.atualizarNotificacao(p, p.notificacoes.find((n) => n.id === b.dataset.atualizarNotif), re)));
        document.querySelectorAll('[data-responder]').forEach((b) => b.addEventListener('click', () => E.responderDefesa(p, p.manifestacoes.find((m) => m.id === b.dataset.responder), re)));
        document.querySelectorAll('[data-verificar-termo]').forEach((b) => b.addEventListener('click', () => E.verificarTermo(p, p.manifestacoes.find((m) => m.id === b.dataset.verificarTermo), re)));
        document.querySelector('[data-dossie]').addEventListener('click', () => ui.imprimir(E.dossie(p), 'Dossiê do processo ' + p.numero));
      }
    };
  };
  // Dossiê completo do caso (DOSSIE.md B2-D, passo 10): tudo num documento só, com fotos
  E.dossie = (p) => {
    const t = tum(p.tumuloId);
    const c = VP.concessaoAtual(t.id) || VP.concessoesDe(t.id)[0];
    const fotos = (l) => (l || []).filter((f) => f.dataURL && (String(f.tipo || '').startsWith('image') || String(f.dataURL).startsWith('data:image') || /^https?:/.test(f.dataURL))).map((f) => `<img src="${esc(f.dataURL)}" style="width:160px;height:120px;object-fit:cover;margin:2px;border:1px solid #ccc">`).join('');
    return `<h1>Dossiê — processo administrativo nº ${esc(p.numero)}</h1><p>${esc(VP.nomeEntidade())} · gerado em ${u.data(hoje())}</p>
      <h2>Túmulo</h2><p>${esc(VP.codigoTumulo(t))} · ${esc(VP.rotuloTumulo(t))} · ${esc(L.tipos[t.tipo])} · ${esc(VP.nome('cemiterios', t.cemiterioId))}</p>
      ${c ? `<p>Concessão ${esc(c.numero)} (${esc(L.tiposConcessao[c.tipo])}), titular ${esc(c.titular)}, CPF ${esc(VP.etapa3.cpfMascarado(c.cpf))}, ${u.data(c.inicio)} a ${c.fim ? u.data(c.fim) : 'perpétua'}${VP.concessaoVencida(c) ? ' (vencida)' : ''}</p>` : '<p>Sem concessão cadastrada.</p>'}
      <p>Sepultados: ${VP.sepultamentosDe(t.id).filter((s) => s.situacao !== 'cancelado').map((s) => `${esc(s.falecido)} (${u.data(s.data)}, ${esc(L.situacoesSepultamento[s.situacao])})`).join('; ') || 'nenhum registrado'}</p>
      <p>Indicadores documentais: ${esc(VP.indicadoresDe(t).map((k) => k + ' ' + L.indicadores[k]).join('; ') || 'nenhum')}${t.excecaoHistorica ? ' · exceção histórica' : ''}</p>
      <h2>Vistorias</h2>${VP.vistoriasDe(t.id).map((v) => `<p><b>${u.data(v.data)}</b> — estrutura ${v.v1}, limpeza ${v.v2}, identificação ${v.v3}, tampa ${v.v4} (soma ${VP.notaVistoria(v)}), visita recente: ${v.v5 === 'sim' ? 'sim' : 'não'} · ${v.origem === 'campo' ? 'aplicativo de campo' : 'gestão'}${v.gps ? ` · GPS ${v.gps.lat}, ${v.gps.lon}` : ''}${v.observacao ? ' · ' + esc(v.observacao) : ''}</p><div>${fotos(v.fotos)}</div>`).join('') || '<p>Nenhuma.</p>'}
      <h2>Abertura</h2><p>${u.data(p.abertoEm)} · revisão: ${esc(p.revisor)} · ${esc(p.motivoAbertura)}</p>
      <h2>Notificações</h2>${(p.notificacoes || []).map((n) => `<p>${u.data(n.data)} · ${esc(L.meiosNotificacao[n.meio])} · ${esc(n.destinatario)} (${esc(n.contato)}) · ${esc(L.resultadosNotificacao[n.resultado])}${n.nota ? ' · ' + esc(n.nota) : ''}</p><div>${fotos(n.comprovante)}</div>`).join('') || '<p>Nenhuma.</p>'}
      <h2>Aviso no túmulo</h2>${p.aviso ? `<p>${u.data(p.aviso.data)}${p.aviso.nota ? ' · ' + esc(p.aviso.nota) : ''}</p><div>${fotos(p.aviso.fotos)}</div>` : '<p>Não registrado.</p>'}
      <h2>Edital</h2><p>${p.edital ? `Nº ${esc(p.edital.numero)}, ${esc(p.edital.veiculo)}, ${u.data(p.edital.data)}` : 'Não publicado.'}</p>
      <h2>Prazo</h2><p>Início ${u.data(E.inicioPrazo(p))} · fim ${u.data(E.fimPrazo(p))}</p>
      <h2>Manifestações</h2>${(p.manifestacoes || []).map((m) => `<p>${m.tipo === 'termo' ? 'Termo de compromisso' : 'Defesa'} · ${u.data(m.data)} · ${esc(m.quem)}: ${esc(m.texto)}${m.tipo === 'termo' ? ` · prazo ${u.data(m.prazo)} · ${m.cumprido == null ? 'não verificado' : m.cumprido ? 'cumprido' : 'não cumprido'}` : ` · resposta: ${esc(m.resposta || 'pendente')}`}</p>`).join('') || '<p>Nenhuma.</p>'}
      <h2>Decisão</h2>${p.decisao ? `<p>${u.data(p.decisao.data)} · ${esc(L.resultadosProcesso[p.decisao.resultado])} · ${esc(p.decisao.autoridade)}${p.decisao.ato ? ` · ato ${esc(p.decisao.ato)} de ${u.data(p.decisao.dataAto)}` : ''}</p><p>${esc(p.decisao.fundamentacao)}</p>` : '<p>Pendente.</p>'}
      <h2>Exumações</h2>${VP.exumacoesDe(t.id).map((e) => `<p>${esc(e.numero)} · ${esc(e.falecido)} · ${esc(L.motivosExumacao[e.motivo])} · ${e.situacao === 'realizada' ? `feita em ${u.data(e.data)}, testemunhas ${esc((e.testemunhas || []).join(', '))}, destino ${esc(L.destinosExumacao[e.destino] || '')}` : esc(L.situacoesExumacao[e.situacao])}</p>`).join('') || '<p>Nenhuma.</p>'}
      <h2>Histórico</h2>${(p.historico || []).map((h) => `<p>${u.data(String(h.quando).slice(0, 10))} — ${esc(h.acao)}${h.nota ? ': ' + esc(h.nota) : ''} (${esc(h.usuario || '')})</p>`).join('')}`;
  };
  E.secaoFicha = (t) => {
    const ps = VP.processosDe(t.id);
    if (!ps.length) return '';
    return `<p>Processos: ${ps.map((p) => `<a href="#processos/${esc(p.id)}">${esc(p.numero)}</a> ${seloFase(p)}`).join(' · ')}</p>`;
  };
})();
