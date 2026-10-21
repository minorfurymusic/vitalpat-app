/* VitalPat Cemitério — aplicativo de campo: envio dos registros ao servidor (Supabase).
   Só funciona quando ../config-servidor.js está preenchido. Sem isso, o aplicativo segue
   em demonstração e os registros ficam só no aparelho (como antes).
   O aplicativo continua funcionando sem internet: grava no aparelho e envia quando a internet volta. */
'use strict';
(function () {
  const PRODUTO = 'cemiterio';
  const cfg = window.VP_SERVIDOR_CEMITERIO;
  const ativo = !!(cfg && cfg.url && cfg.chavePublica && window.supabase);
  const Envio = window.Envio = { ativo, municipio: (cfg && cfg.municipio) || '', enviando: false };
  if (!ativo) return;

  // db.schema: cada sistema usa a sua área do banco (pode dividir o projeto com o outro sistema)
  const c = window.supabase.createClient(cfg.url, cfg.chavePublica, {
    db: { schema: PRODUTO },
    auth: { storageKey: `vitalpat-auth-${PRODUTO}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  Envio.cliente = c;
  Envio.sair = async () => { await c.auth.signOut().catch(() => {}); };

  const motivo = (e) => {
    const m = String(e?.message || e || '');
    if (/row-level security|permission denied|42501/i.test(m)) return 'Seu acesso não permite enviar. Fale com o administrador.';
    if (/fetch|network|Failed|ERR_/i.test(m)) return 'Sem conexão com o servidor.';
    return 'Falha no envio: ' + m.slice(0, 120);
  };

  // Baixa do servidor a lista de túmulos e as ordens de serviço abertas, para conferir o código sem internet.
  // O código é o mesmo da Gestão: Q<código da quadra>-A<aléia>-<número>, sem zeros à esquerda.
  const normNumero = (n) => {
    const t = String(n ?? '').toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    const m = t.match(/^0*(\d+)\s*(.*)$/);
    return m ? (m[1] + (m[2] ? ' ' + m[2].replace(/^-\s*/, '').trim() : '')).trim() : t;
  };
  const normAleia = (a) => { const t = String(a ?? '').toUpperCase().replace(/\s+/g, ' ').trim(); const m = t.match(/^0*(\d+)$/); return m ? m[1] : t; };
  Envio.baixarLista = async () => {
    const { data: s } = await c.auth.getSession();
    if (!s.session) return { semLogin: true };
    const docs = { quadras: [], tumulos: [], ordensServico: [] };
    const PAGINA = 1000;
    for (const col of Object.keys(docs)) {
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await c.from('docs').select('id, dados').eq('colecao', col).eq('excluido', false).order('id').range(de, de + PAGINA - 1);
        if (error) throw new Error(motivo(error));
        docs[col].push(...data.map((r) => Object.assign(r.dados, { id: r.id })));
        if (data.length < PAGINA) break;
      }
    }
    const quadras = new Map(docs.quadras.map((q) => [q.id, q]));
    const codigo = (t) => { const q = quadras.get(t.quadraId); return `Q${String(q?.codigo || '?').replace(/\s+/g, '')}-A${normAleia(t.aleia) || '0'}-${normNumero(t.numero).replace(/\s+/g, '')}`; };
    const descricao = (t) => `${quadras.get(t.quadraId)?.nome || '?'} · Aléia ${t.aleia || '—'} · Nº ${t.numero}`;
    const porId = new Map(docs.tumulos.map((t) => [t.id, t]));
    const TIPOS = { limpeza: 'Limpeza', reparo: 'Conserto', acidente: 'Acidente ou risco', vistoria: 'Fazer vistoria', outro: 'Outro' };
    const lista = {
      quando: new Date().toISOString(),
      tumulos: docs.tumulos.map((t) => ({ codigo: codigo(t), descricao: descricao(t), plaqueta: t.plaqueta != null ? String(t.plaqueta).padStart(6, '0') : '' })),
      ordens: docs.ordensServico.filter((o) => o.situacao === 'aberta' || o.situacao === 'andamento').map((o) => {
        const t = porId.get(o.tumuloId);
        return { id: o.id, numero: o.numero, codigo: t ? (t.plaqueta != null ? String(t.plaqueta).padStart(6, '0') : codigo(t)) : '', descricao: t ? descricao(t) : (o.local || ''), tipo: o.tipo, tipoNome: TIPOS[o.tipo] || o.tipo, prioridade: o.prioridade, oQueFazer: o.descricao, prazo: o.prazo };
      })
    };
    return { lista };
  };

  // Envia todos os registros "aguardando". Devolve { enviados: [...], falhas: [{ id, motivo }] }.
  Envio.enviar = async (Banco, aoAvancar) => {
    if (Envio.enviando) return { enviados: [], falhas: [], ocupado: true };
    Envio.enviando = true;
    const resultado = { enviados: [], falhas: [] };
    try {
      const { data: s } = await c.auth.getSession();
      if (!s.session) return { enviados: [], falhas: [], semLogin: true };
      const pendentes = (await Banco.todos()).filter((r) => r.situacao === 'aguardando');
      for (const [i, r] of pendentes.entries()) {
        try {
          // Fotos primeiro, no armazenamento privado; o registro guarda só o caminho
          const fotos = [];
          for (const [k, f] of (r.fotos || []).entries()) {
            const caminho = `registrosCampo/${r.id}/${k + 1}.jpg`;
            if (!(r.fotosEnviadas || []).includes(caminho)) {
              const blob = await (await fetch(f)).blob();
              const { error } = await c.storage.from(`${PRODUTO}-arquivos`).upload(caminho, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
              if (error && !/exists|Duplicate/i.test(error.message)) throw error;
              r.fotosEnviadas = (r.fotosEnviadas || []).concat(caminho);
              await Banco.salvar(r); // se cair no meio, não reenvia a mesma foto
            }
            fotos.push({ caminho, tipo: 'image/jpeg' });
          }
          const dados = Object.assign({}, r, { fotos, fotosEnviadas: undefined, situacao: 'recebido', enviadoEm: new Date().toISOString(), origem: 'aplicativo de campo' });
          const { error } = await c.from('docs').upsert({ colecao: 'registrosCampo', id: r.id, dados: JSON.parse(JSON.stringify(dados)) }, { onConflict: 'colecao,id' });
          if (error) throw error;
          r.situacao = 'enviado'; r.enviadoEm = dados.enviadoEm; delete r.ultimoErro;
          r.historico.push({ quando: r.enviadoEm, acao: 'enviado ao servidor' });
          await Banco.salvar(r);
          resultado.enviados.push(r);
        } catch (e) {
          r.ultimoErro = motivo(e);
          await Banco.salvar(r);
          resultado.falhas.push({ id: r.id, motivo: r.ultimoErro });
        }
        if (aoAvancar) aoAvancar(i + 1, pendentes.length);
      }
      return resultado;
    } finally {
      Envio.enviando = false;
    }
  };
})();
