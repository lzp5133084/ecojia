/* ========================================
   悬浮计时器 - 网页端核心逻辑
   作者：军哥懂保
   微信号：xunijiayuan
   适配：电脑浏览器 + 手机浏览器
   ======================================== */

// ============ 全局状态 ============
const TimerMode = { STOPWATCH: 'stopwatch', COUNTDOWN: 'countdown', POMODORO: 'pomodoro' };
const TimerState = { IDLE: 'idle', RUNNING: 'running', PAUSED: 'paused', FINISHED: 'finished' };
const PomodoroPhase = { WORK: 'work', SHORT_BREAK: 'short_break', LONG_BREAK: 'long_break' };

// ============ 版本信息 ============
const CURRENT_VERSION = "1.0.1";
const CURRENT_VERSION_CODE = 2;
const VERSION_CHECK_URL = "https://ecojia.cn/timer/version.json";

const ModeIcons = { stopwatch: '⏱', countdown: '⏳', pomodoro: '🍅' };

let state = {
    mode: TimerMode.STOPWATCH,
    timerState: TimerState.IDLE,
    phase: PomodoroPhase.WORK,
    elapsed: 0,
    remaining: 0,
    totalDuration: 0,
    pomodoro: {
        work: 25 * 60,
        shortBreak: 5 * 60,
        longBreak: 15 * 60,
        cyclesBeforeLong: 4,
        currentCycle: 0
    },
    laps: [],
    soundEnabled: true,
    volume: 0.5,
    namePrompt: true,
    remindEnabled: false,
    remindMin: 25,
    reminded: false,
    startTime: 0,
    lastTick: 0
};

let timerInterval = null;

// ============ DOM元素 ============
const $ = id => document.getElementById(id);
const ball = $('floatingBall');
const ballMode = $('ballMode');
const ballTime = $('ballTime');
const ballProgress = $('ballProgress');
const panel = $('mainPanel');
const mainTime = $('mainTime');
const progressBar = $('progressBar');
const progressFill = $('progressFill');
const phaseBadge = $('phaseBadge');
const phaseText = $('phaseText');
const btnStart = $('btnStart');
const btnReset = $('btnReset');
const btnStop = $('btnStop');
const btnLap = $('btnLap');
const btnClose = $('btnClose');
const btnCollapse = $('btnCollapse');
const btnClearLaps = $('btnClearLaps');
const lapList = $('lapList');
const contextMenu = $('contextMenu');

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    initBall();
    initPanel();
    initContextMenu();
    initNameModal();
    loadRecords();
    renderRecords();
    updateUI();
    autoStartBallPosition();
    initUpdateCheck();   // 版本检查
    setInterval(updateLoop, 200);   // 200ms tick，后台标签页自动降频但持续运行
});

// ============ 计时器核心 ============

function formatTime(seconds) {
    seconds = Math.max(0, seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getDisplaySeconds() {
    if (state.mode === TimerMode.STOPWATCH) return state.elapsed;
    return state.remaining;
}

function startTimer() {
    if (state.timerState === TimerState.RUNNING) return;

    if (state.timerState === TimerState.IDLE) {
        if (state.mode === TimerMode.COUNTDOWN) {
            if (state.remaining <= 0) {
                state.remaining = state.totalDuration || 600;
            }
            state.startTime = performance.now() - state.elapsed * 1000;
        } else if (state.mode === TimerMode.POMODORO) {
            state.startTime = performance.now() - state.elapsed * 1000;
        } else {
            state.startTime = performance.now();
            state.elapsed = 0;
        }
    } else if (state.timerState === TimerState.PAUSED) {
        state.startTime = performance.now() - state.elapsed * 1000;
    }

    state.timerState = TimerState.RUNNING;
    playSound('start');
    updateUI();
}

function pauseTimer() {
    if (state.timerState !== TimerState.RUNNING) return;
    state.elapsed = (performance.now() - state.startTime) / 1000;
    if (state.mode !== TimerMode.STOPWATCH) {
        state.remaining = Math.max(0, state.totalDuration - state.elapsed);
    }
    state.timerState = TimerState.PAUSED;
    playSound('pause');
    updateUI();
}

function resetTimer() {
    state.elapsed = 0;
    state.reminded = false;
    state.timerState = TimerState.IDLE;
    if (state.mode === TimerMode.STOPWATCH) {
        state.remaining = 0;
    } else if (state.mode === TimerMode.COUNTDOWN) {
        state.remaining = state.totalDuration;
    } else if (state.mode === TimerMode.POMODORO) {
        state.phase = PomodoroPhase.WORK;
        state.pomodoro.currentCycle = 0;
        state.totalDuration = state.pomodoro.work;
        state.remaining = state.pomodoro.work;
    }
    playSound('reset');
    updateUI();
}

/**
 * 停止（结束）本次计时：
 * 开启命名保存且有效时长>1秒时先弹命名框保存记录，再归零回到待开始状态
 */
function stopTimer() {
    if (state.timerState !== TimerState.RUNNING && state.timerState !== TimerState.PAUSED) return;
    const elapsed = state.timerState === TimerState.RUNNING
        ? (performance.now() - state.startTime) / 1000
        : state.elapsed;
    const modeText = state.mode === TimerMode.STOPWATCH ? '正计时'
        : state.mode === TimerMode.COUNTDOWN ? '倒计时' : '番茄钟';
    resetTimer();   // 归零 + 提示音 + 回到IDLE
    // 开启命名弹窗：用户自定义命名；关闭：自动以当前时间命名保存
    if (elapsed > 1) {
        if (state.namePrompt) showNameModal(modeText, elapsed);
        else autoSaveRecord(modeText, elapsed);
    }
}

/**
 * 重复上次计时：按当前模式与预设重置并立即开始
 */
function repeatTimer() {
    resetTimer();
    startTimer();
}

function lapTimer() {
    if (state.mode !== TimerMode.STOPWATCH || state.timerState === TimerState.IDLE) return;
    const total = state.timerState === TimerState.RUNNING
        ? (performance.now() - state.startTime) / 1000
        : state.elapsed;

    let interval;
    if (state.laps.length > 0) {
        const lastTotal = state.laps[state.laps.length - 1].total;
        interval = total - lastTotal;
    } else {
        interval = total;
    }
    state.laps.push({ total, interval });
    renderLaps();
}

function setMode(mode) {
    if (state.timerState === TimerState.RUNNING) resetTimer();
    state.mode = mode;
    state.timerState = TimerState.IDLE;
    state.elapsed = 0;
    state.laps = [];

    if (mode === TimerMode.COUNTDOWN) {
        state.totalDuration = getCountdownSeconds();
        state.remaining = state.totalDuration;
        progressBar.classList.remove('hidden');
    } else if (mode === TimerMode.POMODORO) {
        state.pomodoro.work = $('pmWork').value * 60;
        state.pomodoro.shortBreak = $('pmShort').value * 60;
        state.pomodoro.longBreak = $('pmLong').value * 60;
        state.pomodoro.cyclesBeforeLong = parseInt($('pmCycles').value);
        state.phase = PomodoroPhase.WORK;
        state.pomodoro.currentCycle = 0;
        state.totalDuration = state.pomodoro.work;
        state.remaining = state.pomodoro.work;
        progressBar.classList.remove('hidden');
        phaseBadge.classList.remove('hidden');
        updatePhaseBadge();
    } else {
        state.remaining = 0;
        progressBar.classList.add('hidden');
        phaseBadge.classList.add('hidden');
    }
    updateUI();
}

function getProgress() {
    if (state.totalDuration <= 0) return 0;
    if (state.mode === TimerMode.STOPWATCH) return 0;
    return Math.min(1, state.elapsed / state.totalDuration);
}

// ============ 主循环 ============
// 注意：必须用 setInterval 而非 requestAnimationFrame —— 浏览器在后台标签页
// 会暂停 rAF，导致倒计时到点不触发结束/保存；setInterval 后台仅降频至约1Hz，
// 到点最多延迟1秒左右，保证计时结束逻辑必然执行。

function updateLoop() {
    if (state.timerState === TimerState.RUNNING) {
        const now = performance.now();
        state.elapsed = (now - state.startTime) / 1000;

        // 正计时到时提醒（到时提醒一次，计时不中断；重置后可再次提醒）
        if (state.mode === TimerMode.STOPWATCH && !state.reminded
            && state.remindEnabled && state.elapsed >= state.remindMin * 60) {
            state.reminded = true;
            playSound('finish');
            sendNotification('⏰ 到时提醒', '正计时已到达设定时间！');
        }

        if (state.mode !== TimerMode.STOPWATCH) {
            state.remaining = Math.max(0, state.totalDuration - state.elapsed);

            if (state.remaining <= 0) {
                handleFinish();
            }
        }
    }

    renderTime();
}

function handleFinish() {
    state.elapsed = state.totalDuration;

    if (state.mode === TimerMode.POMODORO) {
        // 番茄钟阶段切换
        if (state.phase === PomodoroPhase.WORK) {
            state.pomodoro.currentCycle++;
            if (state.pomodoro.currentCycle >= state.pomodoro.cyclesBeforeLong) {
                state.phase = PomodoroPhase.LONG_BREAK;
                state.totalDuration = state.pomodoro.longBreak;
                state.pomodoro.currentCycle = 0;
            } else {
                state.phase = PomodoroPhase.SHORT_BREAK;
                state.totalDuration = state.pomodoro.shortBreak;
            }
        } else {
            state.phase = PomodoroPhase.WORK;
            state.totalDuration = state.pomodoro.work;
        }
        state.elapsed = 0;
        state.remaining = state.totalDuration;
        state.startTime = performance.now();
        playSound('pomodoro');
        updatePhaseBadge();
    } else {
        state.timerState = TimerState.FINISHED;
        state.remaining = 0;
        playSound('finish');
        sendNotification('⏰ 计时结束！', '时间到啦！休息一下吧～');
        updateUI();
        // 倒计时自然结束时，若开启命名提醒则弹出命名框
        if (state.namePrompt) {
            showNameModal('倒计时', state.totalDuration);
        } else {
            autoSaveRecord('倒计时', state.totalDuration);
        }
    }
}

// ============ 渲染 ============

function renderTime() {
    const display = getDisplaySeconds();
    const timeStr = formatTime(display);
    mainTime.textContent = timeStr;
    ballTime.textContent = timeStr;

    // 进度条
    const progress = getProgress();
    progressFill.style.width = (progress * 100) + '%';
    ballProgress.style.width = (progress * 100) + '%';

    // 状态样式
    mainTime.parentElement.classList.remove('running', 'paused');
    ball.classList.remove('running', 'paused');
    if (state.timerState === TimerState.RUNNING) {
        mainTime.parentElement.classList.add('running');
        ball.classList.add('running');
    } else if (state.timerState === TimerState.PAUSED) {
        mainTime.parentElement.classList.add('paused');
        ball.classList.add('paused');
    }
}

function updateUI() {
    // 主按钮文字
    if (state.timerState === TimerState.IDLE || state.timerState === TimerState.FINISHED) {
        btnStart.textContent = '▶ 开始';
    } else if (state.timerState === TimerState.RUNNING) {
        btnStart.textContent = '⏸ 暂停';
    } else if (state.timerState === TimerState.PAUSED) {
        btnStart.textContent = '▶ 继续';
    }

    // 模式图标
    ballMode.textContent = ModeIcons[state.mode];

    // 停止按钮：仅运行中/暂停时可用
    btnStop.disabled = !(state.timerState === TimerState.RUNNING || state.timerState === TimerState.PAUSED);

    // 计次按钮可见性
    btnLap.style.display = state.mode === TimerMode.STOPWATCH ? '' : 'none';

    // 阶段标签
    if (state.mode !== TimerMode.POMODORO) {
        phaseBadge.classList.add('hidden');
    }

    renderTime();
}

function updatePhaseBadge() {
    phaseBadge.classList.remove('work', 'short_break', 'long_break');
    phaseBadge.classList.add(state.phase);
    if (state.phase === PomodoroPhase.WORK) {
        phaseText.textContent = '🔥 专注工作中';
    } else if (state.phase === PomodoroPhase.SHORT_BREAK) {
        phaseText.textContent = '☕ 短休息中';
    } else {
        phaseText.textContent = '🌴 长休息中';
    }
}

function renderLaps() {
    lapList.innerHTML = '';
    if (state.laps.length === 0) {
        lapList.innerHTML = '<div class="lap-empty">暂无计次记录</div>';
        return;
    }
    state.laps.forEach((lap, i) => {
        const totalStr = formatTime(lap.total);
        const intervalStr = formatTime(lap.interval);
        const div = document.createElement('div');
        div.className = 'lap-item';
        div.textContent = `#${String(i + 1).padStart(2, '0')}  累计 ${totalStr}  |  +${intervalStr}`;
        lapList.appendChild(div);
    });
    lapList.scrollTop = lapList.scrollHeight;
}

// ============ 悬浮球拖拽 ============

function initBall() {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let moved = false;

    ball.addEventListener('mousedown', startDrag);
    ball.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
        const pos = getPos(e);
        isDragging = true;
        moved = false;
        startX = pos.x;
        startY = pos.y;
        startLeft = ball.offsetLeft;
        startTop = ball.offsetTop;
        ball.classList.add('dragging');
        e.preventDefault();
    }

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });

    function onDrag(e) {
        if (!isDragging) return;
        const pos = getPos(e);
        const dx = pos.x - startX;
        const dy = pos.y - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

        ball.style.left = (startLeft + dx) + 'px';
        ball.style.top = (startTop + dy) + 'px';
        e.preventDefault();
    }

    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    function endDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        ball.classList.remove('dragging');

        if (moved) {
            attachToEdge();
        } else {
            // 点击 - 切换面板
            togglePanel();
        }
    }

    function getPos(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    // 右键菜单
    ball.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY);
    });

    // 长按（手机）
    let longPressTimer = null;
    ball.addEventListener('touchstart', () => {
        longPressTimer = setTimeout(() => {
            showContextMenu(ball.offsetLeft + ball.offsetWidth / 2, ball.offsetTop + ball.offsetHeight / 2);
        }, 500);
    });
    ball.addEventListener('touchend', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });
    ball.addEventListener('touchmove', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });
}

function attachToEdge() {
    const margin = 12;
    const w = ball.offsetWidth;
    const h = ball.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = ball.offsetLeft;
    const y = ball.offsetTop;

    const distLeft = x;
    const distRight = vw - (x + w);
    const distTop = y;
    const distBottom = vh - (y + h);

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);
    let targetX = x, targetY = y;

    if (minDist < 80) {
        if (minDist === distLeft) targetX = margin;
        else if (minDist === distRight) targetX = vw - w - margin;
        else if (minDist === distTop) targetY = margin;
        else targetY = vh - h - margin;

        ball.style.transition = 'left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        ball.style.left = targetX + 'px';
        ball.style.top = targetY + 'px';
        setTimeout(() => ball.style.transition = '', 300);
    }
}

function autoStartBallPosition() {
    // 默认右下角
    const w = ball.offsetWidth || 72;
    const h = ball.offsetHeight || 72;
    ball.style.left = (window.innerWidth - w - 20) + 'px';
    ball.style.top = (window.innerHeight - h - 100) + 'px';
}

// ============ 主面板 ============

function initPanel() {
    // 模式切换
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setMode(btn.dataset.mode);
        });
    });

    // Tab切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            $('tab-' + btn.dataset.tab).classList.add('active');
        });
    });

    // 控制按钮
    btnStart.addEventListener('click', () => {
        if (state.timerState === TimerState.RUNNING) pauseTimer();
        else startTimer();
    });
    btnReset.addEventListener('click', () => {
        // 正计时模式下：有有效时长且开启命名提醒时，重置后弹出命名框
        if (state.mode === TimerMode.STOPWATCH && state.namePrompt && state.timerState !== TimerState.IDLE) {
            const elapsed = state.timerState === TimerState.RUNNING
                ? (performance.now() - state.startTime) / 1000
                : state.elapsed;
            if (elapsed > 1) {
                resetTimer();
                showNameModal('正计时', elapsed);
                return;
            }
        }
        resetTimer();
    });
    btnStop.addEventListener('click', stopTimer);
    btnLap.addEventListener('click', lapTimer);

    // 快捷时间
    document.querySelectorAll('.shortcut-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const seconds = parseInt(btn.dataset.seconds);
            setCountdownSeconds(seconds);
            $('spinHours').value = Math.floor(seconds / 3600);
            $('spinMinutes').value = Math.floor((seconds % 3600) / 60);
            $('spinSeconds').value = seconds % 60;
        });
    });

    // 关闭/收起
    btnClose.addEventListener('click', () => panel.classList.add('hidden'));
    btnCollapse.addEventListener('click', () => togglePanel());

    // 分享有奖
    $('btnShare').addEventListener('click', showShareModal);
    $('btnShareClose').addEventListener('click', closeShareModal);
    $('btnCopyInvite').addEventListener('click', copyInviteCode);
    document.querySelectorAll('.share-platform-btn').forEach(btn => {
        btn.addEventListener('click', () => doShare(btn.dataset.platform));
    });

    // 计次清空
    btnClearLaps.addEventListener('click', () => {
        state.laps = [];
        renderLaps();
    });

    // 关闭按钮上的设置变化
    ['spinHours', 'spinMinutes', 'spinSeconds'].forEach(id => {
        $(id).addEventListener('change', () => {
            if (state.mode === TimerMode.COUNTDOWN && state.timerState !== TimerState.RUNNING) {
                setMode(TimerMode.COUNTDOWN);
            }
        });
    });

    ['pmWork', 'pmShort', 'pmLong', 'pmCycles'].forEach(id => {
        $(id).addEventListener('change', () => {
            if (state.mode === TimerMode.POMODORO && state.timerState !== TimerState.RUNNING) {
                setMode(TimerMode.POMODORO);
            }
        });
    });

    // 命名提醒开关
    $('chkNamePrompt').addEventListener('change', e => {
        state.namePrompt = e.target.checked;
        saveConfig();
    });

    // 正计时到时提醒设置
    $('chkRemind').addEventListener('change', e => {
        state.remindEnabled = e.target.checked;
        saveConfig();
    });
    $('spinRemindMin').addEventListener('change', e => {
        state.remindMin = Math.max(1, parseInt(e.target.value) || 25);
        saveConfig();
    });

    // 清空使用记录
    $('btnClearRecords').addEventListener('click', () => {
        if (records.length === 0) return;
        if (confirm('确定要清空全部使用记录吗？此操作不可恢复。')) {
            records = [];
            persistRecords();
            renderRecords();
        }
    });

    // 声音设置
    $('chkSound').addEventListener('change', e => {
        state.soundEnabled = e.target.checked;
        saveConfig();
    });
    $('sliderVolume').addEventListener('input', e => {
        state.volume = e.target.value / 100;
        $('volumeLabel').textContent = e.target.value + '%';
        saveConfig();
    });
}

function togglePanel() {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        panel.style.animation = 'none';
        panel.offsetHeight; // 触发重排
        panel.style.animation = '';
    }
}

function showPanel() {
    panel.classList.remove('hidden');
}

function getCountdownSeconds() {
    const h = parseInt($('spinHours').value) || 0;
    const m = parseInt($('spinMinutes').value) || 0;
    const s = parseInt($('spinSeconds').value) || 0;
    return h * 3600 + m * 60 + s;
}

function setCountdownSeconds(seconds) {
    state.totalDuration = seconds;
    state.remaining = seconds;
    state.elapsed = 0;
}

// ============ 右键菜单 ============

function initContextMenu() {
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.add('hidden');
        }
    });

    contextMenu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            if (action === 'show') showPanel();
            else if (action === 'start') startTimer();
            else if (action === 'pause') pauseTimer();
            else if (action === 'stop') stopTimer();
            else if (action === 'repeat') repeatTimer();
            else if (action === 'reset') resetTimer();
            else if (action === 'login') showLoginModal();
            contextMenu.classList.add('hidden');
        });
    });
}

function showContextMenu(x, y) {
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.remove('hidden');
}

// ============ 登录弹窗 ============

function showLoginModal() {
    const modal = $('loginModal');
    modal.classList.remove('hidden');
    setTimeout(() => $('loginUser').focus(), 100);

    $('btnLogin').onclick = () => {
        const user = $('loginUser').value.trim();
        const pass = $('loginPass').value.trim();
        if (authenticate(user, pass)) {
            alert('✅ 登录成功！欢迎管理员');
            modal.classList.add('hidden');
        } else {
            alert('❌ 账号或密码错误');
        }
    };

    // Enter键登录
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !modal.classList.contains('hidden')) {
            $('btnLogin').click();
        }
    });
}

function authenticate(user, pass) {
    // 默认管理员（规则第8条）
    const ADMIN_USER = '18180309010';
    const ADMIN_PASS = 'Lzp520520520.';
    return user === ADMIN_USER && pass === ADMIN_PASS;
}

// ============ 计时记录（命名保存） ============

const RECORDS_KEY = 'timer_records_v1';
let records = [];
let pendingRecord = null;
let renamingIndex = -1;   // >=0 表示弹窗处于"重命名已有记录"模式

function loadRecords() {
    try {
        const raw = localStorage.getItem(RECORDS_KEY);
        records = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(records)) records = [];
    } catch (e) { records = []; }
}

function persistRecords() {
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) {}
}

function formatEndTime(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderRecords() {
    const list = $('recordList');
    list.innerHTML = '';
    if (records.length === 0) {
        list.innerHTML = '<div class="lap-empty">暂无使用记录</div>';
        return;
    }
    records.forEach((rec, i) => {
        const div = document.createElement('div');
        div.className = 'record-item';

        const info = document.createElement('div');
        info.className = 'record-info';
        const nameEl = document.createElement('span');
        nameEl.className = 'record-name';
        nameEl.textContent = rec.name;
        const metaEl = document.createElement('span');
        metaEl.className = 'record-meta';
        metaEl.textContent = `${rec.mode} · ${rec.duration} · ${rec.endTime}`;
        info.appendChild(nameEl);
        info.appendChild(metaEl);

        const edit = document.createElement('button');
        edit.className = 'record-del';
        edit.textContent = '✏️';
        edit.title = '重命名';
        edit.addEventListener('click', () => {
            renamingIndex = i;
            $('recordSummary').textContent = `${rec.mode} · ${rec.duration}`;
            $('recordName').value = rec.name;
            $('nameModal').classList.remove('hidden');
            setTimeout(() => { $('recordName').focus(); $('recordName').select(); }, 100);
        });

        const del = document.createElement('button');
        del.className = 'record-del';
        del.textContent = '✕';
        del.title = '删除该条';
        del.addEventListener('click', () => {
            records.splice(i, 1);
            persistRecords();
            renderRecords();
        });
        div.appendChild(info);
        div.appendChild(edit);
        div.appendChild(del);
        list.appendChild(div);
    });
}

// ============ 版本检查 ============
/**
 * 检查是否有新版本
 * @param {boolean} manual - 是否手动检查（手动检查时无新版也提示"已是最新"）
 */
async function checkUpdate(manual = false) {
    const tag = $('versionTag');
    if (tag) {
        tag.textContent = '检查中...';
        tag.classList.add('checking');
    }
    try {
        const resp = await fetch(VERSION_CHECK_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const web = data.web;
        if (web && web.versionCode > CURRENT_VERSION_CODE) {
            showUpdateBanner(web);
        } else if (manual) {
            if (tag) {
                tag.textContent = '已是最新 v' + CURRENT_VERSION;
                setTimeout(() => {
                    tag.textContent = 'v' + CURRENT_VERSION;
                    tag.classList.remove('checking');
                }, 2000);
            }
        }
    } catch (e) {
        // 静默失败（服务器未部署时不打扰用户），手动检查才提示
        if (manual && tag) {
            tag.textContent = '检查失败';
            setTimeout(() => {
                tag.textContent = 'v' + CURRENT_VERSION;
                tag.classList.remove('checking');
            }, 2000);
        }
    }
}

function showUpdateBanner(info) {
    $('updateTitle').textContent = `发现新版本 v${info.versionName}`;
    $('updateLog').textContent = (info.updateLog || '').replace(/\n/g, '  ');
    $('updateBanner').classList.remove('hidden');
}

function initUpdateCheck() {
    // 立即更新 = 刷新页面（网页端部署后即最新）
    $('btnUpdateNow').addEventListener('click', () => location.reload());
    // 稍后 = 今天不再提示
    $('btnUpdateLater').addEventListener('click', () => {
        $('updateBanner').classList.add('hidden');
        localStorage.setItem('update_skip_date', new Date().toDateString());
    });
    // 点击版本号手动检查
    $('versionTag').addEventListener('click', () => checkUpdate(true));

    // 启动时自动检查（若今天已点"稍后"则跳过）
    const skipDate = localStorage.getItem('update_skip_date');
    if (skipDate !== new Date().toDateString()) {
        setTimeout(() => checkUpdate(false), 1500);
    }
}

/**
 * 关闭命名弹窗时：自动以当前时间命名保存记录
 */
function autoSaveRecord(modeText, durationSec) {
    records.unshift({
        name: `计时 ${formatEndTime(new Date()).slice(5)}`,
        mode: modeText,
        duration: formatTime(Math.round(durationSec)),
        endTime: formatEndTime(new Date())
    });
    persistRecords();
    renderRecords();
}

function showNameModal(modeText, durationSec) {
    renamingIndex = -1;
    pendingRecord = { mode: modeText, duration: formatTime(Math.round(durationSec)) };
    $('recordSummary').textContent = `${modeText} · ${pendingRecord.duration}`;
    $('recordName').value = '';
    $('nameModal').classList.remove('hidden');
    setTimeout(() => $('recordName').focus(), 100);
}

function closeNameModal() {
    $('nameModal').classList.add('hidden');
    pendingRecord = null;
    renamingIndex = -1;
}

function initNameModal() {
    $('btnSaveRecord').addEventListener('click', () => {
        if (renamingIndex >= 0 && records[renamingIndex]) {
            // 重命名模式：更新已有记录名称
            const newName = $('recordName').value.trim();
            if (newName) records[renamingIndex].name = newName;
            persistRecords();
            renderRecords();
        } else if (pendingRecord) {
            const name = $('recordName').value.trim() || '未命名计时';
            records.unshift({
                name,
                mode: pendingRecord.mode,
                duration: pendingRecord.duration,
                endTime: formatEndTime(new Date())
            });
            persistRecords();
            renderRecords();
        }
        closeNameModal();
    });
    $('btnSkipRecord').addEventListener('click', closeNameModal);
    // Enter键 = 保存
    $('recordName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('btnSaveRecord').click();
    });
}

// ============ 声音 ============

let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playSound(type) {
    if (!state.soundEnabled) return;
    try {
        const ctx = getAudioCtx();
        const vol = state.volume;

        const beep = (freq, dur, when = 0) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0, ctx.currentTime + when);
            gain.gain.linearRampToValueAtTime(vol * 0.3, ctx.currentTime + when + 0.01);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + when + dur);
            osc.start(ctx.currentTime + when);
            osc.stop(ctx.currentTime + when + dur + 0.05);
        };

        if (type === 'start') beep(880, 0.1);
        else if (type === 'pause') beep(660, 0.1);
        else if (type === 'reset') beep(440, 0.15);
        else if (type === 'finish') {
            beep(1047, 0.2, 0);
            beep(1319, 0.2, 0.25);
            beep(1568, 0.4, 0.5);
        } else if (type === 'pomodoro') {
            beep(784, 0.15, 0);
            beep(988, 0.3, 0.2);
        }
    } catch (e) { /* 浏览器可能拦截 */ }
}

// ============ 通知 ============

function sendNotification(title, body) {
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            new Notification(title, { body });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => {
                if (p === 'granted') new Notification(title, { body });
            });
        }
    }
}

// ============ 本地存储 ============

const CONFIG_KEY = 'timer_config_v1';

function saveConfig() {
    const config = {
        countdown: {
            hours: parseInt($('spinHours').value) || 0,
            minutes: parseInt($('spinMinutes').value) || 10,
            seconds: parseInt($('spinSeconds').value) || 0
        },
        pomodoro: {
            work: parseInt($('pmWork').value) || 25,
            short: parseInt($('pmShort').value) || 5,
            long: parseInt($('pmLong').value) || 15,
            cycles: parseInt($('pmCycles').value) || 4
        },
        sound: {
            enabled: state.soundEnabled,
            volume: state.volume,
            namePrompt: state.namePrompt
        },
        remind: {
            enabled: state.remindEnabled,
            minutes: state.remindMin
        },
        ballPos: { left: ball.offsetLeft, top: ball.offsetTop }
    };
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        updateConfigInfo();
    } catch (e) {}
}

function loadConfig() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) return;
        const cfg = JSON.parse(raw);

        const cd = cfg.countdown || {};
        $('spinHours').value = cd.hours || 0;
        $('spinMinutes').value = cd.minutes || 10;
        $('spinSeconds').value = cd.seconds || 0;

        const pm = cfg.pomodoro || {};
        $('pmWork').value = pm.work || 25;
        $('pmShort').value = pm.short || 5;
        $('pmLong').value = pm.long || 15;
        $('pmCycles').value = pm.cycles || 4;

        const sd = cfg.sound || {};
        state.soundEnabled = sd.enabled !== false;
        state.volume = sd.volume !== undefined ? sd.volume : 0.5;
        state.namePrompt = sd.namePrompt !== false;
        $('chkSound').checked = state.soundEnabled;
        $('chkNamePrompt').checked = state.namePrompt;
        $('sliderVolume').value = Math.round(state.volume * 100);
        $('volumeLabel').textContent = Math.round(state.volume * 100) + '%';

        const rm = cfg.remind || {};
        state.remindEnabled = rm.enabled === true;
        state.remindMin = rm.minutes || 25;
        $('chkRemind').checked = state.remindEnabled;
        $('spinRemindMin').value = state.remindMin;

        if (cfg.ballPos) {
            ball.style.left = cfg.ballPos.left + 'px';
            ball.style.top = cfg.ballPos.top + 'px';
        }

        // 初始化倒计时时长
        state.totalDuration = getCountdownSeconds();
        state.remaining = state.totalDuration;
    } catch (e) {}
}

function updateConfigInfo() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
            const size = new Blob([raw]).size;
            $('configInfo').textContent = `📁 ${size}B · 已保存`;
        }
    } catch (e) {}
}

// 定期保存
setInterval(saveConfig, 5000);

// 退出前保存
window.addEventListener('beforeunload', saveConfig);

// ============ 窗口大小变化 ============

window.addEventListener('resize', () => {
    // 确保悬浮球在可视范围内
    const rect = ball.getBoundingClientRect();
    if (rect.right > window.innerWidth) ball.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) ball.style.top = (window.innerHeight - rect.height - 10) + 'px';
});

// ============ 分享有奖 ============

// V2：邀请码不再固定，注册账号+实名认证后系统生成专属邀请码（ECJ开头）
const REG_URL = 'https://ecojia.cn/login';

function showShareModal() {
    $('shareModal').classList.remove('hidden');
    generateQRCode();
}

function closeShareModal() {
    $('shareModal').classList.add('hidden');
}

function copyInviteCode() {
    const tip = '专属邀请码需在官网注册并完成实名认证后自动生成\n注册入口已复制：' + REG_URL;
    navigator.clipboard.writeText(REG_URL).then(() => {
        alert(tip);
    }).catch(() => {
        prompt('请复制注册入口（注册+实名后自动生成专属邀请码）：', REG_URL);
    });
}

function doShare(platform) {
    const link = REG_URL;
    const text = '🎁 我在用「悬浮计时器」，2027科技风超好用！注册并完成实名认证即可获得你的专属邀请码，邀请好友双方都有奖励：';
    const shareText = text + '\n' + link;

    if (platform === 'link') {
        navigator.clipboard.writeText(link).then(() => {
            alert('分享链接已复制：\n' + link);
        }).catch(() => {
            prompt('请复制分享链接：', link);
        });
    } else if (platform === 'wechat') {
        navigator.clipboard.writeText(shareText).then(() => {
            alert('分享文案已复制，请打开微信粘贴发送给好友');
        }).catch(() => {
            prompt('请复制以下内容到微信发送：', shareText);
        });
    } else if (platform === 'qq') {
        navigator.clipboard.writeText(shareText).then(() => {
            alert('分享文案已复制，请打开QQ粘贴发送给好友');
        }).catch(() => {
            prompt('请复制以下内容到QQ发送：', shareText);
        });
    }
}

/**
 * 生成装饰性二维码（14x14网格，含三个定位角）
 */
function generateQRCode() {
    const container = $('qrCode');
    if (!container || container.children.length > 0) return;

    const size = 14;
    // 固定种子
    let seed = 42;
    function rng() {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cell = document.createElement('span');
            const inCorner = (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
            let filled = false;
            if (inCorner) {
                let bx, by;
                if (x < 7 && y < 7) { bx = 0; by = 0; }
                else if (x >= size - 7 && y < 7) { bx = size - 7; by = 0; }
                else { bx = 0; by = size - 7; }
                const lx = x - bx, ly = y - by;
                if (lx === 0 || lx === 6 || ly === 0 || ly === 6) filled = true;
                else if (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4) filled = true;
            } else {
                filled = rng() > 0.5;
            }
            cell.style.background = filled ? '#000' : '#fff';
            container.appendChild(cell);
        }
    }
}

// 点击遮罩关闭分享弹窗
document.addEventListener('click', (e) => {
    const modal = $('shareModal');
    if (modal && !modal.classList.contains('hidden')) {
        if (e.target === modal) closeShareModal();
    }
});
