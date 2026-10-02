/*
 * 央视公开片库 · OK影视 / CatVod QuickJS
 * 仅调用央视网公开页面和官方点播接口；不含登录、VIP 解析或第三方播放器。
 * 分类：央视电影片库、央视电视剧、央视综艺。片库范围以央视实际返回为准。
 */
var HEADERS = {"User-Agent":"Mozilla/5.0", "Referer":"https://tv.cctv.com/"};
var API = "https://api.cntv.cn";
var PAGE_SIZE = 24;
var SEARCH_SIZE = 20;
var CLASSES = [
    {type_id:"movie", type_name:"电影"},
    {type_id:"tv", type_name:"电视剧"},
    {type_id:"variety", type_name:"综艺"}
];
var metadataCache = {};

function pack(value) { return JSON.stringify(value); }
function safeText(value) {
    return String(value == null ? "" : value).replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/[\r\n]+/g, " ").trim();
}
function episodeName(value) { return safeText(value).replace(/[#$]/g, " "); }
function urlQuery(base, values) {
    var keys = Object.keys(values);
    return base + "?" + keys.map(function(key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(values[key]);
    }).join("&");
}
function getText(url) {
    var response = req(url, {method:"get", headers:HEADERS, timeout:8000, redirect:1});
    if (typeof response === "string") return response;
    if (!response) throw new Error("央视接口没有返回内容，请检查网络后重试。");
    var status = response.code || response.status || response.statusCode;
    if (status && (Number(status) < 200 || Number(status) >= 400)) {
        throw new Error("央视接口返回 HTTP " + status + "，请稍后重试。");
    }
    var content = response.content != null ? response.content : response.body;
    if (content == null) throw new Error("央视接口返回格式暂不兼容。");
    return String(content);
}
function getJson(url) {
    var raw = getText(url).trim();
    // 兼容官方 API 偶尔返回的 JSONP；不执行返回的脚本。
    if (raw.charAt(0) !== "{" && raw.charAt(0) !== "[") {
        var start = raw.indexOf("("); var end = raw.lastIndexOf(")");
        if (start >= 0 && end > start) raw = raw.slice(start + 1, end);
    }
    var value;
    try { value = JSON.parse(raw); } catch (e) {
        throw new Error("央视接口暂未返回有效数据，请稍后重试。");
    }
    if (value.errcode && String(value.errcode) !== "0") {
        throw new Error("央视接口：" + safeText(value.msg || value.errcode));
    }
    return value;
}
function allowedUrl(url) {
    return /^https?:\/\/(?:[a-z0-9-]+\.)*(?:cctv\.com|cntv\.cn)(?:\/|$)/i.test(url);
}
function seconds(value) {
    if (typeof value === "number") return value;
    var text = String(value || "0");
    if (text.indexOf(":") < 0) return Number(text) || 0;
    return text.split(":").reduce(function(sum, part) { return sum * 60 + (Number(part) || 0); }, 0);
}
function freeVideo(value) {
    return String(value.vip_flag || "0") === "0" &&
        (!value.vip_platform_flag || String(value.vip_platform_flag) === "0");
}
function card(record) {
    var id = encodeURIComponent(pack(record));
    metadataCache[id] = record;
    return {vod_id:id, vod_name:safeText(record.title), vod_pic:record.image || "",
        vod_remarks:record.remark || "央视公开点播"};
}
function searchApi(keyword, pg, movieOnly) {
    return getJson(urlQuery("https://search.cctv.com/ifsearch.php", {
        page:pg, qtext:keyword, sort:"relevance", pageSize:SEARCH_SIZE, type:"video",
        vtime:movieOnly ? 3 : -1, datepid:1, channel:movieOnly ? "CCTV电影" : "", pageflag:0
    }));
}
function singleRecords(data) {
    return (data.list || []).filter(function(item) { return allowedUrl(item.urllink || ""); })
        .map(function(item) {
            return {kind:"single", title:item.all_title || item.title, image:item.imglink,
                url:item.urllink, remark:Math.round((item.durations || 0) / 60) + "分钟 · 央视"};
        });
}
function categoryData(tid, pg) {
    var data, list, total = 0;
    if (tid === "movie") {
        data = searchApi("电影", pg, true);
        list = singleRecords(data);
        total = Number(data.total) || 0;
        return {list:list.map(card), page:pg, pagecount:Number(data.totalpage) || Math.ceil(total/SEARCH_SIZE) || pg,
            limit:SEARCH_SIZE, total:total};
    }
    if (tid === "tv") {
        data = getJson(urlQuery(API + "/list/getVideoAlbumList", {
            channelid:"CHAL1460955853485115", fc:"电视剧", p:pg, n:PAGE_SIZE,
            serviceId:"tvcctv", topv:1, t:"json"
        }));
        var body = data.data || {};
        list = (body.list || []).map(function(item) {
            return card({kind:"album", album:item.id, title:item.title, image:item.image,
                year:item.year, actors:item.actors, brief:item.brief, url:item.url,
                fallback:item.video && item.video.url, remark:"电视剧 · " + (item.count || "") + "集"});
        });
        total = Number(body.total) || Number(body.totalnum) || 0;
    } else if (tid === "variety") {
        data = getJson(urlQuery(API + "/lanmu/columnSearch", {
            fc:"综艺", p:pg, n:PAGE_SIZE, serviceId:"tvcctv", t:"json"
        }));
        var response = data.response || {};
        list = (response.docs || []).filter(function(item) {
            return item.lastVIDE && (item.lastVIDE.videoSharedCode || item.lastVIDE.videoUrl);
        }).map(function(item) {
            return card({kind:"column", title:item.column_name, image:item.column_photo || item.column_logo,
                brief:item.column_brief, guid:item.lastVIDE.videoSharedCode,
                fallback:item.lastVIDE.videoUrl, latest:item.lastVIDE.videoTitle,
                remark:"综艺 · " + safeText(item.column_playdate || "央视")});
        });
        total = Number(response.numFound) || 0;
    } else {
        throw new Error("请选择电影、电视剧或综艺分类。");
    }
    return {list:list, page:pg, pagecount:total ? Math.ceil(total/PAGE_SIZE) : (list.length ? pg+1 : pg),
        limit:PAGE_SIZE, total:total || (pg*PAGE_SIZE)};
}
function guidFromPage(url) {
    if (!allowedUrl(url)) throw new Error("该地址不是央视公开点播页面。");
    var html = getText(url);
    var found = html.match(/(?:var\s+)?guid\s*[:=]\s*["']([a-f0-9]{32})["']/i);
    if (!found) throw new Error("央视页面暂未提供可播放的视频编号。");
    return found[1];
}
function videoInfo(guid) {
    if (!/^[a-f0-9]{32}$/i.test(guid)) throw new Error("视频编号无效，请重新打开影片。");
    return getJson(urlQuery(API + "/video/videoinfoByGuid", {guid:guid, serviceId:"tvcctv"}));
}
function episodeId(guid, url) {
    if (/^[a-f0-9]{32}$/i.test(String(guid || ""))) return "g:" + guid;
    if (allowedUrl(url || "")) return "u:" + encodeURIComponent(url);
    return "";
}
function episodeEntries(items, fullVariety) {
    return (items || []).filter(function(item) {
        return freeVideo(item) && (!fullVariety || seconds(item.length) >= 1200);
    }).map(function(item) {
        var id = episodeId(item.guid, item.url);
        return id ? episodeName(item.title || "播放") + "$" + id : "";
    }).filter(function(item) { return !!item; });
}
function detailData(ids) {
    var id = Array.isArray(ids) ? ids[0] : ids;
    var record = metadataCache[id];
    if (!record) {
        try { record = JSON.parse(decodeURIComponent(id)); } catch (e) {
            throw new Error("影片信息已失效，请重新打开分类后选择影片。");
        }
    }
    var episodes = [], data, info;
    if (record.kind === "single") {
        var guid = guidFromPage(record.url);
        info = videoInfo(guid);
        if (!freeVideo(info)) throw new Error("该视频在央视被标记为会员内容，本接口不提供会员解析。");
        episodes = [episodeName(info.title || record.title) + "$g:" + guid];
        record.brief = info.brief || record.brief;
    } else if (record.kind === "album") {
        data = getJson(urlQuery(API + "/NewVideo/getVideoListByAlbumIdNew", {
            id:record.album, serviceId:"tvcctv", p:1, n:100, mode:0, pub:1
        }));
        episodes = episodeEntries((data.data || {}).list, false);
    } else if (record.kind === "column") {
        var columnGuid = record.guid || guidFromPage(record.fallback);
        info = videoInfo(columnGuid);
        if (info.ctid) {
            data = getJson(urlQuery(API + "/NewVideo/getVideoListByColumn", {
                id:info.ctid, serviceId:"tvcctv", p:1, n:100, sort:"desc", mode:0, t:"json"
            }));
            episodes = episodeEntries((data.data || {}).list, true);
        }
        if (!episodes.length && freeVideo(info) && seconds(info.len) >= 1200) {
            episodes = [episodeName(info.title || record.latest || record.title) + "$g:" + columnGuid];
        }
    }
    if (!episodes.length && record.kind === "album" && record.fallback) {
        var fallbackGuid = guidFromPage(record.fallback);
        if (freeVideo(videoInfo(fallbackGuid))) episodes = ["首集$g:" + fallbackGuid];
    }
    if (!episodes.length) throw new Error("央视暂未返回可用的免费正片或完整节目，请选择其他内容。");
    return {list:[{vod_id:id, vod_name:safeText(record.title), vod_pic:record.image || "",
        vod_year:String(record.year || ""), vod_actor:safeText(record.actors),
        vod_content:safeText(record.brief) + "\n来源：央视网公开视频，只播放官方返回的免费内容。" +
            (record.kind === "column" ? "综艺栏目仅列出20分钟以上节目。" : ""),
        vod_play_from:"央视官方点播", vod_play_url:episodes.join("#")} ]};
}
function failure(error, extra) {
    var output = {list:[], msg:error && error.message ? error.message : "央视接口暂时不可用，请稍后重试。"};
    if (extra) Object.keys(extra).forEach(function(key) { output[key]=extra[key]; });
    return pack(output);
}
function init(cfg) { metadataCache = {}; return pack({}); }
function home(filter) {
    return pack({class:CLASSES, filters:{}, notice:"央视公开片库：电影、电视剧、综艺；内容以央视免费点播为准。"});
}
function homeVod() {
    try {
        return pack({list:categoryData("tv", 1).list.slice(0, 12)});
    } catch (error) { return failure(error); }
}
function category(tid, pg, filter, extend) {
    pg = Math.max(1, parseInt(pg, 10) || 1);
    try { return pack(categoryData(tid, pg)); }
    catch (error) { return failure(error, {page:pg, pagecount:pg, limit:PAGE_SIZE, total:0}); }
}
function detail(ids) {
    try { return pack(detailData(ids)); }
    catch (error) { return failure(error); }
}
function search(keyword, quick, pg) {
    try {
        var data = searchApi(safeText(keyword), Math.max(1, parseInt(pg, 10) || 1), false);
        return pack({list:singleRecords(data).map(card), page:Number(pg) || 1,
            pagecount:Number(data.totalpage) || 1, limit:SEARCH_SIZE, total:Number(data.total) || 0});
    } catch (error) { return failure(error); }
}
function play(flag, id, flags) {
    try {
        id=String(id || "");
        var guid = id.slice(0, 2) === "g:" ? id.slice(2) :
            (id.slice(0, 2) === "u:" ? guidFromPage(decodeURIComponent(id.slice(2))) : "");
        var info = videoInfo(guid);
        if (!freeVideo(info)) throw new Error("央视将该视频标记为会员内容，请选择免费内容。");
        var video = getJson(urlQuery("https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do", {pid:guid}));
        var hls = video.hls_url;
        if (!hls || !/^https?:\/\//i.test(hls)) throw new Error("央视暂未提供可用播放地址，请稍后重试。");
        return pack({parse:0, url:hls, header:HEADERS});
    } catch (error) {
        return pack({parse:0, url:"", header:HEADERS, msg:error.message || "暂时无法播放，请稍后重试。"});
    }
}

function sniffer() { return false; }
function isVideo(url) { return /\.(m3u8|mp4)(\?|$)/i.test(String(url || "")); }
function destroy() { metadataCache = {}; }

export default {init:init, home:home, homeVod:homeVod, category:category, detail:detail, search:search, play:play,
    sniffer:sniffer, isVideo:isVideo, destroy:destroy};
