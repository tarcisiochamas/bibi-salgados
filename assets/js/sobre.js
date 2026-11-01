// Página de apresentação: o texto e as fotos que o dono põe na gestão
// (Ajustes → Página de apresentação).

import { abrirStore } from './store.js';
import { esc, linkWhats, telefoneBonito } from './util.js';

const $ = (sel) => document.querySelector(sel);

async function iniciar() {
  let store;
  let apresentacao = null;
  try {
    store = await abrirStore({ publico: true });
    apresentacao = await store.lerApresentacao();
  } catch (e) {
    console.error(e);
    $('#sobre-texto').innerHTML = '<p>Não conseguimos carregar esta página agora. Confira sua internet e tente de novo.</p>';
    return;
  }
  const config = store.dados.config;
  const titulo = apresentacao?.titulo || 'Quem somos';
  document.title = `${titulo} · ${config.nome}`;
  $('#sobre-local').textContent = config.cidade || '';
  $('#sobre-local').hidden = !config.cidade;
  $('#sobre-titulo').textContent = titulo;

  const paragrafos = String(apresentacao?.texto || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  $('#sobre-texto').innerHTML = paragrafos.length
    ? paragrafos.map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('')
    : '<p class="suave">Em breve, a nossa história e fotos da produção.</p>';
  $('#sobre-fotos').innerHTML = (apresentacao?.fotos || [])
    .map((f, i) => `<img src="${esc(f)}" alt="Foto ${i + 1} da ${esc(config.nome)}" loading="lazy" decoding="async">`)
    .join('');
  desenharRodape(config);
}

function desenharRodape(config) {
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
  $('#rodape').innerHTML = partes.join('');
}

iniciar();
