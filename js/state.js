// Global game state

const PARTY_SAVE_KEY = "gameforvietnamese.savedParty.v1";
const SPELLING_QUIZ_MODULE_VERSION = "20260324";
let spellingQuizApiPromise = null;

function cloneParty(party) {
  return structuredClone(party);
}

function loadSavedParty() {
  try {
    const raw = window.localStorage.getItem(PARTY_SAVE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== PARTY_BASE.length) return null;

    return cloneParty(parsed);
  } catch (err) {
    console.warn("Unable to load saved party.", err);
    return null;
  }
}

function getFreshParty() {
  return cloneParty(loadSavedParty() || PARTY_BASE);
}

function getSelectedParty() {
  if (Town.partyMode === "saved") {
    return cloneParty(loadSavedParty() || PARTY_BASE);
  }
  return cloneParty(PARTY_BASE);
}

function saveParty(party = state.party) {
  try {
    window.localStorage.setItem(PARTY_SAVE_KEY, JSON.stringify(cloneParty(party)));
    return true;
  } catch (err) {
    console.warn("Unable to save party.", err);
    return false;
  }
}

function resetDungeonProgress() {
  resetRooms();
  state.monster = {};
  state.actions = [];
  state.gold = 0;
  Game.state = State.ROOM;
  Game.room_index = 0;
  Game.clue_count = 0;
  Game.active_character = 0;
  Game.can_leave_dungeon = false;
}

async function leaveDungeon() {
  const saved = saveParty(state.party);
  resetDungeonProgress();
  Town.lastExitMessage = saved
    ? "The party leaves the dungeon and records their current lineup for the next expedition."
    : "The party leaves the dungeon, but their progress could not be saved on this browser.";
  await go(State.TOWN);
}

async function getSpellingQuizApi() {
  if (!spellingQuizApiPromise) {
    const url = new URL("./spellingQuiz.js", window.location.href);
    url.searchParams.set("v", SPELLING_QUIZ_MODULE_VERSION);
    spellingQuizApiPromise = import(url.href);
  }
  return spellingQuizApiPromise;
}

async function autoLoadTownWordList() {
  try {
    const api = await getSpellingQuizApi();
    const count = await api.tryAutoLoadQuestions("DouLingoWords.txt");
    Town.spelling.loadedCount = count;
    Town.spelling.status = `Loaded ${count} entries from DouLingoWords.txt via fetch().`;
  } catch (err) {
    Town.spelling.status = `Auto-load failed. Use the file picker or run a local server. Details: ${err.message}`;
  }
}

async function loadTownWordListFromText(text, fileName = "custom file") {
  try {
    const api = await getSpellingQuizApi();
    const parsed = api.parseDouLingoText(text);
    if (!parsed.length) {
      Town.spelling.status = "Could not parse any lines. Format must be answer<TAB>clue.";
      return false;
    }

    api.setQuestionBank(parsed);
    Town.spelling.loadedCount = parsed.length;
    Town.spelling.status = `Loaded ${parsed.length} entries from ${fileName}.`;
    return true;
  } catch (err) {
    Town.spelling.status = `Word list load failed: ${err.message}`;
    return false;
  }
}

async function rollD6For(label) {
  if (Town.diceMode !== "spelling") {
    return Promise.resolve(TestHooks.rollD6(label));
  }

  const api = await getSpellingQuizApi();
  const rolls = await api.showSpellingQuiz(1, [label], Town.spelling.enableVnKeys);
  return Number(rolls?.[0] ?? 1);
}

const state = {
  monster: {},               // combat instance
  party: getFreshParty(),
  actions: [],               // current action buttons
  gold: 0,                   // created/used by loot
};

const Town = {
  dungeonId: "haunted-school",
  partyMode: loadSavedParty() ? "saved" : "new",
  diceMode: "random",
  spelling: {
    enableVnKeys: false,
    loadedCount: 0,
    status: "No custom word list loaded. The built-in quiz words will be used.",
  },
  lastExitMessage: "",
};
