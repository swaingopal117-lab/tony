(function () {
    if (window.top !== window.self) return;
    var overlay = document.getElementById('prototypeOverlay');
    if (!overlay) return;

    var code = overlay.getAttribute('data-project-code') || '';
    var csrfToken = overlay.getAttribute('data-csrf-token') || '';
    var reportLoginUrl = overlay.getAttribute('data-report-login-url') || '/yanshiadmin/index.php';
    var reportSubmitUrl = overlay.getAttribute('data-report-submit-url') || '/api/prototype_report_feedback.php';
    var showFloatingShield = overlay.getAttribute('data-show-floating-shield') === '1';
    var cssVersion = overlay.getAttribute('data-css-v') || new Date().getTime();
    if (!code) return;

    var cookieName = 'prototypePopupClosed_' + code;
    var shieldPositionKey = 'prototypeReportShieldPos_' + code;
    var defaultReportText = '';

    /**
     * 读取指定名称的 Cookie 值。
     *
     * @param {string} name Cookie 名称
     * @returns {string|null} Cookie 值
     */
    function getCookie(name) {
        var cookies = document.cookie ? document.cookie.split(';') : [];
        for (var i = 0; i < cookies.length; i++) {
            var part = cookies[i].trim();
            if (part.indexOf(name + '=') === 0) {
                return part.substring(name.length + 1);
            }
        }
        return null;
    }

    function getSiteAssetBaseUrl() {
        return String(window.AX_SITE_URL || window.SITE_URL || 'https://www.axureshow.com').replace(/\/+$/, '');
    }

    /**
     * 从 localStorage 读取盾牌按钮位置。
     *
     * @returns {{left:number,top:number}|null} 已保存的位置
     */
    function getShieldPosition() {
        try {
            var raw = window.localStorage.getItem(shieldPositionKey);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || typeof data.left !== 'number' || typeof data.top !== 'number') {
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    /**
     * 保存盾牌按钮位置。
     *
     * @param {number} left 左侧坐标
     * @param {number} top 顶部坐标
     * @returns {void}
     */
    function saveShieldPosition(left, top) {
        try {
            window.localStorage.setItem(shieldPositionKey, JSON.stringify({
                left: Math.round(left),
                top: Math.round(top)
            }));
        } catch (e) {}
    }

    var mount = overlay;

    /**
     * 关闭提醒弹窗，并记录当天不再弹出。
     *
     * @returns {void}
     */
    function closePopup() {
        var el = mount.querySelector('.prototype-overlay');
        if (el) el.style.display = 'none';
        
        var expires = new Date();
        expires.setHours(23, 59, 59, 999);
        
        var domain = '';
        var host = window.location.hostname;
        if (host.indexOf('axureshow.com') !== -1) {
            domain = '; domain=.axureshow.com';
        }
        
        // 设置 Cookie，包含 SameSite=Lax 以增强兼容性
        document.cookie = cookieName + '=true; expires=' + expires.toUTCString() + '; path=/; SameSite=Lax' + domain + ';';
    }

    /**
     * 打开原型浏览提醒弹窗。
     *
     * @returns {void}
     */
    function openPopup() {
        var el = mount.querySelector('.prototype-overlay');
        if (el) el.style.display = 'flex';
    }

    /**
     * 关闭举报弹窗并重置提交状态。
     *
     * @returns {void}
     */
    function closeReportModal() {
        var modal = mount.querySelector('.prototype-report-modal');
        var statusEl = mount.querySelector('.popup-report-status');
        if (statusEl) {
            setReportStatus(statusEl, '', '');
        }
        if (modal) modal.style.display = 'none';
        // 恢复背景滚动
        document.body.style.overflow = '';
    }

    /**
     * 打开独立的举报弹窗。
     *
     * @returns {void}
     */
    function openReportModal() {
        // 确保容器在 body 最后，防止被 project 内部的 stacking context 盖住
        var container = document.getElementById('prototypeOverlay');
        if (container && container.parentNode === document.body) {
            document.body.appendChild(container);
        }

        var modal = mount.querySelector('.prototype-report-modal');
        var textarea = mount.querySelector('.popup-report-textarea');
        var statusEl = mount.querySelector('.popup-report-status');
        if (statusEl) {
            setReportStatus(statusEl, '', '');
        }
        if (textarea && !textarea.value) {
            textarea.value = defaultReportText;
        }
        if (modal) modal.style.display = 'flex';
        // 禁止背景滚动
        document.body.style.overflow = 'hidden';
        focusReportTextarea(textarea);
    }

    /**
     * 构造默认举报内容，自动附带当前页面链接。
     *
     * @returns {string} 默认举报文本
     */
    function buildDefaultReportText() {
        return '举报链接：' + window.location.href + '\n举报原因：';
    }

    /**
     * 将光标移动到举报原因文本末尾，方便用户继续输入。
     *
     * @param {HTMLTextAreaElement} textarea 举报输入框
     * @returns {void}
     */
    function focusReportTextarea(textarea) {
        if (!textarea) return;
        textarea.focus();
        var len = textarea.value.length;
        try {
            textarea.setSelectionRange(len, len);
        } catch (e) {}
    }

    /**
     * 更新举报状态文案。
     *
     * @param {HTMLElement} statusEl 状态节点
     * @param {string} text 提示文案
     * @param {string} type 状态类型
     * @returns {void}
     */
    function setReportStatus(statusEl, text, type) {
        if (!statusEl) return;
        statusEl.className = 'popup-report-status' + (type ? ' is-' + type : '');
        statusEl.textContent = text || '';
    }

    /**
     * 绑定举报相关交互，包括打开、关闭与提交举报。
     *
     * @returns {void}
     */
    function bindReportActions() {
        var openBtn = mount.querySelector('[data-role="open-report"]');
        var cancelBtn = mount.querySelector('[data-role="cancel-report"]');
        var submitBtn = mount.querySelector('[data-role="submit-report"]');
        var textarea = mount.querySelector('.popup-report-textarea');
        var statusEl = mount.querySelector('.popup-report-status');
        var closeBtn = mount.querySelector('[data-role="close-report"]');
        var modal = mount.querySelector('.prototype-report-modal');

        if (!openBtn || !cancelBtn || !submitBtn || !textarea || !statusEl || !closeBtn || !modal) {
            return;
        }

        textarea.value = defaultReportText;

        openBtn.onclick = function () {
            openReportModal();
        };

        cancelBtn.onclick = function () {
            closeReportModal();
        };

        closeBtn.onclick = closeReportModal;

        modal.onclick = function (event) {
            if (event.target === modal) {
                closeReportModal();
            }
        };

        submitBtn.onclick = function () {
            var description = String(textarea.value || '').trim();
            if (description === '' || description === defaultReportText.trim()) {
                setReportStatus(statusEl, '请填写举报原因后再提交', 'error');
                focusReportTextarea(textarea);
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '提交中...';
            setReportStatus(statusEl, '正在提交举报...', 'loading');

            var xhr = new XMLHttpRequest();
            xhr.open('POST', reportSubmitUrl, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;

                submitBtn.disabled = false;
                submitBtn.textContent = '提交到反馈';

                var data = null;
                try {
                    data = JSON.parse(xhr.responseText || '{}');
                } catch (e) {}

                if (data && data.need_login && data.login_url) {
                    setReportStatus(statusEl, '正在跳转登录...', 'loading');
                    window.location.href = data.login_url || reportLoginUrl;
                    return;
                }

                if (!data || !data.success) {
                    setReportStatus(statusEl, (data && data.message) ? data.message : '举报提交失败，请稍后重试', 'error');
                    return;
                }

                setReportStatus(statusEl, data.message || '举报已提交，感谢反馈', 'success');
                window.setTimeout(function () {
                    closeReportModal();
                }, 1200);
            };
            xhr.send(
                'category_id=5'
                + '&description=' + encodeURIComponent(description)
                + '&csrf_token=' + encodeURIComponent(csrfToken)
            );
        };
    }

    /**
     * 绑定左侧悬浮盾牌的拖动与点击事件。
     *
     * @returns {void}
     */
    function bindFloatingShield() {
        var shield = mount.querySelector('.prototype-report-shield');
        if (!shield) return;

        var saved = getShieldPosition();
        var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        var maxLeft = Math.max(12, viewportWidth - 72);
        var maxTop = Math.max(12, viewportHeight - 72);

        if (saved) {
            shield.style.left = Math.min(Math.max(12, saved.left), maxLeft) + 'px';
            shield.style.top = Math.min(Math.max(12, saved.top), maxTop) + 'px';
        } else {
            shield.style.left = '16px';
            shield.style.top = Math.max(88, Math.round(viewportHeight * 0.35)) + 'px';
        }

        var isDragging = false;
        var moved = false;
        var startX = 0;
        var startY = 0;
        var originLeft = 0;
        var originTop = 0;

        function getPoint(event) {
            if (event.touches && event.touches[0]) return event.touches[0];
            if (event.changedTouches && event.changedTouches[0]) return event.changedTouches[0];
            return event;
        }

        function onMove(event) {
            if (!isDragging) return;
            var point = getPoint(event);
            var nextLeft = originLeft + (point.clientX - startX);
            var nextTop = originTop + (point.clientY - startY);
            var limitLeft = Math.max(12, (window.innerWidth || document.documentElement.clientWidth || 0) - shield.offsetWidth - 12);
            var limitTop = Math.max(12, (window.innerHeight || document.documentElement.clientHeight || 0) - shield.offsetHeight - 12);

            if (Math.abs(point.clientX - startX) > 4 || Math.abs(point.clientY - startY) > 4) {
                moved = true;
            }

            nextLeft = Math.min(Math.max(12, nextLeft), limitLeft);
            nextTop = Math.min(Math.max(12, nextTop), limitTop);
            shield.style.left = nextLeft + 'px';
            shield.style.top = nextTop + 'px';
            event.preventDefault();
        }

        function onEnd() {
            if (!isDragging) return;
            isDragging = false;
            shield.classList.remove('is-dragging');
            saveShieldPosition(shield.offsetLeft, shield.offsetTop);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove, { passive: false });
            window.removeEventListener('touchend', onEnd);
        }

        function onStart(event) {
            var point = getPoint(event);
            isDragging = true;
            moved = false;
            startX = point.clientX;
            startY = point.clientY;
            originLeft = shield.offsetLeft;
            originTop = shield.offsetTop;
            shield.classList.add('is-dragging');
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onEnd);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onEnd);
        }

        shield.addEventListener('mousedown', onStart);
        shield.addEventListener('touchstart', onStart, { passive: true });
        shield.addEventListener('click', function (event) {
            if (moved) {
                moved = false;
                event.preventDefault();
                return;
            }
            openPopup();
        });
    }

    /**
     * 渲染并显示原型提醒弹窗。
     *
     * @returns {void}
     */
    function renderAndShow() {
        // Cookie 仅控制弹窗是否自动出现，不应影响悬浮举报入口渲染
        if (mount.querySelector('.prototype-overlay')) return;

        defaultReportText = buildDefaultReportText();

        var html = '';
        if (showFloatingShield) {
            html += '<button type="button" class="prototype-report-shield" aria-label="举报此原型">';
            html += '<span class="prototype-report-shield-icon" aria-hidden="true">';
            html += '<svg viewBox="0 0 24 24" fill="none" focusable="false"><path d="M12 3l7 3v5c0 5.25-3.438 9.694-7 10.95C8.438 20.694 5 16.25 5 11V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><path d="M12 8v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><circle cx="12" cy="15.5" r="1" fill="currentColor"></circle></svg>';
            html += '</span>';
            html += '<span class="prototype-report-shield-text">举报</span>';
            html += '</button>';
        }
        html += '<div class="prototype-overlay" style="display:none">';
        html += '<div class="prototype-popup">';
        html += '<div class="popup-header">';
        html += '<h3 class="popup-title">原型浏览提醒</h3>';
        html += '<button type="button" class="popup-close-btn" data-role="close">×</button>';
        html += '</div>';
        html += '<div class="popup-message">你正访问的是原型演示，并非真实网站，请勿在页面中留下个人信息；若发现有违法违规或侵害权益的内容，可点击举报向我们举报。</div>';
        html += '<div class="popup-actions">';
        html += '<button type="button" class="popup-btn report-btn" data-role="open-report">举报</button>';
        html += '<button type="button" class="popup-btn close-btn" data-role="close">我知道了</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="prototype-report-modal" style="display:none">';
        html += '<div class="prototype-report-dialog">';
        html += '<div class="popup-header">';
        html += '<h3 class="popup-title">举报</h3>';
        html += '<button type="button" class="popup-close-btn" data-role="close-report">×</button>';
        html += '</div>';
        html += '<label class="popup-report-label" for="prototypeReportReason">举报原因</label>';
        html += '<textarea id="prototypeReportReason" class="popup-report-textarea" placeholder="请补充说明违规或侵权情况"></textarea>';
        html += '<div class="popup-report-status" aria-live="polite"></div>';
        html += '<div class="popup-actions popup-report-actions">';
        html += '<button type="button" class="popup-btn report-cancel-btn" data-role="cancel-report">取消</button>';
        html += '<button type="button" class="popup-btn report-submit-btn" data-role="submit-report">提交到反馈</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        mount.innerHTML += html;

        var closeBtns = mount.querySelectorAll('[data-role="close"]');
        for (var i = 0; i < closeBtns.length; i++) {
            closeBtns[i].onclick = closePopup;
        }

        bindReportActions();
        bindFloatingShield();

        var el = mount.querySelector('.prototype-overlay');
        // 只要开启了提醒且今天未关闭过，就默认展示弹窗（不再受 showFloatingShield 限制）
        if (el && getCookie(cookieName) !== 'true') {
            el.style.display = 'flex';
        }
    }

    function ensurePrototypePopupCssReady(callback) {
        var href = getSiteAssetBaseUrl() + '/style/css/prototype-popup.css?v=' + cssVersion;
        var link = document.querySelector('link[data-ax-prototype-style="prototype-popup"]');
        if (!link) {
            link = document.querySelector('link[href*="prototype-popup.css"]');
            if (link) {
                link.setAttribute('data-ax-prototype-style', 'prototype-popup');
            }
        }

        var done = false;
        function finish() {
            if (done) return;
            done = true;
            if (typeof callback === 'function') callback();
        }

        function isLoaded(el) {
            try {
                return !!(el && el.sheet);
            } catch (e) {
                return false;
            }
        }

        if (link && isLoaded(link)) {
            finish();
            return;
        }

        if (!link) {
            link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.setAttribute('data-ax-prototype-style', 'prototype-popup');
            (document.head || document.documentElement).appendChild(link);
        }

        link.addEventListener('load', finish, { once: true });
        link.addEventListener('error', finish, { once: true });
        setTimeout(finish, 3000);
    }

    ensurePrototypePopupCssReady(renderAndShow);
})();
