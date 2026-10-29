// Onde os dados ficam guardados.
//
// - Modo nuvem (Firebase): quando FIREBASE_CONFIG está preenchido em config.js.
//   A página de vendas lê o cardápio e cria pedidos; a gestão exige login e
//   recebe as mudanças na hora, inclusive de outros aparelhos.
// - Modo local: sem Firebase, tudo fica no navegador (para testar e para a prévia).
//
// As duas versões têm a mesma cara, então as telas não precisam saber qual está em uso.

import { FIREBASE_CONFIG, FIREBASE_SDK, USAR_EMULADOR } from './config.js';
import { CONFIG_PADRAO, dadosExemplo, cardapioInicial } from './dados-exemplo.js';
import { lerLocal, gravarLocal, novoId } from './util.js';

export const COLECOES = ['produtos', 'ingredientes', 'fichas', 'pedidos', 'lancamentos'];
const CHAVE_LOCAL = 'bibi-salgados:dados:v1';

// Firestore não aceita "undefined"; isso também faz uma cópia limpa.
const limpar = (obj) => JSON.parse(JSON.stringify(obj));

function vazio() {
  const d = { config: { ...CONFIG_PADRAO } };
  for (const c of COLECOES) d[c] = [];
  return d;
}

function normalizar(bruto) {
  const d = vazio();
  if (!bruto || typeof bruto !== 'object') return d;
  d.config = { ...CONFIG_PADRAO, ...(bruto.config || {}) };
  for (const c of COLECOES) d[c] = Array.isArray(bruto[c]) ? bruto[c].filter((x) => x && x.id) : [];
  return d;
}

export function abrirStore({ publico = false } = {}) {
  return FIREBASE_CONFIG ? abrirNuvem({ publico }) : abrirLocal();
}

export function exportarDados(dados) {
  const saida = { app: 'bibi-salgados', versao: 1, exportadoEm: new Date().toISOString(), config: dados.config };
  for (const c of COLECOES) saida[c] = dados[c];
  return saida;
}

export function validarBackup(json) {
  if (!json || typeof json !== 'object' || json.app !== 'bibi-salgados') {
    throw new Error('Este arquivo não é um backup da Bibi Salgados.');
  }
  return normalizar(json);
}

// ---------------------------------------------------------------------------
// Modo local
// ---------------------------------------------------------------------------

async function abrirLocal() {
  let dados = normalizar(lerLocal(CHAVE_LOCAL));
  if (!lerLocal(CHAVE_LOCAL)) {
    dados = normalizar(dadosExemplo());
    gravarLocal(CHAVE_LOCAL, dados);
  }

  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach((fn) => fn(dados));
  const persistir = () => {
    gravarLocal(CHAVE_LOCAL, dados);
    avisar();
  };

  // Mantém a página de vendas e a gestão iguais quando abertas em abas diferentes.
  window.addEventListener('storage', (e) => {
    if (e.key !== CHAVE_LOCAL) return;
    dados = normalizar(lerLocal(CHAVE_LOCAL));
    avisar();
  });

  const usuario = { email: null, local: true };

  return {
    modo: 'local',
    carregado: true,
    erro: null,
    get dados() { return dados; },
    get usuario() { return usuario; },
    aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    aoMudarUsuario(fn) { fn(usuario); return () => {}; },
    aoFalhar() { return () => {}; },
    async entrar() { return usuario; },
    async sair() {},

    async salvar(colecao, obj) {
      const o = limpar({ ...obj, id: obj.id || novoId() });
      const lista = dados[colecao];
      const i = lista.findIndex((x) => x.id === o.id);
      if (i >= 0) lista[i] = o; else lista.push(o);
      persistir();
      return o;
    },
    async excluir(colecao, id) {
      dados[colecao] = dados[colecao].filter((x) => x.id !== id);
      persistir();
    },
    async excluirVarios(colecao, ids) {
      const remover = new Set(ids);
      dados[colecao] = dados[colecao].filter((x) => !remover.has(x.id));
      persistir();
    },
    async salvarConfig(parcial) {
      dados.config = limpar({ ...dados.config, ...parcial });
      persistir();
    },
    async substituirTudo(novos) {
      dados = normalizar(limpar(novos));
      persistir();
    },
    async comecarComCardapio() {
      dados = normalizar({ ...cardapioInicial(), config: dados.config, pedidos: dados.pedidos, lancamentos: dados.lancamentos });
      persistir();
    },
    async restaurarExemplo() {
      dados = normalizar(dadosExemplo());
      persistir();
    },
    async criarPedidoSite(pedido) {
      return this.salvar('pedidos', pedido);
    },
  };
}

// ---------------------------------------------------------------------------
// Modo nuvem (Firebase)
// ---------------------------------------------------------------------------

async function abrirNuvem({ publico }) {
  const [appMod, fs, authMod] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
    publico ? Promise.resolve(null) : import(`${FIREBASE_SDK}/firebase-auth.js`),
  ]);

  const app = appMod.initializeApp(FIREBASE_CONFIG);
  let db;
  if (publico) {
    db = fs.getFirestore(app);
  } else {
    // Cache no aparelho: a gestão abre rápido e continua funcionando sem internet.
    try {
      db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
    } catch {
      db = fs.getFirestore(app);
    }
  }
  if (USAR_EMULADOR) fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);

  return publico ? abrirNuvemPublica(fs, db) : abrirNuvemGestao(fs, db, authMod, app);
}

// Página de vendas: só lê o cardápio e cria pedidos.
async function abrirNuvemPublica(fs, db) {
  const dados = vazio();
  const [cfg, prods] = await Promise.all([
    fs.getDoc(fs.doc(db, 'config', 'negocio')),
    fs.getDocs(fs.query(fs.collection(db, 'produtos'), fs.where('ativo', '==', true))),
  ]);
  dados.config = { ...CONFIG_PADRAO, ...(cfg.exists() ? cfg.data() : {}) };
  dados.produtos = prods.docs.map((d) => ({ ...d.data(), id: d.id }));

  return {
    modo: 'nuvem',
    carregado: true,
    erro: null,
    get dados() { return dados; },
    aoMudar() { return () => {}; },
    async criarPedidoSite(pedido) {
      const o = limpar(pedido);
      await fs.setDoc(fs.doc(db, 'pedidos', o.id), o);
      return o;
    },
  };
}

// Gestão: login, dados em tempo real e escrita.
async function abrirNuvemGestao(fs, db, authMod, app) {
  const auth = authMod.getAuth(app);
  auth.languageCode = 'pt';
  if (USAR_EMULADOR) authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

  let dados = vazio();
  let usuario;
  let carregado = false;
  let erro = null;
  let cancelar = [];
  const ouvintes = new Set();
  const ouvintesUsuario = new Set();
  const ouvintesErro = new Set();
  const avisar = () => ouvintes.forEach((fn) => fn(dados));
  const falhou = (e) => ouvintesErro.forEach((fn) => fn(e));

  function pararDeOuvir() {
    cancelar.forEach((f) => f());
    cancelar = [];
  }

  function ouvirDados() {
    const faltam = new Set(['config', ...COLECOES]);
    const chegou = (nome) => {
      faltam.delete(nome);
      if (!faltam.size) carregado = true;
      avisar();
    };
    const deuErro = (e) => {
      erro = e?.code === 'permission-denied' ? 'sem-permissao' : (e?.message || 'erro');
      carregado = true;
      avisar();
    };
    cancelar.push(fs.onSnapshot(fs.doc(db, 'config', 'negocio'), (snap) => {
      dados.config = { ...CONFIG_PADRAO, ...(snap.exists() ? snap.data() : {}) };
      chegou('config');
    }, deuErro));
    for (const c of COLECOES) {
      cancelar.push(fs.onSnapshot(fs.collection(db, c), (snap) => {
        dados[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        chegou(c);
      }, deuErro));
    }
  }

  await new Promise((resolve) => {
    authMod.onAuthStateChanged(auth, (u) => {
      pararDeOuvir();
      usuario = u ? { email: u.email, uid: u.uid } : null;
      dados = vazio();
      carregado = false;
      erro = null;
      if (u) ouvirDados();
      ouvintesUsuario.forEach((fn) => fn(usuario));
      resolve();
    });
  });

  // Gravações não esperam o servidor: sem internet elas ficam na fila e sobem depois.
  const gravar = (promessa) => {
    promessa.catch(falhou);
    return promessa;
  };

  async function emLotes(operacoes) {
    for (let i = 0; i < operacoes.length; i += 400) {
      const lote = fs.writeBatch(db);
      for (const op of operacoes.slice(i, i + 400)) op(lote);
      await lote.commit();
    }
  }

  async function gravarConjunto(novos) {
    const n = normalizar(limpar(novos));
    const ops = [(lote) => lote.set(fs.doc(db, 'config', 'negocio'), n.config)];
    for (const c of COLECOES) {
      const manter = new Set(n[c].map((x) => x.id));
      for (const antigo of dados[c]) {
        if (!manter.has(antigo.id)) ops.push((lote) => lote.delete(fs.doc(db, c, antigo.id)));
      }
      for (const x of n[c]) ops.push((lote) => lote.set(fs.doc(db, c, x.id), x));
    }
    await emLotes(ops);
  }

  return {
    modo: 'nuvem',
    get carregado() { return carregado; },
    get erro() { return erro; },
    get dados() { return dados; },
    get usuario() { return usuario; },
    aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    aoMudarUsuario(fn) { ouvintesUsuario.add(fn); return () => ouvintesUsuario.delete(fn); },
    aoFalhar(fn) { ouvintesErro.add(fn); return () => ouvintesErro.delete(fn); },

    async entrar(email, senha) {
      await authMod.signInWithEmailAndPassword(auth, email, senha);
    },
    async sair() {
      await authMod.signOut(auth);
    },
    async esqueciSenha(email) {
      await authMod.sendPasswordResetEmail(auth, email);
    },

    async salvar(colecao, obj) {
      const o = limpar({ ...obj, id: obj.id || novoId() });
      gravar(fs.setDoc(fs.doc(db, colecao, o.id), o));
      return o;
    },
    async excluir(colecao, id) {
      gravar(fs.deleteDoc(fs.doc(db, colecao, id)));
    },
    async excluirVarios(colecao, ids) {
      await emLotes(ids.map((id) => (lote) => lote.delete(fs.doc(db, colecao, id))));
    },
    async salvarConfig(parcial) {
      const novo = limpar({ ...dados.config, ...parcial });
      gravar(fs.setDoc(fs.doc(db, 'config', 'negocio'), novo));
    },
    async substituirTudo(novos) {
      await gravarConjunto(novos);
    },
    async comecarComCardapio() {
      await gravarConjunto({ ...cardapioInicial(), config: dados.config, pedidos: dados.pedidos, lancamentos: dados.lancamentos });
    },
    async criarPedidoSite(pedido) {
      return this.salvar('pedidos', pedido);
    },
  };
}
