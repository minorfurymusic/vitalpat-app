/* VitalPat Patrimônio · Gestão — dados de exemplo FICTÍCIOS (nenhum dado real de prefeitura). */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u;

  VP.criarDadosExemplo = async () => {
    const rnd = u.prng(20261007);
    const escolhe = (lista) => lista[Math.floor(rnd() * lista.length)];
    const entre = (a, b) => a + rnd() * (b - a);
    const hoje = VP.Plataforma.hoje();
    const anoAtual = Number(hoje.slice(0, 4));
    const implantacao = `${anoAtual - 1}-12`; // sistema "implantado" em dezembro do ano passado
    const ultimoMesFechado = u.somaMeses(hoje.slice(0, 7), -2);
    const D = { entidades: [], contas: [], classificacoes: [], produtos: [], unidades: [], responsaveis: [], fornecedores: [], motivos: [], seguradoras: [], tiposGarantia: [], comissoes: [], bens: [], eventos: [], itensIncorporar: [], transferencias: [], meta: [] };
    const add = (col, obj) => { D[col].push(obj); return obj; };

    // ---- entidades e contas (códigos de exemplo)
    const E1 = add('entidades', { id: 'E1', nome: 'Prefeitura Municipal de Exemplo' });
    add('entidades', { id: 'E2', nome: 'Fundo Municipal de Saúde (exemplo)' });
    add('entidades', { id: 'E3', nome: 'Fundo Municipal de Educação (exemplo)' });
    const conta = (id, codigo, nome, tipo) => add('contas', { id, codigo, nome, tipo });
    conta('C_MAQ', '1.2.3.1.1.01', 'Máquinas, aparelhos e equipamentos', 'ativo');
    conta('C_INF', '1.2.3.1.1.02', 'Equipamentos de informática', 'ativo');
    conta('C_MOV', '1.2.3.1.1.03', 'Mobiliário em geral', 'ativo');
    conta('C_VEI', '1.2.3.1.1.05', 'Veículos', 'ativo');
    conta('C_IMO', '1.2.3.2.1.01', 'Edificações', 'ativo');
    conta('C_TER', '1.2.3.2.1.02', 'Terrenos', 'ativo');
    conta('C_INFRA', '1.2.3.2.1.03', 'Bens de infraestrutura', 'ativo');
    conta('C_INT', '1.2.4.1.1.01', 'Softwares', 'ativo');
    conta('C_DEP_MOV', '1.2.3.8.1.01', '(-) Depreciação acumulada de bens móveis', 'depreciacao');
    conta('C_DEP_IMO', '1.2.3.8.1.02', '(-) Depreciação acumulada de bens imóveis', 'depreciacao');
    conta('C_AMORT', '1.2.4.8.1.01', '(-) Amortização acumulada de intangíveis', 'depreciacao');
    conta('C_VPD', '3.3.3.1.1.01', 'Despesa com depreciação e amortização', 'resultado');

    // ---- classificações (grupo > classe > subclasse)
    let nCl = 0;
    const cl = (nome, paiId, extra = {}) => add('classificacoes', Object.assign({ id: 'CL' + (++nCl), codigo: String(nCl).padStart(3, '0'), nome, paiId: paiId || '', nivel: paiId ? (D.classificacoes.find((c) => c.id === paiId).paiId ? 'subclasse' : 'classe') : 'grupo' }, extra));
    const gMov = cl('Bens móveis', '', { tipoBem: 'movel', contaDepreciacaoId: 'C_DEP_MOV' });
    const cMob = cl('Mobiliário', gMov.id, { contaId: 'C_MOV', vidaUtilMeses: 120, residualPct: 10 });
    const sCad = cl('Cadeiras', cMob.id), sMes = cl('Mesas', cMob.id), sArm = cl('Armários e estantes', cMob.id);
    const cInf = cl('Informática', gMov.id, { contaId: 'C_INF', vidaUtilMeses: 60, residualPct: 10 });
    const sCom = cl('Computadores', cInf.id), sImp = cl('Impressoras', cInf.id), sMon = cl('Monitores', cInf.id);
    const cMaq = cl('Máquinas e equipamentos', gMov.id, { contaId: 'C_MAQ', vidaUtilMeses: 120, residualPct: 10 });
    const sAr = cl('Ar-condicionado', cMaq.id), sEle = cl('Eletrodomésticos', cMaq.id), sMed = cl('Equipamentos de saúde', cMaq.id), sFer = cl('Ferramentas e máquinas', cMaq.id);
    const gVei = cl('Veículos', '', { tipoBem: 'veiculo', contaId: 'C_VEI', contaDepreciacaoId: 'C_DEP_MOV', vidaUtilMeses: 60, residualPct: 20 });
    const sAuto = cl('Automóveis', gVei.id), sCam = cl('Caminhonetes', gVei.id), sVan = cl('Vans e micro-ônibus', gVei.id);
    const gImo = cl('Bens imóveis', '', { tipoBem: 'imovel', contaDepreciacaoId: 'C_DEP_IMO' });
    const cEdi = cl('Edificações', gImo.id, { contaId: 'C_IMO', vidaUtilMeses: 600, residualPct: 10 });
    const sEsc = cl('Escolas', cEdi.id), sSau = cl('Unidades de saúde', cEdi.id), sAdm = cl('Prédios administrativos', cEdi.id);
    const cTer = cl('Terrenos', gImo.id, { contaId: 'C_TER', naoDeprecia: true });
    const gInfra = cl('Infraestrutura', '', { tipoBem: 'infraestrutura', contaId: 'C_INFRA', contaDepreciacaoId: 'C_DEP_IMO', vidaUtilMeses: 300, residualPct: 0 });
    const sVia = cl('Vias públicas', gInfra.id), sPon = cl('Pontes', gInfra.id);
    const gInt = cl('Intangíveis', '', { tipoBem: 'intangivel', contaId: 'C_INT', contaDepreciacaoId: 'C_AMORT', vidaUtilMeses: 60, residualPct: 0 });
    const sSof = cl('Softwares e licenças', gInt.id);

    // ---- produtos (catálogo)
    let nPr = 0;
    const pr = (nome, clId, faixa) => add('produtos', { id: 'P' + (++nPr), codigo: String(5000 + nPr), nome, classificacaoId: clId, faixa });
    const prods = [
      pr('Mesa de professor', sMes.id, [350, 900]), pr('Cadeira escolar', sCad.id, [90, 260]), pr('Computador de mesa', sCom.id, [2800, 5200]),
      pr('Ar-condicionado 12.000 BTUs', sAr.id, [1900, 3200]), pr('Armário de aço', sArm.id, [600, 1400]), pr('Maca hospitalar', sMed.id, [1500, 4200]),
      pr('Geladeira de vacinas', sMed.id, [6000, 14000]), pr('Compressor de ar', sFer.id, [1800, 4500]),
      pr('Cadeira fixa estofada', sCad.id, [120, 380]), pr('Cadeira giratória', sCad.id, [380, 900]), pr('Mesa de reunião', sMes.id, [900, 2400]),
      pr('Estante de aço', sArm.id, [300, 800]), pr('Notebook', sCom.id, [3200, 6500]), pr('Impressora multifuncional', sImp.id, [900, 3800]),
      pr('Monitor 24 polegadas', sMon.id, [700, 1300]), pr('Geladeira doméstica', sEle.id, [1800, 3500]), pr('Bebedouro industrial', sEle.id, [900, 2400]),
      pr('Autoclave', sMed.id, [5000, 12000]), pr('Roçadeira', sFer.id, [900, 2200])
    ];
    const prodPor = (nome) => prods.find((p) => p.nome === nome);

    // ---- unidades (4 primeiras com os mesmos nomes do aplicativo de campo)
    const un = (id, codigo, nome, tipo, bairro) => add('unidades', { id, codigo, nome, tipo, cidade: 'Cidade Exemplo', bairro, logradouro: 'Rua Exemplo, ' + (100 + D.unidades.length * 37) });
    un('U1', '02.001', 'Escola Municipal Exemplo A', 'Escola', 'Jardim');
    un('U2', '02.002', 'Escola Municipal Exemplo B', 'Escola', 'Vila Nova');
    un('U3', '03.001', 'Posto de Saúde Centro (exemplo)', 'Saúde', 'Centro');
    un('U4', '04.001', 'Garagem Municipal (exemplo)', 'Garagem', 'Distrito Industrial');
    un('U5', '01.001', 'Secretaria de Administração', 'Administrativo', 'Centro');
    un('U6', '01.002', 'Departamento de Patrimônio', 'Administrativo', 'Centro');
    un('U7', '03.002', 'Secretaria de Saúde', 'Saúde', 'Centro');
    const nomesResp = ['Ana Ribeiro', 'Bruno Carvalho', 'Carla Mendes', 'Diego Prado', 'Elisa Moraes', 'Fábio Lima', 'Gabriela Torres', 'Hugo Martins'];
    nomesResp.forEach((n, i) => add('responsaveis', { id: 'R' + (i + 1), nome: n + ' (fictício)', matricula: String(10100 + i * 7), cargo: i < 4 ? 'Diretor(a) de unidade' : 'Servidor(a)' }));
    D.unidades.forEach((x, i) => { x.responsavelId = 'R' + ((i % 8) + 1); });
    ['Comercial Exemplo Ltda', 'Informática Modelo S.A.', 'Móveis Demonstração Ltda', 'Auto Peças Fictícia', 'Refrigeração Teste ME', 'Construtora Exemplo Ltda']
      .forEach((n, i) => add('fornecedores', { id: 'F' + (i + 1), nome: n, documento: `00.000.00${i}/0001-0${i}` }));
    const motivos = { baixa: ['Inservível', 'Quebra sem conserto', 'Obsolescência', 'Furto ou roubo', 'Leilão'], manutencao: ['Preventiva', 'Corretiva'], desuso: ['Sem uso na unidade', 'Aguardando conserto', 'Obsoleto'], transferencia: ['Remanejamento', 'Empréstimo', 'Conserto externo'] };
    for (const [tipo, lista] of Object.entries(motivos)) lista.forEach((n) => add('motivos', { id: 'M' + D.motivos.length, tipo, nome: n }));
    add('seguradoras', { id: 'S1', nome: 'Seguradora Exemplo S.A.' });
    add('seguradoras', { id: 'S2', nome: 'Corretora Modelo Ltda', corretora: true });
    add('tiposGarantia', { id: 'TG1', nome: 'Garantia do fabricante' });
    add('tiposGarantia', { id: 'TG2', nome: 'Garantia estendida' });
    add('comissoes', { id: 'K1', nome: `Comissão de Inventário e Avaliação ${anoAtual}`, ato: `Portaria 000/${anoAtual} (exemplo)`, membros: 'Ana Ribeiro, Bruno Carvalho, Carla Mendes (fictícios)' });

    // ---- bens
    let codigo = 0;
    const dataAleatoria = (anoDe, anoAte) => {
      const a = Math.floor(entre(anoDe, anoAte + 1));
      const m = Math.floor(entre(1, 13));
      const d = Math.floor(entre(1, 28));
      const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return iso > hoje ? u.somaDias(hoje, -40) : iso;
    };
    const novoBem = (o) => {
      const grupo = (() => { let c = D.classificacoes.find((x) => x.id === o.classificacaoId); while (c && c.paiId) c = D.classificacoes.find((x) => x.id === c.paiId); return c; })();
      const herda = (k) => { let c = D.classificacoes.find((x) => x.id === o.classificacaoId); while (c) { if (c[k] != null && c[k] !== '') return c[k]; c = D.classificacoes.find((x) => x.id === c.paiId); } return undefined; };
      codigo++;
      const unidade = D.unidades.find((x) => x.id === o.unidadeId);
      const b = Object.assign({
        id: 'B' + codigo, codigo, plaqueta: String(1000 + codigo), plaquetaAnterior: '', tipo: herda('tipoBem') || grupo?.tipoBem || 'movel',
        status: 'ativo', estado: 4, responsavelId: unidade?.responsavelId || '', responsaveisAdicionais: [], localizacao: '',
        dataAquisicao: o.dataAquisicao, dataIncorporacao: o.dataAquisicao, situacaoAquisicao: 'Compra', comissaoId: '', exerciciosAnteriores: false,
        entidadeId: 'E1', fornecedorId: 'F' + (1 + Math.floor(rnd() * 6)), contaId: herda('contaId') || '',
        origem: { empenho: `${o.dataAquisicao.slice(0, 4)}/${Math.floor(entre(100, 2999))}`, item: '', quantidade: 1, licitacao: { modalidade: 'Pregão eletrônico', processo: `${Math.floor(entre(10, 300))}/${o.dataAquisicao.slice(0, 4)}` } },
        nf: { numero: String(Math.floor(entre(1000, 99999))), serie: '1', emissao: o.dataAquisicao },
        detalhes: { marca: '', modelo: '', cor: '', serie: '', rfid: '', tombamento: String(codigo), dataTombamento: o.dataAquisicao, textoJuridico: {} },
        endereco: null, medidas: [], veiculo: null, seguro: null, garantia: null, fotos: [], anexos: [], criticidade: 2,
        depreciacao: {
          automatica: !herda('naoDeprecia'), metodo: 'linear', inicio: u.somaMeses(o.dataAquisicao, 1) + '-01',
          vidaUtilMeses: herda('vidaUtilMeses') || 0, residualTipo: 'percentual', residual: herda('residualPct') ?? 0,
          producaoTotal: 0, contaDebito: 'C_VPD', contaCredito: herda('contaDepreciacaoId') || ''
        }
      }, o);
      delete b.valor;
      D.bens.push(b);
      D.eventos.push(VP.novoEvento(b.id, 'incorporacao', { data: b.dataIncorporacao, valor: o.valor, descricao: `Incorporação — ${b.situacaoAquisicao}`, extra: { contaDebito: b.contaId } }));
      return b;
    };
    // 1–8: os mesmos bens do aplicativo de campo (plaquetas 1001–1008)
    [['Mesa de professor', 'U1'], ['Cadeira escolar', 'U1'], ['Computador de mesa', 'U1'], ['Ar-condicionado 12.000 BTUs', 'U2'], ['Armário de aço', 'U2'], ['Maca hospitalar', 'U3'], ['Geladeira de vacinas', 'U3'], ['Compressor de ar', 'U4']]
      .forEach(([n, unidadeId]) => {
        const p = prodPor(n);
        novoBem({ descricao: n, complemento: n, produtoId: p.id, classificacaoId: p.classificacaoId, unidadeId, dataAquisicao: dataAleatoria(2014, anoAtual - 1), valor: Math.round(entre(...p.faixa)), estado: escolhe([3, 4, 4, 5]) });
      });
    const unidadesMoveis = ['U1', 'U2', 'U3', 'U5', 'U6', 'U7'];
    const cores = ['Preto', 'Cinza', 'Azul', 'Branco', 'Bege'];
    const marcas = ['Marca A', 'Marca B', 'Marca C', 'Marca D'];
    for (let i = 0; i < 78; i++) {
      const p = prods[8 + Math.floor(rnd() * (prods.length - 8))] || escolhe(prods);
      const unidadeId = p.classificacaoId === sMed.id || p.nome === 'Autoclave' ? escolhe(['U3', 'U7']) : escolhe(unidadesMoveis);
      const b = novoBem({ descricao: p.nome, complemento: p.nome, produtoId: p.id, classificacaoId: p.classificacaoId, unidadeId, dataAquisicao: dataAleatoria(2008, anoAtual), valor: Math.round(entre(...p.faixa)), estado: escolhe([1, 2, 3, 3, 4, 4, 4, 5, 5]) });
      b.detalhes.marca = escolhe(marcas); b.detalhes.cor = escolhe(cores); b.detalhes.modelo = 'Modelo ' + Math.floor(entre(1, 40));
      if (b.tipo === 'movel' && [sCom.id, sImp.id, sMon.id].includes(b.classificacaoId)) {
        b.detalhes.serie = 'SN' + Math.floor(entre(100000, 999999));
        if (b.dataAquisicao >= `${anoAtual - 1}-01-01`) b.garantia = { fornecedorId: b.fornecedorId, tipoId: 'TG1', inicio: b.dataAquisicao, termino: u.somaDias(b.dataAquisicao, 365 + Math.floor(entre(0, 400))), observacao: '' };
      }
    }
    // veículos (o TST1A01 é o mesmo do aplicativo de campo)
    const veics = [['TST1A01', 'Carro popular 1.0 (exemplo)', sAuto.id, 'Gasolina', 2019], ['TST2A01', 'Caminhonete diesel (exemplo)', sCam.id, 'Diesel', 2016], ['TST2A02', 'Van de passageiros (exemplo)', sVan.id, 'Diesel', 2014], ['TST2A03', 'Carro sedan (exemplo)', sAuto.id, 'Flex', 2022], ['TST2A04', 'Micro-ônibus escolar (exemplo)', sVan.id, 'Diesel', 2018], ['TST2A05', 'Carro popular 1.0 (exemplo)', sAuto.id, 'Flex', 2024]];
    for (const [placa, nome, clId, comb, ano] of veics) {
      const b = novoBem({ descricao: nome, complemento: nome, classificacaoId: clId, unidadeId: 'U4', dataAquisicao: dataAleatoria(ano, ano), valor: Math.round(entre(65000, 280000)), estado: escolhe([3, 4, 4, 5]) });
      b.veiculo = { placa, renavam: String(Math.floor(entre(10000000000, 99999999999))), chassi: '9BW' + Math.floor(entre(1e9, 9e9)), combustivel: comb, anoModelo: ano, capacidadeTanque: clId === sAuto.id ? 50 : 80 };
      const termino = u.somaDias(hoje, Math.floor(entre(-20, 120)));
      b.seguro = { seguradoraId: 'S1', corretoraId: 'S2', apolice: 'AP-' + Math.floor(entre(10000, 99999)), adesao: u.somaDias(termino, -365), inicio: u.somaDias(termino, -365), termino, valor: Math.round(entre(1800, 6500)), franquia: Math.round(entre(2000, 9000)) };
      b.criticidade = 3;
    }
    // imóveis, infraestrutura e intangíveis
    const imoveis = [['Prédio da Escola Municipal Exemplo A', sEsc.id, 'U1', 1998, 1850000, 'Jardim'], ['Prédio da Escola Municipal Exemplo B', sEsc.id, 'U2', 2005, 2400000, 'Vila Nova'], ['Prédio do Posto de Saúde Centro', sSau.id, 'U3', 2010, 1300000, 'Centro'], ['Prédio da Prefeitura (exemplo)', sAdm.id, 'U5', 1990, 4200000, 'Centro'], ['Terreno da Garagem Municipal', cTer.id, 'U4', 2001, 680000, 'Distrito Industrial'], ['Terreno área institucional — Loteamento Exemplo', cTer.id, 'U6', 2019, 240000, 'Jardim']];
    for (const [nome, clId, unidadeId, ano, valor, bairro] of imoveis) {
      const b = novoBem({ descricao: nome, complemento: nome, classificacaoId: clId, unidadeId, dataAquisicao: `${ano}-0${1 + Math.floor(rnd() * 8)}-15`, valor, estado: escolhe([3, 4, 4]), situacaoAquisicao: nome.includes('Loteamento') ? 'Loteamento (área pública)' : (ano < 2000 ? 'Construção / obra' : 'Compra') });
      b.endereco = { cidade: 'Cidade Exemplo', bairro, logradouro: 'Rua Exemplo, ' + Math.floor(entre(10, 900)) };
      b.medidas = [{ nome: 'Área do terreno (m²)', valor: String(Math.floor(entre(400, 8000))) }, { nome: 'Área construída (m²)', valor: clId === cTer.id ? '0' : String(Math.floor(entre(300, 3000))) }];
      b.imovel = { matricula: 'Matrícula ' + Math.floor(entre(1000, 30000)), cartorio: 'Registro de Imóveis (exemplo)', situacaoRegistro: escolhe(['Registrado', 'Registrado', 'Em regularização', 'Sem registro']), uso: clId === cTer.id ? 'Dominical' : 'Uso especial' };
      if (clId !== cTer.id) b.seguro = { seguradoraId: 'S1', corretoraId: '', apolice: 'IM-' + Math.floor(entre(1000, 9999)), adesao: `${anoAtual}-01-10`, inicio: `${anoAtual}-01-10`, termino: u.somaDias(hoje, Math.floor(entre(10, 300))), valor: Math.round(valor * 0.004), franquia: Math.round(valor * 0.01) };
      b.criticidade = 3;
    }
    for (const [nome, clId, ano, valor] of [['Rua Exemplo — trecho entre Av. A e Av. B', sVia.id, 2012, 920000], ['Avenida Modelo — trecho 2', sVia.id, 2018, 1350000], ['Ponte sobre o Rio Exemplo', sPon.id, 2009, 2100000]]) {
      const b = novoBem({ descricao: nome, complemento: nome, classificacaoId: clId, unidadeId: 'U6', dataAquisicao: `${ano}-06-30`, valor, estado: escolhe([3, 4]), situacaoAquisicao: 'Construção / obra' });
      b.endereco = { cidade: 'Cidade Exemplo', bairro: escolhe(['Centro', 'Jardim']), logradouro: nome.split(' — ')[0] };
    }
    for (const [nome, ano, valor] of [['Licença de sistema de escritório (50 usuários)', anoAtual - 3, 48000], ['Software de geoprocessamento (exemplo)', anoAtual - 1, 72000], ['Sistema de agendamento de saúde (exemplo)', anoAtual - 2, 36000]]) {
      novoBem({ descricao: nome, complemento: nome, classificacaoId: sSof.id, unidadeId: escolhe(['U5', 'U7']), dataAquisicao: `${ano}-03-20`, valor });
    }
    // 2 bens sem responsável (aparece na central de pendências)
    D.bens[20].responsavelId = ''; D.bens[33].responsavelId = '';
    // situações diferentes
    for (const i of [11, 27, 45, 61]) { D.bens[i].status = 'desuso'; D.eventos.push(VP.novoEvento(D.bens[i].id, 'desuso', { data: u.somaDias(hoje, -Math.floor(entre(20, 300))), descricao: 'Sem uso na unidade' })); }
    D.bens[52].status = 'manutencao';

    // reavaliações antigas (veículos) e uma melhoria em escola
    const veiculos = D.bens.filter((b) => b.tipo === 'veiculo');
    for (const b of veiculos.slice(1, 3)) {
      D.eventos.push(VP.novoEvento(b.id, 'reavaliacao', { data: `${anoAtual - 2}-06-30`, valor: null, descricao: 'Reavaliação por laudo da comissão', extra: { valorAnterior: null, valorNovo: Math.round(entre(40000, 90000)), vidaUtilMeses: 48, residual: 8000, laudo: 'Laudo 00/' + (anoAtual - 2) } }));
    }
    const escolaA = D.bens.find((b) => b.descricao.startsWith('Prédio da Escola Municipal Exemplo A'));
    D.eventos.push(VP.novoEvento(escolaA.id, 'agregacao', { data: `${anoAtual - 1}-07-20`, valor: 320000, descricao: 'Ampliação: 2 salas de aula (melhoria)', extra: { tipoGasto: 'melhoria' } }));

    // grava tudo para os cálculos enxergarem
    await VP.db.gravarVarias(D);

    // depreciação acumulada até a implantação (um lançamento por bem)
    const saldosIniciais = [];
    for (const b of D.bens) {
      if (VP.naoDeprecia(b)) continue;
      const s = VP.saldo(b, u.fimDoMes(implantacao));
      if (!s.inicio || !s.vidaUtilMeses || s.inicio > implantacao) continue;
      const meses = Math.min(s.vidaUtilMeses, u.mesesEntre(s.inicio, implantacao) + 1);
      const v = Math.round(s.depreciavel * meses / s.vidaUtilMeses * 100) / 100;
      if (v > 0) saldosIniciais.push(VP.novoEvento(b.id, 'depreciacao', { data: u.fimDoMes(implantacao), valor: v, descricao: 'Depreciação acumulada até a implantação do sistema', extra: { saldoInicial: true } }));
    }
    for (const e of saldosIniciais) e.contabilizado = true;
    await VP.db.gravarVarias({ eventos: saldosIniciais });
    // incorporações antigas já foram contabilizadas
    for (const e of D.eventos) if (e.data <= u.fimDoMes(implantacao)) e.contabilizado = true;
    await VP.db.gravarVarias({ eventos: D.eventos });

    // fechamentos mensais de janeiro até o mês retrasado
    for (let ym = u.somaMeses(implantacao, 1); ym <= ultimoMesFechado; ym = u.somaMeses(ym, 1)) {
      const f = await VP.aplicarFechamento(ym);
      if (ym < u.somaMeses(ultimoMesFechado, -1)) {
        for (const e of VP.db.lista('eventos').filter((x) => x.loteId === f.loteId)) e.contabilizado = true;
      }
    }
    await VP.db.gravarVarias({ eventos: VP.db.lista('eventos').filter((e) => e.contabilizado) });

    // baixas no ano (depois da implantação)
    const baixas = [];
    for (const [i, motivo, tipoBaixa] of [[14, 'Quebra sem conserto', 'Inservível'], [38, 'Furto ou roubo', 'Furto / roubo'], [70, 'Leilão', 'Alienação (leilão)']]) {
      const b = D.bens[i];
      let data = u.somaDias(hoje, -Math.floor(entre(20, 200)));
      if (data <= b.dataIncorporacao) data = u.somaDias(b.dataIncorporacao, 10) < hoje ? u.somaDias(b.dataIncorporacao, 10) : hoje;
      const s = VP.saldo(b, data);
      b.status = 'baixado';
      baixas.push(VP.novoEvento(b.id, 'baixa', { data, valor: s.liquido, descricao: `Baixa — ${tipoBaixa}`, extra: { motivo, tipoBaixa, documento: 'Processo ' + Math.floor(entre(100, 999)) + '/' + anoAtual } }));
      // depreciação lançada depois da data da baixa não vale
      for (const e of VP.db.lista('eventos').filter((x) => x.bemId === b.id && x.tipo === 'depreciacao' && x.data > data)) { e.cancelado = true; e.motivoCancelamento = 'Bem baixado'; baixas.push(e); }
    }
    // manutenções, despesas, vistorias, transferências e observações
    const ativos = D.bens.filter((b) => b.status !== 'baixado');
    const regs = [];
    for (let i = 0; i < 70; i++) {
      const b = escolhe(ativos);
      const data = u.somaDias(hoje, -Math.floor(entre(5, 540)));
      if (data < b.dataAquisicao) continue;
      const t = escolhe(['manutencao', 'manutencao', 'despesa', 'vistoria', 'observacao']);
      if (t === 'manutencao') regs.push(VP.novoEvento(b.id, 'manutencao', { data, valor: Math.round(entre(80, b.tipo === 'veiculo' ? 4800 : 900)), descricao: escolhe(['Troca de peças', 'Limpeza e revisão', 'Conserto', 'Revisão preventiva']), extra: { motivo: escolhe(['Preventiva', 'Corretiva']), fornecedorId: 'F' + (1 + Math.floor(rnd() * 6)) } }));
      else if (t === 'despesa') regs.push(VP.novoEvento(b.id, 'despesa', { data, valor: Math.round(entre(40, 1200)), descricao: escolhe(['Peças de reposição', 'Licença anual', 'Acessórios']), extra: { fornecedorId: 'F' + (1 + Math.floor(rnd() * 6)) } }));
      else if (t === 'vistoria') regs.push(VP.novoEvento(b.id, 'vistoria', { data, descricao: 'Vistoria de rotina', extra: { estado: b.estado } }));
      else regs.push(VP.novoEvento(b.id, 'observacao', { data, descricao: escolhe(['Bem com marcas de uso', 'Plaqueta trocada', 'Usado em evento externo e devolvido']) }));
    }
    for (const b of veiculos) {
      // km sempre subindo e consumo coerente (8 a 11 km/L), para os alertas da Frota fazerem sentido
      let km = Math.floor(entre(20000, 120000));
      const consumo = entre(8, 11);
      for (let k = 0; k < 8; k++) {
        const litros = Math.round(entre(25, Math.min(70, b.veiculo?.capacidadeTanque || 70)));
        km += Math.round(litros * consumo * entre(0.92, 1.08));
        regs.push(VP.novoEvento(b.id, 'abastecimento', { data: u.somaDias(hoje, -(7 - k) * 20 - 3 - Math.floor(entre(0, 3))), valor: Math.round(litros * entre(5.6, 6.4) * 100) / 100, descricao: `${litros} L`, extra: { litros, km, combustivel: b.veiculo?.combustivel } }));
      }
    }
    for (let i = 0; i < 8; i++) {
      const b = escolhe(ativos.filter((x) => x.tipo === 'movel'));
      const destino = escolhe(unidadesMoveis.filter((x) => x !== b.unidadeId));
      const dataT = u.somaDias(hoje, -Math.floor(entre(30, 500)));
      if (dataT <= b.dataAquisicao) continue;
      regs.push(VP.novoEvento(b.id, 'transferencia', { data: dataT, descricao: `Transferência interna: ${VP.nome('unidades', b.unidadeId)} → ${D.unidades.find((x) => x.id === destino).nome}`, extra: { de: b.unidadeId, para: destino } }));
      b.unidadeId = destino;
    }
    await VP.db.gravarVarias({ eventos: baixas.concat(regs), bens: D.bens });

    // itens comprados aguardando incorporação
    const itens = [
      { produto: 'Cadeira giratória', qtd: 10, vu: 489.9, ent: 'E1', inc: 0, liq: true },
      { produto: 'Notebook', qtd: 5, vu: 4590, ent: 'E3', inc: 2, liq: true },
      { produto: 'Geladeira de vacinas', qtd: 1, vu: 11800, ent: 'E2', inc: 0, liq: false },
      { produto: 'Ar-condicionado 12.000 BTUs', qtd: 2, vu: 2650, ent: 'E3', inc: 0, liq: true }
    ].map((x, i) => {
      const p = prodPor(x.produto);
      return { id: 'IT' + (i + 1), entidadeId: x.ent, ordemCompra: { ano: anoAtual, numero: 120 + i }, empenho: { ano: anoAtual, numero: 840 + i * 3, sub: 1, emissao: u.somaDias(hoje, -20 - i * 5) }, fornecedorId: 'F' + (1 + i), produtoId: p.id, descricao: p.nome, unidadeMedida: 'UN', quantidade: x.qtd, valorUnitario: x.vu, incorporados: x.inc, ativo: true, liquidado: x.liq };
    });
    await VP.db.gravar('itensIncorporar', itens);
    // uma transferência aguardando aceite
    const tb = ativos.filter((b) => b.unidadeId === 'U5').slice(0, 3);
    if (tb.length) await VP.db.gravar('transferencias', { id: 'T1', tipo: 'interna', bens: tb.map((b) => b.id), origemUnidadeId: 'U5', destinoUnidadeId: 'U1', responsavelDestinoId: 'R1', motivo: 'Remanejamento', data: u.somaDias(hoje, -3), situacao: 'pendente', observacao: '' });
    // Frota (fictícia): contrato de locação, 2 alugados, motoristas, abastecimentos, viagens, preventivas, multa e documentos
    const contrato = { id: 'CL1', numero: `018/${anoAtual - 1}`, empresa: 'Locadora Exemplo Ltda.', inicio: u.somaDias(hoje, -320), fim: u.somaDias(hoje, 45), valorMensal: 3200, franquiaKm: 2500, valorKmExcedente: 0.85, valorTotal: 3200 * 2 * 12, quemPaga: 'prefeitura', observacao: '1º aditivo: prorrogação por 12 meses (exemplo)' };
    const locados = [
      { id: 'VL1', placa: 'LOC1A23', marca: 'Fiat', modelo: 'Strada (exemplo)', ano: String(anoAtual - 1), combustivel: 'Flex', tanque: 55, kmInicial: 15000, contratoId: 'CL1', unidadeId: 'U3', situacao: 'ativo' },
      { id: 'VL2', placa: 'LOC2B34', marca: 'Volkswagen', modelo: 'Gol (exemplo)', ano: String(anoAtual - 2), combustivel: 'Flex', tanque: 50, kmInicial: 22000, contratoId: 'CL1', unidadeId: 'U1', situacao: 'ativo' }];
    const motoristas = [
      { id: 'M1', nome: 'Motorista Exemplo Um', cnh: '00000000001', categoria: 'D', validade: u.somaDias(hoje, 400), unidadeId: 'U3', cursos: 'Transporte de pacientes' },
      { id: 'M2', nome: 'Motorista Exemplo Dois', cnh: '00000000002', categoria: 'B', validade: u.somaDias(hoje, 20), unidadeId: 'U1', cursos: '' },
      { id: 'M3', nome: 'Motorista Exemplo Três', cnh: '00000000003', categoria: 'AB', validade: u.somaDias(hoje, -10), unidadeId: 'U4', cursos: '' }];
    const abast = [], viagens = [];
    for (const l of locados) {
      let km = l.kmInicial;
      for (let k = 0; k < 7; k++) {
        const litros = Math.round(entre(25, 45));
        km += Math.round(litros * entre(10.5, 12.5));
        abast.push({ id: `AB-${l.id}-${k}`, ref: 'L:' + l.id, data: u.somaDias(hoje, -(6 - k) * 15 - 2), hora: '08:' + String(10 + k * 5), litros, valor: Math.round(litros * entre(5.6, 6.3) * 100) / 100, km: k === 5 && l.id === 'VL2' ? km - 900 : km, combustivel: 'Gasolina', motoristaId: l.id === 'VL1' ? 'M1' : 'M2', posto: 'Posto Exemplo' });
      }
      let ks = l.kmInicial + 200;
      for (let k = 0; k < 4; k++) { const ida = Math.round(entre(40, 180)); viagens.push({ id: `VG-${l.id}-${k}`, ref: 'L:' + l.id, motoristaId: l.id === 'VL1' ? 'M1' : 'M2', saida: u.somaDias(hoje, -(4 - k) * 9), horaSaida: '07:30', kmSaida: ks, destino: escolhe(['Hospital regional', 'Escola do interior', 'Secretaria de Estado', 'Unidade de saúde']), motivo: 'Serviço', retorno: u.somaDias(hoje, -(4 - k) * 9), horaRetorno: '17:00', kmRetorno: ks + ida }); ks += ida + 300; }
    }
    const v1 = veiculos[0];
    const planos = [
      v1 ? { id: 'PM1', ref: 'B:' + v1.id, item: 'Troca de óleo e filtro', cadaKm: 10000, cadaMeses: 6, ultimoKm: 0, ultimaData: u.somaDias(hoje, -200) } : null,
      { id: 'PM2', ref: 'L:VL1', item: 'Revisão', cadaKm: 10000, cadaMeses: 12, ultimoKm: 15000, ultimaData: u.somaDias(hoje, -150) }].filter(Boolean);
    const multas = v1 ? [{ id: 'MU1', ref: 'B:' + v1.id, data: u.somaDias(hoje, -20), auto: 'A00000001 (exemplo)', descricao: 'Excesso de velocidade até 20%', valor: 130.16, prazoIndicacao: u.somaDias(hoje, 5), motoristaId: '', situacao: 'aberta' }] : [];
    const docs = veiculos.map((b, i) => ({ id: 'DV' + i, ref: 'B:' + b.id, tipo: 'Licenciamento (CRLV)', vencimento: u.somaDias(hoje, i === 0 ? 12 : 60 + i * 30), observacao: '' }));
    await VP.db.gravarVarias({ contratosLocacao: [contrato], veiculosLocados: locados, motoristas, abastecimentos: abast, viagens, planosManutencao: planos, multas, documentosVeiculo: docs });
    // Frota, segunda parte: pneus, uma reserva pedida e uma parada de veículo alugado (FICTÍCIOS)
    const pneus = v1 ? ['DE', 'DD', 'TE', 'TD'].map((pos, i) => ({ id: 'PN' + i, codigo: 'FOGO-00' + (i + 1), marca: 'Marca Exemplo 175/70 R14', medida: '175/70 R14', valor: 420, situacao: 'rodando', ref: 'B:' + v1.id, posicao: pos, kmInstalacao: VP.frota ? Math.max(0, VP.frota.kmAtual('B:' + v1.id) - 12000 - i * 1500) : 0, kmAcumulado: 0, recapagens: 0, historico: [] })).concat([{ id: 'PN4', codigo: 'FOGO-005', marca: 'Marca Exemplo 175/70 R14', medida: '175/70 R14', valor: 420, situacao: 'estoque', ref: '', posicao: '', kmInstalacao: null, kmAcumulado: 0, recapagens: 0, historico: [] }]) : [];
    const reservasVeiculo = [{ id: 'RV1', unidadeId: 'U3', solicitante: 'Coordenação do posto (exemplo)', ref: '', motoristaId: 'M2', data: u.somaDias(hoje, 2), horaInicio: '08:00', dataFim: u.somaDias(hoje, 2), horaFim: '12:00', destino: 'Hospital regional (exemplo)', motivo: 'Levar exames', situacao: 'pedida', historico: [] }];
    const mesPassado = u.somaMeses(hoje.slice(0, 7), -1);
    const paradasVeiculo = [{ id: 'PV1', ref: 'L:VL1', inicio: `${mesPassado}-10`, fim: `${mesPassado}-13`, motivo: 'Oficina da locadora (exemplo)', substituto: false, contaDesconto: true }];
    contrato.descontaParada = true;
    await VP.db.gravarVarias({ pneus, reservasVeiculo, paradasVeiculo, contratosLocacao: [contrato] });
    // Imóveis (etapa 5): documentos, cessões e pendências FICTÍCIOS
    const ims = VP.db.lista('bens').filter((b) => b.tipo === 'imovel');
    const documentosImovel = [], cessoesImovel = [], pendenciasImovel = [];
    ims.forEach((b, i) => {
      b.imovel.lat = Number((-27.2050 - i * 0.0031).toFixed(6)); b.imovel.lon = Number((-49.6380 - (i % 3) * 0.0042).toFixed(6)); // localização FICTÍCIA
      b.imovel.afetado = b.imovel.uso !== 'Dominical';
      b.imovel.areaTerreno = Number((b.medidas || []).find((m) => /terreno/i.test(m.nome))?.valor) || null;
      b.imovel.areaConstruida = Number((b.medidas || []).find((m) => /constru/i.test(m.nome))?.valor) || null;
      if (b.imovel.situacaoRegistro !== 'Registrado') {
        b.imovel.motivoPendencia = i % 2 ? 'Área recebida de loteamento sem matrícula aberta (exemplo)' : '';
        pendenciasImovel.push({ id: 'PI' + i, bemId: b.id, descricao: 'Pedir abertura de matrícula no cartório (exemplo)', responsavelId: 'R1', prazo: u.somaDias(hoje, i % 2 ? -10 : 45), situacao: 'aberta', abertaEm: u.somaDias(hoje, -60), historico: [] });
      }
      if (b.imovel.uso === 'Uso especial') {
        documentosImovel.push({ id: 'DI' + i + 'a', bemId: b.id, tipo: 'AVCB (Corpo de Bombeiros)', numero: 'AVCB ' + (1000 + i) + ' (exemplo)', emissao: u.somaDias(hoje, -700), validade: u.somaDias(hoje, i === 0 ? -15 : 30 + i * 90), orgao: 'Corpo de Bombeiros (exemplo)', arquivos: [] });
        documentosImovel.push({ id: 'DI' + i + 'b', bemId: b.id, tipo: 'Habite-se', numero: 'HB ' + (200 + i) + ' (exemplo)', emissao: u.somaDias(hoje, -3000), validade: '', orgao: 'Prefeitura (exemplo)', arquivos: [] });
      }
    });
    if (ims[4]) cessoesImovel.push({ id: 'CI1', bemId: ims[4].id, tipo: 'comodato', direcao: 'a-terceiros', parte: 'Associação de Moradores Exemplo', instrumento: 'Termo de comodato 01/2022 (exemplo)', inicio: u.somaDias(hoje, -900), fim: u.somaDias(hoje, 40), finalidade: 'Sede da associação', historico: [] });
    if (ims[0]) cessoesImovel.push({ id: 'CI2', bemId: ims[0].id, tipo: 'cessao', direcao: 'a-terceiros', parte: 'Governo do Estado (exemplo)', instrumento: 'Termo de cessão 03/2020 (exemplo)', inicio: u.somaDias(hoje, -2000), fim: u.somaDias(hoje, -30), finalidade: 'Turno noturno de escola estadual', historico: [] });
    await VP.db.gravarVarias({ bens: ims, documentosImovel, cessoesImovel, pendenciasImovel });
    // Manutenção (etapa 6): equipes, planos preventivos e chamados FICTÍCIOS
    const equipes = [{ id: 'EQ1', nome: 'Equipe de manutenção predial (exemplo)', area: 'Obras e elétrica', liderId: 'R1', membros: ['R1', 'R2'] }, { id: 'EQ2', nome: 'Equipe de climatização (exemplo)', area: 'Ar-condicionado', liderId: 'R3', membros: ['R3'] }];
    const planosPreventiva = [
      { id: 'PP1', item: 'Limpeza do ar-condicionado (PMOC)', unidadeId: 'U1', bemId: '', cadaMeses: 3, antecedenciaDias: 15, ultimaData: u.somaDias(hoje, -100), equipeId: 'EQ2', custoPrevisto: 450, base: 'Lei 13.589/2018 — conferir detalhes', ativo: true, historico: [] },
      { id: 'PP2', item: 'Limpeza da caixa d\'água', unidadeId: 'U3', bemId: '', cadaMeses: 6, antecedenciaDias: 15, ultimaData: u.somaDias(hoje, -60), equipeId: 'EQ1', custoPrevisto: 300, base: 'Normas sanitárias — conferir', ativo: true, historico: [] },
      { id: 'PP3', item: 'Recarga e inspeção de extintores', unidadeId: 'U5', bemId: '', cadaMeses: 12, antecedenciaDias: 30, ultimaData: u.somaDias(hoje, -300), equipeId: 'EQ1', custoPrevisto: 900, base: 'Corpo de Bombeiros — conferir', ativo: true, historico: [] }];
    const chamados = [
      { id: 'CH1', numero: `1/${anoAtual}`, tipo: 'conserto', origem: 'unidade', prioridade: 'alta', unidadeId: 'U1', bemId: '', descricao: 'Goteira na sala 3 (exemplo)', solicitante: 'Direção da escola (exemplo)', custoPrevisto: 1200, equipeId: 'EQ1', responsavelId: 'R1', prazo: u.somaDias(hoje, -2), situacao: 'campo', abertoEm: u.somaDias(hoje, -12), historico: [], fotos: [] },
      { id: 'CH2', numero: `2/${anoAtual}`, tipo: 'pedido', origem: 'unidade', prioridade: 'normal', unidadeId: 'U3', bemId: '', descricao: 'Instalar suporte para TV na recepção (exemplo)', solicitante: 'Coordenação do posto (exemplo)', custoPrevisto: 150, equipeId: '', responsavelId: '', prazo: u.somaDias(hoje, 10), situacao: 'aberto', abertoEm: u.somaDias(hoje, -3), historico: [], fotos: [] },
      { id: 'CH3', numero: `3/${anoAtual}`, tipo: 'reforma', origem: 'unidade', prioridade: 'normal', unidadeId: 'U5', bemId: '', descricao: 'Pintura do corredor (exemplo)', solicitante: 'Administração (exemplo)', custoPrevisto: 3500, custoRealizado: 3280, equipeId: 'EQ1', responsavelId: 'R2', prazo: u.somaDias(hoje, -20), situacao: 'concluido', abertoEm: u.somaDias(hoje, -50), concluidoEm: u.somaDias(hoje, -22), historico: [], fotos: [] }];
    await VP.db.gravarVarias({ equipes, planosPreventiva, chamados });
    // Itens de controle (fora do balancete) FICTÍCIOS: pequeno valor ou pouca durabilidade
    const ic = (n, descricao, quantidade, valorUnitario, unidadeId, localizacao, diasAtras, vidaUtilAnos) => ({ id: 'IC' + n, codigo: 'C-' + String(n).padStart(6, '0'), descricao, quantidade, valorUnitario, unidadeId, localizacao, responsavelId: '', dataEntrada: u.somaDias(hoje, -diasAtras), vidaUtilAnos, estado: 4, fornecedorId: '', nf: {}, observacao: '', situacao: 'ativo', fotos: [], anexos: [], historico: [{ data: VP.Plataforma.agoraISO(), descricao: 'Incluído (dados de exemplo)', usuario: 'demonstração' }], criadoEm: VP.Plataforma.agoraISO() });
    await VP.db.gravarVarias({ bensControle: [ic(1, 'Grampeador de mesa', 12, 38.9, 'U5', 'Protocolo', 400, 3), ic(2, 'Lixeira com pedal 50 L', 8, 119, 'U1', 'Corredores', 900, 2), ic(3, 'Ventilador de mesa 30 cm', 4, 189.9, 'U3', 'Recepção', 200, 3), ic(4, 'Garrafa térmica 1 L', 6, 45, 'U2', 'Copa', 1200, 2)] });
    await VP.salvarConfig(Object.assign({}, VP.CONFIG_PADRAO, { usuarioResponsavelId: 'R6', unidadePatrimonio: 'U6', unidadeSolicitacaoBaixa: 'U6' }));
    // Os exemplos foram escritos na escala antiga (6 níveis): passam para a de 8 aqui mesmo
    await VP.converterEscalaEstados();
    await VP.db.gravar('meta', { id: 'semente', criadoEm: VP.Plataforma.agoraISO(), ficticio: true });
    VP.invalidarIndice();
  };
})();
