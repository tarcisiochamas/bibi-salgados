// Cartão (e Pix) pela página de pagamento da InfinitePay, sem servidor: o site
// cria a cobrança só com a InfiniteTag da conta, que não é segredo, e manda o
// cliente para lá. Depois de pagar, a InfinitePay devolve o cliente ao site.
// Testado em 29/10/2026: a InfinitePay aceita essas chamadas direto do navegador.

import { textoQtd } from './calculos.js';

// Endereço atual e o antigo, que a InfinitePay ainda atende.
const ENDERECOS = [
  'https://api.checkout.infinitepay.io',
  'https://api.infinitepay.io/invoices/public/checkout',
];

// "$bibisalgados", "@bibisalgados" ou "bibisalgados" viram "bibisalgados".
export function lerInfiniteTag(texto) {
  const t = String(texto || '').trim().replace(/^[$@]/, '');
  return /^[A-Za-z0-9._-]{2,40}$/.test(t) ? t : '';
}

async function postar(caminho, corpo) {
  let erro;
  for (const base of ENDERECOS) {
    let r;
    try {
      r = await fetch(base + caminho, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
    } catch (e) {
      // Sem resposta (internet ou endereço fora do ar): tenta o outro endereço.
      erro = e;
      continue;
    }
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(dados.message || `A InfinitePay respondeu ${r.status}.`);
      e.status = r.status;
      throw e;
    }
    return dados;
  }
  throw erro;
}

// A InfinitePay quer preço em centavos e quantidade inteira, e meio cento não
// é inteiro. Por isso cada linha vai como 1 × o valor da linha.
export function itensDaCobranca(pedido) {
  const itens = (pedido.itens || []).map((it) => ({
    description: `${textoQtd(it)} ${it.nome}`.slice(0, 120),
    quantity: 1,
    price: Math.round((Number(it.preco) || 0) * (Number(it.qtd) || 0) * 100),
  }));
  const entrega = Math.round((Number(pedido.taxaEntrega) || 0) * 100);
  if (entrega > 0 && pedido.entrega?.tipo === 'entrega') itens.push({ description: 'Entrega', quantity: 1, price: entrega });
  const total = Math.round((Number(pedido.total) || 0) * 100);
  // Com desconto (ou um centavo de diferença), vai uma linha só com o total.
  if (itens.reduce((s, i) => s + i.price, 0) !== total) {
    return [{ description: `Pedido #${pedido.codigo}`, quantity: 1, price: total }];
  }
  return itens;
}

// Cria a cobrança e devolve o endereço da página de pagamento.
export async function criarCobranca({ tag, pedido, voltarPara }) {
  const r = await postar('/links', {
    handle: tag,
    order_nsu: pedido.codigo,
    redirect_url: voltarPara,
    items: itensDaCobranca(pedido),
  });
  const url = r.checkout_url || r.url || r.link;
  if (!/^https:\/\//.test(url || '')) throw new Error('A InfinitePay não devolveu o link de pagamento.');
  return url;
}

// O que a InfinitePay põe no endereço quando o cliente volta ao site.
export function lerRetorno(busca) {
  const q = new URLSearchParams(busca);
  const r = {
    codigo: q.get('order_nsu') || '',
    transacao: q.get('transaction_nsu') || '',
    slug: q.get('slug') || '',
    meio: q.get('capture_method') || '',
    comprovante: comprovanteSeguro(q.get('receipt_url')),
  };
  return r.codigo && (r.transacao || r.slug) ? r : null;
}

// Só aceita comprovante da própria InfinitePay, para ninguém montar um link
// que leve o cliente a outro site.
function comprovanteSeguro(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)infinitepay\.io$/.test(u.hostname) ? u.href : '';
  } catch {
    return '';
  }
}

// Os erros mais comuns, em palavras de quem usa a gestão.
export function explicarErro(e) {
  const msg = String(e?.message || '');
  if (/external_checkout_not_enabled/i.test(msg)) {
    return 'O Checkout Integrado está desligado na conta. Ligue no app da InfinitePay: Vendas → Checkout → Configurações.';
  }
  if (/handle/i.test(msg) || e?.status === 403 || e?.status === 404) return 'A InfinitePay não reconheceu a InfiniteTag. Confira em Ajustes.';
  if (!e?.status) return 'Não deu para falar com a InfinitePay. Confira a internet e tente de novo.';
  return `A InfinitePay recusou: ${msg}`;
}

// Pergunta à InfinitePay se o pagamento foi aprovado. Valores em reais.
export async function conferirPagamento({ tag, retorno }) {
  const r = await postar('/payment_check', {
    handle: tag,
    order_nsu: retorno.codigo,
    transaction_nsu: retorno.transacao,
    slug: retorno.slug,
  });
  return {
    pago: Boolean(r.success && r.paid),
    valor: (Number(r.paid_amount ?? r.amount) || 0) / 100,
    parcelas: Number(r.installments) || 1,
    meio: r.capture_method || '',
  };
}
