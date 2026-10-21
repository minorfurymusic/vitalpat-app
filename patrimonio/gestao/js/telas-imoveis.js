/* VitalPat Patrimônio · Gestão — etapa 5: bens imóveis (DOSSIE.md A2.12).
   Documentos com validade (escritura, habite-se, AVCB, alvarás, laudos, plantas), cessões e uso por terceiros
   (cessão, permissão, concessão de uso, comodato, locação — a terceiros e de terceiros), pendências de regularização
   com responsável e prazo, e o demonstrativo de imóveis para o TCE/SC (IN TC-20/2015, Anexo V). */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos;
  const T = VP.telas;
  const E = VP.imoveis = {};
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const selo = (classe, texto) => `<span class="selo-status im-${classe || 'neutro'}">${esc(texto)}</span>`;
  E.TIPOS_DOC = ['Matrícula atualizada', 'Escritura', 'Habite-se', 'AVCB (Corpo de Bombeiros)', 'Alvará de funcionamento', 'Alvará sanitário', 'Laudo técnico', 'Laudo de avaliação', 'Planta', 'Licença ambiental', 'Outro'];
  E.TIPOS_CESSAO = { cessao: 'Cessão de uso', permissao: 'Permissão de uso', concessao: 'Concessão de uso', comodato: 'Comodato', locacao: 'Locação' };
  E.SITUACOES_REG = ['Registrado', 'Em regularização', 'Sem registro', 'Posse'];
  const avisoDias = () => VP.config().avisoImovelDias ?? 60;

  // ------------------------------------------------------------------ regras
  E.ehImovel = (b) => b && (b.tipo === 'imovel' || b.tipo === 'infraestrutura' || !!b.imovel) && b.status !== 'baixado';
  E.lista = () => VP.db.lista('bens').filter(E.ehImovel);
  E.docsDe = (bemId) => VP.db.lista('documentosImovel').filter((d) => d.bemId === bemId).sort((a, b) => String(a.validade || '9').localeCompare(String(b.validade || '9')));
  E.cessoesDe = (bemId) => VP.db.lista('cessoesImovel').filter((c) => c.bemId === bemId).sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
  E.pendenciasDe = (bemId) => VP.db.lista('pendenciasImovel').filter((p) => p.bemId === bemId).sort((a, b) => String(a.prazo || '9').localeCompare(String(b.prazo || '9')));
  E.situacaoDoc = (d) => { if (!d.validade) return 'sem-validade'; if (d.validade < hoje()) return 'vencido'; if (d.validade <= u.somaDias(hoje(), avisoDias())) return 'vencendo'; return 'valido'; };
  E.cessaoAtiva = (c) => !c.encerradaEm && (!c.fim || c.fim >= hoje());
  E.cessaoVencida = (c) => !c.encerradaEm && !!c.fim && c.fim < hoje();
  E.cessaoVencendo = (c) => E.cessaoAtiva(c) && !!c.fim && c.fim <= u.somaDias(hoje(), avisoDias());
  E.pendAberta = (p) => p.situacao === 'aberta';
  E.pendAtrasada = (p) => E.pendAberta(p) && !!p.prazo && p.prazo < hoje();
  E.alertas = () => {
    const ids = new Set(E.lista().map((b) => b.id));
    const docs = VP.db.lista('documentosImovel').filter((d) => ids.has(d.bemId));
    const ces = VP.db.lista('cessoesImovel').filter((c) => ids.has(c.bemId));
    const pend = VP.db.lista('pendenciasImovel').filter((p) => ids.has(p.bemId));
    return {
      docsVencidos: docs.filter((d) => E.situacaoDoc(d) === 'vencido'),
      docsVencendo: docs.filter((d) => E.situacaoDoc(d) === 'vencendo'),
      cessoesVencidas: ces.filter(E.cessaoVencida),
      cessoesVencendo: ces.filter(E.cessaoVencendo),
      pendAtrasadas: pend.filter(E.pendAtrasada),
      semRegistroSemPendencia: E.lista().filter((b) => b.tipo === 'imovel' && b.imovel?.situacaoRegistro && b.imovel.situacaoRegistro !== 'Registrado' && !E.pendenciasDe(b.id).some(E.pendAberta)),
      semMotivo: E.lista().filter((b) => b.tipo === 'imovel' && b.imovel?.situacaoRegistro && b.imovel.situacaoRegistro !== 'Registrado' && !b.imovel.motivoPendencia)
    };
  };
  const evento = (b, descricao, extra = {}) => VP.novoEvento(b.id, 'observacao', { descricao, extra });

  // ------------------------------------------------------------------ ações
  E.novoDocumento = (b, depois, d0 = null) => ui.formulario({
    titulo: (d0 ? 'Editar documento — ' : 'Documento do imóvel — ') + b.descricao, largura: 'media',
    campos: [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: E.TIPOS_DOC.map((x) => [x, x]), obrigatorio: true, largura: 'meia' }, { chave: 'numero', rotulo: 'Número ou identificação', largura: 'meia' },
      { chave: 'emissao', rotulo: 'Emissão', tipo: 'data', largura: 'meia' }, { chave: 'validade', rotulo: 'Validade (vazio se não vence)', tipo: 'data', largura: 'meia' },
      { chave: 'orgao', rotulo: 'Órgão que emitiu', largura: 'meia' }, { chave: 'observacao', rotulo: 'Observação', largura: 'meia' },
      { chave: 'arquivos', rotulo: 'Arquivo (PDF ou foto)', tipo: 'arquivo', multiplo: true, aceita: 'image/*,application/pdf' }],
    valores: d0 || {},
    salvar: async (x) => {
      if (x.validade && x.emissao && x.validade < x.emissao) return 'A validade não pode ser antes da emissão.';
      const arquivos = await ui.lerArquivos(x.arquivos, { reduzirImagem: true });
      const d = d0 || { id: u.id(), bemId: b.id, criadoEm: agora(), usuario: usuario(), arquivos: [] };
      const antes = d0 ? JSON.stringify({ tipo: d0.tipo, numero: d0.numero, validade: d0.validade }) : '';
      Object.assign(d, { tipo: x.tipo, numero: x.numero, emissao: x.emissao, validade: x.validade, orgao: x.orgao, observacao: x.observacao });
      d.arquivos = (d.arquivos || []).concat(arquivos);
      await VP.db.gravarVarias({ documentosImovel: [d], eventos: [evento(b, `${d0 ? 'Documento alterado' : 'Documento registrado'}: ${x.tipo}${x.numero ? ' ' + x.numero : ''}${x.validade ? ' (validade ' + u.data(x.validade) + ')' : ''}`, { documentoId: d.id, antes })] });
      ui.aviso('Documento salvo.'); depois && depois();
    }
  });
  E.novaCessao = (b, depois) => ui.formulario({
    titulo: 'Cessão ou uso por terceiros — ' + b.descricao, largura: 'media',
    intro: '<p class="ajuda">Registre quando a prefeitura cede o imóvel a alguém, ou quando usa um imóvel de terceiros (locação, comodato recebido).</p>',
    campos: [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(E.TIPOS_CESSAO), obrigatorio: true, largura: 'meia' },
      { chave: 'direcao', rotulo: 'Direção', tipo: 'select', opcoes: [['a-terceiros', 'A prefeitura cede a terceiros'], ['de-terceiros', 'A prefeitura usa imóvel de terceiros']], obrigatorio: true, largura: 'meia' },
      { chave: 'parte', rotulo: 'Com quem (nome do órgão, entidade ou pessoa)', obrigatorio: true },
      { chave: 'instrumento', rotulo: 'Instrumento (termo, contrato, lei)', largura: 'meia' }, { chave: 'valor', rotulo: 'Valor mensal (se houver)', tipo: 'moeda', largura: 'meia' },
      { chave: 'inicio', rotulo: 'Início', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'fim', rotulo: 'Fim (vazio se indeterminado)', tipo: 'data', largura: 'meia' },
      { chave: 'finalidade', rotulo: 'Finalidade', tipo: 'area' }],
    salvar: async (x) => {
      if (x.fim && x.fim <= x.inicio) return 'O fim precisa ser depois do início.';
      const c = Object.assign({ id: u.id(), bemId: b.id, historico: [{ quando: agora(), acao: 'registrada', usuario: usuario() }], criadoEm: agora(), usuario: usuario() }, x);
      await VP.db.gravarVarias({ cessoesImovel: [c], eventos: [evento(b, `${E.TIPOS_CESSAO[x.tipo]} ${x.direcao === 'a-terceiros' ? 'a' : 'de'} ${x.parte}: ${u.data(x.inicio)} a ${x.fim ? u.data(x.fim) : 'prazo indeterminado'}`, { cessaoId: c.id })] });
      ui.aviso('Registrado.'); depois && depois();
    }
  });
  E.renovarCessao = (b, c, depois) => ui.formulario({
    titulo: `Renovar ${E.TIPOS_CESSAO[c.tipo].toLowerCase()} — ${c.parte}`, largura: 'pequena',
    campos: [{ chave: 'fim', rotulo: 'Novo fim', tipo: 'data', obrigatorio: true }, { chave: 'instrumento', rotulo: 'Instrumento da renovação (termo aditivo)', obrigatorio: true }],
    salvar: async (x) => {
      if (x.fim <= (c.fim || c.inicio)) return 'O novo fim precisa ser depois do fim atual.';
      c.historico = (c.historico || []).concat({ quando: agora(), acao: 'renovada', de: c.fim, para: x.fim, nota: x.instrumento, usuario: usuario() });
      const antes = c.fim; c.fim = x.fim;
      await VP.db.gravarVarias({ cessoesImovel: [c], eventos: [evento(b, `${E.TIPOS_CESSAO[c.tipo]} (${c.parte}) renovada: ${u.data(antes)} → ${u.data(x.fim)} · ${x.instrumento}`, { cessaoId: c.id })] });
      ui.aviso('Renovada.'); depois && depois();
    }
  });
  E.encerrarCessao = (b, c, depois) => ui.formulario({
    titulo: `Encerrar ${E.TIPOS_CESSAO[c.tipo].toLowerCase()} — ${c.parte}`, largura: 'pequena',
    campos: [{ chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: hoje() }, { chave: 'motivo', rotulo: 'Motivo (ex.: imóvel devolvido, vistoria de devolução)', tipo: 'area', obrigatorio: true }],
    salvar: async (x) => {
      c.encerradaEm = x.data;
      c.historico = (c.historico || []).concat({ quando: agora(), acao: 'encerrada', nota: x.motivo, usuario: usuario() });
      await VP.db.gravarVarias({ cessoesImovel: [c], eventos: [evento(b, `${E.TIPOS_CESSAO[c.tipo]} (${c.parte}) encerrada em ${u.data(x.data)}: ${x.motivo}`, { cessaoId: c.id })] });
      ui.aviso('Encerrada.'); depois && depois();
    }
  });
  E.novaPendencia = (b, depois) => ui.formulario({
    titulo: 'Pendência de regularização — ' + b.descricao, largura: 'media',
    campos: [{ chave: 'descricao', rotulo: 'O que precisa ser feito (ex.: retificar matrícula, obter habite-se)', tipo: 'area', obrigatorio: true },
      { chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: VP.db.lista('responsaveis').sort((a, b2) => a.nome.localeCompare(b2.nome, 'pt-BR')).map((r) => [r.id, r.nome]), obrigatorio: true, largura: 'meia' },
      { chave: 'prazo', rotulo: 'Prazo', tipo: 'data', obrigatorio: true, largura: 'meia', padrao: u.somaDias(hoje(), 90) }],
    salvar: async (x) => {
      const p = Object.assign({ id: u.id(), bemId: b.id, situacao: 'aberta', abertaEm: hoje(), historico: [{ quando: agora(), acao: 'aberta', usuario: usuario() }], criadoEm: agora(), usuario: usuario() }, x);
      await VP.db.gravarVarias({ pendenciasImovel: [p], eventos: [evento(b, `Pendência de regularização aberta: ${x.descricao} (prazo ${u.data(x.prazo)})`, { pendenciaId: p.id })] });
      ui.aviso('Pendência aberta.'); depois && depois();
    }
  });
  E.andamentoPendencia = (b, p, depois) => ui.formulario({
    titulo: 'Andamento da pendência', largura: 'pequena',
    intro: `<p>${esc(p.descricao)}</p>`,
    campos: [{ chave: 'acao', rotulo: 'O que aconteceu', tipo: 'select', opcoes: [['andamento', 'Registrar andamento'], ['prazo', 'Novo prazo'], ['resolvida', 'Resolvida'], ['cancelada', 'Cancelada (não se aplica)']], obrigatorio: true },
      { chave: 'prazo', rotulo: 'Novo prazo (se for o caso)', tipo: 'data' }, { chave: 'nota', rotulo: 'Detalhe', tipo: 'area', obrigatorio: true }],
    salvar: async (x) => {
      if (x.acao === 'prazo' && !x.prazo) return 'Informe o novo prazo.';
      if (x.acao === 'prazo') p.prazo = x.prazo;
      if (x.acao === 'resolvida' || x.acao === 'cancelada') { p.situacao = x.acao; p.encerradaEm = hoje(); }
      p.historico = (p.historico || []).concat({ quando: agora(), acao: { andamento: 'andamento', prazo: 'novo prazo ' + u.data(x.prazo), resolvida: 'resolvida', cancelada: 'cancelada' }[x.acao], nota: x.nota, usuario: usuario() });
      await VP.db.gravarVarias({ pendenciasImovel: [p], eventos: [evento(b, `Pendência "${p.descricao.slice(0, 60)}": ${x.acao === 'prazo' ? 'novo prazo ' + u.data(x.prazo) : x.acao} — ${x.nota}`, { pendenciaId: p.id })] });
      ui.aviso('Registrado.'); depois && depois();
    }
  });

  // ------------------------------------------------------------------ ficha do imóvel: 3 seções
  const seloDoc = (d) => ({ vencido: selo('ruim', 'Vencido'), vencendo: selo('regular', 'Vencendo'), valido: selo('bom', 'Válido'), 'sem-validade': selo('', 'Sem validade') }[E.situacaoDoc(d)]);
  const seloCessao = (c) => (c.encerradaEm ? selo('', 'Encerrada') : E.cessaoVencida(c) ? selo('ruim', 'Vencida') : E.cessaoVencendo(c) ? selo('regular', 'Vencendo') : selo('bom', 'Em vigor'));
  E.secoesFicha = (b) => {
    const docs = E.docsDe(b.id), ces = E.cessoesDe(b.id), pend = E.pendenciasDe(b.id);
    const arq = (l) => (l || []).filter((a) => a.dataURL).map((a) => `<a href="${esc(a.dataURL)}" target="_blank" rel="noopener" download="${esc(a.nome || 'documento')}">${esc(a.nome || 'arquivo')}</a>`).join(' ');
    const temLocal = Number.isFinite(b.imovel?.lat) && Number.isFinite(b.imovel?.lon);
    return `
      <section class="cartao secao" id="sec-matricula"><header><h3>Matrícula</h3>${b.status !== 'baixado' && (!VP.servidor?.ativo || VP.servidor.podeAlterar()) ? '<button class="botao pequeno" data-ler-matricula>Ler matrícula (PDF)</button>' : ''}</header>
        <p>${b.imovel?.matricula ? `Matrícula <b>${esc(b.imovel.matricula)}</b>${b.imovel.cartorio ? ' · ' + esc(b.imovel.cartorio) : ''}` : '<span class="vazio">Matrícula não informada.</span>'}${b.imovel?.proprietarioMatricula ? `<br>Proprietário na matrícula: ${esc(b.imovel.proprietarioMatricula)}` : ''}${b.imovel?.ultimoRegistroMatricula ? ` · último registro em ${u.data(b.imovel.ultimoRegistroMatricula)}` : ''}</p>
        <p class="ajuda">Escolha o PDF da matrícula (do cartório ou do e-Cartório): o sistema lê matrícula, cartório, área, endereço, inscrição, proprietário e data do último registro, mostra para conferir e anexa o PDF.</p></section>
      <section class="cartao secao" id="sec-local-imovel"><header><h3>Localização no mapa</h3><button class="botao pequeno" data-local-imovel>${temLocal ? 'Alterar' : 'Informar'}</button></header>
        ${temLocal ? `<p>${esc(b.imovel.lat)}, ${esc(b.imovel.lon)} · <a href="https://www.google.com/maps/search/?api=1&query=${esc(b.imovel.lat)},${esc(b.imovel.lon)}" target="_blank" rel="noopener">Abrir no Google Maps</a> · <a href="#imoveis/mapa">Ver no mapa dos imóveis</a></p>` : '<p class="vazio">Sem localização. Informe para o imóvel aparecer no mapa e no relatório com mapa.</p>'}</section>
      <section class="cartao secao" id="sec-docs-imovel"><header><h3>Documentos do imóvel</h3><button class="botao pequeno" data-imo="doc">+ Documento</button></header>
        ${docs.length ? `<ul class="lista-simples">${docs.map((d) => `<li>${seloDoc(d)} <b>${esc(d.tipo)}</b>${d.numero ? ' ' + esc(d.numero) : ''}${d.validade ? ' · validade ' + u.data(d.validade) : ''}${d.orgao ? ' · ' + esc(d.orgao) : ''} ${arq(d.arquivos)} <button class="botao pequeno" data-imo-doc="${esc(d.id)}">Atualizar</button></li>`).join('')}</ul>` : '<p class="vazio">Nenhum documento. Ex.: matrícula, habite-se, AVCB, alvarás, laudos.</p>'}</section>
      <section class="cartao secao"><header><h3>Cessões e uso por terceiros</h3><button class="botao pequeno" data-imo="cessao">+ Registrar</button></header>
        ${ces.length ? `<ul class="lista-simples">${ces.map((c) => `<li>${seloCessao(c)} <b>${esc(E.TIPOS_CESSAO[c.tipo])}</b> ${c.direcao === 'a-terceiros' ? 'a' : 'de'} ${esc(c.parte)} · ${u.data(c.inicio)} a ${c.fim ? u.data(c.fim) : 'indeterminado'}${c.instrumento ? ' · ' + esc(c.instrumento) : ''}${c.valor ? ' · ' + u.moeda(c.valor) + '/mês' : ''} ${!c.encerradaEm ? `<button class="botao pequeno" data-imo-renovar="${esc(c.id)}">Renovar</button> <button class="botao pequeno" data-imo-encerrar="${esc(c.id)}">Encerrar</button>` : ''}</li>`).join('')}</ul>` : '<p class="vazio">Nenhuma.</p>'}</section>
      <section class="cartao secao"><header><h3>Regularização</h3><button class="botao pequeno" data-imo="pendencia">+ Pendência</button></header>
        <p>Situação do registro: <b>${esc(b.imovel?.situacaoRegistro || '—')}</b>${b.imovel?.motivoPendencia ? ` · ${esc(b.imovel.motivoPendencia)}` : ''}</p>
        ${pend.length ? `<ul class="lista-simples">${pend.map((p) => `<li>${E.pendAberta(p) ? (E.pendAtrasada(p) ? selo('ruim', 'Atrasada') : selo('regular', 'Aberta')) : selo('bom', p.situacao === 'resolvida' ? 'Resolvida' : 'Cancelada')} ${esc(p.descricao)} · ${esc(VP.nome('responsaveis', p.responsavelId))} · prazo ${u.data(p.prazo)} ${E.pendAberta(p) ? `<button class="botao pequeno" data-imo-pend="${esc(p.id)}">Andamento</button>` : ''}</li>`).join('')}</ul>` : '<p class="vazio">Nenhuma pendência.</p>'}</section>`;
  };
  E.ligarFicha = (b, re) => {
    const area = document.getElementById('conteudo');
    area.querySelectorAll('[data-imo]').forEach((el) => el.addEventListener('click', () => ({ doc: () => E.novoDocumento(b, re), cessao: () => E.novaCessao(b, re), pendencia: () => E.novaPendencia(b, re) })[el.dataset.imo]()));
    area.querySelector('[data-ler-matricula]')?.addEventListener('click', () => VP.matricula.lerParaBem(b, re));
    area.querySelector('[data-local-imovel]')?.addEventListener('click', () => VP.mapas.informarLocal(b, re));
    area.querySelectorAll('[data-imo-doc]').forEach((el) => el.addEventListener('click', () => E.novoDocumento(b, re, VP.db.pega('documentosImovel', el.dataset.imoDoc))));
    area.querySelectorAll('[data-imo-renovar]').forEach((el) => el.addEventListener('click', () => E.renovarCessao(b, VP.db.pega('cessoesImovel', el.dataset.imoRenovar), re)));
    area.querySelectorAll('[data-imo-encerrar]').forEach((el) => el.addEventListener('click', () => E.encerrarCessao(b, VP.db.pega('cessoesImovel', el.dataset.imoEncerrar), re)));
    area.querySelectorAll('[data-imo-pend]').forEach((el) => el.addEventListener('click', () => E.andamentoPendencia(b, VP.db.pega('pendenciasImovel', el.dataset.imoPend), re)));
  };

  // ------------------------------------------------------------------ painel dos imóveis + demonstrativo TCE
  T.imoveis = (aba = 'painel') => {
    const abas = `<nav class="abas">${[['painel', 'Situação'], ['demonstrativo', 'Demonstrativo (TCE/SC)'], ['documentos', 'Documentos'], ['cessoes', 'Cessões'], ['pendencias', 'Pendências'], ['mapa', 'Mapa']].map(([k, n]) => `<a href="#imoveis${k === 'painel' ? '' : '/' + k}" class="${k === aba ? 'ativa' : ''}">${n}</a>`).join('')}</nav>`;
    const im = E.lista();
    const imo = im.filter((b) => b.tipo === 'imovel');
    const nomeBem = (id) => { const b = VP.db.pega('bens', id); return b ? `<a href="#bem/${esc(b.id)}">${esc(b.codigo)} · ${esc(b.descricao)}</a>` : '—'; };
    const valBem = (id) => { const b = VP.db.pega('bens', id); return b ? `${b.codigo} · ${b.descricao}` : ''; };
    const ids = new Set(im.map((b) => b.id));
    if (aba === 'mapa') return VP.mapas.telaMapa(abas);
    if (aba === 'documentos') {
      const l = VP.db.lista('documentosImovel').filter((d) => ids.has(d.bemId));
      return { titulo: 'Bens imóveis', html: abas + ui.tabela({ id: 'imo-docs', linhas: l, porPagina: 100, nomePlanilha: 'documentos-imoveis', vazio: 'Nenhum documento.', colunas: [{ chave: 'situacao', titulo: 'Situação', html: seloDoc, valor: (d) => ({ vencido: 'Vencido', vencendo: 'Vencendo', valido: 'Válido', 'sem-validade': 'Sem validade' }[E.situacaoDoc(d)]) }, { chave: 'imovel', titulo: 'Imóvel', html: (d) => nomeBem(d.bemId), valor: (d) => valBem(d.bemId) }, { chave: 'tipo', titulo: 'Documento' }, { chave: 'numero', titulo: 'Número' }, { chave: 'validade', titulo: 'Validade', valor: (d) => u.data(d.validade), ordenar: (d) => d.validade || '9' }, { chave: 'orgao', titulo: 'Órgão' }] }), ligar() { ui.ligarTabela('imo-docs'); } };
    }
    if (aba === 'cessoes') {
      const l = VP.db.lista('cessoesImovel').filter((c) => ids.has(c.bemId));
      return { titulo: 'Bens imóveis', html: abas + ui.tabela({ id: 'imo-ces', linhas: l, porPagina: 100, nomePlanilha: 'cessoes-imoveis', vazio: 'Nenhuma cessão.', colunas: [{ chave: 'situacao', titulo: 'Situação', html: seloCessao, valor: (c) => (c.encerradaEm ? 'Encerrada' : E.cessaoVencida(c) ? 'Vencida' : 'Em vigor') }, { chave: 'imovel', titulo: 'Imóvel', html: (c) => nomeBem(c.bemId), valor: (c) => valBem(c.bemId) }, { chave: 'tipo', titulo: 'Tipo', valor: (c) => E.TIPOS_CESSAO[c.tipo] }, { chave: 'direcao', titulo: 'Direção', valor: (c) => (c.direcao === 'a-terceiros' ? 'A terceiros' : 'De terceiros') }, { chave: 'parte', titulo: 'Com quem' }, { chave: 'inicio', titulo: 'Início', valor: (c) => u.data(c.inicio), ordenar: (c) => c.inicio }, { chave: 'fim', titulo: 'Fim', valor: (c) => (c.fim ? u.data(c.fim) : 'Indeterminado'), ordenar: (c) => c.fim || '9' }, { chave: 'valor', titulo: 'Valor mensal', num: true, valor: (c) => c.valor || 0, formato: u.moeda }] }), ligar() { ui.ligarTabela('imo-ces'); } };
    }
    if (aba === 'pendencias') {
      const l = VP.db.lista('pendenciasImovel').filter((p) => ids.has(p.bemId));
      return { titulo: 'Bens imóveis', html: abas + ui.tabela({ id: 'imo-pend', linhas: l, porPagina: 100, nomePlanilha: 'pendencias-imoveis', vazio: 'Nenhuma pendência.', colunas: [{ chave: 'situacao', titulo: 'Situação', valor: (p) => (E.pendAtrasada(p) ? 'Atrasada' : { aberta: 'Aberta', resolvida: 'Resolvida', cancelada: 'Cancelada' }[p.situacao]) }, { chave: 'imovel', titulo: 'Imóvel', html: (p) => nomeBem(p.bemId), valor: (p) => valBem(p.bemId) }, { chave: 'descricao', titulo: 'O que fazer' }, { chave: 'resp', titulo: 'Responsável', valor: (p) => VP.nome('responsaveis', p.responsavelId) }, { chave: 'prazo', titulo: 'Prazo', valor: (p) => u.data(p.prazo), ordenar: (p) => p.prazo || '9' }] }), ligar() { ui.ligarTabela('imo-pend'); } };
    }
    if (aba === 'demonstrativo') {
      const linhas = imo.map((b) => ({ id: b.id, codigo: b.codigo, descricao: b.descricao, endereco: [b.endereco?.logradouro, b.endereco?.bairro, b.endereco?.cidade].filter(Boolean).join(', '), unidade: VP.nome('unidades', b.unidadeId), matricula: b.imovel?.matricula || '', situacao: b.imovel?.situacaoRegistro || 'Não informado', motivo: b.imovel?.motivoPendencia || '', uso: b.imovel?.uso || '', area: b.imovel?.areaTerreno || null, construida: b.imovel?.areaConstruida || null, valor: VP.saldo(b).liquido, cedido: E.cessoesDe(b.id).some((c) => E.cessaoAtiva(c) && c.direcao === 'a-terceiros') ? 'Sim' : 'Não' }));
      const grupos = E.SITUACOES_REG.concat(['Não informado']).map((s) => ({ s, l: linhas.filter((x) => x.situacao === s) })).filter((g) => g.l.length);
      return {
        titulo: 'Bens imóveis',
        acoes: '<button class="botao primario" data-imprimir-demo>Imprimir / PDF</button>',
        html: `${abas}<div id="corpo-demo"><h2 class="so-impressao">Demonstrativo dos bens imóveis — ${esc(VP.config().entidade || '')}</h2>
          <div class="resumo-linha">${grupos.map((g) => G.numero(g.s, u.inteiro(g.l.length), u.moeda(g.l.reduce((t, x) => t + x.valor, 0)))).join('')}</div>
          <p class="ajuda">IN TC-20/2015, Anexo V: localização, situação e valor; para os não registrados, o que impede a regularização.</p>
          ${ui.tabela({ id: 'imo-demo', linhas, porPagina: 500, nomePlanilha: 'demonstrativo-imoveis', colunas: [{ chave: 'codigo', titulo: 'Código', num: true }, { chave: 'descricao', titulo: 'Imóvel', html: (x) => `<a href="#bem/${esc(x.id)}">${esc(x.descricao)}</a>`, valor: (x) => x.descricao }, { chave: 'endereco', titulo: 'Localização' }, { chave: 'unidade', titulo: 'Unidade', oculta: true }, { chave: 'matricula', titulo: 'Matrícula' }, { chave: 'situacao', titulo: 'Situação' }, { chave: 'motivo', titulo: 'O que impede o registro' }, { chave: 'uso', titulo: 'Uso' }, { chave: 'area', titulo: 'Terreno (m²)', num: true, formato: (v) => (v ? u.inteiro(v) : '') }, { chave: 'construida', titulo: 'Construída (m²)', num: true, formato: (v) => (v ? u.inteiro(v) : ''), oculta: true }, { chave: 'cedido', titulo: 'Cedido a terceiros', oculta: true }, { chave: 'valor', titulo: 'Valor contábil', num: true, soma: true, formato: u.moeda }] })}</div>`,
        ligar() { ui.ligarTabela('imo-demo'); document.querySelector('[data-imprimir-demo]').addEventListener('click', () => { const c = document.getElementById('corpo-demo').cloneNode(true); c.querySelectorAll('.tabela-barra,.paginacao').forEach((x) => x.remove()); ui.imprimir(c.innerHTML, 'Demonstrativo dos bens imóveis'); }); }
      };
    }
    const a = E.alertas();
    const porSit = E.SITUACOES_REG.map((s) => ({ rotulo: s, valor: imo.filter((b) => b.imovel?.situacaoRegistro === s).length, link: '#imoveis/demonstrativo' }));
    const porUso = ['Uso comum do povo', 'Uso especial', 'Dominical'].map((s) => ({ rotulo: s, valor: imo.filter((b) => b.imovel?.uso === s).length }));
    const lista = (titulo, itens, fmt) => (itens.length ? `<h4>${esc(titulo)} (${itens.length})</h4><ul class="lista-simples">${itens.slice(0, 8).map(fmt).join('')}${itens.length > 8 ? '<li>…</li>' : ''}</ul>` : '');
    return {
      titulo: 'Bens imóveis',
      acoes: '<a class="botao" href="#bens/imoveis">Lista de imóveis</a> <a class="botao primario" href="#novo-bem/imovel">+ Novo imóvel</a>',
      html: `${abas}<div class="resumo-linha">${G.numero('Imóveis', u.inteiro(imo.length), u.moeda(imo.reduce((t, b) => t + VP.saldo(b).liquido, 0)))}${G.numero('Não registrados', u.inteiro(imo.filter((b) => b.imovel?.situacaoRegistro && b.imovel.situacaoRegistro !== 'Registrado').length), 'em regularização, sem registro ou posse', '#imoveis/demonstrativo')}${G.numero('Documentos vencidos', u.inteiro(a.docsVencidos.length), `${a.docsVencendo.length} vencendo em ${avisoDias()} dias`, '#imoveis/documentos')}${G.numero('Cessões vencidas', u.inteiro(a.cessoesVencidas.length), `${a.cessoesVencendo.length} vencendo`, '#imoveis/cessoes')}${G.numero('Pendências atrasadas', u.inteiro(a.pendAtrasadas.length), '', '#imoveis/pendencias')}</div>
        <div class="grade-graficos"><section class="cartao"><h3>Situação do registro</h3>${G.barrasH(porSit, { mostrarZeros: true })}</section><section class="cartao"><h3>Classificação de uso</h3>${G.barrasH(porUso, { mostrarZeros: true })}</section></div>
        <section class="cartao"><h3>Para resolver</h3>
          ${lista('Não registrados sem o motivo informado (o TCE pede)', a.semMotivo, (b) => `<li><a href="#bem/${esc(b.id)}">${esc(b.codigo)} · ${esc(b.descricao)}</a></li>`)}
          ${lista('Não registrados sem pendência aberta', a.semRegistroSemPendencia, (b) => `<li><a href="#bem/${esc(b.id)}">${esc(b.codigo)} · ${esc(b.descricao)}</a> · ${esc(b.imovel.situacaoRegistro)}</li>`)}
          ${lista('Documentos vencidos', a.docsVencidos, (d) => `<li>${nomeBem(d.bemId)} · ${esc(d.tipo)} venceu em ${u.data(d.validade)}</li>`)}
          ${lista('Cessões vencidas', a.cessoesVencidas, (c) => `<li>${nomeBem(c.bemId)} · ${esc(E.TIPOS_CESSAO[c.tipo])} ${c.direcao === 'a-terceiros' ? 'a' : 'de'} ${esc(c.parte)} venceu em ${u.data(c.fim)}</li>`)}
          ${lista('Pendências atrasadas', a.pendAtrasadas, (p) => `<li>${nomeBem(p.bemId)} · ${esc(p.descricao)} · prazo ${u.data(p.prazo)}</li>`)}
          ${!a.semMotivo.length && !a.semRegistroSemPendencia.length && !a.docsVencidos.length && !a.cessoesVencidas.length && !a.pendAtrasadas.length ? '<p class="tudo-certo">✓ Nada pendente.</p>' : ''}</section>
        <section class="cartao"><h3>Fluxo de regularização (DOSSIE.md A2.12)</h3><ol class="lista-simples"><li>Levantamento: cruzar cadastro do IPTU, mapas, loteamentos aprovados e o cadastro patrimonial.</li><li>Vistoria com foto e GPS de cada imóvel (aplicativo de campo).</li><li>Pesquisa no cartório e situação do registro com o motivo.</li><li>Pendência por imóvel irregular, com responsável e prazo.</li><li>Avaliação pela comissão e incorporação contábil.</li><li>Demonstrativo para o TCE/SC: registrados, em regularização, sem registro e motivo.</li></ol></section>`,
      ligar() {}
    };
  };
})();
