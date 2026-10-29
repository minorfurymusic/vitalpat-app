/* VitalPat Patrimônio · Gestão — termos do livro "Gestão patrimonial" que ainda faltavam (29/10/2026, Pendência 12).
   Termo de Responsabilidade de Bens de Particulares (Fig. 85, pág. 297) → tela Termos de responsabilidade;
   Justificativa de Abandono (Fig. 56, pág. 182) e Termo de Inutilização (Fig. 57, pág. 183) → Baixa (tipos "Abandono" e "Inutilização").
   O fundamento legal vem do livro e está marcado para atualizar: as fotos têm a anotação "Atualizar via PDF" (lei nova depois
   do livro). A pessoa pode corrigir o texto na tela antes de imprimir; a versão definitiva entra quando chegar o PDF de legislação. */
'use strict';
(function () {
  const VP = window.VP;
  const u = VP.u, esc = u.esc, ui = VP.ui;
  const TL = VP.termosLivro = {};
  const hoje = () => VP.Plataforma.hoje();
  const agora = () => VP.Plataforma.agoraISO();
  const usuario = () => VP.servidor?.ativo ? (VP.servidor.perfil?.nome || VP.servidor.perfil?.email || 'servidor') : (VP.sessao?.usuario || 'demonstração');
  const AVISO_LEI = 'Texto legal do livro (publicado antes de leis novas): ATUALIZAR pelo PDF de legislação antes de usar oficialmente.';
  TL.FUND_ABANDONO = 'Com base no parágrafo único do art. 7º do Decreto nº 9.373/2018 e suas alterações, no art. 76 da Lei nº 14.133/2021 e na legislação municipal aplicável';
  TL.FUND_INUTILIZACAO = 'Com base no parágrafo único do art. 7º do Decreto nº 9.373/2018 e suas alterações, no art. 76 da Lei nº 14.133/2021 e na legislação municipal aplicável';
  TL.FUND_AMBIENTAL = 'nos termos da Lei nº 12.305/2010 (Política Nacional de Resíduos Sólidos)';
  TL.ARGUMENTOS = [
    ['argInteressados', 'os possíveis interessados em recolhê-los não se enquadram no grupo de instituições que poderão receber doações'],
    ['argInstituicoes', 'as instituições credenciadas a receber doações não teriam interesse em recebê-los, devido ao seu alto grau de inservibilidade'],
    ['argCusto', 'o custo de um processo licitatório (alienação/leilão) estaria muito acima do valor a ser arrecadado'],
    ['argEspaco', 'necessidade de desobstrução de espaços'],
    ['argArmazenagem', 'custo de armazenagem (ocupação do espaço) muito elevado']];
  TL.FORMAS_INUTILIZACAO = ['Incineração', 'Trituração', 'Esmagamento', 'Corte', 'Outra forma'];

  const membros = (comissaoId) => { const c = VP.db.pega('comissoes', comissaoId); return c?.membros ? String(c.membros).split(/\n|;|,/).map((x) => x.trim()).filter(Boolean) : ['Presidente da comissão', 'Membro', 'Membro']; };
  const assin = (nomes) => `<div class="assinaturas">${nomes.map((n) => `<div><span></span>${esc(n)}</div>`).join('')}</div>`;
  const tabelaBens = (bens) => `<table class="tabela doc"><thead><tr><th>Plaqueta</th><th>Código</th><th>Bem</th><th>Unidade</th></tr></thead><tbody>${bens.map((b) => `<tr><td>${esc(b.plaqueta || '')}</td><td>${esc(b.codigo)}</td><td>${esc(b.descricao)}</td><td>${esc(VP.nome('unidades', b.unidadeId))}</td></tr>`).join('')}</tbody></table>`;
  const aviso = `<p class="doc-aviso-lei">${esc(AVISO_LEI)}</p>`;
  const registrar = (bens, texto) => VP.db.gravarVarias({ eventos: bens.map((b) => VP.novoEvento(b.id, 'observacao', { descricao: texto })) });
  const camposComuns = (fund) => [
    { chave: 'orgao', rotulo: 'Órgão (o que desfaz os bens)', largura: 'meia' }, { chave: 'comissaoId', rotulo: 'Comissão que presenciou', tipo: 'select', opcoes: VP.db.lista('comissoes').map((c) => [c.id, c.nome]), largura: 'meia' },
    { chave: 'local', rotulo: 'Local (cidade)', largura: 'meia' }, { chave: 'data', rotulo: 'Data', tipo: 'data', largura: 'meia' },
    { chave: 'fundamento', rotulo: 'Fundamento legal (texto do livro: atualizar)', tipo: 'area', ajuda: AVISO_LEI }];

  // ------------------------------------------------------------------ Justificativa de abandono (pág. 182)
  TL.abandono = (bens) => ui.formulario({
    titulo: `Justificativa de abandono — ${bens.length} bem(ns)`, largura: 'media', textoSalvar: 'Imprimir',
    intro: '<p class="ajuda">Quando os bens inservíveis não servem para leilão, doação, permuta nem transferência, e são deixados em local externo para quem quiser recolher. Marque os argumentos que valem.</p>',
    campos: camposComuns().concat(TL.ARGUMENTOS.map(([k, t]) => ({ chave: k, rotulo: t.charAt(0).toUpperCase() + t.slice(1), tipo: 'bool' })),
      [{ chave: 'espaco', rotulo: 'Espaço a desobstruir (se marcou esse argumento)', largura: 'meia' }, { chave: 'localAbandono', rotulo: 'Onde os bens foram deixados', largura: 'meia' }]),
    valores: { orgao: VP.nome('entidades', bens[0]?.entidadeId || 'E1'), data: hoje(), fundamento: TL.FUND_ABANDONO, argCusto: true, argArmazenagem: true },
    salvar: async (v) => {
      const args = TL.ARGUMENTOS.filter(([k]) => v[k]).map(([k, t]) => (k === 'argEspaco' && v.espaco ? `${t} (${v.espaco})` : t));
      if (!args.length) return 'Marque pelo menos um argumento.';
      ui.imprimir(`<h1>Justificativa de abandono</h1>${aviso}
        <p>${esc(v.fundamento || TL.FUND_ABANDONO)}, verificando-se que os materiais relacionados abaixo são considerados inservíveis para ${esc(v.orgao || '________')} e que as outras formas de desfazimento (alienação/leilão, doação, permuta, transferência externa) não se aplicam à situação deles, está sendo dada a destinação na condição de serem abandonados.</p>
        <p>Os argumentos para esta justificativa são:</p><ul>${args.map((a) => `<li>${esc(a)};</li>`).join('')}</ul>
        <p>Os itens constam da relação abaixo e do parecer da comissão. Dessa forma, os referidos bens estão sendo colocados em abandono${v.localAbandono ? `, em ${esc(v.localAbandono)}` : ', em local externo'}, não afetando o meio ambiente, podendo ser recolhidos por possíveis interessados.</p>
        ${tabelaBens(bens)}
        <p>A presente forma de desfazimento foi presenciada pela comissão, que atesta esta justificativa.</p>
        <p>${esc(v.local || '________')}, ${v.data ? u.data(v.data) : '___/___/______'}</p>${assin(membros(v.comissaoId))}`, 'Justificativa de abandono');
      await registrar(bens, 'Justificativa de abandono impressa');
    }
  });

  // ------------------------------------------------------------------ Termo de inutilização (pág. 183)
  TL.inutilizacao = (bens) => ui.formulario({
    titulo: `Termo de inutilização — ${bens.length} bem(ns)`, largura: 'media', textoSalvar: 'Imprimir',
    intro: '<p class="ajuda">Quando os bens são irrecuperáveis e nenhuma forma de alienação serve: são destruídos (incineração, trituração, corte…) sem afetar o meio ambiente. Resíduos perigosos (pilhas, lâmpadas, eletrônicos) pedem destino próprio.</p>',
    campos: camposComuns().concat([{ chave: 'forma', rotulo: 'Como foram inutilizados', tipo: 'select', opcoes: TL.FORMAS_INUTILIZACAO.map((x) => [x, x]), vazio: false, largura: 'meia' }, { chave: 'formaOutra', rotulo: 'Se "Outra forma", qual', largura: 'meia' },
      { chave: 'ambiental', rotulo: 'Fundamento ambiental (texto do livro: atualizar)', ajuda: AVISO_LEI }]),
    valores: { orgao: VP.nome('entidades', bens[0]?.entidadeId || 'E1'), data: hoje(), fundamento: TL.FUND_INUTILIZACAO, ambiental: TL.FUND_AMBIENTAL },
    salvar: async (v) => {
      const forma = v.forma === 'Outra forma' ? (v.formaOutra || 'outra forma') : v.forma;
      ui.imprimir(`<h1>Termo de inutilização</h1>${aviso}
        <p>${esc(v.fundamento || TL.FUND_INUTILIZACAO)}, verificando-se que os materiais relacionados abaixo são considerados irrecuperáveis para ${esc(v.orgao || '________')} e que as outras formas de desfazimento previstas na legislação (alienação/leilão, doação, permuta, transferência externa) não se aplicam à situação deles, está sendo dada a destinação na condição de serem inutilizados.</p>
        <p>O processo deu-se por <b>${esc(String(forma).toLowerCase())}</b>, não afetando o meio ambiente, ${esc(v.ambiental || TL.FUND_AMBIENTAL)}.</p>
        ${tabelaBens(bens)}
        <p>Esta forma de desfazimento foi presenciada pela comissão de avaliação e alienação de bens, que atesta o presente termo.</p>
        <p>${esc(v.local || '________')}, ${v.data ? u.data(v.data) : '___/___/______'}</p>${assin(membros(v.comissaoId))}`, 'Termo de inutilização');
      await registrar(bens, `Termo de inutilização impresso (${forma})`);
    }
  });

  // ------------------------------------------------------------------ Termo de responsabilidade de bens de particulares (pág. 297)
  TL.lista = () => VP.db.lista('termosParticulares').sort((a, b) => String(b.data).localeCompare(String(a.data)));
  TL.particular = (depois, t0 = null) => ui.formulario({
    titulo: 'Termo de responsabilidade de bens particulares', largura: 'media', textoSalvar: 'Guardar e imprimir',
    intro: '<p class="ajuda">Quando um servidor usa no trabalho um bem que é <b>dele</b> (notebook, ferramenta, ventilador). O bem não entra no patrimônio da prefeitura; o termo registra que a responsabilidade é do servidor. Um bem por linha (ex.: "Notebook Marca X, série 123").</p>',
    campos: [{ chave: 'responsavelId', rotulo: 'Servidor (dos Responsáveis)', tipo: 'select', opcoes: VP.db.lista('responsaveis').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((r) => [r.id, r.nome]), largura: 'meia' }, { chave: 'nome', rotulo: 'Ou: nome do servidor', largura: 'meia' },
      { chave: 'unidadeId', rotulo: 'Lotado em', tipo: 'select', opcoes: VP.db.lista('unidades').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) => [x.id, x.nome]), largura: 'meia' }, { chave: 'matricula', rotulo: 'Matrícula', largura: 'meia' },
      { chave: 'bens', rotulo: 'Bens (um por linha)', tipo: 'area', obrigatorio: true }, { chave: 'data', rotulo: 'Data', tipo: 'data', largura: 'meia' }, { chave: 'local', rotulo: 'Local (cidade)', largura: 'meia' }],
    valores: t0 || { data: hoje() },
    salvar: async (v) => {
      const r = VP.db.pega('responsaveis', v.responsavelId);
      const nome = v.nome || r?.nome; if (!nome) return 'Escolha o servidor ou digite o nome.';
      const linhas = String(v.bens).split(/\n/).map((x) => x.trim()).filter(Boolean);
      const t = Object.assign(t0 || { id: u.id(), criadoEm: agora(), usuario: usuario() }, v, { nome, matricula: v.matricula || r?.matricula || '', itens: linhas });
      await VP.db.gravar('termosParticulares', t);
      ui.imprimir(`<h1>Termo de responsabilidade de bens particulares</h1>
        <p><b>${esc(nome)}</b>, servidor(a) público(a) municipal, lotado(a) em ${esc(VP.nome('unidades', v.unidadeId) || '________')}, matrícula ${esc(t.matricula || '________')}, CPF nº ____________, tendo necessidade de utilizar materiais/bens de sua propriedade na instituição em que atua, vem por meio deste assumir total responsabilidade pelos bens abaixo relacionados, no tocante a extravio, roubo, furto e danificação, podendo os mesmos ser controlados pela área responsável pelo patrimônio deste órgão.</p>
        <h2>Relação dos bens</h2><ol>${linhas.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <p>${esc(v.local || '________')}, ${v.data ? u.data(v.data) : '___/___/______'}</p>${assin(['Assinatura do(a) servidor(a)', 'Visto do setor de patrimônio'])}`, 'Termo de bens particulares');
      depois && depois();
    }
  });
  TL.secaoTermos = () => {
    const l = TL.lista();
    return `<section class="cartao" id="sec-particulares"><header class="cab-secao"><h3>Bens particulares usados no trabalho (${l.length})</h3><button class="botao pequeno" data-particular-novo>+ Termo de bens particulares</button></header>
      ${l.length ? `<ul class="lista-conferencia">${l.map((t) => `<li><span class="conf-nome"><b>${esc(t.nome)}</b> · ${esc(VP.nome('unidades', t.unidadeId))} · ${u.data(t.data)}<br><small>${esc((t.itens || []).join('; '))}</small></span><span class="conf-acoes"><button class="botao pequeno" data-particular-imp="${esc(t.id)}">Imprimir</button></span></li>`).join('')}</ul>` : '<p class="vazio">Nenhum. Use quando um servidor trouxer um bem dele para usar no trabalho.</p>'}</section>`;
  };
})();
