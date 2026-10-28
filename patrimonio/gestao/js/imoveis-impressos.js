/* VitalPat Patrimônio · Gestão — impressos dos imóveis (etapa 4 do plano do livro, 28/10/2026).
   Modelos do livro "Gestão patrimonial" (Gerson dos Santos), item 4.2, págs. 311–320: Folha de Tombo, Ficha de Cadastro,
   Termo de Responsabilidade sobre Imóvel, Termo de Entrega e Recebimento, Termo de Exame, Recebimento e Entrega de Obras
   e Relatório da Comissão de Escolha e Avaliação. O sistema preenche com o cadastro; a pessoa completa e confere antes de imprimir.
   Os modelos não citam lei; se a prefeitura tiver modelo próprio, ele prevalece. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui;
  const I = VP.imoveisImpressos = {};
  const hoje = () => VP.Plataforma.hoje();
  const n = (v, suf = '') => (v || v === 0 ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + suf : '');
  const juntar = (partes) => partes.filter(([, v]) => v !== '' && v != null).map(([r, v]) => (r ? r + ' ' + v : v)).join(', ');
  const vazio = '<span class="campo-vazio">________________</span>';
  const txt = (v) => (v === '' || v == null ? vazio : esc(v).replace(/\n/g, '<br>'));
  const assinaturas = (nomes) => `<div class="assinaturas">${nomes.map((x) => `<div><span></span>${esc(x)}</div>`).join('')}</div>`;
  const dataExtenso = (d) => { if (!d) return '____ dias do mês de ________ do ano de ____'; const [a, m, dia] = d.split('-'); const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']; return `${Number(dia)} dias do mês de ${meses[Number(m) - 1]} do ano de ${a}`; };
  const itens = (lista) => `<table class="tabela doc doc-itens"><tbody>${lista.map(([k, v], i) => `<tr><td class="doc-num">${String(i + 1).padStart(2, '0')}</td><th>${esc(k)}</th><td>${txt(v)}</td></tr>`).join('')}</tbody></table>`;

  // ------------------------------------------------------------------ dados do cadastro, já no formato dos modelos
  I.dados = (b) => {
    const im = b.imovel || {}, en = b.endereco || {};
    const constr = VP.imoveis ? VP.imoveis.benfeitoriasDe(b) : [];
    const inc = VP.eventosDoBem(b.id).find((e) => e.tipo === 'incorporacao');
    return {
      endereco: [en.logradouro, en.bairro, en.cidade].filter(Boolean).join(', '),
      cidade: en.cidade || '', uf: en.uf || '',
      denominacao: [...new Set([b.descricao, b.complemento].filter(Boolean))].join(' — '),
      aplicacao: [VP.nome('unidades', b.unidadeId), im.uso].filter(Boolean).join(' · '),
      proveniencia: juntar([['', im.origemArea], ['de', im.transmitente], ['processo', im.processoAquisicao]]),
      tituloTransferencia: juntar([['escritura', im.escrituraTabeliao], ['livro', im.escrituraLivro], ['folha', im.escrituraFolha], ['de', im.escrituraData ? u.data(im.escrituraData) : '']]) || im.escritura || '',
      transcricao: juntar([['', im.cartorio], [/^matr[íi]cula/i.test(String(im.matricula || '')) ? '' : 'matrícula', im.matricula], ['registro', im.registroNumero], ['livro', im.registroLivro], ['folha', im.registroFolha], ['de', im.registroData ? u.data(im.registroData) : '']]),
      servidoes: im.servidoes || '',
      dimensoes: juntar([['frente', im.frente ? n(im.frente, ' m') : ''], ['fundos', im.fundos ? n(im.fundos, ' m') : ''], ['lateral direita', im.lateralDireita ? n(im.lateralDireita, ' m') : ''], ['lateral esquerda', im.lateralEsquerda ? n(im.lateralEsquerda, ' m') : '']]),
      area: im.areaTerreno ? n(im.areaTerreno, ' m²') : '',
      valorAquisicao: inc ? u.moeda(inc.valor || 0) : '',
      confrontacoes: im.confrontacoes || '',
      benfeitorias: constr.map((x) => [x.nome, x.pavimentos ? n(x.pavimentos) + ' pavimento(s)' : '', x.areaCoberta ? n(x.areaCoberta, ' m² cobertos') : '', x.areaConstruida ? n(x.areaConstruida, ' m² construídos') : '', x.dependencias ? n(x.dependencias) + ' dependência(s)' : ''].filter(Boolean).join(', ')).join('\n'),
      qtdBenfeitorias: constr.length ? `${constr.length} (${constr.filter((x) => x.residencial === 'Residencial').length} residencial(is), ${constr.filter((x) => x.residencial !== 'Residencial').length} não residencial(is))` : '',
      construcoes: constr,
      cercamento: im.cercamento || '',
      historico: im.historico || '',
      responsavel: VP.nome('responsaveis', b.responsavelId) || '',
      unidade: VP.nome('unidades', b.unidadeId) || '',
      entidade: VP.nome('entidades', b.entidadeId || 'E1') || '',
      termoEntrega: (VP.imoveis ? VP.imoveis.docsDe(b.id) : []).filter((d) => d.tipo === 'Termo de entrega e recebimento').map((d) => [d.numero, d.emissao ? u.data(d.emissao) : ''].filter(Boolean).join(' de ')).join('; ')
    };
  };

  // ------------------------------------------------------------------ os 6 modelos
  const cab = (b, titulo) => `<h1>${esc(titulo)}</h1><p class="doc-bem">Imóvel <b>${esc(b.codigo)}</b>${b.plaqueta ? ' · plaqueta ' + esc(b.plaqueta) : ''} · ${esc(b.descricao)}</p>`;
  I.MODELOS = {
    tombo: {
      nome: 'Folha de Tombo', pag: 313,
      campos: (d) => [{ chave: 'folha', rotulo: 'Folha nº', largura: 'meia' }, { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: hoje(), largura: 'meia' },
        { chave: 'local', rotulo: 'Local', padrao: d.cidade, largura: 'meia' }, { chave: 'executante', rotulo: 'Executante (quem preenche, cargo)', largura: 'meia' },
        { chave: 'termoEntrega', rotulo: 'Termo de recebimento e entrega da área (nº e data)', padrao: d.termoEntrega },
        { chave: 'observacoes', rotulo: 'Observações', tipo: 'area' }],
      html: (b, d, v) => cab(b, 'Folha de Tombo') + itens([
        ['Estado', d.uf], ['Município', d.cidade], ['Cidade', d.cidade], ['Endereço', d.endereco], ['Denominação', d.denominacao], ['Aplicação', d.aplicacao],
        ['Proveniência do domínio', d.proveniencia], ['Título de transferência', d.tituloTransferencia], ['Transcrição no Cartório de Registro de Imóveis', d.transcricao],
        ['Servidões', d.servidoes], ['Termo de recebimento e entrega da área', v.termoEntrega], ['Dimensões do terreno', d.dimensoes], ['Área do terreno', d.area],
        ['Valor da aquisição', d.valorAquisicao], ['Limites e confrontações', d.confrontacoes], ['Benfeitorias', d.benfeitorias], ['Cercamento', d.cercamento],
        ['Histórico', d.historico], ['Observações', v.observacoes]]) +
        `<p>Folha nº ${txt(v.folha)} · ${txt(v.local)}, ${v.data ? u.data(v.data) : vazio}</p>` + assinaturas([`Executante${v.executante ? ' — ' + v.executante : ''}`])
    },
    ficha: {
      nome: 'Ficha de cadastro do imóvel (frente e verso)', pag: 317,
      campos: () => [{ chave: 'observacoes', rotulo: 'Observações', tipo: 'area' }],
      html: (b, d, v) => {
        const im = b.imovel || {};
        const s = VP.saldo(b);
        const termos = (VP.imoveis ? VP.imoveis.docsDe(b.id) : []).filter((x) => x.tipo === 'Termo de responsabilidade').map((x) => [x.numero, x.emissao ? u.data(x.emissao) : ''].filter(Boolean).join(' de ')).join('; ');
        return cab(b, 'Ficha de cadastro do imóvel — frente') + itens([
          ['Imóvel', im.residencial || 'Residencial / Não residencial'], ['Área', d.area], ['Endereço', d.endereco], ['Órgão beneficiado', d.unidade],
          ['Título de transferência de propriedade', d.tituloTransferencia], ['Registro', d.transcricao], ['Termo de entrega e recebimento', d.termoEntrega],
          ['Servidões', d.servidoes], ['Observações', v.observacoes]]) +
          `<h2>Verso</h2><table class="tabela doc"><thead><tr><th>Terreno: área</th><th class="num">Terreno: valor</th><th>Benfeitoria</th><th class="num">Área construída</th><th class="num">Área coberta</th><th>Ano</th></tr></thead><tbody>
            ${(d.construcoes.length ? d.construcoes : [{}]).map((x, i) => `<tr><td>${i ? '' : esc(d.area)}</td><td class="num">${i ? '' : (im.valorTerreno ? u.moeda(im.valorTerreno) : '')}</td><td>${esc(x.nome || '')}</td><td class="num">${x.areaConstruida ? n(x.areaConstruida, ' m²') : ''}</td><td class="num">${x.areaCoberta ? n(x.areaCoberta, ' m²') : ''}</td><td>${esc(x.ano || '')}</td></tr>`).join('')}
          </tbody></table><p>Valor total (contábil, terreno + benfeitorias): <b>${u.moeda(s.liquido)}</b></p><p>Distribuição (termos de responsabilidade): ${txt(termos)}</p>`;
      }
    },
    responsabilidade: {
      nome: 'Termo de responsabilidade sobre o imóvel', pag: 315,
      campos: (d) => [{ chave: 'data', rotulo: 'Data', tipo: 'data', padrao: hoje(), largura: 'meia' }, { chave: 'local', rotulo: 'Local (sede)', padrao: d.unidade, largura: 'meia' },
        { chave: 'substituido', rotulo: 'Quem entrega (substituído)', padrao: 'Setor de Patrimônio Imobiliário', largura: 'meia' }, { chave: 'substituto', rotulo: 'Quem passa a responder (substituto)', padrao: d.responsavel, obrigatorio: true, largura: 'meia' },
        { chave: 'areaOcupada', rotulo: 'Área ocupada pelo órgão (se for só parte do imóvel)', largura: 'meia' }, { chave: 'termoEntrega', rotulo: 'Termo de recebimento e entrega (nº e data)', padrao: d.termoEntrega, largura: 'meia' },
        { chave: 'modificacoes', rotulo: 'Modificações nas benfeitorias durante a gestão', tipo: 'area' },
        { chave: 'processos', rotulo: 'Processos administrativos e judiciais', tipo: 'area' },
        { chave: 'irregularidades', rotulo: 'Irregularidades encontradas (vazio = tudo em perfeitas condições)', tipo: 'area' },
        { chave: 'observacoes', rotulo: 'Observações', tipo: 'area' }],
      html: (b, d, v) => {
        const docs = VP.imoveis ? VP.imoveis.docsDe(b.id).map((x) => x.tipo) : [];
        const existe = (t) => (docs.includes(t) ? 'Existe' : 'Não registrado no sistema');
        return cab(b, 'Termo de responsabilidade administrativa sobre imóvel') +
          `<p>Aos ${dataExtenso(v.data)}, em ${txt(v.local)}, reuniram-se ${txt(v.substituido)} e ${txt(v.substituto)}, respectivamente substituído e substituto, os quais, examinando o imóvel distribuído a ${txt(d.unidade)}, constataram o seguinte:</p>` +
          itens([['Endereço', d.endereco], ['Área do imóvel', d.area], ['Área ocupada pelo órgão', v.areaOcupada], ['Proveniência do domínio', d.proveniencia],
            ['Título de transferência', d.tituloTransferencia], ['Transcrição no Cartório de Registro de Imóveis', d.transcricao], ['Termo de recebimento e entrega', v.termoEntrega],
            ['Folha de tombo', existe('Folha de tombo')], ['Planta do imóvel', existe('Planta')], ['Limites e confrontações', d.confrontacoes], ['Destinação', d.aplicacao],
            ['Benfeitorias: quantidade', d.qtdBenfeitorias], ['Benfeitorias: descrição', d.benfeitorias], ['Termo de entrega de obra', existe('Termo de exame e recebimento de obras')],
            ['Planta de situação', existe('Planta de situação')], ['Modificações nas benfeitorias', v.modificacoes], ['Cercamento', d.cercamento], ['Servidões', d.servidoes],
            ['Processos administrativos e judiciais', v.processos], ['Observações', v.observacoes]]) +
          `<p>Após haverem percorrido o imóvel e examinado as condições dos aspectos físicos e documentais acima, ${v.irregularidades ? `encontraram as seguintes irregularidades: ${txt(v.irregularidades)}.` : 'encontraram tudo em perfeitas condições e de acordo com o título de propriedade, as plantas e a legislação vigente.'} Lavram o presente termo, assumindo o substituto a inteira responsabilidade pela preservação do imóvel a partir desta data.</p>` +
          `<p>${txt(v.local)}, ${v.data ? u.data(v.data) : vazio}</p>` + assinaturas([`Substituído — ${v.substituido || ''}`, `Substituto — ${v.substituto || ''}`]);
      }
    },
    entrega: {
      nome: 'Termo de entrega e recebimento do imóvel', pag: 319,
      campos: (d) => [{ chave: 'data', rotulo: 'Data', tipo: 'data', padrao: hoje(), largura: 'meia' }, { chave: 'publicacao', rotulo: 'Determinação (ato, nº e data)', largura: 'meia' },
        { chave: 'patrimonio', rotulo: 'Representante do patrimônio (bens imóveis)', largura: 'meia' }, { chave: 'interessado', rotulo: 'Representante do órgão interessado', largura: 'meia' },
        { chave: 'orgao', rotulo: 'Órgão interessado', padrao: d.unidade }],
      html: (b, d, v) => cab(b, 'Termo de entrega e recebimento do imóvel') +
        `<p>Aos ${dataExtenso(v.data)}, obedecendo à determinação ${txt(v.publicacao)}, ${txt(v.patrimonio)} e ${txt(v.interessado)} reuniram-se no imóvel a ser entregue e recebido e, após percorrerem e conferirem seus marcos divisórios e dependências, firmam o presente, constando o seguinte:</p>` +
        itens([['Localização', [d.endereco, d.uf].filter(Boolean).join(' — ')], ['Título de propriedade', [d.proveniencia, d.tituloTransferencia, d.transcricao].filter(Boolean).join('\n')],
          ['Limites (memorial descritivo e área total)', [d.confrontacoes, d.area ? 'Área total: ' + d.area : ''].filter(Boolean).join('\n')], ['Benfeitorias', d.benfeitorias]]) +
        `<p>Nada mais havendo a declarar, o representante da área patrimonial e o do órgão usuário (${txt(v.orgao)}) dão os trabalhos por encerrados e assinam o presente.</p>` +
        assinaturas([`Área de bens imóveis — ${v.patrimonio || ''}`, `Órgão interessado — ${v.interessado || ''}`])
    },
    obras: {
      nome: 'Termo de exame, recebimento e entrega de obras', pag: 320,
      campos: (d) => [{ chave: 'data', rotulo: 'Data', tipo: 'data', padrao: hoje(), largura: 'meia' }, { chave: 'ato', rotulo: 'Ato que designou a comissão (nº e data)', largura: 'meia' },
        { chave: 'construcaoId', rotulo: 'Construção (das cadastradas no terreno)', tipo: 'select', opcoes: d.construcoes.map((x) => [x.id, x.nome]), largura: 'meia' }, { chave: 'engenheiro', rotulo: 'Engenheiro responsável técnico pela obra', largura: 'meia' },
        { chave: 'destino', rotulo: 'Destinada a (órgão e utilização)', padrao: d.aplicacao },
        { chave: 'custo', rotulo: 'Custo da obra (R$)', tipo: 'moeda', largura: 'meia' }, { chave: 'proprietario', rotulo: 'Proprietário', padrao: d.entidade, largura: 'meia' },
        { chave: 'tipoConstrucao', rotulo: 'Tipo da construção (fundações, estrutura, cobertura, acabamento, instalações)', tipo: 'area' },
        { chave: 'observacoes', rotulo: 'Observações (vazio = executada conforme projeto, em perfeitas condições)', tipo: 'area' },
        { chave: 'presidente', rotulo: 'Presidente da comissão', largura: 'meia' }, { chave: 'membro1', rotulo: 'Membro (engenheiro civil)', largura: 'meia' },
        { chave: 'membro2', rotulo: 'Membro', largura: 'meia' }, { chave: 'orgao', rotulo: 'Órgão interessado', padrao: d.unidade, largura: 'meia' }],
      html: (b, d, v) => {
        const c = d.construcoes.find((x) => x.id === v.construcaoId) || {};
        return cab(b, 'Termo de exame, recebimento e entrega de obras') +
          `<p>Aos ${dataExtenso(v.data)}, a Comissão designada por ${txt(v.ato)} reuniu-se no local da obra para proceder ao EXAME, RECEBIMENTO E ENTREGA da obra destinada a ${txt(v.destino)}, em ${txt([d.cidade, d.uf].filter(Boolean).join('/'))}. Foram apresentados pelo responsável técnico da obra, engenheiro ${txt(v.engenheiro)}, o projeto completo, com plantas, orçamentos aprovados, especificações e relatório de conclusão dos serviços.</p>` +
          itens([['Construção', c.nome], ['Pavimentos', c.pavimentos ? n(c.pavimentos) : ''], ['Área construída', c.areaConstruida ? n(c.areaConstruida, ' m²') : ''], ['Área coberta', c.areaCoberta ? n(c.areaCoberta, ' m²') : ''],
            ['Custo', v.custo ? u.moeda(v.custo) : ''], ['Tipo da construção', v.tipoConstrucao]]) +
          `<p>A Comissão verificou que a obra ${v.observacoes ? `apresenta as seguintes observações: ${txt(v.observacoes)}.` : 'foi executada conforme projeto, orçamento e especificações técnicas aprovadas, estando em perfeitas condições de utilização e funcionamento.'} A seguir, efetivou o recebimento e a entrega da obra, que passou da responsabilidade de ${txt(v.proprietario)}, como proprietário, para ${txt(v.orgao)}, como órgão interessado, dando a obra como examinada, recebida e entregue. Vias: processo de aquisição, órgão usuário, serviços gerais e órgão patrimonial.</p>` +
          `<p>${txt(d.cidade)}, ${v.data ? u.data(v.data) : vazio}</p>` + assinaturas([`Presidente da comissão — ${v.presidente || ''}`, `Membro — ${v.membro1 || ''}`, `Membro — ${v.membro2 || ''}`, `Órgão interessado — ${v.orgao || ''}`]);
      }
    },
    comissao: {
      nome: 'Relatório da comissão de escolha e avaliação', pag: 311,
      campos: (d) => [{ chave: 'ato', rotulo: 'Ato que designou a comissão (portaria, nº)', largura: 'meia' }, { chave: 'data', rotulo: 'Data do relatório', tipo: 'data', padrao: hoje(), largura: 'meia' },
        { chave: 'especie', rotulo: 'Espécie do objeto de aquisição', largura: 'meia' }, { chave: 'proprietario', rotulo: 'Proprietário', padrao: (VP.db.pega('bens', d._id)?.imovel?.proprietarioMatricula) || '', largura: 'meia' },
        { chave: 'acesso', rotulo: 'Acesso', largura: 'meia' }, { chave: 'salubridade', rotulo: 'Salubridade', largura: 'meia' },
        { chave: 'esgotos', rotulo: 'Esgotos', largura: 'meia' }, { chave: 'energia', rotulo: 'Energia elétrica', largura: 'meia' },
        { chave: 'agua', rotulo: 'Água potável', largura: 'meia' }, { chave: 'avaliacao', rotulo: 'Avaliação (terreno e benfeitorias)', largura: 'meia' },
        { chave: 'descricao', rotulo: 'Descrição', tipo: 'area' }, { chave: 'diversos', rotulo: 'Diversos', tipo: 'area' },
        { chave: 'parOrgao', rotulo: 'Parecer do representante do órgão interessado', tipo: 'area' }, { chave: 'parEngenheiro', rotulo: 'Parecer do engenheiro', tipo: 'area' },
        { chave: 'parAdvogado', rotulo: 'Parecer do advogado', tipo: 'area' }, { chave: 'parPresidente', rotulo: 'Parecer conclusivo do presidente da comissão', tipo: 'area' }],
      html: (b, d, v) => cab(b, 'Relatório da comissão de escolha e avaliação de imóvel') +
        `<p>A Comissão de Escolha e Avaliação de Imóvel, designada por ${txt(v.ato)}, para emitir parecer sobre o imóvel abaixo, tendo terminado seus trabalhos, apresenta o seguinte relatório:</p>` +
        itens([['Localização', d.endereco], ['Proprietário', v.proprietario], ['Espécie do objeto de aquisição', v.especie], ['Destino', d.aplicacao], ['Limites', d.confrontacoes],
          ['Áreas', [d.area ? 'terreno ' + d.area : '', d.construcoes.length ? 'construída ' + n(d.construcoes.reduce((t, x) => t + (Number(x.areaConstruida) || 0), 0), ' m²') : ''].filter(Boolean).join('; ')],
          ['Acesso', v.acesso], ['Salubridade', v.salubridade], ['Esgotos', v.esgotos], ['Energia elétrica', v.energia], ['Água potável', v.agua], ['Descrição', v.descricao],
          ['Avaliação do imóvel (terreno, benfeitorias)', v.avaliacao], ['Diversos', v.diversos]]) +
        `<h2>15 — Pareceres</h2>${itens([['Representante do órgão interessado', v.parOrgao], ['Engenheiro', v.parEngenheiro], ['Advogado', v.parAdvogado], ['Presidente da comissão (conclusivo)', v.parPresidente]])}` +
        `<p>${txt(d.cidade)}, ${v.data ? u.data(v.data) : vazio}</p>` + assinaturas(['Presidente da comissão', 'Engenheiro', 'Advogado', 'Representante do órgão interessado'])
    }
  };

  // ------------------------------------------------------------------ escolher, completar e imprimir
  I.abrir = (b, k, depois) => {
    const m = I.MODELOS[k], d = Object.assign(I.dados(b), { _id: b.id });
    const campos = m.campos(d);
    const valores = Object.fromEntries(campos.filter((c) => c.padrao != null).map((c) => [c.chave, c.padrao]));
    ui.formulario({
      titulo: m.nome + ' — ' + b.descricao, largura: 'media', textoSalvar: 'Imprimir',
      intro: `<p class="ajuda">Modelo do livro "Gestão patrimonial" (pág. ${m.pag}). Os dados do imóvel vêm do cadastro; o que estiver vazio no cadastro sai com uma linha para preencher à mão. Confira antes de imprimir. Depois de assinado, registre em "Documentos do imóvel".</p>`,
      campos, valores,
      salvar: async (v) => {
        ui.imprimir(`<div class="doc-imovel">${m.html(b, d, v)}</div>`, m.nome);
        await VP.db.gravar('eventos', VP.novoEvento(b.id, 'observacao', { descricao: `Impresso: ${m.nome}`, extra: { modelo: k } }));
        depois && depois();
      }
    });
  };
  I.escolher = (b, depois) => ui.formulario({
    titulo: 'Gerar documento do imóvel — ' + b.descricao, largura: 'pequena', textoSalvar: 'Continuar',
    campos: [{ chave: 'modelo', rotulo: 'Documento', tipo: 'select', vazio: false, opcoes: Object.entries(I.MODELOS).map(([k, m]) => [k, m.nome]) }],
    salvar: (v) => { setTimeout(() => I.abrir(b, v.modelo, depois), 50); }
  });
})();
