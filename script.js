// ===== Firebase (CDN ES Modules) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithPopup, GoogleAuthProvider,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query,
  doc, updateDoc, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ===== Configuração do seu projeto Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyDSSgLKXgxjVBgADi-fX-0RxvItfhkiF7k",
  authDomain: "cadastro-produtos-e9dfb.firebaseapp.com",
  projectId: "cadastro-produtos-e9dfb",
  storageBucket: "cadastro-produtos-e9dfb.appspot.com", // <-- CORRETO!
  messagingSenderId: "438063963370",
  appId: "1:438063963370:web:a8e720fcc772f2940f8b93"
};

// ===== Inicializa Firebase =====
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);

// ===== Referências UI =====
const loginBtn  = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const whoEl     = document.getElementById('who');
const listEl    = document.getElementById('list');
const dlg       = document.getElementById('dlg');
const addForm   = document.getElementById('addForm');
const fab       = document.querySelector('.fab');

// ===== Canais (pode editar) =====
const CHANNELS = ["Tiny","Mercado Livre","Shopee","Shein"];

// ===== Helpers =====
const pct = (channelsObj) => {
  const done = CHANNELS.filter(c => channelsObj?.[c]).length;
  return Math.round((done / CHANNELS.length) * 100);
};
const prioColor = (p) => ({A:"#1f2937",B:"#475569",C:"#94a3b8"}[p]||"#64748b");

// ===== Auth =====
loginBtn?.addEventListener('click', async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
});
logoutBtn?.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  const logged = !!user;
  whoEl.textContent = logged ? (user.displayName || user.email || "logado") : "offline";
  loginBtn.style.display  = logged ? "none" : "inline-block";
  logoutBtn.style.display = logged ? "inline-block" : "none";
  if (fab) fab.disabled = !logged;
});

// ===== FAB abre diálogo =====
fab?.addEventListener('click', () => dlg.showModal());

// ===== Render de um produto =====
function renderItem(id, data){
  const div = document.createElement('div');
  div.className = 'card';
  div.style = 'background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;display:grid;grid-template-columns:72px 1fr auto;gap:12px;align-items:center';

  const thumbs = `
    <div class="thumbs">
      <img src="${data.frontUrl}" alt="frente" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb">
      <img src="${data.backUrl}"  alt="verso"  style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb">
    </div>`;

  const channelsHtml = CHANNELS.map(ch=>{
    const checked = data.channels?.[ch] ? 'checked' : '';
    return `<label class="channel" style="display:flex;align-items:center;gap:6px;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;background:#fafbff">
      <input type="checkbox" data-ch="${ch}" data-id="${id}" ${checked}> ${ch}
    </label>`;
  }).join('');

  const progressNow = pct(data.channels);

  div.innerHTML = `
    ${thumbs}
    <div>
      <div class="row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="priority-pill" style="display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#e5e7eb;color:${prioColor(data.priority)};font-weight:700">${data.priority}</span>
          <span class="muted" style="color:#8a94a6;font-size:12px">Criado: ${new Date(data.createdAt?.seconds? data.createdAt.seconds*1000:Date.now()).toLocaleString()}</span>
        </div>
        <button data-archive="${id}">Arquivar</button>
      </div>

      <div class="channels" style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
        ${channelsHtml}
      </div>

      <div class="progress-d" style="--pct:${progressNow};width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#22c55e calc(${progressNow} * 1%), #d8dee6 0);position:relative;isolation:isolate">
        <span style="position:relative;z-index:1;font-size:11px;font-weight:700;color:#334155">${progressNow}%</span>
      </div>
    </div>
  `;

  const progressCircle = div.querySelector('.progress-d');

  // checkboxes → atualizam canais / auto-arquivam a 100%
  div.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', async (e)=>{
      const ch  = e.target.getAttribute('data-ch');
      const pid = e.target.getAttribute('data-id');
      const refDoc = doc(db, 'products', pid);
      const newVal = e.target.checked;

      const newChannels = { ...(data.channels||{}), [ch]: newVal };
      const p = Math.round((Object.values(newChannels).filter(Boolean).length/CHANNELS.length)*100);

      // Atualiza o círculo D imediatamente
      progressCircle?.style.setProperty('--pct', p);
      progressCircle.style.background =
        `conic-gradient(#22c55e calc(${p} * 1%), #d8dee6 0)`;
      progressCircle.querySelector('span').textContent = `${p}%`;

      if(p === 100){
        await deleteDoc(refDoc);
        await addDoc(collection(db,'products_done'), {
          ...data, channels:newChannels, finishedAt: serverTimestamp()
        });
      }else{
        await updateDoc(refDoc, { channels:newChannels });
        data.channels = newChannels;
      }
    });
  });

  // Arquivar manual
  div.querySelector('[data-archive]')?.addEventListener('click', async ()=>{
    await deleteDoc(doc(db,'products', id));
    await addDoc(collection(db,'products_done'), {...data, finishedAt: serverTimestamp()});
  });

  return div;
}

// ===== Listagem ao vivo =====
const prioRank = p => ({A:1,B:2,C:3}[p]||9);
onSnapshot(query(collection(db,'products')), (snap)=>{
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  rows.sort((a,b)=> prioRank(a.priority)-prioRank(b.priority) || (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  listEl.innerHTML = '';
  rows.forEach(r => listEl.appendChild(renderItem(r.id, r)));
});

// ===== Adicionar produto =====
addForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const front = document.getElementById('front').files[0];
  const back  = document.getElementById('back').files[0];
  const priority = document.getElementById('priority').value;

  if(!auth.currentUser){ alert('Faça login para adicionar.'); return; }

  const idSeed = String(Date.now());
  const fRef = ref(storage, `products/${idSeed}-front.jpg`);
  const bRef = ref(storage, `products/${idSeed}-back.jpg`);

  await uploadBytes(fRef, front);
  await uploadBytes(bRef, back);

  const frontUrl = await getDownloadURL(fRef);
  const backUrl  = await getDownloadURL(bRef);

  await addDoc(collection(db,'products'), {
    priority, frontUrl, backUrl,
    channels: {},
    createdAt: serverTimestamp(),
    owner: auth.currentUser.uid
  });

  dlg.close();
  e.target.reset();
});

