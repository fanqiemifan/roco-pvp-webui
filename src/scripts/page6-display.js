(function () {
    'use strict';

    const subtitleEl = document.getElementById('page6Subtitle');
    const gridEl = document.getElementById('page6Grid');
    const screenEl = document.getElementById('page6Screen');
    const backVideoEl = document.getElementById('page6BackVideo');

    function applyBackground(mode) {
        const isVideo = mode === 'video';
        if (!screenEl) {
            return;
        }
        screenEl.classList.toggle('page6-mode-video', isVideo);
        screenEl.classList.toggle('page6-mode-image-2', mode === 'image-2');
        if (isVideo && backVideoEl) {
            const playPromise = backVideoEl.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
            }
        }
    }

    function renderGrid(matches) {
        gridEl.innerHTML = '';
        (matches || []).forEach((match) => {
            const leftScore = match.leftScore ?? 0;
            const rightScore = match.rightScore ?? 0;
            const leftIsWinner = match.winner === 'left';
            const rightIsWinner = match.winner === 'right';

            const card = document.createElement('div');
            card.className = 'page6-result';

            const leftName = document.createElement('div');
            leftName.className = 'page6-name page6-name-left';
            leftName.textContent = match.leftPlayer || '左侧';

            const rightName = document.createElement('div');
            rightName.className = 'page6-name page6-name-right';
            rightName.textContent = match.rightPlayer || '右侧';

            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'page6-score-div';

            const leftScoreEl = document.createElement('div');
            leftScoreEl.className = `page6-score${leftIsWinner ? ' is-winner' : ''}`;
            leftScoreEl.textContent = String(leftScore);

            const icon = document.createElement('img');
            icon.className = 'page6-icon';
            icon.src = '/assets/ui/icon-for-page6.png';
            icon.alt = 'VS';
            icon.onerror = function () {
                icon.style.display = 'none';
            };

            const rightScoreEl = document.createElement('div');
            rightScoreEl.className = `page6-score${rightIsWinner ? ' is-winner' : ''}`;
            rightScoreEl.textContent = String(rightScore);

            scoreDiv.appendChild(leftScoreEl);
            scoreDiv.appendChild(icon);
            scoreDiv.appendChild(rightScoreEl);

            card.appendChild(leftName);
            card.appendChild(scoreDiv);
            card.appendChild(rightName);
            gridEl.appendChild(card);
        });
    }

    function applySubtitle(title) {
        const text = String(title || '').trim();
        subtitleEl.textContent = text;
    }

    async function loadData() {
        try {
            const [page6Res, scoreboard] = await Promise.all([
                fetch('/api/page6', { credentials: 'same-origin' }).then((r) => r.json()),
                fetch('/api/scoreboard', { credentials: 'same-origin' }).then((r) => r.json()),
            ]);
            applySubtitle(page6Res && page6Res.state && page6Res.state.title);
            renderGrid(page6Res && page6Res.matches);
            applyBackground(page6Res && page6Res.state && page6Res.state.background);
        } catch (error) {
            console.error('page6 初始加载失败:', error);
        }
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            return;
        }
        const socket = io({ transports: ['websocket', 'polling'] });

        socket.on('snapshot', (payload) => {
            if (payload && payload.page6) {
                // 页面6 状态变更后重新拉取完整比赛数据
                void loadData();
            }
        });

        socket.on('page6:update', () => {
            void loadData();
        });

        socket.on('matches:update', () => {
            void loadData();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        void loadData();
        connectSocket();
    });
})();
