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
  E.TIPOS_DOC = ['Matrícula atualizada', 'Escritura', 'Habite-se', 'AVCB (Corpo de Bombeiros)', 'Alvará de funcionamento', 'Alvará sanitário', 'Alvará de construção', 'Laudo técnico', 'Laudo de avaliação', 'Laudo de vistoria', 'Planta', 'Planta de situação',
    'Folha de tombo', 'Ficha de cadastro', 'Termo de responsabilidade', 'Termo de entrega e recebimento', 'Termo de exame e recebimento de obras', 'Certidão vintenária', 'Cadeia dominial', 'Licença ambiental', 'Outro'];
  // Lista de conferência da situação documental (livro "Gestão patrimonial", 4.2, págs. 311–321 e 329; etapa 2, 28/10/2026).
  // Básicos = sem eles o imóvel não está documentado; complementares = pedidos conforme o caso ("Não se aplica" marcado pela pessoa).
  E.CONFERENCIA = [
    { tipo: 'Escritura', grupo: 'Básico' }, { tipo: 'Matrícula atualizada', grupo: 'Básico' },
    { tipo: 'Certidão vintenária', grupo: 'Complementar' }, { tipo: 'Cadeia dominial', grupo: 'Complementar' },
    { tipo: 'Planta', grupo: 'Complementar' }, { tipo: 'Planta de situação', grupo: 'Complementar' }, { tipo: 'Folha de tombo', grupo: 'Complementar' },
    { tipo: 'Ficha de cadastro', grupo: 'Complementar' }, { tipo: 'Termo de responsabilidade', grupo: 'Complementar' }, { tipo: 'Laudo de vistoria', grupo: 'Complementar' },
    { tipo: 'Termo de entrega e recebimento', grupo: 'Complementar' }, { tipo: 'Termo de exame e recebimento de obras', grupo: 'Complementar' },
    { tipo: 'Habite-se', grupo: 'Complementar' }, { tipo: 'Alvará de construção', grupo: 'Complementar' }];
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

  // ------------------------------------------------------------------ situação documental (lista de conferência)
  // Para cada documento: "tem" (há documento desse tipo registrado), "falta" ou "nao-aplica" (marcado pela pessoa).
  E.conferencia = (b) => {
    const tipos = new Set(E.docsDe(b.id).map((d) => d.tipo));
    const na = new Set(b.imovel?.docsNaoAplica || []);
    const itens = E.CONFERENCIA.map((c) => ({ ...c, situacao: tipos.has(c.tipo) ? 'tem' : na.has(c.tipo) ? 'nao-aplica' : 'falta' }));
    const conta = itens.filter((i) => i.situacao !== 'nao-aplica');
    const tem = conta.filter((i) => i.situacao === 'tem').length;
    return { itens, tem, total: conta.length, pct: conta.length ? Math.round((tem / conta.length) * 100) : 100, faltamBasicos: itens.filter((i) => i.grupo === 'Básico' && i.situacao === 'falta').map((i) => i.tipo), faltam: itens.filter((i) => i.situacao === 'falta').map((i) => i.tipo) };
  };
  E.marcarNaoAplica = async (b, tipo, marcar, depois) => {
    const im = b.imovel || (b.imovel = {});
    const antes = (im.docsNaoAplica || []).slice();
    im.docsNaoAplica = marcar ? [...new Set([...antes, tipo])] : antes.filter((t) => t !== tipo);
    await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `Situação documental: "${tipo}" ${marcar ? 'marcado como não se aplica' : 'volta a ser pedido'}`, extra: { mudancas: [{ campo: 'Documentos que não se aplicam', antes: antes.join('; '), depois: im.docsNaoAplica.join('; ') }] } })] });
    depois && depois();
  };
  // Limites e confrontações: sugere o trecho do texto da matrícula; a pessoa confere e corrige antes de gravar.
  E.trechoConfrontacoes = (texto) => {
    const t = String(texto || '').replace(/\s+/g, ' ');
    const i = t.search(/confronta|divisa|limita-se|limites|faz frente|frente para|pelos fundos/i);
    if (i < 0) return '';
    const ini = Math.max(0, t.lastIndexOf('.', i) + 1);
    return t.slice(ini, ini + 700).trim();
  };
  E.matriculasComTexto = (b) => String(b.imovel?.matricula || '').split(/\s*;\s*/).filter(Boolean).map((n) => VP.matriculaPeloNumero && VP.matriculaPeloNumero(n)).filter((m) => m && m.texto);
  E.copiarConfrontacoes = (b, depois) => {
    const mats = E.matriculasComTexto(b);
    if (!mats.length) return ui.aviso('A matrícula deste imóvel ainda não tem texto (Cadastros → Matrículas).', 'erro');
    const sugestao = mats.map((m) => { const tr = E.trechoConfrontacoes(m.texto); return tr ? (mats.length > 1 ? `Matrícula ${m.matricula}: ` : '') + tr : ''; }).filter(Boolean).join('\n');
    ui.formulario({
      titulo: 'Limites e confrontações — ' + b.descricao, largura: 'media',
      intro: `<p class="ajuda">${sugestao ? 'Trecho achado no texto da matrícula. <b>Confira e corrija</b> antes de gravar: a leitura é automática e pode pegar texto a mais ou a menos.' : 'Não achei no texto da matrícula as palavras de costume (confronta, divisa, limites, frente, fundos). Copie o trecho à mão, abrindo a matrícula na ficha.'}${b.imovel?.confrontacoes ? ' O texto que já estava gravado vai para o histórico.' : ''}</p>`,
      campos: [{ chave: 'confrontacoes', rotulo: 'Limites e confrontações', tipo: 'area', obrigatorio: true }],
      valores: { confrontacoes: sugestao || b.imovel?.confrontacoes || '' },
      salvar: async (x) => {
        const im = b.imovel || (b.imovel = {}); const antes = im.confrontacoes || '';
        im.confrontacoes = x.confrontacoes.trim();
        await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: 'Limites e confrontações copiados do texto da matrícula (conferidos pela pessoa)', extra: { mudancas: [{ campo: 'Limites e confrontações', antes, depois: im.confrontacoes }] } })] });
        ui.aviso('Limites e confrontações gravados.'); depois && depois();
      }
    });
  };

  // ------------------------------------------------------------------ ações
  E.novoDocumento = (b, depois, d0 = null, tipoInicial = '') => ui.formulario({
    titulo: (d0 ? 'Editar documento — ' : 'Documento do imóvel — ') + b.descricao, largura: 'media',
    campos: [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: E.TIPOS_DOC.map((x) => [x, x]), obrigatorio: true, largura: 'meia' }, { chave: 'numero', rotulo: 'Número ou identificação', largura: 'meia' },
      { chave: 'emissao', rotulo: 'Emissão', tipo: 'data', largura: 'meia' }, { chave: 'validade', rotulo: 'Validade (vazio se não vence)', tipo: 'data', largura: 'meia' },
      { chave: 'orgao', rotulo: 'Órgão que emitiu', largura: 'meia' }, { chave: 'observacao', rotulo: 'Observação', largura: 'meia' },
      { chave: 'arquivos', rotulo: 'Arquivo (PDF ou foto)', tipo: 'arquivo', multiplo: true, aceita: 'image/*,application/pdf' }],
    valores: d0 || (tipoInicial ? { tipo: tipoInicial } : {}),
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
  // ------------------------------------------------------------------ benfeitorias (livro 4.2, págs. 299, 313–318 e 351–354; etapa 3, 28/10/2026)
  // Classes do Código Civil, art. 96: necessárias (conservam o bem), úteis (aumentam ou facilitam o uso), voluptuárias (só embelezam ou dão conforto).
  E.CLASSES_BENF = { necessaria: 'Necessária (conserva o imóvel ou evita que se deteriore)', util: 'Útil (aumenta ou facilita o uso)', voluptuaria: 'Voluptuária (só embelezamento ou conforto)' };
  E.CLASSES_BENF_CURTO = { necessaria: 'Necessária', util: 'Útil', voluptuaria: 'Voluptuária' };
  // Construções que existem no terreno (Folha de Tombo: nome, pavimentos, área coberta, dependências). "Excluir" = Lixeira (fica guardada).
  E.benfeitoriasDe = (b) => (b.imovel?.benfeitorias || []).filter((x) => !x.excluido);
  E.editarBenfeitoria = (b, depois, x0 = null) => ui.formulario({
    titulo: (x0 ? 'Editar construção — ' : 'Construção no terreno — ') + b.descricao, largura: 'media',
    intro: '<p class="ajuda">Cada prédio, galpão, quadra coberta ou outra construção que existe neste terreno. Serve para a Folha de Tombo. O valor do imóvel só muda pelo botão <b>Melhoria</b> ou por reavaliação.</p>',
    campos: [{ chave: 'nome', rotulo: 'Nome (ex.: Bloco A, Ginásio, Casa do zelador)', obrigatorio: true },
      { chave: 'pavimentos', rotulo: 'Nº de pavimentos', tipo: 'numero', largura: 'meia' }, { chave: 'dependencias', rotulo: 'Nº de dependências (salas, cômodos)', tipo: 'numero', largura: 'meia' },
      { chave: 'areaConstruida', rotulo: 'Área construída (m²)', tipo: 'numero', largura: 'meia' }, { chave: 'areaCoberta', rotulo: 'Área coberta (m²)', tipo: 'numero', largura: 'meia' },
      { chave: 'ano', rotulo: 'Ano da construção', tipo: 'numero', largura: 'meia' }, { chave: 'residencial', rotulo: 'Residencial ou não', tipo: 'select', opcoes: ['Residencial', 'Não residencial'].map((v) => [v, v]), largura: 'meia' },
      { chave: 'observacao', rotulo: 'Observação', tipo: 'area' }],
    valores: x0 || {},
    salvar: async (v) => {
      if (v.ano && (v.ano < 1500 || v.ano > Number(hoje().slice(0, 4)))) return 'Ano da construção fora do esperado.';
      const im = b.imovel || (b.imovel = {});
      const lista = im.benfeitorias || (im.benfeitorias = []);
      const antes = x0 ? JSON.stringify(x0) : '';
      const x = x0 || { id: u.id(), criadoEm: agora(), usuario: usuario() };
      Object.assign(x, v);
      if (!x0) lista.push(x);
      await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `${x0 ? 'Construção alterada' : 'Construção registrada'}: ${v.nome}${v.areaConstruida ? ` (${v.areaConstruida} m²)` : ''}`, extra: { benfeitoriaId: x.id, antes } })] });
      ui.aviso('Construção salva.'); depois && depois();
    }
  });
  E.excluirBenfeitoria = (b, x, depois) => ui.formulario({
    titulo: 'Mover para a Lixeira — ' + x.nome, largura: 'pequena', textoSalvar: 'Mover para a Lixeira',
    intro: '<p class="ajuda">A construção sai da ficha, mas fica guardada no histórico. Ex.: prédio demolido (a baixa do valor é feita à parte).</p>',
    campos: [{ chave: 'motivo', rotulo: 'Motivo', tipo: 'area', obrigatorio: true }],
    salvar: async (v) => {
      x.excluido = true; x.excluidoEm = agora(); x.motivoExclusao = v.motivo;
      await VP.db.gravarVarias({ bens: [b], eventos: [VP.novoEvento(b.id, 'alteracao', { descricao: `Construção movida para a Lixeira: ${x.nome} · ${v.motivo}`, extra: { benfeitoriaId: x.id } })] });
      ui.aviso('Movida para a Lixeira.'); depois && depois();
    }
  });
  // Benfeitoria feita pela prefeitura em imóvel de terceiros (locação, comodato recebido): fica registrada na cessão e não soma ao valor do imóvel.
  E.benfeitoriaEmTerceiros = (b, c, depois) => ui.formulario({
    titulo: `Benfeitoria no imóvel de ${c.parte}`, largura: 'media',
    intro: '<p class="aviso-inline">O imóvel é de terceiros: a benfeitoria <b>não soma</b> ao valor deste cadastro. Ela fica registrada aqui, com o valor e se o dono deve indenizar, para cobrar na devolução. <b>Comunique o dono</b> por escrito, conforme o contrato.</p>',
    campos: [{ chave: 'descricao', rotulo: 'O que foi feito', tipo: 'area', obrigatorio: true },
      { chave: 'classe', rotulo: 'Tipo de benfeitoria (Código Civil, art. 96)', tipo: 'select', opcoes: Object.entries(E.CLASSES_BENF), obrigatorio: true },
      { chave: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true, largura: 'meia' }, { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: hoje(), largura: 'meia' },
      { chave: 'indenizavel', rotulo: 'O dono deve indenizar?', tipo: 'select', opcoes: [['sim', 'Sim (o contrato prevê)'], ['nao', 'Não'], ['conferir', 'A conferir no contrato']], vazio: false, largura: 'meia' },
      { chave: 'documento', rotulo: 'Documento (nota, contrato, ofício ao dono)', largura: 'meia' }],
    salvar: async (v) => {
      const x = Object.assign({ id: u.id(), criadoEm: agora(), usuario: usuario() }, v);
      c.benfeitorias = (c.benfeitorias || []).concat(x);
      await VP.db.gravarVarias({ cessoesImovel: [c], eventos: [evento(b, `Benfeitoria ${E.CLASSES_BENF_CURTO[v.classe].toLowerCase()} no imóvel de ${c.parte}: ${v.descricao} · ${u.moeda(v.valor)} · indenizável: ${{ sim: 'sim', nao: 'não', conferir: 'a conferir' }[v.indenizavel]}`, { cessaoId: c.id, benfeitoriaId: x.id })] });
      ui.aviso('Benfeitoria registrada.'); depois && depois();
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
  const SIT_CONF = { tem: ['bom', 'Tem'], falta: ['ruim', 'Falta'], 'nao-aplica': ['', 'Não se aplica'] };
  const cartaoConferencia = (b, pode) => {
    const c = E.conferencia(b);
    const linha = (i) => `<li><span class="conf-nome">${selo(SIT_CONF[i.situacao][0], SIT_CONF[i.situacao][1])} ${esc(i.tipo)}</span><span class="conf-acoes">${pode && i.situacao === 'falta' ? ` <button class="botao pequeno" data-conf-registrar="${esc(i.tipo)}">Registrar</button> <button class="botao pequeno" data-conf-na="${esc(i.tipo)}">Não se aplica</button>` : ''}${pode && i.situacao === 'nao-aplica' ? ` <button class="botao pequeno" data-conf-volta="${esc(i.tipo)}">Pedir de novo</button>` : ''}</span></li>`;
    return `<section class="cartao secao" id="sec-conferencia"><header><h3>Situação documental</h3>${pode && E.matriculasComTexto(b).length ? '<button class="botao pequeno" data-copiar-confrontacoes>Copiar limites da matrícula</button>' : ''}</header>
      <p><b>${c.tem} de ${c.total}</b> documentos (${c.pct}%)${c.faltamBasicos.length ? ` · ${selo('ruim', 'Faltam básicos')} ${esc(c.faltamBasicos.join(', '))}` : ''}</p>
      ${['Básico', 'Complementar'].map((g) => `<h4>${g === 'Básico' ? 'Básicos' : 'Complementares'}</h4><ul class="lista-conferencia">${c.itens.filter((i) => i.grupo === g).map(linha).join('')}</ul>`).join('')}
      <p class="ajuda">"Tem" = há documento desse tipo em "Documentos do imóvel". Marque "Não se aplica" quando o documento não existe para este imóvel (ex.: termo de obras em terreno sem construção).</p></section>`;
  };
  const cartaoConstrucoes = (b, pode) => {
    const l = E.benfeitoriasDe(b);
    const n = (v, suf = '') => (v || v === 0 ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + suf : '');
    return `<section class="cartao secao" id="sec-construcoes"><header><h3>Construções no terreno (benfeitorias)</h3>${pode ? '<button class="botao pequeno" data-benf-nova>+ Construção</button>' : ''}</header>
      ${l.length ? `<ul class="lista-conferencia">${l.map((x) => `<li><span class="conf-nome"><b>${esc(x.nome)}</b>${[x.pavimentos ? n(x.pavimentos) + ' pavimento(s)' : '', x.dependencias ? n(x.dependencias) + ' dependência(s)' : '', x.areaConstruida ? n(x.areaConstruida, ' m² construídos') : '', x.areaCoberta ? n(x.areaCoberta, ' m² cobertos') : '', x.ano ? 'de ' + x.ano : '', x.residencial || ''].filter(Boolean).map((t) => ' · ' + esc(t)).join('')}</span>${pode ? `<span class="conf-acoes"><button class="botao pequeno" data-benf-editar="${esc(x.id)}">Editar</button> <button class="botao pequeno" data-benf-excluir="${esc(x.id)}">Excluir</button></span>` : ''}</li>`).join('')}</ul>
        <p class="ajuda">${l.length} construção(ões) · ${n(l.reduce((t, x) => t + (Number(x.areaConstruida) || 0), 0), ' m² construídos')} no total.</p>` : '<p class="vazio">Nenhuma construção registrada. Terreno vazio, ou ainda não cadastrado.</p>'}</section>`;
  };
  E.secoesFicha = (b) => {
    const docs = E.docsDe(b.id), ces = E.cessoesDe(b.id), pend = E.pendenciasDe(b.id);
    const arq = (l) => (l || []).filter((a) => a.dataURL).map((a) => `<a href="${esc(a.dataURL)}" target="_blank" rel="noopener" download="${esc(a.nome || 'documento')}">${esc(a.nome || 'arquivo')}</a>`).join(' ');
    const temLocal = Number.isFinite(b.imovel?.lat) && Number.isFinite(b.imovel?.lon);
    const pode = b.status !== 'baixado' && (!VP.servidor?.ativo || VP.servidor.podeAlterar());
    // matrículas cadastradas (Cadastros → Matrículas) ligadas a este bem; o mesmo bloco aparece na ficha da matrícula
    const mats = VP.blocoMatricula ? String(b.imovel?.matricula || '').split(/\s*;\s*/).filter(Boolean).map(VP.matriculaPeloNumero).filter(Boolean) : [];
    return `
      <section class="cartao secao" id="sec-matricula"><header><h3>Matrícula: PDF, texto, fotos e mapas</h3>${pode ? '<button class="botao pequeno" data-ler-matricula>Ler matrícula (PDF do computador)</button>' : ''}</header>
        <p>${b.imovel?.matricula ? `Matrícula <b>${VP.linksMatriculas ? VP.linksMatriculas(b.imovel.matricula) : esc(b.imovel.matricula)}</b>${b.imovel.cartorio ? ' · ' + esc(b.imovel.cartorio) : ''}` : '<span class="vazio">Matrícula não informada.</span>'}${b.imovel?.proprietarioMatricula ? `<br>Proprietário na matrícula: ${esc(b.imovel.proprietarioMatricula)}` : ''}${b.imovel?.ultimoRegistroMatricula ? ` · último registro em ${u.data(b.imovel.ultimoRegistroMatricula)}` : ''}</p>
        ${mats.length ? mats.map((m) => `${mats.length > 1 ? `<h4>Matrícula ${esc(m.matricula)}</h4>` : ''}${VP.blocoMatricula.html(m, { pode, textoAberto: false })}`).join('') : (b.imovel?.matricula ? '<p class="ajuda">Esta matrícula ainda não está em Cadastros → Matrículas, por isso não há PDF, texto nem fotos para mostrar aqui.</p>' : '')}</section>
      ${VP.aguaLuz ? VP.aguaLuz.cartaoDoBem(b) : ''}
      <section class="cartao secao" id="sec-local-imovel"><header><h3>Localização no mapa</h3><button class="botao pequeno" data-local-imovel>${temLocal ? 'Alterar' : 'Informar'}</button></header>
        ${temLocal ? `<p>${esc(b.imovel.lat)}, ${esc(b.imovel.lon)} · <a href="https://www.google.com/maps/search/?api=1&query=${esc(b.imovel.lat)},${esc(b.imovel.lon)}" target="_blank" rel="noopener">Abrir no Google Maps</a> · <a href="#imoveis/mapa">Ver no mapa dos imóveis</a></p>` : '<p class="vazio">Sem localização. Informe para o imóvel aparecer no mapa e no relatório com mapa.</p>'}</section>
      <section class="cartao secao" id="sec-docs-imovel"><header><h3>Documentos do imóvel</h3><span>${VP.imoveisImpressos ? '<button class="botao pequeno" data-imo-impressos>Gerar documento</button> ' : ''}<button class="botao pequeno" data-imo="doc">+ Documento</button></span></header>
        ${docs.length ? `<ul class="lista-simples">${docs.map((d) => `<li>${seloDoc(d)} <b>${esc(d.tipo)}</b>${d.numero ? ' ' + esc(d.numero) : ''}${d.validade ? ' · validade ' + u.data(d.validade) : ''}${d.orgao ? ' · ' + esc(d.orgao) : ''} ${arq(d.arquivos)} <button class="botao pequeno" data-imo-doc="${esc(d.id)}">Atualizar</button></li>`).join('')}</ul>` : '<p class="vazio">Nenhum documento. Ex.: matrícula, habite-se, AVCB, alvarás, laudos.</p>'}</section>
      ${cartaoConferencia(b, pode)}
      ${cartaoConstrucoes(b, pode)}
      <section class="cartao secao"><header><h3>Cessões e uso por terceiros</h3><button class="botao pequeno" data-imo="cessao">+ Registrar</button></header>
        ${ces.length ? `<ul class="lista-simples">${ces.map((c) => `<li>${seloCessao(c)} <b>${esc(E.TIPOS_CESSAO[c.tipo])}</b> ${c.direcao === 'a-terceiros' ? 'a' : 'de'} ${esc(c.parte)} · ${u.data(c.inicio)} a ${c.fim ? u.data(c.fim) : 'indeterminado'}${c.instrumento ? ' · ' + esc(c.instrumento) : ''}${c.valor ? ' · ' + u.moeda(c.valor) + '/mês' : ''} ${!c.encerradaEm ? `<button class="botao pequeno" data-imo-renovar="${esc(c.id)}">Renovar</button> <button class="botao pequeno" data-imo-encerrar="${esc(c.id)}">Encerrar</button>` : ''}${c.direcao === 'de-terceiros' && !c.encerradaEm && pode ? ` <button class="botao pequeno" data-imo-benf-ces="${esc(c.id)}">+ Benfeitoria</button>` : ''}${(c.benfeitorias || []).length ? `<ul class="lista-simples">${c.benfeitorias.map((x) => `<li>Benfeitoria ${esc(E.CLASSES_BENF_CURTO[x.classe] || '').toLowerCase()}: ${esc(x.descricao)} · ${u.moeda(x.valor)} · ${u.data(x.data)} · indenizável: ${({ sim: 'sim', nao: 'não', conferir: 'a conferir' })[x.indenizavel] || '—'}</li>`).join('')}<li><b>Total: ${u.moeda(c.benfeitorias.reduce((t, x) => t + (Number(x.valor) || 0), 0))}</b></li></ul>` : ''}</li>`).join('')}</ul>` : '<p class="vazio">Nenhuma.</p>'}</section>
      <section class="cartao secao"><header><h3>Regularização</h3><button class="botao pequeno" data-imo="pendencia">+ Pendência</button></header>
        <p>Situação do registro: <b>${esc(b.imovel?.situacaoRegistro || '—')}</b>${b.imovel?.motivoPendencia ? ` · ${esc(b.imovel.motivoPendencia)}` : ''}</p>
        ${pend.length ? `<ul class="lista-simples">${pend.map((p) => `<li>${E.pendAberta(p) ? (E.pendAtrasada(p) ? selo('ruim', 'Atrasada') : selo('regular', 'Aberta')) : selo('bom', p.situacao === 'resolvida' ? 'Resolvida' : 'Cancelada')} ${esc(p.descricao)} · ${esc(VP.nome('responsaveis', p.responsavelId))} · prazo ${u.data(p.prazo)} ${E.pendAberta(p) ? `<button class="botao pequeno" data-imo-pend="${esc(p.id)}">Andamento</button>` : ''}</li>`).join('')}</ul>` : '<p class="vazio">Nenhuma pendência.</p>'}</section>`;
  };
  E.ligarFicha = (b, re) => {
    const area = document.getElementById('conteudo');
    area.querySelectorAll('[data-imo]').forEach((el) => el.addEventListener('click', () => ({ doc: () => E.novoDocumento(b, re), cessao: () => E.novaCessao(b, re), pendencia: () => E.novaPendencia(b, re) })[el.dataset.imo]()));
    area.querySelector('[data-ler-matricula]')?.addEventListener('click', () => VP.matricula.lerParaBem(b, re));
    if (VP.blocoMatricula) VP.blocoMatricula.ligar(area.querySelector('#sec-matricula') || area, re);
    area.querySelector('[data-local-imovel]')?.addEventListener('click', () => VP.mapas.informarLocal(b, re));
    area.querySelectorAll('[data-conf-registrar]').forEach((el) => el.addEventListener('click', () => E.novoDocumento(b, re, null, el.dataset.confRegistrar)));
    area.querySelectorAll('[data-conf-na]').forEach((el) => el.addEventListener('click', () => E.marcarNaoAplica(b, el.dataset.confNa, true, re)));
    area.querySelectorAll('[data-conf-volta]').forEach((el) => el.addEventListener('click', () => E.marcarNaoAplica(b, el.dataset.confVolta, false, re)));
    area.querySelector('[data-copiar-confrontacoes]')?.addEventListener('click', () => E.copiarConfrontacoes(b, re));
    area.querySelector('[data-benf-nova]')?.addEventListener('click', () => E.editarBenfeitoria(b, re));
    area.querySelector('[data-imo-impressos]')?.addEventListener('click', () => VP.imoveisImpressos.escolher(b, re));
    const benf = (id) => (b.imovel?.benfeitorias || []).find((x) => x.id === id);
    area.querySelectorAll('[data-benf-editar]').forEach((el) => el.addEventListener('click', () => E.editarBenfeitoria(b, re, benf(el.dataset.benfEditar))));
    area.querySelectorAll('[data-benf-excluir]').forEach((el) => el.addEventListener('click', () => E.excluirBenfeitoria(b, benf(el.dataset.benfExcluir), re)));
    area.querySelectorAll('[data-imo-benf-ces]').forEach((el) => el.addEventListener('click', () => E.benfeitoriaEmTerceiros(b, VP.db.pega('cessoesImovel', el.dataset.imoBenfCes), re)));
    area.querySelectorAll('[data-imo-doc]').forEach((el) => el.addEventListener('click', () => E.novoDocumento(b, re, VP.db.pega('documentosImovel', el.dataset.imoDoc))));
    area.querySelectorAll('[data-imo-renovar]').forEach((el) => el.addEventListener('click', () => E.renovarCessao(b, VP.db.pega('cessoesImovel', el.dataset.imoRenovar), re)));
    area.querySelectorAll('[data-imo-encerrar]').forEach((el) => el.addEventListener('click', () => E.encerrarCessao(b, VP.db.pega('cessoesImovel', el.dataset.imoEncerrar), re)));
    area.querySelectorAll('[data-imo-pend]').forEach((el) => el.addEventListener('click', () => E.andamentoPendencia(b, VP.db.pega('pendenciasImovel', el.dataset.imoPend), re)));
  };

  // ------------------------------------------------------------------ painel dos imóveis + demonstrativo TCE
  T.imoveis = (aba = 'painel') => {
    const abas = `<nav class="abas">${[['painel', 'Situação'], ['situacao-documental', 'Situação documental'], ['documentos', 'Documentos'], ['cessoes', 'Cessões'], ['pendencias', 'Pendências'], ['mapa', 'Mapa']].map(([k, n]) => `<a href="#imoveis${k === 'painel' ? '' : '/' + k}" class="${k === aba ? 'ativa' : ''}">${n}</a>`).join('')}</nav>`;
    const im = E.lista();
    const imo = im.filter((b) => b.tipo === 'imovel');
    const nomeBem = (id) => { const b = VP.db.pega('bens', id); return b ? `<a href="#bem/${esc(b.id)}">${esc(b.codigo)} · ${esc(b.descricao)}</a>` : '—'; };
    const valBem = (id) => { const b = VP.db.pega('bens', id); return b ? `${b.codigo} · ${b.descricao}` : ''; };
    const ids = new Set(im.map((b) => b.id));
    if (aba === 'mapa') return VP.mapas.telaMapa(abas);
    if (aba === 'situacao-documental') {
      // planilha de controle da situação documental de cada imóvel (livro, 4.2: plano de trabalho de regularização)
      const l = imo.map((b) => ({ b, c: E.conferencia(b) }));
      const colDocs = E.CONFERENCIA.map((d) => ({ chave: 'd-' + d.tipo, titulo: d.tipo, oculta: true, valor: (x) => SIT_CONF[x.c.itens.find((i) => i.tipo === d.tipo).situacao][1] }));
      return { titulo: 'Bens imóveis', html: abas + '<p class="ajuda">Quanto da documentação de cada imóvel já está no sistema. Abra o imóvel para registrar o que falta ou marcar "Não se aplica". "Baixar planilha" leva também uma coluna por documento (escolha as colunas).</p>' + ui.tabela({ id: 'imo-conf', linhas: l, porPagina: 100, nomePlanilha: 'situacao-documental-imoveis', vazio: 'Nenhum imóvel.', colunas: [
        { chave: 'imovel', titulo: 'Imóvel', html: (x) => nomeBem(x.b.id), valor: (x) => valBem(x.b.id) },
        { chave: 'registro', titulo: 'Situação do registro', valor: (x) => x.b.imovel?.situacaoRegistro || '' },
        { chave: 'pct', titulo: 'Documentado', num: true, valor: (x) => x.c.pct, formato: (v) => v + '%' },
        { chave: 'tem', titulo: 'Tem', num: true, valor: (x) => x.c.tem }, { chave: 'total', titulo: 'Pedidos', num: true, valor: (x) => x.c.total },
        { chave: 'basicos', titulo: 'Faltam básicos', valor: (x) => x.c.faltamBasicos.join(', ') },
        { chave: 'faltam', titulo: 'Faltam (todos)', valor: (x) => x.c.faltam.join(', ') }, ...colDocs] }), ligar() { ui.ligarTabela('imo-conf'); } };
    }
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
    // o Demonstrativo (TCE/SC) fica só em Relatórios → Imóveis (decisão do usuário, 23/10/2026); o endereço antigo leva para lá
    if (aba === 'demonstrativo') return T['painel-imoveis']('demonstrativo', {});
    const a = E.alertas();
    const porSit = E.SITUACOES_REG.map((s) => ({ rotulo: s, valor: imo.filter((b) => b.imovel?.situacaoRegistro === s).length, link: '#painel-imoveis/demonstrativo?gerar=1' }));
    const porUso = VP.LISTAS.usosImovel.map((s) => ({ rotulo: s, valor: imo.filter((b) => b.imovel?.uso === s).length }));
    const lista = (titulo, itens, fmt) => (itens.length ? `<h4>${esc(titulo)} (${itens.length})</h4><ul class="lista-simples">${itens.slice(0, 8).map(fmt).join('')}${itens.length > 8 ? '<li>…</li>' : ''}</ul>` : '');
    return {
      titulo: 'Bens imóveis',
      acoes: '<a class="botao" href="#bens/imoveis">Lista de imóveis</a> <a class="botao primario" href="#novo-bem/imovel">+ Novo imóvel</a>',
      html: `${abas}<div class="resumo-linha">${G.numero('Imóveis', u.inteiro(imo.length), u.moeda(imo.reduce((t, b) => t + VP.saldo(b).liquido, 0)))}${G.numero('Não registrados', u.inteiro(imo.filter((b) => b.imovel?.situacaoRegistro && b.imovel.situacaoRegistro !== 'Registrado').length), 'em regularização, sem registro ou posse', '#painel-imoveis/demonstrativo?gerar=1')}${G.numero('Documentos vencidos', u.inteiro(a.docsVencidos.length), `${a.docsVencendo.length} vencendo em ${avisoDias()} dias`, '#imoveis/documentos')}${G.numero('Cessões vencidas', u.inteiro(a.cessoesVencidas.length), `${a.cessoesVencendo.length} vencendo`, '#imoveis/cessoes')}${G.numero('Pendências atrasadas', u.inteiro(a.pendAtrasadas.length), '', '#imoveis/pendencias')}</div>
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
