/* VitalPat Patrimônio · Gestão — Frota de veículos (referência: GAX da 3ia; requisitos FR-01 a FR-17 do DOSSIE.md A1.14).
   Veículo próprio é bem patrimonial (fica em "bens", tipo veículo). Veículo alugado NÃO é patrimônio: fica em "veiculosLocados".
   Abastecimento de veículo próprio vira evento do bem (entra nos custos do patrimônio); de alugado fica em "abastecimentos". */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui, G = VP.graficos, L = VP.LISTAS;
  const T = VP.telas = VP.telas || {};
  const F = VP.frota = {};

  F.COLECOES = { veiculosLocados: 'Veículo alugado', abastecimentos: 'Abastecimento (alugado)', viagens: 'Viagem (diário de bordo)', contratosLocacao: 'Contrato de locação', motoristas: 'Motorista', planosManutencao: 'Manutenção preventiva', multas: 'Multa', documentosVeiculo: 'Documento do veículo' };
  const COMBUSTIVEIS = ['Gasolina', 'Etanol', 'Flex', 'Diesel', 'Elétrico', 'GNV'];
  const SITUACAO = { ativo: 'Em uso', parado: 'Parado', manutencao: 'Em manutenção' };
  const hoje = () => VP.Plataforma.hoje();
  const mesAtual = () => hoje().slice(0, 7);
  const opc = (col) => VP.db.lista(col).sort((a, b) => String(a.nome || a.numero || '').localeCompare(String(b.nome || b.numero || ''), 'pt-BR')).map((x) => [x.id, x.nome || x.numero]);

  // ------------------------------------------------------------------ veículos (próprios + alugados) num formato só
  F.veiculos = () => {
    const proprios = VP.db.lista('bens').filter((b) => b.tipo === 'veiculo' && b.status !== 'baixado').map((b) => ({
      ref: 'B:' + b.id, origem: 'proprio', placa: b.veiculo?.placa || '—', modelo: b.descricao, combustivel: b.veiculo?.combustivel || '', tanque: Number(b.veiculo?.capacidadeTanque) || null,
      unidadeId: b.unidadeId, situacao: b.status === 'manutencao' ? 'manutencao' : b.status === 'ativo' ? 'ativo' : 'parado', bem: b, kmInicial: 0
    }));
    const locados = VP.db.lista('veiculosLocados').map((x) => ({
      ref: 'L:' + x.id, origem: 'locado', placa: x.placa, modelo: `${x.marca || ''} ${x.modelo || ''}`.trim() || 'Veículo alugado', combustivel: x.combustivel || '', tanque: Number(x.tanque) || null,
      unidadeId: x.unidadeId, situacao: x.situacao || 'ativo', locado: x, contratoId: x.contratoId, kmInicial: Number(x.kmInicial) || 0
    }));
    return proprios.concat(locados).sort((a, b) => a.placa.localeCompare(b.placa));
  };
  F.veiculo = (ref) => F.veiculos().find((v) => v.ref === ref) || null;
  const nomeVeiculo = (ref) => { const v = F.veiculo(ref); return v ? `${v.placa} · ${v.modelo}` : '—'; };
  const opcVeiculos = () => F.veiculos().map((v) => [v.ref, `${v.placa} · ${v.modelo}${v.origem === 'locado' ? ' (alugado)' : ''}`]);

  // ------------------------------------------------------------------ abastecimentos (próprios: eventos do bem; alugados: coleção própria)
  F.abastecimentos = () => {
    const daFrota = VP.db.lista('abastecimentos').map((a) => Object.assign({ fonte: 'abastecimentos' }, a));
    const proprios = new Map(VP.db.lista('bens').filter((b) => b.tipo === 'veiculo').map((b) => [b.id, b]));
    const dosBens = VP.db.lista('eventos').filter((e) => e.tipo === 'abastecimento' && !e.cancelado && proprios.has(e.bemId)).map((e) => ({
      fonte: 'eventos', id: e.id, ref: 'B:' + e.bemId, data: e.data, hora: e.dados?.hora || '', litros: Number(e.dados?.litros) || 0, valor: Number(e.valor) || 0,
      km: Number(e.dados?.km) || 0, combustivel: e.dados?.combustivel || '', motoristaId: e.dados?.motoristaId || '', posto: e.dados?.posto || ''
    }));
    return daFrota.concat(dosBens).sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
  };
  F.viagens = () => VP.db.lista('viagens').sort((a, b) => (a.saida + (a.horaSaida || '')).localeCompare(b.saida + (b.horaSaida || '')));
  F.kmAtual = (ref) => {
    const v = F.veiculo(ref);
    const kms = [v?.kmInicial || 0].concat(F.abastecimentos().filter((a) => a.ref === ref).map((a) => a.km), F.viagens().filter((x) => x.ref === ref).flatMap((x) => [x.kmSaida, x.kmRetorno]));
    return Math.max(...kms.map(Number).filter(Number.isFinite));
  };

  // Consumo médio (km/L) e alertas de inconsistência de cada abastecimento (FR-05 e FR-06)
  F.analisar = () => {
    const porVeiculo = new Map();
    for (const a of F.abastecimentos()) { if (!porVeiculo.has(a.ref)) porVeiculo.set(a.ref, []); porVeiculo.get(a.ref).push(a); }
    const resultado = new Map(); // id → { consumo, alertas[] }
    const medias = new Map();
    for (const [ref, lista] of porVeiculo) {
      const v = F.veiculo(ref);
      const consumos = [];
      lista.forEach((a, i) => {
        const ant = lista[i - 1];
        const r = { consumo: null, alertas: [] };
        if (ant) {
          if (a.km && ant.km && a.km <= ant.km) r.alertas.push(`Quilometragem (${u.inteiro(a.km)}) menor ou igual à do abastecimento anterior (${u.inteiro(ant.km)})`);
          else if (a.km && ant.km && a.litros) { r.consumo = (a.km - ant.km) / a.litros; consumos.push(r.consumo); }
          if (a.data === ant.data) r.alertas.push('Dois abastecimentos no mesmo dia');
        }
        if (v?.tanque && a.litros > v.tanque) r.alertas.push(`Mais litros (${u.inteiro(a.litros)}) que a capacidade do tanque (${u.inteiro(v.tanque)} L)`);
        if (v?.combustivel && a.combustivel && a.combustivel !== v.combustivel && !(v.combustivel === 'Flex' && ['Gasolina', 'Etanol'].includes(a.combustivel))) r.alertas.push(`Combustível (${a.combustivel}) diferente do veículo (${v.combustivel})`);
        resultado.set(a.id, r);
      });
      const media = consumos.length ? consumos.reduce((t, x) => t + x, 0) / consumos.length : null;
      medias.set(ref, media);
      if (media && consumos.length >= 3) lista.forEach((a) => { const r = resultado.get(a.id); if (r.consumo && Math.abs(r.consumo - media) / media > 0.35) r.alertas.push(`Consumo fora da média do veículo (${r.consumo.toFixed(1)} km/L; média ${media.toFixed(1)})`); });
      if (v && v.situacao !== 'ativo') { const ult = lista[lista.length - 1]; if (ult && ult.data >= u.somaDias(hoje(), -30)) resultado.get(ult.id).alertas.push(`Veículo marcado como ${SITUACAO[v.situacao].toLowerCase()}`); }
    }
    return { resultado, medias };
  };

  // Situação de cada plano de manutenção preventiva (FR-08)
  F.situacaoPlano = (p) => {
    const km = F.kmAtual(p.ref);
    const kmProx = p.cadaKm ? Number(p.ultimoKm || 0) + Number(p.cadaKm) : null;
    const dataProx = p.cadaMeses && p.ultimaData ? u.somaDias(p.ultimaData, Math.round(Number(p.cadaMeses) * 30.4)) : null;
    const vencido = (kmProx && km >= kmProx) || (dataProx && hoje() >= dataProx);
    const perto = !vencido && ((kmProx && km >= kmProx - 1000) || (dataProx && hoje() >= u.somaDias(dataProx, -30)));
    return { km, kmProx, dataProx, nivel: vencido ? 'vencido' : perto ? 'perto' : 'ok' };
  };

  // Alertas da frota para o painel e a central de pendências
  F.alertas = () => {
    const al = [];
    const add = (nivel, texto, link) => al.push({ nivel, texto, link });
    const { resultado } = F.analisar();
    const recentes = F.abastecimentos().filter((a) => a.data >= u.somaDias(hoje(), -90) && resultado.get(a.id)?.alertas.length);
    if (recentes.length) add('atencao', `${recentes.length} abastecimento(s) com inconsistência nos últimos 90 dias`, '#frota/abastecimentos');
    for (const m of VP.db.lista('motoristas')) {
      if (m.validade && m.validade < hoje()) add('critico', `CNH vencida: ${m.nome} (bloqueado para viagens)`, '#frota/motoristas');
      else if (m.validade && m.validade <= u.somaDias(hoje(), 30)) add('atencao', `CNH vence em até 30 dias: ${m.nome}`, '#frota/motoristas');
    }
    for (const p of VP.db.lista('planosManutencao')) { const s = F.situacaoPlano(p); if (s.nivel !== 'ok') add(s.nivel === 'vencido' ? 'critico' : 'atencao', `${p.item} ${s.nivel === 'vencido' ? 'vencida' : 'perto de vencer'}: ${nomeVeiculo(p.ref)}`, '#frota/manutencao'); }
    for (const c of VP.db.lista('contratosLocacao')) if (c.fim && c.fim >= hoje() && c.fim <= u.somaDias(hoje(), 60)) add('atencao', `Contrato de locação ${c.numero} vence em ${u.data(c.fim)}`, '#frota/contratos');
    for (const m of VP.db.lista('multas')) if (m.situacao === 'aberta' && m.prazoIndicacao && m.prazoIndicacao <= u.somaDias(hoje(), 7)) add(m.prazoIndicacao < hoje() ? 'critico' : 'atencao', `Multa ${m.auto || ''} (${nomeVeiculo(m.ref)}): prazo para indicar o condutor ${m.prazoIndicacao < hoje() ? 'vencido' : 'em ' + u.data(m.prazoIndicacao)}`, '#frota/multas');
    const pedidos = VP.db.lista('reservasVeiculo').filter((r) => r.situacao === 'pedida').length;
    if (pedidos) add('atencao', `${pedidos} pedido(s) de veículo aguardando aprovação`, '#frota/reservas');
    for (const d of VP.db.lista('documentosVeiculo')) if (d.vencimento && d.vencimento <= u.somaDias(hoje(), 30)) add(d.vencimento < hoje() ? 'critico' : 'atencao', `${d.tipo} ${d.vencimento < hoje() ? 'vencido' : 'vence em ' + u.data(d.vencimento)}: ${nomeVeiculo(d.ref)}`, '#frota/documentos');
    return al;
  };

  // Gasto e km de um mês (para painel e custo por km)
  const doMes = (ym) => {
    const abs = F.abastecimentos().filter((a) => a.data.slice(0, 7) === ym);
    const gasto = abs.reduce((t, a) => t + a.valor, 0);
    let km = 0;
    for (const v of F.veiculos()) {
      const pontos = F.abastecimentos().filter((a) => a.ref === v.ref && a.km).map((a) => ({ d: a.data, km: a.km })).concat(F.viagens().filter((x) => x.ref === v.ref).flatMap((x) => [{ d: x.saida, km: x.kmSaida }, { d: x.retorno || x.saida, km: x.kmRetorno }])).filter((p) => p.km);
      const antes = pontos.filter((p) => p.d.slice(0, 7) < ym).map((p) => p.km);
      const no = pontos.filter((p) => p.d.slice(0, 7) === ym).map((p) => p.km);
      if (no.length) km += Math.max(...no) - (antes.length ? Math.max(...antes) : Math.min(...no));
    }
    return { gasto, km, litros: abs.reduce((t, a) => t + a.litros, 0) };
  };
  F.kmNoMes = (ref, ym) => {
    const pontos = F.abastecimentos().filter((a) => a.ref === ref && a.km).map((a) => ({ d: a.data, km: a.km })).concat(F.viagens().filter((x) => x.ref === ref).flatMap((x) => [{ d: x.saida, km: x.kmSaida }, { d: x.retorno || x.saida, km: x.kmRetorno }])).filter((p) => p.km);
    const antes = pontos.filter((p) => p.d.slice(0, 7) < ym).map((p) => p.km);
    const no = pontos.filter((p) => p.d.slice(0, 7) === ym).map((p) => p.km);
    return no.length ? Math.max(...no) - (antes.length ? Math.max(...antes) : Math.min(...no)) : 0;
  };

  // ------------------------------------------------------------------ gravação genérica (com Lixeira)
  const salvar = async (col, doc) => { await VP.db.gravar(col, doc); ui.aviso('Salvo.'); VP.app.render(); };
  const excluir = async (col, id) => {
    const x = VP.db.pega(col, id);
    if (!await ui.confirmar('Mover para a Lixeira? Pode ser restaurado depois.', { sim: 'Mover para a Lixeira', classe: 'perigo' })) return;
    x.excluido = true; x.excluidoEm = VP.Plataforma.agoraISO(); await VP.db.gravar(col, x); ui.aviso('Na Lixeira.'); VP.app.render();
  };
  const botoesLinha = (col, x) => `<button class="botao pequeno" data-editar-frota="${esc(col)}|${esc(x.id)}">Editar</button> <button class="botao pequeno perigo" data-excluir-frota="${esc(col)}|${esc(x.id)}">Excluir</button>`;

  // ------------------------------------------------------------------ formulários
  const FORMS = {
    veiculosLocados: () => [
      { chave: 'placa', rotulo: 'Placa', obrigatorio: true, largura: 'meia' }, { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: Object.entries(SITUACAO), vazio: false, largura: 'meia' },
      { chave: 'marca', rotulo: 'Marca', largura: 'meia' }, { chave: 'modelo', rotulo: 'Modelo', largura: 'meia' },
      { chave: 'ano', rotulo: 'Ano', largura: 'meia' }, { chave: 'combustivel', rotulo: 'Combustível', tipo: 'select', opcoes: COMBUSTIVEIS.map((x) => [x, x]), largura: 'meia' },
      { chave: 'tanque', rotulo: 'Tanque (litros)', tipo: 'numero', largura: 'meia' }, { chave: 'kmInicial', rotulo: 'Quilometragem ao receber', tipo: 'numero', largura: 'meia' },
      { chave: 'contratoId', rotulo: 'Contrato de locação', tipo: 'select', opcoes: opc('contratosLocacao') }, { chave: 'unidadeId', rotulo: 'Secretaria / unidade', tipo: 'select', opcoes: VP.opc('unidades') }],
    contratosLocacao: () => [
      { chave: 'numero', rotulo: 'Número do contrato', obrigatorio: true, largura: 'meia' }, { chave: 'empresa', rotulo: 'Empresa locadora', obrigatorio: true, largura: 'meia' },
      { chave: 'inicio', rotulo: 'Início da vigência', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'fim', rotulo: 'Fim da vigência', tipo: 'data', obrigatorio: true, largura: 'meia' },
      { chave: 'valorMensal', rotulo: 'Valor mensal por veículo (R$)', tipo: 'moeda', obrigatorio: true, largura: 'meia' }, { chave: 'franquiaKm', rotulo: 'Franquia de km por veículo/mês', tipo: 'numero', largura: 'meia' },
      { chave: 'valorKmExcedente', rotulo: 'Valor do km excedente (R$)', tipo: 'moeda', largura: 'meia' }, { chave: 'valorTotal', rotulo: 'Valor total do contrato (R$)', tipo: 'moeda', largura: 'meia' },
      { chave: 'descontaParada', rotulo: 'Desconta os dias em que o veículo ficou parado por conta da locadora', tipo: 'bool' },
      { chave: 'quemPaga', rotulo: 'Quem paga manutenção e combustível', tipo: 'select', opcoes: [['prefeitura', 'Prefeitura paga combustível; locadora a manutenção'], ['locadora', 'Locadora paga os dois'], ['prefeitura-tudo', 'Prefeitura paga os dois']] },
      { chave: 'observacao', rotulo: 'Aditivos e observações', tipo: 'area' }],
    motoristas: () => [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'cnh', rotulo: 'Número da CNH', largura: 'meia' },
      { chave: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'].map((x) => [x, x]), largura: 'meia' },
      { chave: 'validade', rotulo: 'Validade da CNH', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'unidadeId', rotulo: 'Secretaria / unidade', tipo: 'select', opcoes: VP.opc('unidades'), largura: 'meia' },
      { chave: 'cursos', rotulo: 'Cursos obrigatórios (ex.: transporte escolar, emergência)' }],
    planosManutencao: () => [
      { chave: 'ref', rotulo: 'Veículo', tipo: 'select', opcoes: opcVeiculos(), obrigatorio: true }, { chave: 'item', rotulo: 'O que fazer', obrigatorio: true, placeholder: 'Ex.: Troca de óleo, revisão, pneus, filtros' },
      { chave: 'cadaKm', rotulo: 'A cada quantos km', tipo: 'numero', largura: 'meia' }, { chave: 'cadaMeses', rotulo: 'Ou a cada quantos meses', tipo: 'numero', largura: 'meia' },
      { chave: 'ultimoKm', rotulo: 'Km da última vez', tipo: 'numero', largura: 'meia' }, { chave: 'ultimaData', rotulo: 'Data da última vez', tipo: 'data', largura: 'meia' }],
    multas: () => [
      { chave: 'ref', rotulo: 'Veículo', tipo: 'select', opcoes: opcVeiculos(), obrigatorio: true }, { chave: 'data', rotulo: 'Data da infração', tipo: 'data', obrigatorio: true, largura: 'meia' },
      { chave: 'auto', rotulo: 'Número do auto', largura: 'meia' }, { chave: 'descricao', rotulo: 'Infração' },
      { chave: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', largura: 'meia' }, { chave: 'prazoIndicacao', rotulo: 'Prazo para indicar o condutor', tipo: 'data', largura: 'meia' },
      { chave: 'motoristaId', rotulo: 'Condutor identificado', tipo: 'select', opcoes: opc('motoristas') }, { chave: 'situacao', rotulo: 'Situação', tipo: 'select', opcoes: [['aberta', 'Aberta'], ['indicada', 'Condutor indicado'], ['recorrida', 'Em recurso'], ['paga', 'Paga'], ['cancelada', 'Cancelada']], vazio: false }],
    documentosVeiculo: () => [
      { chave: 'ref', rotulo: 'Veículo', tipo: 'select', opcoes: opcVeiculos(), obrigatorio: true }, { chave: 'tipo', rotulo: 'Documento', tipo: 'select', opcoes: ['Licenciamento (CRLV)', 'Seguro', 'IPVA', 'Tacógrafo', 'Vistoria escolar', 'Outro'].map((x) => [x, x]), obrigatorio: true },
      { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data', obrigatorio: true, largura: 'meia' }, { chave: 'observacao', rotulo: 'Observação', largura: 'meia' }]
  };
  const TITULOS = { veiculosLocados: 'veículo alugado', contratosLocacao: 'contrato de locação', motoristas: 'motorista', planosManutencao: 'manutenção preventiva', multas: 'multa', documentosVeiculo: 'documento' };
  const editar = (col, x) => ui.formulario({
    titulo: (x ? 'Editar ' : 'Novo: ') + TITULOS[col], campos: FORMS[col](), valores: x || {}, largura: 'media',
    salvar: async (v) => {
      if (col === 'veiculosLocados' && VP.frota.veiculos().some((o) => o.placa.toUpperCase() === String(v.placa).toUpperCase() && o.ref !== 'L:' + x?.id)) return 'Já existe veículo com esta placa.';
      if (col === 'contratosLocacao' && v.fim < v.inicio) return 'O fim da vigência é antes do início.';
      await salvar(col, Object.assign(x || { id: u.id() }, v, col === 'veiculosLocados' ? { placa: String(v.placa).toUpperCase() } : {}));
    }
  });

  // Abastecimento (FR-04): próprio → evento do bem; alugado → coleção da frota
  const novoAbastecimento = (refInicial, existente) => {
    const campos = [
      { chave: 'ref', rotulo: 'Veículo', tipo: 'select', opcoes: opcVeiculos(), obrigatorio: true }, { chave: 'motoristaId', rotulo: 'Motorista', tipo: 'select', opcoes: opc('motoristas') },
      { chave: 'data', rotulo: 'Data', tipo: 'data', padrao: hoje(), obrigatorio: true, largura: 'meia' }, { chave: 'hora', rotulo: 'Hora (ex.: 14:30)', largura: 'meia' },
      { chave: 'km', rotulo: 'Km no painel', tipo: 'numero', obrigatorio: true, largura: 'meia' }, { chave: 'combustivel', rotulo: 'Combustível', tipo: 'select', opcoes: COMBUSTIVEIS.filter((c) => c !== 'Flex').map((x) => [x, x]), largura: 'meia' },
      { chave: 'litros', rotulo: 'Litros', tipo: 'numero', obrigatorio: true, largura: 'meia' }, { chave: 'valor', rotulo: 'Valor total (R$)', tipo: 'moeda', obrigatorio: true, largura: 'meia' },
      { chave: 'posto', rotulo: 'Posto' }];
    ui.formulario({
      titulo: existente ? 'Editar abastecimento' : 'Registrar abastecimento', campos, valores: existente || { ref: refInicial || '' }, largura: 'media',
      intro: '<p class="ajuda">Ao salvar, o sistema confere: km menor que o anterior, litros acima do tanque, consumo fora da média, dois abastecimentos no mesmo dia e combustível diferente do veículo.</p>',
      salvar: async (v) => {
        const [tipo, id] = v.ref.split(':');
        const dados = { data: v.data, hora: v.hora, litros: v.litros, valor: v.valor, km: v.km, combustivel: v.combustivel, motoristaId: v.motoristaId, posto: v.posto };
        if (tipo === 'B') await VP.db.gravar('eventos', VP.novoEvento(id, 'abastecimento', { data: v.data, valor: v.valor, descricao: `${v.litros} L${v.combustivel ? ' de ' + v.combustivel : ''} · km ${v.km}`, extra: Object.assign({}, dados) }));
        else await VP.db.gravar('abastecimentos', Object.assign(existente || { id: u.id() }, { ref: v.ref }, dados));
        const { resultado } = F.analisar();
        const ult = F.abastecimentos().filter((a) => a.ref === v.ref).pop();
        const al = resultado.get(ult?.id)?.alertas || [];
        ui.resultado({ titulo: 'Abastecimento registrado', sucesso: [`${nomeVeiculo(v.ref)} · ${u.inteiro(v.litros)} L · ${u.moeda(v.valor)}`], falhas: al.map((t) => ({ item: 'Conferir', motivo: t })) });
        VP.app.render();
      }
    });
  };

  // Viagem / diário de bordo (FR-07, com bloqueio de km regressivo e de CNH vencida)
  const novaViagem = (x) => {
    const campos = [
      { chave: 'ref', rotulo: 'Veículo', tipo: 'select', opcoes: opcVeiculos(), obrigatorio: true }, { chave: 'motoristaId', rotulo: 'Motorista', tipo: 'select', opcoes: opc('motoristas'), obrigatorio: true },
      { chave: 'saida', rotulo: 'Saída (data)', tipo: 'data', padrao: hoje(), obrigatorio: true, largura: 'meia' }, { chave: 'horaSaida', rotulo: 'Hora da saída', largura: 'meia' },
      { chave: 'kmSaida', rotulo: 'Km na saída', tipo: 'numero', obrigatorio: true, largura: 'meia' }, { chave: 'destino', rotulo: 'Destino', largura: 'meia' },
      { chave: 'motivo', rotulo: 'Motivo da viagem' },
      { chave: 'retorno', rotulo: 'Retorno (data)', tipo: 'data', largura: 'meia' }, { chave: 'horaRetorno', rotulo: 'Hora do retorno', largura: 'meia' },
      { chave: 'kmRetorno', rotulo: 'Km no retorno', tipo: 'numero', largura: 'meia' }];
    ui.formulario({
      titulo: x ? 'Registrar retorno / editar viagem' : 'Registrar saída de veículo', campos, valores: x || {}, largura: 'media',
      salvar: async (v) => {
        const m = VP.db.pega('motoristas', v.motoristaId);
        if (m?.validade && m.validade < (v.saida || hoje())) return `A CNH de ${m.nome} está vencida (${u.data(m.validade)}). Escolha outro motorista.`;
        const outras = F.viagens().filter((o) => o.ref === v.ref && o.id !== x?.id);
        const kmAntes = Math.max(F.veiculo(v.ref)?.kmInicial || 0, ...outras.filter((o) => (o.saida || '') <= v.saida).flatMap((o) => [o.kmSaida || 0, o.kmRetorno || 0]), ...F.abastecimentos().filter((a) => a.ref === v.ref && a.data <= v.saida).map((a) => a.km || 0));
        if (v.kmSaida < kmAntes) return `Km de saída (${u.inteiro(v.kmSaida)}) menor que o último registrado para este veículo (${u.inteiro(kmAntes)}). Confira o painel.`;
        if (v.kmRetorno != null && v.kmRetorno < v.kmSaida) return 'Km no retorno menor que na saída.';
        await salvar('viagens', Object.assign(x || { id: u.id() }, v));
      }
    });
  };

  // ------------------------------------------------------------------ telas
  const ABAS = [['painel', 'Painel'], ['veiculos', 'Veículos'], ['reservas', 'Reservas'], ['abastecimentos', 'Abastecimentos'], ['cartao', 'Cartão-combustível'], ['viagens', 'Diário de bordo'], ['contratos', 'Contratos de locação'], ['motoristas', 'Motoristas'], ['manutencao', 'Manutenção preventiva'], ['pneus', 'Pneus'], ['multas', 'Multas'], ['documentos', 'Documentos']];
  const nav = (qual) => `<nav class="abas">${ABAS.map(([k, n]) => `<a href="#frota/${k}" class="${k === qual ? 'ativa' : ''}">${esc(n)}</a>`).join('')}</nav>`;
  const tabela = (id, linhas, colunas, vazio) => ui.tabela({ id, linhas, colunas, nomePlanilha: id, vazio: vazio || 'Nada cadastrado ainda.' });
  const ligarComum = () => {
    const c = document.getElementById('area-frota');
    c.onclick = (e) => {
      const ed = e.target.closest('[data-editar-frota]');
      if (ed) { const [col, id] = ed.dataset.editarFrota.split('|'); return col === 'viagens' ? novaViagem(VP.db.pega(col, id)) : col === 'abastecimentos' ? novoAbastecimento(null, VP.db.pega(col, id)) : editar(col, VP.db.pega(col, id)); }
      const ex = e.target.closest('[data-excluir-frota]');
      if (ex) { const [col, id] = ex.dataset.excluirFrota.split('|'); return excluir(col, id); }
      const ab = e.target.closest('[data-abastecer]'); if (ab) return novoAbastecimento(ab.dataset.abastecer);
      const feito = e.target.closest('[data-feito]');
      if (feito) {
        const p = VP.db.pega('planosManutencao', feito.dataset.feito);
        return ui.formulario({ titulo: `${p.item} feita · ${nomeVeiculo(p.ref)}`, largura: 'pequena', valores: { km: F.kmAtual(p.ref), data: hoje() },
          campos: [{ chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true }, { chave: 'km', rotulo: 'Km no painel', tipo: 'numero', obrigatorio: true }, { chave: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda' }],
          salvar: async (v) => {
            p.ultimaData = v.data; p.ultimoKm = v.km;
            const docs = { planosManutencao: [p] };
            if (p.ref.startsWith('B:')) docs.eventos = [VP.novoEvento(p.ref.slice(2), 'manutencao', { data: v.data, valor: v.valor || 0, descricao: `${p.item} (preventiva) · km ${v.km}`, extra: { motivo: 'Preventiva' } })];
            await VP.db.gravarVarias(docs); ui.aviso('Registrado.'); VP.app.render();
          } });
      }
    };
  };

  T.frota = (aba = 'painel') => {
    const ab = ABAS.some(([k]) => k === aba) ? aba : 'painel';
    const veics = F.veiculos();
    const { resultado, medias } = F.analisar();
    let html = '', acoes = '', ligarExtra = null;
    const ids = [];
    // Abas da segunda parte da frota (pneus, reservas, cartão-combustível): telas-frota2.js
    const extra = VP.frotaExtra?.abas?.[ab];
    if (extra) { const r = extra(); html = r.html; acoes = r.acoes || ''; ligarExtra = r.ligar; } else if (ab === 'painel') {
      const mes = doMes(mesAtual());
      const meses = Array.from({ length: 12 }, (_, i) => u.somaMeses(mesAtual(), i - 11));
      const al = F.alertas();
      const icone = { critico: '⛔', atencao: '⚠️', info: 'ℹ️' }, nivel = { critico: 'Urgente', atencao: 'Atenção', info: 'Para saber' };
      const porVeiculo = veics.map((v) => ({ rotulo: `${v.placa} · ${v.modelo}`, valor: medias.get(v.ref) ? Math.round(medias.get(v.ref) * 10) / 10 : 0 })).filter((x) => x.valor);
      const custoOrigem = ['proprio', 'locado'].map((o) => ({ rotulo: o === 'proprio' ? 'Próprios (patrimônio)' : 'Alugados', valor: F.abastecimentos().filter((a) => a.data.slice(0, 7) === mesAtual() && F.veiculo(a.ref)?.origem === o).reduce((t, a) => t + a.valor, 0) }));
      acoes = '<button class="botao primario" data-abastecer="">+ Abastecimento</button> <button class="botao" data-nova-viagem>+ Saída de veículo</button>';
      html = `<div class="resumo-linha">
          ${G.numero('Veículos em uso', u.inteiro(veics.filter((v) => v.situacao === 'ativo').length), `${u.inteiro(veics.filter((v) => v.situacao === 'parado').length)} parados · ${u.inteiro(veics.filter((v) => v.situacao === 'manutencao').length)} em manutenção`, '#frota/veiculos')}
          ${G.numero('Combustível no mês', u.moedaCurta(mes.gasto), `${u.inteiro(mes.litros)} litros`, '#frota/abastecimentos')}
          ${G.numero('Km rodados no mês', u.inteiro(mes.km), 'abastecimentos e diário de bordo')}
          ${G.numero('Custo por km (combustível)', mes.km ? u.moeda(mes.gasto / mes.km) : '—', u.mesExtenso(mesAtual()))}
        </div>
        <div class="grade-painel">
          <section class="cartao"><h3>Alertas da frota</h3>${al.length ? `<ul class="pendencias">${al.map((p) => `<li class="p-${p.nivel}"><a href="${esc(p.link)}"><span class="p-icone" aria-hidden="true">${icone[p.nivel]}</span><span class="p-nivel">${nivel[p.nivel]}</span><span class="p-texto">${esc(p.texto)}</span><b class="p-qtd"></b></a></li>`).join('')}</ul>` : '<p class="tudo-certo">✓ Nenhum alerta.</p>'}</section>
          <section class="cartao"><h3>Gasto com combustível, últimos 12 meses</h3>${G.colunas(meses.map((m) => ({ rotulo: u.mesNome(m), valor: doMes(m).gasto })), { formato: u.moedaCurta, titulo: 'Gasto por mês' })}</section>
          <section class="cartao"><h3>Consumo médio por veículo (km/L)</h3>${porVeiculo.length ? G.barrasH(porVeiculo.sort((a, b) => a.valor - b.valor), { formato: (x) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km/L' }) : '<p class="vazio">Registre abastecimentos com km para ver o consumo.</p>'}</section>
          <section class="cartao"><h3>Combustível no mês: próprios × alugados</h3>${G.barrasH(custoOrigem, { formato: u.moedaCurta, mostrarZeros: true })}</section>
        </div>`;
    } else if (ab === 'veiculos') {
      acoes = '<a class="botao" href="#novo-bem/veiculo">+ Veículo próprio (patrimônio)</a> <button class="botao primario" data-novo-frota="veiculosLocados">+ Veículo alugado</button>';
      html = `<p class="ajuda">Veículo próprio é bem do patrimônio (deprecia e entra no balancete). Veículo alugado não é patrimônio: fica ligado ao contrato de locação.</p>${tabela('frota-veiculos', veics.map((v) => Object.assign({ id: v.ref }, v)), [
        { chave: 'placa', titulo: 'Placa', html: (v) => (v.bem ? `<a href="#bem/${esc(v.bem.id)}">${esc(v.placa)}</a>` : esc(v.placa)), valor: (v) => v.placa },
        { chave: 'modelo', titulo: 'Veículo' }, { chave: 'origem', titulo: 'Origem', valor: (v) => (v.origem === 'proprio' ? 'Próprio' : 'Alugado') },
        { chave: 'situacao', titulo: 'Situação', valor: (v) => SITUACAO[v.situacao] }, { chave: 'unidade', titulo: 'Secretaria / unidade', valor: (v) => VP.nome('unidades', v.unidadeId) },
        { chave: 'km', titulo: 'Km atual', num: true, valor: (v) => F.kmAtual(v.ref), formato: u.inteiro },
        { chave: 'consumo', titulo: 'Consumo médio', num: true, valor: (v) => medias.get(v.ref) || 0, formato: (x) => (x ? x.toFixed(1) + ' km/L' : '—') },
        { chave: 'a', titulo: '', html: (v) => `<button class="botao pequeno" data-abastecer="${esc(v.ref)}">Abastecer</button> ${v.locado ? botoesLinha('veiculosLocados', v.locado) : ''}` }])}`;
    } else if (ab === 'abastecimentos') {
      const lista = F.abastecimentos().slice().reverse();
      acoes = '<button class="botao primario" data-abastecer="">+ Abastecimento</button>';
      html = `<p class="ajuda">Abastecimentos de todos os veículos. As linhas com aviso precisam de conferência (km, litros, consumo, combustível).</p>${tabela('frota-abastecimentos', lista, [
        { chave: 'data', titulo: 'Data', valor: (a) => `${u.data(a.data)}${a.hora ? ' ' + a.hora : ''}`, ordenar: (a) => a.data + (a.hora || '') },
        { chave: 'veiculo', titulo: 'Veículo', valor: (a) => nomeVeiculo(a.ref) }, { chave: 'motorista', titulo: 'Motorista', valor: (a) => VP.nome('motoristas', a.motoristaId) },
        { chave: 'litros', titulo: 'Litros', num: true, soma: true, valor: (a) => a.litros, formato: u.inteiro }, { chave: 'valor', titulo: 'Valor', num: true, soma: true, valor: (a) => a.valor, formato: u.moeda },
        { chave: 'km', titulo: 'Km', num: true, valor: (a) => a.km, formato: u.inteiro },
        { chave: 'consumo', titulo: 'km/L', num: true, valor: (a) => resultado.get(a.id)?.consumo || 0, formato: (x) => (x ? x.toFixed(1) : '—') },
        { chave: 'alertas', titulo: 'Conferir', html: (a) => (resultado.get(a.id)?.alertas || []).map((t) => `<span class="selo-status t-recusada" title="${esc(t)}">⚠ ${esc(t)}</span>`).join(' ') || '<span class="selo-status s-ativo">OK</span>', valor: (a) => (resultado.get(a.id)?.alertas || []).join('; ') },
        { chave: 'a', titulo: '', html: (a) => (a.fonte === 'abastecimentos' ? botoesLinha('abastecimentos', a) : '<small>no bem</small>') }])}`;
    } else if (ab === 'viagens') {
      acoes = '<button class="botao primario" data-nova-viagem>+ Saída de veículo</button>';
      html = `<p class="ajuda">Diário de bordo: saída e retorno, km, destino, motivo e motorista. O sistema não aceita km menor que o último registrado nem motorista com CNH vencida.</p>${tabela('frota-viagens', F.viagens().slice().reverse(), [
        { chave: 'saida', titulo: 'Saída', valor: (x) => `${u.data(x.saida)}${x.horaSaida ? ' ' + x.horaSaida : ''}`, ordenar: (x) => x.saida },
        { chave: 'veiculo', titulo: 'Veículo', valor: (x) => nomeVeiculo(x.ref) }, { chave: 'motorista', titulo: 'Motorista', valor: (x) => VP.nome('motoristas', x.motoristaId) },
        { chave: 'destino', titulo: 'Destino' }, { chave: 'motivo', titulo: 'Motivo', oculta: true },
        { chave: 'kmSaida', titulo: 'Km saída', num: true, formato: u.inteiro }, { chave: 'kmRetorno', titulo: 'Km retorno', num: true, valor: (x) => x.kmRetorno ?? '', formato: (v) => (v === '' ? 'em viagem' : u.inteiro(v)) },
        { chave: 'rodado', titulo: 'Km rodados', num: true, soma: true, valor: (x) => (x.kmRetorno != null ? x.kmRetorno - x.kmSaida : 0), formato: u.inteiro },
        { chave: 'a', titulo: '', html: (x) => `<button class="botao pequeno" data-editar-frota="viagens|${esc(x.id)}">${x.kmRetorno == null ? 'Registrar retorno' : 'Editar'}</button> <button class="botao pequeno perigo" data-excluir-frota="viagens|${esc(x.id)}">Excluir</button>` }])}`;
    } else if (ab === 'contratos') {
      const contratos = VP.db.lista('contratosLocacao');
      const v = VP.estado.frotaConferencia = VP.estado.frotaConferencia || { contratoId: contratos[0]?.id || '', mes: u.somaMeses(mesAtual(), -1) };
      const c = VP.db.pega('contratosLocacao', v.contratoId);
      const veicC = veics.filter((x) => x.contratoId === v.contratoId);
      // Dias parados (FR-03): paradas registradas no mês; se o contrato prevê desconto, abate o valor proporcional
      const diasNoMes = new Date(Number(v.mes.slice(0, 4)), Number(v.mes.slice(5, 7)), 0).getDate();
      const conf = c ? veicC.map((x) => { const km = F.kmNoMes(x.ref, v.mes); const exc = Math.max(0, km - (Number(c.franquiaKm) || 0)); const parados = F.diasParados ? F.diasParados(x.ref, v.mes) : 0; const desconto = c.descontaParada ? ((Number(c.valorMensal) || 0) / diasNoMes) * parados : 0; return { id: x.ref, placa: x.placa, modelo: x.modelo, km, franquia: Number(c.franquiaKm) || 0, exc, parados, desconto, valor: (Number(c.valorMensal) || 0) + exc * (Number(c.valorKmExcedente) || 0) - desconto }; }) : [];
      acoes = '<button class="botao" data-nova-parada>+ Parada do veículo</button> <button class="botao primario" data-novo-frota="contratosLocacao">+ Contrato</button>';
      html = `${tabela('frota-contratos', contratos, [
          { chave: 'numero', titulo: 'Contrato' }, { chave: 'empresa', titulo: 'Locadora' },
          { chave: 'vigencia', titulo: 'Vigência', valor: (x) => `${u.data(x.inicio)} a ${u.data(x.fim)}`, ordenar: (x) => x.fim },
          { chave: 'situacao', titulo: 'Situação', html: (x) => (x.fim < hoje() ? '<span class="selo-status v-vencido">Vencido</span>' : x.fim <= u.somaDias(hoje(), 60) ? '<span class="selo-status v-vencendo">Vence em breve</span>' : '<span class="selo-status v-vigente">Vigente</span>'), valor: (x) => x.fim },
          { chave: 'veic', titulo: 'Veículos', num: true, valor: (x) => veics.filter((y) => y.contratoId === x.id).length },
          { chave: 'valorMensal', titulo: 'Mensal por veículo', num: true, formato: u.moeda }, { chave: 'franquiaKm', titulo: 'Franquia km', num: true, formato: u.inteiro },
          { chave: 'a', titulo: '', html: (x) => botoesLinha('contratosLocacao', x) }])}
        <section class="cartao"><h3>Conferência mensal da fatura da locadora</h3>
          <p class="ajuda">Km rodado de cada veículo no mês (abastecimentos e diário de bordo) comparado à franquia, com o valor a pagar previsto. Use para conferir a fatura.</p>
          <div class="linha-filtros"><label>Contrato <select data-conf-contrato>${contratos.map((x) => `<option value="${esc(x.id)}" ${x.id === v.contratoId ? 'selected' : ''}>${esc(x.numero)} · ${esc(x.empresa)}</option>`).join('')}</select></label>
          <label>Mês <input type="month" data-conf-mes value="${esc(v.mes)}"></label></div>
          ${c ? tabela('frota-conferencia', conf, [{ chave: 'placa', titulo: 'Placa' }, { chave: 'modelo', titulo: 'Veículo' }, { chave: 'km', titulo: 'Km rodados', num: true, soma: true, formato: u.inteiro }, { chave: 'franquia', titulo: 'Franquia', num: true, formato: u.inteiro }, { chave: 'exc', titulo: 'Km excedente', num: true, soma: true, formato: u.inteiro }, { chave: 'parados', titulo: 'Dias parados', num: true, soma: true, formato: u.inteiro }, { chave: 'desconto', titulo: 'Desconto por parada', num: true, soma: true, formato: u.moeda }, { chave: 'valor', titulo: 'Valor previsto', num: true, soma: true, formato: u.moeda }], 'Nenhum veículo alugado ligado a este contrato.') : '<p class="vazio">Cadastre um contrato.</p>'}
          <p class="ajuda">Dias parados vêm das paradas registradas (botão "+ Parada do veículo"). ${c ? (c.descontaParada ? 'Este contrato prevê desconto proporcional por dia parado.' : 'Este contrato não prevê desconto por dia parado (ajuste no contrato).') : ''}</p>
          ${VP.frotaExtra ? VP.frotaExtra.listaParadas(v.mes, veicC.map((x) => x.ref)) : ''}
        </section>`;
      ids.push('conf');
    } else if (ab === 'motoristas') {
      acoes = '<button class="botao primario" data-novo-frota="motoristas">+ Motorista</button>';
      html = tabela('frota-motoristas', VP.db.lista('motoristas'), [
        { chave: 'nome', titulo: 'Nome' }, { chave: 'categoria', titulo: 'Categoria' }, { chave: 'validade', titulo: 'Validade da CNH', valor: (m) => u.data(m.validade), ordenar: (m) => m.validade },
        { chave: 'sit', titulo: 'Situação', html: (m) => (m.validade < hoje() ? '<span class="selo-status v-vencido">CNH vencida: não pode dirigir</span>' : m.validade <= u.somaDias(hoje(), 30) ? '<span class="selo-status v-vencendo">Vence em até 30 dias</span>' : '<span class="selo-status v-vigente">Em dia</span>'), valor: (m) => m.validade },
        { chave: 'unidade', titulo: 'Secretaria / unidade', valor: (m) => VP.nome('unidades', m.unidadeId) }, { chave: 'cursos', titulo: 'Cursos', oculta: true },
        { chave: 'a', titulo: '', html: (m) => botoesLinha('motoristas', m) }]);
    } else if (ab === 'manutencao') {
      acoes = '<button class="botao primario" data-novo-frota="planosManutencao">+ Plano de manutenção</button>';
      html = `<p class="ajuda">Manutenção preventiva por km ou por tempo (o que vencer primeiro). Ao fazer, clique em "Feita": para veículo próprio, vira registro de manutenção no bem.</p>${tabela('frota-manutencao', VP.db.lista('planosManutencao'), [
        { chave: 'veiculo', titulo: 'Veículo', valor: (p) => nomeVeiculo(p.ref) }, { chave: 'item', titulo: 'O que fazer' },
        { chave: 'regra', titulo: 'Regra', valor: (p) => [p.cadaKm ? `a cada ${u.inteiro(p.cadaKm)} km` : '', p.cadaMeses ? `a cada ${p.cadaMeses} meses` : ''].filter(Boolean).join(' ou ') },
        { chave: 'prox', titulo: 'Próxima', valor: (p) => { const s = F.situacaoPlano(p); return [s.kmProx ? `km ${u.inteiro(s.kmProx)}` : '', s.dataProx ? u.data(s.dataProx) : ''].filter(Boolean).join(' ou '); } },
        { chave: 'km', titulo: 'Km atual', num: true, valor: (p) => F.kmAtual(p.ref), formato: u.inteiro },
        { chave: 'sit', titulo: 'Situação', html: (p) => ({ vencido: '<span class="selo-status v-vencido">Vencida</span>', perto: '<span class="selo-status v-vencendo">Perto de vencer</span>', ok: '<span class="selo-status v-vigente">Em dia</span>' }[F.situacaoPlano(p).nivel]), valor: (p) => F.situacaoPlano(p).nivel },
        { chave: 'a', titulo: '', html: (p) => `<button class="botao pequeno primario" data-feito="${esc(p.id)}">Feita</button> ${botoesLinha('planosManutencao', p)}` }])}`;
    } else if (ab === 'multas') {
      acoes = '<button class="botao primario" data-novo-frota="multas">+ Multa</button>';
      html = tabela('frota-multas', VP.db.lista('multas'), [
        { chave: 'data', titulo: 'Data', valor: (m) => u.data(m.data), ordenar: (m) => m.data }, { chave: 'veiculo', titulo: 'Veículo', valor: (m) => nomeVeiculo(m.ref) },
        { chave: 'auto', titulo: 'Auto' }, { chave: 'descricao', titulo: 'Infração' }, { chave: 'valor', titulo: 'Valor', num: true, soma: true, formato: u.moeda },
        { chave: 'motorista', titulo: 'Condutor', valor: (m) => VP.nome('motoristas', m.motoristaId) }, { chave: 'prazo', titulo: 'Prazo para indicar', valor: (m) => u.data(m.prazoIndicacao), ordenar: (m) => m.prazoIndicacao },
        { chave: 'situacao', titulo: 'Situação', valor: (m) => ({ aberta: 'Aberta', indicada: 'Condutor indicado', recorrida: 'Em recurso', paga: 'Paga', cancelada: 'Cancelada' }[m.situacao]) },
        { chave: 'a', titulo: '', html: (m) => botoesLinha('multas', m) }]);
    } else if (ab === 'documentos') {
      acoes = '<button class="botao primario" data-novo-frota="documentosVeiculo">+ Documento</button>';
      html = tabela('frota-documentos', VP.db.lista('documentosVeiculo'), [
        { chave: 'veiculo', titulo: 'Veículo', valor: (d) => nomeVeiculo(d.ref) }, { chave: 'tipo', titulo: 'Documento' },
        { chave: 'vencimento', titulo: 'Vencimento', valor: (d) => u.data(d.vencimento), ordenar: (d) => d.vencimento },
        { chave: 'sit', titulo: 'Situação', html: (d) => (d.vencimento < hoje() ? '<span class="selo-status v-vencido">Vencido</span>' : d.vencimento <= u.somaDias(hoje(), 30) ? '<span class="selo-status v-vencendo">Vence em até 30 dias</span>' : '<span class="selo-status v-vigente">Em dia</span>'), valor: (d) => d.vencimento },
        { chave: 'observacao', titulo: 'Observação' }, { chave: 'a', titulo: '', html: (d) => botoesLinha('documentosVeiculo', d) }]);
    }
    return {
      titulo: 'Frota de veículos',
      acoes,
      html: `<div id="area-frota">${nav(ab)}${html}</div>`,
      ligar() {
        document.querySelectorAll('#area-frota .tabela-area').forEach((t) => ui.ligarTabela(t.id.replace(/^tab-/, '')));
        ligarComum();
        document.querySelectorAll('[data-novo-frota]').forEach((b) => b.addEventListener('click', () => editar(b.dataset.novoFrota, null)));
        document.querySelectorAll('#acoes-tela [data-abastecer]').forEach((b) => b.addEventListener('click', () => novoAbastecimento(b.dataset.abastecer)));
        document.querySelectorAll('[data-nova-viagem]').forEach((b) => b.addEventListener('click', () => novaViagem(null)));
        if (ligarExtra) ligarExtra();
        document.querySelector('[data-nova-parada]')?.addEventListener('click', () => VP.frotaExtra.novaParada());
        if (ids.includes('conf')) {
          document.querySelector('[data-conf-contrato]')?.addEventListener('change', (e) => { VP.estado.frotaConferencia.contratoId = e.target.value; VP.app.render(); });
          document.querySelector('[data-conf-mes]')?.addEventListener('change', (e) => { VP.estado.frotaConferencia.mes = e.target.value; VP.app.render(); });
        }
      }
    };
  };
})();
