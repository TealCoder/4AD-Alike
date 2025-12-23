/* spellingQuiz.js
   Exports:
     - setQuestionBank(questionsArray)
     - tryAutoLoadQuestions(url)
     - parseDouLingoText(text)
     - showSpellingQuiz(numQuestions, actions?, enableVnKeys=false) -> Promise<number[]>
*/

let QUESTION_BANK = [
  { clue: "Feline pet", answer: "cat" },
  { clue: "Opposite of cold", answer: "hot" },
  { clue: "Baby dog", answer: "puppy" },
  { clue: "Color of grass", answer: "green" },
  { clue: "Star at the center of our solar system", answer: "sun" },
  { clue: "Day after Monday", answer: "tuesday" },
  { clue: "Frozen water", answer: "ice" },
  { clue: "Not old", answer: "new" },
  { clue: "Large body of water", answer: "ocean" },
  { clue: "Man's best friend", answer: "dog" },
  { clue: "To sleep lightly", answer: "nap" },
  { clue: "First month of the year", answer: "january" }
];

export function setQuestionBank(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return;
  QUESTION_BANK = arr
    .map(x => ({ answer: String(x.answer ?? ""), clue: String(x.clue ?? "") }))
    .filter(x => x.answer.trim() && x.clue.trim());
}

export function parseDouLingoText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const answer = parts[0].trim();
    const clue = parts[1].trim();
    if (!answer || !clue) continue;
    out.push({ answer, clue });
  }
  return out;
}

export async function tryAutoLoadQuestions(url) {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const parsed = parseDouLingoText(text);
  if (parsed.length === 0) throw new Error("Parsed 0 valid lines (needs answer<TAB>clue).");
  setQuestionBank(parsed);
  return parsed.length;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pickRandomQuestions(count) {
  const indices = Array.from(QUESTION_BANK.keys());
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).map(i => QUESTION_BANK[i]);
}

// Levenshtein edit distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

// Auto-5 rule: any overlap in letters/digits (ignoring spaces/punct)
function hasAnyAlnumOverlap(correctRaw, userRaw) {
  const c = (correctRaw || "").toLowerCase().match(/[a-z0-9]/g) || [];
  const u = (userRaw || "").toLowerCase().match(/[a-z0-9]/g) || [];
  if (c.length === 0 || u.length === 0) return false;
  const setC = new Set(c);
  for (const ch of u) if (setC.has(ch)) return true;
  return false;
}

// Remove spaces ONLY (punct stays)
function removeSpaces(s) {
  return String(s || "").replace(/\s+/g, "");
}

// Scoring:
// - punctuation counts
// - whitespace ignored entirely (removed before distance)
// - auto-5 if no alnum overlap
// - cap at 5
function computeMistakes(correctRaw, userRaw) {
  if (!hasAnyAlnumOverlap(correctRaw, userRaw)) return 5;
  const c = removeSpaces(correctRaw).toLowerCase();
  const u = removeSpaces(userRaw).toLowerCase();
  const d = levenshtein(c, u);
  return Math.min(5, d);
}

// Highlighting: diff on de-spaced strings; spaces never highlighted.
function highlightCorrectIgnoringSpaces(correctRaw, userRaw) {
  const correctChars = Array.from(String(correctRaw || ""));
  const correctNoSpace = correctChars.filter(ch => !/\s/.test(ch)).join("");
  const userNoSpace = removeSpaces(userRaw);

  const A = correctNoSpace.toLowerCase();
  const B = String(userNoSpace || "").toLowerCase();

  const m = A.length, n = B.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  let i = m, j = n;
  const mark = new Array(m).fill(false);

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      mark[i - 1] = true; i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      mark[i - 1] = true; i--;
    } else {
      j--;
    }
  }

  let k = 0;
  let html = "";
  for (const ch of correctChars) {
    if (/\s/.test(ch)) {
      html += escapeHtml(ch);
    } else {
      const isWrong = (k < mark.length) ? mark[k] : false;
      html += isWrong ? `<span class="mistake">${escapeHtml(ch)}</span>` : escapeHtml(ch);
      k++;
    }
  }
  return html || escapeHtml(correctRaw);
}

/* ---------------- VNKeys integration ---------------- */

let _vnkeysLoadPromise = null;

function loadScriptOnce(src) {
  if (_vnkeysLoadPromise) return _vnkeysLoadPromise;
  _vnkeysLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
  return _vnkeysLoadPromise;
}

function vnkeysAvailable() {
  return typeof window.VNKeys === "object" && typeof window.VNKeys.enable === "function";
}

function applyVnKeysToModal(overlayEl) {
  if (!vnkeysAvailable()) return;

  // 1) Rescan for [data-vnkeys]
  try { window.VNKeys.refresh(); } catch (_) {}

  // 2) Explicitly enable each input in this modal (works even if refresh() changes later)
  const inputs = overlayEl.querySelectorAll("input[data-vnkeys]");
  for (const input of inputs) {
    try { window.VNKeys.enable(input); } catch (_) {}
  }
}

// Inline cheatsheet (adapted from your vietTypeExample.html)
function telexCheatSheetHtml() {
  return `
  <section class="vnkeys-help" aria-label="Telex typing help">
    <h3>Telex Rules (Quick Reference)</h3>

    <div class="grid">
      <div class="row muted">Vowel modifiers</div><div></div>

      <div class="row"><div><span class="kbd">aa</span> → <strong>â</strong></div><div>Double the vowel to add a “hat” (â, ê, ô)</div></div>
      <div class="row"><div><span class="kbd">ee</span> → <strong>ê</strong></div><div></div></div>
      <div class="row"><div><span class="kbd">oo</span> → <strong>ô</strong></div><div></div></div>
      <div class="row"><div><span class="kbd">aw</span> → <strong>ă</strong></div><div><span class="kbd">w</span> adds “ă, ơ, ư”</div></div>
      <div class="row"><div><span class="kbd">ow</span> → <strong>ơ</strong></div><div></div></div>
      <div class="row"><div><span class="kbd">uw</span> → <strong>ư</strong></div><div></div></div>
      <div class="row"><div><span class="kbd">dd</span> → <strong>đ</strong></div><div><span class="kbd">d</span> + <span class="kbd">d</span> becomes “đ”</div></div>

      <div class="row spacer"><div class="muted">Tones</div><div></div></div>
      <div class="row"><div><span class="kbd">s</span> → <strong>´</strong> (sắc)</div><div><em>as</em> → <strong>á</strong></div></div>
      <div class="row"><div><span class="kbd">f</span> → <strong>\`</strong> (huyền)</div><div><em>af</em> → <strong>à</strong></div></div>
      <div class="row"><div><span class="kbd">r</span> → <strong>ˇ</strong> (hỏi)</div><div><em>ar</em> → <strong>ả</strong></div></div>
      <div class="row"><div><span class="kbd">x</span> → <strong>~</strong> (ngã)</div><div><em>ax</em> → <strong>ã</strong></div></div>
      <div class="row"><div><span class="kbd">j</span> → <strong>·</strong> (nặng)</div><div><em>aj</em> → <strong>ạ</strong></div></div>

      <div class="row spacer"><div class="muted">Combine freely</div><div></div></div>
      <div class="row"><div><em>aaws</em> → <strong>ắ</strong></div><div><em>oors</em> → <strong>ố</strong></div></div>
      <div class="row"><div><em>owr</em> → <strong>ở</strong></div><div><em>ddas</em> → <strong>đá</strong></div></div>
    </div>

    <div class="footer">
      <small class="muted">Tip: order doesn’t matter — the IME normalizes placement.</small>
      <div class="links">
        <a href="https://unikey.org/en/telex.html" target="_blank" rel="noopener">Full Telex table</a>
        <span class="sep">·</span>
        <a href="https://viettyping.com/telex" target="_blank" rel="noopener">Interactive demo</a>
      </div>
    </div>
  </section>`;
}

/**
 * showSpellingQuiz(numQuestions, actions?, enableVnKeys=false)
 * Returns Promise resolving to rolls array (6 - mistakes).
 *
 * If enableVnKeys is true:
 * - adds data-vnkeys to inputs
 * - loads ./VNKeys.patched.js (once)
 * - calls VNKeys.refresh() and VNKeys.enable(input) for the inputs
 * - shows Telex cheatsheet under the title
 */
export async function showSpellingQuiz(numQuestions, actions, enableVnKeys = false) {
  const max = QUESTION_BANK.length;
  const n = Math.max(1, Math.min(Number(numQuestions) || 1, max));
  const selected = pickRandomQuestions(n);
  const includeActionCol = Array.isArray(actions);

  let vnkeysLoadError = null;
  if (enableVnKeys) {
    try {
      await loadScriptOnce("./VNKeys.patched.js");
    } catch (e) {
      vnkeysLoadError = e;
    }
  }

  return new Promise((resolve) => {
    // Inject CSS once
    if (!document.getElementById("spq-styles")) {
      const style = document.createElement("style");
      style.id = "spq-styles";
      style.textContent = `
#quiz-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999}
.quiz-modal{background:#fff;padding:16px 20px;border-radius:10px;max-width:980px;width:95%;box-shadow:0 6px 16px rgba(0,0,0,.3);max-height:85vh;overflow:auto;font-family:Arial,sans-serif}
.quiz-modal h2{margin:0 0 8px}
.quiz-modal table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:14px}
.quiz-modal th,.quiz-modal td{border:1px solid #ccc;padding:6px;vertical-align:top}
.quiz-modal th{background:#f0f0f0}
.quiz-modal .user-answer input{width:100%;box-sizing:border-box}
.quiz-modal .correct-answer{font-family:monospace;white-space:pre-wrap}
.quiz-modal .mistake{color:red;font-weight:bold}
.quiz-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.total-mistakes{font-weight:bold}
.quiz-modal button{padding:6px 12px;cursor:pointer}

/* VNKeys help panel */
.vnkeys-help{margin:10px 0 12px;padding:10px;border:1px solid #ddd;border-radius:10px;background:#fafafa;font-size:12px;line-height:1.35}
.vnkeys-help h3{margin:0 0 6px;font-size:13px}
.vnkeys-help .grid{display:grid;grid-template-columns:1fr 2fr;gap:.45rem .9rem;align-items:baseline}
.vnkeys-help .row{display:contents}
.vnkeys-help .muted{color:#666}
.vnkeys-help .kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;background:#fff;border:1px solid #d1d5db;border-radius:.35rem;padding:.05rem .35rem;white-space:nowrap}
.vnkeys-help .spacer > div{margin-top:.2rem}
.vnkeys-help .footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
.vnkeys-help .links a{color:#2563eb;text-decoration:none}
.vnkeys-help .links a:hover{text-decoration:underline}
.vnkeys-help .sep{color:#999;margin:0 6px}
.vnkeys-error{margin:6px 0 0;color:#b00;font-size:12px}
`;
      document.head.appendChild(style);
    }

    const title = enableVnKeys ? "Spelling Quiz — VNKeys in effect" : "Spelling Quiz";

    const headerCells = ([
      includeActionCol ? `<th>Action</th>` : ``,
      `<th>Question</th>`,
      `<th>Your Answer</th>`,
      `<th>Real Answer</th>`,
      `<th>Mistakes</th>`,
      `<th>Roll</th>`
    ].filter(Boolean)).join("");

    const rowsHtml = selected.map((q, idx) => {
      const actionCell = includeActionCol ? `<td>${escapeHtml(actions[idx] ?? "")}</td>` : "";
      const vnAttr = enableVnKeys ? ` data-vnkeys` : "";
      return `
<tr data-index="${idx}">
  ${actionCell}
  <td>${escapeHtml(q.clue)}</td>
  <td class="user-answer"><input type="text" data-index="${idx}" autocomplete="off"${vnAttr}></td>
  <td class="correct-answer"></td>
  <td class="mistake-count" style="text-align:center;"></td>
  <td class="roll-cell" style="text-align:center;"></td>
</tr>`;
    }).join("");

    const vnkeysErrorHtml = (enableVnKeys && vnkeysLoadError)
      ? `<div class="vnkeys-error">VNKeys requested but failed to load: ${escapeHtml(vnkeysLoadError.message)}</div>`
      : "";

    const cheatsheetHtml = enableVnKeys ? telexCheatSheetHtml() : "";

    const overlay = document.createElement("div");
    overlay.id = "quiz-overlay";
    overlay.innerHTML = `
<div class="quiz-modal">
  <h2>${escapeHtml(title)}</h2>
  ${vnkeysErrorHtml}
  ${cheatsheetHtml}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="quiz-footer">
    <div class="total-mistakes">Total mistakes: <span id="total-mistakes">0</span></div>
    <div><button id="quiz-submit">Submit</button></div>
  </div>
</div>`;
    document.body.appendChild(overlay);

    // Activate VNKeys on these inputs if requested and loaded
    if (enableVnKeys && !vnkeysLoadError && vnkeysAvailable()) {
      applyVnKeysToModal(overlay);
    }

    const submitButton = overlay.querySelector("#quiz-submit");
    const totalMistakesSpan = overlay.querySelector("#total-mistakes");
    const tbody = overlay.querySelector("tbody");
    const firstInput = overlay.querySelector('input[data-index="0"]');

    let graded = false;
    const rolls = new Array(selected.length).fill(6);

    submitButton.addEventListener("click", () => {
      if (!graded) {
        let totalMistakes = 0;
        const rows = Array.from(tbody.querySelectorAll("tr[data-index]"));

        rows.forEach(row => {
          const idx = parseInt(row.getAttribute("data-index"), 10);
          const correct = selected[idx].answer;
          const input = row.querySelector('input[data-index]');
          const userAns = input.value;

          const mistakes = computeMistakes(correct, userAns);
          const roll = 6 - mistakes;

          rolls[idx] = roll;
          totalMistakes += mistakes;

          row.querySelector(".correct-answer").innerHTML = highlightCorrectIgnoringSpaces(correct, userAns);
          row.querySelector(".mistake-count").textContent = String(mistakes);
          row.querySelector(".roll-cell").textContent = String(roll);

          input.disabled = true;
        });

        totalMistakesSpan.textContent = String(totalMistakes);
        graded = true;
        submitButton.textContent = "OK";
      } else {
        overlay.remove();
        resolve(rolls);
      }
    });

    if (firstInput) firstInput.focus();
  });
}
