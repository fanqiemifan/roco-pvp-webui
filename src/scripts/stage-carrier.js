(function () {
    'use strict';

    /**
     * 推流载体脚本：负责把直播推流指定的推流页面加载进全屏 iframe。
     *
     * 工作流程：
     * 1. 页面加载后通过 HTTP 拉取当前导播画面 (GET /api/stage)。
     * 2. 建立 Socket.IO 连接，监听 stage:update 事件，实时切换画面。
     * 3. 切换时做淡入淡出过渡，加载失败展示回退提示。
     *
     * 导播画面用页面 key 标识，支持的 key 与对应路径：
     *   - page1-overlay : 推流页面1（Overlay 比分栏布局）  -> /roco-pvp-page1.html
     *   - page2         : 推流页面2（全局阵容展示）       -> /roco-pvp-page2.html
     *   - page3         : 推流页面3（头像比分阵容）       -> /roco-pvp-page3.html
     *   - page4         : 仅显阵容                      -> /roco-pvp-page4.html
     *   - standby       : 等待页                          -> /live-standby-demo.html
     *   - blank         : 黑场（不加载任何画面）
     */

    var STAGE_PAGES = {
        'page1-overlay': { label: '推流页面1', path: '/roco-pvp-page1.html' },
        'page2': { label: '推流页面2', path: '/roco-pvp-page2.html' },
        'page3': { label: '推流页面3', path: '/roco-pvp-page3.html' },
        'page4': { label: '仅显阵容', path: '/roco-pvp-page4.html' },
        'standby': { label: '等待页', path: '/live-standby-demo.html' },
        'blank': { label: '黑场', path: null }
    };

    var DEFAULT_PAGE = 'page3';
    var DEFAULT_TRANSITION = 'blinds';
    var TRANSITION_MS = 420;

    var carrier = document.getElementById('stageCarrier');
    var frame = document.getElementById('stageFrame');
    var fallback = document.getElementById('stageFallback');
    var fallbackText = document.getElementById('stageFallbackText');
    var transitionLayer = document.getElementById('stageTransition');

    var currentPage = null;
    var currentTransition = DEFAULT_TRANSITION;
    var socket = null;
    var transitionTimer = null;

    function resolveStage(page) {
        if (!page || typeof page !== 'string') {
            return STAGE_PAGES[DEFAULT_PAGE];
        }
        var trimmed = page.trim();
        if (STAGE_PAGES[trimmed]) {
            return STAGE_PAGES[trimmed];
        }
        // 兼容后端直接下发完整路径或相对路径
        if (/^\/[^\\]/.test(trimmed)) {
            return { label: trimmed, path: trimmed };
        }
        return STAGE_PAGES[DEFAULT_PAGE];
    }

    function applyFallback(show, text) {
        fallbackText.textContent = text || '正在等待导播画面…';
        fallback.classList.toggle('is-visible', !!show);
    }

    function setCarrierStage(page) {
        carrier.setAttribute('data-stage', page || 'blank');
    }

    function setBlank() {
        currentPage = 'blank';
        frame.classList.add('is-hidden');
        // 黑场：完全透明，不显示任何提示
        applyFallback(false, '');
        setCarrierStage('blank');
    }

    // ---------- 切换过渡动画层 ----------

    // 清空并构建过渡层 DOM；fx 为 'blinds' | 'zoom'
    function buildTransition(fx) {
        if (!transitionLayer) {
            return;
        }
        transitionLayer.className = 'stage-transition fx-' + fx;
        transitionLayer.innerHTML = '';

        if (fx === 'blinds') {
            var count = 10;
            for (var i = 0; i < count; i++) {
                var blind = document.createElement('div');
                blind.className = 'fx-blind';
                // 相邻百叶交错展开，形成扇面扫过效果
                blind.style.animationDelay = (i % 2 === 0 ? 0 : 70) + 'ms';
                transitionLayer.appendChild(blind);
            }
        } else if (fx === 'zoom') {
            var flash = document.createElement('div');
            flash.className = 'fx-zoom-flash';
            var logo = document.createElement('div');
            logo.className = 'fx-zoom-logo';
            var inner = document.createElement('div');
            inner.className = 'fx-zoom-logo-typography';
            var main = document.createElement('div');
            main.textContent = '洛克王国PVP';
            var sub = document.createElement('div');
            sub.className = 'fx-zoom-logo-sub';
            sub.textContent = 'ROCO PVP';
            inner.appendChild(main);
            inner.appendChild(sub);
            logo.appendChild(inner);
            transitionLayer.appendChild(flash);
            transitionLayer.appendChild(logo);
        }
    }

    // 播放过渡动画；onReveal 在动画遮盖住画面后（峰值）触发，用于换画
    function playTransition(fx, onReveal) {
        if (!transitionLayer) {
            // 无过渡层节点时直接执行换画
            if (typeof onReveal === 'function') {
                onReveal();
            }
            return;
        }
        if (fx === 'none') {
            if (typeof onReveal === 'function') {
                onReveal();
            }
            return;
        }

        buildTransition(fx);

        // 峰值时长：动画遮满屏幕所需的时长（约 62% 处）
        var peakDelay = fx === 'blinds' ? 384 : 230;
        // 总时长需大于单 iframe 淡出 420ms，保证换画发生在遮罩之下
        var totalMs = fx === 'blinds' ? 980 : 860;

        if (transitionTimer) {
            window.clearTimeout(transitionTimer);
        }

        // 强制重排，确保同名动画能重新触发
        void transitionLayer.offsetWidth;
        transitionLayer.classList.add('is-running');

        window.setTimeout(function () {
            if (typeof onReveal === 'function') {
                onReveal();
            }
        }, peakDelay);

        transitionTimer = window.setTimeout(function () {
            transitionLayer.classList.remove('is-running');
            transitionTimer = null;
        }, totalMs);
    }

    function loadStage(page, options) {
        var opts = options || {};
        var stage = resolveStage(page);
        var nextKey = page || DEFAULT_PAGE;
        var fx = typeof opts.transition === 'string' ? opts.transition : currentTransition;

        if (stage.path === null) {
            setBlank();
            return;
        }

        if (currentPage === nextKey && frame.getAttribute('src') === stage.path) {
            // 已经是目标画面，无需重复加载
            return;
        }

        currentPage = nextKey;
        setCarrierStage(nextKey);

        var done = function () {
            frame.classList.remove('is-hidden');
            applyFallback(false, '');
        };

        // 切换路径。先置空再赋值可强制触发某些页面的重新初始化。
        var applyNewSrc = function () {
            frame.classList.add('is-hidden');
            frame.onload = function () {
                // 给浏览器一帧时间应用样式后再淡入
                window.setTimeout(done, 16);
            };
            frame.onerror = function () {
                applyFallback(true, '画面加载失败：' + stage.label);
            };
            frame.setAttribute('src', stage.path);

            // 兜底：若 onload 迟迟未触发（极端情况），仍淡入避免长期黑屏
            window.setTimeout(function () {
                if (frame.classList.contains('is-hidden')) {
                    done();
                }
            }, TRANSITION_MS + 1600);
        };

        // 播放过渡动画：动画遮满屏幕后触发射换新画面，动画淡出时露出新画面。
        playTransition(fx, applyNewSrc);
    }

    function applyStagePayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return;
        }
        // 后端广播 stage:update 的 payload 形如 { stage: { page: 'page2' } }；
        // GET /api/stage 返回顶层 { page: 'page2' }。两种结构都要兼容。
        var page = null;
        var transition = null;
        if (payload.stage && typeof payload.stage === 'object') {
            page = payload.stage.page || payload.stage.stagePage;
            transition = payload.stage.transition;
        }
        if (page === undefined || page === null || page === '') {
            page = payload.page || payload.stagePage;
        }
        if (transition === undefined || transition === null || transition === '') {
            transition = payload.transition;
        }
        if (page === undefined || page === null || page === '') {
            return;
        }
        if (typeof transition === 'string' && transition) {
            currentTransition = transition;
        }
        loadStage(page, { transition: transition || currentTransition });
    }

    function loadInitialState() {
        fetch('/api/stage', { credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('stage 状态请求失败');
                }
                return response.json();
            })
            .then(function (data) {
                var page = data && (data.page || data.stagePage);
                var transition = data && data.transition;
                if (typeof transition === 'string' && transition) {
                    currentTransition = transition;
                }
                loadStage(page || DEFAULT_PAGE, { transition: transition || currentTransition });
            })
            .catch(function () {
                // 拉取失败时回退到默认画面，避免长期空白
                loadStage(DEFAULT_PAGE);
            });
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            console.error('Socket.IO 客户端未加载，导播画面切换将不可用');
            return;
        }

        socket = io({ transports: ['websocket', 'polling'] });

        socket.on('connect', function () {
            // 连接建立后服务端会下发 snapshot，其中包含 stage 字段
        });

        socket.on('snapshot', function (payload) {
            applyStagePayload(payload && payload.stage ? { page: payload.stage.page } : null);
        });

        socket.on('stage:update', function (payload) {
            applyStagePayload(payload);
        });

        socket.on('connect_error', function (error) {
            console.error('Socket.IO 连接失败:', error);
        });
    }

    function init() {
        if (!frame || !carrier) {
            console.error('推流载体 DOM 节点缺失');
            return;
        }
        // 初始占位：保持透明，等待导播画面加载
        setBlank();
        loadInitialState();
        connectSocket();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
