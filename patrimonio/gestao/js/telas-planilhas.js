/* VitalPat Patrimônio · Gestão — Exportar e importar (planilhas do Excel) e anexos em lote.
   Exportar: bens em .xlsx com escolha de colunas, filtros e "uma aba por unidade". As colunas são as mesmas do modelo
   de importação, então a planilha exportada pode ser corrigida e importada de volta.
   Importar: modelo .xlsx → De/Para das colunas → prévia (novo, igual, alterado, erro) → aplicar o que foi marcado →
   tela de resultado → desfazer. O bem é achado pela plaqueta; o valor anterior vai para o histórico do bem. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, L = VP.LISTAS;
  const T = VP.telas;
  const P = VP.planilhas = {};
  const hoje = () => VP.Plataforma.hoje();
  const pega = (o, c) => c.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const poe = (o, c, v) => { const ks = c.split('.'); let x = o; for (const k of ks.slice(0, -1)) { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; } x[ks.at(-1)] = v; };
  const pode = () => !VP.servidor?.ativo || VP.servidor.podeAlterar();

  // ------------------------------------------------------------------ conjuntos de bens (abas do modelo)
  P.CONJUNTOS = {
    movel: { nome: 'Bens móveis', tipos: ['movel', 'intangivel'], tipoPadrao: 'movel' },
    veiculo: { nome: 'Veículos', tipos: ['veiculo'], tipoPadrao: 'veiculo' },
    imovel: { nome: 'Imóveis', tipos: ['imovel', 'infraestrutura'], tipoPadrao: 'imovel' }
  };
  P.conjuntoDaAba = (nome) => { const cad = VP.importaCadastros?.cjDaAba(nome); if (cad) return cad; const n = u.normalizar(nome); return /centros? de custo|^unidades$/.test(n) ? 'unidades' : /veic/.test(n) ? 'veiculo' : /imov|terreno|predio/.test(n) ? 'imovel' : /controle/.test(n) ? 'controle' : /movel|moveis|bens/.test(n) ? 'movel' : null; };

  // ------------------------------------------------------------------ referências (unidade, classificação…) por nome ou código
  const norm = (t) => u.normalizar(t).replace(/\s+/g, ' ');
  const REFS = {
    unidades: { titulo: 'Unidade', achar: (t) => VP.db.lista('unidades').find((x) => norm(x.nome) === norm(t) || norm(x.codigo) === norm(t) || norm(`${x.codigo} · ${x.nome}`) === norm(t)), mostrar: (x) => x.nome },
    responsaveis: { titulo: 'Responsável', achar: (t) => VP.db.lista('responsaveis').find((x) => norm(x.nome) === norm(t) || (x.matricula && norm(x.matricula) === norm(t))), mostrar: (x) => x.nome },
    fornecedores: { titulo: 'Fornecedor', achar: (t) => { const d = String(t).replace(/\D/g, ''); return VP.db.lista('fornecedores').find((x) => norm(x.nome) === norm(t) || (d.length >= 11 && String(x.cnpj || x.documento || '').replace(/\D/g, '') === d)); }, mostrar: (x) => x.nome },
    classificacoes: { titulo: 'Classificação', achar: (t) => { const n = norm(t); return VP.db.lista('classificacoes').find((c) => norm(VP.caminhoClassificacao(c)) === n) || VP.db.lista('classificacoes').find((c) => norm(c.nome) === n) || VP.db.lista('classificacoes').find((c) => norm(c.codigo) === n); }, mostrar: (x) => VP.caminhoClassificacao(x) }
  };

  // ------------------------------------------------------------------ colunas (campos) da planilha de bens
  // tipo: texto | numero | moeda | data | ref | estado | opcao | bool ; g: conjuntos onde aparece ; obrig: obrigatório para bem novo ;
  // trava: motivo de não alterar bem que já existe (vai por outra tela, para ficar registrado)
  const TODOS = ['movel', 'veiculo', 'imovel'];
  P.CAMPOS = [
    { k: 'plaqueta', t: 'Plaqueta', tipo: 'texto', g: TODOS, apelidos: ['codigo', 'tombamento', 'numero do bem', 'patrimonio', 'n patrimonio'], ajuda: 'Número da plaquinha. Se o bem já existe, ele é achado por aqui e atualizado. Vazio = bem novo com plaqueta automática.' },
    { k: 'descricao', t: 'Descrição', tipo: 'texto', g: TODOS, obrig: true, apelidos: ['nome', 'nome do bem', 'descricao do bem', 'bem'], ajuda: 'Nome do bem. Ex.: Cadeira giratória.' },
    { k: 'complemento', t: 'Complemento', tipo: 'texto', g: TODOS, apelidos: ['descricao completa', 'especificacao completa'], ajuda: 'Descrição longa (opcional).' },
    { k: 'classificacaoId', t: 'Classificação', tipo: 'ref', ref: 'classificacoes', g: TODOS, padraoArquivo: true, apelidos: ['classificacao', 'classe', 'grupo do bem'], trava: 'a classificação muda pela ficha do bem', ajuda: 'Nome da classificação como está na aba Listas.' },
    { k: 'unidadeId', t: 'Unidade', tipo: 'ref', ref: 'unidades', g: TODOS, apelidos: ['centro de custo classificacao', 'centro de custo', 'centro de custos', 'local', 'setor', 'lotacao', 'localizacao do bem'], obrigCfg: 'obrigaUnidade', trava: 'para mudar de unidade use Transferência (gera termo)', ajuda: 'Nome ou código da unidade (aba Listas).' },
    { k: 'localizacao', t: 'Local na unidade', tipo: 'texto', g: TODOS, ajuda: 'Ex.: Sala 12.' },
    { k: 'responsavelId', t: 'Responsável', tipo: 'ref', ref: 'responsaveis', g: TODOS, ajuda: 'Nome ou matrícula (aba Listas). Vazio = responsável da unidade.' },
    { k: 'dataAquisicao', t: 'Data de aquisição', tipo: 'data', g: TODOS, obrig: true, apelidos: ['aquisicao', 'data aquisicao', 'data da compra', 'data de compra'], trava: 'a data de aquisição não muda depois de incluída', ajuda: 'dd/mm/aaaa.' },
    { k: 'valor', t: 'Valor de aquisição', tipo: 'moeda', g: TODOS, obrigOu: '_valorContabil', apelidos: ['valor de compra', 'valor aquisicao', 'valor original'], trava: 'o valor só muda por reavaliação, melhoria ou baixa', ler: (b) => VP.eventosDoBem(b.id).find((e) => e.tipo === 'incorporacao')?.valor ?? b.origem?.valorUnitario ?? '', ajuda: 'Em reais. Ex.: 1250,90.' },
    { k: '_valorContabil', t: 'Valor contábil (bem já depreciado)', tipo: 'moeda', g: TODOS, naoExporta: true, apelidos: ['valor contabil', 'valor atual', 'valor liquido', 'saldo'], trava: 'o valor só muda por reavaliação, melhoria ou baixa', ler: () => '', ajuda: 'Para bens vindos de outro sistema ou transferidos: o bem entra com este valor (já depreciado), como "Saldo inicial", e a depreciação segue a partir do mês seguinte. Use esta coluna OU o Valor de aquisição.' },
    { k: '_dataInicioDep', t: 'Data início depreciação (sistema anterior)', tipo: 'data', g: TODOS, naoExporta: true, naoModelo: true, apelidos: ['data inicio depreciacao', 'inicio depreciacao', 'inicio da depreciacao'], soNovo: true, ajuda: 'Só fica registrada no histórico do bem.' },
    { k: '_tipo', t: 'Tipo do bem', tipo: 'tipoBem', g: TODOS, naoExporta: true, naoModelo: true, apelidos: ['tipo', 'tipo de bem', 'tipo do bem'], soNovo: true, ajuda: 'Bens Móveis, Bens Imóveis, Veículo ou Bens de Domínio Público. Se vier preenchido, vale para a linha (o arquivo pode misturar tipos).' },
    { k: 'status', t: 'Situação', tipo: 'status', g: TODOS, naoExporta: true, naoModelo: true, apelidos: ['status', 'situacao do bem'], soNovo: true, ajuda: 'Disponível / Em uso, Cedido, Em desuso, Manutenção.' },
    { k: 'detalhes.caracteristicas', t: 'Características', tipo: 'texto', g: TODOS, apelidos: ['caracteristicas', 'especificacao', 'especificacoes'], ajuda: 'Texto livre; vai junto com o complemento do bem.' },
    { k: 'estado', t: 'Estado', tipo: 'estado', g: TODOS, ajuda: 'Novo, Ótimo, Muito bom, Bom, Regular, Ruim, Péssimo ou Imprestável (ou 8 a 1). "Inservível" vira a situação do bem.' },
    { k: 'situacaoAquisicao', t: 'Como entrou', tipo: 'opcao', opcoes: () => L.situacoesAquisicao, g: TODOS, soNovo: true, ajuda: 'Compra, Doação recebida… (aba Listas). Vazio = Compra.' },
    { k: 'fornecedorId', t: 'Fornecedor', tipo: 'ref', ref: 'fornecedores', g: TODOS, ajuda: 'Nome ou CNPJ do fornecedor já cadastrado.' },
    { k: 'nf.numero', t: 'Nota fiscal', tipo: 'texto', g: TODOS },
    { k: 'nf.emissao', t: 'Emissão da nota', tipo: 'data', g: TODOS, ajuda: 'dd/mm/aaaa.' },
    { k: 'origem.empenho', t: 'Empenho', tipo: 'texto', g: TODOS, ajuda: 'Ano/número.' },
    { k: 'detalhes.marca', t: 'Marca', tipo: 'texto', g: ['movel', 'veiculo'] },
    { k: 'detalhes.modelo', t: 'Modelo', tipo: 'texto', g: ['movel', 'veiculo'] },
    { k: 'detalhes.serie', t: 'Número de série', tipo: 'texto', g: ['movel'] },
    { k: 'veiculo.placa', t: 'Placa', tipo: 'texto', g: ['veiculo'], ajuda: 'Ex.: ABC1D23.' },
    { k: 'veiculo.renavam', t: 'RENAVAM', tipo: 'texto', g: ['veiculo'] },
    { k: 'veiculo.chassi', t: 'Chassi', tipo: 'texto', g: ['veiculo'] },
    { k: 'veiculo.combustivel', t: 'Combustível', tipo: 'opcao', opcoes: () => ['Gasolina', 'Etanol', 'Flex', 'Diesel', 'Elétrico', 'GNV'], g: ['veiculo'] },
    { k: 'veiculo.anoModelo', t: 'Ano/modelo', tipo: 'texto', g: ['veiculo'], ajuda: 'Ex.: 2022/2023.' },
    { k: 'imovel.matricula', t: 'Matrícula', tipo: 'texto', g: ['imovel'] },
    { k: 'imovel.cartorio', t: 'Cartório', tipo: 'texto', g: ['imovel'] },
    { k: 'imovel.situacaoRegistro', t: 'Situação do registro', tipo: 'opcao', opcoes: () => ['Registrado', 'Em regularização', 'Sem registro', 'Posse'], g: ['imovel'] },
    { k: 'imovel.motivoPendencia', t: 'O que impede o registro', tipo: 'texto', g: ['imovel'] },
    { k: 'imovel.uso', t: 'Classificação de uso', tipo: 'opcao', opcoes: () => ['Uso comum do povo', 'Uso especial', 'Dominical'], g: ['imovel'] },
    { k: 'imovel.afetado', t: 'Afetado', tipo: 'bool', g: ['imovel'], ajuda: 'Sim ou Não.' },
    { k: 'imovel.inscricaoIptu', t: 'Inscrição imobiliária (IPTU)', tipo: 'texto', g: ['imovel'] },
    { k: 'imovel.areaTerreno', t: 'Área do terreno (m²)', tipo: 'numero', g: ['imovel'] },
    { k: 'imovel.areaConstruida', t: 'Área construída (m²)', tipo: 'numero', g: ['imovel'] },
    { k: 'imovel.valorTerreno', t: 'Valor do terreno', tipo: 'moeda', g: ['imovel'] },
    { k: 'endereco.logradouro', t: 'Endereço', tipo: 'texto', g: ['imovel'] },
    { k: 'endereco.bairro', t: 'Bairro', tipo: 'texto', g: ['imovel'] },
    { k: 'endereco.cidade', t: 'Cidade', tipo: 'texto', g: ['imovel'] },
    { k: 'imovel.lat', t: 'Latitude', tipo: 'numero', g: ['imovel'], ajuda: 'Ex.: -27,2140 (copie do Google Maps).' },
    { k: 'imovel.lon', t: 'Longitude', tipo: 'numero', g: ['imovel'], ajuda: 'Ex.: -49,6430.' }
  ];
  // só na exportação (não são importados)
  P.EXTRAS = [
    { k: '_codigo', t: 'Código', ler: (b) => b.codigo },
    { k: '_tipo', t: 'Tipo', ler: (b) => L.tiposBem[b.tipo] || b.tipo },
    { k: '_status', t: 'Situação', ler: (b) => ({ ativo: 'Ativo', baixado: 'Baixado', manutencao: 'Em manutenção', desuso: 'Em desuso' }[b.status] || b.status) },
    { k: '_liquido', t: 'Valor contábil atual', ler: (b) => Math.round(VP.saldo(b).liquido * 100) / 100 },
    { k: '_fotos', t: 'Fotos e anexos', ler: (b) => (b.fotos || []).length + (b.anexos || []).filter((a) => !a.excluido).length }
  ];
  P.camposDe = (cj) => P.CAMPOS.filter((c) => c.g.includes(cj));
  const camposModelo = (cj) => P.camposDe(cj).filter((c) => !c.naoModelo);
  const obrigatorio = (c) => c.obrig || (c.obrigCfg && VP.config()[c.obrigCfg]); // classificação: se faltar, vale a padrão do arquivo; valor: aquisição OU contábil

  // valor do bem → texto/número para a planilha
  P.lerCampo = (b, c) => {
    if (c.ler) return c.ler(b);
    const v = pega(b, c.k);
    if (v == null || v === '') return '';
    if (c.tipo === 'ref') { const x = VP.db.pega(c.ref, v); return x ? REFS[c.ref].mostrar(x) : ''; }
    if (c.tipo === 'data') return u.data(v);
    if (c.tipo === 'estado') return L.estados[v] || v;
    if (c.tipo === 'bool') return v ? 'Sim' : 'Não';
    return v;
  };

  // célula da planilha → valor do sistema ({ v } ou { erro })
  const serialParaISO = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000); return d.toISOString().slice(0, 10); };
  // confere dia e mês de verdade (31/02 não existe; o navegador sozinho "rolaria" para março)
  const dataValida = (a, m, d) => { const dt = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d))); return dt.getUTCFullYear() === Number(a) && dt.getUTCMonth() === Number(m) - 1 && dt.getUTCDate() === Number(d) ? dt.toISOString().slice(0, 10) : null; };
  P.lerData = (x) => {
    if (typeof x === 'number' && x > 20000 && x < 80000) return serialParaISO(x);
    const s = String(x).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (m) { const a = m[3].length === 2 ? (Number(m[3]) > 50 ? '19' : '20') + m[3] : m[3]; return dataValida(a, m[2], m[1]); }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return dataValida(m[1], m[2], m[3]);
    return null;
  };
  P.converter = (c, bruto) => {
    if (bruto == null || String(bruto).trim() === '') return { vazio: true };
    const s = String(bruto).trim();
    switch (c.tipo) {
      case 'numero': case 'moeda': {
        const n = typeof bruto === 'number' ? bruto : u.num(s.replace(/^R\$\s*/i, ''));
        return n == null ? { erro: `"${s}" não é um número` } : { v: n };
      }
      case 'data': { const d = P.lerData(bruto); return d ? { v: d } : { erro: `"${s}" não é uma data (use dd/mm/aaaa)` }; }
      case 'estado': {
        const n = Number(s); if (L.estados[n]) return { v: n };
        const k = Object.entries(L.estados).find(([, nome]) => norm(nome) === norm(s));
        // "Inservível" não é estado: é situação do bem (pode ser alienado ou transferido). O estado fica em branco.
        if (/^inserv/.test(norm(s))) return { vazio: true, situacao: 'inservivel', aviso: '"Inservível" virou a situação do bem (disponível para leilão, doação ou transferência)' };
        if (/^(otimo|excelente)$/.test(norm(s))) return { v: 7 };
        return k ? { v: Number(k[0]) } : { erro: `estado "${s}" não existe (use ${Object.values(L.estados).join(', ')})` };
      }
      case 'tipoBem': { const n = norm(s); const r = /veic/.test(n) ? 'veiculo' : /dominio|infra/.test(n) ? 'infraestrutura' : /imove/.test(n) ? 'imovel' : /intang|software|licen/.test(n) ? 'intangivel' : /move/.test(n) ? 'movel' : null; return r ? { v: r } : { erro: `tipo "${s}" não reconhecido (use Bens Móveis, Bens Imóveis, Veículo ou Bens de Domínio Público)` }; }
      case 'status': { const n = norm(s); const r = /dispon|uso|ativ|orcament/.test(n) && !/desuso/.test(n) ? 'ativo' : /desuso/.test(n) ? 'desuso' : /cedid/.test(n) ? 'cedido' : /manut|consert/.test(n) ? 'manutencao' : /inserv/.test(n) ? 'inservivel' : /baix/.test(n) ? 'baixado' : null; return r ? (r === 'baixado' ? { erro: 'bem baixado no sistema anterior: não entra (baixa é registrada pela tela de Baixa)' } : { v: r }) : { erro: `situação "${s}" não reconhecida` }; }
      case 'bool': return /^(s|sim|x|1|true|verdadeiro)$/i.test(s) ? { v: true } : /^(n|nao|não|0|false|falso)$/i.test(s) ? { v: false } : { erro: `"${s}": use Sim ou Não` };
      case 'opcao': { const o = c.opcoes().find((x) => norm(x) === norm(s)); return o ? { v: o } : { erro: `"${s}" não está na lista (${c.opcoes().join(', ')})` }; }
      case 'ref': {
        const ck = c.ref + '|' + norm(s);
        if (P.cacheRef && P.cacheRef.has(ck)) return P.cacheRef.get(ck);
        const x = REFS[c.ref].achar(s);
        // cadastro novo que vem na mesma planilha (aba de cadastros ou de unidades): liga ao gravar
        const novoNaPlanilha = !x && VP.importaCadastros ? VP.importaCadastros.achar(c.ref, s, P.pendCad) : null;
        // centro de custo (unidade) por código que ainda não existe: vira unidade nova, criada na importação
        const r = x ? { v: x.id } : novoNaPlanilha ? { v: novoNaPlanilha } : c.ref === 'unidades' && /^\d[\d.\-/]*$/.test(s) ? { v: '__nova:' + s, novaUnidade: s } : null;
        if (r) { P.cacheRef?.set(ck, r); return r; }
        return { erro: `${REFS[c.ref].titulo.toLowerCase()} "${s}" não existe no cadastro (veja a aba Listas do modelo)` };
      }
      default: return { v: typeof bruto === 'number' ? String(bruto) : s };
    }
  };

  // ================================================================== MODELO PARA IMPORTAÇÃO
  P.baixarModelo = () => {
    const un = VP.db.lista('unidades')[0], cl = (t) => VP.db.lista('classificacoes').find((c) => P.CONJUNTOS[t].tipos.includes(VP.dadosDaClassificacao(c.id).tipoBem || 'movel') && c.nivel !== 'grupo');
    const exemplo = (cj) => {
      const ex = { plaqueta: '', descricao: 'EXEMPLO — apague esta linha', classificacaoId: cl(cj) ? VP.caminhoClassificacao(cl(cj)) : '', unidadeId: un?.nome || '', dataAquisicao: '15/03/2024', valor: 1250.9, estado: 'Novo', situacaoAquisicao: 'Compra', 'veiculo.placa': 'ABC1D23', 'veiculo.combustivel': 'Flex', 'veiculo.anoModelo': '2023/2024', 'imovel.situacaoRegistro': 'Registrado', 'imovel.uso': 'Uso especial', 'imovel.afetado': 'Sim' };
      return camposModelo(cj).map((c) => ex[c.k] ?? '');
    };
    const abas = Object.entries(P.CONJUNTOS).map(([cj, x]) => ({ nome: x.nome, cabecalho: camposModelo(cj).map((c) => c.t), linhas: [exemplo(cj)] }));
    if (VP.controle) abas.push(VP.controle.abaModelo());
    const instr = [
      ['Como usar este modelo', ''],
      ['1', 'Preencha uma linha por bem, na aba do tipo certo (Bens móveis, Veículos, Imóveis' + (VP.controle ? ', Itens de controle' : '') + '). Não mude os títulos da primeira linha.'],
      ['2', 'Apague as linhas de EXEMPLO (o sistema recusa linha que começa com "EXEMPLO").'],
      ['3', 'Bem que já existe no sistema: informe a Plaqueta. Só as colunas preenchidas são atualizadas; célula vazia não apaga nada. O valor anterior fica no histórico do bem.'],
      ['4', 'Não mudam pela planilha (para ficar registrado): valor (use Reavaliação), unidade (use Transferência), data de aquisição e classificação.'],
      ['5', 'Nomes de unidades, classificações, responsáveis e fornecedores devem ser iguais aos da aba Listas.'],
      ['6', 'Datas: dd/mm/aaaa. Valores: número, com vírgula nos centavos (1250,90).'],
      ['7', 'No sistema: Exportar e importar → Importar → escolha o arquivo → confira a prévia → Importar o que está marcado. Dá para desfazer depois.'],
      ['', ''], ['Coluna', 'O que colocar']
    ];
    const vistos = new Set();
    for (const cj of Object.keys(P.CONJUNTOS)) for (const c of camposModelo(cj)) if (!vistos.has(c.k)) { vistos.add(c.k); instr.push([c.t + (obrigatorio(c) ? ' (obrigatória para bem novo)' : ''), [c.ajuda || '', c.trava ? `Não muda em bem que já existe: ${c.trava}.` : '', c.soNovo ? 'Só vale para bem novo.' : ''].filter(Boolean).join(' ')]); }
    if (VP.controle) instr.push(['', ''], ...VP.controle.instrucoes());
    const listas = {
      Unidades: VP.db.lista('unidades').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => x.nome),
      'Classificações': VP.db.lista('classificacoes').map((c) => VP.caminhoClassificacao(c)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      'Responsáveis': VP.db.lista('responsaveis').map((x) => x.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      Fornecedores: VP.db.lista('fornecedores').map((x) => x.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      Estados: Object.values(L.estados),
      'Como entrou': L.situacoesAquisicao,
      'Situação do registro': ['Registrado', 'Em regularização', 'Sem registro', 'Posse'],
      'Classificação de uso': ['Uso comum do povo', 'Uso especial', 'Dominical'],
      'Combustível': ['Gasolina', 'Etanol', 'Flex', 'Diesel', 'Elétrico', 'GNV']
    };
    const cols = Object.keys(listas), max = Math.max(...Object.values(listas).map((l) => l.length));
    abas.push({ nome: 'Instruções', cabecalho: ['Item', 'Explicação'], linhas: instr, larguras: [34, 110], quebrar: true });
    abas.push({ nome: 'Listas', cabecalho: cols, linhas: Array.from({ length: max }, (_, i) => cols.map((c) => listas[c][i] ?? '')) });
    VP.baixarXLSX('modelo-importacao-bens', abas);
  };

  // ================================================================== EXPORTAR
  const filtrar = (cj, f) => {
    let l = VP.db.lista('bens').filter((b) => P.CONJUNTOS[cj].tipos.includes(b.tipo));
    if (f.unidadeId) l = l.filter((b) => b.unidadeId === f.unidadeId);
    if (f.status === 'ativos') l = l.filter((b) => b.status !== 'baixado'); else if (f.status === 'baixados') l = l.filter((b) => b.status === 'baixado');
    if (f.local) l = l.filter((b) => u.normalizar(b.localizacao).includes(u.normalizar(f.local)));
    if (f.grupoId) l = l.filter((b) => VP.grupoDe(b.classificacaoId)?.id === f.grupoId);
    return l.sort((a, b) => (a.codigo || 0) - (b.codigo || 0));
  };
  P.colunasExportar = (cj) => P.camposDe(cj).filter((c) => !c.naoExporta).concat(P.EXTRAS);
  P.exportarBens = (cj, f, chaves, porUnidade) => {
    const cols = P.colunasExportar(cj).filter((c) => chaves.includes(c.k));
    const bens = filtrar(cj, f);
    const linha = (b) => cols.map((c) => P.lerCampo(b, c));
    const cab = cols.map((c) => c.t);
    let abas;
    if (porUnidade) {
      const grupos = new Map();
      for (const b of bens) { const k = b.unidadeId || ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(b); }
      abas = [...grupos.entries()].sort((a, b) => VP.nome('unidades', a[0]).localeCompare(VP.nome('unidades', b[0]), 'pt-BR')).map(([id, l]) => ({ nome: id ? VP.nome('unidades', id) : 'Sem unidade', cabecalho: cab, linhas: l.map(linha) }));
      if (!abas.length) abas = [{ nome: P.CONJUNTOS[cj].nome, cabecalho: cab, linhas: [] }];
    } else abas = [{ nome: P.CONJUNTOS[cj].nome, cabecalho: cab, linhas: bens.map(linha) }];
    VP.baixarXLSX(u.normalizar(P.CONJUNTOS[cj].nome).replace(/\s+/g, '-'), abas);
    return bens.length;
  };
  // Outras listas do sistema (cada uma tem o botão "Baixar planilha" na própria tela)
  P.OUTRAS = [
    ['Bens', [['#bens/moveis', 'Bens móveis'], ['#bens/imoveis', 'Bens imóveis'], ['#cadastros/unidades', 'Bens de uma unidade (abra a unidade)'], ['#entradas', 'Entradas (itens a incorporar)'], ['#transferencias', 'Transferências'], ['#historico', 'Histórico de movimentações']]],
    ['Financeiro', [['#financeiro/melhorias', 'Melhorias'], ['#financeiro/baixas', 'Baixas'], ['#financeiro/reavaliacao', 'Reavaliações (blocos)'], ['#financeiro/contabilidade', 'Arquivos para a contabilidade'], ['#relatorios', 'Todos os relatórios (balancete, depreciação, inventário…)']]],
    ['Inventário', [['#inventario', 'Inventários feitos e andamento por unidade']]],
    ['Imóveis', [['#imoveis/demonstrativo', 'Demonstrativo (TCE/SC)'], ['#imoveis/documentos', 'Documentos'], ['#imoveis/cessoes', 'Cessões'], ['#imoveis/pendencias', 'Pendências']]],
    ['Frota', [['#frota/veiculos', 'Veículos'], ['#frota/abastecimentos', 'Abastecimentos'], ['#frota/viagens', 'Viagens'], ['#frota/contratos', 'Contratos, conferência e paradas'], ['#frota/motoristas', 'Motoristas'], ['#frota/manutencao', 'Manutenção'], ['#frota/multas', 'Multas'], ['#frota/documentos', 'Documentos'], ['#frota/pneus', 'Pneus'], ['#frota/reservas', 'Reservas'], ['#frota/cartao', 'Cartão-combustível (arquivos importados)']]],
    ['Manutenção', [['#manutencao/chamados', 'Chamados'], ['#manutencao/preventiva', 'Preventiva'], ['#manutencao/vistorias', 'Vistorias'], ['#manutencao/equipes', 'Equipes'], ['#manutencao', 'Custo por unidade (painel)']]],
    ['Cadastros e outros', [['#cadastros/unidades', 'Todos os cadastros (uma aba para cada)'], ['#lixeira', 'Lixeira']]]
  ];

  // ================================================================== IMPORTAR: ler arquivo, De/Para, prévia
  const st = () => (VP.estado.impBens = VP.estado.impBens || { abas: null, previa: null });
  const limpa = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const ehCad = (cj) => !!VP.importaCadastros?.ehCadastro(cj);
  const camposImp = (cj) => (ehCad(cj) ? VP.importaCadastros.campos(cj) : cj === 'controle' && VP.controle ? VP.controle.CAMPOS : cj === 'unidades' && VP.importaUnidades ? VP.importaUnidades.CAMPOS : P.camposDe(cj));
  // Liga cada coluna do arquivo a um campo: primeiro pelo título exato, depois pelos apelidos (ex.: "Código" do sistema antigo = plaqueta).
  // Cada campo é usado uma vez só: se o arquivo tem "Plaqueta", a coluna "Código" não vira plaqueta.
  const sugerirMapa = (cab, cj) => {
    const campos = camposImp(cj), usados = new Set(), mapa = cab.map(() => '');
    cab.forEach((t, i) => { const c = campos.find((x) => limpa(x.t) === limpa(t)); if (c && !usados.has(c.k)) { mapa[i] = c.k; usados.add(c.k); } });
    cab.forEach((t, i) => { if (mapa[i] || !limpa(t)) return; const c = campos.find((x) => !usados.has(x.k) && (x.apelidos || []).includes(limpa(t))); if (c) { mapa[i] = c.k; usados.add(c.k); } });
    return mapa;
  };
  const reconhecidos = (linha, cj) => { const cs = camposImp(cj); return linha.filter((t) => { const n = limpa(t); return n && cs.some((c) => limpa(c.t) === n || (c.apelidos || []).includes(n)); }).length; };
  P.lerArquivo = async (arquivo) => {
    const abas = await VP.lerArquivoPlanilha(arquivo);
    const s = st();
    s.arquivo = arquivo.name; s.previa = null; s.filtro = '';
    const modelos = ui.pref.ler('depara-bens', {});
    s.abas = abas.filter((a) => !/^(instru|listas)/.test(norm(a.nome))).map((a) => {
      const todas = a.linhas.filter((l) => l.some((x) => x !== '' && x != null));
      let cj = P.conjuntoDaAba(a.nome) || 'movel';
      // relatórios trazem linhas de título antes do cabeçalho: o cabeçalho é a 1ª linha (entre as 15 primeiras) com 2 ou mais títulos conhecidos
      let h = todas.slice(0, 15).findIndex((l) => reconhecidos(l, cj) >= 2);
      // arquivo só com código e nome de centro de custo ("Classificação" + "Descrição", sem colunas de bem): é lista de unidades
      if (cj === 'movel' && VP.importaUnidades) {
        const hu = todas.slice(0, 15).findIndex((l) => reconhecidos(l, 'unidades') >= 2);
        const soDeBem = (l) => l.filter((t) => { const n = limpa(t); return n && P.camposDe('movel').some((c) => !['classificacaoId', 'descricao', 'unidadeId'].includes(c.k) && (limpa(c.t) === n || (c.apelidos || []).includes(n))); }).length;
        if (hu >= 0 && !soDeBem(todas[hu])) { cj = 'unidades'; h = hu; }
      }
      if (h < 0) h = 0;
      const cab = (todas[h] || []).map((x) => String(x ?? '').trim());
      const salvo = modelos[cj];
      const sug = sugerirMapa(cab, cj);
      const mapa = cab.map((t, i) => (salvo && salvo[norm(t)] !== undefined && cab.length > 1 ? salvo[norm(t)] : sug[i]));
      // linhas de dados: depois do cabeçalho, sem repetir o cabeçalho (relatório com várias páginas)
      const linhas = todas.slice(h + 1).filter((l) => l.join('|') !== cab.join('|'));
      return { nome: a.nome, cj, cab, linhas, usar: linhas.length > 0, mapa, titulos: h };
    });
    return s;
  };
  // classificação usada quando a planilha não traz (ou traz vazia): uma por grupo, escolhida na tela; padrão "A classificar"
  P.ACLASSIFICAR = '__aclassificar';
  const grupoDoTipo = (tp) => (['imovel'].includes(tp) ? 'imovel' : tp === 'infraestrutura' ? 'infraestrutura' : tp === 'veiculo' ? 'veiculo' : 'movel');
  P.NOMES_GRUPO = { movel: 'bens móveis', veiculo: 'veículos', imovel: 'imóveis', infraestrutura: 'domínio público / infraestrutura' };
  // Nome curto a partir de uma descrição longa (relatórios antigos só têm o texto completo): até a 1ª vírgula, dois-pontos ou traço
  P.resumoDescricao = (txt) => { const s = String(txt).replace(/\s+/g, ' ').trim(); const p = s.split(/\s*[,:;]\s+|\s+-\s+/)[0]; return (p.length > 80 ? p.slice(0, 77).replace(/\s+\S*$/, '') + '…' : p) || s.slice(0, 80); };
  P.gerarPrevia = () => {
    const s = st();
    const itens = [];
    const vistas = new Map(); // plaqueta → linha
    const porPlaqueta = new Map(VP.db.lista('bens', true).map((b) => [String(b.plaqueta).trim(), b]));
    const porAnterior = new Map(); for (const b of VP.db.lista('bens', true)) for (const a of VP.plaquetasAnteriores(b)) porAnterior.set(String(a.plaqueta).trim(), b);
    P.cacheRef = new Map();
    s.novasUnidades = new Map(); s.ignoradas = 0; s.gruposSemClasse = new Set();
    // cadastros e unidades da mesma planilha vêm antes: os bens podem usar um cadastro novo dela
    const pend = P.pendCad = {};
    if (VP.importaCadastros) { VP.importaCadastros.limparPendentes(); itens.push(...VP.importaCadastros.previa(s.abas.filter((x) => x.usar && ehCad(x.cj)), pend)); }
    if (VP.importaUnidades) {
      pend.unidades = new Map(); let n = 0;
      for (const a of s.abas.filter((x) => x.usar && x.cj === 'unidades')) for (const it of VP.importaUnidades.previa(a)) {
        if (it.classe === 'novo') { it.tempId = `__cad:unidades:${++n}`; pend.unidades.set(u.normalizar(it.valores.codigo).trim(), it.tempId); pend.unidades.set(norm(it.valores.nome), it.tempId); }
        itens.push(it);
      }
    }
    const campo = (k) => P.CAMPOS.find((x) => x.k === k);
    for (const a of s.abas.filter((x) => x.usar && x.cj !== 'controle' && x.cj !== 'unidades' && !ehCad(x.cj))) {
      a.linhas.forEach((lin, i) => {
        const nLinha = i + 2 + (a.titulos || 0);
        const it = { aba: a.nome, cj: a.cj, linha: nLinha, valores: {}, erros: [], avisos: [], mudancas: [] };
        a.mapa.forEach((k, col) => {
          if (!k) return;
          const c = campo(k); if (!c) return;
          const r = P.converter(c, lin[col]);
          if (r.situacao) { it.valores._situacao = r.situacao; it.avisos.push(r.aviso); }
          if (r.erro) it.erros.push(`${c.t}: ${r.erro}`); else if (!r.vazio) { it.valores[k] = r.v; if (r.aviso) it.avisos.push(r.aviso); if (r.novaUnidade) s.novasUnidades.set(r.novaUnidade, (s.novasUnidades.get(r.novaUnidade) || 0) + 1); }
        });
        const v = it.valores;
        // linha sem descrição, sem complemento, sem valor e sem data = título ou rodapé do relatório ("Total de bens", "Emitido em"): ignorada
        // (linha que só atualiza um bem que já existe, achado pela plaqueta, não é ignorada)
        if (!v.descricao && !v.complemento && !v['detalhes.caracteristicas'] && v.valor == null && v._valorContabil == null && !v.dataAquisicao && !(v.plaqueta && porPlaqueta.has(String(v.plaqueta).trim()))) { s.ignoradas++; return; }
        const tp = v._tipo || P.CONJUNTOS[a.cj].tipoPadrao;
        it.tipoBem = tp;
        it.cj = Object.keys(P.CONJUNTOS).find((k) => P.CONJUNTOS[k].tipos.includes(tp)) || a.cj;
        it.plaqueta = v.plaqueta ? String(v.plaqueta).trim() : '';
        if (!v.descricao && v.complemento) { it.descricaoDerivada = true; v.descricao = P.resumoDescricao(v.complemento); }
        it.descricao = v.descricao || '';
        if (/^exemplo/i.test(it.descricao)) it.erros.unshift('Linha de EXEMPLO do modelo: apague-a da planilha');
        if (it.plaqueta) {
          if (vistas.has(it.plaqueta)) it.erros.push(`Plaqueta repetida no arquivo (já está em ${vistas.get(it.plaqueta)})`);
          else vistas.set(it.plaqueta, `${a.nome}, linha ${nLinha}`);
        }
        const existe = it.plaqueta ? porPlaqueta.get(it.plaqueta) : null;
        if (!existe && it.plaqueta && porAnterior.has(it.plaqueta)) { const d = porAnterior.get(it.plaqueta); it.erros.push(`A plaqueta ${it.plaqueta} é uma plaqueta antiga do bem ${d.plaqueta} · ${d.descricao}. Plaqueta não é reaproveitada.`); }
        if (existe && existe.excluido) it.erros.push(`A plaqueta ${it.plaqueta} é de um bem que está na Lixeira; restaure-o antes`);
        else if (existe) {
          it.bemId = existe.id;
          if (!P.CONJUNTOS[it.cj].tipos.includes(existe.tipo)) it.avisos.push(`Este bem é ${L.tiposBem[existe.tipo] || existe.tipo} no sistema`);
          if (existe.status === 'baixado') it.avisos.push('Bem baixado: só os dados descritivos são atualizados');
          for (const [k, x] of Object.entries(v)) {
            if (k === 'plaqueta' || (k === 'descricao' && it.descricaoDerivada)) continue;
            if (k === '_situacao') { if (!['baixado', x].includes(existe.status)) it.mudancas.push({ k: 'status', t: 'Situação', antes: existe.status, depois: x }); continue; }
            const c = campo(k);
            if (c.soNovo) continue;
            const antes = c.ler ? c.ler(existe) : pega(existe, k);
            // o complemento gravado junta as características (como na inclusão); compara do mesmo jeito
            if (k === 'complemento' && v['detalhes.caracteristicas'] && String(antes ?? '') === [x, v['detalhes.caracteristicas']].join(' — ')) continue;
            const igual = typeof x === 'number' ? antes !== '' && antes != null && Number(antes) === x : String(antes ?? '') === String(x);
            if (igual) continue;
            if (c.trava) { if (!(k === '_valorContabil')) it.avisos.push(`${c.t} não foi alterado: ${c.trava}`); continue; }
            if (String(x).startsWith('__nova:')) { it.avisos.push(`${c.t} não foi alterado: para mudar de unidade use Transferência`); continue; }
            it.mudancas.push({ k, t: c.t, antes: antes ?? '', depois: x });
          }
          it.classe = it.erros.length ? 'erro' : it.mudancas.length ? 'alterado' : 'igual';
        } else {
          for (const c of P.camposDe(it.cj)) if (obrigatorio(c) && v[c.k] == null && !(c.k === 'descricao' && v.complemento)) it.erros.push(`${c.t} é obrigatória para bem novo`);
          if (v.valor == null && v._valorContabil == null) it.erros.push('Informe o Valor de aquisição ou o Valor contábil');
          if ((v.valor ?? v._valorContabil) < 0) it.erros.push('Valor negativo');
          if (!v.classificacaoId) { it.classePadrao = grupoDoTipo(tp); s.gruposSemClasse.add(it.classePadrao); }
          it.classe = it.erros.length ? 'erro' : 'novo';
          // Classificador: bem novo SEM plaqueta, barato, pode ser item de controle. Só sugere; a pessoa decide na prévia.
          const valorRef = v.valor ?? v._valorContabil;
          if (it.classe === 'novo' && !it.plaqueta && tp === 'movel' && VP.classificador && VP.controle && valorRef != null && valorRef <= VP.config().limiteControle) {
            it.analise = VP.classificador.analisar({ descricao: it.descricao, valor: valorRef, classificacaoId: v.classificacaoId, tipo: tp });
            it.destino = it.analise.sugestao;
          }
        }
        it.marcado = it.classe === 'novo' || it.classe === 'alterado';
        itens.push(it);
      });
    }
    // novas unidades que ainda não foram ligadas a uma unidade existente
    s.ligaUnidade = s.ligaUnidade || {};
    s.classesPadrao = s.classesPadrao || {};
    for (const g of s.gruposSemClasse) if (!s.classesPadrao[g]) s.classesPadrao[g] = P.ACLASSIFICAR;
    if (VP.controle) for (const a of s.abas.filter((x) => x.usar && x.cj === 'controle')) itens.push(...VP.controle.previaImportacao(a));
    s.previa = { itens, criadoEm: VP.Plataforma.agoraISO() };
    s.mapaCad = new Map();
    return s.previa;
  };

  // ================================================================== IMPORTAR: aplicar e desfazer
  const mostrarValor = (c, v) => (v == null || v === '' ? '—' : c?.tipo === 'ref' ? (REFS[c.ref] ? REFS[c.ref].mostrar(VP.db.pega(c.ref, v) || { nome: v }) : VP.db.pega(c.ref, v)?.nome || VP.db.pega(c.ref, v)?.codigo || v) : c?.tipo === 'data' ? u.data(v) : c?.tipo === 'status' ? L.status[v] || v : c?.tipo === 'estado' ? L.estados[v] || v : c?.tipo === 'moeda' ? u.moeda(v) : c?.tipo === 'bool' ? (v ? 'Sim' : 'Não') : String(v));
  // barra de progresso para arquivos grandes (milhares de bens)
  P.progresso = (texto) => {
    let el = document.getElementById('progresso-imp');
    if (texto == null) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'progresso-imp'; el.className = 'progresso-imp'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = texto;
  };
  const pausa = () => new Promise((r) => setTimeout(r, 0));
  P.LOTE = 1000;
  // soLista: só estes itens (ex.: os marcados da página na tela). A prévia continua com o resto.
  P.aplicar = async (soLista = null) => {
    const s = st();
    let marcados = (soLista || s.previa.itens).filter((x) => x.marcado && (x.classe === 'novo' || x.classe === 'alterado'));
    // salvando só uma página: leva junto os cadastros novos (de outras páginas) que os bens desta página usam
    const mapaCad = s.mapaCad = s.mapaCad || new Map();
    if (soLista) {
      const usados = new Set(marcados.flatMap((x) => Object.values(x.valores || {}).concat((x.mudancas || []).map((m) => m.depois))).filter((v) => typeof v === 'string' && v.startsWith('__cad:') && !mapaCad.has(v)));
      const juntos = s.previa.itens.filter((x) => x.tempId && usados.has(x.tempId) && x.classe === 'novo' && !marcados.includes(x));
      for (const x of juntos) x.marcado = true;
      marcados = juntos.concat(marcados);
    }
    const reg = { id: u.id(), data: VP.Plataforma.agoraISO(), arquivo: s.arquivo, usuario: VP.sessao?.usuario || 'demonstração', novos: [], alterados: [], controleNovos: [], controleAlterados: [], unidadesCriadas: [], classesCriadas: [], qtd: 0 };
    const pacotes = [], sucesso = [], falhas = [];
    // 0) unidades (código e nome) e cadastros novos da planilha: gravados antes, para os bens apontarem para eles
    const extra = { bensControle: [] };
    if (VP.importaUnidades) {
      const its = marcados.filter((x) => x.cj === 'unidades');
      VP.importaUnidades.aplicar(its, reg, extra, sucesso, falhas);
      for (const it of its) if (it.tempId && it.criadoId) mapaCad.set(it.tempId, it.criadoId);
    }
    if (VP.importaCadastros) {
      const grava = VP.importaCadastros.aplicar(marcados.filter((x) => ehCad(x.cj)), reg, mapaCad, sucesso, falhas);
      if (extra.unidades?.length) { grava.unidades = extra.unidades; extra.unidades = []; }
      if (Object.keys(grava).length) await VP.db.gravarVarias(grava);
    }
    // referências dos bens a cadastros novos: id de verdade (vazio se a linha do cadastro foi desmarcada)
    const R = VP.importaCadastros ? (v) => VP.importaCadastros.resolver(v, mapaCad) : (v) => v;
    for (const it of marcados.filter((x) => x.cj !== 'unidades' && !ehCad(x.cj))) {
      for (const k of Object.keys(it.valores || {})) it.valores[k] = R(it.valores[k]);
      for (const m of it.mudancas || []) m.depois = R(m.depois);
    }
    const prep = { unidades: [], classificacoes: [] };
    // 1) unidades novas (centros de custo pelo código) e classificação padrão
    const idUnidade = new Map();
    for (const it of marcados) {
      const un = it.valores.unidadeId;
      if (typeof un !== 'string' || !un.startsWith('__nova:')) continue;
      const cod = un.slice(7);
      if (idUnidade.has(cod)) continue;
      const ligada = s.ligaUnidade?.[cod];
      // Decisão do usuário (08/10/2026): código não cadastrado NÃO vira unidade provisória.
      // O bem fica sem centro de custo, guardando o código, com pendência grave até alguém ligar o código a uma unidade.
      idUnidade.set(cod, ligada || '');
    }
    const semCentro = (v) => (typeof v.unidadeId === 'string' && v.unidadeId.startsWith('__nova:') && !idUnidade.get(v.unidadeId.slice(7)) ? v.unidadeId.slice(7) : '');
    const idClasse = {};
    for (const g of new Set(marcados.filter((x) => x.classePadrao).map((x) => x.classePadrao))) {
      const esc1 = s.classesPadrao?.[g] || P.ACLASSIFICAR;
      if (esc1 !== P.ACLASSIFICAR) { idClasse[g] = esc1; continue; }
      const nome = `A classificar (importação) — ${P.NOMES_GRUPO[g]}`;
      const ja = VP.db.lista('classificacoes').find((c) => c.nome === nome);
      if (ja) { idClasse[g] = ja.id; continue; }
      const dm = VP.DEMAIS_BENS[g] || VP.DEMAIS_BENS.movel;
      const c = { id: u.id(), codigo: 'AC-' + g, nome, paiId: '', nivel: 'grupo', tipoBem: g, naoDeprecia: false, vidaUtilMeses: dm.vidaUtilMeses, residualPct: dm.residualPct, contaId: '', aClassificar: true };
      prep.classificacoes.push(c); idClasse[g] = c.id; reg.classesCriadas.push(c.id);
    }
    if (prep.unidades.length || prep.classificacoes.length) await VP.db.gravarVarias(prep);
    // 2) monta os bens
    let codigo = VP.proximoCodigo();
    // plaquetas da planilha entram na conta antes: a automática nunca repete uma delas nem as que já existem
    const ctxPl = VP.contextoPlaquetas(s.previa.itens.map((x) => x.plaqueta).filter(Boolean));
    // Linhas que a pessoa mandou para Itens de controle (sem plaqueta, fora do balancete)
    const extraC = [], sucC = [];
    let nC = VP.controle ? Number(VP.controle.proximoCodigo().replace(/\D/g, '')) : 0;
    for (const it of marcados.filter((x) => x.cj !== 'controle' && x.cj !== 'unidades' && !ehCad(x.cj) && x.analise && x.destino === 'controle')) {
      const v = it.valores;
      const unidadeId = typeof v.unidadeId === 'string' && v.unidadeId.startsWith('__nova:') ? idUnidade.get(v.unidadeId.slice(7)) : v.unidadeId;
      const x = VP.controle.montar({ centroCustoPendente: semCentro(v),  descricao: v.descricao, quantidade: 1, valorUnitario: v.valor ?? v._valorContabil, unidadeId, localizacao: v.localizacao, responsavelId: v.responsavelId, dataEntrada: v.dataAquisicao, estado: v.estado, vidaUtilAnos: it.analise.vidaUtilMeses ? Math.round(it.analise.vidaUtilMeses / 12 * 10) / 10 : null, nf: v['nf.numero'] ? { numero: v['nf.numero'] } : {} }, 'C-' + String(nC++).padStart(6, '0'), `Incluído pela importação de planilha (${s.arquivo}), aba ${it.aba}, linha ${it.linha}`);
      extraC.push(x); reg.controleNovos.push(x.id);
      sucC.push(`Item de controle novo: ${x.codigo} · ${x.descricao}`);
    }
    const decisoes = marcados.filter((x) => x.analise).map((x) => ({ descricao: x.descricao, escolha: x.destino, valor: x.valores.valor ?? x.valores._valorContabil, sugerido: x.analise.sugestao }));
    for (const it of marcados.filter((x) => x.cj !== 'controle' && x.cj !== 'unidades' && !ehCad(x.cj) && !(x.analise && x.destino === 'controle'))) {
      try {
        if (it.classe === 'novo') {
          const v = it.valores;
          const contabil = v.valor == null && v._valorContabil != null;
          const unidadeId = typeof v.unidadeId === 'string' && v.unidadeId.startsWith('__nova:') ? idUnidade.get(v.unidadeId.slice(7)) : v.unidadeId;
          const classificacaoId = v.classificacaoId || idClasse[it.classePadrao];
          if (!classificacaoId) throw new Error('A classificação nova desta planilha foi desmarcada; marque-a também');
          const complemento = [v.complemento || v.descricao, v['detalhes.caracteristicas']].filter(Boolean).join(' — ');
          const { bens: bb, eventos: ee } = VP.montarBens({ plaqueta: it.plaqueta || '', _plaquetaConferida: !!it.plaqueta, tipo: it.tipoBem, descricao: v.descricao, complemento, classificacaoId, unidadeId, responsavelId: v.responsavelId, localizacao: v.localizacao, dataAquisicao: v.dataAquisicao, dataIncorporacao: hoje(), valor: contabil ? v._valorContabil : v.valor, estado: v.estado || 7, situacaoAquisicao: contabil ? 'Saldo inicial' : v.situacaoAquisicao || 'Compra', fornecedorId: v.fornecedorId, quantidade: 1, origemTexto: contabil ? 'importação de outro sistema (valor contábil, já depreciado)' : 'importação por planilha' }, codigo, ctxPl);
          const b = bb[0];
          b.tipo = it.tipoBem;
          if (it.plaqueta) b.plaqueta = it.plaqueta;
          if (semCentro(v)) { b.centroCustoPendente = semCentro(v); b.responsavelId = b.responsavelId || ''; }
          if (v.status) b.status = v.status;
          if (v._situacao) b.status = v._situacao; // "Inservível" na coluna de estado vale mais que "Disponível" na de situação
          for (const [k, x] of Object.entries(v)) if (/^(nf|origem|detalhes|veiculo|imovel|endereco)\./.test(k)) poe(b, k, x);
          if (v._dataInicioDep) b.detalhes.inicioDepreciacaoAnterior = v._dataInicioDep;
          if (contabil) b.detalhes.valorContabilImportado = v._valorContabil;
          if (b.tipo !== 'veiculo' && b.veiculo && !Object.keys(b.veiculo).length) b.veiculo = null;
          if (b.tipo === 'veiculo' && !b.veiculo) b.veiculo = {};
          codigo++;
          pacotes.push({ bem: b, eventos: ee, novo: true });
          sucesso.push(`Novo: ${b.plaqueta} · ${b.descricao}`);
        } else {
          const b = VP.db.pega('bens', it.bemId);
          const antes = {};
          for (const m of it.mudancas) { antes[m.k] = pega(b, m.k) ?? null; poe(b, m.k, m.depois); }
          const ev = VP.novoEvento(b.id, 'alteracao', { descricao: `Atualizado pela importação de planilha (${s.arquivo})`, extra: { mudancas: it.mudancas.map((m) => { const c = P.CAMPOS.find((x) => x.k === m.k); return { campo: m.t, antes: mostrarValor(c, m.antes), depois: mostrarValor(c, m.depois) }; }) } });
          pacotes.push({ bem: b, eventos: [ev], antes });
          sucesso.push(`Atualizado: ${b.plaqueta} · ${b.descricao} (${it.mudancas.map((m) => m.t).join(', ')})`);
        }
      } catch (e) { falhas.push({ item: `${it.aba}, linha ${it.linha}`, motivo: e.message }); }
    }
    extra.bensControle = extraC;
    if (VP.controle) VP.controle.aplicarImportacao(marcados.filter((x) => x.cj === 'controle'), reg, extra, sucesso, falhas);
    // 3) grava em lotes, com progresso; se um lote falhar, para e mostra o que foi e o que não foi gravado
    let gravados = 0;
    try {
      for (let i = 0; i < pacotes.length; i += P.LOTE) {
        P.progresso(`Gravando ${u.inteiro(Math.min(i + P.LOTE, pacotes.length))} de ${u.inteiro(pacotes.length)} bens…`);
        await pausa();
        const lote = pacotes.slice(i, i + P.LOTE);
        await VP.db.gravarVarias({ bens: lote.map((x) => x.bem), eventos: lote.flatMap((x) => x.eventos) });
        for (const x of lote) { if (x.novo) reg.novos.push(x.bem.id); else reg.alterados.push({ id: x.bem.id, antes: x.antes }); }
        gravados += lote.length;
      }
      if (extra.bensControle.length) await VP.db.gravarVarias({ bensControle: extra.bensControle });
      if (extra.unidades?.length) await VP.db.gravarVarias({ unidades: extra.unidades });
      sucesso.push(...sucC);
      if (decisoes.length) await VP.classificador.registrarDecisoes(decisoes);
    } catch (e) {
      const faltam = pacotes.length - gravados;
      sucesso.splice(gravados);
      falhas.unshift({ item: `${u.inteiro(faltam)} bem(ns) não gravado(s)`, motivo: `Falha ao gravar (${e.message}). Os ${u.inteiro(gravados)} já gravados ficam e podem ser desfeitos; importe de novo o arquivo para completar (os já gravados aparecem como "Igual").` });
    }
    P.progresso(null);
    for (const it of s.previa.itens.filter((x) => x.classe === 'erro')) falhas.push({ item: `${it.aba}, linha ${it.linha}${it.descricao ? ' · ' + it.descricao : ''}`, motivo: it.erros.join('; ') });
    reg.qtd = sucesso.length;
    if (sucesso.length || reg.unidadesCriadas.length || (reg.cadastrosNovos || []).length) await VP.db.gravarVarias({ importacoesPlanilha: [reg] });
    // gravou só uma parte: a prévia continua, com o que foi gravado marcado como "Já gravado"
    const restam = soLista ? s.previa.itens.filter((x) => (x.classe === 'novo' || x.classe === 'alterado') && !marcados.includes(x)).length : 0;
    if (soLista && restam) { for (const x of marcados) { x.classe = 'gravado'; x.marcado = false; } }
    else { s.previa = null; s.abas = null; }
    ui.resultado({ titulo: 'Resultado da importação', sucesso, falhas, extra: (pacotes.some((x) => x.bem.centroCustoPendente) ? `<p class="aviso-inline">${u.inteiro(pacotes.filter((x) => x.bem.centroCustoPendente).length)} bem(ns) ficaram <b>sem centro de custo</b> (código ainda não cadastrado). É uma pendência grave: ligue cada código a uma unidade em <a href="#centros-pendentes">Centros de custo pendentes</a>.</p>` : '') + (reg.classesCriadas.length || Object.keys(idClasse).length ? '<p class="ajuda">Bens sem classificação entraram em "A classificar (importação)", depreciando como "Demais bens" (móveis 84 meses e 10%, imóveis 360 e 30%, veículos 120 e 30%, domínio público 1.200 e 80%). Classifique-os em lote pela lista de bens (filtro por classificação → Edição em lote).</p>' : '') + (sucesso.length ? '<p class="ajuda">Se algo saiu errado, use "Desfazer" na lista de importações feitas.</p>' : '') });
    return { sucesso, falhas, reg };
  };
  P.desfazer = async (reg) => {
    const pac = [], falhas = [], sucesso = [];
    for (const id of reg.novos) {
      const b = VP.db.pega('bens', id);
      if (!b) { falhas.push({ item: id, motivo: 'Bem não encontrado (já excluído?)' }); continue; }
      const mov = VP.eventosDoBem(b.id).filter((e) => !['incorporacao', 'alteracao'].includes(e.tipo));
      if (mov.length) { falhas.push({ item: `${b.plaqueta} · ${b.descricao}`, motivo: 'Já tem movimentações depois da importação; exclua pela ficha se for o caso' }); continue; }
      b.excluido = true; b.excluidoEm = VP.Plataforma.agoraISO();
      pac.push({ bem: b, ev: VP.novoEvento(b.id, 'alteracao', { descricao: 'Importação desfeita: movido para a Lixeira' }) });
      sucesso.push(`Para a Lixeira: ${b.plaqueta} · ${b.descricao}`);
    }
    for (const a of reg.alterados) {
      const b = VP.db.pega('bens', a.id);
      if (!b) { falhas.push({ item: a.id, motivo: 'Bem não encontrado' }); continue; }
      for (const [k, v] of Object.entries(a.antes)) poe(b, k, v);
      pac.push({ bem: b, ev: VP.novoEvento(b.id, 'alteracao', { descricao: 'Importação de planilha desfeita: valores anteriores restaurados', extra: { mudancas: Object.keys(a.antes).map((k) => ({ campo: (P.CAMPOS.find((c) => c.k === k) || {}).t || k, antes: '(importado)', depois: String(a.antes[k] ?? '') })) } }) });
      sucesso.push(`Restaurado: ${b.plaqueta} · ${b.descricao}`);
    }
    for (let i = 0; i < pac.length; i += P.LOTE) {
      P.progresso(`Desfazendo ${u.inteiro(Math.min(i + P.LOTE, pac.length))} de ${u.inteiro(pac.length)}…`);
      await pausa();
      const lote = pac.slice(i, i + P.LOTE);
      await VP.db.gravarVarias({ bens: lote.map((x) => x.bem), eventos: lote.map((x) => x.ev) });
    }
    P.progresso(null);
    const grava = {};
    // unidades criadas pela importação que ficaram sem bens: para a Lixeira
    const unids = (reg.unidadesCriadas || []).map((id) => VP.db.pega('unidades', id)).filter((x) => x && !VP.db.lista('bens').some((b) => b.unidadeId === x.id));
    if (unids.length) { for (const x of unids) { x.excluido = true; x.excluidoEm = VP.Plataforma.agoraISO(); } grava.unidades = unids; sucesso.push(`${unids.length} unidade(s) criada(s) pela importação foram para a Lixeira`); }
    if (VP.controle) VP.controle.desfazerImportacao(reg, grava, sucesso, falhas);
    if (VP.importaUnidades) VP.importaUnidades.desfazer(reg, grava, sucesso, falhas);
    if (VP.importaCadastros) VP.importaCadastros.desfazer(reg, grava, sucesso, falhas);
    reg.desfeitoEm = VP.Plataforma.agoraISO();
    grava.importacoesPlanilha = [reg];
    await VP.db.gravarVarias(grava);
    ui.resultado({ titulo: 'Importação desfeita', sucesso, falhas });
  };

  // ================================================================== TELA
  const ABAS = [['exportar', 'Exportar'], ['importar', 'Importar'], ['anexos', 'Anexos em lote']];
  T.planilhas = (aba = 'exportar') => {
    if (!ABAS.some(([k]) => k === aba)) aba = 'exportar';
    const nav = `<nav class="abas">${ABAS.map(([k, n]) => `<a href="#planilhas/${k}" class="${k === aba ? 'ativa' : ''}">${n}</a>`).join('')}</nav>`;
    if (aba === 'anexos') return VP.anexosLote ? VP.anexosLote.tela(nav) : { titulo: 'Exportar e importar', html: nav };
    if (aba === 'importar') return telaImportar(nav);
    return telaExportar(nav);
  };

  const telaExportar = (nav) => {
    const f = VP.estado.expBens = VP.estado.expBens || { cj: 'movel', unidadeId: '', status: 'ativos', local: '', grupoId: '', porUnidade: false };
    const cjs = Object.assign({}, Object.fromEntries(Object.entries(P.CONJUNTOS).map(([k, x]) => [k, x.nome])), VP.controle ? { controle: 'Itens de controle' } : {});
    const ehControle = f.cj === 'controle';
    const cols = ehControle ? VP.controle.colunasExportar() : P.colunasExportar(f.cj);
    const salvas = ui.pref.ler('exp-colunas-' + f.cj);
    const modelos = ui.pref.ler('exp-modelos-' + f.cj, {});
    const qtd = ehControle ? VP.controle.filtrar(f).length : filtrar(f.cj, f).length;
    const grupos = VP.db.lista('classificacoes').filter((c) => !c.paiId);
    return {
      titulo: 'Exportar e importar',
      acoes: '<button class="botao" data-modelo-imp>Baixar modelo para importação</button>',
      html: `${nav}
        <section class="cartao"><h3>Exportar em lote (Excel)</h3>
          <p class="ajuda">Escolha o que exportar, filtre e marque as colunas. As colunas são as mesmas do modelo de importação: dá para corrigir no Excel e importar de volta.</p>
          <div class="linha-filtros">
            <label>O que exportar <select data-exp="cj">${Object.entries(cjs).map(([k, n]) => `<option value="${k}" ${k === f.cj ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
            <label>Unidade <select data-exp="unidadeId"><option value="">Todas</option>${VP.db.lista('unidades').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => `<option value="${esc(x.id)}" ${x.id === f.unidadeId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
            <label>Local contém <input data-exp="local" value="${esc(f.local)}" size="10" placeholder="Ex.: Sala 12"></label>
            ${ehControle ? '' : `<label>Grupo <select data-exp="grupoId"><option value="">Todos</option>${grupos.map((g) => `<option value="${esc(g.id)}" ${g.id === f.grupoId ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select></label>`}
            <label>Situação <select data-exp="status"><option value="ativos" ${f.status === 'ativos' ? 'selected' : ''}>Ativos</option><option value="baixados" ${f.status === 'baixados' ? 'selected' : ''}>${ehControle ? 'Com baixa' : 'Baixados'}</option><option value="todos" ${f.status === 'todos' ? 'selected' : ''}>Todos</option></select></label>
            <label class="linha-check"><input type="checkbox" data-exp="porUnidade" ${f.porUnidade ? 'checked' : ''}> Uma aba por unidade</label>
          </div>
          <p><b>${u.inteiro(qtd)}</b> item(ns) neste filtro.</p>
          ${Object.keys(modelos).length ? `<label>Modelo de colunas salvo <select data-exp-modelo><option value="">—</option>${Object.keys(modelos).map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>` : ''}
          <div class="linha-botoes"><button type="button" class="botao pequeno" data-exp-todas>Marcar todas</button><button type="button" class="botao pequeno" data-exp-nenhuma>Desmarcar todas</button></div>
          <div class="lista-marcar colunas" id="exp-colunas">${cols.map((c) => `<label><input type="checkbox" value="${esc(c.k)}" ${!salvas || salvas.includes(c.k) ? 'checked' : ''}> ${esc(c.t)}</label>`).join('')}</div>
          <div class="linha-botoes"><label>Salvar esta escolha como modelo (opcional) <input data-exp-nome-modelo placeholder="Ex.: Para o sistema da contabilidade"></label></div>
          <p><button class="botao primario" data-exportar ${qtd ? '' : 'disabled'}>Baixar Excel</button></p>
        </section>
        ${VP.importaCadastros ? `<section class="cartao" id="exp-cadastros"><h3>Cadastros (uma aba para cada)</h3>
          <p class="ajuda">Entidades, unidades, contas, responsáveis, fornecedores, motivos, comissões, seguradoras, tipos de garantia, classificações, produtos e compras. As colunas são as mesmas da importação: dá para corrigir no Excel e importar de volta, ou usar como modelo para os dados da prefeitura.</p>
          <p><button class="botao primario" data-exp-cadastros>Baixar cadastros (Excel)</button></p></section>` : ''}
        <section class="cartao"><h3>Outras listas</h3><p class="ajuda">Cada lista abaixo tem o botão <b>Baixar planilha</b> na própria tela (Excel, CSV ou JSON, com escolha das colunas). Se marcar linhas na lista, só elas saem.</p>
          <div class="grade-links">${P.OUTRAS.map(([g, l]) => `<div><h4>${esc(g)}</h4><ul class="lista-simples">${l.map(([h, n]) => `<li><a href="${h}">${esc(n)}</a></li>`).join('')}</ul></div>`).join('')}</div>
        </section>`,
      ligar() {
        const re = () => VP.app.render();
        document.querySelector('[data-modelo-imp]').addEventListener('click', P.baixarModelo);
        document.querySelector('[data-exp-cadastros]')?.addEventListener('click', () => { const n = VP.importaCadastros.exportar(); ui.aviso(`Planilha de cadastros baixada (${u.inteiro(n)} registro(s)).`); });
        document.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('change', () => { f[el.dataset.exp] = el.type === 'checkbox' ? el.checked : el.value; re(); }));
        const caixas = () => [...document.querySelectorAll('#exp-colunas input')];
        document.querySelector('[data-exp-todas]').addEventListener('click', () => caixas().forEach((i) => { i.checked = true; }));
        document.querySelector('[data-exp-nenhuma]').addEventListener('click', () => caixas().forEach((i) => { i.checked = false; }));
        document.querySelector('[data-exp-modelo]')?.addEventListener('change', (e) => { const m = modelos[e.target.value]; if (m) caixas().forEach((i) => { i.checked = m.includes(i.value); }); });
        document.querySelector('[data-exportar]').addEventListener('click', () => {
          const ks = caixas().filter((i) => i.checked).map((i) => i.value);
          if (!ks.length) return ui.aviso('Marque pelo menos uma coluna.', 'erro');
          ui.pref.gravar('exp-colunas-' + f.cj, ks);
          const nm = document.querySelector('[data-exp-nome-modelo]').value.trim();
          if (nm) { modelos[nm] = ks; ui.pref.gravar('exp-modelos-' + f.cj, modelos); }
          const n = ehControle ? VP.controle.exportar(f, ks) : P.exportarBens(f.cj, f, ks, f.porUnidade);
          ui.aviso(`Planilha com ${u.inteiro(n)} item(ns) baixada.`);
        });
      }
    };
  };

  const CLASSE = { gravado: ['im-neutro', 'Já gravado'], novo: ['im-bom', 'Novo'], igual: ['im-neutro', 'Igual (nada muda)'], alterado: ['im-regular', 'Alterado'], erro: ['im-ruim', 'Erro'] };
  const telaImportar = (nav) => {
    const s = st();
    const hist = VP.db.lista('importacoesPlanilha').sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const camposDoCj = camposImp;
    const cjs = Object.assign({}, Object.fromEntries(Object.entries(P.CONJUNTOS).map(([k, x]) => [k, x.nome])), VP.controle ? { controle: 'Itens de controle' } : {}, VP.importaUnidades ? { unidades: VP.importaUnidades.NOME + ' (só código e nome)' } : {}, VP.importaCadastros ? VP.importaCadastros.opcoesImportar() : {});
    let corpo = '';
    if (s.previa) {
      const it = s.previa.itens;
      const n = (c) => it.filter((x) => x.classe === c).length;
      // Páginas e filtros (a tela mostra uma página por vez para não travar o navegador com dezenas de milhares de linhas)
      const ccDe = (x) => { const un = x.valores?.unidadeId; return typeof un === 'string' && un.startsWith('__nova:') ? un.slice(7) : un ? (VP.db.pega('unidades', un)?.codigo || un) : '(sem centro de custo)'; };
      const ccs = [...new Set(it.map(ccDe))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
      const tipos = [...new Set(it.map((x) => x.tipoBem).filter(Boolean))];
      const porPag = Number(s.porPagina) || 300;
      const filtrados = it.map((x, i) => [x, i]).filter(([x]) => (!s.filtro || (s.filtro === 'analisados' ? !!x.analise : x.classe === s.filtro)) && (!s.filtroCC || ccDe(x) === s.filtroCC) && (!s.filtroTipo || x.tipoBem === s.filtroTipo));
      const nPag = Math.max(1, Math.ceil(filtrados.length / porPag));
      s.pagina = Math.min(Math.max(0, s.pagina || 0), nPag - 1);
      const daPagina = filtrados.slice(s.pagina * porPag, (s.pagina + 1) * porPag);
      P.itensDaPagina = () => daPagina.map(([x]) => x);
      const marcPag = daPagina.filter(([x]) => x.marcado && (x.classe === 'novo' || x.classe === 'alterado')).length;
      const paginador = nPag > 1 ? `<div class="linha-botoes paginador"><button type="button" class="botao pequeno" data-imp-pag="${s.pagina - 1}" ${s.pagina ? '' : 'disabled'}>‹ Anterior</button>
          <label>Página <select data-imp-ir-pag>${Array.from({ length: nPag }, (_, k) => `<option value="${k}" ${k === s.pagina ? 'selected' : ''}>${k + 1}</option>`).join('')}</select> de ${u.inteiro(nPag)}</label>
          <button type="button" class="botao pequeno" data-imp-pag="${s.pagina + 1}" ${s.pagina < nPag - 1 ? '' : 'disabled'}>Próxima ›</button></div>` : '';
      const nAnalisados = it.filter((x) => x.analise).length, nSugControle = it.filter((x) => x.analise?.sugestao === 'controle').length;
      const marcados = it.filter((x) => x.marcado && (x.classe === 'novo' || x.classe === 'alterado')).length;
      const novasUn = [...(s.novasUnidades || new Map()).entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }));
      const opcUn = VP.db.lista('unidades').sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true })).map((x) => [x.id, `${x.codigo} · ${x.nome}`]);
      const opcClasse = (g) => VP.db.lista('classificacoes').filter((c) => (VP.dadosDaClassificacao(c.id).tipoBem || 'movel') === g).map((c) => [c.id, VP.caminhoClassificacao(c)]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
      corpo = `<section class="cartao" id="previa-imp"><h3>Prévia — ${esc(s.arquivo)}</h3>
        <p class="ajuda">Nada foi gravado ainda. Confira, desmarque o que não quiser e clique em <b>Importar o que está marcado</b>.${s.ignoradas ? ` ${u.inteiro(s.ignoradas)} linha(s) de título ou rodapé do relatório foram ignoradas.` : ''}</p>
        <div class="resumo-linha">${VP.graficos.numero('Novos', u.inteiro(n('novo')))}${VP.graficos.numero('Alterados', u.inteiro(n('alterado')))}${VP.graficos.numero('Iguais', u.inteiro(n('igual')))}${VP.graficos.numero('Com erro', u.inteiro(n('erro')))}${n('gravado') ? VP.graficos.numero('Já gravados', u.inteiro(n('gravado')), 'nesta prévia') : ''}${novasUn.length ? VP.graficos.numero('Centros de custo não cadastrados', u.inteiro(novasUn.length), 'bens ficam sem centro de custo (pendência)') : ''}</div>
        ${[...(s.gruposSemClasse || [])].length ? `<div class="cartao secao" id="classe-padrao"><h4>Classificação dos bens que vieram sem classificação</h4>
          <p class="ajuda">A planilha não traz a classificação (ou veio vazia). Escolha uma para cada grupo. O padrão <b>"A classificar"</b> deprecia como "Demais bens" (tabela do livro de controle patrimonial) até você classificar os bens (depois, em lote, pela lista de bens).</p>
          <div class="grade-depara">${[...s.gruposSemClasse].map((g) => `<label>${esc(P.NOMES_GRUPO[g])} (${u.inteiro(it.filter((x) => x.classePadrao === g).length)}) <select data-imp-classe="${g}"><option value="${P.ACLASSIFICAR}">A classificar (importação) — deprecia como "Demais bens"</option>${opcClasse(g).map(([id, nm]) => `<option value="${esc(id)}" ${s.classesPadrao[g] === id ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select></label>`).join('')}</div></div>` : ''}
        ${novasUn.length ? `<details class="cartao secao" id="novas-unidades"><summary><b>${u.inteiro(novasUn.length)} código(s) de centro de custo ainda não cadastrado(s)</b> — os bens ficam <b>sem centro de custo</b>, guardando o código, com pendência grave até você ligar o código a uma unidade. Se já souber, ligue aqui a uma unidade que já existe</summary>
          <div class="tabela-rolagem"><table class="tabela" data-sem-planilha><thead><tr><th>Código</th><th class="num">Bens</th><th>Ligar a</th></tr></thead><tbody>${novasUn.map(([cod, q]) => `<tr><td>${esc(cod)}</td><td class="num">${u.inteiro(q)}</td><td><select data-imp-liga="${esc(cod)}"><option value="">Deixar sem centro de custo (pendência)</option>${opcUn.map(([id, nm]) => `<option value="${esc(id)}" ${s.ligaUnidade[cod] === id ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></details>` : ''}
        ${nAnalisados ? `<p class="aviso-inline" id="aviso-sug-controle-imp"><b>${u.inteiro(nAnalisados)} bem(ns) novo(s) sem plaqueta</b> custam até ${u.moeda(VP.config().limiteControle)}. Destes, <b>${u.inteiro(nSugControle)}</b> foram sugeridos como <b>item de controle</b> (sem plaqueta, fora do balancete). Confira em "Vai para" (filtro "Valor baixo: conferir destino") e mude se precisar.</p>` : ''}
        <div class="linha-botoes"><label>Mostrar <select data-imp-filtro><option value="">Todos</option>${Object.entries(CLASSE).map(([k, [, nm]]) => `<option value="${k}" ${s.filtro === k ? 'selected' : ''}>${nm}</option>`).join('')}${nAnalisados ? `<option value="analisados" ${s.filtro === 'analisados' ? 'selected' : ''}>Valor baixo: conferir destino</option>` : ''}</select></label>
          <label>Centro de custo <select data-imp-filtro-cc><option value="">Todos</option>${ccs.map((c) => `<option value="${esc(c)}" ${s.filtroCC === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          ${tipos.length > 1 ? `<label>Tipo <select data-imp-filtro-tipo><option value="">Todos</option>${tipos.map((t) => `<option value="${esc(t)}" ${s.filtroTipo === t ? 'selected' : ''}>${esc(L.tiposBem[t] || t)}</option>`).join('')}</select></label>` : ''}
          <label>Linhas por página <select data-imp-por-pag>${[100, 300, 1000].map((n) => `<option value="${n}" ${porPag === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <button type="button" class="botao pequeno" data-imp-marcar="1">Marcar todos os válidos</button><button type="button" class="botao pequeno" data-imp-marcar="0">Desmarcar todos</button>
          <button type="button" class="botao pequeno" data-imp-baixar-previa>Baixar prévia completa (Excel)</button>
          <span class="ajuda" id="imp-marcados">${u.inteiro(marcados)} marcado(s) para importar</span></div>
        <p class="ajuda">${u.inteiro(filtrados.length)} linha(s) neste filtro${nPag > 1 ? `, página ${s.pagina + 1} de ${u.inteiro(nPag)}` : ''}. <button type="button" class="botao pequeno" data-imp-marcar-pag="1">Marcar todos desta página</button> <button type="button" class="botao pequeno" data-imp-marcar-pag="0">Desmarcar desta página</button></p>
        ${paginador}
        <div class="tabela-rolagem"><table class="tabela" id="tab-previa-imp" data-sem-planilha><thead><tr><th></th><th>Situação</th><th>Aba, linha</th><th>Plaqueta</th><th>Descrição</th><th>O que acontece</th></tr></thead><tbody>
        ${daPagina.map(([x, i]) => `<tr data-classe="${x.classe}"><td>${x.classe === 'novo' || x.classe === 'alterado' ? `<input type="checkbox" data-imp-item="${i}" ${x.marcado ? 'checked' : ''} aria-label="Importar esta linha">` : ''}</td>
          <td><span class="selo-status ${CLASSE[x.classe][0]}">${CLASSE[x.classe][1]}</span></td><td>${esc(x.aba)}, ${x.linha}</td><td>${esc(x.plaqueta || (x.classe === 'novo' && !x.tabela && x.cj !== 'unidades' ? '(automática)' : ''))}</td><td>${esc(x.descricao || (x.bemId ? VP.db.pega('bens', x.bemId)?.descricao : '') || x.codigoControle || '')}</td>
          <td>${x.erros.length ? `<span class="erro-txt">${esc(x.erros.join('; '))}</span>` : x.classe === 'novo' ? `Será incluído${x.tipoBem && x.tipoBem !== 'movel' ? ` (${esc(L.tiposBem[x.tipoBem])})` : ''}${x.valores?._valorContabil != null && x.valores.valor == null ? ' com o valor contábil, como saldo inicial' : ''}` : x.classe === 'igual' ? 'Nada muda' : ''}
            ${x.mudancas.length ? `<ul class="lista-mudancas">${x.mudancas.map((m) => { const c = camposDoCj(x.cj).find((y) => y.k === m.k) || P.CAMPOS.find((y) => y.k === m.k); return `<li><b>${esc(m.t)}</b>: ${esc(mostrarValor(c, m.antes))} → ${esc(mostrarValor(c, m.depois))}</li>`; }).join('')}</ul>` : ''}
            ${x.avisos.length ? `<div class="aviso-txt">${esc(x.avisos.join('; '))}</div>` : ''}
            ${x.analise ? VP.classificador.seletor(Object.assign({}, x.analise, { sugestao: x.analise.sugestao }), `data-imp-destino="${i}"`).replace(/(<option value="(controle|patrimonio)") (selected)?/g, (m, a, k) => `${a} ${x.destino === k ? 'selected' : ''}`) : ''}</td></tr>`).join('')}
        </tbody></table></div>
        ${paginador}
        <p class="linha-botoes"><button class="botao primario" data-imp-aplicar-pag>Salvar os marcados desta página (${u.inteiro(marcPag)})</button> <button class="botao" data-imp-aplicar>Salvar todos os marcados (${u.inteiro(marcados)})</button> <button class="botao" data-imp-descartar>Descartar</button></p></section>`;
    } else if (s.abas) {
      corpo = `<section class="cartao" id="depara-imp"><h3>Colunas do arquivo — ${esc(s.arquivo)}</h3>
        <p class="ajuda">O sistema ligou cada coluna da planilha a uma informação do bem pelo título. Confira e corrija o que estiver errado; "— não importar —" ignora a coluna.</p>
        ${s.abas.map((a, ai) => `<div class="cartao secao"><header><label class="linha-check"><input type="checkbox" data-imp-usar="${ai}" ${a.usar ? 'checked' : ''}> Aba <b>${esc(a.nome)}</b> (${u.inteiro(a.linhas.length)} linhas)</label>
            <label>É de <select data-imp-cj="${ai}">${Object.entries(cjs).map(([k, n]) => `<option value="${k}" ${k === a.cj ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></header>
          <div class="grade-depara">${a.cab.map((t, ci) => `<label>${esc(t || `(coluna ${ci + 1} sem título)`)} <select data-imp-mapa="${ai}:${ci}"><option value="">— não importar —</option>${camposDoCj(a.cj).map((c) => `<option value="${esc(c.k)}" ${c.k === a.mapa[ci] ? 'selected' : ''}>${esc(c.t)}</option>`).join('')}</select></label>`).join('')}</div></div>`).join('')}
        <p class="linha-botoes"><label class="linha-check"><input type="checkbox" data-imp-salvar-mapa checked> Lembrar estas ligações para a próxima vez</label></p>
        <p class="linha-botoes"><button class="botao primario" data-imp-previa>Ver a prévia</button> <button class="botao" data-imp-descartar>Cancelar</button></p></section>`;
    }
    return {
      titulo: 'Exportar e importar',
      acoes: '<button class="botao" data-modelo-imp>Baixar modelo para importação</button>',
      html: `${nav}
        <section class="cartao"><h3>Importar bens pela planilha do Excel</h3>
          <ol class="lista-simples"><li>Baixe o <b>modelo</b> (botão acima) e preencha no Excel. Ou exporte os bens, corrija e importe de volta.</li><li>Escolha o arquivo aqui. Nada é gravado antes da sua confirmação.</li><li>Confira as colunas e a prévia; importe o que estiver marcado.</li></ol>
          ${pode() ? '<label class="botao primario">Escolher arquivo (.xlsx ou .csv)<input type="file" accept=".xlsx,.csv,.txt" data-imp-arquivo hidden></label>' : '<p class="aviso-inline">Seu acesso é só de consulta.</p>'}
        </section>
        ${corpo}
        <section class="cartao"><h3>Importações feitas</h3>${hist.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Data</th><th>Arquivo</th><th>Quem</th><th class="num">Novos</th><th class="num">Alterados</th><th></th></tr></thead><tbody>${hist.map((h) => `<tr><td>${esc(new Date(h.data).toLocaleString('pt-BR'))}</td><td>${esc(h.arquivo || '')}</td><td>${esc(h.usuario || '')}</td><td class="num">${u.inteiro(h.novos.length + (h.controleNovos || []).length + (h.unidadesNovasCC || []).length)}</td><td class="num">${u.inteiro(h.alterados.length + (h.controleAlterados || []).length + (h.unidadesRenomeadas || []).length)}</td><td>${h.desfeitoEm ? `Desfeita em ${u.data(h.desfeitoEm.slice(0, 10))}` : pode() ? `<button class="botao pequeno" data-imp-desfazer="${esc(h.id)}">Desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhuma ainda.</p>'}</section>`,
      ligar() {
        const re = () => VP.app.render();
        document.querySelector('[data-modelo-imp]').addEventListener('click', P.baixarModelo);
        document.querySelector('[data-imp-arquivo]')?.addEventListener('change', async (e) => {
          const arq = e.target.files[0]; e.target.value = '';
          if (!arq) return;
          try { await P.lerArquivo(arq); } catch (err) { return ui.aviso(err.message, 'erro'); }
          if (!st().abas.some((a) => a.linhas.length)) { st().abas = null; return ui.aviso('A planilha está vazia.', 'erro'); }
          re();
        });
        document.querySelectorAll('[data-imp-usar]').forEach((el) => el.addEventListener('change', () => { s.abas[el.dataset.impUsar].usar = el.checked; }));
        document.querySelectorAll('[data-imp-cj]').forEach((el) => el.addEventListener('change', () => { const a = s.abas[el.dataset.impCj]; a.cj = el.value; a.mapa = sugerirMapa(a.cab, a.cj); re(); }));
        document.querySelectorAll('[data-imp-mapa]').forEach((el) => el.addEventListener('change', () => { const [ai, ci] = el.dataset.impMapa.split(':').map(Number); s.abas[ai].mapa[ci] = el.value; }));
        document.querySelector('[data-imp-previa]')?.addEventListener('click', () => {
          if (!s.abas.some((a) => a.usar)) return ui.aviso('Marque pelo menos uma aba.', 'erro');
          if (document.querySelector('[data-imp-salvar-mapa]')?.checked) {
            const modelos = ui.pref.ler('depara-bens', {});
            for (const a of s.abas.filter((x) => x.usar)) modelos[a.cj] = Object.assign(modelos[a.cj] || {}, Object.fromEntries(a.cab.map((t, i) => [norm(t), a.mapa[i]])));
            ui.pref.gravar('depara-bens', modelos);
          }
          P.gerarPrevia(); re();
        });
        document.querySelectorAll('[data-imp-descartar]').forEach((b) => b.addEventListener('click', () => { s.abas = null; s.previa = null; re(); }));
        const contaMarcados = () => { const el = document.getElementById('imp-marcados'); if (el) el.textContent = `${u.inteiro(s.previa.itens.filter((x) => x.marcado && (x.classe === 'novo' || x.classe === 'alterado')).length)} marcado(s) para importar`; };
        document.querySelectorAll('[data-imp-item]').forEach((el) => el.addEventListener('change', () => { s.previa.itens[el.dataset.impItem].marcado = el.checked; contaMarcados(); }));
        // marcar/desmarcar vale para o arquivo inteiro, não só para as linhas na tela
        document.querySelectorAll('[data-imp-marcar]').forEach((b) => b.addEventListener('click', () => { const v = b.dataset.impMarcar === '1'; s.previa.itens.forEach((x) => { if (x.classe === 'novo' || x.classe === 'alterado') x.marcado = v; }); document.querySelectorAll('[data-imp-item]').forEach((i) => { i.checked = v; }); contaMarcados(); }));
        document.querySelector('[data-imp-filtro]')?.addEventListener('change', (e) => { s.filtro = e.target.value; s.pagina = 0; re(); });
        document.querySelectorAll('[data-imp-pag]').forEach((b) => b.addEventListener('click', () => { s.pagina = Number(b.dataset.impPag); re(); }));
        document.querySelectorAll('[data-imp-ir-pag]').forEach((el) => el.addEventListener('change', () => { s.pagina = Number(el.value); re(); }));
        document.querySelector('[data-imp-filtro-cc]')?.addEventListener('change', (e) => { s.filtroCC = e.target.value; s.pagina = 0; re(); });
        document.querySelector('[data-imp-filtro-tipo]')?.addEventListener('change', (e) => { s.filtroTipo = e.target.value; s.pagina = 0; re(); });
        document.querySelector('[data-imp-por-pag]')?.addEventListener('change', (e) => { s.porPagina = Number(e.target.value); s.pagina = 0; re(); });
        document.querySelectorAll('[data-imp-marcar-pag]').forEach((b) => b.addEventListener('click', () => { const v = b.dataset.impMarcarPag === '1'; for (const x of P.itensDaPagina()) if (x.classe === 'novo' || x.classe === 'alterado') x.marcado = v; re(); }));
        document.querySelector('[data-imp-aplicar-pag]')?.addEventListener('click', async (e) => {
          const lista = P.itensDaPagina();
          const n = lista.filter((x) => x.marcado && (x.classe === 'novo' || x.classe === 'alterado')).length;
          if (!n) return ui.aviso('Nada marcado nesta página.', 'erro');
          if (!await ui.confirmar(`Salvar só os ${u.inteiro(n)} marcado(s) desta página? As outras linhas continuam na prévia.`, { titulo: 'Salvar esta página', sim: 'Salvar' })) return;
          e.target.disabled = true;
          try { await P.aplicar(lista); } catch (err) { ui.aviso('Não foi possível gravar: ' + err.message, 'erro'); }
          re();
        });
        document.querySelectorAll('[data-imp-destino]').forEach((el) => el.addEventListener('change', () => { s.previa.itens[el.dataset.impDestino].destino = el.value; }));
        document.querySelectorAll('[data-imp-classe]').forEach((el) => { el.value = s.classesPadrao[el.dataset.impClasse] || P.ACLASSIFICAR; el.addEventListener('change', () => { s.classesPadrao[el.dataset.impClasse] = el.value; }); });
        document.querySelectorAll('[data-imp-liga]').forEach((el) => el.addEventListener('change', () => { if (el.value) s.ligaUnidade[el.dataset.impLiga] = el.value; else delete s.ligaUnidade[el.dataset.impLiga]; }));
        document.querySelector('[data-imp-baixar-previa]')?.addEventListener('click', () => {
          const linhas = s.previa.itens.map((x) => [CLASSE[x.classe][1], x.marcado && (x.classe === 'novo' || x.classe === 'alterado') ? 'Sim' : 'Não', x.aba, x.linha, x.plaqueta, x.descricao || (x.bemId ? VP.db.pega('bens', x.bemId)?.descricao : '') || '', x.tipoBem ? L.tiposBem[x.tipoBem] || x.tipoBem : '', x.erros.join('; '), x.mudancas.map((m) => `${m.t}: ${mostrarValor(P.CAMPOS.find((y) => y.k === m.k), m.antes)} → ${mostrarValor(P.CAMPOS.find((y) => y.k === m.k), m.depois)}`).join('; '), x.avisos.join('; ')]);
          VP.baixarXLSX('previa-importacao', [{ nome: 'Prévia', cabecalho: ['Situação', 'Marcado', 'Aba', 'Linha', 'Plaqueta', 'Descrição', 'Tipo', 'Erros', 'Mudanças', 'Avisos'], linhas }]);
        });
        document.querySelector('[data-imp-aplicar]')?.addEventListener('click', async (e) => {
          const n = s.previa.itens.filter((x) => x.marcado && (x.classe === 'novo' || x.classe === 'alterado')).length;
          if (!n) return ui.aviso('Nada marcado para importar.', 'erro');
          if (!await ui.confirmar(`Salvar todos os ${u.inteiro(n)} marcado(s), de todas as páginas?`, { titulo: 'Importar', sim: 'Importar' })) return;
          e.target.disabled = true;
          try { await P.aplicar(); } catch (err) { ui.aviso('Não foi possível gravar: ' + err.message, 'erro'); }
          re();
        });
        document.querySelectorAll('[data-imp-desfazer]').forEach((b) => b.addEventListener('click', async () => {
          const reg = VP.db.pega('importacoesPlanilha', b.dataset.impDesfazer);
          if (!await ui.confirmar(`Desfazer a importação de ${esc(reg.arquivo)}? Os bens incluídos vão para a Lixeira e os alterados voltam ao valor anterior.`, { titulo: 'Desfazer importação', sim: 'Desfazer', classe: 'perigo' })) return;
          await P.desfazer(reg); re();
        }));
      }
    };
  };
})();
