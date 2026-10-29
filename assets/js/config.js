// Configuração do site.
//
// FIREBASE_CONFIG: cole aqui o objeto "firebaseConfig" do console do Firebase
// (Configurações do projeto → Seus apps → Web). Esses dados não são segredo:
// quem protege as informações são as regras em firestore.rules.
//
// Se ficar null, o site roda no "modo local": tudo fica guardado só no
// navegador de quem está usando, ótimo para testar.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC7iJP_GRlaNXt_orRlF39Yd3wp9jlaYsE',
  authDomain: 'bibi-salgados.firebaseapp.com',
  projectId: 'bibi-salgados',
  storageBucket: 'bibi-salgados.firebasestorage.app',
  messagingSenderId: '405874398283',
  appId: '1:405874398283:web:f3a94ace40c64bdb8fa9ce',
};

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/11.0.2';

// Liga os emuladores do Firebase em testes locais (http://localhost).
export const USAR_EMULADOR = false;
