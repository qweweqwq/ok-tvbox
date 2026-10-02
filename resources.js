// OK影视 QuickJS source. All public methods return serialized JSON.
// Metadata and media are fetched from the configured upstream at request time.
const GROUPS = [
  { type_id: 'movie', type_name: '电影' },
  { type_id: 'tv', type_name: '电视剧' },
  { type_id: 'variety', type_name: '综艺' }
];
const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36';
let settings = {};

function genres(group) { return (settings.genres || {})[group] || []; }
function allowed(item) {
  const id = String(item.type_id || '');
  const name = String(item.type_name || '');
  return GROUPS.some(group => genres(group.type_id).some(g => String(g.v) === id || g.n === name));
}
function number(value) { return Math.max(1, Math.min(100000, parseInt(value, 10) || 1)); }
function fail(error, list) {
  return JSON.stringify({ list: list || [], page: 1, pagecount: 1, msg: '备用线路暂时无法获取，请切换央视公开片库。' });
}
function request(params) {
  if (!/^https:\/\//.test(settings.api || '')) throw new Error('HTTPS API required');
  const query = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const response = req(settings.api + (settings.api.indexOf('?') < 0 ? '?' : '&') + query,
    { headers: { 'User-Agent': UA }, timeout: 12000, redirect: 1 });
  if (response.code !== 200) throw new Error('HTTP ' + response.code);
  const result = JSON.parse(response.content);
  if (!Array.isArray(result.list)) throw new Error('Invalid list');
  return result;
}
function card(item) {
  return {
    vod_id: String(item.vod_id), vod_name: String(item.vod_name || '未命名'),
    vod_pic: String(item.vod_pic || ''), vod_remarks: String(item.vod_remarks || item.type_name || '')
  };
}
function pageResult(result, page) {
  return JSON.stringify({
    list: result.list.filter(allowed).map(card), page: number(page),
    pagecount: number(result.pagecount), limit: Number(result.limit || 20),
    total: Number(result.total || 0)
  });
}
function validMedia(url) {
  return /^https?:\/\//i.test(url) && /\.(m3u8|mp4)([?#]|$)/i.test(url);
}

export default {
  init(ext) {
    settings = typeof ext === 'string' ? JSON.parse(ext || '{}') : (ext || {});
    return JSON.stringify({});
  },
  home() {
    const filters = {};
    GROUPS.forEach(group => {
      filters[group.type_id] = [{ key: 'genre', name: '类型', value: genres(group.type_id) }];
    });
    return JSON.stringify({ class: GROUPS, filters: filters });
  },
  homeVod() {
    try { return pageResult(request({ ac: 'detail', pg: 1 }), 1); }
    catch (e) { return fail(e); }
  },
  category(tid, pg, filter, extend) {
    try {
      const options = genres(tid);
      if (!options.length) throw new Error('Unknown category');
      const requested = String((extend || {}).genre || options[0].v);
      const selected = options.some(g => String(g.v) === requested) ? requested : String(options[0].v);
      return pageResult(request({ ac: 'detail', t: selected, pg: number(pg) }), pg);
    } catch (e) { return fail(e); }
  },
  detail(id) {
    try {
      if (!/^\d+$/.test(String(id))) throw new Error('Invalid ID');
      const result = request({ ac: 'detail', ids: String(id) });
      const item = result.list.filter(allowed)[0];
      if (!item) return JSON.stringify({ list: [], msg: '这个条目不在电影、电视剧、综艺范围内。' });
      const sources = String(item.vod_play_from || '').split('$$$');
      const playlists = String(item.vod_play_url || '').split('$$$');
      const from = [], urls = [];
      sources.forEach((name, index) => {
        const episodes = String(playlists[index] || '').split('#').filter(episode => {
          const pos = episode.indexOf('$');
          return pos > 0 && validMedia(episode.slice(pos + 1));
        });
        if (episodes.length) { from.push(name); urls.push(episodes.join('#')); }
      });
      if (!urls.length) return JSON.stringify({ list: [], msg: '暂时没有可直接播放的链接，请换源。' });
      return JSON.stringify({ list: [{
        ...card(item), type_name: item.type_name || '',
        vod_year: String(item.vod_year || ''), vod_area: String(item.vod_area || ''),
        vod_actor: String(item.vod_actor || ''), vod_director: String(item.vod_director || ''),
        vod_content: String(item.vod_content || '').replace(/<[^>]*>/g, ''),
        vod_play_from: from.join('$$$'), vod_play_url: urls.join('$$$')
      }] });
    } catch (e) { return fail(e); }
  },
  search(key, quick, pg) {
    try {
      const keyword = String(key || '').trim();
      if (!keyword) return JSON.stringify({ list: [], page: 1, pagecount: 1 });
      return pageResult(request({ ac: 'detail', wd: keyword, pg: number(pg) }), pg);
    } catch (e) { return fail(e); }
  },
  play(flag, id) {
    if (!validMedia(String(id))) return JSON.stringify({ url: '', msg: '播放链接格式不支持，请换源。' });
    return JSON.stringify({ parse: 0, url: String(id) });
  },
  sniffer() { return false; },
  isVideo(url) { return validMedia(String(url || '')); },
  destroy() { settings = {}; }
};
