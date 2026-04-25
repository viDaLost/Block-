import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* =========================================================
   Crystal Forge 3D — мобильный 3D block puzzle без backend
   ========================================================= */

// -------------------- Основные настройки игры --------------------
const GRID_SIZE = 8; // Здесь можно заменить на 10, чтобы получить поле 10×10.
const CELL_SIZE = 1;
const CELL_GAP = 0.075;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const BLOCK_HEIGHT = 0.78;
const MAX_PIXEL_RATIO = 2;
const STORAGE_KEYS = {
  best: 'crystalForge3d.bestScore',
  settings: 'crystalForge3d.settings'
};

const THEMES = {
  neon: {
    name: 'Neon',
    bgA: '#050716', bgB: '#101a34', scene: '#060a16',
    accent: '#35e7ff', accent2: '#9d6bff', good: '#66ffc6', bad: '#ff536f',
    board: '#131d37', tile: '#202d4c', tileLine: '#3b4e7c',
    blocks: ['#35e7ff', '#9d6bff', '#ff4fb8', '#7dffb2', '#ffce4a', '#ff7a59', '#59a7ff', '#f7ff6a', '#c56bff', '#4dffd8']
  },
  crystal: {
    name: 'Crystal',
    bgA: '#061321', bgB: '#153b58', scene: '#071421',
    accent: '#8cf7ff', accent2: '#d7f8ff', good: '#b8fff0', bad: '#ff6684',
    board: '#183349', tile: '#24516a', tileLine: '#6fcce8',
    blocks: ['#8cf7ff', '#b4fff2', '#d7f8ff', '#79b9ff', '#caa8ff', '#ffb7ef', '#9fffcb', '#fff59a', '#9fb7ff', '#ffffff']
  },
  lava: {
    name: 'Lava',
    bgA: '#120606', bgB: '#35100f', scene: '#140808',
    accent: '#ff8a2a', accent2: '#ff335c', good: '#ffd166', bad: '#ff335c',
    board: '#2a1514', tile: '#4a201d', tileLine: '#ff8a2a',
    blocks: ['#ff8a2a', '#ff335c', '#ffd166', '#ff5e1a', '#ffb84d', '#ff2a8a', '#ffef5a', '#d94a2b', '#ff6f3c', '#ffa600']
  },
  ice: {
    name: 'Ice',
    bgA: '#031019', bgB: '#12314a', scene: '#071924',
    accent: '#71d7ff', accent2: '#b6e8ff', good: '#b8fff0', bad: '#ff6d8d',
    board: '#123044', tile: '#1d4962', tileLine: '#89dfff',
    blocks: ['#71d7ff', '#b6e8ff', '#86ffc8', '#e3f7ff', '#7aa6ff', '#c7f6ff', '#a0ffef', '#d8ddff', '#ffffff', '#6ed4ff']
  },
  space: {
    name: 'Space',
    bgA: '#05040d', bgB: '#171033', scene: '#060411',
    accent: '#b36bff', accent2: '#ff5fd2', good: '#65ffd8', bad: '#ff4d6d',
    board: '#151128', tile: '#251b43', tileLine: '#7d55ff',
    blocks: ['#b36bff', '#ff5fd2', '#5ddcff', '#fff07a', '#8cffd1', '#ff8a5d', '#6b7cff', '#f76bff', '#72ff6b', '#ffffff']
  }
};

// -------------------- DOM --------------------
const sceneWrap = document.getElementById('sceneWrap');
const piecesTray = document.getElementById('piecesTray');
const scoreText = document.getElementById('scoreText');
const bestText = document.getElementById('bestText');
const comboBadge = document.getElementById('comboBadge');
const toast = document.getElementById('toast');
const dragGhostUi = document.getElementById('dragGhostUi');
const hintBubble = document.getElementById('hintBubble');

const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const settingsScreen = document.getElementById('settingsScreen');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const gameOverRestartBtn = document.getElementById('gameOverRestartBtn');
const continueBtn = document.getElementById('continueBtn');
const settingsBtn = document.getElementById('settingsBtn');
const startSettingsBtn = document.getElementById('startSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const soundToggle = document.getElementById('soundToggle');
const vibrationToggle = document.getElementById('vibrationToggle');
const qualitySelect = document.getElementById('qualitySelect');
const themeSelect = document.getElementById('themeSelect');
const finalScoreText = document.getElementById('finalScoreText');
const finalBestText = document.getElementById('finalBestText');

// -------------------- Three.js объекты --------------------
let scene, camera, renderer, raycaster, pointerNdc;
let boardGroup, tileGroup, blockGroup, ghostGroup, particleGroup;
let boardHitPlane;
let ambientLight, hemiLight, keyLight, pointLight;
let cellTileGeometry, blockGeometry, ghostBlockGeometry, particleGeometry;
let boardBase, boardBaseMaterial, tileMaterial, ghostGoodMaterial, ghostBadMaterial;
let boardPositions = [];
let clock = new THREE.Clock();
const animations = [];
const particles = [];
// Камера почти сверху: поле читается как настоящая мобильная puzzle-доска.
const baseCameraOffset = new THREE.Vector3(0, 10.8, 2.35);
const cameraTarget = new THREE.Vector3(0, 0, -0.15);
const desiredCameraPosition = new THREE.Vector3();
let boardPanGesture = null;
let cameraShake = { time: 0, duration: 0, strength: 0 };

// -------------------- Состояние игры --------------------
const savedSettings = loadSettings();
const state = {
  grid: createEmptyGrid(),
  pieces: [],
  score: 0,
  bestScore: Number(localStorage.getItem(STORAGE_KEYS.best) || 0),
  comboStreak: 0,
  multiplier: 1,
  gameStarted: false,
  gameOver: false,
  paused: true,
  locked: false,
  continueAvailable: true,
  activeDrag: null,
  themeName: savedSettings.themeName || 'neon',
  quality: savedSettings.quality || 'medium',
  sound: savedSettings.sound ?? true,
  vibration: savedSettings.vibration ?? true
};

// -------------------- Список фигур --------------------
// Чтобы добавить фигуру: добавь объект { name, weight, cells:[[row,col], ...] }.
// Координаты автоматически нормализуются, вращение не требуется.
const PIECE_LIBRARY = [
  { name: 'Single', weight: 16, cells: [[0, 0]] },
  { name: 'Duo H', weight: 13, cells: [[0, 0], [0, 1]] },
  { name: 'Duo V', weight: 13, cells: [[0, 0], [1, 0]] },
  { name: 'Tri H', weight: 10, cells: [[0, 0], [0, 1], [0, 2]] },
  { name: 'Tri V', weight: 10, cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'Line 4 H', weight: 5, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { name: 'Line 4 V', weight: 5, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { name: 'Line 5 H', weight: 2, cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { name: 'Line 5 V', weight: 2, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { name: 'Square 2', weight: 9, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { name: 'L Small', weight: 8, cells: [[0, 0], [1, 0], [1, 1]] },
  { name: 'L Small R', weight: 8, cells: [[0, 1], [1, 0], [1, 1]] },
  { name: 'L Tall', weight: 5, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { name: 'L Tall R', weight: 5, cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  { name: 'Corner 5', weight: 4, cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
  { name: 'Corner 5 R', weight: 4, cells: [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { name: 'T', weight: 6, cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { name: 'T Down', weight: 6, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
  { name: 'Z', weight: 4, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { name: 'S', weight: 4, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { name: 'Step', weight: 5, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { name: 'Step R', weight: 5, cells: [[0, 1], [1, 0], [1, 1], [2, 0]] },
  { name: 'Hook', weight: 6, cells: [[0, 0], [0, 1], [1, 0], [2, 0]] },
  { name: 'Hook R', weight: 6, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { name: 'Mini Plus', weight: 2, cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] }
].map((piece, index) => ({
  ...piece,
  id: `piece-${index}`,
  cells: normalizeCells(piece.cells)
}));

// -------------------- Запуск --------------------
initThree();
applySettingsToUI();
applyTheme(state.themeName);
applyQuality(state.quality);
resetGame(false);
wireUI();
animate();

// -------------------- Three.js: сцена, камера, renderer --------------------
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(THEMES[state.themeName].scene);
  scene.fog = new THREE.Fog(THEMES[state.themeName].scene, 14, 28);

  camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
  desiredCameraPosition.copy(cameraTarget).add(baseCameraOffset);
  camera.position.copy(desiredCameraPosition);
  camera.lookAt(cameraTarget);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sceneWrap.appendChild(renderer.domElement);

  raycaster = new THREE.Raycaster();
  pointerNdc = new THREE.Vector2();

  boardGroup = new THREE.Group();
  tileGroup = new THREE.Group();
  blockGroup = new THREE.Group();
  ghostGroup = new THREE.Group();
  particleGroup = new THREE.Group();
  scene.add(boardGroup, tileGroup, blockGroup, ghostGroup, particleGroup);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.62);
  hemiLight = new THREE.HemisphereLight(0xaadfff, 0x100820, 1.4);
  keyLight = new THREE.DirectionalLight(0xffffff, 2.25);
  keyLight.position.set(4, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -10;
  pointLight = new THREE.PointLight(THEMES[state.themeName].accent, 2.1, 14);
  pointLight.position.set(-3.5, 4.2, -4.8);
  scene.add(ambientLight, hemiLight, keyLight, pointLight);

  createGeometries();
  createBoard();
  createStarDust();
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Предотвращает прокрутку страницы на телефоне во время игры.
  document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
}

function createGeometries() {
  cellTileGeometry = new RoundedBoxGeometry(CELL_SIZE * 0.92, 0.11, CELL_SIZE * 0.92, 4, 0.10);
  blockGeometry = new RoundedBoxGeometry(CELL_SIZE * 0.82, BLOCK_HEIGHT, CELL_SIZE * 0.82, 5, 0.13);
  ghostBlockGeometry = new RoundedBoxGeometry(CELL_SIZE * 0.84, BLOCK_HEIGHT * 0.55, CELL_SIZE * 0.84, 4, 0.12);
  particleGeometry = new THREE.BoxGeometry(0.085, 0.085, 0.085);
}

function createBoard() {
  const theme = THEMES[state.themeName];
  boardPositions = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

  boardBaseMaterial = new THREE.MeshStandardMaterial({
    color: theme.board,
    metalness: 0.35,
    roughness: 0.55,
    emissive: theme.accent,
    emissiveIntensity: 0.035
  });

  tileMaterial = new THREE.MeshStandardMaterial({
    color: theme.tile,
    metalness: 0.28,
    roughness: 0.48,
    emissive: theme.tileLine,
    emissiveIntensity: 0.035
  });

  ghostGoodMaterial = new THREE.MeshStandardMaterial({
    color: theme.good,
    emissive: theme.good,
    emissiveIntensity: 0.65,
    transparent: true,
    opacity: 0.58,
    roughness: 0.35
  });

  ghostBadMaterial = new THREE.MeshStandardMaterial({
    color: theme.bad,
    emissive: theme.bad,
    emissiveIntensity: 0.58,
    transparent: true,
    opacity: 0.58,
    roughness: 0.35
  });

  const boardWidth = (GRID_SIZE - 1) * CELL_STEP + CELL_SIZE;
  const baseGeometry = new RoundedBoxGeometry(boardWidth + 0.72, 0.34, boardWidth + 0.72, 5, 0.22);
  boardBase = new THREE.Mesh(baseGeometry, boardBaseMaterial);
  boardBase.position.y = -0.16;
  boardBase.receiveShadow = true;
  boardGroup.add(boardBase);

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const position = cellToWorld(row, col, 0);
      boardPositions[row][col] = position;

      const tile = new THREE.Mesh(cellTileGeometry, tileMaterial);
      tile.position.copy(position);
      tile.receiveShadow = true;
      tile.userData = { row, col };
      tileGroup.add(tile);
    }
  }

  const hitSize = boardWidth + 0.85;
  boardHitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(hitSize, hitSize),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  boardHitPlane.rotateX(-Math.PI / 2);
  boardHitPlane.position.y = 0.42;
  boardHitPlane.userData.isHitPlane = true;
  scene.add(boardHitPlane);
}

function createStarDust() {
  const geometry = new THREE.BufferGeometry();
  const count = 90;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 21;
    positions[i * 3 + 1] = Math.random() * 6 + 0.8;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 21;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: THEMES[state.themeName].accent,
    size: 0.035,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'ambient-dust';
  scene.add(points);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);

  const aspect = width / height;
  const boardWorldSpan = (GRID_SIZE - 1) * CELL_STEP + CELL_SIZE + 1.25;
  let viewWidth;
  let viewHeight;

  // В портретной ориентации ширина экрана ограничивает поле сильнее всего.
  // Поэтому считаем ортографическую камеру от ширины, чтобы игрок всегда видел все 8×8 клеток.
  if (aspect < 1) {
    viewWidth = boardWorldSpan * 1.12;
    viewHeight = viewWidth / aspect;
  } else {
    viewHeight = boardWorldSpan * 1.16;
    viewWidth = viewHeight * aspect;
  }

  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
}


// -------------------- UI и события --------------------
function wireUI() {
  playBtn.addEventListener('click', () => startGame());
  pauseBtn.addEventListener('click', () => pauseGame());
  resumeBtn.addEventListener('click', () => resumeGame());
  restartBtn.addEventListener('click', () => restartFromMenu());
  gameOverRestartBtn.addEventListener('click', () => restartFromMenu());
  continueBtn.addEventListener('click', () => continueAfterGameOver());

  settingsBtn.addEventListener('click', () => openSettings());
  startSettingsBtn.addEventListener('click', () => openSettings());
  closeSettingsBtn.addEventListener('click', () => closeSettings());

  soundToggle.addEventListener('change', () => {
    state.sound = soundToggle.checked;
    saveSettings();
  });

  vibrationToggle.addEventListener('change', () => {
    state.vibration = vibrationToggle.checked;
    saveSettings();
  });

  qualitySelect.addEventListener('change', () => {
    state.quality = qualitySelect.value;
    applyQuality(state.quality);
    saveSettings();
  });

  themeSelect.addEventListener('change', () => {
    state.themeName = themeSelect.value;
    applyTheme(state.themeName);
    saveSettings();
    renderPieces();
  });

  renderer.domElement.addEventListener('pointerdown', onBoardPointerDown, { passive: false });
  renderer.domElement.addEventListener('dblclick', resetBoardPan, { passive: true });

  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: false });
  window.addEventListener('pointercancel', cancelDrag, { passive: false });
}

function applySettingsToUI() {
  bestText.textContent = String(state.bestScore);
  soundToggle.checked = state.sound;
  vibrationToggle.checked = state.vibration;
  qualitySelect.value = state.quality;
  themeSelect.value = state.themeName;
}

function setOverlay(element, visible) {
  element.classList.toggle('visible', visible);
}

function startGame() {
  ensureAudio();
  state.gameStarted = true;
  state.paused = false;
  setOverlay(startScreen, false);
  hintBubble.classList.remove('hidden');
  setTimeout(() => hintBubble.classList.add('hidden'), 2200);
}

function pauseGame() {
  if (!state.gameStarted || state.gameOver) return;
  state.paused = true;
  setOverlay(pauseScreen, true);
}

function resumeGame() {
  state.paused = false;
  setOverlay(pauseScreen, false);
}

function restartFromMenu() {
  setOverlay(pauseScreen, false);
  setOverlay(gameOverScreen, false);
  setOverlay(startScreen, false);
  resetGame(true);
  state.gameStarted = true;
  state.paused = false;
}

function openSettings() {
  const wasPlaying = state.gameStarted && !state.gameOver && !state.paused;
  settingsScreen.dataset.wasPlaying = wasPlaying ? 'true' : 'false';
  if (wasPlaying) state.paused = true;
  setOverlay(settingsScreen, true);
}

function closeSettings() {
  setOverlay(settingsScreen, false);
  if (settingsScreen.dataset.wasPlaying === 'true') state.paused = false;
}

// -------------------- Рендер нижних фигур --------------------
function renderPieces() {
  piecesTray.innerHTML = '';
  const theme = THEMES[state.themeName];

  state.pieces.forEach((piece, index) => {
    const card = document.createElement('button');
    card.className = 'piece-card spawn-in';
    card.type = 'button';
    card.style.animationDelay = `${index * 70}ms`;
    card.dataset.index = String(index);
    if (piece.placed) card.classList.add('used');
    if (!piece.placed && !canPieceFitAnywhere(piece)) {
      card.classList.add('disabled');
      card.title = 'Эта фигура сейчас не помещается';
    }

    const mini = createPieceMini(piece, theme.blocks[piece.colorIndex % theme.blocks.length], 'piece-mini');
    card.appendChild(mini);

    card.addEventListener('pointerdown', (event) => onPiecePointerDown(event, index), { passive: false });
    piecesTray.appendChild(card);
  });
}

function createPieceMini(piece, color, className = 'piece-mini') {
  const bounds = getPieceBounds(piece.cells);
  const mini = document.createElement('div');
  mini.className = className;
  mini.style.setProperty('--cols', String(bounds.cols));
  mini.style.setProperty('--rows', String(bounds.rows));
  mini.style.setProperty('--piece-color', color);

  // Нижние фигуры теперь рисуются строго сверху и в той же ориентации,
  // в которой они лягут на поле. Размер автоматически ужимается для длинных линий.
  const maxCells = Math.max(bounds.cols, bounds.rows);
  const isDrag = className.includes('drag');
  const available = isDrag ? 142 : (window.innerWidth <= 370 ? 74 : 88);
  const maxUnit = isDrag ? 28 : (window.innerWidth <= 370 ? 17 : 20);
  const unit = Math.max(isDrag ? 18 : 13, Math.min(maxUnit, Math.floor((available - (maxCells - 1) * 5) / maxCells)));
  mini.style.setProperty('--cell', `${unit}px`);

  const occupied = new Set(piece.cells.map(([r, c]) => `${r}:${c}`));
  for (let row = 0; row < bounds.rows; row++) {
    for (let col = 0; col < bounds.cols; col++) {
      const cell = document.createElement('span');
      if (occupied.has(`${row}:${col}`)) cell.className = 'piece-cell';
      else cell.style.visibility = 'hidden';
      mini.appendChild(cell);
    }
  }
  return mini;
}


function onPiecePointerDown(event, index) {
  event.preventDefault();
  if (!state.gameStarted || state.paused || state.gameOver || state.locked) return;

  const piece = state.pieces[index];
  if (!piece || piece.placed) return;

  ensureAudio();
  const theme = THEMES[state.themeName];
  const card = event.currentTarget;
  card.classList.add('used');

  dragGhostUi.innerHTML = '';
  dragGhostUi.appendChild(createPieceMini(piece, theme.blocks[piece.colorIndex % theme.blocks.length], 'drag-piece-mini'));
  dragGhostUi.classList.remove('hidden');

  state.activeDrag = {
    pointerId: event.pointerId,
    piece,
    index,
    card,
    hover: null
  };
  updateDragGhostPosition(event.clientX, event.clientY);
  updateBoardHover(event.clientX, event.clientY);
}

function onPointerMove(event) {
  if (state.activeDrag) {
    if (event.pointerId !== state.activeDrag.pointerId) return;
    event.preventDefault();
    updateDragGhostPosition(event.clientX, event.clientY);
    updateBoardHover(event.clientX, event.clientY);
    return;
  }

  if (boardPanGesture && event.pointerId === boardPanGesture.pointerId) {
    event.preventDefault();
    updateBoardPan(event.clientX, event.clientY);
  }
}

function onPointerUp(event) {
  if (state.activeDrag) {
    if (event.pointerId !== state.activeDrag.pointerId) return;
    event.preventDefault();

    const drag = state.activeDrag;
    const hover = drag.hover;
    clearGhostPreview();
    dragGhostUi.classList.add('hidden');
    state.activeDrag = null;

    if (hover?.valid) {
      placePiece(drag.piece, drag.index, hover.row, hover.col);
    } else {
      drag.card.classList.remove('used');
      playSound('error');
      vibrate(34);
    }
    return;
  }

  if (boardPanGesture && event.pointerId === boardPanGesture.pointerId) {
    event.preventDefault();
    endBoardPan();
  }
}

function cancelDrag() {
  if (!state.activeDrag) return;
  state.activeDrag.card.classList.remove('used');
  dragGhostUi.classList.add('hidden');
  clearGhostPreview();
  state.activeDrag = null;
  boardPanGesture = null;
}

function onBoardPointerDown(event) {
  if (state.activeDrag || event.button > 0) return;
  if (!state.gameStarted || state.gameOver || state.paused || state.locked) return;
  event.preventDefault();

  boardPanGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    targetX: cameraTarget.x,
    targetZ: cameraTarget.z
  };
  renderer.domElement.setPointerCapture?.(event.pointerId);
}

function updateBoardPan(clientX, clientY) {
  if (!boardPanGesture) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const viewWidth = camera.right - camera.left;
  const viewHeight = camera.top - camera.bottom;
  const dx = -((clientX - boardPanGesture.startX) / rect.width) * viewWidth;
  const dz = -((clientY - boardPanGesture.startY) / rect.height) * viewHeight * 0.72;

  cameraTarget.x = THREE.MathUtils.clamp(boardPanGesture.targetX + dx, -1.35, 1.35);
  cameraTarget.z = THREE.MathUtils.clamp(boardPanGesture.targetZ + dz, -1.55, 1.25);
}

function endBoardPan() {
  if (!boardPanGesture) return;
  renderer.domElement.releasePointerCapture?.(boardPanGesture.pointerId);
  boardPanGesture = null;
}

function resetBoardPan() {
  cameraTarget.set(0, 0, -0.15);
}

function updateDragGhostPosition(clientX, clientY) {
  // Смещаем фигуру выше пальца, чтобы палец не закрывал блоки.
  dragGhostUi.style.left = `${clientX}px`;
  dragGhostUi.style.top = `${clientY - 86}px`;
}

function updateBoardHover(clientX, clientY) {
  const drag = state.activeDrag;
  if (!drag) return;

  const hoverCell = pointerToBoardCell(clientX, clientY, drag.piece);
  if (!hoverCell) {
    drag.hover = null;
    clearGhostPreview();
    return;
  }

  const valid = canPlacePiece(drag.piece, hoverCell.row, hoverCell.col);
  drag.hover = { row: hoverCell.row, col: hoverCell.col, valid };
  showGhostPreview(drag.piece, hoverCell.row, hoverCell.col, valid);
}

function pointerToBoardCell(clientX, clientY, piece) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);

  const hit = raycaster.intersectObject(boardHitPlane, false)[0];
  if (!hit) return null;

  const rawCol = Math.round(hit.point.x / CELL_STEP + (GRID_SIZE - 1) / 2);
  const rawRow = Math.round(hit.point.z / CELL_STEP + (GRID_SIZE - 1) / 2);
  const bounds = getPieceBounds(piece.cells);
  const col = Math.round(rawCol - (bounds.cols - 1) / 2);
  const row = Math.round(rawRow - (bounds.rows - 1) / 2);

  // Даём возможность видеть красную подсветку частично за краями поля.
  if (row < -bounds.rows || col < -bounds.cols || row > GRID_SIZE || col > GRID_SIZE) return null;
  return { row, col };
}

function showGhostPreview(piece, startRow, startCol, valid) {
  clearGhostPreview();
  const material = valid ? ghostGoodMaterial : ghostBadMaterial;

  for (const [dr, dc] of piece.cells) {
    const row = startRow + dr;
    const col = startCol + dc;
    if (!isInside(row, col)) continue;

    const pos = cellToWorld(row, col, BLOCK_HEIGHT * 0.35 + 0.08);
    const cube = new THREE.Mesh(ghostBlockGeometry, material);
    cube.position.copy(pos);
    cube.castShadow = false;
    cube.receiveShadow = false;
    ghostGroup.add(cube);
  }
}

function clearGhostPreview() {
  while (ghostGroup.children.length) {
    const child = ghostGroup.children.pop();
    ghostGroup.remove(child);
  }
}

// -------------------- Игровая логика --------------------
function resetGame(withNewPieces = true) {
  clearAllBlocks();
  state.grid = createEmptyGrid();
  state.score = 0;
  state.comboStreak = 0;
  state.multiplier = 1;
  state.gameOver = false;
  state.locked = false;
  state.continueAvailable = true;
  state.pieces = generatePieceSet();
  updateScoreUI();
  renderPieces();
  clearGhostPreview();
  if (withNewPieces) playSound('clear');
}

async function placePiece(piece, pieceIndex, startRow, startCol) {
  if (state.locked || !canPlacePiece(piece, startRow, startCol)) return;
  state.locked = true;

  const theme = THEMES[state.themeName];
  const color = theme.blocks[piece.colorIndex % theme.blocks.length];
  const placedCells = [];

  for (let i = 0; i < piece.cells.length; i++) {
    const [dr, dc] = piece.cells[i];
    const row = startRow + dr;
    const col = startCol + dc;
    const mesh = createBlockMesh(color, piece.colorIndex);
    const pos = cellToWorld(row, col, 0.11 + BLOCK_HEIGHT / 2);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.18);
    mesh.userData = { row, col, colorIndex: piece.colorIndex };
    blockGroup.add(mesh);
    state.grid[row][col] = { mesh, colorIndex: piece.colorIndex };
    placedCells.push({ row, col, mesh });

    animateValue(260, (t) => {
      const bounce = easeOutBack(t);
      mesh.scale.setScalar(THREE.MathUtils.lerp(0.18, 1, bounce));
      mesh.position.y = pos.y + Math.sin(t * Math.PI) * 0.16;
    }, i * 32);
  }

  state.pieces[pieceIndex].placed = true;
  addScore(piece.cells.length * 10);
  playSound('place');
  vibrate(18);
  pulsePlacedCells(placedCells);

  await wait(300);
  const lines = findCompletedLines();

  if (lines.count > 0) {
    state.comboStreak += 1;
    state.multiplier = Math.min(5, 1 + (state.comboStreak - 1) * 0.5);
    const comboBonus = lines.count > 1 ? lines.count * 70 : 0;
    const lineScore = Math.round((lines.count * 120 + comboBonus) * state.multiplier);
    addScore(lineScore);
    showCombo(lines.count);
    clearCompletedLines(lines);
    playSound(lines.count > 1 ? 'combo' : 'clear');
    vibrate(lines.count > 1 ? [40, 30, 60] : 42);
    if (lines.count > 1) shakeCamera(0.16, 0.2);
    await wait(620);
  } else {
    state.comboStreak = 0;
    state.multiplier = 1;
  }

  if (state.pieces.every((p) => p.placed)) {
    state.pieces = generatePieceSet();
  }

  updateScoreUI();
  renderPieces();
  state.locked = false;

  if (!anyMoveAvailable()) {
    await wait(260);
    showGameOver();
  }
}

function createBlockMesh(color, colorIndex = 0) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.16,
    metalness: 0.06,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.16,
    transparent: true,
    opacity: 0.96
  });
  const mesh = new THREE.Mesh(blockGeometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.colorIndex = colorIndex;
  return mesh;
}

function pulsePlacedCells(cells) {
  cells.forEach(({ mesh }, index) => {
    animateValue(240, (t) => {
      mesh.rotation.y = Math.sin(t * Math.PI) * 0.08;
    }, index * 24, () => {
      mesh.rotation.y = 0;
    });
  });
}

function findCompletedLines() {
  const rows = [];
  const cols = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    if (state.grid[row].every(Boolean)) rows.push(row);
  }
  for (let col = 0; col < GRID_SIZE; col++) {
    let full = true;
    for (let row = 0; row < GRID_SIZE; row++) {
      if (!state.grid[row][col]) {
        full = false;
        break;
      }
    }
    if (full) cols.push(col);
  }

  const cellsMap = new Map();
  rows.forEach((row) => {
    for (let col = 0; col < GRID_SIZE; col++) cellsMap.set(`${row}:${col}`, { row, col });
  });
  cols.forEach((col) => {
    for (let row = 0; row < GRID_SIZE; row++) cellsMap.set(`${row}:${col}`, { row, col });
  });

  return { rows, cols, cells: [...cellsMap.values()], count: rows.length + cols.length };
}

function clearCompletedLines(lines) {
  const theme = THEMES[state.themeName];
  flashCompletedLines(lines);

  lines.cells.forEach(({ row, col }, index) => {
    const cell = state.grid[row][col];
    if (!cell?.mesh) return;
    const mesh = cell.mesh;
    state.grid[row][col] = null;

    const baseY = mesh.position.y;
    const baseScale = mesh.scale.x || 1;

    animateValue(520, (t) => {
      const glow = Math.sin(t * Math.PI);
      mesh.material.emissiveIntensity = 0.22 + glow * 1.15;
      mesh.position.y = baseY + glow * 0.46;
      const s = baseScale * (1 - easeInCubic(t));
      mesh.scale.setScalar(Math.max(0.01, s));
      mesh.rotation.x += 0.045;
      mesh.rotation.z += 0.032;
      if (t > 0.25 && t < 0.38) spawnParticles(mesh.position, theme.blocks[cell.colorIndex % theme.blocks.length]);
    }, index * 16, () => {
      blockGroup.remove(mesh);
      mesh.material.dispose?.();
    });
  });
}

function flashCompletedLines(lines) {
  if (!lines?.cells?.length) return;
  const theme = THEMES[state.themeName];

  lines.cells.forEach(({ row, col }, index) => {
    if (!isInside(row, col)) return;
    const flashGeometry = new THREE.PlaneGeometry(CELL_SIZE * 0.96, CELL_SIZE * 0.96);
    const material = new THREE.MeshBasicMaterial({
      color: theme.accent,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const flash = new THREE.Mesh(flashGeometry, material);
    flash.rotation.x = -Math.PI / 2;
    flash.position.copy(cellToWorld(row, col, 0.68));
    flash.scale.setScalar(0.6);
    ghostGroup.add(flash);

    animateValue(310, (t) => {
      const p = Math.sin(t * Math.PI);
      flash.scale.setScalar(0.6 + p * 0.62);
      flash.material.opacity = p * 0.72;
    }, index * 8, () => {
      ghostGroup.remove(flash);
      flash.geometry.dispose?.();
      flash.material.dispose?.();
    });
  });
}

function canPlacePiece(piece, startRow, startCol) {
  for (const [dr, dc] of piece.cells) {
    const row = startRow + dr;
    const col = startCol + dc;
    if (!isInside(row, col)) return false;
    if (state.grid[row][col]) return false;
  }
  return true;
}

function canPieceFitAnywhere(piece) {
  const bounds = getPieceBounds(piece.cells);
  for (let row = 0; row <= GRID_SIZE - bounds.rows; row++) {
    for (let col = 0; col <= GRID_SIZE - bounds.cols; col++) {
      if (canPlacePiece(piece, row, col)) return true;
    }
  }
  return false;
}

function anyMoveAvailable() {
  return state.pieces.some((piece) => !piece.placed && canPieceFitAnywhere(piece));
}

function generatePieceSet() {
  let set = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    set = createBalancedSet();
    if (set.some((piece) => canPieceFitAnywhere(piece))) return set;
  }

  const emergency = ['Single', 'Duo H', 'Duo V', 'L Small']
    .map((name) => clonePiece(PIECE_LIBRARY.find((piece) => piece.name === name)))
    .filter(Boolean);

  return [
    emergency.find((piece) => canPieceFitAnywhere(piece)) || clonePiece(PIECE_LIBRARY[0]),
    clonePiece(weightedRandomPiece()),
    clonePiece(weightedRandomPiece())
  ];
}

function createBalancedSet() {
  const pieces = [];
  let bigCount = 0;
  let longLineCount = 0;

  for (let i = 0; i < 3; i++) {
    let piece = clonePiece(weightedRandomPiece());
    const size = piece.cells.length;
    const bounds = getPieceBounds(piece.cells);
    const isLongLine = size >= 4 && (bounds.rows === 1 || bounds.cols === 1);

    if (size >= 5 && bigCount >= 1) piece = clonePiece(simpleRandomPiece());
    if (isLongLine && longLineCount >= 1) piece = clonePiece(simpleRandomPiece());

    if (piece.cells.length >= 5) bigCount += 1;
    const updatedBounds = getPieceBounds(piece.cells);
    if (piece.cells.length >= 4 && (updatedBounds.rows === 1 || updatedBounds.cols === 1)) longLineCount += 1;

    piece.colorIndex = Math.floor(Math.random() * THEMES[state.themeName].blocks.length);
    piece.placed = false;
    piece.instanceId = cryptoRandomId();
    pieces.push(piece);
  }
  return pieces;
}

function weightedRandomPiece() {
  const total = PIECE_LIBRARY.reduce((sum, piece) => sum + piece.weight, 0);
  let value = Math.random() * total;
  for (const piece of PIECE_LIBRARY) {
    value -= piece.weight;
    if (value <= 0) return piece;
  }
  return PIECE_LIBRARY[0];
}

function simpleRandomPiece() {
  const simple = PIECE_LIBRARY.filter((piece) => piece.cells.length <= 3);
  return simple[Math.floor(Math.random() * simple.length)];
}

function clonePiece(piece) {
  return {
    ...piece,
    cells: piece.cells.map(([row, col]) => [row, col]),
    colorIndex: Math.floor(Math.random() * THEMES[state.themeName].blocks.length),
    placed: false,
    instanceId: cryptoRandomId()
  };
}

// -------------------- Game Over и продолжение --------------------
function showGameOver() {
  state.gameOver = true;
  state.paused = true;
  updateBestScore();
  finalScoreText.textContent = String(state.score);
  finalBestText.textContent = String(state.bestScore);
  continueBtn.classList.toggle('hidden', !state.continueAvailable || countOccupiedCells() < 7);
  setOverlay(gameOverScreen, true);
  playSound('gameover');
  vibrate([50, 35, 80]);
}

function continueAfterGameOver() {
  if (!state.continueAvailable) return;
  state.continueAvailable = false;
  state.gameOver = false;
  state.paused = false;
  setOverlay(gameOverScreen, false);
  clearRandomBlocks(Math.min(12, Math.max(6, Math.floor(countOccupiedCells() * 0.28))));
  state.pieces = generatePieceSet();
  renderPieces();
  playSound('combo');
  vibrate([30, 20, 30]);
}

function clearRandomBlocks(amount) {
  const occupied = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (state.grid[row][col]) occupied.push({ row, col });
    }
  }
  shuffleArray(occupied);
  const selected = occupied.slice(0, amount);
  clearCompletedLines({ cells: selected, rows: [], cols: [], count: 0 });
}

// -------------------- Очки и UI --------------------
function addScore(points) {
  state.score += points;
  updateBestScore();
  updateScoreUI();
}

function updateBestScore() {
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(STORAGE_KEYS.best, String(state.bestScore));
  }
}

function updateScoreUI() {
  scoreText.textContent = String(state.score);
  bestText.textContent = String(state.bestScore);
  if (state.multiplier > 1) {
    comboBadge.textContent = `×${state.multiplier.toFixed(state.multiplier % 1 === 0 ? 0 : 1)}`;
    comboBadge.classList.remove('hidden');
  } else {
    comboBadge.classList.add('hidden');
  }
}

function showCombo(lineCount) {
  if (lineCount <= 0) return;
  const label = lineCount >= 3 ? 'МЕГА!' : lineCount >= 2 ? 'СУПЕР!' : 'ЛИНИЯ!';
  toast.textContent = state.multiplier > 1 ? `${label} ×${state.multiplier}` : label;
  toast.classList.remove('hidden');
  toast.style.animation = 'none';
  // Перезапуск CSS-анимации.
  void toast.offsetHeight;
  toast.style.animation = '';
  setTimeout(() => toast.classList.add('hidden'), 950);
}

// -------------------- Темы и качество --------------------
function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES.neon;
  const root = document.documentElement;
  root.style.setProperty('--bg-a', theme.bgA);
  root.style.setProperty('--bg-b', theme.bgB);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-2', theme.accent2);
  root.style.setProperty('--good', theme.good);
  root.style.setProperty('--bad', theme.bad);

  if (!scene) return;
  scene.background = new THREE.Color(theme.scene);
  scene.fog.color = new THREE.Color(theme.scene);
  pointLight.color = new THREE.Color(theme.accent);

  boardBaseMaterial?.color.set(theme.board);
  boardBaseMaterial?.emissive.set(theme.accent);
  tileMaterial?.color.set(theme.tile);
  tileMaterial?.emissive.set(theme.tileLine);
  ghostGoodMaterial?.color.set(theme.good);
  ghostGoodMaterial?.emissive.set(theme.good);
  ghostBadMaterial?.color.set(theme.bad);
  ghostBadMaterial?.emissive.set(theme.bad);

  scene.children.forEach((child) => {
    if (child.name === 'ambient-dust') child.material.color.set(theme.accent);
  });

  // Перекрашиваем уже поставленные кубики под новую тему.
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = state.grid[row]?.[col];
      if (!cell?.mesh) continue;
      const color = theme.blocks[cell.colorIndex % theme.blocks.length];
      cell.mesh.material.color.set(color);
      cell.mesh.material.emissive.set(color);
    }
  }
}

function applyQuality(quality) {
  const ratioByQuality = { low: 1, medium: 1.5, high: MAX_PIXEL_RATIO };
  const ratio = Math.min(window.devicePixelRatio, ratioByQuality[quality] || 1.5);
  renderer?.setPixelRatio(ratio);
  if (!renderer) return;

  const high = quality === 'high';
  const low = quality === 'low';
  renderer.shadowMap.enabled = !low;
  if (keyLight) keyLight.castShadow = !low;
  if (keyLight?.shadow?.mapSize) keyLight.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
}

// -------------------- Звук и вибрация --------------------
let audioContext = null;

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') audioContext.resume();
}

function playSound(type) {
  if (!state.sound) return;
  ensureAudio();

  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.value = 0.0001;
  master.connect(audioContext.destination);

  const presets = {
    place: [{ f: 360, t: 0 }, { f: 560, t: 0.055 }],
    error: [{ f: 170, t: 0 }, { f: 120, t: 0.07 }],
    clear: [{ f: 520, t: 0 }, { f: 760, t: 0.06 }, { f: 980, t: 0.12 }],
    combo: [{ f: 420, t: 0 }, { f: 660, t: 0.05 }, { f: 940, t: 0.10 }, { f: 1220, t: 0.16 }],
    gameover: [{ f: 260, t: 0 }, { f: 190, t: 0.12 }, { f: 130, t: 0.24 }]
  };

  const notes = presets[type] || presets.place;
  master.gain.exponentialRampToValueAtTime(0.085, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

  notes.forEach((note) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type === 'error' || type === 'gameover' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(note.f, now + note.t);
    gain.gain.setValueAtTime(0.0001, now + note.t);
    gain.gain.exponentialRampToValueAtTime(0.36, now + note.t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + 0.18);
    osc.connect(gain).connect(master);
    osc.start(now + note.t);
    osc.stop(now + note.t + 0.2);
  });
}

function vibrate(pattern) {
  if (!state.vibration || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

// -------------------- Частицы, анимации, render loop --------------------
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  updateAnimations(performance.now());
  updateParticles(delta);
  updateCameraShake(delta);

  // Поле не вращается само: top-down ориентация фигур всегда совпадает с превью в нижней панели.
  pointLight.intensity = 1.85 + Math.sin(elapsed * 1.15) * 0.18;

  renderer.render(scene, camera);
}

function animateValue(duration, update, delay = 0, complete) {
  animations.push({
    start: performance.now() + delay,
    duration,
    update,
    complete,
    done: false
  });
}

function updateAnimations(now) {
  for (let i = animations.length - 1; i >= 0; i--) {
    const animation = animations[i];
    if (now < animation.start) continue;
    const t = Math.min(1, (now - animation.start) / animation.duration);
    animation.update(t);
    if (t >= 1) {
      animation.complete?.();
      animations.splice(i, 1);
    }
  }
}

function spawnParticles(origin, color) {
  if (state.quality === 'low') return;
  const amount = state.quality === 'high' ? 10 : 6;
  for (let i = 0; i < amount; i++) {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new THREE.Mesh(particleGeometry, material);
    mesh.position.copy(origin);
    mesh.position.y += 0.12;
    mesh.scale.setScalar(THREE.MathUtils.randFloat(0.7, 1.25));
    particleGroup.add(mesh);
    particles.push({
      mesh,
      life: 0,
      maxLife: THREE.MathUtils.randFloat(0.48, 0.78),
      velocity: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(1.65),
        THREE.MathUtils.randFloat(0.8, 2.1),
        THREE.MathUtils.randFloatSpread(1.65)
      ),
      spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(5)
    });
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.life += delta;
    particle.velocity.y -= 3.2 * delta;
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    particle.mesh.rotation.x += particle.spin.x * delta;
    particle.mesh.rotation.y += particle.spin.y * delta;
    particle.mesh.rotation.z += particle.spin.z * delta;
    const alpha = 1 - particle.life / particle.maxLife;
    particle.mesh.material.opacity = Math.max(0, alpha);
    particle.mesh.scale.setScalar(Math.max(0.01, alpha));
    if (particle.life >= particle.maxLife) {
      particleGroup.remove(particle.mesh);
      particle.mesh.material.dispose?.();
      particles.splice(i, 1);
    }
  }
}

function shakeCamera(duration = 0.18, strength = 0.18) {
  cameraShake.time = duration;
  cameraShake.duration = duration;
  cameraShake.strength = strength;
}

function updateCameraShake(delta) {
  desiredCameraPosition.copy(cameraTarget).add(baseCameraOffset);

  if (cameraShake.time > 0) {
    cameraShake.time -= delta;
    const power = cameraShake.strength * (cameraShake.time / cameraShake.duration);
    camera.position.set(
      desiredCameraPosition.x + THREE.MathUtils.randFloatSpread(power),
      desiredCameraPosition.y + THREE.MathUtils.randFloatSpread(power * 0.55),
      desiredCameraPosition.z + THREE.MathUtils.randFloatSpread(power)
    );
  } else {
    camera.position.lerp(desiredCameraPosition, 0.16);
  }
  camera.lookAt(cameraTarget);
}


// -------------------- Вспомогательные функции --------------------
function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function clearAllBlocks() {
  while (blockGroup?.children.length) {
    const child = blockGroup.children.pop();
    blockGroup.remove(child);
    child.material?.dispose?.();
  }
  while (particleGroup?.children.length) {
    const child = particleGroup.children.pop();
    particleGroup.remove(child);
    child.material?.dispose?.();
  }
  particles.length = 0;
}

function cellToWorld(row, col, y = 0) {
  return new THREE.Vector3(
    (col - (GRID_SIZE - 1) / 2) * CELL_STEP,
    y,
    (row - (GRID_SIZE - 1) / 2) * CELL_STEP
  );
}

function normalizeCells(cells) {
  const minRow = Math.min(...cells.map(([row]) => row));
  const minCol = Math.min(...cells.map(([, col]) => col));
  return cells.map(([row, col]) => [row - minRow, col - minCol]);
}

function getPieceBounds(cells) {
  const rows = cells.map(([row]) => row);
  const cols = cells.map(([, col]) => col);
  return {
    rows: Math.max(...rows) + 1,
    cols: Math.max(...cols) + 1
  };
}

function isInside(row, col) {
  return row >= 0 && col >= 0 && row < GRID_SIZE && col < GRID_SIZE;
}

function countOccupiedCells() {
  let count = 0;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (state.grid[row][col]) count += 1;
    }
  }
  return count;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function easeInCubic(t) {
  return t * t * t;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function cryptoRandomId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
    themeName: state.themeName,
    quality: state.quality,
    sound: state.sound,
    vibration: state.vibration
  }));
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
  } catch {
    return {};
  }
}
