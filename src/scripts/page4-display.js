(function () {
    'use strict';

    const MAX_SLOTS = 6;
    const THUMBNAIL_RESOURCE_BASE = '/resources/Thumbnail';
    const unavailableThumbnailPaths = new Set();

    const panelStates = {
        left: { signatures: new Array(MAX_SLOTS).fill(null) },
        right: { signatures: new Array(MAX_SLOTS).fill(null) }
    };

    function basename(value) {
        return String(value || '').split('/').filter(Boolean).pop() || '';
    }

    function sanitizeFilenameSegment(value, fallback = '') {
        const normalized = String(value ?? '')
            .normalize('NFC')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
            .replace(/\s+/g, '')
            .replace(/\.+$/g, '')
            .trim();

        return normalized || fallback;
    }

    function getSpriteDisplayName(sprite) {
        if (!sprite || typeof sprite !== 'object') {
            return '';
        }
        return String(sprite.cardName || sprite.displayName || sprite.chineseName || sprite.name || basename(sprite.path) || '').trim();
    }

    function buildThumbnailCandidates(sprite) {
        const thumbnailId = String(sprite && sprite.thumbnailId ? sprite.thumbnailId : '').trim();
        if (!thumbnailId) {
            return [];
        }

        const candidateNames = [
            sprite && sprite.cardName,
            sprite && sprite.displayName,
            sprite && sprite.chineseName,
            sprite && sprite.name,
            sprite && sprite.path ? basename(sprite.path) : '',
        ]
            .map((value) => sanitizeFilenameSegment(value))
            .filter(Boolean);

        return Array.from(new Set(candidateNames)).map((name) => `${THUMBNAIL_RESOURCE_BASE}/${thumbnailId}_${name}.png`);
    }

    function resolveSpriteImageSources(sprite) {
        const fallbackSrc = sprite && sprite.path ? String(sprite.path) : '';
        const thumbnailCandidates = buildThumbnailCandidates(sprite).filter((path) => !unavailableThumbnailPaths.has(path));

        return {
            fallbackSrc,
            thumbnailCandidates,
        };
    }

    function syncImageState(slotEl, imageSrc) {
        slotEl.classList.toggle('is-thumbnail', String(imageSrc || '').startsWith(THUMBNAIL_RESOURCE_BASE));
    }

    function applySpriteImage(imgEl, sprite) {
        if (!imgEl) {
            return;
        }

        const imageSources = resolveSpriteImageSources(sprite);
        const sourceQueue = [...imageSources.thumbnailCandidates, ...(imageSources.fallbackSrc ? [imageSources.fallbackSrc] : [])];

        if (sourceQueue.length === 0) {
            imgEl.removeAttribute('src');
            imgEl.onerror = null;
            return;
        }

        const imageSignature = JSON.stringify(sourceQueue);
        if (imgEl.dataset.imageSignature === imageSignature) {
            return;
        }

        imgEl.dataset.imageSignature = imageSignature;
        let currentIndex = 0;

        const assignNext = () => {
            const nextSrc = sourceQueue[currentIndex];
            imgEl.dataset.currentSrc = nextSrc;
            syncImageState(imgEl.closest('.petsdiv3') || imgEl.parentElement, nextSrc);
            imgEl.src = nextSrc;
        };

        imgEl.onerror = () => {
            const failedSrc = imgEl.dataset.currentSrc || '';
            if (failedSrc.startsWith(THUMBNAIL_RESOURCE_BASE)) {
                unavailableThumbnailPaths.add(failedSrc);
            }

            currentIndex += 1;
            if (currentIndex >= sourceQueue.length) {
                imgEl.onerror = null;
                return;
            }

            assignNext();
        };

        assignNext();
    }

    function renderEmptySlot(slotEl) {
        slotEl.className = 'petsdiv3 is-empty';
        slotEl.innerHTML = '';
        delete slotEl.dataset.spriteKey;
    }

    function renderSlot(slotEl, slotData) {
        const sprite = slotData && slotData.sprite ? slotData.sprite : null;
        if (!sprite) {
            renderEmptySlot(slotEl);
            return;
        }

        const signature = JSON.stringify({
            id: sprite.id || sprite.path || getSpriteDisplayName(sprite),
            name: getSpriteDisplayName(sprite),
            path: sprite.path || '',
            thumbnailId: sprite.thumbnailId || '',
            isDead: Boolean(slotData && slotData.isDead),
        });

        slotEl.className = `petsdiv3 is-active${slotData && slotData.isDead ? ' is-dead' : ''}`;

        if (slotEl.dataset.spriteKey !== signature) {
            slotEl.dataset.spriteKey = signature;
            slotEl.innerHTML = '<img alt="">';
        }

        const imgEl = slotEl.querySelector('img');
        if (imgEl) {
            imgEl.alt = getSpriteDisplayName(sprite);
            applySpriteImage(imgEl, sprite);
        }
    }

    function renderPanel(position, panelData) {
        const selected = panelData && Array.isArray(panelData.selected) ? panelData.selected : [];
        const slotEls = document.querySelectorAll(`.petsdiv3[data-side="${position}"]`);

        slotEls.forEach((slotEl, index) => {
            const slotData = selected[index] || null;
            const nextSignature = JSON.stringify({
                spriteKey: slotData && slotData.sprite ? (slotData.sprite.id || slotData.sprite.path || getSpriteDisplayName(slotData.sprite)) : null,
                isDead: Boolean(slotData && slotData.isDead),
            });

            if (panelStates[position].signatures[index] === nextSignature) {
                return;
            }

            renderSlot(slotEl, slotData);
            panelStates[position].signatures[index] = nextSignature;
        });
    }

    function applySnapshot(payload) {
        const page4 = payload && payload.page4 ? payload.page4 : null;
        const panels = page4 && Array.isArray(page4.panels) ? page4.panels : [];
        renderPanel('left', panels.find((panel) => panel && panel.position === 'left'));
        renderPanel('right', panels.find((panel) => panel && panel.position === 'right'));
    }

    async function loadInitialState() {
        const response = await fetch('/api/page4');
        const data = await response.json();
        applySnapshot({ page4: data });
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            return;
        }

        const socket = io({
            transports: ['websocket', 'polling'],
        });

        socket.on('snapshot', (payload) => {
            applySnapshot(payload || {});
        });

        socket.on('page4:update', (payload) => {
            if (payload && payload.page4) {
                applySnapshot({ page4: payload.page4 });
            }
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await loadInitialState();
            connectSocket();
        } catch (error) {
            console.error('page4 初始加载失败:', error);
        }
    });
})();
