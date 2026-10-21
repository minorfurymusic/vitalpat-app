/* VitalPat Patrimônio · Gestão — ligação ao servidor (Supabase) desta cidade.
   Só entra em ação quando ../config-servidor.js está preenchido; vazio = demonstração no navegador.
   Troca o armazenamento (VP.db) mantendo as mesmas funções, então as telas não mudam.
   Este arquivo é do sistema do patrimônio; o cemitério tem o seu próprio. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u;
  const PRODUTO = 'patrimonio';
  const cfg = window.VP_SERVIDOR_PATRIMONIO;
  const LOTE = 500;          // registros por envio
  const PAGINA = 1000;       // registros por leitura (limite do Supabase)
  const VALIDADE_FOTO = 12 * 3600; // link temporário das fotos: 12 horas

  VP.servidor = { ativo: !!(cfg && cfg.url && cfg.chavePublica && window.supabase) };
  if (!VP.servidor.ativo) return;

  // db.schema: cada sistema usa a sua área do banco (pode dividir o projeto com o outro sistema)
  const c = window.supabase.createClient(cfg.url, cfg.chavePublica, {
    db: { schema: PRODUTO },
    auth: { storageKey: `vitalpat-auth-${PRODUTO}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  Object.assign(VP.servidor, { cliente: c, municipio: cfg.municipio || '', perfil: null });

  const voltarAoLogin = (motivo) => {
    try { localStorage.removeItem('vitalpat-sessao'); } catch (_) { /* nada a fazer */ }
    location.replace('../../index.html?motivo=' + motivo);
    return new Promise(() => {}); // a página está saindo
  };
  const erroDoServidor = (e) => Object.assign(new Error(e?.message || String(e)), { vpServidor: true, original: e });

  // Confere a sessão e o perfil antes de abrir
  VP.servidor.entrar = async () => {
    const { data: s } = await c.auth.getSession();
    if (!s.session) return voltarAoLogin('expirou');
    const { data: p, error } = await c.from('perfis').select('nome, email, papel, ativo').eq('user_id', s.session.user.id).maybeSingle();
    if (error) throw erroDoServidor(error);
    if (!p) return voltarAoLogin('sem-acesso');
    if (!p.ativo) return voltarAoLogin('inativo');
    const { data: inst, error: e2 } = await c.from('instalacao').select('produto, municipio, uf').maybeSingle();
    if (e2) throw erroDoServidor(e2);
    if (inst && inst.produto !== PRODUTO) throw erroDoServidor(new Error('Este banco não é do sistema do patrimônio. Confira o arquivo config-servidor.js.'));
    VP.servidor.perfil = Object.assign({ userId: s.session.user.id, email: s.session.user.email }, p);
    if (inst) VP.servidor.municipio = `${inst.municipio}/${inst.uf}`;
    VP.sessao = Object.assign({}, VP.sessao, { usuario: p.nome || p.email, papel: p.papel });
    document.body.classList.add('papel-' + p.papel);
    c.auth.onAuthStateChange((evento, sessao) => { if (!saindo && (evento === 'SIGNED_OUT' || !sessao)) voltarAoLogin('expirou'); });
  };
  let saindo = false; // Sair de propósito não é "sessão terminou"
  VP.servidor.sair = async () => { saindo = true; await c.auth.signOut().catch(() => {}); };
  VP.servidor.podeAlterar = () => ['admin', 'gestor'].includes(VP.servidor.perfil?.papel);

  // ------------------------------------------------------------------ fotos e anexos
  // Na tela continuam como "dataURL"; no servidor vão para o armazenamento "arquivos" e o registro guarda só o caminho.
  // Visita todo objeto que tenha a chave pedida ("dataURL" = arquivo na tela; "caminho" = arquivo no servidor)
  const percorrer = (x, chave, fn) => {
    if (Array.isArray(x)) x.forEach((y) => percorrer(y, chave, fn));
    else if (x && typeof x === 'object') { if (chave in x) fn(x); for (const v of Object.values(x)) if (v && typeof v === 'object') percorrer(v, chave, fn); }
  };
  const extensao = (tipo) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[tipo] || 'bin');
  const enviarArquivos = async (col, d) => {
    const pendentes = [];
    percorrer(d, 'dataURL', (a) => { if (!a.caminho && typeof a.dataURL === 'string' && a.dataURL.startsWith('data:')) pendentes.push(a); });
    for (const a of pendentes) {
      const blob = await (await fetch(a.dataURL)).blob();
      const caminho = `${col}/${d.id}/${a.id || u.id()}.${extensao(blob.type || a.tipo)}`;
      const { error } = await c.storage.from(`${PRODUTO}-arquivos`).upload(caminho, blob, { contentType: blob.type || a.tipo || 'application/octet-stream', upsert: false });
      if (error) throw erroDoServidor(error);
      a.caminho = caminho;
    }
  };
  const linkDasFotos = async (docs) => {
    const itens = [];
    for (const d of docs) percorrer(d, 'caminho', (a) => { if (typeof a.caminho === 'string') itens.push(a); });
    for (let i = 0; i < itens.length; i += PAGINA) {
      const parte = itens.slice(i, i + PAGINA);
      const { data, error } = await c.storage.from(`${PRODUTO}-arquivos`).createSignedUrls(parte.map((a) => a.caminho), VALIDADE_FOTO);
      if (error) continue; // sem foto não impede de trabalhar
      data.forEach((r, k) => { if (r.signedUrl) parte[k].dataURL = r.signedUrl; });
    }
  };
  // Cópia que vai para o servidor: sem campos só de tela e sem a imagem dentro do registro
  const paraServidor = (d) => JSON.parse(JSON.stringify(d, (k, v) => (k === '_busca' ? undefined : v)), function (k, v) {
    if (k === 'dataURL' && this && this.caminho) return undefined;
    return v;
  });

  // ------------------------------------------------------------------ armazenamento (mesmas funções do modo navegador)
  const db = VP.db;
  db.carregar = async function () {
    await VP.servidor.entrar();
    for (const col of VP.COLECOES) this.dados[col] = new Map();
    let total = 0;
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await c.from('docs').select('colecao, id, dados').order('colecao').order('id').range(de, de + PAGINA - 1);
      if (error) throw erroDoServidor(error);
      for (const r of data) if (this.dados[r.colecao]) { this.dados[r.colecao].set(r.id, Object.assign(r.dados, { id: r.id, chave: `${r.colecao}/${r.id}` })); total++; }
      if (data.length < PAGINA) break;
    }
    await linkDasFotos(VP.COLECOES.flatMap((col) => [...this.dados[col].values()]));
    VP.invalidarIndice && VP.invalidarIndice();
    return total;
  };
  db.gravar = function (col, docs) { const lista = Array.isArray(docs) ? docs : [docs]; return this.gravarVarias({ [col]: lista }).then(() => lista); };
  db.gravarVarias = async function (mapa) {
    const linhas = [];
    for (const [col, docs] of Object.entries(mapa)) {
      for (const d of docs) {
        if (!d.id) d.id = u.id();
        d.chave = `${col}/${d.id}`;
        delete d._busca;
        this.dados[col].set(d.id, d);
        linhas.push({ col, d });
      }
    }
    VP.invalidarIndice && VP.invalidarIndice();
    const grande = linhas.length > LOTE;
    let enviados = 0;
    try {
      for (const { col, d } of linhas) await enviarArquivos(col, d);
      for (let i = 0; i < linhas.length; i += LOTE) {
        const parte = linhas.slice(i, i + LOTE).map(({ col, d }) => ({ colecao: col, id: d.id, dados: paraServidor(d) }));
        const { error } = await c.from('docs').upsert(parte, { onConflict: 'colecao,id' });
        if (error) throw erroDoServidor(error);
        enviados += parte.length;
        if (grande) VP.ui?.aviso(`Gravando no servidor… ${u.inteiro(enviados)} de ${u.inteiro(linhas.length)}`);
      }
    } catch (e) {
      const semPermissao = /row-level security|permission denied|42501/i.test(e.message);
      VP.ui?.resultado({
        titulo: 'Não foi possível gravar tudo no servidor',
        sucesso: enviados ? [`${u.inteiro(enviados)} registro(s) gravado(s) antes da falha`] : [],
        falhas: [{ item: `${u.inteiro(linhas.length - enviados)} registro(s) não gravado(s)`, motivo: semPermissao ? 'Seu acesso não permite esta alteração. Fale com o administrador.' : 'Sem conexão com o servidor ou falha no envio. Confira a internet e tente de novo.' }],
        extra: '<p class="ajuda">A tela foi recarregada com o que está gravado no servidor.</p>'
      });
      await this.carregar().catch(() => {});
      VP.app?.render();
      throw erroDoServidor(e);
    }
  };
  db.limparTudo = async () => { throw erroDoServidor(new Error('Com servidor, nada é apagado.')); };

  // O erro já foi mostrado na tela de resultado; não precisa aparecer de novo como erro solto
  window.addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.vpServidor) e.preventDefault(); });

  // ------------------------------------------------------------------ tela Pessoas (só administrador)
  const PAPEIS = { admin: 'Administrador (tudo, inclusive pessoas)', gestor: 'Gestor (cadastra e altera)', campo: 'Campo (inventário, vistorias, abastecimento)', consulta: 'Consulta (só vê)' };
  VP.telas = VP.telas || {};
  VP.telas.pessoas = () => {
    if (VP.servidor.perfil?.papel !== 'admin') return { titulo: 'Pessoas', html: '<p class="aviso-inline">Só o administrador vê esta tela.</p>' };
    const ui = VP.ui, esc = u.esc;
    return {
      titulo: 'Pessoas com acesso',
      html: `<p class="ajuda">Para cadastrar alguém: no Supabase, Authentication → Users → Add user (e-mail e senha). A pessoa aparece aqui como <b>aguardando liberação</b>; escolha o papel e libere. Ninguém é apagado: para tirar o acesso, desative.</p><div id="area-pessoas"><p>Carregando…</p></div>`,
      async ligar() {
        const area = document.getElementById('area-pessoas');
        const { data, error } = await c.from('perfis').select('user_id, nome, email, papel, ativo, criado_em').order('ativo').order('nome');
        if (error) { area.innerHTML = '<p class="aviso-inline">Não foi possível ler a lista de pessoas.</p>'; return; }
        area.innerHTML = ui.tabela({ id: 'pessoas', linhas: data.map((x) => Object.assign({ id: x.user_id }, x)), nomePlanilha: 'pessoas', colunas: [
          { chave: 'nome', titulo: 'Nome' }, { chave: 'email', titulo: 'E-mail' },
          { chave: 'papel', titulo: 'Papel', valor: (x) => PAPEIS[x.papel] || x.papel },
          { chave: 'ativo', titulo: 'Situação', html: (x) => (x.ativo ? '<span class="selo-status s-ativo">Ativo</span>' : '<span class="selo-status t-pendente">Aguardando liberação / desativado</span>'), valor: (x) => (x.ativo ? 'Ativo' : 'Inativo') },
          { chave: 'a', titulo: '', html: (x) => `<button class="botao pequeno" data-pessoa="${esc(x.user_id)}">Alterar</button>` }] });
        ui.ligarTabela('pessoas');
        area.onclick = (e) => {
          const b = e.target.closest('[data-pessoa]'); if (!b) return;
          const x = data.find((y) => y.user_id === b.dataset.pessoa);
          ui.formulario({ titulo: 'Acesso de ' + (x.nome || x.email), largura: 'pequena', valores: x,
            campos: [{ chave: 'nome', rotulo: 'Nome', obrigatorio: true }, { chave: 'papel', rotulo: 'Papel', tipo: 'select', opcoes: Object.entries(PAPEIS), vazio: false }, { chave: 'ativo', rotulo: 'Acesso liberado', tipo: 'bool' }],
            salvar: async (v) => {
              const { error: e2 } = await c.from('perfis').update({ nome: v.nome, papel: v.papel, ativo: v.ativo }).eq('user_id', x.user_id);
              if (e2) return /administrador ativo/.test(e2.message) ? 'É preciso ter pelo menos um administrador ativo.' : 'Não foi possível salvar.';
              ui.aviso('Acesso atualizado.'); VP.app.render();
            } });
        };
      }
    };
  };
})();
