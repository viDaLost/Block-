// === КОНФИГУРАЦИЯ ИГРЫ ===
const GRID_SIZE = 8;
const CELL_SIZE = 1;
const GAP = 0.05;
const TOTAL_CELL_SIZE = CELL_SIZE + GAP;
const BOARD_OFFSET = (GRID_SIZE * TOTAL_CELL_SIZE) / 2 - (TOTAL_CELL_SIZE / 2);

const COLORS = [0x00F0FF, 0xFF0055, 0x00FF66, 0xFFE600, 0xB026FF];
const SHAPES = [
    [[1]], // Точка
    [[1,1]], // Линия 2
    [[1],[1]],
    [[1,1,1]], // Линия 3
    [[1],[1],[1]],
    [[1,1,1,1]], // Линия 4
    [[1],[1],[1],[1]],
    [[1,1],[1,1]], // Квадрат
    [[1,0],[1,1]], // Уголок малый
    [[0,1],[1,1]],
    [[1,1],[1,0]],
    [[1,1],[0,1]],
    [[1,1,1],[1,0,0],[1,0,0]], // L большая
    [[1,1,1],[0,0,1],[0,0,1]],
    [[1,1,1],[0,1,0]], // T
    [[0,1,0],[1,1,1]],
    [[1,0],[1,1],[1,0]],
    [[1,1,0],[0,1,1]], // Z
    [[0,1,1],[1,1,0]]
];

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let scene, camera, renderer;
let grid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(null));
let boardCells = []; // Визуальные клетки поля
let dockSlots = [null, null, null]; // 3 доступные фигуры
let activeShape = null;
let activeShapeSlotIndex = -1;

let score = 0;
let bestScore = localStorage.getItem('crystal_blocks_best') || 0;
let comboMultiplier = 1;

// Настройки
let isSoundEnabled = true;
let isVibrationEnabled = true;

// Управление
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2); // Плоскость для перетаскивания (y=2)
const touchOffset = new THREE.Vector3(0, 3, -1.5); // Смещение фигуры над пальцем
let isDragging = false;

// Анимации
let tweens = [];

// Аудио контекст (инициализируется после клика)
let audioCtx;

// === ИНИЦИАЛИЗАЦИЯ ===
function init() {
    const container = document.getElementById('game-container');
    
    // Сцена
    scene = new THREE.Scene();
    
    // Камера (Ортографическая лучше для пазлов, но перспективная дает глубину. Используем перспективную с узким FOV)
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    camera.position.set(0, 15, 12);
    camera.lookAt(0, 0, -2);

    // Рендерер
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Свет
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 15, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x45a29e, 1, 20);
    pointLight.position.set(0, 2, 5);
    scene.add(pointLight);

    // Создание поля
    createBoard();
    
    // События
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    // UI События
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-restart').addEventListener('click', startGame);
    
    document.getElementById('best-score').innerText = bestScore;

    // Цикл
    animate();
}

// === СОЗДАНИЕ ОБЪЕКТОВ ===
function createBoard() {
    const boardGroup = new THREE.Group();
    const cellGeo = new THREE.BoxGeometry(CELL_SIZE, 0.4, CELL_SIZE);
    
    // Скругляем немного углы программно или используем фаски (для оптимизации берем обычный Box + материал)
    const cellMat = new THREE.MeshStandardMaterial({ 
        color: 0x1f2833, 
        roughness: 0.7, 
        metalness: 0.3 
    });

    boardCells = [];
    for (let z = 0; z < GRID_SIZE; z++) {
        let row = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            const cell = new THREE.Mesh(cellGeo, cellMat);
            cell.position.set(
                x * TOTAL_CELL_SIZE - BOARD_OFFSET, 
                -0.2, 
                z * TOTAL_CELL_SIZE - BOARD_OFFSET
            );
            cell.receiveShadow = true;
            boardGroup.add(cell);
            row.push(cell);
        }
        boardCells.push(row);
    }
    scene.add(boardGroup);
    
    // Плоскость-подложка для кликов вне блоков
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshBasicMaterial({ visible: false });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.name = "floor";
    scene.add(floor);
}

function createShapeMesh(matrix, colorHex) {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
    
    // Премиум-материал "Кристалл/Пластик"
    const mat = new THREE.MeshPhysicalMaterial({
        color: colorHex,
        metalness: 0.1,
        roughness: 0.2,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2
    });

    let blocksCount = 0;
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                const block = new THREE.Mesh(geo, mat);
                block.position.set(c * TOTAL_CELL_SIZE, CELL_SIZE/2, r * TOTAL_CELL_SIZE);
                block.castShadow = true;
                block.receiveShadow = true;
                group.add(block);
                blocksCount++;
            }
        }
    }

    // Центрируем геометрию группы относительно её локального нуля
    const w = matrix[0].length * TOTAL_CELL_SIZE;
    const h = matrix.length * TOTAL_CELL_SIZE;
    group.children.forEach(child => {
        child.position.x -= (w / 2) - (TOTAL_CELL_SIZE / 2);
        child.position.z -= (h / 2) - (TOTAL_CELL_SIZE / 2);
    });

    group.userData = { matrix, colorHex, blocksCount };
    return group;
}

function spawnShapes() {
    let emptyCount = 0;
    for(let i=0; i<3; i++) {
        if(!dockSlots[i]) {
            const shapeDef = SHAPES[Math.floor(Math.random() * SHAPES.length)];
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            const mesh = createShapeMesh(shapeDef, color);
            
            // Позиционируем в "доке" (внизу экрана)
            const dockX = (i - 1) * 3.5;
            const dockZ = BOARD_OFFSET + 4.5;
            
            mesh.position.set(dockX, 0, dockZ);
            mesh.scale.set(0.01, 0.01, 0.01); // Для анимации появления
            
            scene.add(mesh);
            dockSlots[i] = mesh;
            mesh.userData.dockPos = new THREE.Vector3(dockX, 0, dockZ);
            mesh.userData.slotIndex = i;
            
            tweenProperty(mesh.scale, {x: 0.6, y: 0.6, z: 0.6}, 300);
            emptyCount++;
        }
    }
    
    if (emptyCount > 0) {
        checkGameOver();
    }
}

// === УПРАВЛЕНИЕ ===
function updateMousePos(event) {
    if (event.touches) {
        mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
    } else {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
}

function onPointerDown(event) {
    if(activeShape) return;
    updateMousePos(event);
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(dockSlots.filter(s => s !== null), true);

    if (intersects.length > 0) {
        let object = intersects[0].object;
        // Находим родительскую группу
        while(object.parent && object.parent.type === "Group") {
            object = object.parent;
        }
        
        activeShape = object;
        activeShapeSlotIndex = activeShape.userData.slotIndex;
        isDragging = true;
        
        // Поднимаем фигуру
        tweenProperty(activeShape.scale, {x: 1, y: 1, z: 1}, 150);
        playSound('pick');
        vibrate(15);
    }
}

function onPointerMove(event) {
    if (!isDragging || !activeShape) return;
    updateMousePos(event);
    
    raycaster.setFromCamera(mouse, camera);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, target);
    
    // Смещение, чтобы палец не закрывал фигуру
    target.add(touchOffset);
    
    // Плавное следование
    activeShape.position.lerp(target, 0.4);

    updateGridHighlight();
}

function onPointerUp(event) {
    if (!isDragging || !activeShape) return;
    isDragging = false;
    
    const dropData = getGridDropPosition();
    
    if (dropData && canPlaceShape(dropData.row, dropData.col, activeShape.userData.matrix)) {
        placeShape(dropData.row, dropData.col);
    } else {
        // Возврат в док
        const dockPos = activeShape.userData.dockPos;
        tweenProperty(activeShape.position, {x: dockPos.x, y: dockPos.y, z: dockPos.z}, 200, () => {
            if(activeShape) { // Если не успели взять снова
                tweenProperty(activeShape.scale, {x: 0.6, y: 0.6, z: 0.6}, 150);
            }
        });
        playSound('error');
        vibrate([30, 50, 30]);
        clearHighlight();
    }
    
    activeShape = null;
}

// === ЛОГИКА РАЗМЕЩЕНИЯ И ПОЛЯ ===
function getGridDropPosition() {
    if(!activeShape) return null;
    
    // Рассчитываем координаты верхнего левого угла матрицы на сетке
    const matrix = activeShape.userData.matrix;
    const w = matrix[0].length * TOTAL_CELL_SIZE;
    const h = matrix.length * TOTAL_CELL_SIZE;
    
    // Центр фигуры
    const px = activeShape.position.x;
    const pz = activeShape.position.z;
    
    // Приводим к сетке
    const originX = px - (w/2) + (TOTAL_CELL_SIZE/2);
    const originZ = pz - (h/2) + (TOTAL_CELL_SIZE/2);
    
    const col = Math.round((originX + BOARD_OFFSET) / TOTAL_CELL_SIZE);
    const row = Math.round((originZ + BOARD_OFFSET) / TOTAL_CELL_SIZE);
    
    return { row, col };
}

function canPlaceShape(startRow, startCol, matrix) {
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let gridR = startRow + r;
                let gridC = startCol + c;
                if (gridR < 0 || gridR >= GRID_SIZE || gridC < 0 || gridC >= GRID_SIZE) return false;
                if (grid[gridR][gridC] !== null) return false;
            }
        }
    }
    return true;
}

function updateGridHighlight() {
    clearHighlight();
    const pos = getGridDropPosition();
    if (!pos) return;
    
    const matrix = activeShape.userData.matrix;
    const canPlace = canPlaceShape(pos.row, pos.col, matrix);
    const color = canPlace ? 0x00ff00 : 0xff0000;
    
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let gridR = pos.row + r;
                let gridC = pos.col + c;
                if (gridR >= 0 && gridR < GRID_SIZE && gridC >= 0 && gridC < GRID_SIZE) {
                    boardCells[gridR][gridC].material.color.setHex(color);
                }
            }
        }
    }
}

function clearHighlight() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            boardCells[r][c].material.color.setHex(0x1f2833);
        }
    }
}

function placeShape(startRow, startCol) {
    const matrix = activeShape.userData.matrix;
    const colorHex = activeShape.userData.colorHex;
    
    clearHighlight();
    playSound('drop');
    vibrate(20);

    // Удаляем фигуру из сцены
    scene.remove(activeShape);
    dockSlots[activeShapeSlotIndex] = null;

    // Создаем отдельные кубики на поле
    const geo = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
    const mat = new THREE.MeshPhysicalMaterial({ color: colorHex, metalness: 0.1, roughness: 0.2 });

    let blocksAdded = 0;

    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c]) {
                let gridR = startRow + r;
                let gridC = startCol + c;
                
                const block = new THREE.Mesh(geo, mat);
                block.position.set(
                    gridC * TOTAL_CELL_SIZE - BOARD_OFFSET,
                    CELL_SIZE/2,
                    gridR * TOTAL_CELL_SIZE - BOARD_OFFSET
                );
                block.castShadow = true;
                block.receiveShadow = true;
                scene.add(block);
                grid[gridR][gridC] = block;
                blocksAdded++;
                
                // Анимация приземления
                block.position.y = 2;
                tweenProperty(block.position, {y: CELL_SIZE/2}, 150 + Math.random()*50, null, easeBounceOut);
            }
        }
    }

    addScore(blocksAdded * 10);
    checkLines();

    // Спавн новых если пусто
    if (!dockSlots[0] && !dockSlots[1] && !dockSlots[2]) {
        setTimeout(spawnShapes, 300);
    } else {
        setTimeout(checkGameOver, 300); // Проверяем на Game Over после каждого хода
    }
}

function checkLines() {
    let rowsToClear = [];
    let colsToClear = [];

    // Проверка строк
    for (let r = 0; r < GRID_SIZE; r++) {
        let full = true;
        for (let c = 0; c < GRID_SIZE; c++) {
            if (!grid[r][c]) full = false;
        }
        if (full) rowsToClear.push(r);
    }

    // Проверка колонок
    for (let c = 0; c < GRID_SIZE; c++) {
        let full = true;
        for (let r = 0; r < GRID_SIZE; r++) {
            if (!grid[r][c]) full = false;
        }
        if (full) colsToClear.push(c);
    }

    const totalLines = rowsToClear.length + colsToClear.length;

    if (totalLines > 0) {
        playSound('clear');
        vibrate([50, 30, 50]);
        
        if (totalLines >= 2) {
            showComboText();
            playSound('combo');
            comboMultiplier++;
        } else {
            comboMultiplier = 1;
        }

        let blocksCleared = 0;
        let blocksToRemove = new Set();

        rowsToClear.forEach(r => {
            for (let c = 0; c < GRID_SIZE; c++) blocksToRemove.add(`${r},${c}`);
        });
        colsToClear.forEach(c => {
            for (let r = 0; r < GRID_SIZE; r++) blocksToRemove.add(`${r},${c}`);
        });

        blocksToRemove.forEach(coord => {
            let [r, c] = coord.split(',').map(Number);
            let block = grid[r][c];
            if (block) {
                blocksCleared++;
                grid[r][c] = null;
                
                // Анимация исчезновения
                tweenProperty(block.scale, {x:0, y:0, z:0}, 300, () => {
                    scene.remove(block);
                    block.geometry.dispose();
                    block.material.dispose();
                });
            }
        });

        addScore(blocksCleared * 20 * comboMultiplier);
    } else {
        comboMultiplier = 1;
    }
}

function checkGameOver() {
    let canMove = false;
    
    // Проверяем каждую фигуру в доке
    for (let i = 0; i < 3; i++) {
        let shape = dockSlots[i];
        if (!shape) continue;
        
        let matrix = shape.userData.matrix;
        
        // Пытаемся приложить ко всем клеткам поля
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (canPlaceShape(r, c, matrix)) {
                    canMove = true;
                    break;
                }
            }
            if(canMove) break;
        }
        if(canMove) break;
    }

    if (!canMove) {
        gameOver();
    }
}

// === UI & GAME STATE ===
function addScore(points) {
    score += points;
    document.getElementById('current-score').innerText = score;
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('crystal_blocks_best', bestScore);
        document.getElementById('best-score').innerText = bestScore;
    }
}

function showComboText() {
    const el = document.getElementById('combo-text');
    el.classList.remove('hidden');
    // Force reflow
    void el.offsetWidth;
    el.classList.add('active');
    setTimeout(() => {
        el.classList.remove('active');
        setTimeout(() => el.classList.add('hidden'), 300);
    }, 1000);
}

function startGame() {
    initAudio();
    isSoundEnabled = document.getElementById('cb-sound').checked;
    isVibrationEnabled = document.getElementById('cb-vibration').checked;

    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-over-screen').classList.remove('active');
    
    // Очистка поля
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (grid[r][c]) {
                scene.remove(grid[r][c]);
                grid[r][c].geometry.dispose();
                grid[r][c].material.dispose();
                grid[r][c] = null;
            }
        }
    }

    // Очистка дока
    dockSlots.forEach(s => {
        if(s) {
            scene.remove(s);
            // чистим дочерние меши
            s.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
        }
    });
    dockSlots = [null, null, null];
    
    score = 0;
    comboMultiplier = 1;
    document.getElementById('current-score').innerText = score;
    
    spawnShapes();
}

function gameOver() {
    playSound('gameover');
    document.getElementById('final-score-val').innerText = score;
    document.getElementById('game-over-screen').classList.add('active');
}

// === ЗВУК И ВИБРАЦИЯ ===
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
    if (!isSoundEnabled || !audioCtx) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'pick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'drop') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'clear') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'combo') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.linearRampToValueAtTime(1600, now + 0.3);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'gameover') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.8);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
    }
}

function vibrate(pattern) {
    if (isVibrationEnabled && navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// === УТИЛИТЫ (Анимации и прочее) ===
function tweenProperty(obj, targets, duration, onComplete, ease = easeOutQuad) {
    const startValues = {};
    for (let key in targets) startValues[key] = obj[key];
    
    const startTime = performance.now();
    
    tweens.push({
        update: (time) => {
            let progress = (time - startTime) / duration;
            if (progress > 1) progress = 1;
            
            const easedProgress = ease(progress);
            
            for (let key in targets) {
                obj[key] = startValues[key] + (targets[key] - startValues[key]) * easedProgress;
            }
            
            if (progress === 1) {
                if (onComplete) onComplete();
                return true; // remove from list
            }
            return false;
        }
    });
}

function easeOutQuad(t) { return t * (2 - t); }
function easeBounceOut(t) {
    if (t < (1/2.75)) { return (7.5625*t*t); } 
    else if (t < (2/2.75)) { return (7.5625*(t-=(1.5/2.75))*t + 0.75); } 
    else if (t < (2.5/2.75)) { return (7.5625*(t-=(2.25/2.75))*t + 0.9375); } 
    else { return (7.5625*(t-=(2.625/2.75))*t + 0.984375); }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(time) {
    requestAnimationFrame(animate);
    
    // Update Tweens
    for (let i = tweens.length - 1; i >= 0; i--) {
        if (tweens[i].update(time)) {
            tweens.splice(i, 1);
        }
    }
    
    renderer.render(scene, camera);
}

// Запуск инициализации при загрузке страницы
window.onload = init;
