/**
 * 统一处理站点接口地址、跨域凭证和新旧接口兼容。
 */
(function () {
    var root = window;
    var existingConfig = root.__AX_API_ROUTER__ || {};
    var currentScript = document.currentScript;

    /**
     * 去除地址末尾的斜杠，便于后续统一拼接。
     *
     * @param {string} value 原始地址
     * @returns {string} 规范化后的地址
     */
    function trimTrailingSlash(value) {
        return String(value || '').trim().replace(/\/+$/, '');
    }

    /**
     * 解析布尔型配置值。
     *
     * @param {string|boolean|number} value 原始值
     * @param {boolean} fallback 默认值
     * @returns {boolean} 解析结果
     */
    function parseBoolean(value, fallback) {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        var text = String(value || '').trim().toLowerCase();
        if (!text) {
            return !!fallback;
        }
        return ['1', 'true', 'yes', 'on'].indexOf(text) !== -1;
    }

    /**
     * 将逗号分隔的路径配置转为数组。
     *
     * @param {string} value 原始配置
     * @returns {string[]} 路径列表
     */
    function parsePathList(value) {
        var text = String(value || '').trim();
        if (!text) {
            return [];
        }
        return text.split(',').map(function (item) {
            var path = String(item || '').trim();
            if (!path) {
                return '';
            }
            return path.charAt(0) === '/' ? path : '/' + path.replace(/^\/+/, '');
        }).filter(Boolean);
    }

    /**
     * 判断是否为绝对地址。
     *
     * @param {string} value 地址文本
     * @returns {boolean} 是否绝对地址
     */
    function isAbsoluteUrl(value) {
        return /^[a-z][a-z0-9+.-]*:/i.test(String(value || '').trim());
    }

    /**
     * 获取地址的路径部分，解析失败时返回原值。
     *
     * @param {string} value 地址文本
     * @returns {string} 路径
     */
    function getUrlPathname(value) {
        var text = String(value || '').trim();
        if (!text) {
            return '';
        }
        try {
            return new URL(text, root.location.href).pathname || '';
        } catch (error) {
            return text.split('?')[0].split('#')[0];
        }
    }

    /**
     * 将传入值规范为接口相对路径。
     *
     * @param {string} value 原始路径
     * @returns {string} 规范后的接口路径
     */
    function normalizeApiPath(value) {
        var text = String(value || '').trim();
        if (!text) {
            return '';
        }
        if (isAbsoluteUrl(text)) {
            return getUrlPathname(text);
        }
        var cleanText = text.split('?')[0].split('#')[0];
        if (cleanText.indexOf('/api/') === 0) {
            return cleanText;
        }
        if (cleanText.indexOf('api/') === 0) {
            return '/' + cleanText;
        }
        if (/^[a-z0-9_.-]+\.php$/i.test(cleanText)) {
            return '/api/' + cleanText.replace(/^\/+/, '');
        }
        return cleanText;
    }

    /**
     * 合并当前脚本标签上的配置。
     *
     * @param {HTMLScriptElement|null} script 标签对象
     * @returns {void}
     */
    function applyScriptConfig(script) {
        if (!script || !script.dataset) {
            return;
        }
        if (script.dataset.apiSiteUrl) {
            existingConfig.apiSiteUrl = script.dataset.apiSiteUrl;
        }
        if (script.dataset.legacyApiSiteUrl) {
            existingConfig.legacyApiSiteUrl = script.dataset.legacyApiSiteUrl;
        }
        if (script.dataset.legacyEnabled) {
            existingConfig.legacyEnabled = script.dataset.legacyEnabled;
        }
        if (script.dataset.wechatLegacyPaths) {
            existingConfig.wechatLegacyPaths = script.dataset.wechatLegacyPaths;
        }
    }

    applyScriptConfig(currentScript);
    existingConfig.apiSiteUrl = trimTrailingSlash(existingConfig.apiSiteUrl || root.API_SITE_URL || root.location.origin);
    existingConfig.legacyApiSiteUrl = trimTrailingSlash(existingConfig.legacyApiSiteUrl || root.LEGACY_API_SITE_URL || root.location.origin);
    existingConfig.legacyEnabled = parseBoolean(existingConfig.legacyEnabled, root.LEGACY_API_ENABLED);
    existingConfig.wechatLegacyPaths = parsePathList(existingConfig.wechatLegacyPaths || [
        '/api/wechat_code_create.php',
        '/api/wechat_code_status.php',
        '/api/wechat_bind_phone.php'
    ].join(','));
    root.__AX_API_ROUTER__ = existingConfig;

    /**
     * 判断是否为需要保留旧域名的微信登录接口。
     *
     * @param {string} value 接口路径
     * @returns {boolean} 是否旧域名白名单
     */
    function isWechatLegacyApi(value) {
        var pathname = normalizeApiPath(value);
        return existingConfig.wechatLegacyPaths.indexOf(pathname) !== -1;
    }

    /**
     * 判断是否为平台 API 请求。
     *
     * @param {string} value 原始地址
     * @returns {boolean} 是否平台接口
     */
    function isManagedApiRequest(value) {
        var pathname = normalizeApiPath(value);
        if (!pathname) {
            return false;
        }
        // 排除文件访问检查脚本，避免其请求被重定向到 API 域名
        if (pathname.indexOf('check_file_access.php') !== -1) {
            return false;
        }
        if (pathname.indexOf('/api/') === 0) {
            return true;
        }
        return /^[a-z0-9_.-]+\.php$/i.test(pathname);
    }

    /**
     * 根据接口路径判断应使用的新旧域名。
     *
     * @param {string} value 接口路径
     * @returns {string} 接口根地址
     */
    function getApiSiteUrlByPath(value) {
        if (isWechatLegacyApi(value) && existingConfig.legacyEnabled) {
            return existingConfig.legacyApiSiteUrl;
        }
        return existingConfig.apiSiteUrl;
    }

    /**
     * 生成完整接口地址。
     *
     * @param {string} value 原始接口地址
     * @returns {string} 完整接口地址
     */
    function resolveApiUrl(value) {
        var text = String(value || '').trim();
        if (!text) {
            return '';
        }
        if (isAbsoluteUrl(text)) {
            return text;
        }
        if (!isManagedApiRequest(text)) {
            return text;
        }
        var pathname = normalizeApiPath(text);
        if (!pathname || pathname.charAt(0) !== '/') {
            return text;
        }
        return getApiSiteUrlByPath(pathname) + pathname + (text.indexOf('?') >= 0 ? text.slice(text.indexOf('?')) : '');
    }

    /**
     * 判断接口请求是否需要自动携带跨域凭证。
     *
     * @param {string} value 完整接口地址
     * @returns {boolean} 是否需要包含凭证
     */
    function shouldIncludeCredentials(value) {
        if (!value) {
            return false;
        }
        var resolved = isAbsoluteUrl(value) ? value : resolveApiUrl(value);
        if (!resolved || !isAbsoluteUrl(resolved)) {
            return false;
        }
        try {
            var url = new URL(resolved, root.location.href);
            if (url.pathname.indexOf('/api/') !== 0) {
                return false;
            }
            var allowedHosts = [];
            [existingConfig.apiSiteUrl, existingConfig.legacyApiSiteUrl, root.location.origin].forEach(function (item) {
                if (!item) {
                    return;
                }
                try {
                    allowedHosts.push(new URL(item, root.location.href).hostname.toLowerCase());
                } catch (error) {
                }
            });
            allowedHosts = allowedHosts.filter(Boolean);
            return allowedHosts.indexOf(String(url.hostname || '').toLowerCase()) !== -1;
        } catch (error) {
            return false;
        }
    }

    /**
     * 为 fetch 生成统一的请求配置。
     *
     * @param {string} value 请求地址
     * @param {RequestInit} init 原始配置
     * @returns {RequestInit} 处理后的配置
     */
    function buildFetchInit(value, init) {
        var nextInit = Object.assign({}, init || {});
        if (shouldIncludeCredentials(value)) {
            nextInit.credentials = 'include';
        }
        return nextInit;
    }

    root.API_SITE_URL = existingConfig.apiSiteUrl;
    root.LEGACY_API_SITE_URL = existingConfig.legacyApiSiteUrl;
    root.getApiUrl = resolveApiUrl;
    root.getLegacyApiUrl = function (value) {
        var text = String(value || '').trim();
        if (!text) {
            return '';
        }
        var pathname = normalizeApiPath(text);
        if (!pathname || pathname.charAt(0) !== '/') {
            return text;
        }
        return existingConfig.legacyApiSiteUrl + pathname + (text.indexOf('?') >= 0 ? text.slice(text.indexOf('?')) : '');
    };
    root.getApiFetchOptions = buildFetchInit;

    if (!root.__AX_API_FETCH_PATCHED__ && typeof root.fetch === 'function') {
        var originalFetch = root.fetch.bind(root);
        root.fetch = function (input, init) {
            var requestUrl = '';
            var nextInput = input;
            if (typeof input === 'string') {
                requestUrl = resolveApiUrl(input);
                nextInput = requestUrl || input;
            } else if (input && typeof Request !== 'undefined' && input instanceof Request) {
                requestUrl = resolveApiUrl(input.url);
                if (requestUrl && requestUrl !== input.url) {
                    nextInput = new Request(requestUrl, input);
                } else {
                    requestUrl = input.url;
                }
            }
            return originalFetch(nextInput, buildFetchInit(requestUrl, init));
        };
        root.__AX_API_FETCH_PATCHED__ = true;
    }

    if (!root.__AX_API_XHR_PATCHED__ && root.XMLHttpRequest && root.XMLHttpRequest.prototype) {
        var xhrPrototype = root.XMLHttpRequest.prototype;
        var originalOpen = xhrPrototype.open;
        xhrPrototype.open = function (method, url) {
            var nextUrl = resolveApiUrl(url);
            this.__axApiResolvedUrl = nextUrl || url;
            this.__axApiNeedCredentials = shouldIncludeCredentials(this.__axApiResolvedUrl);
            return originalOpen.apply(this, [method, this.__axApiResolvedUrl].concat(Array.prototype.slice.call(arguments, 2)));
        };

        var originalSend = xhrPrototype.send;
        xhrPrototype.send = function (body) {
            if (this.__axApiNeedCredentials) {
                this.withCredentials = true;
            }
            return originalSend.call(this, body);
        };
        root.__AX_API_XHR_PATCHED__ = true;
    }
})();
