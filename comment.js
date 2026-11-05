(function () {
    if (window.top !== window.self) return;

    var root = document.getElementById('ax-comment-root');
    if (!root) return;

    var code = root.getAttribute('data-project-code') || '';
    if (!code) return;
    
    var sourceUrl = root.getAttribute('data-source-url') || '';
    var cssVersion = root.getAttribute('data-css-v') || new Date().getTime();

    var mount = root;
    try {
        root.style.display = 'none';
        root.style.visibility = 'hidden';
    } catch (e) {}

    var btn = document.createElement('div');
    btn.className = 'ax-comment-floating-btn';
    btn.innerHTML = '<span class="ax-comment-icon"></span>';

    var panel = document.createElement('div');
    panel.className = 'ax-comment-panel';

    var panelStateKey = 'ax_comment_panel_' + code;
    var started = false;
    var mounted = false;

    var state = {
        loaded: false,
        loggedIn: false,
        csrf: '',
        userId: 0,
        isOwner: false,
        isAdmin: false,
        starlightEnabled: false,
        flowersTotal: 0,
        flowersMine: 0,
        comments: [],
        pageSize: 10,
        visibleCount: 10,
        replyTo: null,
        loading: false
    };

    /**
     * 功能：生成当前项目域名下的评论接口地址，确保登录 Session 与评论请求同源。
     * 参数：path 为评论接口路径。
     * 返回值：string，当前访问域名下的完整接口地址。
     */
    function getCommentApiUrl(path) {
        var baseUrl = String(window.location.origin || '').replace(/\/+$/, '');
        var cleanPath = String(path || '').trim();
        if (!cleanPath) {
            return baseUrl;
        }
        return cleanPath.charAt(0) === '/' ? (baseUrl + cleanPath) : (baseUrl + '/' + cleanPath.replace(/^\/+/, ''));
    }

    /**
     * 功能：获取公共样式资源所在的主站地址。
     * 参数：无。
     * 返回值：string，公共资源基础地址。
     */
    function getSiteAssetBaseUrl() {
        return String(window.AX_SITE_URL || window.SITE_URL || 'https://www.axureshow.com').replace(/\/+$/, '');
    }

    /**
     * 功能：按当前项目域名生成登录地址；程序主域子域进入主站登录，其他根域使用跨域 SSO。
     * 参数：returnUrl 为登录完成后返回的项目地址。
     * 返回值：string，可直接跳转的登录地址。
     */
    function getInteractionLoginUrl(returnUrl) {
        var host = String(window.location.hostname || '').toLowerCase();
        var isProgramHost = host === 'axureshow.com' || /\.axureshow\.com$/.test(host);
        if (isProgramHost) {
            return 'https://www.axureshow.com/yanshiadmin/index.php?source=' + encodeURIComponent(returnUrl || '');
        }
        return String(window.location.origin || '')
            + '/api/cross_domain_sso.php?action=start&return_url='
            + encodeURIComponent(returnUrl || '');
    }

    var currentSourceUrl = window.location.href || sourceUrl;
    var loginUrl = getInteractionLoginUrl(currentSourceUrl);

    function showCommentRoot() {
        try { 
            // 只有当样式加载完成或超时强制显示时才真正移除 display:none
            root.style.setProperty('display', 'block', 'important'); 
            root.style.visibility = 'visible';
        } catch (e) {}
    }

    function mountCommentUi() {
        if (mounted) return;
        mounted = true;

        root.style.display = 'none';
        root.style.visibility = 'hidden';

        mount.appendChild(btn);
        mount.appendChild(panel);

        startUiOnce();
    }

    function ensureCommentCssReady(callback) {
        var href = getSiteAssetBaseUrl() + '/style/css/comment.css?v=' + cssVersion;
        var link = document.querySelector('link[data-ax-comment-style="comment"]');
        if (!link) {
            link = document.querySelector('link[href*="comment.css"]');
            if (link) {
                link.setAttribute('data-ax-comment-style', 'comment');
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
            link.setAttribute('data-ax-comment-style', 'comment');
            document.head.appendChild(link);
        }

        link.addEventListener('load', finish, { once: true });
        link.addEventListener('error', finish, { once: true });
        setTimeout(finish, 3000);
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showToast(msg) {
        if (!panel) return;
        var box = panel.querySelector('.ax-comment-toast');
        if (!box) {
            box = document.createElement('div');
            box.className = 'ax-comment-toast';
            panel.appendChild(box);
        }
        box.textContent = String(msg || '');
        box.style.display = 'block';
        box.className = 'ax-comment-toast ax-comment-toast-show';
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(function () {
            box.className = 'ax-comment-toast';
        }, 2000);
    }

    function getCookie(name) {
        var match = document.cookie.match(new RegExp('(?:^|; )' + encodeURIComponent(name) + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : null;
    }

    function setCookie(name, value, days) {
        var expires = '';
        if (days) {
            var d = new Date();
            d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
            expires = '; expires=' + d.toUTCString();
        }
        document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value) + expires + '; path=/';
    }

    /**
     * 功能：仅在用户执行互动操作时启动跨域单点登录，并记录登录后要恢复的操作。
     * 参数：action 字符串，登录后要恢复的互动操作；data 对象，恢复操作需要的数据。
     * 返回值：boolean，始终返回 true 表示已启动登录跳转。
     */
    function startInteractionSso(action, data) {
        if (state.loggedIn && state.csrf) {
            return false;
        }
        if (window.sessionStorage) {
            window.sessionStorage.setItem('ax_comment_pending_action:' + code, JSON.stringify({
                action: action || 'login',
                data: data || {}
            }));
        }
        window.location.href = loginUrl;
        return true;
    }

    /**
     * 功能：单点登录返回并确认已登录后，恢复送花等用户原操作。
     * 参数：无。
     * 返回值：void。
     */
    function resumePendingInteraction() {
        if (!state.loggedIn || !window.sessionStorage) return;
        var key = 'ax_comment_pending_action:' + code;
        var raw = window.sessionStorage.getItem(key);
        if (!raw) return;
        window.sessionStorage.removeItem(key);
        try {
            var pending = JSON.parse(raw);
            if (pending.action === 'flower') {
                handleFlower(parseInt(pending.data.value, 10) || 0);
            }
        } catch (e) {}
    }

    function fetchState(cb) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', getCommentApiUrl('/api/comment_state.php?code=' + encodeURIComponent(code) + '&_t=' + new Date().getTime()), true);
        xhr.withCredentials = true;
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var res = JSON.parse(xhr.responseText);
                        if (res && res.success && res.data) {
                            state.loggedIn = !!res.data.loggedIn;
                            state.csrf = res.data.csrf || '';
                            state.userId = res.data.userId || 0;
                            state.isOwner = !!res.data.isOwner;
                            state.isAdmin = !!res.data.isAdmin;
                            state.starlightEnabled = !!res.data.starlightEnabled;
                            state.flowersTotal = res.data.flowers ? (res.data.flowers.total || 0) : 0;
                            state.flowersMine = res.data.flowers ? (res.data.flowers.mine || 0) : 0;
                            state.comments = res.data.comments || [];
                            state.visibleCount = Math.max(Math.min(state.visibleCount || 0, state.comments.length || 0), Math.min(state.pageSize, state.comments.length || 0));
                            state.loaded = true;
                        }
                    } catch (e) {}
                }
                if (typeof cb === 'function') cb();
            }
        };
        xhr.send(null);
    }

    /* 返回当前面板需要展示的最新评论列表。 */
    function getVisibleComments() {
        var comments = state.comments || [];
        var total = comments.length;
        var count = Math.min(Math.max(state.visibleCount || state.pageSize || 10, 0), total);
        return count > 0 ? comments.slice(total - count) : [];
    }

    /* 将评论列表滚动到底部，默认直接看到最新内容。 */
    function scrollCommentListToBottom() {
        var listEl = panel.querySelector('.ax-comment-list');
        if (!listEl) return;
        listEl.scrollTop = listEl.scrollHeight;
        updateLoadMoreVisibility(listEl);
    }

    /* 只在滚动到顶部时显示“加载更多”入口。 */
    function updateLoadMoreVisibility(listEl) {
        if (!listEl) return;
        var loadMoreEl = listEl.querySelector('.ax-comment-load-more');
        if (!loadMoreEl) return;
        var atTop = listEl.scrollTop <= 4;
        if (atTop) {
            loadMoreEl.classList.add('ax-visible');
        } else {
            loadMoreEl.classList.remove('ax-visible');
        }
    }

    /* 顶部点击后再补 10 条，并保持用户当前视口不跳动。 */
    function loadMoreComments() {
        var oldListEl = panel.querySelector('.ax-comment-list');
        if (!oldListEl) return;
        var previousScrollHeight = oldListEl.scrollHeight;
        var previousScrollTop = oldListEl.scrollTop;
        var total = (state.comments || []).length;
        if (state.visibleCount >= total) return;

        state.visibleCount = Math.min(total, (state.visibleCount || state.pageSize || 10) + (state.pageSize || 10));
        renderPanel();

        var newListEl = panel.querySelector('.ax-comment-list');
        if (!newListEl) return;
        var scrollDelta = newListEl.scrollHeight - previousScrollHeight;
        newListEl.scrollTop = previousScrollTop + scrollDelta;
        updateLoadMoreVisibility(newListEl);
    }

    function renderPanel() {
        var html = '';

        html += '<div class="ax-comment-header">';
        html += '<div class="ax-comment-title">评论互动</div>';
        html += '<div class="ax-comment-header-right">';
        html += '<div class="ax-comment-flower-count">送星光 ' + (state.flowersTotal || 0) + '</div>';
        html += '<div class="ax-comment-flower-row">';
        for (var i = 1; i <= 5; i++) {
            var active = state.flowersMine >= i ? ' ax-active' : '';
            html += '<span class="ax-comment-flower-icon' + active + '" data-value="' + i + '" data-role="vote-starlight">✦</span>';
        }
        html += '</div>';
        html += '<button class="ax-comment-close-btn" data-role="close">×</button>';
        html += '</div></div>';

        html += '<div class="ax-comment-body">';
        html += '<div class="ax-comment-list">';

        if (!state.loggedIn) {
            html += '<div class="ax-comment-empty">登录后可查看互动内容并送出星光。<a class="ax-comment-login-link" href="' + loginUrl + '">去登录</a></div>';
        } else if (!state.comments || state.comments.length === 0) {
            html += '<div class="ax-comment-empty">还没有互动内容，欢迎留下你的第一条想法。</div>';
        } else {
            var visibleComments = getVisibleComments();
            if (visibleComments.length < state.comments.length) {
                html += '<div class="ax-comment-load-more" data-role="load-more">加载更多</div>';
            }
            var tree = buildTree(visibleComments);
            for (var i = 0; i < tree.length; i++) {
                html += renderCommentNode(tree[i], 0);
            }
        }

        html += '</div>';

        html += '<div class="ax-comment-footer">';
        if (!state.loggedIn) {
            html += '<div class="ax-comment-login-tip">请先<a class="ax-comment-login-link" href="' + loginUrl + '">登录</a>后参与互动。</div>';
        } else {
            html += '<div class="ax-comment-input-wrapper">';
            html += '<input type="text" class="ax-comment-input" placeholder="写下你的观点、建议或鼓励..." />';
            html += '</div>';
            
            html += '<div class="ax-comment-action-row" style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">';
            html += '<div class="ax-comment-captcha-wrapper" style="display:flex;align-items:center;">';
            html += '<input type="text" class="ax-comment-captcha-input" placeholder="验证码" style="width:80px;height:28px;margin-right:8px;padding:0 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:14px;" />';
            html += '<img src="' + getCommentApiUrl('/api/captcha.php?t=' + new Date().getTime()) + '" class="ax-comment-captcha-img" alt="验证码" title="点击刷新" style="cursor:pointer;height:28px;vertical-align:middle;border-radius:4px;" data-role="refresh-captcha" />';
            html += '</div>';
            html += '<button class="ax-comment-send-btn" data-role="send" style="height:28px;">发送</button>';
            html += '</div>';

            var tgt = state.replyTo ? findCommentById(state.replyTo) : null;
            var tname = tgt && tgt.user && tgt.user.name ? escapeHtml(tgt.user.name) : '';
            var tcont = tgt && tgt.content ? escapeHtml(String(tgt.content).slice(0, 24)) : '';
            html += '<div class="ax-comment-replying-tip" style="display:' + (state.replyTo ? 'flex' : 'none') + '">';
            html += '<span>' + (tname ? ('回复 @' + tname) : '回复') + (tcont ? ('：' + tcont) : '') + '</span>';
            html += '<span class="ax-comment-goto-reply" data-role="goto-reply">定位原评论</span>';
            html += '<span class="ax-comment-cancel-reply" data-role="cancel-reply">取消回复</span>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';

        panel.innerHTML = html;

        panel.onclick = function (e) {
            var target = e.target || e.srcElement;
            var role = target.getAttribute('data-role');
            if (role === 'close') {
                togglePanel(false);
                return;
            }
            if (role === 'refresh-captcha') {
                target.src = getCommentApiUrl('/api/captcha.php?t=' + new Date().getTime());
                return;
            }
            if (target.className && target.className.indexOf('ax-comment-login-link') !== -1) {
                e.preventDefault();
                startInteractionSso('login', {});
                return;
            }
            if (role === 'vote-starlight' || (target.className && target.className.indexOf('ax-comment-flower-icon') !== -1)) {
                var value = parseInt(target.getAttribute('data-value'), 10) || 0;
                handleFlower(value);
                return;
            }
            if (role === 'send') {
                handleSend();
                return;
            }
            if (role === 'load-more') {
                loadMoreComments();
                return;
            }
            if (role === 'cancel-reply') {
                state.replyTo = null;
                renderPanel();
                return;
            }
            if (role === 'goto-reply') {
                var listEl = panel.querySelector('.ax-comment-list');
                if (listEl && state.replyTo) {
                    var targetEl = listEl.querySelector('#axc-' + state.replyTo);
                    if (targetEl) {
                        var top = targetEl.offsetTop - listEl.offsetTop;
                        listEl.scrollTop = top - 12;
                    }
                }
                return;
            }
            if (target.getAttribute('data-role') === 'reply') {
                var cid = parseInt(target.getAttribute('data-id'), 10) || 0;
                if (cid > 0) {
                    state.replyTo = cid;
                    renderPanel();
                }
            }
        };

        var listEl = panel.querySelector('.ax-comment-list');
        if (listEl) {
            listEl.addEventListener('scroll', function () {
                updateLoadMoreVisibility(listEl);
            });
            updateLoadMoreVisibility(listEl);
        }

        var flowerRow = panel.querySelector('.ax-comment-flower-row');
        if (flowerRow) {
            flowerRow.addEventListener('mousemove', function (e) {
                var t = e.target || e.srcElement;
                if (!t || !t.classList || !t.classList.contains('ax-comment-flower-icon')) return;
                var v = parseInt(t.getAttribute('data-value'), 10) || 0;
                var icons = flowerRow.querySelectorAll('.ax-comment-flower-icon');
                for (var i = 0; i < icons.length; i++) {
                    var iv = parseInt(icons[i].getAttribute('data-value'), 10) || 0;
                    if (iv <= v) {
                        icons[i].classList.add('ax-preview');
                    } else {
                        icons[i].classList.remove('ax-preview');
                    }
                }
            });
            flowerRow.addEventListener('mouseleave', function () {
                var icons = flowerRow.querySelectorAll('.ax-comment-flower-icon.ax-preview');
                for (var i = 0; i < icons.length; i++) {
                    icons[i].classList.remove('ax-preview');
                }
            });
        }

        var headerEl = panel.querySelector('.ax-comment-header');
        var footerEl = panel.querySelector('.ax-comment-footer');
        var stopWheel = function (e) { e.preventDefault(); };
        if (headerEl) {
            try { headerEl.addEventListener('wheel', stopWheel, { passive: false }); } catch (ex) { headerEl.addEventListener('wheel', stopWheel); }
        }
        if (footerEl) {
            try { footerEl.addEventListener('wheel', stopWheel, { passive: false }); } catch (ex2) { footerEl.addEventListener('wheel', stopWheel); }
        }
    }

    function buildTree(list) {
        var map = {};
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            item.children = [];
            map[item.id] = item;
        }
        var roots = [];
        for (var j = 0; j < list.length; j++) {
            var it = list[j];
            if (it.parent_id && map[it.parent_id]) {
                map[it.parent_id].children.push(it);
            } else {
                roots.push(it);
            }
        }
        return roots;
    }

    function findCommentById(id) {
        id = parseInt(id, 10) || 0;
        if (!id || !state.comments || !state.comments.length) return null;
        for (var i = 0; i < state.comments.length; i++) {
            if ((state.comments[i].id || 0) === id) return state.comments[i];
        }
        return null;
    }

    function renderCommentNode(node, depth) {
        var indent = depth > 0 ? ' style="margin-left:' + Math.min(depth * 16, 40) + 'px"' : '';
        var html = '';
        html += '<div class="ax-comment-item" id="axc-' + node.id + '"' + indent + '>';
        html += '<div class="ax-comment-avatar"><img src="' + escapeHtml(node.user && node.user.avatar_url) + '" alt="" /></div>';
        html += '<div class="ax-comment-main">';
        html += '<div class="ax-comment-user-row">';
        html += '<span class="ax-comment-name">' + escapeHtml(node.user && node.user.name) + '</span>';
        html += '<span class="ax-comment-meta">' + escapeHtml(node.created_at) + '</span>';
        html += '</div>';
        html += '<div class="ax-comment-content">' + escapeHtml(node.content) + '</div>';
        html += '<div class="ax-comment-actions">';
        if (state.loggedIn) {
            html += '<span class="ax-comment-reply-link" data-role="reply" data-id="' + node.id + '">回复</span>';
        }
        html += '</div>';
        html += '</div></div>';
        if (node.children && node.children.length) {
            for (var i = 0; i < node.children.length; i++) {
                html += renderCommentNode(node.children[i], depth + 1);
            }
        }
        return html;
    }

    function handleFlower(value) {
        if (!state.loggedIn || !state.csrf) {
            startInteractionSso('flower', { value: value });
            return;
        }
        if ((state.flowersMine || 0) > 0) {
            showToast('已送星光，不可修改');
            return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open('POST', getCommentApiUrl('/api/flower_set.php'), true);
        xhr.withCredentials = true;
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var res = JSON.parse(xhr.responseText);
                        if (res && res.success && res.data) {
                            state.flowersMine = res.data.mine || 0;
                            state.flowersTotal = res.data.total || 0;
                            renderPanel();
                        }
                    } catch (e) {}
                } else if (xhr.status === 401) {
                    showToast('请先登录后再送星光');
                } else if (xhr.status === 400) {
                    try {
                        var res2 = JSON.parse(xhr.responseText);
                        if (res2 && res2.data) {
                            state.flowersMine = res2.data.mine || state.flowersMine || 0;
                            state.flowersTotal = res2.data.total || state.flowersTotal || 0;
                            renderPanel();
                        }
                        showToast((res2 && res2.message) ? res2.message : '已送星光不可修改');
                    } catch (e2) {
                        showToast('已送星光不可修改');
                    }
                }
            }
        };
        xhr.send('code=' + encodeURIComponent(code) + '&value=' + encodeURIComponent(value) + '&csrf=' + encodeURIComponent(state.csrf));
    }

    function handleSend() {
        if (state.loading) return;
        if (!state.loggedIn || !state.csrf) {
            startInteractionSso('comment', {});
            return;
        }
        var input = panel.querySelector('.ax-comment-input');
        if (!input) return;
        var text = input.value || '';
        if (!text.replace(/\s+/g, '')) return;
        
        var captchaInput = panel.querySelector('.ax-comment-captcha-input');
        var captcha = captchaInput ? captchaInput.value : '';
        if (!captcha) {
            showToast('请输入验证码');
            return;
        }

        state.loading = true;
        var btnEl = panel.querySelector('.ax-comment-send-btn');
        if (btnEl) btnEl.disabled = true;

        var xhr = new XMLHttpRequest();
        xhr.open('POST', getCommentApiUrl('/api/comment_add.php'), true);
        xhr.withCredentials = true;
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                state.loading = false;
                if (btnEl) btnEl.disabled = false;
                
                // Refresh CAPTCHA always after attempt
                var captchaImg = panel.querySelector('.ax-comment-captcha-img');
                if (captchaImg) {
                    captchaImg.src = getCommentApiUrl('/api/captcha.php?t=' + new Date().getTime());
                }

                if (xhr.status === 200) {
                    try {
                        var res = JSON.parse(xhr.responseText);
                        if (res && res.success) {
                            input.value = '';
                            if (captchaInput) captchaInput.value = '';
                            state.replyTo = null;
                            fetchState(function () {
                                renderPanel();
                                scrollCommentListToBottom();
                            });
                        } else if (res && res.message) {
                            showToast(res.message);
                        }
                    } catch (e) {}
                } else if (xhr.status === 400) {
                    try {
                        var res = JSON.parse(xhr.responseText);
                        if (res && res.message) {
                            showToast(res.message);
                        } else {
                            showToast('提交失败，请检查输入');
                        }
                    } catch (e) {
                        showToast('提交失败，请检查输入');
                    }
                } else {
                    showToast('提交失败，请稍后重试');
                }
            }
        };
        var params = 'code=' + encodeURIComponent(code)
            + '&content=' + encodeURIComponent(text)
            + '&captcha=' + encodeURIComponent(captcha)
            + '&csrf=' + encodeURIComponent(state.csrf);
        if (state.replyTo) {
            params += '&parent_id=' + encodeURIComponent(state.replyTo);
        }
        xhr.send(params);
    }

    function togglePanel(open) {
        if (open) {
            panel.className = panel.className.replace(/\bax-open\b/, '').trim() + ' ax-open';
            if (btn) btn.style.display = 'none';
            setCookie(panelStateKey, 'open', 30);
            setTimeout(scrollCommentListToBottom, 0);
        } else {
            panel.className = panel.className.replace(/\bax-open\b/, '').trim();
            if (btn) btn.style.display = '';
            setCookie(panelStateKey, 'closed', 30);
        }
    }

    btn.onclick = function (e) {
        if (btn._isDragging) return;
        if (!state.loaded) {
            fetchState(function () {
                renderPanel();
                togglePanel(true);
            });
        } else {
            if (panel.className.indexOf('ax-open') === -1) {
                renderPanel();
                togglePanel(true);
            } else {
                togglePanel(false);
            }
        }
    };

    function makeDraggable(el) {
        var isDragging = false;
        var startX, startY, initialLeft, initialTop;
        var threshold = 5;

        el.style.cursor = 'move';

        el.onmousedown = function (e) {
            isDragging = false;
            el._isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            var rect = el.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            document.onmousemove = function (e) {
                var dx = e.clientX - startX;
                var dy = e.clientY - startY;
                if (!isDragging && (Math.abs(dx) > threshold || Math.abs(dy) > threshold)) {
                    isDragging = true;
                    el._isDragging = true;
                    el.style.bottom = 'auto';
                    el.style.right = 'auto';
                }
                if (isDragging) {
                    var newLeft = initialLeft + dx;
                    var newTop = initialTop + dy;
                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
                    el.style.left = newLeft + 'px';
                    el.style.top = newTop + 'px';
                }
            };

            document.onmouseup = function () {
                document.onmousemove = null;
                document.onmouseup = null;
                setTimeout(function() {
                    isDragging = false;
                }, 10);
            };
            // e.preventDefault(); // 移除以防阻止点击
        };
    }

    makeDraggable(btn);

    function startUi() {
        renderPanel();
        
        var isMobile = false;
        if (window.innerWidth <= 768) isMobile = true;
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) isMobile = true;

        var initialState = getCookie(panelStateKey);
        if (initialState === 'closed') {
            togglePanel(false);
        } else if (initialState === 'open') {
            togglePanel(true);
        } else {
            if (isMobile) {
                togglePanel(false);
            } else {
                togglePanel(true);
            }
        }
        
        fetchState(function () {
            renderPanel();
            resumePendingInteraction();
            if (panel.className.indexOf('ax-open') !== -1) {
                scrollCommentListToBottom();
            }
        });
    }

    function startUiOnce() {
        if (started) return;
        started = true;
        startUi();
    }

    function waitForCssAndShow() {
        if (mounted) {
            return;
        }

        // 先临时挂载到隐藏容器中，确认样式已生效后再正式展示组件。
        mount.appendChild(btn);

        var tries = 0;
        function tick() {
            tries++;
            var ok = false;
            try {
                var cs = window.getComputedStyle(btn);
                // 只要样式生效，btn 应该是 fixed 定位（见 comment.css）
                ok = !!cs && cs.position === 'fixed';
            } catch (e) {
                ok = true;
            }

            if (ok || tries >= 60) { // 3秒超时
                if (ok) {
                    // console.log('[Comment] CSS 样式加载确认成功');
                } else {
                    console.warn('[Comment] CSS 加载确认超时，强制显示');
                }
                
                // 样式 OK 了，再正式挂载并显示
                if (btn.parentNode === mount) {
                    mount.removeChild(btn);
                }
                mountCommentUi();
                showCommentRoot();
                return;
            }
            setTimeout(tick, 50);
        }
        tick();
    }

    ensureCommentCssReady(function () {
        waitForCssAndShow();
    });
})();
