/* VitalPat Patrimônio · Gestão — base: utilidades, armazenamento e configuração.
   Sistema do Produto 1. Não usa nenhum arquivo do sistema do cemitério. */
'use strict';

const VP = window.VP = window.VP || {};

// ---------------------------------------------------------------------------
// Funções que dependem do ambiente ficam aqui para poderem ser trocadas em teste
// (ex.: VP.Plataforma.hoje = () => '2026-10-07').
// ---------------------------------------------------------------------------
VP.Plataforma = VP.Plataforma || {
  hoje: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  agoraISO: () => new Date().toISOString()
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
VP.u = {
  esc: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  id: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
  num: (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const t = String(v ?? '').trim();
    if (!t) return null;
    // aceita "1.234,56" e "1234.56"
    const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    return Number.isFinite(n) ? n : null;
  },
  moeda: (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  moedaCurta: (v) => {
    const a = Math.abs(v || 0);
    if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (a >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return VP.u.moeda(v);
  },
  inteiro: (v) => (v ?? 0).toLocaleString('pt-BR'),
  pct: (v) => ((v ?? 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%',
  data: (iso) => {
    if (!iso) return '—';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
  },
  mesNome: (ym) => {
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const [a, m] = ym.split('-');
    return `${nomes[+m - 1]}/${a.slice(2)}`;
  },
  mesExtenso: (ym) => {
    const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const [a, m] = ym.split('-');
    return `${nomes[+m - 1]} de ${a}`;
  },
  // Soma meses a uma data AAAA-MM-DD (devolve AAAA-MM)
  somaMeses: (ym, n) => {
    const [a, m] = ym.slice(0, 7).split('-').map(Number);
    const t = a * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  },
  mesesEntre: (ymA, ymB) => {
    const [a1, m1] = ymA.slice(0, 7).split('-').map(Number);
    const [a2, m2] = ymB.slice(0, 7).split('-').map(Number);
    return (a2 * 12 + m2) - (a1 * 12 + m1);
  },
  fimDoMes: (ym) => {
    const [a, m] = ym.split('-').map(Number);
    return `${ym}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
  },
  somaDias: (iso, n) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },
  diasEntre: (isoA, isoB) => Math.round((new Date(isoB + 'T12:00:00') - new Date(isoA + 'T12:00:00')) / 86400000),
  normalizar: (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(),
  // "1,2,6-10,15" -> função que testa um número
  faixas: (texto) => {
    const partes = String(texto || '').split(/[;,\s]+/).filter(Boolean);
    const testes = [];
    for (const p of partes) {
      const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) testes.push((n) => n >= +m[1] && n <= +m[2]);
      else if (/^\d+$/.test(p)) testes.push((n) => n === +p);
      else return null;
    }
    return testes.length ? (n) => testes.some((t) => t(Number(n))) : null;
  },
  // Gerador de números previsível (para os dados de exemplo saírem sempre iguais)
  prng: (semente) => {
    let s = semente >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  agruparSoma: (lista, chave, valor) => {
    const m = new Map();
    for (const x of lista) {
      const k = typeof chave === 'function' ? chave(x) : x[chave];
      m.set(k, (m.get(k) || 0) + (typeof valor === 'function' ? valor(x) : (valor ? x[valor] : 1)));
    }
    return m;
  }
};

// ---------------------------------------------------------------------------
// Listas fixas (texto simples para as telas)
// ---------------------------------------------------------------------------
VP.LISTAS = {
  tiposBem: { movel: 'Bem móvel', imovel: 'Bem imóvel', veiculo: 'Veículo', intangivel: 'Intangível (software, licença)', infraestrutura: 'Infraestrutura (ruas, redes, pontes)' },
  status: { ativo: 'Em uso', desuso: 'Em desuso', inservivel: 'Inservível', cedido: 'Fora (cedido/emprestado)', manutencao: 'Em conserto', baixado: 'Baixado' },
  // Escala do livro de controle patrimonial + "Novo". 1 = Imprestável (vai para baixa).
  estados: { 8: 'Novo', 7: 'Ótimo', 6: 'Muito bom', 5: 'Bom', 4: 'Regular', 3: 'Ruim', 2: 'Péssimo', 1: 'Imprestável' },
  situacoesAquisicao: ['Compra', 'Doação recebida', 'Cessão recebida', 'Permuta', 'Construção / obra', 'Desapropriação', 'Dação em pagamento', 'Loteamento (área pública)', 'Saldo inicial'],
  metodos: { linear: 'Cotas constantes (linear)', somaDigitos: 'Soma dos dígitos', unidades: 'Unidades produzidas' },
  tiposBaixa: ['Inservível', 'Alienação (leilão)', 'Doação', 'Furto / roubo', 'Extravio', 'Sinistro', 'Permuta', 'Fim da vida útil'],
  tiposTransferencia: { interna: 'Interna (entre unidades)', externa: 'Externa (empréstimo, cessão, conserto fora)', entidade: 'Entre entidades / fundos' },
  // Tipos de evento da linha do tempo
  eventos: {
    incorporacao: { nome: 'Incorporação', grupo: 'financeiro' },
    depreciacao: { nome: 'Depreciação', grupo: 'financeiro' },
    reavaliacao: { nome: 'Reavaliação', grupo: 'financeiro' },
    agregacao: { nome: 'Melhoria (agregação)', grupo: 'financeiro' },
    baixa: { nome: 'Baixa', grupo: 'financeiro' },
    estorno: { nome: 'Estorno', grupo: 'financeiro' },
    transferencia: { nome: 'Transferência', grupo: 'fisico' },
    desuso: { nome: 'Desuso', grupo: 'fisico' },
    inservivel: { nome: 'Declarado inservível', grupo: 'fisico' },
    recebimento: { nome: 'Recebimento', grupo: 'registro' },
    retorno: { nome: 'Volta ao uso', grupo: 'fisico' },
    saida_externa: { nome: 'Saída externa', grupo: 'fisico' },
    vistoria: { nome: 'Vistoria', grupo: 'registro' },
    inventario: { nome: 'Conferência de inventário', grupo: 'registro' },
    manutencao: { nome: 'Manutenção', grupo: 'registro' },
    despesa: { nome: 'Despesa', grupo: 'registro' },
    abastecimento: { nome: 'Abastecimento', grupo: 'registro' },
    observacao: { nome: 'Observação', grupo: 'registro' },
    unidades: { nome: 'Unidades produzidas', grupo: 'registro' },
    alteracao: { nome: 'Alteração de dados', grupo: 'registro' }
  }
};

// ---------------------------------------------------------------------------
// Configurações (todas as opções do concorrente, explicadas)
// ---------------------------------------------------------------------------
VP.CONFIG_PADRAO = {
  // Geral
  obrigaContas: true,
  permiteBemCompraGlobal: true,
  codigoLocalizacaoManual: false,
  controleUsuarioPorUnidade: false,
  descricaoCompletaUnidade: true,
  incorporaSoLiquidados: false,
  filtroPorClassificacao: true,
  plaquetaAnteriorRelatorio: false,
  formaReavaliacao: 'informado',
  validaTransferenciaRetroativa: true,
  avisarTransferencia: 'painel',
  depreciacaoAnual: false,
  depreciacaoAutomatica: 'manual', // manual | balancete (ao gerar o balancete) | abrir (ao abrir o sistema)
  tombamentoAutomatico: true,
  obrigaUnidade: true,
  taxaPorEntidade: false,
  // Integrações (sistema independente: tudo por arquivo)
  integraCompras: false,
  integraContabilidade: true,
  importacaoItens: 'compra',
  integraArrecadacao: false,
  extratoCidadaoStatus: 'todos',
  doacaoFinanceiro: true,
  // Documentos
  termoDeBaixa: true,
  // Bens
  minhaResponsabilidadePadrao: false,
  codigoManual: false,
  usaAparencia: true,
  // Unidades
  movimentacaoPorUnidade: true,
  unidadePatrimonio: '',
  unidadeSolicitacaoBaixa: '',
  validaEntidadeOrgao: false,
  exigeAceiteTransferencia: true,
  // Avisos
  avisoSeguroDias: 30,
  avisoSeguroIntervalo: 7,
  avisoGarantiaDias: 30,
  reavaliacaoAnos: 4,
  limiteControle: 300, // itens de controle: valor até o qual o bem pode ser só controlado (fora do balancete) — regra local, ajustável
  prazoTermoDias: 15, // termo de responsabilidade: prazo para devolver assinado (pendência até anexar)
  limiteControleMeses: 24, // …e vida útil até este número de meses. Passou de um dos dois limites: tem plaqueta (regra de Rio do Sul, 08/10/2026)
  avisoImovelDias: 60, // documentos e cessões de imóveis: avisar com esta antecedência
  // Usuário de demonstração (para "minha responsabilidade")
  usuarioResponsavelId: ''
};

// ---------------------------------------------------------------------------
// Armazenamento no navegador (IndexedDB). Tudo é carregado na memória ao abrir.
// Nada é apagado: "excluir" marca o registro como excluído (Lixeira).
// ---------------------------------------------------------------------------
VP.COLECOES = ['bens', 'eventos', 'unidades', 'responsaveis', 'classificacoes', 'produtos', 'contas', 'fornecedores',
  'motivos', 'entidades', 'comissoes', 'seguradoras', 'tiposGarantia', 'itensIncorporar', 'transferencias',
  'inventarios', 'fechamentos', 'reavaliacoes', 'exportacoes', 'filtrosSalvos', 'meta', 'registrosCampo',
  // Frota (veículo próprio continua em "bens")
  'veiculosLocados', 'abastecimentos', 'viagens', 'contratosLocacao', 'motoristas', 'planosManutencao', 'multas', 'documentosVeiculo',
  // Imóveis (etapa 5)
  'documentosImovel', 'cessoesImovel', 'pendenciasImovel',
  // Exportar e importar (planilhas)
  'importacoesPlanilha', 'importacoesAnexos',
  // Itens de controle (fora do balancete) e o classificador (vida útil dos itens e decisões guardadas)
  'bensControle', 'vidaUtilItens', 'decisoesItens',
  // Baixa em lote (leilão) e termos de responsabilidade com prazo
  'lotesBaixa', 'termosResp',
  // Manutenção, vistorias e equipes (etapa 6)
  'chamados', 'planosPreventiva', 'vistoriasPat', 'equipes',
  // Frota, segunda parte
  'pneus', 'reservasVeiculo', 'importacoesCartao', 'paradasVeiculo'];

VP.db = {
  _db: null,
  dados: {},
  nomeBanco: 'vitalpat-patrimonio-gestao',
  abrir() {
    return new Promise((ok, erro) => {
      const req = indexedDB.open(this.nomeBanco, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('docs', { keyPath: 'chave' });
      req.onsuccess = () => { this._db = req.result; ok(); };
      req.onerror = () => erro(req.error);
    });
  },
  async carregar() {
    await this.abrir();
    for (const c of VP.COLECOES) this.dados[c] = new Map();
    const todos = await new Promise((ok, erro) => {
      const r = this._db.transaction('docs').objectStore('docs').getAll();
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    });
    for (const d of todos) {
      const [col] = d.chave.split('/');
      if (this.dados[col]) this.dados[col].set(d.id, d);
    }
    return todos.length;
  },
  lista(col, incluirExcluidos = false) {
    const v = [...this.dados[col].values()];
    return incluirExcluidos ? v : v.filter((x) => !x.excluido);
  },
  pega(col, id) { return this.dados[col].get(id) || null; },
  // Grava vários registros de uma vez, numa única operação
  gravar(col, docs) {
    const lista = Array.isArray(docs) ? docs : [docs];
    for (const d of lista) {
      if (!d.id) d.id = VP.u.id();
      d.chave = `${col}/${d.id}`;
      this.dados[col].set(d.id, d);
    }
    return new Promise((ok, erro) => {
      const t = this._db.transaction('docs', 'readwrite');
      const s = t.objectStore('docs');
      for (const d of lista) s.put(d);
      t.oncomplete = () => ok(lista);
      t.onerror = () => erro(t.error);
    });
  },
  async gravarVarias(mapa) {
    // mapa: { colecao: [docs] } — tudo numa transação
    const t = this._db.transaction('docs', 'readwrite');
    const s = t.objectStore('docs');
    for (const [col, docs] of Object.entries(mapa)) {
      for (const d of docs) {
        if (!d.id) d.id = VP.u.id();
        d.chave = `${col}/${d.id}`;
        this.dados[col].set(d.id, d);
        s.put(d);
      }
    }
    return new Promise((ok, erro) => { t.oncomplete = () => ok(); t.onerror = () => erro(t.error); });
  },
  async limparTudo() {
    const t = this._db.transaction('docs', 'readwrite');
    t.objectStore('docs').clear();
    await new Promise((ok) => { t.oncomplete = ok; });
    for (const c of VP.COLECOES) this.dados[c] = new Map();
  }
};

// ---------------------------------------------------------------------------
// Escala de estado: até 08/10/2026 era de 6 níveis (6 Novo … 1 Péssimo); agora são 8 (8 Novo … 1 Imprestável).
// Os dados antigos são convertidos UMA vez só (marca em meta/escalaEstados). O valor anterior fica guardado no próprio registro.
// ---------------------------------------------------------------------------
VP.ESCALA_ANTIGA_PARA_NOVA = { 6: 8, 5: 7, 4: 5, 3: 4, 2: 3, 1: 2 };
VP.estadoDaEscalaAntiga = (n) => VP.ESCALA_ANTIGA_PARA_NOVA[Number(n)] || null;
// Registro do aplicativo de campo: os novos trazem escala 8; os antigos (sem escala) são convertidos ao ler
VP.estadoDoCampo = (d) => (d?.estado == null || d.estado === '' ? null : Number(d.escala) === 8 ? Number(d.estado) : VP.estadoDaEscalaAntiga(d.estado));
VP.converterEscalaEstados = async ({ gravar = true } = {}) => {
  if (Number(VP.db.pega('meta', 'escalaEstados')?.versao) >= 2) return null;
  const conv = (n) => VP.estadoDaEscalaAntiga(n);
  const mapa = { bens: [], bensControle: [], inventarios: [], eventos: [] };
  for (const col of ['bens', 'bensControle']) {
    for (const x of VP.db.lista(col, true)) {
      const novo = conv(x.estado);
      if (!novo || x.escalaAntiga) continue; // já convertido antes: não converte de novo
      x.escalaAntiga = { estado: x.estado, convertidoEm: VP.Plataforma.hoje() };
      x.estado = novo;
      mapa[col].push(x);
    }
  }
  for (const inv of VP.db.lista('inventarios', true)) {
    let mudou = false;
    for (const l of Object.values(inv.leituras || {})) {
      const novo = conv(l.estado);
      if (novo && l.estadoEscalaAntiga == null) { l.estadoEscalaAntiga = l.estado; l.estado = novo; mudou = true; }
    }
    if (mudou) mapa.inventarios.push(inv);
  }
  for (const e of VP.db.lista('eventos', true)) {
    const novo = conv(e.dados?.estado);
    if (novo && e.dados.estadoEscalaAntiga == null) { e.dados.estadoEscalaAntiga = e.dados.estado; e.dados.estado = novo; mapa.eventos.push(e); }
  }
  const qtd = Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, v.length]));
  if (gravar) {
    for (const k of Object.keys(mapa)) if (!mapa[k].length) delete mapa[k];
    await VP.db.gravarVarias(Object.assign(mapa, { meta: [{ id: 'escalaEstados', versao: 2, convertidoEm: VP.Plataforma.agoraISO(), quantidade: qtd, regra: 'antiga→nova: 6→8, 5→7, 4→5, 3→4, 2→3, 1→2' }] }));
  }
  return qtd;
};

// "Demais bens" (tabela de vida útil do livro de controle patrimonial): usada pelos bens importados "A classificar",
// para nenhum bem ficar sem depreciar enquanto não é classificado (decisão do usuário, 08/10/2026)
VP.DEMAIS_BENS = {
  movel: { vidaUtilMeses: 84, residualPct: 10 },
  imovel: { vidaUtilMeses: 360, residualPct: 30 },
  veiculo: { vidaUtilMeses: 120, residualPct: 30 },
  infraestrutura: { vidaUtilMeses: 1200, residualPct: 80 }
};
// Classificações "A classificar" criadas antes de 08/10/2026 não depreciavam: passam a depreciar como "Demais bens".
// O que estava antes fica guardado na própria classificação.
VP.corrigirAClassificar = async ({ gravar = true } = {}) => {
  const lista = VP.db.lista('classificacoes', true).filter((c) => c.aClassificar && c.naoDeprecia);
  for (const c of lista) {
    const dm = VP.DEMAIS_BENS[c.tipoBem] || VP.DEMAIS_BENS.movel;
    c.antesDemaisBens = { naoDeprecia: c.naoDeprecia, vidaUtilMeses: c.vidaUtilMeses, residualPct: c.residualPct, alteradoEm: VP.Plataforma.hoje() };
    Object.assign(c, { naoDeprecia: false, vidaUtilMeses: dm.vidaUtilMeses, residualPct: dm.residualPct });
  }
  if (gravar && lista.length) await VP.db.gravar('classificacoes', lista);
  return lista.length;
};

VP.config = () => Object.assign({}, VP.CONFIG_PADRAO, (VP.db.pega('meta', 'config') || {}).valores || {});
VP.salvarConfig = (valores) => VP.db.gravar('meta', { id: 'config', valores });

// Registra um evento na linha do tempo do bem (nunca apaga)
VP.novoEvento = (bemId, tipo, dados = {}) => ({
  id: VP.u.id(),
  bemId,
  tipo,
  data: dados.data || VP.Plataforma.hoje(),
  valor: dados.valor ?? null,
  descricao: dados.descricao || '',
  dados: dados.extra || {},
  loteId: dados.loteId || null,
  usuario: VP.sessao?.usuario || 'demonstração',
  criadoEm: VP.Plataforma.agoraISO(),
  cancelado: false,
  contabilizado: false
});

// Nome legível de qualquer cadastro
VP.nome = (col, id) => {
  const x = VP.db.pega(col, id);
  if (!x) return '—';
  if (col === 'unidades') return VP.config().descricaoCompletaUnidade ? `${x.codigo} · ${x.nome}` : x.nome;
  if (col === 'contas') return `${x.codigo} · ${x.nome}`;
  return x.nome || x.descricao || '—';
};
