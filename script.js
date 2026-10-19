const DIFFICULTIES = {
      beginner: { name: "초급", edition: "BEGINNER", rows: 9, columns: 9, mines: 10 },
      intermediate: { name: "중급", edition: "INTERMEDIATE", rows: 16, columns: 16, mines: 40 },
      advanced: { name: "고급", edition: "ADVANCED", rows: 16, columns: 20, mines: 60 },
    };
    const RECORDS_STORAGE_KEY = "field09-minesweeper-records-v1";
    const boardElement = document.querySelector("#board");
    const mineCounterElement = document.querySelector("#mine-counter");
    const timerElement = document.querySelector("#timer");
    const statusElement = document.querySelector("#status");
    const restartButton = document.querySelector("#restart");
    const difficultySelectElement = document.querySelector("#difficulty");
    const editionElement = document.querySelector("#edition");
    const boardSummaryElement = document.querySelector("#board-summary");
    const difficultyNameElement = document.querySelector("#difficulty-name");
    const areaSizeElement = document.querySelector("#area-size");
    const hazardCountElement = document.querySelector("#hazard-count");
    const rankingDifficultyElement = document.querySelector("#ranking-difficulty");
    const rankingListElement = document.querySelector("#ranking-list");
    const musicToggleElement = document.querySelector("#music-toggle");
    const musicStateElement = document.querySelector("#music-state");
    const soundToggleElement = document.querySelector("#sfx-toggle");
    const soundStateElement = document.querySelector("#sfx-state");

    let cells = [];
    let currentDifficulty = DIFFICULTIES[difficultySelectElement.value];
    let gameState = "ready";
    let firstOpenedIndex = null;
    let elapsedSeconds = 0;
    let timerId = null;
    let explodedIndex = null;
    let records = loadRecords();
    let audioContext = null;
    let musicIntervalId = null;
    let musicNoteIndex = 0;
    let musicEnabled = false;
    let soundEnabled = true;

    function createEmptyBoard() {
      return Array.from({ length: currentDifficulty.rows * currentDifficulty.columns }, () => ({
        mine: false,
        adjacentMines: 0,
        opened: false,
        flagged: false,
        questioned: false,
      }));
    }

    function loadRecords() {
      const savedRecords = Object.fromEntries(Object.keys(DIFFICULTIES).map((difficulty) => [difficulty, []]));

      try {
        const storedRecords = JSON.parse(window.localStorage.getItem(RECORDS_STORAGE_KEY) || "{}");
        for (const difficulty of Object.keys(DIFFICULTIES)) {
          if (!Array.isArray(storedRecords[difficulty])) continue;
          savedRecords[difficulty] = storedRecords[difficulty]
            .filter((record) => record && Number.isSafeInteger(record.seconds) && record.seconds >= 0 && typeof record.date === "string" && !Number.isNaN(Date.parse(record.date)))
            .sort((first, second) => first.seconds - second.seconds || first.date.localeCompare(second.date))
            .slice(0, 5);
        }
      } catch {
        return savedRecords;
      }

      return savedRecords;
    }

    function saveRecords() {
      try {
        window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
        return true;
      } catch {
        return false;
      }
    }

    function formatRecordTime(seconds) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
    }

    function renderRanking() {
      const difficultyKey = difficultySelectElement.value;
      rankingDifficultyElement.textContent = currentDifficulty.name;
      rankingListElement.replaceChildren();
      const difficultyRecords = records[difficultyKey] || [];

      if (difficultyRecords.length === 0) {
        const emptyEntry = document.createElement("li");
        emptyEntry.className = "ranking-empty";
        emptyEntry.textContent = "아직 승리 기록이 없습니다";
        rankingListElement.append(emptyEntry);
        return;
      }

      const dateFormatter = new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" });
      difficultyRecords.forEach((record, index) => {
        const entry = document.createElement("li");
        entry.className = "ranking-entry";

        const rank = document.createElement("span");
        rank.className = "ranking-rank";
        rank.textContent = String(index + 1).padStart(2, "0");

        const time = document.createElement("span");
        time.className = "ranking-time";
        time.textContent = formatRecordTime(record.seconds);

        const date = document.createElement("time");
        date.className = "ranking-date";
        date.dateTime = record.date;
        date.textContent = dateFormatter.format(new Date(record.date));

        entry.append(rank, time, date);
        rankingListElement.append(entry);
      });
    }

    function recordWin() {
      const difficultyKey = difficultySelectElement.value;
      records[difficultyKey].push({ seconds: elapsedSeconds, date: new Date().toISOString() });
      records[difficultyKey].sort((first, second) => first.seconds - second.seconds || first.date.localeCompare(second.date));
      records[difficultyKey] = records[difficultyKey].slice(0, 5);
      saveRecords();
      renderRanking();
    }

    function getAudioContext() {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) return null;

      try {
        if (audioContext === null) audioContext = new AudioContextConstructor();
        if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        return audioContext;
      } catch {
        return null;
      }
    }

    function playTone(frequency, duration = 0.14, waveform = "sine", volume = 0.035, startOffset = 0) {
      const context = getAudioContext();
      if (!context) return;

      const startTime = context.currentTime + startOffset;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      envelope.gain.setValueAtTime(0.0001, startTime);
      envelope.gain.exponentialRampToValueAtTime(volume, startTime + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.01);
    }

    function playSound(sound) {
      if (!soundEnabled) return;

      const sounds = {
        open: [[660, 0]],
        flag: [[390, 0]],
        question: [[470, 0]],
        clear: [[300, 0]],
        win: [[523, 0], [659, 0.12], [784, 0.24]],
        lost: [[220, 0], [165, 0.16]],
      };

      for (const [frequency, startOffset] of sounds[sound] || []) {
        playTone(frequency, 0.16, "sine", 0.035, startOffset);
      }
    }

    function startBackgroundMusic() {
      if (musicIntervalId !== null) return;
      const notes = [196, 246.94, 293.66, 246.94];
      const playNextNote = () => {
        playTone(notes[musicNoteIndex], 0.9, "sine", 0.012);
        musicNoteIndex = (musicNoteIndex + 1) % notes.length;
      };

      playNextNote();
      musicIntervalId = window.setInterval(playNextNote, 1100);
    }

    function stopBackgroundMusic() {
      if (musicIntervalId !== null) {
        window.clearInterval(musicIntervalId);
        musicIntervalId = null;
      }
    }

    function updateAudioControls() {
      musicToggleElement.setAttribute("aria-pressed", String(musicEnabled));
      musicToggleElement.setAttribute("aria-label", `배경 음악 ${musicEnabled ? "끄기" : "켜기"}`);
      musicToggleElement.title = `배경 음악 ${musicEnabled ? "끄기" : "켜기"}`;
      musicStateElement.textContent = musicEnabled ? "켬" : "끔";
      soundToggleElement.setAttribute("aria-pressed", String(soundEnabled));
      soundToggleElement.setAttribute("aria-label", `효과음 ${soundEnabled ? "끄기" : "켜기"}`);
      soundToggleElement.title = `효과음 ${soundEnabled ? "끄기" : "켜기"}`;
      soundStateElement.textContent = soundEnabled ? "켬" : "끔";
    }

    function getNeighborIndices(index) {
      const row = Math.floor(index / currentDifficulty.columns);
      const column = index % currentDifficulty.columns;
      const neighbors = [];

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          if (rowOffset === 0 && columnOffset === 0) continue;
          const neighborRow = row + rowOffset;
          const neighborColumn = column + columnOffset;
          if (neighborRow >= 0 && neighborRow < currentDifficulty.rows && neighborColumn >= 0 && neighborColumn < currentDifficulty.columns) {
            neighbors.push(neighborRow * currentDifficulty.columns + neighborColumn);
          }
        }
      }

      return neighbors;
    }

    function placeMines(safeIndex) {
      const safeIndices = new Set([safeIndex, ...getNeighborIndices(safeIndex)]);
      const candidates = cells
        .map((_, index) => index)
        .filter((index) => !safeIndices.has(index));

      for (let index = candidates.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [candidates[index], candidates[randomIndex]] = [candidates[randomIndex], candidates[index]];
      }

      for (const index of candidates.slice(0, currentDifficulty.mines)) {
        cells[index].mine = true;
      }

      cells.forEach((cell, index) => {
        if (!cell.mine) {
          cell.adjacentMines = getNeighborIndices(index).filter((neighbor) => cells[neighbor].mine).length;
        }
      });
    }

    function startTimer() {
      if (timerId !== null) return;
      timerId = window.setInterval(() => {
        elapsedSeconds += 1;
        renderTimer();
      }, 1000);
    }

    function stopTimer() {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    }

    function renderTimer() {
      timerElement.textContent = String(elapsedSeconds).padStart(3, "0");
      timerElement.setAttribute("aria-label", `경과 시간 ${elapsedSeconds}초`);
    }

    function renderCell(index) {
      const cell = cells[index];
      const element = boardElement.children[index];
      element.className = "cell";
      element.removeAttribute("data-number");
      element.textContent = "";

      if (cell.opened) {
        element.classList.add("opened");
        if (cell.mine) {
          element.classList.add(index === explodedIndex ? "exploded" : "mine");
          element.textContent = "✹";
          element.setAttribute("aria-label", `행 ${Math.floor(index / currentDifficulty.columns) + 1}, 열 ${index % currentDifficulty.columns + 1}, 지뢰`);
        } else if (cell.adjacentMines > 0) {
          element.dataset.number = String(cell.adjacentMines);
          element.textContent = String(cell.adjacentMines);
          element.setAttribute("aria-label", `행 ${Math.floor(index / currentDifficulty.columns) + 1}, 열 ${index % currentDifficulty.columns + 1}, 주변 지뢰 ${cell.adjacentMines}개`);
        } else {
          element.setAttribute("aria-label", `행 ${Math.floor(index / currentDifficulty.columns) + 1}, 열 ${index % currentDifficulty.columns + 1}, 빈 칸`);
        }
      } else if (cell.flagged) {
        element.classList.add("flagged");
        element.textContent = "⚑";
        element.setAttribute("aria-label", `행 ${Math.floor(index / currentDifficulty.columns) + 1}, 열 ${index % currentDifficulty.columns + 1}, 깃발 표시`);
      } else if (cell.questioned) {
        element.classList.add("questioned");
        element.textContent = "?";
        element.setAttribute("aria-label", `행 ${Math.floor(index / currentDifficulty.columns) + 1}, 열 ${index % currentDifficulty.columns + 1}, 물음표 표시`);
      } else {
        element.setAttribute("aria-label", `행 ${Math.floor(index / currentDifficulty.columns) + 1}, 열 ${index % currentDifficulty.columns + 1}, 닫힌 칸`);
      }

      element.setAttribute("aria-pressed", String(cell.opened || cell.flagged));
    }

    function renderMineCounter() {
      const flagCount = cells.filter((cell) => cell.flagged).length;
      mineCounterElement.textContent = String(currentDifficulty.mines - flagCount);
    }

    function renderAll() {
      cells.forEach((_, index) => renderCell(index));
      renderMineCounter();
      renderTimer();
    }

    function openCell(startIndex) {
      const firstCell = cells[startIndex];
      if (firstCell.opened || firstCell.flagged || gameState === "won" || gameState === "lost") return;
      firstCell.questioned = false;

      if (firstOpenedIndex === null) {
        firstOpenedIndex = startIndex;
        placeMines(startIndex);
        gameState = "playing";
        statusElement.textContent = "지뢰를 피해 안전 구역을 찾으세요";
        restartButton.textContent = "☻";
        startTimer();
      }

      if (firstCell.mine) {
        firstCell.opened = true;
        explodedIndex = startIndex;
        finishGame("lost");
        return;
      }

      playSound("open");

      const pending = [startIndex];
      const visited = new Set();

      while (pending.length > 0) {
        const index = pending.pop();
        if (visited.has(index)) continue;
        visited.add(index);

        const cell = cells[index];
        if (cell.opened || cell.flagged || cell.mine) continue;
        cell.opened = true;

        if (cell.adjacentMines === 0) {
          for (const neighbor of getNeighborIndices(index)) {
            if (!visited.has(neighbor)) pending.push(neighbor);
          }
        }
      }

      renderAll();
      const openedSafeCells = cells.filter((cell) => cell.opened && !cell.mine).length;
      if (openedSafeCells === currentDifficulty.rows * currentDifficulty.columns - currentDifficulty.mines) {
        finishGame("won");
      }
    }

    function cycleMark(index) {
      const cell = cells[index];
      if (cell.opened || gameState === "won" || gameState === "lost") return;

      if (!cell.flagged && !cell.questioned) {
        cell.flagged = true;
        playSound("flag");
      } else if (cell.flagged) {
        cell.flagged = false;
        cell.questioned = true;
        playSound("question");
      } else {
        cell.questioned = false;
        playSound("clear");
      }

      renderCell(index);
      renderMineCounter();
    }

    function finishGame(result) {
      gameState = result;
      stopTimer();

      if (result === "lost") {
        cells.forEach((cell) => {
          if (cell.mine) cell.opened = true;
        });
        statusElement.textContent = "지뢰를 밟았습니다";
        restartButton.textContent = "☹";
        playSound("lost");
      } else {
        statusElement.textContent = "모든 안전 구역을 찾았습니다";
        restartButton.textContent = "★";
        playSound("win");
        recordWin();
      }

      renderAll();
    }

    function resetGame() {
      stopTimer();
      cells = createEmptyBoard();
      gameState = "ready";
      firstOpenedIndex = null;
      elapsedSeconds = 0;
      explodedIndex = null;
      statusElement.textContent = "첫 칸을 열어 시작하세요";
      restartButton.textContent = "☺";
      createGrid();
      renderAll();
    }

    function updateDifficultyDisplay() {
      const { name, edition, rows, columns, mines } = currentDifficulty;
      editionElement.textContent = `${edition} EDITION · 001`;
      boardSummaryElement.textContent = `${rows * columns} CELLS / ${mines} MINES`;
      difficultyNameElement.textContent = `${name} 지뢰 지대`;
      areaSizeElement.textContent = `${rows} × ${columns}`;
      hazardCountElement.textContent = String(mines);
      boardElement.setAttribute("aria-label", `${rows}행 ${columns}열 지뢰찾기 격자`);
      renderRanking();
    }

    function createGrid() {
      boardElement.replaceChildren();
      boardElement.style.setProperty("--columns", currentDifficulty.columns);
      boardElement.style.setProperty("--rows", currentDifficulty.rows);
      const mobileBoardWidth = currentDifficulty.columns * 28 + (currentDifficulty.columns - 1) * 5;
      boardElement.parentElement.style.setProperty("--mobile-board-width", `${mobileBoardWidth}px`);
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < currentDifficulty.rows * currentDifficulty.columns; index += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cell";
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-pressed", "false");
        button.dataset.index = String(index);
        button.setAttribute("aria-rowindex", String(Math.floor(index / currentDifficulty.columns) + 1));
        button.setAttribute("aria-colindex", String(index % currentDifficulty.columns + 1));
        fragment.append(button);
      }
      boardElement.append(fragment);
    }

    boardElement.addEventListener("click", (event) => {
      const cellElement = event.target.closest(".cell");
      if (!cellElement || !boardElement.contains(cellElement)) return;
      openCell(Number(cellElement.dataset.index));
    });

    boardElement.addEventListener("contextmenu", (event) => {
      const cellElement = event.target.closest(".cell");
      if (!cellElement || !boardElement.contains(cellElement)) return;
      event.preventDefault();
      cycleMark(Number(cellElement.dataset.index));
    });

    restartButton.addEventListener("click", resetGame);
    musicToggleElement.addEventListener("click", () => {
      musicEnabled = !musicEnabled;
      if (musicEnabled) {
        startBackgroundMusic();
      } else {
        stopBackgroundMusic();
      }
      updateAudioControls();
    });
    soundToggleElement.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      updateAudioControls();
      if (soundEnabled) playSound("open");
    });
    difficultySelectElement.addEventListener("change", () => {
      currentDifficulty = DIFFICULTIES[difficultySelectElement.value];
      updateDifficultyDisplay();
      resetGame();
    });

    updateDifficultyDisplay();
    updateAudioControls();
    resetGame();
