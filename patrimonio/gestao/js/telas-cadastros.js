/* VitalPat Patrimônio · Gestão — Cadastros, visão da unidade, Configurações, Lixeira e cópia de segurança. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas;
  const opc = (...a) => VP.opc(...a);
  VP.TIPOS_UNIDADE = ['Administrativo', 'Escola', 'Saúde', 'Garagem', 'Assistência social', 'Cultura e esporte', 'Outro'];
  // Aviso embaixo de um campo de lista quando o cadastro de onde ela vem está vazio: diz o nome do cadastro, onde fica e o que preencher
  const seVazio = (col, texto, filtro) => (VP.db.lista(col).filter(filtro || (() => true)).length ? '' : texto);

  // ---------------------------------------------------------------- contas contábeis
  // Lista inicial (sugestão do sistema, no padrão do plano de contas nacional do setor público): carregada uma vez,
  // quando o cadastro de contas está vazio. A contabilidade confere e ajusta. [A conferir] códigos e nomes.
  VP.CONTAS_PADRAO = [
    ['1.2.3.1.1.01', 'Máquinas, aparelhos, equipamentos e ferramentas', 'ativo'], ['1.2.3.1.1.02', 'Bens de informática', 'ativo'],
    ['1.2.3.1.1.03', 'Móveis e utensílios', 'ativo'], ['1.2.3.1.1.04', 'Materiais culturais, educacionais e de comunicação', 'ativo'],
    ['1.2.3.1.1.05', 'Veículos', 'ativo'], ['1.2.3.1.1.06', 'Peças e conjuntos de reposição', 'ativo'], ['1.2.3.1.1.07', 'Bens móveis em andamento', 'ativo'],
    ['1.2.3.1.1.09', 'Armamentos', 'ativo'], ['1.2.3.1.1.10', 'Semoventes', 'ativo'], ['1.2.3.1.1.99', 'Demais bens móveis', 'ativo'],
    ['1.2.3.2.1.01', 'Bens de uso especial (imóveis)', 'ativo'], ['1.2.3.2.1.02', 'Bens dominicais (imóveis)', 'ativo'], ['1.2.3.2.1.03', 'Bens de uso comum do povo (infraestrutura)', 'ativo'],
    ['1.2.3.2.1.04', 'Bens imóveis em andamento', 'ativo'], ['1.2.3.2.1.05', 'Instalações', 'ativo'], ['1.2.3.2.1.06', 'Benfeitorias em propriedade de terceiros', 'ativo'], ['1.2.3.2.1.99', 'Demais bens imóveis', 'ativo'],
    ['1.2.4.1.1.01', 'Softwares', 'ativo'], ['1.2.4.1.1.02', 'Marcas, direitos e patentes', 'ativo'], ['1.2.4.1.1.03', 'Direito de uso de imóveis', 'ativo'],
    ['1.2.3.8.1.01', '(-) Depreciação acumulada de bens móveis', 'depreciacao'], ['1.2.3.8.1.02', '(-) Depreciação acumulada de bens imóveis', 'depreciacao'],
    ['1.2.4.8.1.01', '(-) Amortização acumulada de intangíveis', 'depreciacao'],
    ['3.3.3.1.1.01', 'Depreciação de bens móveis (despesa do mês)', 'resultado'], ['3.3.3.1.1.02', 'Depreciação de bens imóveis (despesa do mês)', 'resultado'],
    ['3.3.3.2.1.01', 'Amortização de intangíveis (despesa do mês)', 'resultado']
  ];
  VP.garantirContasPadrao = async ({ gravar = true } = {}) => {
    if (VP.db.pega('meta', 'contasPadrao') || VP.db.lista('contas', true).length) return 0;
    const docs = VP.CONTAS_PADRAO.map(([codigo, nome, tipo], i) => ({ id: 'CP' + String(i + 1).padStart(3, '0'), codigo, nome, tipo, origem: 'Lista inicial do sistema' }));
    if (!gravar) { for (const d of docs) VP.db.dados.contas.set(d.id, d); return docs.length; }
    await VP.db.gravarVarias({ contas: docs, meta: [{ id: 'contasPadrao', criadoEm: VP.Plataforma.agoraISO(), quantidade: docs.length }] });
    return docs.length;
  };
  const TIPOS_CONTA = { ativo: 'Ativo (valor do bem)', depreciacao: 'Depreciação acumulada (desgaste somado)', resultado: 'Resultado (despesa do mês)' };
  const rotuloConta = (c) => `${c.codigo ? c.codigo + ' · ' : ''}${c.nome}`;
  // Conta digitada na Classificação: acha na lista ou devolve a conta nova a criar (código no começo, depois o nome)
  VP.contaDoTexto = (texto, tipo) => {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!t) return { id: '' };
    const n = u.normalizar(t);
    const todas = VP.db.lista('contas');
    const achada = todas.find((c) => u.normalizar(rotuloConta(c)) === n) || todas.find((c) => c.codigo && u.normalizar(c.codigo) === n) || todas.find((c) => u.normalizar(c.nome) === n);
    if (achada) return achada.tipo === tipo ? { id: achada.id } : { erro: `A conta "${rotuloConta(achada)}" é do tipo ${TIPOS_CONTA[achada.tipo] || achada.tipo}, não ${TIPOS_CONTA[tipo]}.` };
    const m = t.match(/^(\d[\d.]*)\s*(?:[·:\-–]\s*)?(.*)$/);
    const codigo = m ? m[1].replace(/\.$/, '') : '', nome = (m ? m[2] : t).trim();
    if (!nome) return { erro: `Escreva também o nome da conta ${codigo} (ex.: ${codigo} Móveis e utensílios).` };
    return { nova: { id: u.id(), codigo, nome, tipo, origem: 'Criada ao salvar uma classificação' } };
  };

  // ---------------------------------------------------------------- definição de cada cadastro
  const CAD = {
    unidades: { titulo: 'Unidades (centros de custo e localizações)', campos: () => [
      { chave: 'codigo', rotulo: 'Código', obrigatorio: true, largura: 'meia', ajuda: VP.config().codigoLocalizacaoManual ? 'Informado manualmente (configuração).' : '' }, { chave: 'nome', rotulo: 'Nome', obrigatorio: true, largura: 'meia' },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: VP.TIPOS_UNIDADE.map((x) => [x, x]), largura: 'meia' },
      { chave: 'responsavelId', rotulo: 'Responsável', tipo: 'select', opcoes: opc('responsaveis'), largura: 'meia', ajuda: seVazio('responsaveis', 'Nenhum responsável cadastrado. Cadastre a pessoa em Cadastros → Responsáveis (nome, matrícula, cargo).') },
      { chave: 'entidadeId', rotulo: 'Entidade / órgão (dono dos bens desta unidade)', tipo: 'select', opcoes: opc('entidades'), ajuda: 'A prefeitura ou o fundo (Saúde, Educação, Previdência…) em nome de quem os bens são comprados.' + (seVazio('entidades', ' Nenhuma cadastrada: cadastre em Cadastros → Entidades e fundos (nome e CNPJ).') || '') },
      { chave: 'logradouro', rotulo: 'Logradouro' }, { chave: 'bairro', rotulo: 'Bairro', largura: 'meia' }, { chave: 'cidade', rotulo: 'Cidade', largura: 'meia' },
      { chave: 'secretaria', rotulo: 'Secretaria', largura: 'meia' }, { chave: 'cep', rotulo: 'CEP', largura: 'meia' },
      { chave: 'email', rotulo: 'E-mail', largura: 'meia' }, { chave: 'telefone', rotulo: 'Telefone', largura: 'meia' },
      { chave: 'responsavel2Id', rotulo: 'Responsável 2', tipo: 'select', opcoes: opc('responsaveis'), largura: 'meia' },
      { chave: 'vinculo', rotulo: 'Situação do local (próprio, cedido, alugado…)', largura: 'meia' },
      { chave: 'predio', rotulo: 'Prédio onde fica', largura: 'meia' }, { chave: 'observacao', rotulo: 'Observação', largura: 'meia' }],
    colunas: [{ chave: 'codigo', titulo: 'Código' }, { chave: 'nome', titulo: 'Nome', html: (x) => `<a href="#unidade/${esc(x.id)}">${esc(x.nome)}</a>`, valor: (x) => x.nome }, { chave: 'tipo', titulo: 'Tipo' }, { chave: 'resp', titulo: 'Responsável', valor: (x) => VP.nome('responsaveis', x.responsavelId) }, { chave: 'bens', titulo: 'Bens', num: true, valor: (x) => VP.db.lista('bens').filter((b) => b.unidadeId === x.id && b.status !== 'baixado').length }, { chave: 'secretaria', titulo: 'Secretaria' }, { chave: 'telefone', titulo: 'Telefone' }, { chave: 'bairro', titulo: 'Bairro' }], uso: (x) => VP.db.lista('bens').filter((b) => b.unidadeId === x.id).length },
    responsaveis: { titulo: 'Responsáveis', campos: () => [{ chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'matricula', rotulo: 'Matrícula', largura: 'meia' }, { chave: 'cargo', rotulo: 'Cargo', largura: 'meia' }, { chave: 'documento', rotulo: 'CPF (fica mascarado nas telas)', largura: 'meia' }, { chave: 'email', rotulo: 'E-mail', largura: 'meia' }, { chave: 'telefone', rotulo: 'Telefone', largura: 'meia' }],
      colunas: [{ chave: 'nome', titulo: 'Nome' }, { chave: 'matricula', titulo: 'Matrícula' }, { chave: 'cargo', titulo: 'Cargo' }, { chave: 'email', titulo: 'E-mail' }, { chave: 'doc', titulo: 'CPF', valor: (x) => (x.documento ? '***.' + String(x.documento).replace(/\D/g, '').slice(3, 6) + '.***-**' : '') }, { chave: 'bens', titulo: 'Bens', num: true, valor: (x) => VP.db.lista('bens').filter((b) => b.responsavelId === x.id && b.status !== 'baixado').length }], uso: (x) => VP.db.lista('bens').filter((b) => b.responsavelId === x.id).length },
    classificacoes: { titulo: 'Classificações (grupo, classe, subclasse)', campos: () => [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true, largura: 'meia' }, { chave: 'codigo', rotulo: 'Código', largura: 'meia' },
      { chave: 'paiId', rotulo: 'Fica dentro de (vazio = grupo)', tipo: 'select', opcoes: VP.opcClassificacoes(), ajuda: seVazio('classificacoes', 'Ainda não há classificações: deixe vazio e esta será um grupo (ex.: Bens móveis). Depois, as classes (ex.: Cadeiras) ficam dentro dele.') || 'Vazio = esta é um grupo (ex.: Bens móveis). Para uma classe, escolha o grupo.' },
      { chave: 'tipoBem', rotulo: 'Tipo de bem (para grupos)', tipo: 'select', opcoes: Object.entries(L.tiposBem), largura: 'meia' },
      { chave: 'contaTexto', rotulo: 'Conta contábil (onde fica o valor do bem)', largura: 'meia', sugestoes: VP.db.lista('contas').filter((c) => c.tipo === 'ativo').map(rotuloConta), placeholder: 'Digite para procurar', ajuda: (seVazio('contas', 'Nenhuma conta do tipo Ativo. ', (c) => c.tipo === 'ativo') || '') + 'Escolha da lista ou digite código e nome (ex.: 1.2.3.1.1.03 Móveis e utensílios). Se não existir, é criada em Cadastros → Contas contábeis ao salvar. O código vem do plano de contas da contabilidade.' },
      { chave: 'contaDepTexto', rotulo: 'Conta de depreciação acumulada', largura: 'meia', sugestoes: VP.db.lista('contas').filter((c) => c.tipo === 'depreciacao').map(rotuloConta), placeholder: 'Digite para procurar', ajuda: (seVazio('contas', 'Nenhuma conta do tipo Depreciação acumulada. ', (c) => c.tipo === 'depreciacao') || '') + 'Onde soma o desgaste (ex.: 1.2.3.8.1.01 (-) Depreciação acumulada de bens móveis). Se não existir, é criada ao salvar.' },
      { chave: 'vidaUtilMeses', rotulo: 'Vida útil (meses)', tipo: 'numero', largura: 'meia', ajuda: 'Use a tabela oficial do município (decreto). Se a classe não tiver, vale a do grupo.' },
      { chave: 'residualPct', rotulo: 'Valor residual (%)', tipo: 'numero', largura: 'meia', ajuda: 'Quanto o bem ainda vale no fim da vida útil, em % do valor (de 0 a 99).' },
      { chave: 'naoDeprecia', rotulo: 'Não deprecia (ex.: terrenos)', tipo: 'bool' }],
    colunas: [{ chave: 'nome', titulo: 'Nome', valor: (x) => `${'— '.repeat(x.nivel === 'grupo' ? 0 : x.nivel === 'classe' ? 1 : 2)}${x.nome}` }, { chave: 'nivel', titulo: 'Nível' }, { chave: 'conta', titulo: 'Conta', valor: (x) => VP.nome('contas', VP.dadosDaClassificacao(x.id).contaId) }, { chave: 'vida', titulo: 'Vida útil', valor: (x) => { const d = VP.dadosDaClassificacao(x.id); return d.naoDeprecia ? 'Não deprecia' : d.vidaUtilMeses ? `${d.vidaUtilMeses} meses` : '—'; } }, { chave: 'res', titulo: 'Residual', valor: (x) => (VP.dadosDaClassificacao(x.id).residualPct ?? '—') + '%' }],
    ordenar: (lista) => { const r = []; const desce = (pai) => lista.filter((c) => (c.paiId || '') === pai).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).forEach((c) => { r.push(c); desce(c.id); }); desce(''); return r; },
    antesDeSalvar: (x) => { const pai = VP.db.pega('classificacoes', x.paiId); x.nivel = !pai ? 'grupo' : pai.paiId ? 'subclasse' : 'classe'; },
    // contas digitadas: acha ou cria (a conta nova só é gravada se a classificação for salva)
    valoresDe: (x) => (x ? Object.assign({}, x, { contaTexto: x.contaId ? rotuloConta(VP.db.pega('contas', x.contaId) || { nome: '' }) : '', contaDepTexto: x.contaDepreciacaoId ? rotuloConta(VP.db.pega('contas', x.contaDepreciacaoId) || { nome: '' }) : '' }) : {}),
    preparar: (v) => {
      const novas = [];
      for (const [txt, campo, tipo] of [['contaTexto', 'contaId', 'ativo'], ['contaDepTexto', 'contaDepreciacaoId', 'depreciacao']]) {
        if (!(txt in v)) continue;
        const r = VP.contaDoTexto(v[txt], tipo);
        if (r.erro) return { erro: r.erro };
        if (r.nova) { const ja = novas.find((n) => n.codigo === r.nova.codigo && n.nome === r.nova.nome); v[campo] = (ja || r.nova).id; if (!ja) novas.push(r.nova); } else v[campo] = r.id;
        delete v[txt];
      }
      return { novas };
    },
    uso: (x) => VP.db.lista('bens').filter((b) => VP.subClassificacoes(x.id).has(b.classificacaoId)).length },
    produtos: { titulo: 'Produtos (catálogo)', campos: () => [{ chave: 'codigo', rotulo: 'Código', largura: 'meia' }, { chave: 'nome', rotulo: 'Nome', obrigatorio: true, largura: 'meia' }, { chave: 'classificacaoId', rotulo: 'Classificação', tipo: 'select', opcoes: VP.opcClassificacoes(), obrigatorio: true, ajuda: seVazio('classificacoes', 'Nenhuma classificação cadastrada. Cadastre em Cadastros → Classificações (grupo, classe, vida útil e valor residual).') }],
      colunas: [{ chave: 'codigo', titulo: 'Código' }, { chave: 'nome', titulo: 'Nome' }, { chave: 'cl', titulo: 'Classificação', valor: (x) => VP.nome('classificacoes', x.classificacaoId) }], uso: (x) => VP.db.lista('bens').filter((b) => b.produtoId === x.id).length },
    contas: { titulo: 'Contas contábeis',
      intro: () => '<p class="ajuda"><b>O que é:</b> a "gaveta" da contabilidade onde fica cada tipo de bem (ex.: Móveis e utensílios, Veículos, Edificações). É a <b>mesma lista para a prefeitura e para todos os fundos</b>: quem é dono do bem é a <a href="#cadastros/entidades">Entidade</a>, não a conta. A conta é escolhida na <a href="#cadastros/classificacoes">Classificação</a> e vale para todos os bens dela. <b>Tipo:</b> Ativo = onde fica o valor do bem; Depreciação acumulada = onde soma o desgaste; Resultado = a despesa do mês com o desgaste. A lista inicial é uma sugestão do sistema no padrão nacional: confira os códigos com a contabilidade.</p>',
      campos: () => [{ chave: 'codigo', rotulo: 'Código (do plano de contas da contabilidade)', obrigatorio: true, largura: 'meia' }, { chave: 'nome', rotulo: 'Nome', obrigatorio: true, largura: 'meia' }, { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', vazio: false, opcoes: Object.entries(TIPOS_CONTA) }],
      colunas: [{ chave: 'codigo', titulo: 'Código' }, { chave: 'nome', titulo: 'Nome' }, { chave: 'tipo', titulo: 'Tipo', valor: (x) => TIPOS_CONTA[x.tipo] || x.tipo }, { chave: 'origem', titulo: 'Origem', valor: (x) => x.origem || 'Incluída pela pessoa' }], uso: (x) => VP.db.lista('bens').filter((b) => b.contaId === x.id).length },
    fornecedores: { titulo: 'Fornecedores', campos: () => [{ chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'documento', rotulo: 'CNPJ/CPF', largura: 'meia' }, { chave: 'contato', rotulo: 'Contato', largura: 'meia' }],
      colunas: [{ chave: 'nome', titulo: 'Nome' }, { chave: 'documento', titulo: 'CNPJ/CPF' }, { chave: 'contato', titulo: 'Contato' }], uso: (x) => VP.db.lista('bens').filter((b) => b.fornecedorId === x.id).length },
    motivos: { titulo: 'Motivos', campos: () => [{ chave: 'tipo', rotulo: 'Usado em', tipo: 'select', vazio: false, opcoes: [['baixa', 'Baixa'], ['desuso', 'Desuso'], ['manutencao', 'Manutenção'], ['transferencia', 'Transferência']] }, { chave: 'nome', rotulo: 'Motivo', obrigatorio: true }],
      colunas: [{ chave: 'tipo', titulo: 'Usado em' }, { chave: 'nome', titulo: 'Motivo' }] },
    entidades: { titulo: 'Entidades e fundos',
      intro: () => '<p class="ajuda"><b>O que é:</b> quem é <b>dono</b> dos bens: a prefeitura e cada fundo com CNPJ próprio (ex.: Prefeitura Municipal, Fundo Municipal de Saúde, de Educação, de Previdência, de Cultura). Cada unidade e cada bem ficam em nome de uma entidade, e os relatórios separam por ela. Não confunda com as <a href="#cadastros/contas">Contas contábeis</a>, que dizem o tipo do bem e são as mesmas para todas as entidades.</p>',
      campos: () => [{ chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'documento', rotulo: 'CNPJ' }], colunas: [{ chave: 'nome', titulo: 'Nome' }, { chave: 'documento', titulo: 'CNPJ' }], uso: (x) => VP.db.lista('bens').filter((b) => b.entidadeId === x.id).length },
    comissoes: { titulo: 'Comissões (inventário e avaliação)', campos: () => [{ chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'ato', rotulo: 'Ato de designação (portaria/decreto)' }, { chave: 'membros', rotulo: 'Membros (pelo menos 3 servidores)', tipo: 'area' }],
      colunas: [{ chave: 'nome', titulo: 'Nome' }, { chave: 'ato', titulo: 'Ato' }, { chave: 'membros', titulo: 'Membros' }] },
    seguradoras: { titulo: 'Seguradoras e corretoras', campos: () => [{ chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'corretora', rotulo: 'É corretora', tipo: 'bool' }], colunas: [{ chave: 'nome', titulo: 'Nome' }, { chave: 'corretora', titulo: 'Tipo', valor: (x) => (x.corretora ? 'Corretora' : 'Seguradora') }] },
    vidaUtilItens: { titulo: 'Vida útil dos itens', ordenar: (l) => l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      intro: () => `<p class="ajuda">Quanto tempo cada tipo de item costuma durar. O sistema usa esta lista para <b>sugerir</b> se um item novo é patrimônio (com plaqueta) ou item de controle: item de controle só quando custa até ${VP.u.moeda(VP.config().limiteControle)} <b>e</b> dura até ${VP.config().limiteControleMeses} meses (Configurações). A lista inicial é uma sugestão do sistema: ajuste à regra do município.</p>`,
      campos: () => [{ chave: 'nome', rotulo: 'Item', obrigatorio: true }, { chave: 'termos', rotulo: 'Palavras que identificam o item na descrição (separe com |)', ajuda: 'Ex.: fone|headset. Sem acento. Vazio = usa o nome.' }, { chave: 'vidaUtilMeses', rotulo: 'Vida útil (meses)', tipo: 'numero', obrigatorio: true }],
      colunas: [{ chave: 'nome', titulo: 'Item' }, { chave: 'termos', titulo: 'Palavras' }, { chave: 'vidaUtilMeses', titulo: 'Vida útil (meses)', num: true }, { chave: 'sugestao', titulo: 'Até o limite de valor vira', valor: (x) => (Number(x.vidaUtilMeses) <= Number(VP.config().limiteControleMeses) ? 'Item de controle' : 'Patrimônio (plaqueta)') }, { chave: 'origem', titulo: 'Origem', valor: (x) => x.origem || 'Incluído pela pessoa' }] },
    decisoesItens: { titulo: 'Decisões guardadas (item de controle ou plaqueta)', ordenar: (l) => l.sort((a, b) => String(b.ultimaEm).localeCompare(String(a.ultimaEm))),
      intro: () => '<p class="ajuda">O que já foi decidido para cada item barato. Quando o mesmo item aparece de novo (nota fiscal, planilha ou novo bem), a sugestão segue a última decisão. Corrija aqui ou mande para a Lixeira para o sistema voltar a usar a regra.</p>',
      campos: () => [{ chave: 'nome', rotulo: 'Item', obrigatorio: true }, { chave: 'escolha', rotulo: 'Decisão', tipo: 'select', vazio: false, opcoes: [['controle', 'Item de controle (sem plaqueta)'], ['patrimonio', 'Patrimônio (com plaqueta)']] }],
      antesDeSalvar: (d) => { d.ultimaEm = d.ultimaEm || VP.Plataforma.hoje(); },
      colunas: [{ chave: 'nome', titulo: 'Item' }, { chave: 'escolha', titulo: 'Decisão', valor: (x) => (x.escolha === 'controle' ? 'Item de controle' : 'Patrimônio (plaqueta)') }, { chave: 'ultimaEm', titulo: 'Última vez', valor: (x) => VP.u.data(x.ultimaEm), ordenar: (x) => x.ultimaEm }, { chave: 'vezes', titulo: 'Vezes (controle / plaqueta)', valor: (x) => `${x.vezes?.controle || 0} / ${x.vezes?.patrimonio || 0}` }, { chave: 'ultimoValor', titulo: 'Último valor', valor: (x) => (x.ultimoValor != null ? VP.u.moeda(x.ultimoValor) : '') }] },
    tiposGarantia: { titulo: 'Tipos de garantia', campos: () => [{ chave: 'nome', rotulo: 'Nome', obrigatorio: true }], colunas: [{ chave: 'nome', titulo: 'Nome' }] },
    // Matrículas do cartório (22/10/2026): cadastro separado do imóvel. Um imóvel pode estar em várias matrículas e uma
    // matrícula pode ter vários imóveis; a ligação é feita por pessoa (etapa seguinte). Baixada nunca é apagada.
    matriculas: { titulo: 'Matrículas (cartório)',
      intro: () => '<p class="ajuda"><b>O que é:</b> o registro do terreno no cartório. Não é o imóvel: um imóvel (escola, posto) pode estar em mais de uma matrícula, e uma matrícula pode ter mais de um imóvel. A <b>Situação</b> diz se ainda vale (Ativa), se saiu do patrimônio (Baixada), se o cartório fechou a matrícula (Encerrada) ou se alguém precisa olhar (A conferir). O <b>Cadastro imobiliário</b> é o número usado no sistema da prefeitura (pode haver mais de um, separados por ";"). Para trazer muitas de uma vez: <b>Importar planilha unificada</b>, aba "Matrículas".</p>',
      ordenar: (l) => l.sort((a, b) => String(a.matricula).localeCompare(String(b.matricula), 'pt-BR', { numeric: true })),
      campos: () => [
        { chave: 'matricula', rotulo: 'Matrícula', obrigatorio: true, largura: 'meia', ajuda: 'Transcrição antiga: como está no livro (ex.: 734-3). Sem registro: SR-0001…' },
        { chave: 'tipoRegistro', rotulo: 'Tipo de registro', tipo: 'select', vazio: false, opcoes: VP.TIPOS_REGISTRO_MATRICULA, largura: 'meia' },
        { chave: 'cartorio', rotulo: 'Cartório' },
        { chave: 'cadastrosImobiliarios', rotulo: 'Cadastro imobiliário (sistema da prefeitura)', largura: 'meia', ajuda: 'Mais de um: separe com ";".' }, { chave: 'tipoImovel', rotulo: 'Tipo (rua, terreno, área verde…)', largura: 'meia' },
        { chave: 'logradouro', rotulo: 'Logradouro' }, { chave: 'numeroEndereco', rotulo: 'Nº', largura: 'meia' }, { chave: 'bairro', rotulo: 'Bairro', largura: 'meia' },
        { chave: 'descricao', rotulo: 'Descrição (complemento)' }, { chave: 'observacao', rotulo: 'Observação', tipo: 'area' },
        { chave: 'situacao', rotulo: 'Situação', tipo: 'select', vazio: false, opcoes: VP.SITUACOES_MATRICULA, largura: 'meia' }, { chave: 'motivoSituacao', rotulo: 'Motivo da situação', largura: 'meia' },
        { chave: 'proprietario', rotulo: 'Proprietário no cartório', largura: 'meia', ajuda: 'Quem é dono no cartório (Município, Estado, entidade…). Não é quem cuida do imóvel.' }, { chave: 'areaCartorio', rotulo: 'Área no cartório (m²)', tipo: 'numero', largura: 'meia', ajuda: 'A área que vale (oficial).' },
        { chave: 'area', rotulo: 'Área na planilha (m²)', tipo: 'numero', largura: 'meia' }, { chave: 'areaCelula', rotulo: 'Área: célula original', largura: 'meia', ajuda: 'Quando a planilha tinha dois números na mesma célula.' },
        { chave: 'lat', rotulo: 'Latitude', tipo: 'numero', largura: 'meia' }, { chave: 'lon', rotulo: 'Longitude', tipo: 'numero', largura: 'meia' },
        { chave: 'pdfLinks', rotulo: 'PDF da matrícula (link)', ajuda: 'Link do Drive (começa com https://). Mais de um: separe com ";".' },
        { chave: 'texto', rotulo: 'Texto da matrícula', tipo: 'area', ajuda: 'O texto transcrito (TXT). Aparece na ficha para ler e procurar.' },
        { chave: 'linhasOrigem', rotulo: 'Linhas de origem (planilha da prefeitura)' }, { chave: 'avisos', rotulo: 'Avisos', tipo: 'area' }],
      antesDeSalvar: (d) => { d.nome = `Matrícula ${d.matricula}`; d.imoveis = d.imoveis || []; },
      colunas: [{ chave: 'matricula', titulo: 'Matrícula', html: (x) => `<a href="#matricula/${esc(x.id)}">${esc(x.matricula)}</a>`, valor: (x) => x.matricula }, { chave: 'tipoRegistro', titulo: 'Registro', valor: (x) => (VP.TIPOS_REGISTRO_MATRICULA.find(([k]) => k === x.tipoRegistro) || [, ''])[1] },
        { chave: 'cadastrosImobiliarios', titulo: 'Cadastro imobiliário' }, { chave: 'tipoImovel', titulo: 'Tipo' },
        { chave: 'end', titulo: 'Endereço', valor: (x) => [x.logradouro, x.numeroEndereco, x.bairro].filter(Boolean).join(', ') },
        { chave: 'situacao', titulo: 'Situação', valor: (x) => (VP.SITUACOES_MATRICULA.find(([k]) => k === x.situacao) || [, ''])[1] },
        { chave: 'proprietario', titulo: 'Dono no cartório' }, { chave: 'areaCartorio', titulo: 'Área cartório (m²)', num: true }, { chave: 'texto', titulo: 'Texto', valor: (x) => (x.texto ? 'Sim' : '') }, { chave: 'pdf', titulo: 'PDF', valor: (x) => (x.pdfLinks ? 'Sim' : '') }, { chave: 'avisos', titulo: 'Avisos' }] }
  };
  const SO_LEITURA = {
    tiposBem: { titulo: 'Tipos de bem', linhas: () => Object.entries(L.tiposBem).map(([k, n]) => ({ id: k, nome: n, qtd: VP.db.lista('bens').filter((b) => b.tipo === k).length })), colunas: [{ chave: 'nome', titulo: 'Tipo' }, { chave: 'qtd', titulo: 'Bens', num: true }] },
    tiposMovimentacao: { titulo: 'Tipos de movimentação', linhas: () => Object.entries(L.eventos).map(([k, x]) => ({ id: k, nome: x.nome, grupo: { financeiro: 'Financeiro', fisico: 'Físico', registro: 'Registro' }[x.grupo] })), colunas: [{ chave: 'nome', titulo: 'Movimentação' }, { chave: 'grupo', titulo: 'Grupo' }] }
  };

  // ---------------------------------------------------------------- tela Cadastros (novo layout 23/10/2026)
  // Menu ao lado com os cadastros em grupos e a quantidade de cada um; na lista, busca em todas as colunas e filtros próprios de cada cadastro.
  const GRUPOS_CAD = [
    ['Locais e pessoas', ['unidades', 'responsaveis', 'entidades', 'comissoes']],
    ['Imóveis', ['matriculas']],
    ['Classificação e contas', ['classificacoes', 'contas', 'produtos', 'vidaUtilItens', 'decisoesItens']],
    ['Compras e seguros', ['fornecedores', 'seguradoras', 'tiposGarantia']],
    ['Listas do sistema', ['motivos', 'tiposBem', 'tiposMovimentacao']]
  ];
  const valoresDistintos = (lista, f, vazio) => {
    const vs = [...new Set(lista.map((x) => String(f(x) ?? '').trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    return vs.map((v) => (v ? [v, v] : ['__vazio', vazio]));
  };
  const igualOuVazio = (v, alvo) => (alvo === '__vazio' ? !String(v ?? '').trim() : String(v ?? '').trim() === alvo);
  // filtros de cada cadastro: { chave, rotulo, tipo, opcoes, teste(x, valor) }
  const FILTROS_CAD = {
    matriculas: (lista) => {
      const comBem = new Set(VP.db.lista('bens').flatMap((b) => numerosDaLista(b.imovel?.matricula)));
      return [
        { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: VP.SITUACOES_MATRICULA, teste: (x, v) => x.situacao === v },
        { chave: 'tipoRegistro', rotulo: 'Tipo de registro', tipo: 'select', opcoes: VP.TIPOS_REGISTRO_MATRICULA, teste: (x, v) => x.tipoRegistro === v },
        { chave: 'tipoImovel', rotulo: 'Tipo', tipo: 'select', opcoes: valoresDistintos(lista, (x) => x.tipoImovel, '(sem tipo)'), teste: (x, v) => igualOuVazio(x.tipoImovel, v) },
        { chave: 'bairro', rotulo: 'Bairro', tipo: 'select', opcoes: valoresDistintos(lista, (x) => x.bairro, '(sem bairro)'), teste: (x, v) => igualOuVazio(x.bairro, v) },
        { chave: 'pdf', rotulo: 'PDF', tipo: 'select', opcoes: [['sim', 'Com PDF'], ['nao', 'Sem PDF']], teste: (x, v) => !!x.pdfLinks === (v === 'sim') },
        { chave: 'texto', rotulo: 'Texto', tipo: 'select', opcoes: [['sim', 'Com texto'], ['nao', 'Sem texto']], teste: (x, v) => !!x.texto === (v === 'sim') },
        { chave: 'fotos', rotulo: 'Fotos', tipo: 'select', opcoes: [['sim', 'Com fotos'], ['nao', 'Sem fotos']], teste: (x, v) => (x.documentos || []).some((d) => !d.removido && d.tipo === 'Foto') === (v === 'sim') },
        { chave: 'bem', rotulo: 'Bem ligado', tipo: 'select', opcoes: [['sim', 'Com bem ligado'], ['nao', 'Sem bem ligado']], teste: (x, v) => comBem.has(String(x.matricula)) === (v === 'sim') },
        { chave: 'avisos', rotulo: 'Com avisos', tipo: 'bool', teste: (x) => !!x.avisos }
      ];
    },
    unidades: (lista) => [
      { chave: 'secretaria', rotulo: 'Secretaria', tipo: 'select', opcoes: valoresDistintos(lista, (x) => x.secretaria, '(sem secretaria)'), teste: (x, v) => igualOuVazio(x.secretaria, v) },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: valoresDistintos(lista, (x) => x.tipo, '(sem tipo)'), teste: (x, v) => igualOuVazio(x.tipo, v) },
      { chave: 'vinculo', rotulo: 'Situação do local', tipo: 'select', opcoes: valoresDistintos(lista, (x) => x.vinculo, '(não informada)'), teste: (x, v) => igualOuVazio(x.vinculo, v) },
      { chave: 'bairro', rotulo: 'Bairro', tipo: 'select', opcoes: valoresDistintos(lista, (x) => x.bairro, '(sem bairro)'), teste: (x, v) => igualOuVazio(x.bairro, v) },
      { chave: 'semResponsavel', rotulo: 'Sem responsável', tipo: 'bool', teste: (x) => !x.responsavelId },
      { chave: 'semContato', rotulo: 'Sem e-mail nem telefone', tipo: 'bool', teste: (x) => !x.email && !x.telefone }
    ],
    responsaveis: () => [
      { chave: 'semEmail', rotulo: 'Sem e-mail', tipo: 'bool', teste: (x) => !x.email },
      { chave: 'semTelefone', rotulo: 'Sem telefone', tipo: 'bool', teste: (x) => !x.telefone },
      { chave: 'semBens', rotulo: 'Sem bens', tipo: 'bool', teste: (x) => !VP.db.lista('bens').some((b) => b.responsavelId === x.id && b.status !== 'baixado') }
    ],
    classificacoes: () => [
      { chave: 'nivel', rotulo: 'Nível', tipo: 'select', opcoes: [['grupo', 'Grupo'], ['classe', 'Classe'], ['subclasse', 'Subclasse']], teste: (x, v) => x.nivel === v },
      { chave: 'naoDeprecia', rotulo: 'Não deprecia', tipo: 'bool', teste: (x) => !!x.naoDeprecia }
    ]
  };
  const filtrosCad = {}; // valores dos filtros de cada cadastro (ficam ao abrir uma ficha e voltar)
  const textoDaLinha = (cols, x) => cols.map((c) => (c.valor ? c.valor(x) : x[c.chave])).filter((v) => v != null && v !== '').join(' ');
  const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const menuCad = (qual) => {
    const todos = Object.assign({}, CAD, SO_LEITURA);
    const usados = new Set(GRUPOS_CAD.flatMap(([, ks]) => ks));
    const grupos = GRUPOS_CAD.concat([['Outros', Object.keys(todos).filter((k) => !usados.has(k))]]).map(([g, ks]) => [g, ks.filter((k) => todos[k])]).filter(([, ks]) => ks.length);
    const qtd = (k) => (SO_LEITURA[k] ? SO_LEITURA[k].linhas().length : VP.db.lista(k).length);
    const nome = (k) => todos[k].titulo.split(' (')[0];
    return `<nav class="cad-menu" aria-label="Cadastros">${grupos.map(([g, ks]) => `<h4>${esc(g)}</h4>${ks.map((k) => `<a href="#cadastros/${k}" class="${k === qual ? 'ativa' : ''}"><span>${esc(nome(k))}</span><span class="contagem">${u.inteiro(qtd(k))}</span></a>`).join('')}`).join('')}</nav>
      <label class="cad-menu-celular">Cadastro <select data-ir-cad>${grupos.map(([g, ks]) => `<optgroup label="${esc(g)}">${ks.map((k) => `<option value="${k}" ${k === qual ? 'selected' : ''}>${esc(nome(k))} (${u.inteiro(qtd(k))})</option>`).join('')}</optgroup>`).join('')}</select></label>`;
  };
  T.cadastros = (qual = 'unidades', query = {}) => {
    if (!CAD[qual] && !SO_LEITURA[qual]) qual = 'unidades';
    const ligarMenu = () => document.querySelector('[data-ir-cad]')?.addEventListener('change', (e) => VP.app.ir('#cadastros/' + e.target.value));
    const casca = (cab, corpo) => `<div class="cad-layout">${menuCad(qual)}<div class="cad-corpo">${cab}${corpo}</div></div>`;
    if (SO_LEITURA[qual]) {
      const c = SO_LEITURA[qual];
      return { titulo: 'Cadastros', html: casca(`<h2 class="cad-titulo">${esc(c.titulo)}</h2>`, `<p class="ajuda">Lista fixa do sistema.</p>` + ui.tabela({ id: 'cad-' + qual, colunas: c.colunas, linhas: c.linhas(), nomePlanilha: qual })), ligar: () => { ui.ligarTabela('cad-' + qual); ligarMenu(); } };
    }
    const c = CAD[qual];
    let lista = VP.db.lista(qual);
    lista = c.ordenar ? c.ordenar(lista) : lista.sort((a, b) => String(a.codigo || a.nome).localeCompare(String(b.codigo || b.nome), 'pt-BR', { numeric: true }));
    const defs = FILTROS_CAD[qual] ? FILTROS_CAD[qual](lista) : [];
    const v = filtrosCad[qual] = filtrosCad[qual] || {};
    // vindo de um link (ex.: painel de Relatórios): os filtros do endereço substituem os anteriores
    const doLink = Object.entries(query).filter(([k]) => k === 'busca' || defs.some((d) => d.chave === k));
    if (doLink.length) { for (const k of Object.keys(v)) delete v[k]; for (const [k, x] of doLink) { const d = defs.find((y) => y.chave === k); v[k] = d?.tipo === 'bool' ? true : x; } }
    const colunas = c.colunas.concat([{ chave: '_acoes', titulo: '', html: (x) => `<button class="botao pequeno" data-editar-cad="${esc(x.id)}">Editar</button> <button class="botao pequeno perigo" data-excluir-cad="${esc(x.id)}">Excluir</button>` }]);
    const filtrar = () => {
      const f = ui.limparValores(v);
      const termos = f.busca ? semAcento(f.busca).split(/\s+/).filter(Boolean) : [];
      return lista.filter((x) => defs.every((d) => f[d.chave] === undefined || f[d.chave] === false || d.teste(x, f[d.chave]))
        && (!termos.length || ((t) => termos.every((p) => t.includes(p)))(semAcento(textoDaLinha(c.colunas, x)))));
    };
    const desenhar = () => {
      const l = filtrar();
      return `<div class="linha-filtros">${ui.filtros({ id: 'cad', defs, valores: v, placeholder: 'Buscar em todas as colunas (ex.: um nome, um número, um bairro)…', aoMudar: (_v, origem) => atualizar(origem) })}</div>
        <p class="ajuda cad-contagem">${l.length === lista.length ? `${u.inteiro(lista.length)} registro(s)` : `Mostrando <b>${u.inteiro(l.length)}</b> de ${u.inteiro(lista.length)}`}</p>
        ${ui.tabela({ id: 'cad-' + qual, colunas, linhas: l, nomePlanilha: qual, vazio: lista.length ? 'Nada encontrado com esta busca e estes filtros.' : 'Nenhum cadastro ainda.' })}`;
    };
    const atualizar = (origem) => {
      const area = document.getElementById('area-cad');
      if (!area) return;
      const foco = origem === 'busca' ? document.activeElement?.selectionStart : null;
      area.innerHTML = desenhar();
      ui.ligarTabela('cad-' + qual);
      if (origem === 'busca') { const b = area.querySelector('.busca'); b.focus(); if (foco != null) b.setSelectionRange(foco, foco); }
    };
    const editar = (x) => ui.formulario({
      titulo: (x ? 'Editar: ' : 'Novo: ') + c.titulo.split(' (')[0], campos: c.campos(), valores: c.valoresDe ? c.valoresDe(x) : x || {}, largura: 'media',
      salvar: async (v) => {
        const prep = c.preparar ? c.preparar(v) : { novas: [] };
        if (prep.erro) return prep.erro;
        const doc = Object.assign(x || {}, v);
        if (c.antesDeSalvar) c.antesDeSalvar(doc);
        if (qual === 'unidades' && VP.db.lista('unidades').some((o) => o.codigo === doc.codigo && o.id !== doc.id)) return 'Já existe unidade com este código.';
        // Valor residual sempre informado (decisão do usuário, 14/10/2026): quem tem vida útil precisa do residual, próprio ou do grupo
        if (qual === 'classificacoes' && !doc.naoDeprecia && doc.vidaUtilMeses && (doc.residualPct == null || doc.residualPct === '') && VP.dadosDaClassificacao(doc.paiId).residualPct == null) return 'Informe o Valor residual (%): toda classificação que deprecia precisa dele.';
        if (qual === 'classificacoes' && doc.residualPct != null && doc.residualPct !== '' && (doc.residualPct < 0 || doc.residualPct >= 100)) return 'O valor residual (%) deve ser de 0 a 99.';
        if (prep.novas.length) await VP.db.gravar('contas', prep.novas);
        await VP.db.gravar(qual, doc);
        ui.aviso(prep.novas.length ? `Salvo. Conta(s) nova(s) em Contas contábeis: ${prep.novas.map(rotuloConta).join('; ')}.` : 'Salvo.');
        VP.app.render();
      }
    });
    return {
      titulo: 'Cadastros',
      acoes: `${VP.importaCadastros ? `${!VP.servidor?.ativo || VP.servidor.podeAlterar() ? '<label class="botao">Importar planilha unificada<input type="file" accept=".xlsx,.csv" data-importar-cad hidden></label> ' : ''}<button class="botao" data-baixar-todos-cad>Baixar planilha unificada</button> ` : ''}<button class="botao primario" data-novo-cad>+ Novo</button>`,
      html: casca(`<h2 class="cad-titulo">${esc(c.titulo)}</h2>${c.intro ? c.intro() : ''}`, `<div id="area-cad">${desenhar()}</div>`),
      ligar() {
        ui.ligarTabela('cad-' + qual);
        ligarMenu();
        document.querySelector('[data-novo-cad]').addEventListener('click', () => editar(null));
        // Todos os cadastros num Excel só, uma aba para cada (o mesmo de Exportar e importar → Cadastros)
        document.querySelector('[data-baixar-todos-cad]')?.addEventListener('click', () => { const n = VP.importaCadastros.exportar(); ui.aviso(`Planilha Unificada baixada (${u.inteiro(n)} registro(s)).`); });
        // Importar a Planilha Unificada aqui: lê o arquivo e abre a mesma prévia de Exportar e importar (nada é gravado antes de confirmar)
        document.querySelector('[data-importar-cad]')?.addEventListener('change', async (e) => {
          const arq = e.target.files[0]; e.target.value = ''; if (!arq) return;
          try { await VP.planilhas.lerArquivo(arq); } catch (err) { return ui.aviso(err.message, 'erro'); }
          VP.app.ir('#planilhas/importar');
        });
        document.getElementById('conteudo').onclick = async (e) => { // onclick: não acumula a cada visita
          const ed = e.target.closest('[data-editar-cad]');
          if (ed) return editar(VP.db.pega(qual, ed.dataset.editarCad));
          const ex = e.target.closest('[data-excluir-cad]');
          if (ex) {
            const x = VP.db.pega(qual, ex.dataset.excluirCad);
            const n = c.uso ? c.uso(x) : 0;
            if (!await ui.confirmar(`Mover <b>${esc(x.nome || x.codigo)}</b> para a Lixeira?${n ? `<br><b>${n} bem(ns)</b> usam este cadastro — eles continuam como estão.` : ''}`, { sim: 'Mover para a Lixeira', classe: 'perigo' })) return;
            x.excluido = true; x.excluidoEm = VP.Plataforma.agoraISO();
            await VP.db.gravar(qual, x);
            ui.aviso('Na Lixeira.');
            VP.app.render();
          }
        };
      }
    };
  };

  // ---------------------------------------------------------------- visão 360° da unidade (UN-01)
  // ---------------------------------------------------------------- ficha da matrícula (23/10/2026)
  // Texto da matrícula para ler (guardado no sistema), "Ver PDF" (o PDF fica no Drive; aqui só o link),
  // mapas, fotos e outros documentos por link, e os bens ligados (terreno e prédios). Nada é apagado: documento removido vai para o histórico.
  const soLink = (t) => (/^https?:\/\//i.test(String(t || '').trim()) ? String(t).trim() : '');
  const numerosDaLista = (t) => String(t || '').split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
  VP.bensDaMatricula = (numero) => VP.db.lista('bens').filter((b) => numerosDaLista(b.imovel?.matricula).includes(String(numero)));
  VP.matriculaPeloNumero = (numero) => VP.db.lista('matriculas').find((x) => String(x.matricula) === String(numero));
  VP.linksMatriculas = (texto) => numerosDaLista(texto).map((n) => { const m = VP.matriculaPeloNumero(n); return m ? `<a href="#matricula/${esc(m.id)}">${esc(n)}</a>` : esc(n); }).join(', ');
  const TIPOS_DOC = ['Mapa', 'Foto', 'Planta', 'Escritura', 'Documento', 'Outro'];
  // miniatura de arquivo do Drive (só aparece para quem tem acesso ao arquivo no Drive)
  const idDrive = (l) => (String(l || '').match(/\/d\/([\w-]{20,})/) || String(l || '').match(/[?&]id=([\w-]{20,})/) || [])[1] || '';
  // ---- bloco único da matrícula: PDF, texto (ler, procurar, baixar), mapas e fotos.
  // Usado na ficha da matrícula E na ficha do bem (terreno/prédio), para mostrar a mesma coisa nos dois lugares.
  const BM = VP.blocoMatricula = {};
  BM.html = (x, { pode = false, textoAberto = true } = {}) => {
    const pdfs = numerosDaLista(x.pdfLinks).map(soLink).filter(Boolean);
    const docs = (x.documentos || []).filter((d) => !d.removido);
    const fotos = docs.filter((d) => d.tipo === 'Foto'), outros = docs.filter((d) => d.tipo !== 'Foto');
    const linkDoc = (d) => `<a href="${esc(soLink(d.link))}" target="_blank" rel="noopener">${esc(d.titulo || d.link)}</a>`;
    const tirar = (d) => (pode ? ` <button class="botao pequeno" data-tirar-doc="${esc(d.id)}">Tirar</button>` : '');
    const texto = x.texto ? `<input type="search" class="busca-texto" placeholder="Procurar no texto (ex.: um nome, uma área, R-5)" data-busca-texto aria-label="Procurar no texto da matrícula"> <span class="ajuda" data-achados></span>
        <div class="texto-matricula" data-texto tabindex="0">${esc(x.texto)}</div>` : '<p class="ajuda">Ainda sem texto. Cole o texto em Editar → "Texto da matrícula", ou importe pela planilha (coluna "Texto da matrícula"). Para ver o original, use "Ver PDF".</p>';
    return `<div class="bloco-matricula" data-bloco-mat="${esc(x.id)}">
      <div class="linha-botoes">${pdfs.length ? pdfs.map((l, i) => `<a class="botao primario" href="${esc(l)}" target="_blank" rel="noopener">Ver PDF${pdfs.length > 1 ? ' ' + (i + 1) : ''}</a>`).join('') : '<span class="ajuda">Nenhum PDF ligado. Cole o link do Drive em Editar → "PDF da matrícula (link)".</span>'}
        ${x.texto ? '<button class="botao" data-baixar-texto>Baixar texto (.txt)</button>' : ''}</div>
      ${textoAberto ? `<h4>Texto da matrícula</h4>${texto}` : `<details><summary>Texto da matrícula${x.texto ? '' : ' (ainda sem texto)'}</summary>${texto}</details>`}
      <h4>Fotos</h4>
      ${fotos.length ? `<div class="fotos-matricula">${fotos.map((d) => { const idd = idDrive(d.link); return `<figure>${idd ? `<a href="${esc(soLink(d.link))}" target="_blank" rel="noopener"><img src="https://drive.google.com/thumbnail?id=${esc(idd)}&sz=w400" alt="${esc(d.titulo || 'Foto')}" loading="lazy" onerror="this.remove()"></a>` : ''}<figcaption>${linkDoc(d)}${tirar(d)}</figcaption></figure>`; }).join('')}</div>` : '<p class="ajuda">Nenhuma foto ligada. As fotos ficam no Drive: use "Adicionar link" ou a coluna "Fotos (links)" da planilha.</p>'}
      <h4>Mapas e outros documentos</h4>
      ${outros.length ? `<ul class="lista-simples">${outros.map((d) => `<li><b>${esc(d.tipo)}</b> · ${linkDoc(d)}${tirar(d)}</li>`).join('')}</ul>` : '<p class="ajuda">Nenhum documento. Por enquanto os arquivos ficam no Drive: abra o arquivo no Drive, copie o link e use "Adicionar link".</p>'}
      ${pode ? '<div class="linha-botoes"><button class="botao pequeno" data-novo-doc>Adicionar link (foto, mapa, documento)</button></div>' : ''}
    </div>`;
  };
  // miniaturas das fotos (Drive) das matrículas ligadas a um bem — para relatórios com fotos
  BM.fotosDoBem = (b, max = 4) => numerosDaLista(b.imovel?.matricula).map(VP.matriculaPeloNumero).filter(Boolean)
    .flatMap((m) => (m.documentos || []).filter((d) => !d.removido && d.tipo === 'Foto')).slice(0, max)
    .map((d) => { const idd = idDrive(d.link); return `<figure>${idd ? `<a href="${esc(soLink(d.link))}" target="_blank" rel="noopener"><img src="https://drive.google.com/thumbnail?id=${esc(idd)}&sz=w400" alt="${esc(d.titulo || 'Foto')}" loading="lazy" onerror="this.remove()"></a>` : ''}<figcaption><a href="${esc(soLink(d.link))}" target="_blank" rel="noopener">${esc(d.titulo || 'Foto (Drive)')}</a></figcaption></figure>`; }).join('');
  BM.ligar = (raiz, depois) => {
    raiz.querySelectorAll('[data-bloco-mat]').forEach((bloco) => {
      const x = VP.db.pega('matriculas', bloco.dataset.blocoMat);
      if (!x) return;
      const salvar = async (descricao) => { await VP.db.gravar('matriculas', x); ui.aviso(descricao); (depois || VP.app.render)(); };
      const caixa = bloco.querySelector('[data-busca-texto]');
      if (caixa) caixa.addEventListener('input', () => {
        const alvo = bloco.querySelector('[data-texto]'), t = caixa.value.trim();
        if (!t) { alvo.innerHTML = esc(x.texto); bloco.querySelector('[data-achados]').textContent = ''; return; }
        let n = 0;
        alvo.innerHTML = esc(x.texto).replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => { n++; return `<mark>${m}</mark>`; });
        bloco.querySelector('[data-achados]').textContent = n ? `${n} achado(s)` : 'Nada achado';
        alvo.querySelector('mark')?.scrollIntoView({ block: 'center' });
      });
      bloco.querySelector('[data-baixar-texto]')?.addEventListener('click', () => ui.baixar(`Matricula_${String(x.matricula).replace(/[^\w.-]+/g, '_')}.txt`, x.texto, 'text/plain;charset=utf-8'));
      bloco.querySelector('[data-novo-doc]')?.addEventListener('click', () => ui.formulario({
        titulo: `Adicionar link: Matrícula ${x.matricula}`, largura: 'media',
        campos: [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'select', vazio: false, opcoes: TIPOS_DOC.map((t) => [t, t]) }, { chave: 'titulo', rotulo: 'Nome (ex.: Mapa do loteamento)' },
          { chave: 'link', rotulo: 'Link (do Drive ou outro endereço que comece com https://)', obrigatorio: true }],
        salvar: async (v) => {
          if (!soLink(v.link)) return 'O link precisa começar com https://';
          x.documentos = (x.documentos || []).concat([{ id: u.id(), tipo: v.tipo, titulo: v.titulo || '', link: soLink(v.link), em: VP.Plataforma.agoraISO(), por: VP.sessao?.usuario || '' }]);
          await salvar('Documento ligado.');
        }
      }));
      bloco.querySelectorAll('[data-tirar-doc]').forEach((el) => el.addEventListener('click', async () => {
        const d = (x.documentos || []).find((y) => y.id === el.dataset.tirarDoc);
        if (!d || !await ui.confirmar(`Tirar <b>${esc(d.titulo || d.tipo)}</b> da matrícula? O registro fica no histórico.`, { sim: 'Tirar', classe: 'perigo' })) return;
        d.removido = true; d.removidoEm = VP.Plataforma.agoraISO();
        await salvar('Documento tirado (fica no histórico).');
      }));
    });
  };
  T.matricula = (id) => {
    const x = VP.db.pega('matriculas', id);
    if (!x) return { titulo: 'Matrícula', html: '<p class="aviso-inline">Matrícula não encontrada.</p>' };
    const rot = (lista, v) => (lista.find(([k]) => k === v) || [, ''])[1];
    const bens = VP.bensDaMatricula(x.matricula);
    const pode = !VP.servidor?.ativo || VP.servidor.podeAlterar();
    const dados = [['Tipo de registro', rot(VP.TIPOS_REGISTRO_MATRICULA, x.tipoRegistro)], ['Cartório', x.cartorio], ['Situação', rot(VP.SITUACOES_MATRICULA, x.situacao)], ['Motivo da situação', x.motivoSituacao],
      ['Cadastro imobiliário', x.cadastrosImobiliarios], ['Tipo', x.tipoImovel], ['Endereço', [x.logradouro, x.numeroEndereco, x.bairro].filter(Boolean).join(', ')], ['Descrição', x.descricao], ['Observação', x.observacao],
      ['Dono no cartório', x.proprietario], ['Área no cartório (m²)', x.areaCartorio != null ? String(x.areaCartorio).replace('.', ',') : ''], ['Área na planilha (m²)', x.area != null ? String(x.area).replace('.', ',') : ''],
      ['Área: célula original', x.areaCelula], ['Coordenada', x.lat != null && x.lon != null ? `${x.lat}, ${x.lon}` : ''], ['Linhas de origem', x.linhasOrigem], ['Avisos', x.avisos]];
    const html = `
      <p><a href="#cadastros/matriculas">← Todas as matrículas</a></p>
      <section class="cartao secao"><header><h3>Matrícula ${esc(x.matricula)}</h3>${pode ? '<button class="botao pequeno" data-editar-mat>Editar</button>' : ''}</header>
        <dl class="dados">${dados.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === '' || v == null ? '<span class="vazio">—</span>' : esc(v)}</dd>`).join('')}</dl>
      </section>
      <section class="cartao secao"><header><h3>PDF, texto, fotos e mapas</h3></header>${BM.html(x, { pode })}</section>
      <section class="cartao secao"><header><h3>Bens ligados (terreno e prédios)</h3></header>
        ${bens.length ? `<ul class="lista-simples">${bens.map((b) => `<li><a href="#bem/${esc(b.id)}">${esc(b.plaqueta || b.codigo)} · ${esc(b.descricao)}</a>${b.conferenciaImportacao?.pendente ? ' <span class="ajuda">(a conferir)</span>' : ''}</li>`).join('')}</ul>` : '<p class="ajuda">Nenhum bem ligado a esta matrícula.</p>'}
      </section>`;
    return {
      titulo: `Matrícula ${x.matricula}`, html,
      ligar() {
        const area = document.getElementById('conteudo');
        BM.ligar(area);
        area.querySelector('[data-editar-mat]')?.addEventListener('click', () => ui.formulario({
          titulo: `Editar: Matrícula ${x.matricula}`, campos: CAD.matriculas.campos(), valores: x, largura: 'media',
          salvar: async (v) => { Object.assign(x, v); CAD.matriculas.antesDeSalvar(x); await VP.db.gravar('matriculas', x); ui.aviso('Salvo.'); VP.app.render(); }
        }));
      }
    };
  };

  T.unidade = (id) => {
    const un = VP.db.pega('unidades', id);
    if (!un) return { titulo: 'Unidade', html: '<p>Unidade não encontrada.</p>' };
    const bens = VP.db.lista('bens').filter((b) => b.unidadeId === id && b.status !== 'baixado');
    const total = bens.reduce((t, b) => t + VP.saldo(b).liquido, 0);
    const imoveis = bens.filter((b) => b.tipo === 'imovel');
    const porClasse = [...u.agruparSoma(bens, (b) => VP.grupoDe(b.classificacaoId)?.nome, (b) => VP.saldo(b).liquido)].map(([k, v]) => ({ rotulo: k || '—', valor: v })).sort((a, b) => b.valor - a.valor);
    const porEstado = Object.entries(L.estados).reverse().map(([k, n]) => ({ rotulo: n, valor: bens.filter((b) => String(b.estado) === k).length }));
    const custo = bens.reduce((t, b) => t + (VP.score(b)?.custo12m || 0), 0);
    return {
      titulo: un.nome,
      acoes: `<a class="botao" href="#cadastros/unidades">‹ Unidades</a> <a class="botao" href="#bens?unidade=${esc(id)}">Ver bens na lista</a>`,
      html: `<p class="ajuda">Visão completa da unidade: bens móveis, imóvel, responsáveis e custos. ${esc(un.logradouro || '')} ${un.bairro ? '· ' + esc(un.bairro) : ''}</p>
        <div class="resumo-linha">${G.numero('Bens', u.inteiro(bens.length))}${G.numero('Valor contábil', u.moedaCurta(total), u.moeda(total))}${G.numero('Responsável', VP.nome('responsaveis', un.responsavelId))}${G.numero('Manutenção nos últimos 12 meses', u.moedaCurta(custo))}</div>
        <div class="barra-acoes"><button class="botao" data-un="termo">Termo de responsabilidade</button><button class="botao" data-un="conferencia">Termo de conferência</button><button class="botao" data-un="etiquetas">Etiquetas</button></div>
        <div class="grade-graficos">
          <section class="cartao"><h3>Valor por grupo</h3>${G.barrasH(porClasse, { formato: u.moedaCurta })}</section>
          <section class="cartao"><h3>Estado de conservação</h3>${G.barrasH(porEstado, { mostrarZeros: true })}</section>
        </div>
        ${imoveis.length ? `<section class="cartao"><h3>Imóvel da unidade</h3><ul class="lista-simples">${imoveis.map((b) => `<li><a href="#bem/${esc(b.id)}">${esc(b.descricao)}</a> · ${esc(b.imovel?.situacaoRegistro || 'registro não informado')} · ${u.moeda(VP.saldo(b).liquido)}</li>`).join('')}</ul></section>` : ''}
        ${ui.tabela({ id: 'un-bens', linhas: bens, nomePlanilha: 'bens-' + un.codigo, aoClicar: (b) => VP.app.ir('#bem/' + b.id), colunas: [{ chave: 'codigo', titulo: 'Código', num: true }, { chave: 'descricao', titulo: 'Bem' }, { chave: 'loc', titulo: 'Local', valor: (b) => b.localizacao }, { chave: 'resp', titulo: 'Responsável', valor: (b) => VP.nome('responsaveis', b.responsavelId) }, { chave: 'estado', titulo: 'Estado', valor: (b) => L.estados[b.estado] }, { chave: 'status', titulo: 'Situação', html: VP.etiquetaStatus, valor: (b) => L.status[b.status] }, { chave: 'valor', titulo: 'Valor', num: true, soma: true, formato: u.moeda, valor: (b) => VP.saldo(b).liquido }] })}`,
      ligar() {
        ui.ligarTabela('un-bens');
        document.querySelectorAll('[data-un]').forEach((el) => el.addEventListener('click', () => {
          if (el.dataset.un === 'termo') VP.documentos.termoResponsabilidade(bens);
          else if (el.dataset.un === 'conferencia') VP.documentos.termoConferencia(bens, id);
          else { VP.estado.etiquetasIds = bens.map((b) => b.id); VP.app.ir('#relatorio/etiquetas'); }
        }));
      }
    };
  };

  // ---------------------------------------------------------------- configurações (todas as do concorrente, explicadas)
  const CONFIG_TELA = [
    { secao: 'Geral', itens: [
      ['obrigaContas', 'bool', 'Exigir conta contábil em todo bem', 'Não deixa incluir bem cuja classificação não tem conta.'],
      ['permiteBemCompraGlobal', 'bool', 'Permitir incluir bem a partir de empenho ou compra global', 'Libera a tela Itens a incorporar para compras globais.'],
      ['codigoLocalizacaoManual', 'bool', 'Informar o código das unidades à mão', 'Se desligado, o sistema sugere o próximo código.'],
      ['controleUsuarioPorUnidade', 'bool', 'Cada usuário vê só os bens das suas unidades', 'Vale quando houver login com servidor (ainda não nesta demonstração).'],
      ['descricaoCompletaUnidade', 'bool', 'Mostrar código + nome da unidade', 'Ex.: "02.001 · Escola Municipal Exemplo A".'],
      ['incorporaSoLiquidados', 'bool', 'Incorporar só itens com empenho liquidado', 'Itens não liquidados ficam esperando.'],
      ['filtroPorClassificacao', 'bool', 'Mostrar o filtro por classificação na lista de bens', ''],
      ['plaquetaAnteriorRelatorio', 'bool', 'Mostrar a plaqueta anterior nas listas e relatórios', ''],
      ['formaReavaliacao', 'select', 'Forma padrão de calcular a reavaliação', '', [['informado', 'Valor informado bem a bem'], ['percentual', 'Percentual sobre o valor atual']]],
      ['validaTransferenciaRetroativa', 'bool', 'Não aceitar transferência com data anterior à última movimentação', ''],
      ['avisarTransferencia', 'select', 'Aviso de transferência pendente', '', [['painel', 'Na central de pendências do painel'], ['nenhum', 'Não avisar']]],
      ['depreciacaoAnual', 'bool', 'Fechar a depreciação de uma vez por ano (em vez de mês a mês)', ''],
      ['depreciacaoAutomatica', 'select', 'Lançar a depreciação automaticamente', 'As regras (vida útil, valor residual, método) vêm da classificação de cada bem. "Ao gerar o balancete": antes de calcular, o sistema fecha os meses que faltam até o fim do período. Sempre dá para desfazer o último fechamento em Financeiro.', [['manual', 'Não: eu fecho o mês em Financeiro'], ['balancete', 'Sim, ao gerar o balancete'], ['abrir', 'Sim, ao abrir o sistema (meses já terminados)']]],
      ['tombamentoAutomatico', 'bool', 'Gerar número de tombamento e plaqueta automaticamente', ''],
      ['obrigaUnidade', 'bool', 'Exigir unidade em todo bem', ''],
      ['taxaPorEntidade', 'bool', 'Taxa de depreciação diferente por entidade', 'Guardado para a versão com servidor.']] },
    { secao: 'Integrações (por arquivo — o sistema é independente)', itens: [
      ['integraCompras', 'bool', 'Receber itens de compras por arquivo', 'Use “Importar planilha” em Entradas.'],
      ['integraContabilidade', 'bool', 'Gerar arquivo para a contabilidade', 'Financeiro → Para a contabilidade.'],
      ['importacaoItens', 'select', 'Importar itens a partir de', '', [['compra', 'Ordem de compra'], ['empenho', 'Empenho'], ['nota', 'Nota fiscal']]],
      ['integraArrecadacao', 'bool', 'Enviar valores de leilão/venda para a arrecadação', 'Guardado para a versão com servidor.'],
      ['extratoCidadaoStatus', 'select', 'No extrato público do cidadão, mostrar bens', '', [['todos', 'Todos'], ['ativos', 'Só em uso']]],
      ['doacaoFinanceiro', 'bool', 'Doação recebida gera movimento financeiro', '']] },
    { secao: 'Documentos', itens: [['termoDeBaixa', 'bool', 'Oferecer termo de baixa ao dar baixa', '']] },
    { secao: 'Bens', itens: [
      ['minhaResponsabilidadePadrao', 'bool', 'Abrir a lista de bens já filtrada em “minha responsabilidade”', ''],
      ['codigoManual', 'bool', 'Informar o código do bem à mão', 'Se desligado, o código é o próximo número livre.'],
      ['usaAparencia', 'bool', 'Mostrar foto do bem nas listas', ''],
      ['usuarioResponsavelId', 'select', 'Quem sou eu (para “minha responsabilidade”)', '', () => opc('responsaveis')]] },
    { secao: 'Unidades e transferências', itens: [
      ['movimentacaoPorUnidade', 'bool', 'Movimentar bens por unidade', ''],
      ['exigeAceiteTransferencia', 'bool', 'Transferência interna precisa de aceite de quem recebe', ''],
      ['unidadePatrimonio', 'select', 'Unidade do setor de patrimônio', '', () => opc('unidades')],
      ['unidadeSolicitacaoBaixa', 'select', 'Unidade que recebe pedidos de baixa', '', () => opc('unidades')],
      ['validaEntidadeOrgao', 'bool', 'Conferir se a unidade pertence à entidade do bem', '']] },
    { secao: 'Avisos', itens: [
      ['limiteControle', 'numero', 'Item de controle: valor até (R$)', 'Item de controle (sem plaqueta, fora do balancete) só quando o valor é até este limite E a vida útil é até o limite de meses abaixo. Passou de um dos dois: patrimônio com plaqueta. O sistema só sugere; a pessoa decide. Regra local.'],
      ['prazoTermoDias', 'numero', 'Termo de responsabilidade: prazo para devolver assinado (dias)', 'Quando alguém passa a ser responsável por bens, o sistema abre o termo com este prazo. Fica pendente até o termo assinado ser anexado.'],
      ['limiteControleMeses', 'numero', 'Item de controle: vida útil até (meses)', 'Padrão 24 meses (2 anos). A vida útil de cada item vem da lista em Cadastros → Vida útil dos itens.'],
      ['avisoSeguroDias', 'numero', 'Avisar vencimento de seguro com quantos dias de antecedência', ''],
      ['avisoSeguroIntervalo', 'numero', 'Repetir o aviso a cada quantos dias', ''],
      ['avisoGarantiaDias', 'numero', 'Avisar vencimento de garantia com quantos dias', ''],
      ['reavaliacaoAnos', 'numero', 'Avisar bens sem reavaliação há quantos anos', 'Política contábil do município (MCASP: anual para bens que variam muito; 3 a 5 anos para os demais).']] }
  ];
  T.configuracoes = () => {
    const cfg = VP.config();
    const campos = CONFIG_TELA.flatMap((s) => s.itens.map(([chave, tipo, rotulo, ajuda, opcoes]) => ({ chave, tipo, rotulo, ajuda, opcoes: typeof opcoes === 'function' ? opcoes() : opcoes, vazio: tipo === 'select' && typeof opcoes === 'function' ? '—' : false })));
    return {
      titulo: 'Configurações',
      acoes: '<button class="botao primario" data-salvar-cfg>Salvar</button>',
      html: `<form id="form-cfg">${CONFIG_TELA.map((s) => `<section class="cartao"><h3>${esc(s.secao)}</h3>${ui.campos(campos.filter((c) => s.itens.some((i) => i[0] === c.chave)), cfg)}</section>`).join('')}</form>
        <section class="cartao"><h3>Cópia de segurança</h3>${VP.servidor.ativo ? '<p class="ajuda">Os dados ficam guardados no servidor da prefeitura, com histórico de cada alteração. Você pode baixar uma cópia completa para guardar.</p><div class="linha-botoes"><button class="botao" data-backup>Baixar cópia completa</button></div>' : `<p class="ajuda">Os dados desta demonstração ficam neste navegador. Baixe uma cópia completa para guardar ou levar para outro computador.</p>
          <div class="linha-botoes"><button class="botao" data-backup>Baixar cópia completa</button><label class="botao">Restaurar cópia<input type="file" accept=".json" data-restaurar hidden></label><button class="botao perigo" data-reset>Voltar aos dados de exemplo</button></div>`}</section>`,
      ligar() {
        document.querySelector('[data-salvar-cfg]').addEventListener('click', async () => {
          const { valores } = ui.lerCampos(document.getElementById('form-cfg'), campos);
          await VP.salvarConfig(Object.assign({}, cfg, valores));
          ui.aviso('Configurações salvas.');
        });
        document.querySelector('[data-backup]').addEventListener('click', () => {
          const dump = { sistema: 'VitalPat Patrimônio', versao: 1, geradoEm: VP.Plataforma.agoraISO(), dados: Object.fromEntries(VP.COLECOES.map((c) => [c, VP.db.lista(c, true)])) };
          ui.baixar(`vitalpat-patrimonio-copia-${VP.Plataforma.hoje()}.json`, JSON.stringify(dump), 'application/json');
        });
        document.querySelector('[data-restaurar]')?.addEventListener('change', async (e) => {
          try {
            const dump = JSON.parse(await e.target.files[0].text());
            if (dump.sistema !== 'VitalPat Patrimônio') return ui.aviso('Este arquivo não é uma cópia do VitalPat Patrimônio.', 'erro');
            if (!await ui.confirmar('Substituir todos os dados deste navegador pela cópia? (Baixe uma cópia atual antes, se quiser guardar.)', { sim: 'Restaurar', classe: 'perigo' })) return;
            await VP.db.limparTudo();
            const mapa = {};
            for (const c of VP.COLECOES) if (dump.dados[c]) mapa[c] = dump.dados[c];
            await VP.db.gravarVarias(mapa);
            VP.invalidarIndice();
            ui.aviso('Cópia restaurada.'); VP.app.ir('#painel');
          } catch (_) { ui.aviso('Não foi possível ler a cópia.', 'erro'); }
        });
        document.querySelector('[data-reset]')?.addEventListener('click', async () => {
          if (!await ui.confirmar('Apagar os dados deste navegador e voltar aos dados de exemplo (fictícios)?', { sim: 'Voltar aos dados de exemplo', classe: 'perigo' })) return;
          await VP.db.limparTudo(); await VP.criarDadosExemplo(); ui.aviso('Dados de exemplo restaurados.'); VP.app.ir('#painel');
        });
      }
    };
  };

  // ---------------------------------------------------------------- lixeira
  T.lixeira = () => {
    const itens = [];
    for (const c of ['bens', 'bensControle', 'lotesBaixa'].concat(Object.keys(CAD), Object.keys(VP.frota?.COLECOES || {}))) for (const x of VP.db.lista(c, true).filter((d) => d.excluido)) itens.push({ id: c + '|' + x.id, col: c, x });
    return {
      titulo: 'Lixeira',
      html: `<p class="ajuda">Nada é apagado de verdade. O que foi excluído fica aqui e pode voltar.</p>${ui.tabela({ id: 'lixeira', linhas: itens, nomePlanilha: 'lixeira', vazio: 'A Lixeira está vazia.', colunas: [
        { chave: 'tipo', titulo: 'O que é', valor: (i) => (i.col === 'bens' ? 'Bem' : i.col === 'bensControle' ? 'Item de controle' : i.col === 'lotesBaixa' ? 'Lote de baixa' : CAD[i.col] ? CAD[i.col].titulo.split(' (')[0] : VP.frota.COLECOES[i.col]) },
        { chave: 'nome', titulo: 'Nome', valor: (i) => (i.col === 'bens' || i.col === 'bensControle' ? `${i.x.codigo} · ${i.x.descricao}` : i.col === 'lotesBaixa' ? `${i.x.numero} · ${i.x.descricao}` : i.x.nome || i.x.codigo || i.x.placa || i.x.numero || i.x.item || i.x.tipo || i.x.descricao || u.data(i.x.data || i.x.saida)) },
        { chave: 'quando', titulo: 'Excluído em', valor: (i) => u.data(i.x.excluidoEm) },
        { chave: 'acao', titulo: '', html: (i) => `<button class="botao pequeno" data-restaurar-item="${esc(i.id)}">Restaurar</button>` }] })}`,
      ligar() {
        ui.ligarTabela('lixeira');
        document.getElementById('conteudo').onclick = async (e) => { // onclick: não acumula a cada visita
          const r = e.target.closest('[data-restaurar-item]'); if (!r) return;
          const [col, id] = r.dataset.restaurarItem.split('|');
          const x = VP.db.pega(col, id);
          delete x.excluido; delete x.excluidoEm;
          await VP.db.gravar(col, x);
          if (col === 'bens') await VP.db.gravar('eventos', VP.novoEvento(x.id, 'alteracao', { descricao: 'Restaurado da Lixeira' }));
          ui.aviso('Restaurado.'); VP.app.render();
        };
      }
    };
  };
})();
