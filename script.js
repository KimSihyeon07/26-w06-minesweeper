const DIFFICULTIES = {
      beginner: { name: "초급", edition: "BEGINNER", rows: 9, columns: 9, mines: 10 },
      intermediate: { name: "중급", edition: "INTERMEDIATE", rows: 16, columns: 16, mines: 40 },
      advanced: { name: "고급", edition: "ADVANCED", rows: 16, columns: 20, mines: 60 },
    };
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

    let cells = [];
    let currentDifficulty = DIFFICULTIES[difficultySelectElement.value];
    let gameState = "ready";
    let firstOpenedIndex = null;
    let elapsedSeconds = 0;
    let timerId = null;
    let explodedIndex = null;

    function createEmptyBoard() {
      return Array.from({ length: currentDifficulty.rows * currentDifficulty.columns }, () => ({
        mine: false,
        adjacentMines: 0,
        opened: false,
        flagged: false,
      }));
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

    function toggleFlag(index) {
      const cell = cells[index];
      if (cell.opened || gameState === "won" || gameState === "lost") return;
      cell.flagged = !cell.flagged;
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
      } else {
        statusElement.textContent = "모든 안전 구역을 찾았습니다";
        restartButton.textContent = "★";
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
      toggleFlag(Number(cellElement.dataset.index));
    });

    restartButton.addEventListener("click", resetGame);
    difficultySelectElement.addEventListener("change", () => {
      currentDifficulty = DIFFICULTIES[difficultySelectElement.value];
      updateDifficultyDisplay();
      resetGame();
    });

    updateDifficultyDisplay();
    resetGame();
