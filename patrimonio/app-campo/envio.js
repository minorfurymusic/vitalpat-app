/* VitalPat Patrimônio — aplicativo de campo: envio dos registros ao servidor (Supabase).
   Só funciona quando ../config-servidor.js está preenchido. Sem isso, o aplicativo segue
   em demonstração e os registros ficam só no aparelho (como antes).
   O aplicativo continua funcionando sem internet: grava no aparelho e envia quando a internet volta. */
'use strict';
(function () {
  const PRODUTO = 'patrimonio';
  const cfg = window.VP_SERVIDOR_PATRIMONIO;
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
