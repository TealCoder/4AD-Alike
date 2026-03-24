/* =========================
   Smoke Tests
   Paste below DOMContentLoaded init() hook
   ========================= */

async function runSmokeTests() {
  const results = [];
  const origHooks = { ...TestHooks };

  // --- tiny test framework ---
  async function t(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log("✅", name);
      setStory(`✅ ${name}`);
    } catch (e) {
      results.push({ name, ok: false, err: e });
      console.error("❌", name, e);
      setStory(`❌ ${name}: ${e?.message || e}`);
    }
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || "Assertion failed");
  }

  function approxEq(a, b, msg) {
    if (a !== b) throw new Error(msg || `Expected ${a} === ${b}`);
  }

  function resetPartyToBaseline() {
    // Reset to your current baseline party setup
    state.party = cloneParty(PARTY_BASE);
    // re-render UI bars so setHP/setMP won't crash on missing DOM nodes
    renderParty(state.party);
  }

  function resetMonster(name = "Test Dummy", power = 4, hp = 10, hpMax = 10) {
    state.monster = { name, image: placeholderSVG(name), power, hp, hpMax };
    renderMonster(state.monster);
  }

  function sanityCheckParty() {
    for (const p of state.party) {
      assert(typeof p.id === "string", "party member missing id");
      assert(typeof p.hp === "number", "hp not number");
      assert(typeof p.hpMax === "number", "hpMax not number");
      assert(typeof p.mp === "number", "mp not number");
      assert(typeof p.mpMax === "number", "mpMax not number");
      assert(p.hp <= p.hpMax, `hp exceeds hpMax (${p.name})`);
      assert(p.mp <= p.mpMax, `mp exceeds mpMax (${p.name})`);
    }
  }

  function setRollQueue(arr, fallback = 6) {
    const q = arr.slice();
    TestHooks.rollD6 = () => (q.length ? q.shift() : fallback);
  }

  function setChooseTargetById(id) {
    TestHooks.choosePartyTarget = () => state.party.find(p => p.id === id);
  }

  function findAction(label) {
    const a = (state.actions || []).find(x => x.label === label);
    assert(a, `Action not found: ${label}`);
    return a;
  }

  async function runPlayerAction(label) {
    const a = findAction(label);
    await a.handler();
  }

  // --- start tests ---
  setStory("=== RUNNING SMOKE TESTS ===");

  await t("Boot sanity: state + UI wired", () => {
    assert(Array.isArray(state.party) && state.party.length === 4, "party not initialized");
    assert(typeof EnterHandlers[State.PLAYER_TURN] === "function", "PLAYER_TURN handler missing");
    assert(typeof EnterHandlers[State.MONSTER_TURN] === "function", "MONSTER_TURN handler missing");
  });

  await t("Loot #1 Health potion increments hpMax and hp on chosen target", async () => {
    resetPartyToBaseline();
    setChooseTargetById("p1");        // Cyra
    setRollQueue([1]);                // loot outcome 1
    const p = state.party[0];
    const beforeHP = p.hp, beforeMax = p.hpMax;
    await doLoot();
    approxEq(p.hpMax, beforeMax + 1, "hpMax not incremented");
    approxEq(p.hp, Math.min(p.hpMax, beforeHP + 1), "hp not incremented/clamped");
    sanityCheckParty();
  });

  await t("Loot #2 Mana potion increments mpMax and mp on chosen target", async () => {
    resetPartyToBaseline();
    setChooseTargetById("p3");        // Aeris
    setRollQueue([2]);                // loot outcome 2
    const p = state.party[2];
    const beforeMP = p.mp, beforeMax = p.mpMax;
    await doLoot();
    approxEq(p.mpMax, beforeMax + 1, "mpMax not incremented");
    approxEq(p.mp, Math.min(p.mpMax, beforeMP + 1), "mp not incremented/clamped");
    sanityCheckParty();
  });

  await t("Loot #3 Weapon upgrade increments weapon on chosen target", async () => {
    resetPartyToBaseline();
    setChooseTargetById("p2");        // Brann
    setRollQueue([3]);                // loot outcome 3
    const p = state.party[1];
    const before = p.weapon;
    await doLoot();
    approxEq(p.weapon, before + 1, "weapon not incremented");
    sanityCheckParty();
  });

  await t("Loot #4 Armor upgrade increments armor on chosen target", async () => {
    resetPartyToBaseline();
    setChooseTargetById("p4");        // Dru
    setRollQueue([4]);                // loot outcome 4
    const p = state.party[3];
    const before = p.armor;
    await doLoot();
    approxEq(p.armor, before + 1, "armor not incremented");
    sanityCheckParty();
  });

  await t("Loot #5 Gold creates state.gold and adds 1d6", async () => {
    resetPartyToBaseline();
    delete state.gold;
    setRollQueue([5, 6]);             // loot outcome 5, then gold gain = 6
    await doLoot();
    assert(typeof state.gold === "number", "state.gold not created");
    approxEq(state.gold, 6, "gold not added correctly");
  });

  await t("Loot #6 Joke path does not throw", async () => {
    resetPartyToBaseline();
    setRollQueue([6]);                // loot outcome 6
    await doLoot();
    sanityCheckParty();
  });

  await t("Monster hit reduces HP when defense total <= monster.power", async () => {
    resetPartyToBaseline();
    resetMonster("Test Ogre", 6, 10, 10); // power 6

    // Make sure first two living get hit:
    // For Cyra: roll=1 armor=0 rogue_lvl=1 guarded=false => total 2 <= 6 -> hit
    // For Brann: roll=1 armor=1 rogue_bonus=0 => total 2 <= 6 -> hit
    setRollQueue([1, 1]);
    const cyra = state.party[0], brann = state.party[1];
    const c0 = cyra.hp, b0 = brann.hp;

    await EnterHandlers[State.MONSTER_TURN]();

    approxEq(cyra.hp, c0 - 1, "Cyra did not lose 1 HP");
    approxEq(brann.hp, b0 - 1, "Brann did not lose 1 HP");
    sanityCheckParty();
  });

  await t("Monster miss does not reduce HP when defense total > monster.power", async () => {
    resetPartyToBaseline();
    resetMonster("Test Imp", 1, 10, 10); // power 1

    // Cyra defense: roll=6 + armor0 + rogue_lvl1 = 7 > 1 -> miss
    // Brann defense: roll=6 + armor1 = 7 > 1 -> miss
    setRollQueue([6, 6]);

    const cyra = state.party[0], brann = state.party[1];
    const c0 = cyra.hp, b0 = brann.hp;

    await EnterHandlers[State.MONSTER_TURN]();

    approxEq(cyra.hp, c0, "Cyra HP changed on miss");
    approxEq(brann.hp, b0, "Brann HP changed on miss");
    sanityCheckParty();
  });

  await t("Player Strike uses weapon (+ Warrior lvl) and spends MP correctly (Strike costs 0)", async () => {
    resetPartyToBaseline();
    resetMonster("Training Dummy", 4, 10, 10);

    // Force Brann to act by setting active_character to his index
    Game.active_character = 1;
    Game.state = State.PLAYER_TURN;

    // For Brann Strike:
    // roll=3 + weapon1 + warrior_lvl1 = 5 >= power4 -> hit for dmg 1
    setRollQueue([3]);

    const brann = state.party[1];
    const mon0 = state.monster.hp;
    const mp0 = brann.mp;

    await EnterHandlers[State.PLAYER_TURN]();
    await runPlayerAction("Strike");

    approxEq(state.monster.hp, mon0 - 1, "Monster did not take 1 dmg from Strike");
    approxEq(brann.mp, mp0, "Strike should not spend MP");
    sanityCheckParty();
  });

  await t("Player non-Strike attack adds lvl, spends MP, and deals dmg on hit", async () => {
    resetPartyToBaseline();
    resetMonster("Training Dummy", 4, 10, 10);

    // Cyra Back Stab (1mp): non-Strike => roll + lvl
    Game.active_character = 0;
    Game.state = State.PLAYER_TURN;

    // roll=4 + lvl1 = 5 >= power4 -> hit, dmg=2; mp_cost=1
    setRollQueue([4]);

    const cyra = state.party[0];
    const mon0 = state.monster.hp;
    const mp0 = cyra.mp;

    await EnterHandlers[State.PLAYER_TURN]();
    await runPlayerAction("Back Stab (1mp)");

    approxEq(state.monster.hp, mon0 - 2, "Monster did not take 2 dmg from Back Stab");
    approxEq(cyra.mp, mp0 - 1, "Back Stab should spend 1 MP");
    sanityCheckParty();
  });

  await t("Heal restores d6 + caster lvl (clamped), spends MP, and targets chosen character", async () => {
    resetPartyToBaseline();
    resetMonster("Training Dummy", 4, 10, 10);

    // Make Dru act
    Game.active_character = 3;
    Game.state = State.PLAYER_TURN;

    // Choose target: Aeris (p3), reduce Aeris HP first
    const aeris = state.party[2];
    aeris.hp = 1;
    GameUI.setHP(aeris.id, aeris.hp, aeris.hpMax);

    setChooseTargetById("p3");

    // Heal: roll=6 + lvl(1) = 7, Aeris max is 3, so should clamp to 3
    setRollQueue([6]);

    const dru = state.party[3];
    const mp0 = dru.mp;

    await EnterHandlers[State.PLAYER_TURN]();
    await runPlayerAction("Heal (1mp)");

    approxEq(aeris.hp, aeris.hpMax, "Heal did not clamp to hpMax");
    approxEq(dru.mp, mp0 - 1, "Heal should spend 1 MP");
    sanityCheckParty();
  });

  await t("Defeat transition when all party dead (MONSTER_TURN)", async () => {
    resetPartyToBaseline();
    resetMonster("Executioner", 6, 10, 10);

    // Set first two to 1 HP and others already dead so two hits kill last living
    state.party[0].hp = 1;
    state.party[1].hp = 1;
    state.party[2].hp = 0;
    state.party[3].hp = 0;

    // Two guaranteed hits
    setRollQueue([1, 1]);

    Game.state = State.MONSTER_TURN;
    await EnterHandlers[State.MONSTER_TURN]();

    assert(Game.state === State.DEFEAT, `Expected DEFEAT, got ${Game.state}`);
  });
  
  await t("Monster HP does NOT reset to full when transitioning into PLAYER_TURN via go()", async () => {
    resetPartyToBaseline();

    // Choose a room index that exists and has a monster_present slot
    const savedRoomIndex = Game.room_index;
    Game.room_index = 2;

    // Save/patch the room monster template for this test
    const savedMonsterPresent = Rooms[Game.room_index].monster_present;
    Rooms[Game.room_index].monster_present = {
      name: "Template Goblin",
      image: placeholderSVG("Template Goblin"),
      power: 4,
      hp: 3,
      hpMax: 3,
    };

    // Set current combat monster and deal damage to it
    state.monster = { ...Rooms[Game.room_index].monster_present };
    renderMonster(state.monster);

    GameUI.setMonsterHP(2, 3);
    approxEq(state.monster.hp, 2, "precondition: monster hp should be 2");

    // Now transition using go(), which triggers refreshMonsterPanelForCurrentState()
    Game.state = State.MONSTER_TURN;   // just to make the log nicer
    await go(State.PLAYER_TURN);

    // The bug was: hp becomes 3 here. We assert it stays 2.
    approxEq(state.monster.hp, 2, "monster hp reset during PLAYER_TURN transition");

    // restore room patch
    Rooms[Game.room_index].monster_present = savedMonsterPresent;
    Game.room_index = savedRoomIndex;
  });

  await t("saveParty persists party data and loadSavedParty restores it", () => {
    window.localStorage.removeItem(PARTY_SAVE_KEY);
    resetPartyToBaseline();

    state.party[0].hp = 2;
    state.party[1].weapon = 4;

    assert(saveParty(state.party) === true, "saveParty should report success");

    const loaded = loadSavedParty();
    assert(Array.isArray(loaded), "loaded party should be an array");
    approxEq(loaded[0].hp, 2, "saved hp was not restored");
    approxEq(loaded[1].weapon, 4, "saved weapon was not restored");
  });

  await t("Retreating one room enables Leave Dungeon in the room state", async () => {
    resetPartyToBaseline();
    resetRooms();

    Game.room_index = 2;
    Game.active_character = 0;
    Game.can_leave_dungeon = false;
    state.monster = { ...Rooms[2].monster_present };
    renderMonster(state.monster);

    await EnterHandlers[State.PLAYER_TURN]();
    await runPlayerAction("Retreat");

    assert(Game.room_index === 1, "retreat should move party back one room");
    assert(Game.can_leave_dungeon === true, "retreat should enable dungeon exit");

    await go(State.ROOM);
    findAction("Leave Dungeon");
  });

  await t("Final boss victory offers Leave Dungeon", () => {
    resetPartyToBaseline();
    resetRooms();

    Game.room_index = Rooms.length - 1;
    Game.can_leave_dungeon = false;
    EnterHandlers[State.VICTORY]();

    assert(Game.can_leave_dungeon === true, "final victory should enable dungeon exit");
    findAction("Leave Dungeon");
  });

  window.localStorage.removeItem(PARTY_SAVE_KEY);
  resetRooms();

  // Restore hooks
  TestHooks.rollD6 = origHooks.rollD6;
  TestHooks.choosePartyTarget = origHooks.choosePartyTarget;

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  setStory(`=== SMOKE TESTS DONE: ${passed} passed, ${failed} failed ===`);
  console.log(`=== SMOKE TESTS DONE: ${passed} passed, ${failed} failed ===`);

  return { passed, failed, results };
}

// optional convenience
window.runSmokeTests = runSmokeTests;
