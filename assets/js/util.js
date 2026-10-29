// Funções pequenas usadas pela página de vendas e pela gestão.

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brl(valor) {
  return fmtBRL.format(Number(valor) || 0);
}

// Número no formato brasileiro, sem zeros desnecessários: 1,5 / 150 / 0,25
export function num(valor, casas = 2) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function pct(fracao) {
  return fracao == null || !isFinite(fracao) ? '–' : `${Math.round(fracao * 100)}%`;
}

// Lê "1.234,56", "12,5" ou "12.5" e devolve número.
export function lerNumero(texto) {
  if (typeof texto === 'number') return texto;
  let s = String(texto ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// Arredonda para cima até o próximo R$ 0,50.
export function arredondarPreco(valor) {
  return Math.ceil((Number(valor) || 0) * 2 - 1e-9) / 2;
}

export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function novoId(prefixo = '') {
  return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Código curto que o cliente e o vendedor conseguem falar no WhatsApp: "K7Q2"
export function codigoPedido() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += letras[Math.floor(Math.random() * letras.length)];
  return c;
}

// ---------- Datas (sempre no fuso do aparelho, formato AAAA-MM-DD) ----------

const pad = (n) => String(n).padStart(2, '0');

export function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hojeISO() {
  return isoLocal(new Date());
}

export function deISO(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

export function somarDias(iso, dias) {
  const d = deISO(iso);
  d.setDate(d.getDate() + dias);
  return isoLocal(d);
}

export function mesISO(iso) {
  return String(iso || '').slice(0, 7);
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataCurta(iso) {
  if (!iso) return '';
  const d = deISO(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// "sábado, 08/11"
export function dataComDia(iso) {
  if (!iso) return '';
  return `${DIAS[deISO(iso).getDay()]}, ${dataCurta(iso)}`;
}

// "Hoje", "Amanhã", "Ontem" ou "sábado, 08/11"
export function dataRelativa(iso) {
  const hoje = hojeISO();
  if (iso === hoje) return 'Hoje';
  if (iso === somarDias(hoje, 1)) return 'Amanhã';
  if (iso === somarDias(hoje, -1)) return 'Ontem';
  return dataComDia(iso);
}

// "quarta-feira, 29 de outubro"
export function dataPorExtenso(iso) {
  const d = deISO(iso);
  const dia = DIAS[d.getDay()];
  const sufixo = d.getDay() === 0 || d.getDay() === 6 ? '' : '-feira';
  return `${dia}${sufixo}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function nomeMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

export function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// ---------- WhatsApp ----------

export function soDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

// Aceita "(17) 99123-4567", "17991234567" ou "+55 17 99123-4567" e devolve "5517991234567".
export function telefoneWhats(texto) {
  const d = soDigitos(texto);
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}

export function telefoneBonito(texto) {
  let d = soDigitos(texto);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return texto || '';
}

export function linkWhats(telefone, texto) {
  const numero = telefoneWhats(telefone);
  const base = numero ? `https://wa.me/${numero}` : 'https://wa.me/';
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

// ---------- Navegador ----------

export function lerLocal(chave, padrao = null) {
  try {
    const v = localStorage.getItem(chave);
    return v == null ? padrao : JSON.parse(v);
  } catch {
    return padrao;
  }
}

export function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
