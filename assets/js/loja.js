// Página de vendas: cardápio, carrinho e pedido pronto para o WhatsApp.

import { abrirStore } from './store.js';
import {
  brl, esc, num, linkWhats, telefoneBonito, telefoneWhats, codigoPedido, isoLocal,
  dataComDia, lerLocal, gravarLocal, copiarTexto,
} from './util.js';
import {
  textoQtd, totaisPedido, formasAntecipadas, PIX_ANTECIPADO, CARTAO_PELO_LINK, CARTAO_NO_SITE,
} from './calculos.js';
import { lerChavePix, codigoPix, desenharQrPix } from './pix.js';
import { criarCobranca, lerRetorno, conferirPagamento } from './infinitepay.js';
import { icone } from './icones.js';

const CHAVE_CARRINHO = 'bibi-salgados:carrinho';
const CHAVE_CLIENTE = 'bibi-salgados:cliente';

let store;
let config;
let produtos = [];
let carrinho = lerLocal(CHAVE_CARRINHO, {}) || {};
let codigo = codigoPedido();
let pedidoEnviado = null;

const $ = (sel, raiz = document) => raiz.querySelector(sel);

// ---------- Início ----------

async function iniciar() {
  try {
    store = await abrirStore({ publico: true });
  } catch (e) {
    console.error(e);
    $('#cardapio').innerHTML = `
      <div class="vazio-cardapio">
        <p>Não conseguimos carregar o cardápio agora. Confira sua internet e tente de novo.</p>
        <p style="margin-top:1rem"><button class="btn" type="button" onclick="location.reload()">Tentar de novo</button></p>
      </div>`;
    return;
  }
  atualizar(store.dados);
  store.aoMudar(atualizar);
  // Cliente voltando da página de pagamento da InfinitePay.
  const retorno = lerRetorno(location.search);
  if (retorno) {
    history.replaceState(null, '', location.pathname);
    mostrarRetorno(retorno);
  }
}

function atualizar(dados) {
  config = dados.config;
  produtos = dados.produtos
    .filter((p) => p.ativo !== false)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  for (const id of Object.keys(carrinho)) {
    if (!produtos.some((p) => p.id === id)) delete carrinho[id];
  }
  document.title = config.nome;
  desenharLetreiro();
  desenharCardapio();
  desenharRodape();
  desenharBarra();
  if ($('#janela-pedido').open && !$('#janela-pedido').dataset.enviado) desenharFinalizar();
}

// ---------- Letreiro e rodapé ----------

function desenharLetreiro() {
  $('#letreiro-local').textContent = config.cidade || '';
  $('#letreiro-local').hidden = !config.cidade;
  $('#letreiro-nome').textContent = config.nome;
  $('#letreiro-slogan').textContent = config.slogan || '';
  const info = [];
  if (config.antecedenciaHoras > 0) {
    info.push(['calendario', `Encomendas com ${num(config.antecedenciaHoras)}h de antecedência`]);
  }
  if (config.taxaEntrega > 0) info.push(['entrega', `Entrega ${brl(config.taxaEntrega)}`]);
  else info.push(['entrega', 'Entrega grátis']);
  if (config.horario) info.push(['relogio', config.horario]);
  $('#letreiro-info').innerHTML = info
    .map(([ic, txt]) => `<li>${icone(ic)}<span>${esc(txt)}</span></li>`)
    .join('');
  $('#pausado').hidden = config.aceitandoPedidos !== false;
}

function desenharRodape() {
  const partes = [`<strong>${esc(config.nome)}</strong>`];
  if (config.cidade) partes.push(`<p>${esc(config.cidade)}${config.areaEntrega ? ` · ${esc(config.areaEntrega)}` : ''}</p>`);
  if (config.horario) partes.push(`<p>${esc(config.horario)}</p>`);
  if (config.whatsapp) {
    partes.push(`<p>WhatsApp: <a href="${esc(linkWhats(config.whatsapp))}" target="_blank" rel="noopener">${esc(telefoneBonito(config.whatsapp))}</a></p>`);
  }
  if (config.instagram) {
    const user = config.instagram.replace(/^@/, '').trim();
    partes.push(`<p>Instagram: <a href="https://instagram.com/${encodeURIComponent(user)}" target="_blank" rel="noopener">@${esc(user)}</a></p>`);
  }
  partes.push('<p class="rodape-vendedor"><a href="gestao.html">Área do vendedor</a></p>');
  $('#rodape').innerHTML = partes.join('');
}

// ---------- Cardápio ----------

function categorias() {
  const grupos = new Map();
  for (const p of produtos) {
    const c = p.categoria || 'Cardápio';
    if (!grupos.has(c)) grupos.set(c, []);
    grupos.get(c).push(p);
  }
  return [...grupos.entries()];
}

const slug = (t) => 'cat-' + t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

function dicaDaCategoria(lista) {
  if (lista.every((p) => p.unidade === 'cento')) {
    const minimo = Math.min(...lista.map((p) => (Number(p.passo) || 1) * 100));
    return `Vendidos por cento. Você pode pedir a partir de ${num(minimo)} unidades de cada sabor.`;
  }
  return '';
}

function rotuloUnidade(p) {
  const rende = Number(p.rende) || 1;
  if (rende <= 1) return 'por unidade';
  if (p.unidade === 'cento') return 'o cento (100 un)';
  return `o ${p.unidade}`;
}

function qtdNoSeletor(p, qtd) {
  if (p.unidade === 'cento' || !Number.isInteger(qtd)) return `${num(qtd * (Number(p.rende) || 1))} un`;
  return num(qtd);
}

function htmlSeletor(p, qtd) {
  if (!qtd) {
    return `<button type="button" class="btn btn-pequeno btn-contorno" data-acao="mais" data-id="${esc(p.id)}">${icone('mais')} Adicionar</button>`;
  }
  return `
    <div class="qtd" role="group" aria-label="Quantidade de ${esc(p.nome)}">
      <button type="button" data-acao="menos" data-id="${esc(p.id)}" aria-label="Tirar um">−</button>
      <output aria-live="polite">${esc(qtdNoSeletor(p, qtd))}</output>
      <button type="button" data-acao="mais" data-id="${esc(p.id)}" aria-label="Pôr mais um">+</button>
    </div>`;
}

function htmlItem(p) {
  const qtd = carrinho[p.id] || 0;
  return `
    <article class="item${qtd ? ' no-pedido' : ''}" data-item="${esc(p.id)}">
      <div class="item-linha">
        <h3>${esc(p.nome)}</h3>
        <span class="item-pontilhado" aria-hidden="true"></span>
        <span class="item-preco">${brl(p.preco)}</span>
      </div>
      ${p.descricao ? `<p class="item-desc">${esc(p.descricao)}</p>` : ''}
      <div class="item-acoes">
        <span class="item-unidade">${esc(rotuloUnidade(p))}</span>
        ${htmlSeletor(p, qtd)}
      </div>
    </article>`;
}

function desenharCardapio() {
  const grupos = categorias();
  $('#categorias-lista').innerHTML = grupos
    .map(([nome]) => `<a href="#${slug(nome)}" data-categoria="${slug(nome)}">${esc(nome)}</a>`)
    .join('');
  $('#categorias').hidden = grupos.length < 2;

  if (!grupos.length) {
    $('#cardapio').innerHTML = '<p class="vazio-cardapio">O cardápio está sendo preparado. Volte daqui a pouco!</p>';
    return;
  }
  $('#cardapio').innerHTML = grupos.map(([nome, lista]) => {
    const dica = dicaDaCategoria(lista);
    return `
      <section class="secao" id="${slug(nome)}" aria-labelledby="${slug(nome)}-titulo">
        <h2 id="${slug(nome)}-titulo">${esc(nome)}</h2>
        ${dica ? `<p class="secao-dica">${esc(dica)}</p>` : ''}
        ${lista.map(htmlItem).join('')}
      </section>`;
  }).join('');
}

function redesenharItem(id) {
  const p = produtos.find((x) => x.id === id);
  const atual = document.querySelector(`[data-item="${CSS.escape(id)}"]`);
  if (p && atual) atual.outerHTML = htmlItem(p);
}

// ---------- Carrinho ----------

function mudarQtd(id, direcao) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;
  const passo = Number(p.passo) || 1;
  const nova = Math.max(0, Math.round(((carrinho[id] || 0) + direcao * passo) * 100) / 100);
  if (nova > 0) carrinho[id] = nova; else delete carrinho[id];
  gravarLocal(CHAVE_CARRINHO, carrinho);
  redesenharItem(id);
  desenharBarra();
}

function itensDoCarrinho() {
  return Object.entries(carrinho)
    .map(([id, qtd]) => {
      const p = produtos.find((x) => x.id === id);
      return p && qtd > 0
        ? { produtoId: p.id, nome: p.nome, preco: Number(p.preco) || 0, qtd, rende: Number(p.rende) || 1, unidade: p.unidade || 'unidade' }
        : null;
    })
    .filter(Boolean);
}

function desenharBarra() {
  const itens = itensDoCarrinho();
  const barra = $('#barra-pedido');
  barra.hidden = !itens.length;
  if (!itens.length) return;
  const { subtotal } = totaisPedido({ itens });
  barra.innerHTML = `
    <button type="button" class="btn" data-acao="abrir-pedido">
      <span><span class="barra-contagem">${itens.length}</span>Ver pedido</span>
      <span class="num">${brl(subtotal)}</span>
    </button>`;
}

// ---------- Finalizar pedido ----------

function dataMinima() {
  const horas = Number(config.antecedenciaHoras) || 0;
  return isoLocal(new Date(Date.now() + horas * 3600 * 1000));
}

function lerFormulario() {
  const f = $('#form-pedido');
  const v = (nome) => (f.elements[nome]?.value || '').trim();
  return {
    nome: v('nome'),
    telefone: v('telefone'),
    tipo: f.elements.tipo?.value || 'retirada',
    endereco: v('endereco'),
    data: v('data'),
    hora: v('hora'),
    forma: f.elements.forma?.value || '',
    obs: v('obs'),
  };
}

function montarPedido(form) {
  const itens = itensDoCarrinho();
  const base = {
    itens,
    entrega: { tipo: form.tipo, endereco: form.tipo === 'entrega' ? form.endereco : '' },
    taxaEntrega: Number(config.taxaEntrega) || 0,
    desconto: 0,
  };
  const t = totaisPedido(base);
  return {
    id: `site-${codigo}-${Date.now().toString(36)}`,
    codigo,
    criadoEm: new Date().toISOString(),
    origem: 'Site',
    status: 'novo',
    cliente: { nome: form.nome, telefone: form.telefone },
    entrega: base.entrega,
    dataEntrega: form.data,
    hora: form.hora,
    itens,
    subtotal: t.subtotal,
    taxaEntrega: t.taxaEntrega,
    desconto: 0,
    total: t.total,
    pagamento: { forma: form.forma, pago: false, pagoEm: '' },
    obs: form.obs,
  };
}

function montarMensagem(pedido) {
  const l = [`Olá, ${config.nome}! Quero fazer um pedido:`, ''];
  for (const it of pedido.itens) l.push(`• ${textoQtd(it)} ${it.nome} = ${brl(it.preco * it.qtd)}`);
  l.push('');
  if (pedido.taxaEntrega > 0) {
    l.push(`Subtotal: ${brl(pedido.subtotal)}`);
    l.push(`Entrega: ${brl(pedido.taxaEntrega)}`);
  }
  l.push(`*Total: ${brl(pedido.total)}*`, '');
  l.push(`*Nome:* ${pedido.cliente.nome || '(não informado)'}`);
  l.push(pedido.entrega.tipo === 'entrega' ? `*Entrega em:* ${pedido.entrega.endereco}` : '*Vou retirar*');
  if (pedido.dataEntrega) l.push(`*Para:* ${dataComDia(pedido.dataEntrega)}${pedido.hora ? ` às ${pedido.hora}` : ''}`);
  if (pedido.pagamento.forma) l.push(`*Pagamento:* ${textoPagamento(pedido.pagamento.forma)}`);
  if (pedido.obs) l.push(`*Obs.:* ${pedido.obs}`);
  l.push('', `Pedido #${pedido.codigo} (feito pelo site)`);
  return l.join('\n');
}

// Como a forma de pagamento aparece no WhatsApp: nas formas antecipadas, o
// cliente já diz o que vai fazer.
function textoPagamento(forma) {
  if (forma === PIX_ANTECIPADO) return 'Pix antes da entrega (mando o comprovante por aqui)';
  if (forma === CARTAO_PELO_LINK) return 'Cartão de crédito antes da entrega (pode me mandar o link de pagamento)';
  if (forma === CARTAO_NO_SITE) return 'Cartão de crédito pelo site (vou pagar agora)';
  return forma;
}

function validar(form, pedido) {
  const erros = {};
  if (!pedido.itens.length) erros.itens = 'Escolha pelo menos um salgado.';
  if (!form.nome) erros.nome = 'Diga seu nome para a gente saber de quem é o pedido.';
  if (form.tipo === 'entrega' && form.endereco.length < 6) erros.endereco = 'Informe rua, número e bairro.';
  if (!form.data) erros.data = 'Escolha o dia.';
  else if (form.data < dataMinima()) erros.data = `O primeiro dia disponível é ${dataComDia(dataMinima())}.`;
  if (pedido.subtotal < (Number(config.pedidoMinimo) || 0)) {
    erros.itens = `O pedido mínimo é de ${brl(config.pedidoMinimo)}.`;
  }
  return erros;
}

function desenharFinalizar() {
  const janela = $('#janela-pedido');
  delete janela.dataset.enviado;
  const salvo = lerLocal(CHAVE_CLIENTE, {}) || {};
  const antecipadas = formasAntecipadas(config);
  const formas = antecipadas.length ? antecipadas
    : (config.formasPagamento?.length ? config.formasPagamento : ['Pix', 'Dinheiro']);
  const anterior = $('#form-pedido').elements.nome ? lerFormulario() : null;
  const form = anterior || {
    nome: salvo.nome || '', telefone: salvo.telefone || '', tipo: salvo.tipo || 'retirada',
    endereco: salvo.endereco || '', data: dataMinima(), hora: '', forma: formas[0], obs: '',
  };
  if (!formas.includes(form.forma)) form.forma = formas[0];
  const itens = itensDoCarrinho();

  $('#titulo-pedido').textContent = 'Seu pedido';
  $('#corpo-pedido').innerHTML = `
    <div class="resumo-itens" id="resumo-itens">${htmlResumo(itens)}</div>
    <p class="erro-campo" data-erro="itens" hidden></p>

    <fieldset class="bloco" style="border:0;padding:0;margin:0">
      <legend class="rotulo" style="margin-bottom:.6rem">Como você quer receber?</legend>
      <div class="opcoes">
        <label class="opcao"><input type="radio" name="tipo" value="retirada" ${form.tipo !== 'entrega' ? 'checked' : ''}> Vou retirar</label>
        <label class="opcao"><input type="radio" name="tipo" value="entrega" ${form.tipo === 'entrega' ? 'checked' : ''}> Entregar ${config.taxaEntrega > 0 ? `(+ ${brl(config.taxaEntrega)})` : '(grátis)'}</label>
      </div>
      <label class="campo" id="campo-endereco" ${form.tipo === 'entrega' ? '' : 'hidden'}>
        <span>Endereço de entrega</span>
        <textarea name="endereco" id="endereco" rows="2" autocomplete="street-address" placeholder="Rua, número, bairro e complemento">${esc(form.endereco)}</textarea>
        ${config.areaEntrega ? `<small>${esc(config.areaEntrega)}</small>` : ''}
        <span class="erro-campo" data-erro="endereco" hidden></span>
      </label>
      <p class="suave" id="nota-retirada" ${form.tipo === 'entrega' ? 'hidden' : ''}>O endereço para retirar a gente passa pelo WhatsApp.</p>
    </fieldset>

    <div class="bloco">
      <h3>Para quando?</h3>
      <div class="duas-colunas">
        <label class="campo"><span>Dia</span>
          <input type="date" name="data" id="data" min="${dataMinima()}" value="${esc(form.data || dataMinima())}">
          <span class="erro-campo" data-erro="data" hidden></span>
        </label>
        <label class="campo"><span>Horário</span>
          <input type="time" name="hora" id="hora" value="${esc(form.hora)}" step="900">
        </label>
      </div>
      ${config.horario ? `<small class="suave">${esc(config.horario)}</small>` : ''}
    </div>

    <div class="bloco">
      <h3>Seus dados</h3>
      <div class="duas-colunas">
        <label class="campo"><span>Nome</span>
          <input name="nome" id="nome" autocomplete="name" value="${esc(form.nome)}" maxlength="80">
          <span class="erro-campo" data-erro="nome" hidden></span>
        </label>
        <label class="campo"><span>WhatsApp (opcional)</span>
          <input name="telefone" id="telefone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(form.telefone)}" placeholder="(17) 99999-9999" maxlength="20">
        </label>
      </div>
    </div>

    <fieldset class="bloco" style="border:0;padding:0;margin:0">
      <legend class="rotulo" style="margin-bottom:.6rem">${antecipadas.length ? 'Pagamento antes da entrega' : 'Pagamento'}</legend>
      <div class="opcoes">
        ${formas.map((f) => `<label class="opcao"><input type="radio" name="forma" value="${esc(f)}" ${form.forma === f ? 'checked' : ''}> ${esc(ROTULO_FORMA[f] || f)}</label>`).join('')}
      </div>
      ${antecipadas.length ? `<small class="suave dica-pagamento" id="dica-pagamento">${esc(DICA_FORMA[form.forma])}</small>` : ''}
    </fieldset>

    <label class="campo"><span>Observações (opcional)</span>
      <textarea name="obs" id="obs" rows="2" maxlength="500" placeholder="Ex.: separar em duas caixas, sem cebola…">${esc(form.obs)}</textarea>
    </label>

    <div class="totais" id="totais"></div>`;

  $('#rodape-pedido').innerHTML = config.aceitandoPedidos === false
    ? '<p class="alerta-minimo" style="margin-right:auto">Os pedidos pelo site estão pausados no momento.</p>'
    : `<a class="btn btn-whats btn-largo" id="enviar-whats" href="#" target="_blank" rel="noopener">${icone('conversa')} Enviar pedido pelo WhatsApp</a>`;
  atualizarFinalizar();
}

const ROTULO_FORMA = { [PIX_ANTECIPADO]: 'Pix', [CARTAO_PELO_LINK]: 'Cartão de crédito', [CARTAO_NO_SITE]: 'Cartão de crédito' };
const DICA_FORMA = {
  [PIX_ANTECIPADO]: 'Depois de enviar o pedido, aparece o código Pix com o valor certo. O pedido é confirmado quando o pagamento cai.',
  [CARTAO_PELO_LINK]: 'A gente manda o link para pagar no cartão pelo WhatsApp. O pedido é confirmado depois do pagamento.',
  [CARTAO_NO_SITE]: 'Depois de enviar o pedido, você paga aqui mesmo, na página segura da InfinitePay, no crédito em até 12x.',
};

function htmlResumo(itens) {
  if (!itens.length) return '<p class="suave">Seu pedido está vazio.</p>';
  return itens.map((it) => {
    const p = produtos.find((x) => x.id === it.produtoId);
    return `
      <div class="resumo-item">
        <span class="nome">${esc(it.nome)}</span>
        <span class="preco">${brl(it.preco * it.qtd)}</span>
        <span class="unit">${brl(it.preco)} ${esc(rotuloUnidade(p))}</span>
        ${htmlSeletor(p, it.qtd)}
      </div>`;
  }).join('');
}

function atualizarFinalizar() {
  const form = lerFormulario();
  const pedido = montarPedido(form);
  const t = pedido;
  const minimo = Number(config.pedidoMinimo) || 0;
  $('#totais').innerHTML = `
    ${t.taxaEntrega > 0 ? `<div><span>Salgados</span><span>${brl(t.subtotal)}</span></div><div><span>Entrega</span><span>${brl(t.taxaEntrega)}</span></div>` : ''}
    <div class="total"><span>Total</span><span>${brl(t.total)}</span></div>
    ${t.subtotal < minimo ? `<p class="alerta-minimo">Pedido mínimo: ${brl(minimo)}. Faltam ${brl(minimo - t.subtotal)}.</p>` : ''}`;
  const botao = $('#enviar-whats');
  if (botao) {
    botao.href = config.whatsapp ? linkWhats(config.whatsapp, montarMensagem(pedido)) : '#';
  }
}

function mostrarErros(erros) {
  document.querySelectorAll('#form-pedido [data-erro]').forEach((el) => {
    const msg = erros[el.dataset.erro];
    el.hidden = !msg;
    el.textContent = msg || '';
  });
  for (const nome of ['nome', 'endereco', 'data']) {
    const campo = $('#form-pedido').elements[nome];
    if (campo) campo.classList.toggle('campo-invalido', Boolean(erros[nome]));
  }
  const primeiro = Object.keys(erros)[0];
  if (primeiro) {
    const alvo = $('#form-pedido').elements[primeiro] || document.querySelector(`[data-erro="${primeiro}"]`);
    alvo?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (alvo?.focus) alvo.focus({ preventScroll: true });
  }
}

function enviar(evento) {
  const form = lerFormulario();
  const pedido = montarPedido(form);
  const erros = validar(form, pedido);
  if (Object.keys(erros).length) {
    evento.preventDefault();
    mostrarErros(erros);
    return;
  }
  const mensagem = montarMensagem(pedido);
  if (!config.whatsapp) evento.preventDefault();

  gravarLocal(CHAVE_CLIENTE, { nome: form.nome, telefone: form.telefone, tipo: form.tipo, endereco: form.endereco });
  store.criarPedidoSite(pedido).catch((e) => console.warn('Pedido não foi salvo na gestão:', e));

  carrinho = {};
  gravarLocal(CHAVE_CARRINHO, carrinho);
  codigo = codigoPedido();
  // Espera o link do WhatsApp abrir antes de trocar a tela.
  setTimeout(() => {
    desenharCardapio();
    desenharBarra();
    mostrarEnviado(pedido, mensagem);
  }, 60);
}

function mostrarEnviado(pedido, mensagem) {
  const janela = $('#janela-pedido');
  janela.dataset.enviado = '1';
  $('#titulo-pedido').textContent = `Pedido #${pedido.codigo}`;
  const temWhats = Boolean(config.whatsapp);
  const forma = pedido.pagamento.forma;
  const chave = lerChavePix(config.chavePix);
  const pix = forma === PIX_ANTECIPADO && chave
    ? codigoPix({ chave: chave.chave, nome: config.nome, cidade: config.cidade, valor: pedido.total, identificador: pedido.codigo })
    : '';
  let pagamento = '';
  if (pix) pagamento = htmlPagarPix(pedido, pix);
  else if (forma === CARTAO_NO_SITE) pagamento = htmlPagarCartao(pedido);
  else if (forma === CARTAO_PELO_LINK) {
    pagamento = '<p class="aviso-pagamento">A gente te manda o link para pagar no cartão pelo WhatsApp. O pedido é confirmado depois do pagamento.</p>';
  } else if (forma === 'Pix' && config.chavePix) {
    pagamento = `<p>Chave Pix: <strong>${esc(config.chavePix)}</strong>. Pague depois que confirmarmos o pedido.</p>`;
  }
  $('#corpo-pedido').innerHTML = `
    <div class="enviado">
      <h3>Quase lá!</h3>
      ${temWhats
        ? `<p>Abrimos o WhatsApp com o seu pedido escrito. É só tocar em <strong>enviar</strong> por lá. A gente responde para confirmar o horário e o pagamento.</p>
           <p class="suave">O WhatsApp não abriu? Use o botão abaixo ou copie a mensagem e mande para ${esc(telefoneBonito(config.whatsapp))}.</p>`
        : '<p>Este site ainda não tem um número de WhatsApp configurado. Veja abaixo a mensagem que seria enviada.</p>'}
      ${pagamento}
      <pre class="mensagem-previa" id="mensagem-previa">${esc(mensagem)}</pre>
      <div class="acoes-linha">
        ${temWhats ? `<a class="btn btn-whats" href="${esc(linkWhats(config.whatsapp, mensagem))}" target="_blank" rel="noopener">${icone('conversa')} Abrir WhatsApp</a>` : ''}
        <button type="button" class="btn btn-contorno" data-acao="copiar">${icone('copiar')} Copiar mensagem</button>
      </div>
    </div>`;
  $('#rodape-pedido').innerHTML = '<button type="button" class="btn btn-contorno btn-largo" data-acao="fechar">Voltar ao cardápio</button>';
  $('#corpo-pedido').scrollTop = 0;
  janela.scrollTop = 0;
  if (pix) desenharQrPix($('#pix-qr'), pix);
  if (forma === CARTAO_NO_SITE) {
    pedidoEnviado = pedido;
    prepararCartao();
  }
}

function htmlPagarPix(pedido, codigo) {
  return `
    <section class="pagar-antes" aria-labelledby="pix-titulo">
      <h4 id="pix-titulo">Pague ${brl(pedido.total)} com Pix</h4>
      <p>No app do seu banco, escolha <strong>Pix copia e cola</strong> e cole o código abaixo. O valor já vem preenchido.</p>
      <div class="pix-qr" id="pix-qr"></div>
      <textarea class="pix-codigo" id="pix-codigo" rows="4" readonly aria-label="Código Pix copia e cola">${esc(codigo)}</textarea>
      <button type="button" class="btn" data-acao="copiar-pix">${icone('copiar')} Copiar código Pix</button>
      <p class="suave">Depois de pagar, mande o comprovante no WhatsApp. O pedido é confirmado quando o pagamento cai.</p>
    </section>`;
}

function htmlPagarCartao(pedido) {
  return `
    <section class="pagar-antes" aria-labelledby="cartao-titulo">
      <h4 id="cartao-titulo">Pague ${brl(pedido.total)} no cartão</h4>
      <p>O pagamento abre na página segura da InfinitePay, no crédito em até 12x. Depois você volta para cá.</p>
      <div class="cartao-acao" id="cartao-acao" aria-live="polite"></div>
    </section>`;
}

function enderecoDaLoja() {
  return `${location.origin}${location.pathname}`;
}

// Cria a cobrança na InfinitePay enquanto o cliente manda a mensagem no WhatsApp.
async function prepararCartao() {
  const pedido = pedidoEnviado;
  const alvo = () => $('#cartao-acao');
  if (!pedido || !alvo()) return;
  alvo().innerHTML = '<button type="button" class="btn" disabled>Preparando o pagamento…</button>';
  try {
    const url = await criarCobranca({ tag: config.infiniteTag, pedido, voltarPara: enderecoDaLoja() });
    if (alvo() && pedidoEnviado === pedido) {
      alvo().innerHTML = `<a class="btn" href="${esc(url)}">${icone('cartao')} Pagar com cartão</a>`;
    }
  } catch (e) {
    console.warn('A página de pagamento não abriu:', e);
    if (alvo() && pedidoEnviado === pedido) {
      alvo().innerHTML = `
        <p class="aviso-pagamento">Não conseguimos abrir o pagamento agora. Tente de novo ou peça o link pelo WhatsApp.</p>
        <button type="button" class="btn btn-contorno" data-acao="tentar-cartao">Tentar de novo</button>`;
    }
  }
}

// Volta da InfinitePay: confere o pagamento e oferece mandar o comprovante.
async function mostrarRetorno(retorno) {
  const janela = $('#janela-pedido');
  janela.dataset.enviado = '1';
  $('#titulo-pedido').textContent = `Pedido #${retorno.codigo}`;
  const aviso = `Olá! Paguei o pedido #${retorno.codigo} pelo site.${retorno.comprovante ? ` Comprovante: ${retorno.comprovante}` : ''}`;
  $('#corpo-pedido').innerHTML = `
    <div class="enviado">
      <h3>Pagamento</h3>
      <p class="aviso-pagamento" id="retorno-situacao" role="status">Conferindo o pagamento com a InfinitePay…</p>
      <p class="suave" id="retorno-texto"></p>
      <div class="acoes-linha">
        ${retorno.comprovante ? `<a class="btn btn-contorno" href="${esc(retorno.comprovante)}" target="_blank" rel="noopener">Ver comprovante</a>` : ''}
        ${config.whatsapp ? `<a class="btn btn-whats" href="${esc(linkWhats(config.whatsapp, aviso))}" target="_blank" rel="noopener">${icone('conversa')} Mandar comprovante no WhatsApp</a>` : ''}
      </div>
    </div>`;
  $('#rodape-pedido').innerHTML = '<button type="button" class="btn btn-contorno btn-largo" data-acao="fechar">Voltar ao cardápio</button>';
  if (!janela.open) janela.showModal();

  let resultado = null;
  if (config.infiniteTag) {
    try {
      resultado = await conferirPagamento({ tag: config.infiniteTag, retorno });
    } catch (e) {
      console.warn('Não deu para conferir o pagamento:', e);
    }
  }
  const situacao = $('#retorno-situacao');
  if (!situacao) return;
  if (resultado?.pago) {
    const parcelas = resultado.parcelas > 1 ? ` em ${resultado.parcelas}x` : '';
    const meio = resultado.meio === 'pix' ? ' no Pix' : ' no cartão';
    situacao.className = 'pagamento-ok';
    situacao.textContent = resultado.valor > 0
      ? `Pagamento aprovado: ${brl(resultado.valor)}${meio}${parcelas}.`
      : `Pagamento aprovado${meio}${parcelas}.`;
    $('#retorno-texto').textContent = 'Obrigado! A loja já recebeu o aviso do pagamento e confirma o pedido pelo WhatsApp.';
  } else if (resultado) {
    situacao.textContent = 'O pagamento ainda não aparece como aprovado.';
    $('#retorno-texto').textContent = 'Se você concluiu o pagamento, mande o comprovante no WhatsApp que a gente confere.';
  } else {
    situacao.textContent = 'Você voltou da página de pagamento.';
    $('#retorno-texto').textContent = 'Se o pagamento foi concluído, a loja recebe o aviso. Se quiser, mande o comprovante no WhatsApp.';
  }
}

function abrirFinalizar() {
  const janela = $('#janela-pedido');
  $('#corpo-pedido').innerHTML = '';
  desenharFinalizar();
  if (!janela.open) janela.showModal();
}

function avisoRapido(texto) {
  const el = document.createElement('div');
  el.className = 'aviso-rapido';
  el.setAttribute('role', 'status');
  el.textContent = texto;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- Eventos ----------

document.addEventListener('click', async (e) => {
  const alvo = e.target.closest('[data-acao], [data-categoria], #enviar-whats');
  if (!alvo) return;

  if (alvo.id === 'enviar-whats') {
    enviar(e);
    return;
  }
  if (alvo.dataset.categoria) {
    e.preventDefault();
    document.getElementById(alvo.dataset.categoria)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const { acao, id } = alvo.dataset;
  if (acao === 'mais' || acao === 'menos') {
    mudarQtd(id, acao === 'mais' ? 1 : -1);
    if ($('#janela-pedido').open && !$('#janela-pedido').dataset.enviado) {
      $('#resumo-itens').innerHTML = htmlResumo(itensDoCarrinho());
      const erroItens = document.querySelector('#form-pedido [data-erro="itens"]');
      if (erroItens) erroItens.hidden = true;
      atualizarFinalizar();
    }
  } else if (acao === 'abrir-pedido') {
    abrirFinalizar();
  } else if (acao === 'tentar-cartao') {
    prepararCartao();
  } else if (acao === 'fechar') {
    $('#janela-pedido').close();
  } else if (acao === 'copiar-pix') {
    const campo = $('#pix-codigo');
    if (await copiarTexto(campo.value)) avisoRapido('Código Pix copiado');
    else {
      campo.select();
      avisoRapido('Selecionamos o código: é só copiar');
    }
  } else if (acao === 'copiar') {
    const texto = $('#mensagem-previa')?.textContent || '';
    if (await copiarTexto(texto)) avisoRapido('Mensagem copiada');
    else {
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents($('#mensagem-previa'));
      sel.removeAllRanges();
      sel.addRange(r);
      avisoRapido('Selecionamos a mensagem: é só copiar');
    }
  }
});

document.addEventListener('input', (e) => {
  if (!e.target.closest('#form-pedido')) return;
  if (e.target.name === 'tipo') {
    const entrega = e.target.value === 'entrega';
    $('#campo-endereco').hidden = !entrega;
    $('#nota-retirada').hidden = entrega;
  }
  if (e.target.name === 'forma' && $('#dica-pagamento')) {
    $('#dica-pagamento').textContent = DICA_FORMA[e.target.value] || '';
  }
  if (e.target.classList.contains('campo-invalido')) {
    e.target.classList.remove('campo-invalido');
    const msg = document.querySelector(`#form-pedido [data-erro="${e.target.name}"]`);
    if (msg) msg.hidden = true;
  }
  atualizarFinalizar();
});

$('#form-pedido').addEventListener('submit', (e) => e.preventDefault());

iniciar();
