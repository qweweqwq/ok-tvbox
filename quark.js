// Personal OK影视 Quark source. Credentials stay in the app's private local store.
// No external spider JAR, no account-limit bypass, and no deletion APIs.
import { pngQr } from './qr.js';

const STORE = 'personal_quark';
const SITE = 'personal_quark';
const API = 'https://drive-pc.quark.cn/1/clouddrive/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/3.0.1 Chrome/100.0.4896.160 Electron/18.3.5.12-a038f7b798 Safari/537.36 Channel/pckk_other_ch';
const PARAM = 'pr=ucpro&fr=pc&uc_param_str=';
const FOLDER = 'OK影视个人接口';
const enc = encodeURIComponent;
const json = JSON.stringify;
let budgetEnd = 0;

function get(key) { return local.get(STORE, key) || ''; }
function put(key, value) { local.set(STORE, key, String(value)); }
function remove(key) { local.delete(STORE, key); }
function begin() { budgetEnd = Date.now() + 27000; }
function remaining() {
  const n = budgetEnd ? budgetEnd - Date.now() : 9000;
  if (n < 300) throw new Error('请求超时，请稍后重试');
  return Math.min(9000, n);
}
function mergeCookie(before, headers) {
  const rows = Object.create(null);
  String(before || '').split(';').forEach(part => {
    const n = part.indexOf('=');
    if (n > 0) rows[part.slice(0, n).trim()] = part.slice(n + 1).trim();
  });
  const setCookie = headers && (headers['set-cookie'] || headers['Set-Cookie']);
  (Array.isArray(setCookie) ? setCookie : [setCookie || '']).forEach(line => {
    String(line).split(/,(?=\s*[A-Za-z0-9_\-]+=)/).forEach(entry => {
      const part = entry.split(';')[0];
      const n = part.indexOf('=');
      if (n > 0) rows[part.slice(0, n).trim()] = part.slice(n + 1).trim();
    });
  });
  return Object.keys(rows).map(key => key + '=' + rows[key]).join('; ');
}
function request(url, options, withCookie) {
  const heads = Object.assign({ 'User-Agent': UA }, options && options.headers || {});
  const cookie = withCookie ? get('cookie') : '';
  if (withCookie) {
    if (!/^https:\/\/(?:drive-pc\.quark\.cn|pan\.quark\.cn)\//.test(url)) throw new Error('禁止向非夸克平台发送登录信息');
    if (!cookie) throw new Error('请先打开“夸克登录与状态”扫码登录');
    heads.Cookie = cookie;
    heads.Referer = 'https://pan.quark.cn/';
  }
  const res = req(url, Object.assign({}, options || {}, { headers: heads, timeout: remaining(), redirect: withCookie ? 0 : 1 }));
  if (!res || res.code !== 200) throw new Error('来源暂时无法访问' + (res && res.code ? '（' + res.code + '）' : ''));
  if (withCookie) {
    const updated = mergeCookie(cookie, res.headers);
    if (updated !== cookie) put('cookie', updated);
  }
  return res;
}
function readJson(url, options, withCookie) {
  try { return JSON.parse(request(url, options, withCookie).content); }
  catch (err) { if (err instanceof SyntaxError) throw new Error('来源返回内容异常，请稍后重试'); throw err; }
}
function qapi(path, data, auth) {
  const sep = path.indexOf('?') >= 0 ? '&' : '?';
  const payload = readJson(API + path + sep + PARAM, data === null || data === undefined ? {} : { method: 'post', data }, auth !== false);
  if (payload.code !== undefined && Number(payload.code) !== 0 || payload.status !== undefined && Number(payload.status) >= 400) {
    throw new Error(String(payload.message || '夸克请求失败').slice(0, 120));
  }
  return payload;
}
function pathUrl(op, isLocal, extra) {
  let url = getProxy(isLocal) + '&siteKey=' + SITE + '&op=' + op;
  if (extra) Object.keys(extra).forEach(key => { url += '&' + enc(key) + '=' + enc(extra[key]); });
  return url;
}
function safeText(text) { return String(text || '').replace(/[<>]/g, '').slice(0, 160); }
function encodeId(value) { return enc(json(value)); }
function decodeId(value) { return JSON.parse(decodeURIComponent(value)); }
function row(id, name, remarks, pic) { return { vod_id: id, vod_name: name, vod_remarks: remarks || '', vod_pic: pic || '' }; }
function folderRow(info, title, remarks) { return Object.assign(row(encodeId(info), title, remarks), { vod_tag: 'folder', style: { type: 'list' } }); }
function listResult(items, page, more) {
  return json({ list: items, page: Number(page) || 1, pagecount: more ? (Number(page) || 1) + 1 : Number(page) || 1, limit: 100, total: items.length });
}
function problem(err) { return safeText(err && err.message || '当前请求失败，请稍后重试'); }
function failure(err) { return json({ list: [row('login', problem(err), '点击查看登录状态或稍后重试')] }); }

function authNonce() {
  let nonce = get('auth_nonce');
  if (!nonce || Number(get('auth_nonce_time')) < Date.now() - 600000) {
    nonce = Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    put('auth_nonce', nonce); put('auth_nonce_time', Date.now());
  }
  return nonce;
}
function checkNonce(params) {
  return params.k && params.k === get('auth_nonce') && Number(get('auth_nonce_time')) >= Date.now() - 600000;
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
function newQr() {
  const url = 'https://uop.quark.cn/cas/ajax/getTokenForQrcodeLogin?client_id=532&v=1.2&request_id=' + uuid() + '&__t=' + Date.now();
  const res = readJson(url, { headers: { Referer: 'https://pan.quark.cn/', 'Cache-Control': 'no-cache' } }, false);
  const token = res.data && res.data.members && res.data.members.token;
  if (res.message !== 'ok' || !token) throw new Error('夸克暂时无法生成二维码，请稍后重试');
  put('qr_token', token); put('qr_time', Date.now());
  return token;
}
function qrToken() {
  const token = get('qr_token');
  return token && Number(get('qr_time')) > Date.now() - 120000 ? token : newQr();
}
function qrLink(token) {
  return 'https://su.quark.cn/4_eMHBJ?token=' + enc(token) + '&client_id=532&ssb=weblogin&uc_param_str=&uc_biz_str=S%3Acustom%7COPT%3ASAREA%400%7COPT%3AIMMERSIVE%401%7COPT%3ABACK_BTN_STYLE%400';
}
function pollLogin() {
  const token = get('qr_token');
  if (!token) return { state: 'refresh', message: '请先生成二维码' };
  const res = readJson('https://uop.quark.cn/cas/ajax/getServiceTicketByQrcodeToken?client_id=532&v=1.2&token=' + enc(token) + '&request_id=' + uuid() + '&__t=' + Date.now(), { headers: { Referer: 'https://pan.quark.cn/' } }, false);
  const ticket = res.data && res.data.members && res.data.members.service_ticket;
  if (res.message === 'ok' && ticket) {
    const response = request('https://pan.quark.cn/account/info?st=' + enc(ticket) + '&lw=scan', { headers: { Referer: 'https://pan.quark.cn/' } }, false);
    let cookie = mergeCookie('', response.headers);
    if (!/(?:^|;\s*)__pus=/.test(cookie)) throw new Error('夸克未返回有效授权，请刷新二维码重试');
    put('cookie', cookie);
    put('session_id', Date.now().toString(36) + Math.random().toString(36).slice(2));
    remove('login_verified');
    // Official web and drive requests can refresh __puus. Keep all official cookies.
    try { request('https://pan.quark.cn/list', {}, true); } catch (_) {}
    ownFiles('0', 1);
    remove('qr_token'); remove('qr_time');
    return { state: 'ok', message: '已登录，请返回 OK影视刷新片库' };
  }
  if (String(res.message || '').toLowerCase().indexOf('not found') >= 0 || Number(get('qr_time')) < Date.now() - 120000) {
    return { state: 'refresh', message: '二维码已过期或平台暂时无法授权，请刷新重试' };
  }
  return { state: 'wait', message: '请用已登录的夸克 App 扫码，并在手机上确认' };
}

function menu() {
  return [
    row('login', '夸克登录与状态', get('login_verified') === '1' ? '本机已登录；可查看或退出' : get('cookie') ? '授权信息已存本机，仍需验证' : '先扫码授权；电视和手机分别登录'),
    row('login_check', '已扫码，检查登录', '在夸克 App 确认授权后，点击这里完成本机登录'),
    folderRow({ kind: 'mine', folder: '0', title: '我的夸克网盘' }, '我的夸克网盘', '打开自己的文件夹和视频'),
    row('help', '夸克搜索与播放说明', '搜索公开分享；播放时可能需要转存')
  ];
}
function home() {
  return json({ class: [{ type_id: 'mine', type_name: '我的夸克' }, { type_id: 'guide', type_name: '登录与说明' }], list: menu() });
}
function ownFiles(folder, page) {
  const result = qapi('file/sort?pdir_fid=' + enc(folder) + '&_page=' + Number(page || 1) + '&_size=100&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,file_name:asc', null, true);
  if (!result.data || !Array.isArray(result.data.list)) throw new Error('夸克登录尚未验证，请刷新授权或在夸克 App 检查账号');
  const items = result.data.list;
  put('login_verified', '1');
  return { items, total: result.metadata && result.metadata._total || items.length };
}
function isVideo(item) { return item.obj_category === 'video' || /\.(mp4|mkv|mov|avi|m4v|ts|webm|flv)$/i.test(item.file_name || ''); }
function personalRows(folder, page) {
  const result = ownFiles(folder, page);
  const rows = result.items.filter(item => item.dir || isVideo(item)).map(item => {
    const next = { kind: item.dir ? 'mine' : 'own_video', folder: item.fid, fid: item.fid, title: item.file_name };
    return item.dir ? folderRow(next, item.file_name, '文件夹') : row(encodeId(next), item.file_name, '我的视频');
  });
  return listResult(rows, page, result.total > Number(page || 1) * 100);
}
function category(tid, page) {
  begin();
  try {
    if (tid === 'mine') return personalRows('0', page);
    if (tid === 'guide') return listResult(menu(), page, false);
    const info = decodeId(tid);
    if (info.kind === 'mine') return personalRows(info.folder || '0', page);
    if (info.kind === 'share' || info.kind === 'shared_folder') {
      const result = shareFiles(info, page);
      const rows = result.items.filter(item => item.dir || isVideo(item)).map(item => {
        const next = Object.assign({}, info, { kind: item.dir ? 'shared_folder' : 'shared_video', folder: item.dir ? item.fid : info.folder, fid: item.fid, fileToken: item.share_fid_token, parent: info.folder || '0', stoken: result.stoken, title: item.file_name });
        return item.dir ? folderRow(next, item.file_name, '分享文件夹') : row(encodeId(next), item.file_name, '夸克分享视频');
      });
      return listResult(rows, page, result.total > Number(page || 1) * 100);
    }
    throw new Error('请返回上一级目录');
  }
  catch (err) { return failure(err); }
}

function shareParts(url, password) {
  const found = /https?:\/\/pan\.quark\.cn\/s\/([A-Za-z0-9]+)/.exec(url);
  if (!found) return null;
  const embedded = /[?&](?:pwd|password|passcode)=([^&#]+)/.exec(url);
  return { shareId: found[1], password: password || embedded && decodeURIComponent(embedded[1]) || '' };
}
function search(keyword, quick, page) {
  begin();
  try {
    const direct = shareParts(keyword);
    if (direct) return listResult([row(encodeId(Object.assign({ kind: 'share', folder: '0', title: '夸克分享' }, direct)), '打开夸克分享', '按原分享权限读取')], 1, false);
    const items = [];
    const seen = Object.create(null);
    function add(link, title, source, password) {
      const parts = shareParts(link, password);
      if (!parts || seen[parts.shareId]) return;
      seen[parts.shareId] = true;
      items.push(row(encodeId(Object.assign({ kind: 'share', folder: '0', title: safeText(title) || '夸克分享' }, parts)), safeText(title) || '夸克分享', source + ' · 公开分享'));
    }
    // Public search requests never receive the user's Quark cookies.
    let completed = 0;
    try {
      const result = readJson('https://b.funletu.com/search', { method: 'post', data: { keyword, categoryid: 0, filetypeid: 1, courseid: 1, page: Number(page) || 1, pageSize: 15, sortBy: 'sort', order: 'desc', offset: 0 }, headers: { Origin: 'https://b.funletu.com', Referer: 'https://b.funletu.com/' } }, false);
      (result.data && result.data.list || []).forEach(item => add(item.url, item.title, '趣盘', item.extcode));
      completed++;
    } catch (_) {}
    try {
      const token = readJson('https://www.mipan.so/api/token', {}, false).token;
      if (token) {
        const result = readJson('https://www.mipan.so/api/search', { method: 'post', data: { kw: keyword, page: Number(page) || 1 }, headers: { 'x-mipan-token': token } }, false);
        const groups = result.data && result.data.merged_by_type;
        (groups && groups.quark || []).slice(0, 65).forEach(item => add(item.url, item.note, '觅盘', item.password));
        completed++;
      }
    } catch (_) {}
    if (!items.length && completed === 0) throw new Error('网盘搜索暂时无法访问；可直接搜索夸克分享网址');
    return listResult(items, page, false);
  } catch (err) { return failure(err); }
}

function shareFiles(info, page) {
  let stoken = info.stoken;
  const authenticated = Boolean(get('cookie'));
  if (!stoken) {
    const token = qapi('share/sharepage/token', { pwd_id: info.shareId, passcode: info.password || '' }, authenticated);
    if (!token.data || !token.data.stoken) throw new Error('分享已失效、需要提取码或暂时无法访问');
    stoken = token.data.stoken;
  }
  const result = qapi('share/sharepage/detail?pwd_id=' + enc(info.shareId) + '&stoken=' + enc(stoken) + '&pdir_fid=' + enc(info.folder || '0') + '&force=0&_page=' + Number(page || 1) + '&_size=100&_sort=file_type:asc,file_name:asc', null, authenticated);
  return { items: result.data && result.data.list || [], stoken, total: result.metadata && result.metadata._total || 0 };
}
function infoVod(id, title, content, pic) {
  return { vod_id: id, vod_name: title, vod_content: content, vod_pic: pic || '', vod_play_from: '说明', vod_play_url: '返回查看说明$info' };
}
function detail(id) {
  begin();
  try {
    if (id === 'login') {
      const k = authNonce();
      const page = pathUrl('login', false, { k });
      const image = pathUrl('qr', true, { k, t: Date.now() });
      const state = get('cookie') ? '本机已保存登录信息。电视和手机需各自登录。' : '网盘入口待设备验证。用已登录的夸克 App 扫描图片，并在手机确认授权。';
      const content = state + '\n扫码并确认后，返回本片库点击“已扫码，检查登录”。\n若 App 内二维码不显示，或只有这一部手机，请让手机和电视连接同一 Wi-Fi，在手机浏览器打开：\n' + page + '\n授权页也有“在本机打开夸克授权”链接。授权只保存在当前 OK影视 App，不会上传 GitHub。';
      const vod = infoVod(id, '夸克登录与状态', content, image);
      vod.vod_play_from = '授权操作'; vod.vod_play_url = '已扫码，检查登录$login_check';
      return json({ list: [vod] });
    }
    if (id === 'login_check') {
      const result = get('login_verified') === '1' && !get('qr_token') ? { state: 'ok', message: '本机已登录' } : pollLogin();
      return json({ list: [infoVod(id, result.state === 'ok' ? '夸克登录成功' : '夸克授权状态', result.message + '\n登录成功后返回“我的夸克”分类刷新。若二维码失效，请重新打开“夸克登录与状态”。')] });
    }
    if (id === 'help') return json({ list: [infoVod(id, '夸克搜索与播放说明', '在本片库搜索影片名，或粘贴完整夸克分享网址。搜索来自趣盘和觅盘，只展示夸克分享。进入文件夹后点击视频。播放共享视频会把所选文件保存到你的“' + FOLDER + '”目录，不删除已有文件。清晰度和速度受账号权限、分享有效性及网络影响。该入口尚需在 OK影视 5.1.5 上实际验证。')] });
    const info = decodeId(id);
    if (info.kind === 'own_video' || info.kind === 'shared_video') return json({ list: [{ vod_id: id, vod_name: info.title, vod_content: info.kind === 'own_video' ? '播放你自己的夸克视频。' : '播放时只转存这个视频到专用目录。', vod_play_from: '夸克', vod_play_url: safeText(info.title).replace(/[#$]/g, ' ') + '$' + id }] });
    if (info.kind === 'mine') {
      const result = ownFiles(info.folder || '0', 1);
      const episodes = result.items.filter(isVideo).map(item => {
        const next = { kind: 'own_video', folder: item.fid, fid: item.fid, title: item.file_name };
        return safeText(item.file_name).replace(/[#$]/g, ' ') + '$' + encodeId(next);
      });
      return json({ list: [{ vod_id: id, vod_name: info.title || '我的夸克', vod_content: '最多显示前100项。请在“我的夸克”分类中浏览文件夹。', vod_play_from: '我的夸克', vod_play_url: episodes.join('#') }] });
    }
    if (info.kind === 'share' || info.kind === 'shared_folder') {
      const queue = [info]; const episodes = []; let visited = 0;
      while (queue.length && visited < 4 && episodes.length < 150) {
        const directory = queue.shift();
        const result = shareFiles(directory, 1); visited++;
        result.items.filter(isVideo).forEach(item => {
          if (episodes.length < 150) episodes.push(safeText(item.file_name).replace(/[#$]/g, ' ') + '$' + encodeId(Object.assign({}, info, { kind: 'shared_video', fid: item.fid, fileToken: item.share_fid_token, parent: directory.folder || '0', stoken: result.stoken, title: item.file_name })));
        });
        result.items.filter(item => item.dir).slice(0, 4).forEach(item => queue.push(Object.assign({}, directory, { folder: item.fid, stoken: result.stoken })));
      }
      return json({ list: [{ vod_id: id, vod_name: info.title, vod_content: '为缩短等待，最多读取4个文件夹、150个视频。播放时只转存选中的视频。', vod_play_from: '夸克分享', vod_play_url: episodes.join('#') }] });
    }
    throw new Error('暂不支持这个条目，请重新搜索');
  } catch (err) { return json({ list: [infoVod(id, '夸克提示', problem(err))] }); }
}
function saveFolder() {
  const cached = get('save_folder');
  if (cached) return cached;
  const existing = ownFiles('0', 1).items.filter(item => item.dir && item.file_name === FOLDER)[0];
  if (existing) { put('save_folder', existing.fid); return existing.fid; }
  const created = qapi('file', { pdir_fid: '0', file_name: FOLDER, dir_path: '', dir_init_lock: false }, true);
  if (!created.data || !created.data.fid) throw new Error('无法创建专用转存目录，请检查网盘容量');
  put('save_folder', created.data.fid); return created.data.fid;
}
function saveVideo(info) {
  if (!get('cookie')) throw new Error('请先打开“夸克登录与状态”扫码登录');
  const cacheKey = 'saved_' + get('session_id') + '_' + info.shareId + '_' + info.fid;
  const cached = get(cacheKey);
  if (cached) return cached;
  const folder = saveFolder();
  const saved = qapi('share/sharepage/save', { fid_list: [info.fid], fid_token_list: [info.fileToken], to_pdir_fid: folder, pwd_id: info.shareId, stoken: info.stoken, pdir_fid: info.parent || '0', scene: 'link' }, true);
  const task = saved.data && saved.data.task_id;
  if (!task) throw new Error('分享无法转存，请检查权限或网盘容量');
  for (let retry = 0; retry < 3; retry++) {
    const result = qapi('task?task_id=' + enc(task) + '&retry_index=' + retry, null, true);
    const fids = result.data && result.data.save_as && result.data.save_as.save_as_top_fids;
    if (fids && fids.length) { put(cacheKey, fids[0]); return fids[0]; }
  }
  throw new Error('转存任务仍在处理；稍后到“我的夸克”专用目录打开');
}
function play(flag, id) {
  begin();
  try {
    if (id === 'info') return json({ parse: 0, url: '', msg: '请查看上方说明' });
    if (id === 'login_check') {
      const result = get('login_verified') === '1' && !get('qr_token') ? { message: '本机已登录' } : pollLogin();
      return json({ parse: 0, url: '', msg: result.message });
    }
    const info = decodeId(id);
    if (info.kind === 'mine' || info.kind === 'shared_folder') return json({ parse: 0, url: '', msg: '这是文件夹，请返回列表打开下一级文件夹' });
    const fid = info.kind === 'shared_video' ? saveVideo(info) : info.fid;
    if (!fid) throw new Error('没有找到视频，请重新打开片库');
    const result = qapi('file/v2/play', { fid, resolutions: 'normal,low,high,super,2k,4k', supports: 'fmp4,m3u8' }, true);
    const options = result.data && result.data.video_list || [];
    const usable = options.filter(video => video.accessable !== false && video.accessable !== 0 && video.video_info && /^https:\/\//.test(video.video_info.url || ''));
    if (!usable.length) throw new Error('该视频暂时无法播放或账号没有相应权限，请在夸克 App 查看');
    const rank = { low: 0, normal: 1, high: 2, super: 3, '2k': 4, '4k': 5 };
    usable.sort((a, b) => (rank[b.resolution] || 0) - (rank[a.resolution] || 0));
    const playUrl = usable[0].video_info.url;
    const header = { 'User-Agent': UA, Referer: 'https://pan.quark.cn/' };
    // Forward cookies only to official Quark domains, never to a search site or unrelated CDN.
    if (/^https:\/\/(?:[A-Za-z0-9-]+\.)*quark\.cn(?::443)?\//.test(playUrl)) header.Cookie = get('cookie');
    return json({ parse: 0, url: playUrl, header });
  } catch (err) { return json({ parse: 0, url: '', msg: problem(err) }); }
}

function loginHtml(k) {
  const base = pathUrl('', true, { k }).replace(/^https?:\/\/[^/]+/, '');
  const endpoint = op => base.replace('&op=', '&op=' + op);
  return '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>夸克本机登录</title><style>body{font:18px sans-serif;max-width:520px;margin:32px auto;padding:20px;color:#253047}img{display:block;max-width:100%;width:320px;margin:20px auto}button{font-size:18px;padding:12px;margin:8px}p{line-height:1.6}#state{min-height:56px}</style><h2>夸克本机登录</h2><p>用已登录的夸克 App 扫码并确认。授权保存在当前 OK影视 App。电视和手机需分别登录。</p><img id="qr" alt="夸克登录二维码"><p><a id="open" target="_blank" rel="noreferrer">在本机打开夸克授权</a></p><p id="state">正在生成二维码…</p><button id="refresh">刷新二维码</button><button id="logout">退出本机登录</button><script>const E=' + json(endpoint('')) + ';const qr=document.querySelector("#qr"),state=document.querySelector("#state"),openLink=document.querySelector("#open");let stopped=true;function url(op){return E.replace("&op=","&op="+op)}async function refresh(){stopped=true;try{const r=await fetch(url("start"));const j=await r.json();if(!j.url)throw new Error(j.message||"二维码生成失败");openLink.href=j.url;qr.src=url("qr")+"&t="+Date.now();state.textContent="请用夸克 App 扫码，或打开上方授权链接并确认";stopped=false}catch(e){state.textContent=e.message}}document.querySelector("#refresh").onclick=refresh;document.querySelector("#logout").onclick=async()=>{await fetch(url("logout"));stopped=true;state.textContent="已退出本机登录"};async function poll(){if(!stopped){try{const r=await fetch(url("status"));const j=await r.json();state.textContent=j.message;if(j.state==="ok"||j.state==="refresh")stopped=true}catch(e){state.textContent="请求失败，请确认 OK影视仍在打开"}}setTimeout(poll,2500)}refresh();setTimeout(poll,2500)</script></html>';
}
function proxy(params) {
  begin();
  const headers = json({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  try {
    if (!checkNonce(params)) return [403, 'text/plain; charset=utf-8', '授权页已过期，请在 OK影视重新打开“夸克登录与状态”。', headers];
    if (params.op === 'login') return [200, 'text/html; charset=utf-8', loginHtml(params.k), headers];
    if (params.op === 'start') return [200, 'application/json; charset=utf-8', json({ url: qrLink(newQr()), message: '请扫码或在本机打开授权' }), headers];
    if (params.op === 'qr') {
      const token = params.fresh ? newQr() : qrToken();
      return [200, 'image/png', pngQr(qrLink(token)), headers];
    }
    if (params.op === 'status') return [200, 'application/json; charset=utf-8', json(get('login_verified') === '1' && !get('qr_token') ? { state: 'ok', message: '本机已登录' } : pollLogin()), headers];
    if (params.op === 'logout') {
      remove('cookie'); remove('qr_token'); remove('qr_time'); remove('save_folder'); remove('session_id'); remove('login_verified');
      return [200, 'application/json; charset=utf-8', json({ state: 'out', message: '已退出本机登录' }), headers];
    }
    return [404, 'text/plain; charset=utf-8', '页面不存在', headers];
  } catch (err) { return [200, 'application/json; charset=utf-8', json({ state: 'refresh', message: problem(err) }), headers]; }
}

export default {
  init() {}, home,
  homeVod() { return json({ list: menu() }); },
  category, detail, search, play, proxy,
  sniffer() { return false; }, isVideo() { return false; },
  action() { return json({ msg: '请在本片库的“夸克登录与状态”查看授权。' }); },
  destroy() {}
};
