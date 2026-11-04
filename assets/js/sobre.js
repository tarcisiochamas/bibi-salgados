// Página de apresentação: o texto e as fotos que o dono põe na gestão
// (Ajustes → Página de apresentação).

import { abrirStore } from './store.js';
import { FIREBASE_SDK } from './config.js';
import { CONFIG_PADRAO } from './dados-exemplo.js';
import { esc, linkWhats, telefoneBonito, lerLocal, gravarLocal } from './util.js';
import { textoAtendimento } from './calculos.js';

// O mesmo guardado da página de vendas: o último cardápio e os ajustes que
// vieram do banco.
const CHAVE_GUARDADO = 'bibi-salgados:cardapio-guardado';
// Quando a página recarregou sozinha pela última vez (o mesmo da página de vendas).
const CHAVE_RECARGA = 'bibi-salgados:recarregou';
// Sem o banco, tenta de novo depois de 5 s, 15 s, 30 s e de minuto em minuto.
const ESPERAS = [5, 15, 30, 60];

const $ = (sel) => document.querySelector(sel);

let tentativas = 0;

async function iniciar() {
  let store;
  let apresentacao = null;
  try {
    store = await abrirStore({ publico: true });
    apresentacao = await store.lerApresentacao();
  } catch (e) {
    // Sem o banco, os contatos e o rodapé saem do que ficou guardado (ou do que
    // vem no código), e a página tenta de novo por trás.
    console.warn('O banco não respondeu; a página abriu com os contatos guardados.', e);
    if (!tentativas) mostrarSemBanco(store?.dados?.config);
    // Falhou baixar os arquivos do Firebase: o navegador não baixa de novo nesta
    // página. Quando eles voltam a responder, recarrega (no máximo uma vez a
    // cada 5 minutos).
    if (tentativas && e instanceof TypeError && /module|import/i.test(e.message) && await arquivosVoltaram() && podeRecarregar()) {
      location.reload();
      return;
    }
    const segundos = ESPERAS[Math.min(tentativas, ESPERAS.length - 1)];
    tentativas += 1;
    setTimeout(iniciar, segundos * 1000);
    return;
  }
  const config = store.dados.config;
  if (store.modo === 'nuvem') {
    gravarLocal(CHAVE_GUARDADO, { config, produtos: store.dados.produtos, guardadoEm: new Date().toISOString() });
  }
  desenharTopo(config, apresentacao);

  const paragrafos = String(apresentacao?.texto || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  $('#sobre-texto').innerHTML = paragrafos.length
    ? paragrafos.map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('')
    : '<p class="suave">Em breve, a nossa história e fotos da produção.</p>';
  $('#sobre-fotos').innerHTML = (apresentacao?.fotos || [])
    .map((f, i) => `<img src="${esc(f)}" alt="Foto ${i + 1} da ${esc(config.nome)}" loading="lazy" decoding="async">`)
    .join('');
  desenharRodape(config);
}

// Os arquivos respondem do mesmo jeito que o navegador os baixa (com CORS)?
async function arquivosVoltaram() {
  try {
    return (await fetch(`${FIREBASE_SDK}/firebase-app.js`, { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

function podeRecarregar() {
  try {
    if (Date.now() - (Number(sessionStorage.getItem(CHAVE_RECARGA)) || 0) < 5 * 60000) return false;
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function mostrarSemBanco(configDoBanco) {
  const config = configDoBanco || { ...CONFIG_PADRAO, ...(lerLocal(CHAVE_GUARDADO, null)?.config || {}) };
  desenharTopo(config, null);
  $('#sobre-texto').innerHTML = '<p>Não conseguimos carregar a nossa história agora. O cardápio e os pedidos pelo WhatsApp continuam funcionando.</p>';
  desenharRodape(config);
}

function desenharTopo(config, apresentacao) {
  const titulo = apresentacao?.titulo || 'Quem somos';
  document.title = `${titulo} · ${config.nome}`;
  $('#sobre-local').textContent = config.cidade || '';
  $('#sobre-local').hidden = !config.cidade;
  $('#sobre-titulo').textContent = titulo;
}

function desenharRodape(config) {
  const partes = [`<strong>${esc(config.nome)}</strong>`];
  if (config.cidade) partes.push(`<p>${esc(config.cidade)}${config.areaEntrega ? ` · ${esc(config.areaEntrega)}` : ''}</p>`);
  const horario = textoAtendimento(config) || String(config.horario || '').trim();
  if (horario) partes.push(`<p>${esc(horario)}</p>`);
  if (config.whatsapp) {
    partes.push(`<p>WhatsApp: <a href="${esc(linkWhats(config.whatsapp))}" target="_blank" rel="noopener">${esc(telefoneBonito(config.whatsapp))}</a></p>`);
  }
  if (config.instagram) {
    const user = config.instagram.replace(/^@/, '').trim();
    partes.push(`<p>Instagram: <a href="https://instagram.com/${encodeURIComponent(user)}" target="_blank" rel="noopener">@${esc(user)}</a></p>`);
  }
  $('#rodape').innerHTML = partes.join('');
}

iniciar();
