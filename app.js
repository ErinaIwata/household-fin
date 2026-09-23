let state = {
  people: { p1: 'わたし', p2: 'ぺっくる' },
  balance: 0,
  monthlyItems: [],
  oneTimeItems: [],
  wishItems: []
};
let loaded = false;
let showAddMonthly = false;
let showAddOnetime = false;
let showAddWish = false;
let draftSplit = { monthly: 'half', onetime: 'half' };

function yen(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}

function shareFor(item) {
  const amt = Number(item.amount) || 0;
  if (item.splitMode === 'p1') return { s1: amt, s2: 0 };
  if (item.splitMode === 'p2') return { s1: 0, s2: amt };
  if (item.splitMode === 'custom') {
    const s1 = Math.round(amt * (Number(item.customPct) || 50) / 100);
    return { s1, s2: amt - s1 };
  }
  const s1 = Math.round(amt / 2);
  return { s1, s2: amt - s1 };
}

// 実際のURLに変更してください
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxazVaqBGaAZQjBt5Y0sXEC_KYWiojJ6qZ-FJ8oXslX23yowLQlNELERqitm-xdDgxD/exec';

async function save() {
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(state)
    });
  } catch (e) { console.error('save failed', e); }
}

async function load() {
  try {
    const res = await fetch(GAS_URL);
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
      state = Object.assign(state, parsed);
      if (!state.wishItems) state.wishItems = [];
    }
  } catch (e) { }
  loaded = true;
  render();
}

function addItem(kind, name, amount, splitMode, customPct) {
  const item = {
    id: 'i' + Date.now(),
    name, amount: Number(amount) || 0,
    splitMode: splitMode || 'half',
    customPct: customPct != null ? Number(customPct) : 50,
    doneP1: false,
    doneP2: false
  };
  if (kind === 'monthly') state.monthlyItems.push(item);
  else state.oneTimeItems.push(item);
  save(); render();
}

function addWishItem(name, amount) {
  state.wishItems.push({
    id: 'w' + Date.now(),
    name,
    amount: Number(amount) || 0,
    status: 'pending'
  });
  save(); render();
  // 追加した時に相手に通知が行くイメージのアラート
  alert(`「${name}」の購入リクエストを相手に通知しました！`);
}

function toggleDone(kind, id, who) {
  const list = kind === 'monthly' ? state.monthlyItems : state.oneTimeItems;
  const it = list.find(x => x.id === id);
  if (it) it[who === 'p1' ? 'doneP1' : 'doneP2'] = !it[who === 'p1' ? 'doneP1' : 'doneP2'];
  save(); render();
}

function toggleWishStatus(id) {
  const it = state.wishItems.find(x => x.id === id);
  if (it) {
    if (it.status === 'pending') {
      it.status = 'approved';
      alert(`購入を許可しました！相手に通知されます。`);
    } else {
      it.status = 'pending';
    }
  }
  save(); render();
}

function removeItem(kind, id) {
  if (kind === 'monthly') state.monthlyItems = state.monthlyItems.filter(x => x.id !== id);
  else if (kind === 'onetime') state.oneTimeItems = state.oneTimeItems.filter(x => x.id !== id);
  else state.wishItems = state.wishItems.filter(x => x.id !== id);
  save(); render();
}

function setBalance(v) { state.balance = Number(v) || 0; save(); }
function setName(who, v) { state.people[who] = v || (who === 'p1' ? 'わたし' : 'ぺっくる'); save(); render(); }

function unpaidShares(it) {
  const { s1, s2 } = shareFor(it);
  return {
    u1: (s1 > 0 && !it.doneP1) ? s1 : 0,
    u2: (s2 > 0 && !it.doneP2) ? s2 : 0
  };
}

function computeTotals() {
  const allMonthly = state.monthlyItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const unpaidOnetime = state.oneTimeItems.reduce((sum, it) => sum + unpaidShares(it).u1 + unpaidShares(it).u2, 0);
  const totalDue = allMonthly + unpaidOnetime;
  const diff = state.balance - totalDue;

  let s1total = 0, s2total = 0;
  [...state.monthlyItems, ...state.oneTimeItems].forEach(it => {
    const { u1, u2 } = unpaidShares(it);
    s1total += u1; s2total += u2;
  });
  return { allMonthly, unpaidOnetime, totalDue, diff, s1total, s2total };
}

function shareRow(kind, it, who, amount) {
  const isDone = !!it[who === 'p1' ? 'doneP1' : 'doneP2'];
  return `
  <div class="share-row">
    <div class="share-left">
      <span class="tag ${who}">${state.people[who]}</span>
      <span class="share-amount">${yen(amount)}</span>
    </div>
    <button class="done-toggle ${isDone ? 'checked' : ''}" onclick="toggleDone('${kind}','${it.id}','${who}')">${isDone ? '対応済み' : '未対応'}</button>
  </div>`;
}

function itemRow(kind, it) {
  const { s1, s2 } = shareFor(it);
  const fullyDone = (s1 === 0 || it.doneP1) && (s2 === 0 || it.doneP2);
  const rows = [];
  if (s1 > 0) rows.push(shareRow(kind, it, 'p1', s1));
  if (s2 > 0) rows.push(shareRow(kind, it, 'p2', s2));
  return `
  <div class="item ${fullyDone ? 'done' : ''}">
    <div class="item-top">
      <div class="item-name">${it.name}</div>
      <div class="item-top-right">
        <div class="item-amount">${yen(it.amount)}</div>
        <button class="del-btn" onclick="removeItem('${kind}','${it.id}')">×</button>
      </div>
    </div>
    ${rows.join('')}
  </div>`;
}

function wishItemRow(it) {
  const isApproved = it.status === 'approved';
  return `
  <div class="item ${isApproved ? 'done' : ''}">
    <div class="item-top">
      <div class="item-name">${it.name}</div>
      <div class="item-top-right">
        <div class="item-amount">${yen(it.amount)}</div>
        <button class="del-btn" onclick="removeItem('wish','${it.id}')">×</button>
      </div>
    </div>
    <div class="share-row">
      <div class="share-left">
        <span class="tag" style="background:var(--wish); color:#FFF;">共同のお金</span>
      </div>
      <button class="done-toggle wish-btn ${isApproved ? 'checked' : ''}" onclick="toggleWishStatus('${it.id}')">
        ${isApproved ? '許可済み' : '購入許可待ち'}
      </button>
    </div>
  </div>`;
}

function toggleAddForm(kind) {
  if (kind === 'monthly') showAddMonthly = !showAddMonthly;
  else if (kind === 'onetime') showAddOnetime = !showAddOnetime;
  else showAddWish = !showAddWish;
  render();
}

function setDraftSplit(kind, mode) { draftSplit[kind] = mode; render(); }

function submitAdd(kind) {
  const name = document.getElementById('name-' + kind).value.trim();
  const amount = document.getElementById('amount-' + kind).value;
  if (!name || !amount) return;
  if (kind === 'wish') {
    addWishItem(name, amount);
    showAddWish = false;
  } else {
    addItem(kind, name, amount, draftSplit[kind], 50);
    if (kind === 'monthly') showAddMonthly = false; else showAddOnetime = false;
  }
}

function render() {
  const app = document.getElementById('app');
  if (!loaded) { app.innerHTML = '<div class="sub" style="padding-top:40px;text-align:center;">読み込み中…</div>'; return; }

  const t = computeTotals();
  const total = Math.max(t.s1total + t.s2total, 1);
  const p1pct = Math.round(t.s1total / total * 100);

  // 貯金箱のステータスとスピード判定を追加
  let piggyClass = 'piggy-normal';
  let pigSpeed = '6s'; // デフォルトの速さ

  if (t.diff >= 30000) {
    piggyClass = 'piggy-fat';
    pigSpeed = '3s'; // 余裕がある時は速い（3秒で1周）
  } else if (t.diff < 0) {
    piggyClass = 'piggy-skinny';
    pigSpeed = '12s'; // マイナスの時はかなりゆっくり（12秒で1周）
  }

  app.innerHTML = `
    <h1>最強になれる家計簿</h1>
    <p class="sub">共同口座の残高と、支払い予定をまとめて管理します。</p>

    <div class="names">
      <div class="name-chip"><span class="dot" style="background:var(--p1)"></span>
        <input value="${state.people.p1}" oninput="setName('p1', this.value)"></div>
      <div class="name-chip"><span class="dot" style="background:var(--p2)"></span>
        <input value="${state.people.p2}" oninput="setName('p2', this.value)"></div>
    </div>

    <!-- 豚の移動アニメーション・トラック -->
    <div class="piggy-track" style="--pig-speed: ${pigSpeed};">
      <div class="track-coin">¥</div>
      <div class="track-coin">¥</div>
      <div class="track-coin">¥</div>
      
      <div class="pig-wrapper">
        <svg viewBox="0 0 100 100" width="110" height="110" class="piggy-svg ${piggyClass}">
          <path d="M 15 55 Q 5 45 10 35 Q 15 30 20 35" fill="none" stroke="#F48FB1" stroke-width="3" stroke-linecap="round" />
          <rect x="32" y="70" width="8" height="14" rx="4" fill="#F48FB1" class="pig-leg"/>
          <rect x="60" y="70" width="8" height="14" rx="4" fill="#F48FB1" class="pig-leg"/>
          <ellipse cx="50" cy="55" rx="35" ry="30" fill="#F48FB1" class="pig-body" />
          <polygon points="32,35 42,20 52,32" fill="#F06292" class="pig-ear" />
          <ellipse cx="75" cy="55" rx="10" ry="12" fill="#F06292" class="pig-snout" />
          <circle cx="72" cy="52" r="2" fill="#D81B60" />
          <circle cx="72" cy="58" r="2" fill="#D81B60" />
          <circle cx="62" cy="45" r="3.5" fill="#333" class="pig-eye" />
          <path class="pig-mouth" />
        </svg>
      </div>
    </div>

    <div class="hero">
      <div class="hero-row">
        <div>
          <div class="hero-label">共同口座の残高</div>
          <div class="balance-edit"><span>¥</span><input type="number" value="${state.balance}" oninput="setBalance(this.value)"></div>
        </div>
      </div>
      
      <!-- 文言をわかりやすく修正 -->
      <div class="status-line ${t.diff >= 0 ? 'status-ok' : 'status-alert'}">
        ${t.diff >= 0
      ? `予定している支払い（${yen(t.totalDue)}）を引いて、今月はあと ${yen(t.diff)} 使えます`
      : `予定している支払い（${yen(t.totalDue)}）に対して ${yen(Math.abs(t.diff))} 不足しています`}
      </div>
      
      <div class="split-bar">
        <div style="width:${p1pct}%;background:var(--p1)"></div>
        <div style="width:${100 - p1pct}%;background:var(--p2)"></div>
      </div>
      
      <!-- 負担分 → 未払い分 に修正 -->
      <div class="owed-grid">
        <div class="owed-card p1">
          <div class="owed-label">${state.people.p1}の未払い分</div>
          <div class="owed-value p1">${yen(t.s1total)}</div>
        </div>
        <div class="owed-card p2">
          <div class="owed-label">${state.people.p2}の未払い分</div>
          <div class="owed-value p2">${yen(t.s2total)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>毎月の支払い</h2>
        <span class="count">合計 ${yen(t.allMonthly)}</span>
      </div>
      ${state.monthlyItems.length ? state.monthlyItems.map(it => itemRow('monthly', it)).join('') : '<div class="empty">家賃や光熱費などを登録しましょう</div>'}
      <button class="add-toggle" onclick="toggleAddForm('monthly')">${showAddMonthly ? '閉じる' : '+ 項目を追加'}</button>
      <div class="add-form ${showAddMonthly ? '' : 'hidden'}" id="form-monthly">
        <div class="add-row"><input type="text" id="name-monthly" placeholder="例）家賃、電気代"></div>
        <div class="add-row"><input type="number" id="amount-monthly" placeholder="金額（円）"></div>
        <div class="split-choice">
          <button class="${draftSplit.monthly === 'half' ? 'active' : ''}" onclick="setDraftSplit('monthly','half')">折半</button>
          <button class="${draftSplit.monthly === 'p1' ? 'active' : ''}" onclick="setDraftSplit('monthly','p1')">${state.people.p1}が全額</button>
          <button class="${draftSplit.monthly === 'p2' ? 'active' : ''}" onclick="setDraftSplit('monthly','p2')">${state.people.p2}が全額</button>
        </div>
        <button class="add-submit" onclick="submitAdd('monthly')">追加する</button>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>引越し・家具家電の支払い</h2>
        <span class="count">未対応 ${yen(t.unpaidOnetime)}</span>
      </div>
      ${state.oneTimeItems.length ? state.oneTimeItems.map(it => itemRow('onetime', it)).join('') : '<div class="empty">購入予定の家具・家電を登録しましょう</div>'}
      <button class="add-toggle" onclick="toggleAddForm('onetime')">${showAddOnetime ? '閉じる' : '+ 項目を追加'}</button>
      <div class="add-form ${showAddOnetime ? '' : 'hidden'}" id="form-onetime">
        <div class="add-row"><input type="text" id="name-onetime" placeholder="例）冷蔵庫、カーテン"></div>
        <div class="add-row"><input type="number" id="amount-onetime" placeholder="金額（円）"></div>
        <div class="split-choice">
          <button class="${draftSplit.onetime === 'half' ? 'active' : ''}" onclick="setDraftSplit('onetime','half')">折半</button>
          <button class="${draftSplit.onetime === 'p1' ? 'active' : ''}" onclick="setDraftSplit('onetime','p1')">${state.people.p1}が全額</button>
          <button class="${draftSplit.onetime === 'p2' ? 'active' : ''}" onclick="setDraftSplit('onetime','p2')">${state.people.p2}が全額</button>
        </div>
        <button class="add-submit" onclick="submitAdd('onetime')">追加する</button>
      </div>
    </div>

    <!-- 新機能：その他に購入したいもの（Wishリスト） -->
    <div class="section">
      <div class="section-head">
        <h2>その他・共同で買いたいもの</h2>
      </div>
      ${state.wishItems && state.wishItems.length ? state.wishItems.map(it => wishItemRow(it)).join('') : '<div class="empty">共同のお金から買いたいものをリクエストできます</div>'}
      <button class="add-toggle" onclick="toggleAddForm('wish')">${showAddWish ? '閉じる' : '+ 買いたいものを追加'}</button>
      <div class="add-form ${showAddWish ? '' : 'hidden'}" id="form-wish">
        <div class="add-row"><input type="text" id="name-wish" placeholder="例）サッカー観戦チケット、お揃いのグッズ"></div>
        <div class="add-row"><input type="number" id="amount-wish" placeholder="金額（円）"></div>
        <button class="add-submit" onclick="submitAdd('wish')">購入許可を求める</button>
      </div>
    </div>

    <p class="save-note">入力内容は自動保存されます。このページを二人で開けば内容を共有できます。</p>
  `;
}

window.addEventListener('DOMContentLoaded', load);