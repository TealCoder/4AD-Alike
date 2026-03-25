/* =========================
   Finite State Framework
   ========================= */

// 1) Enum-like state bag (elephant case)
const State = Object.freeze({
  TOWN: "TOWN",
  ROOM:    "EMPTY_ROOM",
  ROOM_ENTRY:    "ROOM_ENTRY",
  MONSTER_APPEARS:  "MONSTER_APPEARS",
  PLAYER_TURN:   "PLAYER_TURN",
  MONSTER_TURN:  "MONSTER_TURN",
  VICTORY:       "VICTORY",
  DEFEAT:        "DEFEAT",
});

// 2) Minimal game data for this flow
const Game = {
  state: State.ROOM, // starts here
  room_index: 0,
  clue_count: 0,
  can_leave_dungeon: false,
};

// 3) Small helpers

function applyCounters(delta = {}, setAbs = {}) {
  // delta: { room_index: +1/-1, clue_count: +1/-1 }
  // setAbs: { room_index: 0, clue_count: 0 } (absolute set)
  if ("room_index" in delta) Game.room_index += delta.room_index;
  if ("clue_count" in delta) Game.clue_count += delta.clue_count;
  if ("room_index" in setAbs) Game.room_index = setAbs.room_index;
  if ("clue_count" in setAbs) Game.clue_count = setAbs.clue_count;
  if (Game.room_index < 0) Game.room_index = 0;
  if (Game.room_index >= Rooms.length) {
    setStory("That's the end! That's all the rooms there are so far!");
    Game.room_index = Rooms.length - 1;
  }
  if (Game.clue_count > 3) { alert("Solved a Mystery!"); Game.clue_count = 0; }
}

// ===== Dice helper (easy to tweak globally later) =====
// Defaults for normal play
const TestHooks = {
  rollD6: () => 1 + Math.floor(Math.random() * 6),
  choosePartyTarget: null,
};

async function rollD6(label = "Dice Roll") {
  return rollD6For(label);
}

// ===== Party helpers =====
function livingPartyMembers() {
  return (state.party || []).filter(p => (p.hp || 0) > 0);
}

function allPartyDead() {
  return livingPartyMembers().length === 0;
}

function nextLivingIndex(startIdx) {
  const n = state.party?.length || 0;
  if (!n) return -1;
  for (let i = 0; i < n; i++) {
    const idx = (startIdx + i) % n;
    if ((state.party[idx].hp || 0) > 0) return idx;
  }
  return -1;
}

// Config: how many living targets the monster will try to hit each turn
const MONSTER_TARGETS = 2;

function getMonster() {
  // Your monster is stored in state.monster and has power/hp/hpMax
  return state.monster;
}

function logLines(lines) {
  // setStory appends, so just emit multiple lines cleanly
  for (const line of lines) setStory(line);
}

function makeAction(label, effect) {
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    handler: async () => {
      await effect();              // adjust counters / do effects
      // transition happens inside each effect via go(nextState)
    },
  };
}

function refreshMonsterPanelForCurrentState() {
  if (Game.state === State.TOWN) {
    GameUI.setMonster({
      name: "Town",
      image: "images/Town.png",
      power: -1,
    });
    return;
  }

  // States where you want to show an actual monster
  if ([State.MONSTER_APPEARS, State.PLAYER_TURN, State.MONSTER_TURN].includes(Game.state)) {
    const src = Rooms[Game.room_index]?.monster_present;

    // If we already have a live monster in state, preserve its current hp/hpMax.
    // This prevents the UI refresh from "resetting" combat progress.
    if (src && state.monster && state.monster.power > 0) {
      const preserved = {
        ...src,
        hp: state.monster.hp,
        hpMax: state.monster.hpMax,
      };
      GameUI.setMonster(preserved);
      return;
    }

    if (src) GameUI.setMonster(src);
    return;
  }

  // Otherwise show the room
  GameUI.setMonster(Rooms[Game.room_index]);
}

async function go(nextState) {
  console.log("State:"+Game.state+" room:"+Game.room_index+" clues:"+Game.clue_count);
  Game.state = nextState;
  const fn = EnterHandlers[nextState];
  if (fn) await fn();

  // Force UI sync even if an enter handler forgets to set the monster/room
  refreshMonsterPanelForCurrentState();
}

function choosePartyTarget(promptTitle = "Choose a target") {
  if (typeof TestHooks.choosePartyTarget === "function") {
    return TestHooks.choosePartyTarget(promptTitle);
  }

  const party = state.party || [];
  if (!party.length) return null;

  const lines = party.map((p, i) =>
    `${i + 1}) ${p.name} (${p.role}) HP:${p.hp}/${p.hpMax}`
  );

  const ans = prompt(
    `${promptTitle}\n\n${lines.join("\n")}\n\nType 1-${party.length}:`,
    "1"
  );

  if (ans === null) return null; // user cancelled

  const n = parseInt(String(ans).trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > party.length) {
    alert(`Please enter a number from 1 to ${party.length}.`);
    return choosePartyTarget(promptTitle);
  }

  return party[n - 1];
}

function renderTownScreen() {
  const hasSavedParty = !!loadSavedParty();
  const selectedDungeon = Town.dungeonId === "haunted-school" ? "The Haunted School" : Town.dungeonId;
  const partyHelp = hasSavedParty
    ? "Saved party reuses the most recently stored roster."
    : "No saved party found yet. Saved Party will fall back to New Party.";
  const spellingStyle = Town.diceMode === "spelling" ? "" : "display:none;";
  const loadedLabel = Town.spelling.loadedCount > 0
    ? `${Town.spelling.loadedCount} custom entries loaded.`
    : "Using the built-in spelling questions until a word list is loaded.";

  GameUI.setMonster({
    name: "Town",
    image: "images/Town.png",
    power: -1,
  });
  state.party = getSelectedParty();
  renderParty(state.party);

  GameUI.setStoryHtml(`
    <div class="town-screen">
      <div class="town-title">Town</div>
      <div class="town-copy">Prepare the next run. Dungeon progress resets here, but the saved party can carry over.</div>
      ${Town.lastExitMessage ? `<div class="town-status">${escapeHtml(Town.lastExitMessage)}</div>` : ""}

      <div class="town-grid">
        <label class="town-field">
          <span>Dungeon</span>
          <select id="town-dungeon">
            <option value="haunted-school"${Town.dungeonId === "haunted-school" ? " selected" : ""}>The Haunted School</option>
          </select>
        </label>

        <label class="town-field">
          <span>Party</span>
          <select id="town-party-mode">
            <option value="saved"${Town.partyMode === "saved" ? " selected" : ""}>Saved Party</option>
            <option value="new"${Town.partyMode === "new" ? " selected" : ""}>New Party</option>
          </select>
        </label>

        <label class="town-field">
          <span>Dice Rolls</span>
          <select id="town-dice-mode">
            <option value="random"${Town.diceMode === "random" ? " selected" : ""}>Random</option>
            <option value="spelling"${Town.diceMode === "spelling" ? " selected" : ""}>Vacab Quiz-Roll</option>
          </select>
        </label>
      </div>

      <div class="town-note">Current dungeon: ${escapeHtml(selectedDungeon)}.</div>
      <div class="town-note">${escapeHtml(partyHelp)}</div>

      <div id="town-spelling-panel" class="town-spelling" style="${spellingStyle}">
        <div class="town-subtitle">Vacab Quiz-Roll Settings</div>
        <label class="town-check">
          <input id="town-vnkeys" type="checkbox"${Town.spelling.enableVnKeys ? " checked" : ""} />
          <span>VNKeys mode</span>
        </label>
        <div id="town-wordlist-summary" class="town-note">${escapeHtml(loadedLabel)}</div>
        <div class="town-note">Each roll uses one spelling prompt, and the current combat or loot event is shown in the Action column.</div>
        <div class="town-file-row">
          <input id="town-wordlist-file" type="file" accept=".txt,.tsv" />
          <button id="town-autoload-btn" type="button">Try auto-load DouLingoWords.txt</button>
        </div>
        <div id="town-wordlist-status" class="town-status">${escapeHtml(Town.spelling.status)}</div>
      </div>
    </div>
  `);

  const dungeonSelect = document.getElementById("town-dungeon");
  const partySelect = document.getElementById("town-party-mode");
  const diceSelect = document.getElementById("town-dice-mode");
  const vnkeysToggle = document.getElementById("town-vnkeys");
  const fileInput = document.getElementById("town-wordlist-file");
  const autoloadBtn = document.getElementById("town-autoload-btn");
  const spellingPanel = document.getElementById("town-spelling-panel");
  const statusEl = document.getElementById("town-wordlist-status");
  const summaryEl = document.getElementById("town-wordlist-summary");

  function refreshSpellingSummary() {
    const nextLabel = Town.spelling.loadedCount > 0
      ? `${Town.spelling.loadedCount} custom entries loaded.`
      : "Using the built-in spelling questions until a word list is loaded.";
    if (summaryEl) summaryEl.textContent = nextLabel;
    if (statusEl) statusEl.textContent = Town.spelling.status;
  }

  if (dungeonSelect) {
    dungeonSelect.addEventListener("change", (e) => {
      Town.dungeonId = e.target.value;
    });
  }

  if (partySelect) {
    partySelect.addEventListener("change", (e) => {
      Town.partyMode = e.target.value;
      state.party = getSelectedParty();
      renderParty(state.party);
    });
  }

  if (diceSelect) {
    diceSelect.addEventListener("change", (e) => {
      Town.diceMode = e.target.value;
      if (spellingPanel) {
        spellingPanel.style.display = Town.diceMode === "spelling" ? "grid" : "none";
      }
    });
  }

  if (vnkeysToggle) {
    vnkeysToggle.addEventListener("change", (e) => {
      Town.spelling.enableVnKeys = e.target.checked;
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await loadTownWordListFromText(await file.text(), file.name);
      refreshSpellingSummary();
    });
  }

  if (autoloadBtn) {
    autoloadBtn.addEventListener("click", async () => {
      Town.spelling.status = "Loading DouLingoWords.txt...";
      refreshSpellingSummary();
      await autoLoadTownWordList();
      refreshSpellingSummary();
    });
  }
}

async function doLoot() {
  const roll = await rollD6("Loot Roll");

  const hauntedSchoolJokes = [
    "You found some crayons, the warrior eats them.",
    "You found extra homework, but no-one volunteers to do it.",
    "You find a suspiciously warm lunch tray… it screams when you touch it.",
    "You open a locker. A ghostly note says: 'See me after death.'",
    "You pick up a hall pass. It’s stamped: DETENTION: ETERNITY.",
    "You discover a cursed bell schedule. Every period is 'Math'.",
  ];

  // Helper: apply stat changes + refresh UI
  function applyToCharacter(ch, fnApply) {
    fnApply(ch);
    // refresh UI bars/stats (you already have these)
    GameUI.setHP(ch.id, ch.hp, ch.hpMax);
    GameUI.setMP(ch.id, ch.mp, ch.mpMax);
    // Optional: if you display weapon/armor on the party tile, re-render party:
    // renderParty(state.party);
  }

  // Outcomes
  if (roll === 1) {
    setStory("Loot found: **Health Potion** (+1 max HP, +1 current HP).");
    const target = choosePartyTarget("Who drinks the Health Potion?");
    if (!target) { setStory("You leave it behind."); return; }

    const beforeMax = target.hpMax;
    const beforeHP  = target.hp;

    applyToCharacter(target, (ch) => {
      ch.hpMax = (ch.hpMax || 0) + 1;
      ch.hp = Math.min(ch.hpMax, (ch.hp || 0) + 1);
    });

    setStory(`${target.name} drinks it. HP ${beforeHP}/${beforeMax} → ${target.hp}/${target.hpMax}.`);
    return;
  }

  if (roll === 2) {
    setStory("Loot found: **Mana Potion** (+1 max MP, +1 current MP).");
    const target = choosePartyTarget("Who drinks the Mana Potion?");
    if (!target) { setStory("You leave it behind."); return; }

    const beforeMax = target.mpMax;
    const beforeMP  = target.mp;

    applyToCharacter(target, (ch) => {
      ch.mpMax = (ch.mpMax || 0) + 1;
      ch.mp = Math.min(ch.mpMax, (ch.mp || 0) + 1);
    });

    setStory(`${target.name} drinks it. MP ${beforeMP}/${beforeMax} → ${target.mp}/${target.mpMax}.`);
    return;
  }

  if (roll === 3) {
    setStory("Loot found: **Weapon Upgrade** (+1 Weapon).");
    const target = choosePartyTarget("Who gets the Weapon Upgrade?");
    if (!target) { setStory("You leave it behind."); return; }

    const before = target.weapon || 0;

    applyToCharacter(target, (ch) => {
      ch.weapon = (ch.weapon || 0) + 1;
    });

    setStory(`${target.name}'s Weapon ${before} → ${target.weapon}.`);
    return;
  }

  if (roll === 4) {
    setStory("Loot found: **Armor Upgrade** (+1 Armor).");
    const target = choosePartyTarget("Who gets the Armor Upgrade?");
    if (!target) { setStory("You leave it behind."); return; }

    const before = target.armor || 0;

    applyToCharacter(target, (ch) => {
      ch.armor = (ch.armor || 0) + 1;
    });

    setStory(`${target.name}'s Armor ${before} → ${target.armor}.`);
    return;
  }

  if (roll === 5) {
    // Party gold is best stored on `state`, not inside the party array.
    if (typeof state.gold !== "number") state.gold = 0;

    const gain = await rollD6("Gold Found");
    state.gold += gain;

    setStory(`You found **gold**! +${gain} gold (party gold: ${state.gold}).`);
    return;
  }

  // roll === 6
  setStory("Nothing of value…");
  setStory(hauntedSchoolJokes[Math.floor(Math.random() * hauntedSchoolJokes.length)]);
}

// 4) Enter-state hooks: add buttons and leave TODO comments for future logic
const EnterHandlers = {
  [State.TOWN]: async function enter_TOWN() {
    renderTownScreen();
    setActions([
      makeAction("Enter Dungeon", async () => {
        state.party = getSelectedParty();
        renderParty(state.party);
        Town.lastExitMessage = "";
        resetDungeonProgress();
        GameUI.setStoryHtml("");
        await go(State.ROOM);
      }),
    ]);
  },

  [State.ROOM]: function enter_ROOM() {
    setStory("Now in " + Rooms[Game.room_index].name + " (room#"+Game.room_index+")");
	
    let actions = []
    
    if (!Rooms[Game.room_index].searched) { actions.push(makeAction("Search", async () => { setStory("You search the room finding: "); Rooms[Game.room_index].searched = true; await doLoot(); await go(State.ROOM); } )); }
    if (Game.room_index + 1 < Rooms.length) { actions.push(makeAction("Next Room", async () => { Game.can_leave_dungeon = false; applyCounters({ room_index: +1 }); await go(State.ROOM_ENTRY); })); }
    if (Game.room_index > 0) { actions.push(makeAction("Retreat", async () => { applyCounters({ room_index: -1 }); await go(State.ROOM_ENTRY); })); }
    actions.push(makeAction("Leave Dungeon", async () => { await leaveDungeon(); }));
	
    setActions(actions);
  },

  // Room Entry events
  [State.ROOM_ENTRY]: async function ROOM_ENTRY() {
  Game.active_character = 0;
	if (Rooms[Game.room_index].monster_present !== false)
	{
		setStory("The party encounters a monster.");
		GameUI.setMonster(Rooms[Game.room_index].monster_present);
		await go(State.PLAYER_TURN);
	}
	else
	{
		setStory("The party enters '"+Rooms[Game.room_index].name+"'.");
		GameUI.setMonster(Rooms[Game.room_index]);
		await go(State.ROOM);
	}
  },

[State.PLAYER_TURN]: async function enter_PLAYER_TURN() {
  if (allPartyDead()) { await go(State.DEFEAT); return; }

  const mon = getMonster();
  if (!mon || !mon.power || mon.power <= 0) {
    setStory("No monster is present.");
    await go(State.ROOM);
    return;
  }

  // Determine who is acting
  if (typeof Game.active_character !== "number") Game.active_character = 0;
  const idx = nextLivingIndex(Game.active_character);
  if (idx < 0) { await go(State.DEFEAT); return; }

  Game.active_character = idx;
  const ch = state.party[idx];

  setStory(`Player turn: ${ch.name} (${ch.role})`);

  async function endThisCharacterTurn() {
    // advance to next living member; if none left in this round => monster turn
    const nextIdx = nextLivingIndex(idx + 1);
    if (nextIdx < 0 || nextIdx <= idx) {
      // wrapped around (or none), round is over
      Game.active_character = 0;
      await go(State.MONSTER_TURN);
    } else {
      Game.active_character = nextIdx;
      await go(State.PLAYER_TURN);
    }
  }

  function spendMP(amount) {
    ch.mp = Math.max(0, (ch.mp || 0) - amount);
    GameUI.setMP(ch.id, ch.mp, ch.mpMax);
  }

  function dealDamageToMonster(dmg) {
    mon.hp = Math.max(0, (mon.hp || 0) - dmg);
    GameUI.setMonsterHP(mon.hp, mon.hpMax);
  }

  async function doAttack(atk) {
  // Any non-guard action removes guarded state from that character
  ch.guarded = false;

  // ===== HEAL SPECIAL CASE =====
  if (atk.name === "Heal" || atk.dmg === "*") {
    const target = choosePartyTarget(`${ch.name} casts Heal. Who do you heal?`);
    if (!target) {
      setStory("Heal cancelled.");
      // Important: don't spend MP or advance turn if user cancels
      return;
    }

    const roll = await rollD6(`Heal Roll: ${ch.name} -> ${target.name}`);
    const bonus = (ch.lvl || 0);
    const amount = roll + bonus;

    // spend MP
    spendMP(atk.mp_cost || 0);

    const before = target.hp || 0;
    target.hp = Math.min(target.hpMax || 0, before + amount);
    GameUI.setHP(target.id, target.hp, target.hpMax);

    logLines([
      `${ch.name} uses Heal on ${target.name}.`,
      `Heal roll: ${roll} + lvl:${bonus} = ${amount}`,
      `${target.name} HP: ${before}/${target.hpMax} → ${target.hp}/${target.hpMax}`
    ]);

    await endThisCharacterTurn();
    return;
  }

    const roll = await rollD6(`${ch.name}: ${atk.name} vs ${mon.name}`);
    let total = roll;

    const isStrike = atk.name === "Strike";
    if (isStrike) {
      total += (ch.weapon || 0);
      if (ch.role === "Warrior") total += (ch.lvl || 0);
      if (ch.role === "Cleric") total += Math.floor((ch.lvl || 0) / 2);
    } else {
      total += (ch.lvl || 0);
    }

    spendMP(atk.mp_cost || 0);

    logLines([
      `${ch.name} uses ${atk.name} on ${mon.name}.`,
      `Attack roll: ${roll}` +
        (isStrike ? ` + weapon:${ch.weapon || 0}` : ` + lvl:${ch.lvl || 0}`) +
        (ch.role === "Warrior" && isStrike ? ` + warrior_lvl:${ch.lvl || 0}` : ``) +
        (ch.role === "Cleric" && isStrike ? ` + cleric_half_lvl:${Math.floor((ch.lvl || 0) / 2)}` : ``) +
        ` = ${total} vs monster_power:${mon.power}`
    ]);

    if (total >= mon.power) {
      const dmg = Number(atk.dmg);
      dealDamageToMonster(dmg);
      logLines([`${mon.name} takes ${dmg} damage.`]);
      if (mon.hp <= 0) {
        setStory(`${mon.name} is defeated!`);
        await go(State.VICTORY);
        return;
      }
    } else {
      logLines([`Miss! ${mon.name} takes no damage.`]);
    }

    await endThisCharacterTurn();
  }

  // Build action buttons for THIS character
  const actions = [];

  // Retreat only for the first character in the list (index 0), TODO: what if rogue dies?
  if (idx === 0) {
    actions.push(makeAction("Retreat", async () => {
      setStory("You retreat to the last room.");
      applyCounters({ room_index: -1 });
      Game.can_leave_dungeon = true;
      // Clear guarding when leaving combat (optional but sane)
      for (const p of state.party) p.guarded = false;
      Game.active_character = 0;
      await go(State.ROOM_ENTRY);
    }));
  }

  // Guard action for everyone
  actions.push(makeAction("Guard", async () => {
    ch.guarded = true;
    logLines([
      `${ch.name} guards.`,
      `Guard effect: +1 defense until ${ch.name} takes another action.`
    ]);
    await endThisCharacterTurn();
  }));

  // Attack actions (only if mp is sufficient)
  for (const atk of (ch.attacks || [])) {
    const cost = atk.mp_cost || 0;
    if ((ch.mp || 0) >= cost) {
      actions.push(makeAction(atk.name, async () => doAttack(atk)));
    }
  }

  setActions(actions);
},

[State.MONSTER_TURN]: async function enter_MONSTER_TURN() {
  setActions([]); // no buttons during monster resolution

  const mon = getMonster();
  if (!mon || !mon.power || mon.power <= 0) {
    setStory("No monster is present.");
    await go(State.ROOM);
    return;
  }

  setStory("--- The Monster Acts ---");

  // Monster attacks first N living party members in party order
  let attacked = 0;

  for (let i = 0; i < state.party.length && attacked < MONSTER_TARGETS; i++) {
    const ch = state.party[i];
    if (!ch || ch.hp <= 0) continue;

    attacked++;

    const roll = await rollD6(`Defense Roll: ${ch.name} vs ${mon.name}`);
    const armor = ch.armor || 0;
    const rogueBonus = (ch.role === "Rogue") ? (ch.lvl || 0) : 0;
    const guardedBonus = ch.guarded ? 1 : 0;
    const total = roll + armor + rogueBonus + guardedBonus;

    logLines([
      `The ${mon.name} attacks ${ch.name}.`,
      `Defense roll: ${roll} + armor:${armor}` +
        (rogueBonus ? ` + rogue_lvl:${rogueBonus}` : ``) +
        (guardedBonus ? ` + guarded:${guardedBonus}` : ``) +
        ` = ${total} vs monster_power:${mon.power}`
    ]);

    if (total <= mon.power) {
      ch.hp -= 1;
      GameUI.setHP(ch.id, ch.hp, ch.hpMax);
      logLines([`${ch.name} loses 1 HP.`]);
    } else {
      logLines([`${ch.name} loses no HP.`]);
    }
  }

  if (allPartyDead()) {
    await go(State.DEFEAT);
    return;
  }

  // After monster finishes, player's turn starts at first character again
  setStory("--- The Party Acts ---");
  Game.active_character = 0;
  await go(State.PLAYER_TURN);
},


  [State.VICTORY]: function enter_VICTORY() {
    GameUI.setMonster(Rooms[Game.room_index]);
    Rooms[Game.room_index].monster_present = false;
    const clearedDungeon = Game.room_index === Rooms.length - 1;
    if (clearedDungeon) {
      Game.can_leave_dungeon = true;
      setStory("Dean Diablo is finished. With the headmaster of horror defeated, the dungeon has been cleared of monsters.");
    }
    setStory("There's treasure here.");

    const actions = [
      makeAction("Take Loot", async () => { await doLoot(); await go(State.ROOM); }),
    ];

    if (clearedDungeon) {
      actions.push(makeAction("Leave Dungeon", async () => { await leaveDungeon(); }));
    }

    setActions(actions);
  },

  [State.DEFEAT]: function enter_DEFEAT() {
    setStory("The party was defeated.");
    setActions([
      makeAction("Start Over", () => { location.reload(); }),
    ]);
  },
};

// 5) Boot the state machine from the requested initial state & counters
async function startGameFlow() {
  resetDungeonProgress();
  await go(State.TOWN);
}
