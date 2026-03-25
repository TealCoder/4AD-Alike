// ===== Utility: Inline placeholder image (SVG data URL) =====
function placeholderSVG(label = "Image", w = 800, h = 500) {
  const svg = encodeURIComponent(`<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>\n<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#263248'/><stop offset='100%' stop-color='#151a24'/></linearGradient></defs>\n<rect width='100%' height='100%' fill='url(#g)'/>\n<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='system-ui,Segoe UI' font-size='32' fill='white' opacity='0.7'>${label}</text></svg>`);
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}

// ===== DOM helpers =====
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
	if (k === 'class') e.className = v;
	else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
	else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
	else if (k === 'dataset') Object.assign(e.dataset, v);
	else e.setAttribute(k, v);
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
	if (c == null) continue;
	if (typeof c === 'string') e.appendChild(document.createTextNode(c));
	else e.appendChild(c);
  }
  return e;
}

// Hide/show Monster Info
function hideMonsterStats() {
  const el1 = document.getElementById('monster-stats');
  if (el1) {el1.style.display = 'none';} else {console.log("el1 is NULL");}
}
function showMonsterStats() {
  const el = document.getElementById('monster-stats');
  if (el) { el.style.display = 'grid';} else {console.log("el is NULL");}
}

// ===== Bars =====
function makeBar(id, colorCSSVar, current, max, aria) {
  const wrap = el('div', { class: 'bar', role: 'progressbar', 'aria-label': aria, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': current });
  const fill = el('div', { class: 'bar-fill', id, style: { background: `var(${colorCSSVar})`, width: `${percent(current, max)}%` } });
  const text = el('div', { class: 'bar-text', id: id + '-text' }, formatBarText(id, current, max));
  wrap.append(fill, text);
  return wrap;
}

function percent(cur, max) { return Math.max(0, Math.min(100, max > 0 ? (cur / max) * 100 : 0)); }

function formatBarText(idBase, cur, max) {
  if (idBase.startsWith('hp-') || idBase === 'monster-hp-fill') return `HP ${cur}/${max}`;
  if (idBase.startsWith('mp-')) return `MP ${cur}/${max}`;
  return `${cur}/${max}`;
}

function setBar(idBase, cur, max) {
  console.log(`setBar ${idBase} ${cur} / ${max}`);
  const fill = document.getElementById(idBase);
  const text = document.getElementById(idBase + '-text');
  fill.style.width = `${percent(cur, max)}%`;
  text.textContent = formatBarText(idBase, cur, max);
}


/* =========================
   Game UI Conrols
   ========================= */

// ===== Monster UI =====
function renderMonster(mon) {
  document.getElementById('monster-img').src = mon.image;
  document.getElementById('monster-name').textContent = mon.name;
  if (mon.power > 0)
  {
	document.getElementById('monster-power').textContent = `Power: ${mon.power}`;
	setBar('monster-hp-fill', mon.hp, mon.hpMax);
	showMonsterStats();
  }
  else
  {
	hideMonsterStats();
  }
  console.log('monster-name: ' + mon.name);
  console.log('monster-power: ' + mon.power);
}

function setMonster(next) {
  if (!next) {
    console.warn("setMonster called with:", next, "room_index=", Game?.room_index, "state=", Game?.state);
    // Optional: show something obvious instead of leaving stale UI
    renderMonster({ name: "??", image: placeholderSVG("Missing"), power: -1 });
    return;
  }
  state.monster = { ...state.monster, ...next };
  renderMonster(state.monster);
}

function setMonsterHP(hp, hpMax = state.monster.hpMax) { state.monster.hp = hp; state.monster.hpMax = hpMax; setBar('monster-hp-fill', hp, hpMax); }

// ===== Actions UI =====
function renderActions(list) {
  const root = document.getElementById('actions');
  root.innerHTML = '';
  for (const a of list) {
	const btn = el('button', {
      class: 'action-btn',
      id: `action-${a.id}`,
      onclick: async (e) => {
        btn.disabled = true;
        try {
          await Promise.resolve(a.handler?.(e));
        } catch (err) {
          console.error(`Action failed: ${a.label}`, err);
        } finally {
          btn.disabled = false;
        }
      }
    }, a.label);
	root.appendChild(btn);
  }
}
function setActions(list) { state.actions = list; renderActions(list); }

// ===== Party UI =====
function renderParty(members) {
  const root = document.getElementById('party');
  root.innerHTML = '';
  for (const m of members) root.appendChild(renderMember(m));
}

function renderMember(m) {
  const hpBar = makeBar(`hp-${m.id}`, '--hp', m.hp, m.hpMax, `${m.name} HP`);
  const mpBar = makeBar(`mp-${m.id}`, '--mp', m.mp, m.mpMax, `${m.name} MP`);
  return el('div', { class: 'member', id: `member-${m.id}`, dataset: { id: m.id } }, [
	el('div', { class: 'avatar' }, el('img', { alt: `${m.name} portrait`, src: m.image || placeholderSVG(m.name, 200, 200), onclick: () => openCharacterModal(m.id) })),
	el('div', { class: 'member-main' }, [
	  el('div', { class: 'member-top' }, [
		el('div', { class: 'member-name' }, m.name),
		el('div', { class: 'member-meta' }, m.role || '')
	  ]),
	  el('div', { class: 'row' }, [ hpBar ]),
	  el('div', { class: 'row' }, [ mpBar ]),
	])
  ]);
}

function setParty(nextMembers) { state.party = nextMembers.map(m => ({ ...m })); renderParty(state.party); }
function setHP(id, hp, hpMax) {
  const m = state.party.find(p => p.id === id);
  if (!m) return;
  if (typeof hp === 'number') m.hp = hp;
  if (typeof hpMax === 'number') m.hpMax = hpMax;
  setBar(`hp-${id}`, m.hp, m.hpMax);
}
function setMP(id, mp, mpMax) {
  const m = state.party.find(p => p.id === id);
  if (!m) return;
  if (typeof mp === 'number') m.mp = mp;
  if (typeof mpMax === 'number') m.mpMax = mpMax;
  setBar(`mp-${id}`, m.mp, m.mpMax);
}

// ===== Story Text =====
function setStory(text) { 
  storyEl = document.getElementById('story')
  storyEl.innerHTML += text +"<br>";
  // Always scroll to bottom to show the latest lines
  storyEl.scrollTop = storyEl.scrollHeight;
}

function setStoryHtml(html) {
  const storyEl = document.getElementById('story');
  storyEl.innerHTML = html;
  storyEl.scrollTop = 0;
}

// ===== Init =====

// Expose minimal API for rapid tinkering in console
window.GameUI = {
  setMonster, setMonsterHP, setActions, setParty, setHP, setMP, setStory, setStoryHtml
};
	
function openCharacterModal(id) {
  const ch = state.party?.find(p => p.id === id);
  if (!ch) return;

  const backdrop = document.getElementById('char-modal-backdrop');
  const title = document.getElementById('char-modal-title');
  const sub = document.getElementById('char-modal-sub');
  const portrait = document.getElementById('char-modal-portrait');
  const kv = document.getElementById('char-modal-kv');
  const attacksEl = document.getElementById('char-modal-attacks');

  title.textContent = ch.name;
  sub.textContent = `${ch.role || ''}  •  Level ${ch.lvl ?? 1}`;

  portrait.src = ch.image || placeholderSVG(ch.name, 220, 220);
  portrait.alt = `${ch.name} portrait`;

  const rows = [
    ['HP', `${ch.hp}/${ch.hpMax}`],
    ['MP', `${ch.mp}/${ch.mpMax}`],
    ['Weapon', String(ch.weapon ?? 0)],
    ['Armor', String(ch.armor ?? 0)],
    ['Guarded', ch.guarded ? 'Yes' : 'No'],
    ['Note', ch.note || '']
  ];

  kv.innerHTML = rows.map(([k,v]) =>
    `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div>`
  ).join('');

  const attacks = ch.attacks || [];
  attacksEl.innerHTML = attacks.map(a => {
    const dmg = (a.dmg === "*" ? "special" : a.dmg);
    const anytime = a.anytime ? " • anytime" : "";
    return `
      <li>
        <div><b>${escapeHtml(a.name)}</b></div>
        <div class="attack-meta">mp_cost: ${escapeHtml(String(a.mp_cost ?? 0))} • dmg: ${escapeHtml(String(dmg))}${anytime}</div>
      </li>
    `;
  }).join('');

  const derivedEl = document.getElementById('char-modal-derived');
  const derived = computeDerivedCombatInfo(ch);
    derivedEl.innerHTML = derived.map(d =>
    `<li>
      <div><b>${escapeHtml(d.title)}</b></div>
      <div class="attack-meta">${escapeHtml(d.text)}</div>
    </li>`
  ).join('');

  backdrop.style.display = 'flex';
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeCharacterModal() {
  const backdrop = document.getElementById('char-modal-backdrop');
  backdrop.style.display = 'none';
  backdrop.setAttribute('aria-hidden', 'true');
}

// Tiny HTML escaper so notes/strings can't break your modal markup
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function computeDerivedCombatInfo(ch) {
  const lvl = ch.lvl || 0;
  const weapon = ch.weapon || 0;
  const armor = ch.armor || 0;

  const info = [];

  // Defense
  let defenseNotes = [`armor ${armor}`];
  if (ch.role === "Rogue") defenseNotes.push(`rogue lvl (${lvl})`);
  defenseNotes.push(`guarded (1 if active)`);
  info.push({
    title: "Defense Roll",
    text: `d6 + ${defenseNotes.join(" + ")}`
  });

  // Strike
  let strikeNotes = [`weapon ${weapon}`];
  if (ch.role === "Warrior") strikeNotes.push(`warrior lvl (${lvl})`);
  if (ch.role === "Cleric") strikeNotes.push(`cleric half-lvl (${Math.floor(lvl / 2)})`);
  info.push({
    title: "Basic Strike Attack",
    text: `d6 + ${strikeNotes.join(" + ")}`
  });

  // Healing (if applicable)
  if (ch.attacks?.some(a => a.name === "Heal" || a.dmg === "*")) {
    info.push({
      title: "Heal",
      text: `d6 + lvl (${lvl}) HP restored`
    });
  }

  return info;
}
