// ===== Firebase (CDN ES Modules) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, query,
  doc, updateDoc, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== Config do seu projeto =====
const firebaseConfig = {
  apiKey: "AIzaSyDSSgLKXgxjVBgADi-fX-0RxvItfhkiF7k",
  authDomain: "cadastro-produtos-e9dfb.firebaseapp.com",
  projectId: "cadastro-produtos-e9dfb",
  // sem storageBucket
  messagingSenderId: "438063963370",
  appId: "1:438063963370:web:a8e720fcc772f2940f8b93"
};

// ===== Init =====
const app = initializeApp(firebaseConfig);
const db   = getFirestore(app);

// ===== UI refs =====
const listEl  = document.getElementById('list');
const dlg     = document.getElementById('dlg');
const addForm = document.getElementById('addForm');
const fab     = document.querySelector('.fab');

// ===== Canais =====
const CHANNELS = ["Tiny","Mercado Livre","Shopee","Shein"];

// ===== Helpers =====
const pct = (channelsObj) => {
  const done = CHANNELS.filter(c => channelsObj?.[c]).length;
  return Math.round((done / CHANNELS.length) * 100);
};

// Converte File -> dataURL comprimido (máx. 1024px, JPEG 0.72)
async function fileToDataURLCompressed(file, maxSide = 1024, quality = 0.72) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  let w = width, h = height;
  if (Math.max(w, h) > maxSide) {
    if (w >= h) { h = Math.round(h * (maxSide / w)); w = maxSide; }
    else { w = Math.round(w * (maxSide / h)); h = maxSide; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl;
}

// ===== FAB abre diálogo =====
fab?.addEventListener('click', () => dlg.showModal());

// ===== Render de um produto (A → B → C → D) =====
function renderItem(id, data){
  // caminho da logo (preenche o círculo via CSS background-image)
  const LOGO_URL = "assets/mercado-livre.jpg";

  const div = document.createElement('div');
  div.className = 'card';

  const progressNow = pct(data.channels);

  div.innerHTML = `
    <!-- A -->
    <span class="priority-pill">${data.priority || 'A'}</span>

    <!-- B (duas fotos lado a lado) -->
    <div class="thumbs">
      <img src="${data.frontData || data.frontUrl}" alt="frente">
      <img src="${data.backData  || data.backUrl }" alt="verso">
    </div>

    <!-- C (logos com checkbox embaixo, uma linha sem quebra) -->
    <div class="channels-wrap">
      <div class="channels-row">
        ${CHANNELS.map(ch=>{
          const checked = data.channels?.[ch] ? 'checked' : '';
          return `
            <div class="ch">
              <div class="logo" style="background-image:url('${LOGO_URL}')"></div>
              <input type="checkbox" data-ch="${ch}" data-id="${id}" ${checked}>
            </div>
          `;
        }).join('')}
      </div>
      <div class="meta">Criado: ${
        new Date(data.createdAt?.seconds ? data.createdAt.seconds*1000 : Date.now())
          .toLocaleString()
      }</div>
    </div>

    <!-- D (gráfico) -->
    <div class="progress-d" style="--pct:${progressNow}">
      <span>${progressNow}%</span>
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
      const p = Math.round(
        (Object.values(newChannels).filter(Boolean).length / CHANNELS.length) * 100
      );

      // atualiza D visualmente
      progressCircle?.style.setProperty('--pct', p);
      progressCircle.style.background = `conic-gradient(#22c55e calc(${p} * 1%), #d8dee6 0)`;
      progressCircle.querySelector('span').textContent = `${p}%`;

      if (p === 100) {
        await deleteDoc(refDoc);
        await addDoc(collection(db,'products_done'), {
          ...data, channels:newChannels, finishedAt: serverTimestamp()
        });
      } else {
        await updateDoc(refDoc, { channels:newChannels });
        data.channels = newChannels;
      }
    });
  });

  return div;
}

// ===== Listagem ao vivo (prioridade A>B>C e mais novo primeiro) =====
const prioRank = p => ({A:1,B:2,C:3}[p] || 9);
onSnapshot(query(collection(db,'products')), (snap)=>{
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  rows.sort((a,b)=>
    prioRank(a.priority)-prioRank(b.priority) ||
    (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)
  );
  listEl.innerHTML = '';
  rows.forEach(r => listEl.appendChild(renderItem(r.id, r)));
});

// ===== Adicionar produto (SEM Storage) =====
addForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const frontFile = document.getElementById('front').files[0];
  const backFile  = document.getElementById('back').files[0];
  const priority  = document.getElementById('priority').value || 'A';

  // Converte e comprime
  const [frontData, backData] = await Promise.all([
    fileToDataURLCompressed(frontFile, 1024, 0.72),
    fileToDataURLCompressed(backFile, 1024, 0.72),
  ]);

  // Valida tamanho aproximado (defensivo)
  if ((frontData.length + backData.length) > 950_000) {
    alert("As imagens ficaram grandes. Tente tirar com menos resolução.");
    return;
  }

  await addDoc(collection(db,'products'), {
    priority,
    frontData,  // data URL inline
    backData,   // data URL inline
    channels: {},
    createdAt: serverTimestamp()
  });

  dlg.close();
  e.target.reset();
});


