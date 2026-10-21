/* VitalPat Cemitério · Gestão — base: utilidades, armazenamento e configuração.
   Sistema do Produto 2. Não usa nenhum arquivo do sistema do patrimônio. */
'use strict';

const VP = window.VP = window.VP || {};

// Funções que dependem do ambiente ficam aqui para poderem ser trocadas em teste
VP.Plataforma = VP.Plataforma || {
  hoje: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  agoraISO: () => new Date().toISOString()
};

VP.u = {
  esc: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  id: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
  num: (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const t = String(v ?? '').trim();
    if (!t) return null;
    const n = parseFloat(t.includes(',') ? t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.') : t);
    return Number.isFinite(n) ? n : null;
  },
  moeda: (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  moedaCurta: (v) => VP.u.moeda(v),
  inteiro: (v) => (v ?? 0).toLocaleString('pt-BR'),
  pct: (v) => ((v ?? 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%',
  data: (iso) => {
    if (!iso) return '—';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
  },
  normalizar: (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(),
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
  },
  // Ordena "001", "001 A", "2", "010 B" pela parte numérica e depois pela letra
  ordemNumero: (a, b) => {
    const pa = String(a).match(/^(\d*)\s*(.*)$/), pb = String(b).match(/^(\d*)\s*(.*)$/);
    return (Number(pa[1] || 1e9) - Number(pb[1] || 1e9)) || pa[2].localeCompare(pb[2], 'pt-BR');
  }
};

VP.LISTAS = {
  tipos: { sepultura: 'Sepultura (chão)', jazigo: 'Jazigo', gaveta: 'Gaveta', ossario: 'Ossário', capela: 'Capela' },
  ocupacao: { ocupado: 'Ocupado', vago: 'Vago', reservado: 'Reservado', 'nao-informado': 'Não informado' },
  tiposQuadra: { comum: 'Comum', infantil: 'Infantil', gaveteiro: 'Gaveteiro', jazigos: 'Jazigos' },
  fontesGeo: { levantamento: 'Levantamento da empresa especializada', 'gps-celular': 'GPS do celular (aproximado)', manual: 'Informado à mão' },
  eventos: {
    cadastro: 'Cadastro', alteracao: 'Alteração de dados', importacao: 'Importação de planilha', georreferenciamento: 'Localização exata',
    foto: 'Foto', observacao: 'Observação', qr: 'Plaqueta QR afixada',
    vistoria: 'Vistoria', situacao: 'Mudança de situação', indicador: 'Indicador documental', ordem: 'Ordem de serviço',
    concessao: 'Concessão', sepultamento: 'Sepultamento', exumacao: 'Exumação', ossario: 'Ossário', processo: 'Processo administrativo'
  },
  // Classificação do DOSSIE.md B2-C. Só muda por decisão de uma pessoa; o sistema apenas sugere.
  situacoes: { regular: 'Regular', atencao: 'Atenção', indicio: 'Indício de abandono', apuracao: 'Abandono em apuração', declarado: 'Abandono declarado (ato publicado)' },
  // Indicadores documentais (DOSSIE.md B2-A). Marcados por uma pessoa.
  indicadores: {
    D1: 'Concessão temporária vencida',
    D2: 'Taxas do cemitério em aberto',
    D3: 'Titular sem cadastro válido, falecido sem sucessor ou carta devolvida',
    D4: 'Sem nenhum movimento há muitos anos',
    D5: 'Concessão sem documento que comprove o título (regularização, não é abandono sozinho)'
  },
  itensVistoria: { v1: 'Estrutura (rachaduras, desabamento, risco)', v2: 'Limpeza e mato', v3: 'Identificação (lápide ou placa legível)', v4: 'Tampa e vedação' },
  tiposOrdem: { limpeza: 'Limpeza', reparo: 'Conserto', acidente: 'Acidente ou risco (quebra, desabamento)', vistoria: 'Fazer vistoria', outro: 'Outro' },
  origensOrdem: { funcionario: 'Funcionário da prefeitura', familia: 'Pedido da família', populacao: 'Aviso da população', campo: 'Aplicativo de campo' },
  situacoesOrdem: { aberta: 'Aberta', andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' },
  prioridades: { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' },
  // Etapa 3
  tiposConcessao: { perpetua: 'Perpétua', temporaria: 'Temporária' },
  situacoesConcessao: { vigente: 'Vigente', encerrada: 'Encerrada' },
  situacoesSepultamento: { agendado: 'Agendado', sepultado: 'Sepultado', exumado: 'Exumado', cancelado: 'Cancelado' },
  motivosExumacao: { prazo: 'Prazo de permanência vencido', familia: 'Pedido da família (translado ou ossário)', judicial: 'Ordem judicial ou policial', abandono: 'Abandono declarado (ato publicado)' },
  destinosExumacao: { ossario: 'Ossário do cemitério', translado: 'Translado para outro cemitério', familia: 'Entregue à família', cremacao: 'Cremação' },
  situacoesExumacao: { agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada' },
  // Etapa 4
  meiosNotificacao: { email: 'E-mail', whatsapp: 'WhatsApp', telefone: 'Telefone', pessoal: 'Pessoalmente', carta: 'Carta com AR' },
  resultadosNotificacao: { enviada: 'Enviada, sem confirmação', entregue: 'Recebida ou lida (confirmado)', semResposta: 'Sem resposta', naoLocalizado: 'Não localizado ou devolvida' },
  fasesProcesso: { notificacao: 'Notificação', edital: 'Edital', prazo: 'Prazo para manifestação', analise: 'Análise de defesa', termo: 'Termo de compromisso', decisao: 'Pronto para decisão', encerrado: 'Encerrado' },
  resultadosProcesso: { regularizado: 'Regularizado (arquivado)', arquivado: 'Arquivado por outro motivo', declarado: 'Abandono declarado' }
};

VP.CONFIG_PADRAO = {
  entidade: 'Prefeitura Municipal de Exemplo',
  // Avisos e regras ficam configuráveis por município (lei municipal de cada um)
  precisaoMaximaLevantamento: 0.5, // metros: acima disso, a coordenada é marcada como "aproximada"
  mostrarFotos: true,
  // Triagem (DOSSIE.md B2): soma das notas V1 a V4 (0 a 16) da última vistoria
  notaAtencao: 6,
  notaIndicio: 10,
  intervaloVistoriasDias: 90, // mínimo entre a 1ª e a 2ª vistoria para "Abandono em apuração"
  prazoOrdemDias: 15,
  // Etapa 3 — valores padrão vindos de leis de referência (DOSSIE.md B2/B3); cada município confere a sua lei
  permanenciaAdultoAnos: 5,   // gaveta: Rio do Sul, Lei 4.100/2004 (editais) [C]
  permanenciaCriancaAnos: 3,  // gaveta: Rio do Sul [C]
  exumacaoMinimaAnos: 5,      // Bom Retiro, Lei 2.573/2024: não antes de 5 anos, salvo ordem judicial ou policial [C]
  guardaOssarioAnos: 3,       // Joinville: a família pode retirar em 3 anos [C]
  leiPermiteRetomadaPerpetua: false, // só marque se a lei municipal prever retomada de concessão perpétua
  // Etapa 4 — processo administrativo. Referências: Rio do Sul 15 dias úteis + 10 corridos; Joinville 30 dias úteis; Bom Retiro até 60 dias [C]
  prazoManifestacaoDias: 30,
  prazoManifestacaoUteis: true,
  prazoTermoDias: 60,        // prazo padrão do termo de compromisso (reforma/limpeza)
  exigirAR: false,           // pendência jurídica: a prefeitura hoje notifica por e-mail e WhatsApp
  exigirAvisoTumulo: true,   // aviso físico (placa) no túmulo antes da decisão
  limitePlaquetas: 100000    // plaquetas numeradas de 000000 até este número (decisão do usuário)
};

VP.COLECOES = ['cemiterios', 'quadras', 'tumulos', 'eventos', 'importacoes', 'filtrosSalvos', 'meta', 'registrosCampo', 'vistorias', 'ordensServico', 'concessoes', 'sepultamentos', 'exumacoes', 'funerarias', 'processos', 'editais', 'plaquetas'];

// Armazenamento no navegador (IndexedDB). Tudo é carregado na memória ao abrir.
// Preparado para trocar por servidor (Supabase) mantendo as mesmas funções: carregar, lista, pega, gravar, gravarVarias.
VP.db = {
  _db: null,
  dados: {},
  nomeBanco: 'vitalpat-cemiterio-gestao',
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
  gravar(col, docs) { return this.gravarVarias({ [col]: Array.isArray(docs) ? docs : [docs] }); },
  async gravarVarias(mapa) {
    const t = this._db.transaction('docs', 'readwrite');
    const s = t.objectStore('docs');
    for (const [col, docs] of Object.entries(mapa)) {
      for (const d of docs) {
        if (!d.id) d.id = VP.u.id();
        d.chave = `${col}/${d.id}`;
        delete d._busca;
        this.dados[col].set(d.id, d);
        s.put(d);
      }
    }
    VP.invalidar && VP.invalidar();
    return new Promise((ok, erro) => { t.oncomplete = () => ok(); t.onerror = () => erro(t.error); });
  },
  async limparTudo() {
    const t = this._db.transaction('docs', 'readwrite');
    t.objectStore('docs').clear();
    await new Promise((ok) => { t.oncomplete = ok; });
    for (const c of VP.COLECOES) this.dados[c] = new Map();
  }
};

VP.config = () => Object.assign({}, VP.CONFIG_PADRAO, (VP.db.pega('meta', 'config') || {}).valores || {});
VP.salvarConfig = (valores) => VP.db.gravar('meta', { id: 'config', valores });
VP.nomeEntidade = () => VP.config().entidade;

VP.novoEvento = (tumuloId, tipo, dados = {}) => ({
  id: VP.u.id(), tumuloId, tipo,
  data: dados.data || VP.Plataforma.hoje(),
  descricao: dados.descricao || '',
  dados: dados.extra || {},
  loteId: dados.loteId || null,
  usuario: VP.sessao?.usuario || 'demonstração',
  criadoEm: VP.Plataforma.agoraISO(),
  cancelado: false
});

VP.nome = (col, id) => {
  const x = VP.db.pega(col, id);
  return x ? (x.nome || x.codigo || '—') : '—';
};
