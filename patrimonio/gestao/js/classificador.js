/* VitalPat Patrimônio · Gestão — classificador: patrimônio (com plaqueta) ou item de controle (sem plaqueta)?
   Regra local (Configurações): item de controle só quando o valor é até o limite (padrão R$ 300) E a vida útil é até
   o limite de meses (padrão 24). Passou de um dos dois: patrimônio com plaqueta.
   A vida útil de cada item vem da lista "Vida útil dos itens" (Cadastros, editável). Se o nome não está na lista,
   usa a vida útil da classificação. Se ninguém sabe, na dúvida a sugestão é plaqueta.
   O sistema SÓ SUGERE e mostra o motivo. Quem decide é a pessoa, item a item. A decisão fica guardada
   (Cadastros → Decisões guardadas) e vira a sugestão da próxima vez que o mesmo item aparecer. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u;
  const K = VP.classificador = {};

  // Lista inicial (sugestão do sistema, NÃO é norma: ajuste à regra do município em Cadastros → Vida útil dos itens).
  // [nome, palavras que identificam o item (separadas por |), vida útil em meses]
  K.LISTA_INICIAL = [
    // pouca durabilidade (até 2 anos)
    ['Mouse', 'mouse', 12], ['Teclado', 'teclado', 24], ['Fone de ouvido', 'fone|headset', 12], ['Pen drive', 'pen drive|pendrive', 24],
    ['Cabo', 'cabo hdmi|cabo usb|cabo de rede|cabo vga|cabo', 12], ['Carregador', 'carregador|fonte de alimentacao', 12], ['Adaptador', 'adaptador', 12],
    ['Filtro de linha / extensão', 'filtro de linha|extensao|regua', 24], ['Webcam', 'webcam', 24], ['Mouse pad', 'mouse pad|mousepad', 12],
    ['Grampeador', 'grampeador', 24], ['Perfurador de papel', 'perfurador', 24], ['Tesoura', 'tesoura', 24], ['Estilete', 'estilete', 12],
    ['Lixeira', 'lixeira|cesto de lixo', 24], ['Garrafa térmica', 'garrafa termica|termica', 12], ['Jarra', 'jarra', 12], ['Copo', 'copo|caneca', 12],
    ['Prato', 'prato', 24], ['Talher', 'talher|garfo|faca de mesa|colher', 24], ['Panela', 'panela|frigideira|caldeirao', 24], ['Bacia', 'bacia', 12],
    ['Balde', 'balde', 12], ['Vassoura', 'vassoura', 6], ['Rodo', 'rodo', 6], ['Pá de lixo', 'pa de lixo', 12], ['Mangueira', 'mangueira', 24],
    ['Guarda-chuva', 'guarda chuva|sombrinha', 12], ['Toalha', 'toalha', 12], ['Lençol', 'lencol|fronha', 12], ['Travesseiro', 'travesseiro', 12],
    ['Colchonete', 'colchonete', 24], ['Uniforme', 'uniforme|camiseta|jaleco|avental', 12], ['Calçado de segurança', 'bota|botina|calcado', 12],
    ['Capacete', 'capacete', 24], ['Luva', 'luva', 6], ['Bola', 'bola', 12], ['Brinquedo', 'brinquedo|boneca|carrinho de brinquedo', 12],
    ['Jogo pedagógico', 'jogo pedagogico|quebra cabeca|domino', 12], ['Lâmpada', 'lampada', 12], ['Pilha / bateria', 'pilha|bateria', 12],
    ['Cadeado', 'cadeado', 24], ['Ferramenta manual', 'chave de fenda|alicate|martelo|serrote|trena', 24], ['Tapete', 'tapete|capacho', 24],
    ['Calculadora de mesa', 'calculadora', 24], ['Porta-documentos', 'porta documentos|organizador de mesa|bandeja', 24], ['Quadro de avisos (cortiça)', 'quadro de cortica|quadro de avisos', 24],
    // duram mais de 2 anos (com plaqueta, mesmo quando baratos)
    ['Cadeira', 'cadeira', 120], ['Cadeira de rodas', 'cadeira de rodas', 60], ['Mesa', 'mesa', 120], ['Armário', 'armario|roupeiro', 120],
    ['Arquivo de aço', 'arquivo', 120], ['Estante', 'estante|prateleira', 120], ['Gaveteiro', 'gaveteiro', 120], ['Banco / longarina', 'banco|longarina', 120],
    ['Sofá', 'sofa|poltrona', 120], ['Cama / beliche', 'cama|beliche|berco', 120], ['Quadro branco', 'quadro branco|lousa', 120], ['Maca', 'maca', 120],
    ['Computador', 'computador|desktop|cpu', 60], ['Notebook', 'notebook|laptop', 60], ['Monitor', 'monitor', 60], ['Impressora', 'impressora|multifuncional', 60],
    ['Tablet', 'tablet', 36], ['Celular', 'celular|smartphone', 36], ['Telefone', 'telefone', 60], ['Nobreak', 'nobreak|no break', 60], ['Estabilizador', 'estabilizador', 36],
    ['Roteador / switch', 'roteador|switch', 60], ['Projetor', 'projetor|datashow', 60], ['Televisor', 'televisor|televisao|smart tv|tv', 60], ['Caixa de som', 'caixa de som|caixa amplificada', 60],
    ['Microfone', 'microfone', 36], ['Câmera fotográfica', 'camera', 60], ['Ar-condicionado', 'ar condicionado|split', 120], ['Ventilador', 'ventilador|circulador', 60],
    ['Geladeira / freezer', 'geladeira|refrigerador|freezer', 120], ['Fogão', 'fogao|cooktop', 120], ['Micro-ondas', 'micro ondas|microondas', 60], ['Forno', 'forno', 120],
    ['Bebedouro / purificador', 'bebedouro|purificador', 120], ['Liquidificador', 'liquidificador', 36], ['Batedeira', 'batedeira', 36], ['Cafeteira', 'cafeteira', 36],
    ['Aspirador', 'aspirador', 60], ['Lavadora', 'lavadora|maquina de lavar|lavadora de alta pressao', 60], ['Furadeira / parafusadeira', 'furadeira|parafusadeira', 60],
    ['Roçadeira / motosserra', 'rocadeira|motosserra|motopoda', 60], ['Escada', 'escada', 120], ['Carrinho de transporte', 'carrinho de carga|carrinho', 60], ['Balança', 'balanca', 120]
  ];

  const norm = (s) => u.normalizar(String(s || '')).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  K.norm = norm;
  const idDecisao = (nome) => 'n:' + norm(nome).slice(0, 120);

  // Grava a lista inicial uma vez (depois ela é só da pessoa: editar, incluir, mandar para a Lixeira)
  K.garantirLista = async ({ gravar = true } = {}) => {
    if (VP.db.pega('meta', 'vidaUtilItens')) return 0;
    if (VP.db.lista('vidaUtilItens', true).length) return 0;
    const docs = K.LISTA_INICIAL.map(([nome, termos, meses], i) => ({ id: 'VI' + String(i + 1).padStart(3, '0'), nome, termos, vidaUtilMeses: meses, origem: 'Lista inicial do sistema' }));
    if (!gravar) { for (const d of docs) VP.db.dados.vidaUtilItens.set(d.id, d); return docs.length; }
    await VP.db.gravarVarias({ vidaUtilItens: docs, meta: [{ id: 'vidaUtilItens', criadoEm: VP.Plataforma.agoraISO(), quantidade: docs.length }] });
    return docs.length;
  };

  // Procura o item da lista que combina com a descrição (a combinação mais longa ganha: "cadeira de rodas" antes de "cadeira")
  K.procurar = (descricao) => {
    const d = ' ' + norm(descricao) + ' ';
    if (!d.trim()) return null;
    let melhor = null, tam = 0;
    for (const x of VP.db.lista('vidaUtilItens')) {
      for (const t of String(x.termos || x.nome).split('|').map(norm).filter(Boolean)) {
        if (d.includes(' ' + t + ' ') && t.length > tam) { melhor = x; tam = t.length; }
      }
    }
    return melhor;
  };

  // A regra, sozinha: { controle: true | false | null (falta saber a vida útil), motivo }
  K.regra = (valor, vidaUtilMeses) => {
    const cfg = VP.config();
    const lim = Number(cfg.limiteControle) || 0, meses = Number(cfg.limiteControleMeses) || 24;
    if (valor == null || valor === '') return { controle: null, motivo: 'sem valor informado' };
    if (Number(valor) > lim) return { controle: false, motivo: `valor ${u.moeda(valor)} acima de ${u.moeda(lim)}` };
    if (vidaUtilMeses == null || !(Number(vidaUtilMeses) > 0)) return { controle: null, motivo: `valor até ${u.moeda(lim)}, mas a vida útil não é conhecida` };
    if (Number(vidaUtilMeses) > meses) return { controle: false, motivo: `dura ${vidaUtilMeses} meses (mais de ${meses}), mesmo custando ${u.moeda(valor)}` };
    return { controle: true, motivo: `valor até ${u.moeda(lim)} e dura ${vidaUtilMeses} meses (até ${meses})` };
  };

  // Análise completa de um item: { sugestao: 'controle' | 'patrimonio', motivo, vidaUtilMeses, fonteVida, decisaoAnterior, certeza }
  K.analisar = ({ descricao, valor, classificacaoId, tipo } = {}) => {
    if (tipo && tipo !== 'movel') return { sugestao: 'patrimonio', motivo: 'veículo, imóvel e infraestrutura são sempre patrimônio', certeza: true };
    const item = K.procurar(descricao);
    let vida = item ? Number(item.vidaUtilMeses) : null, fonteVida = item ? `lista de vida útil: "${item.nome}"` : '';
    if (vida == null && classificacaoId) {
      const cl = VP.db.pega('classificacoes', classificacaoId);
      const dc = VP.dadosDaClassificacao(classificacaoId);
      if (!cl?.aClassificar && !dc.naoDeprecia && dc.vidaUtilMeses) { vida = Number(dc.vidaUtilMeses); fonteVida = 'vida útil da classificação'; }
    }
    const r = K.regra(valor, vida);
    const dec = descricao ? VP.db.pega('decisoesItens', idDecisao(descricao)) : null;
    const res = { vidaUtilMeses: vida, fonteVida, regra: r, decisaoAnterior: dec && !dec.excluido ? dec : null };
    if (res.decisaoAnterior) {
      res.sugestao = dec.escolha;
      res.motivo = `da última vez (${u.data(dec.ultimaEm)}) você escolheu ${dec.escolha === 'controle' ? 'item de controle' : 'patrimônio com plaqueta'} para este item`;
      res.certeza = true;
    } else {
      res.sugestao = r.controle === true ? 'controle' : 'patrimonio';
      res.motivo = r.controle === null ? `${r.motivo}: na dúvida, plaqueta. Confira.` : r.motivo;
      res.certeza = r.controle !== null;
    }
    return res;
  };
  K.textoSugestao = (a) => (a.sugestao === 'controle' ? 'Item de controle' : 'Patrimônio (plaqueta)');

  // Guarda a decisão da pessoa (vira a sugestão da próxima vez). Só vale para bens baratos, onde a regra importa.
  K.registrarDecisoes = async (lista) => {
    const docs = [];
    for (const { descricao, escolha, valor, sugerido } of lista) {
      if (!descricao || !['controle', 'patrimonio'].includes(escolha)) continue;
      if (valor != null && Number(valor) > Number(VP.config().limiteControle)) continue;
      const id = idDecisao(descricao);
      const d = docs.find((x) => x.id === id) || VP.db.pega('decisoesItens', id) || { id, nome: String(descricao).trim(), vezes: { controle: 0, patrimonio: 0 } };
      d.excluido = false;
      d.escolha = escolha; d.ultimaEm = VP.Plataforma.hoje(); d.ultimoValor = valor ?? null;
      d.vezes = Object.assign({ controle: 0, patrimonio: 0 }, d.vezes); d.vezes[escolha]++;
      if (sugerido && sugerido !== escolha) d.mudouASugestao = (d.mudouASugestao || 0) + 1;
      d.usuario = VP.sessao?.usuario || 'demonstração';
      if (!docs.includes(d)) docs.push(d);
    }
    if (docs.length) await VP.db.gravar('decisoesItens', docs);
    return docs.length;
  };

  // Pedacinho de tela: seletor "Vai para" com a sugestão marcada e o motivo
  K.seletor = (a, attrs = '') => `
    <div class="destino-item ${a.sugestao === 'controle' ? 'sug-controle' : ''}">
      <label>Vai para <select ${attrs}>
        <option value="patrimonio" ${a.sugestao === 'patrimonio' ? 'selected' : ''}>Patrimônio (com plaqueta)</option>
        <option value="controle" ${a.sugestao === 'controle' ? 'selected' : ''}>Item de controle (sem plaqueta)</option>
      </select></label>
      <small>Sugestão: <b>${K.textoSugestao(a)}</b> — ${u.esc(a.motivo)}${a.fonteVida ? ` (${u.esc(a.fonteVida)})` : ''}. Você decide.</small>
    </div>`;
})();
