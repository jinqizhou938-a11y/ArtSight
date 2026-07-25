(function() {
  'use strict';

  // ---- State ----
  let currentResult = null;
  let currentImage = null;
  let currentVenue = null;   // { type: 'museum'|'douyin', value: '浦东美术馆'|'@艺术叨叨' }
  let venueType = null;      // 'museum' | 'douyin'
  let exploreStack = [];     // [{ result, image }] 基因图谱浏览栈
  let geneExploring = false;
  let currentPersona = null;
  let chatTurns = []; // [{role:'user'|'assistant', content}] 多轮追问

  const HISTORY_KEY = 'artlingtong_history_v1';
  const PERSONA_KEY = 'artlingtong_persona_v1';
  const PERSONA_THRESHOLD = 3;

  // ---- DOM refs ----
  const $ = id => document.getElementById(id);
  const pageHome = $('page-home');
  const pageLoading = $('page-loading');
  const pageResult = $('page-result');
  const pagePersona = $('page-persona');
  const fileInputGallery = $('fileInputGallery');
  const fileInputCamera = $('fileInputCamera');
  const demoBtn = $('demoBtn');
  const backBtn = $('backBtn');
  const loadingText = $('loadingText');
  const loadingSub = $('loadingSub');
  const loadingStream = $('loadingStream');
  const artTitle = $('artTitle');
  const artMeta = $('artMeta');
  const artVenue = $('artVenue');
  const artworkImage = $('artworkImage');
  const artworkThumb = $('artworkThumb');
  const detailsList = $('detailsList');
  const artistsFlow = $('artistsFlow');
  const creatorsList = $('creatorsList');
  const hotQuestions = $('hotQuestions');
  const chatHistory = $('chatHistory');
  const chatInput = $('chatInput');
  const sendBtn = $('sendBtn');
  const shareBtn = $('shareBtn');
  const geneSection = $('geneSection');
  const geneChain = $('geneChain');
  const resultHeader = document.querySelector('.result-header');
  const imagineSection = $('imagineSection');
  const personaProgress = $('personaProgress');
  const personaUnlockBtn = $('personaUnlockBtn');
  const personaViewBtn = $('personaViewBtn');
  const personaResultCta = $('personaResultCta');
  const personaBackBtn = $('personaBackBtn');
  const personaShareBtn = $('personaShareBtn');
  const personaRegenBtn = $('personaRegenBtn');
  const personaZh = $('personaZh');
  const personaEn = $('personaEn');
  const personaTagline = $('personaTagline');
  const personaInsight = $('personaInsight');
  const personaEvidence = $('personaEvidence');
  const personaArtists = $('personaArtists');
  const personaWorksMeta = $('personaWorksMeta');
  const sourceBanner = $('sourceBanner');
  const imageSourceModal = $('imageSourceModal');
  const pickCamera = $('pickCamera');
  const pickGallery = $('pickGallery');
  const pickCancel = $('pickCancel');

  // Imagine section
  const imaginePresets = $('imaginePresets');
  const imagineInput = $('imagineInput');
  const imagineGo = $('imagineGo');
  const imagineLoading = $('imagineLoading');
  const imagineLoadingText = $('imagineLoadingText');
  const imagineResult = $('imagineResult');
  const imagineResultImg = $('imagineResultImg');
  const imagineResultLabel = $('imagineResultLabel');

  // Scene cards & modal
  const sceneMuseum = $('sceneMuseum');
  const sceneDouyin = $('sceneDouyin');
  const venueModal = $('venueModal');
  const modalTitle = $('modalTitle');
  const modalInput = $('modalInput');
  const modalSkip = $('modalSkip');
  const modalConfirm = $('modalConfirm');

  // ---- Page switching ----
  function showPage(page) {
    [pageHome, pageLoading, pageResult, pagePersona].forEach(p => {
      if (p) p.classList.remove('active');
    });
    page.classList.add('active');
    if (page === pageResult || page === pagePersona) {
      requestAnimationFrame(() => window.scrollTo(0, 0));
    }
  }

  // ---- Viewing history (photo / demo only) ----
  function workKey(w) {
    if (w.id) return String(w.id);
    return (w.title || '') + '|' + (w.artist || '');
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(list) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  }

  function loadCachedPersona() {
    try {
      const raw = localStorage.getItem(PERSONA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveCachedPersona(persona) {
    if (!persona) {
      localStorage.removeItem(PERSONA_KEY);
      return;
    }
    localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
  }

  /** 仅拍照/Demo 成功后调用；基因下钻不计入 */
  function recordViewedWork(data) {
    if (!data || !data.title) return;
    const entry = {
      id: data.id || '',
      title: data.title || '',
      artist: data.artist || '',
      year: data.year || '',
      style: data.style || '',
      takeaways: (Array.isArray(data.details) ? data.details : [])
        .map((d) => d && d.takeaway)
        .filter(Boolean)
        .slice(0, 3),
      at: Date.now(),
    };
    const list = loadHistory();
    const key = workKey(entry);
    if (list.some((w) => workKey(w) === key)) {
      updatePersonaEntryPoints();
      return;
    }
    list.push(entry);
    saveHistory(list);
    // 履历变化后清空旧人格缓存，鼓励重新生成
    if (currentPersona) {
      currentPersona = null;
      saveCachedPersona(null);
    }
    updatePersonaEntryPoints();
  }

  function updatePersonaEntryPoints() {
    const list = loadHistory();
    const n = list.length;
    if (personaProgress) {
      personaProgress.textContent = n >= PERSONA_THRESHOLD
        ? '已捕捉 ' + n + ' 件审美线索 · 可解锁人格'
        : '审美线索 ' + n + ' / ' + PERSONA_THRESHOLD;
    }
    const fill = $('personaProgressFill');
    if (fill) {
      const pct = Math.min(100, Math.round((n / PERSONA_THRESHOLD) * 100));
      fill.style.width = pct + '%';
    }
    const ready = n >= PERSONA_THRESHOLD;
    const hasPersona = !!currentPersona;
    if (personaUnlockBtn) personaUnlockBtn.hidden = !ready || hasPersona;
    if (personaViewBtn) personaViewBtn.hidden = !hasPersona;
    if (personaResultCta) {
      personaResultCta.hidden = !ready;
      personaResultCta.textContent = hasPersona ? '查看我的艺术人格' : '解锁你的艺术人格';
    }
  }

  // ---- Image compression ----
  function compressImage(file, maxWidth) {
    return new Promise((resolve, reject) => {
      maxWidth = maxWidth || 1024;
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('图片无法解码'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width;
          let h = img.height;
          if (w > maxWidth) {
            h = h * maxWidth / w;
            w = maxWidth;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function safeFilename(name) {
    return String(name || '作品').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  }

  // ---- Loading UX (A3) + SSE (A2) + async image (A1) ----
  let loadingTimer = null;

  function stopLoadingStages() {
    if (loadingTimer) {
      clearInterval(loadingTimer);
      loadingTimer = null;
    }
  }

  function startLoadingStages(stages, intervalMs) {
    stopLoadingStages();
    const list = stages && stages.length ? stages : ['处理中…'];
    let i = 0;
    if (loadingText) loadingText.textContent = list[0];
    if (loadingSub) loadingSub.textContent = '请稍候';
    if (loadingStream) {
      loadingStream.hidden = true;
      loadingStream.textContent = '';
    }
    loadingTimer = setInterval(() => {
      i = (i + 1) % list.length;
      if (loadingText) loadingText.textContent = list[i];
    }, intervalMs || 2200);
  }

  function showStreamPreview(fullText) {
    if (!loadingStream) return;
    loadingStream.hidden = false;
    const t = String(fullText || '');
    loadingStream.textContent = t.length > 160 ? ('…' + t.slice(-160)) : t;
  }

  async function readSSE(response, handlers) {
    if (!response.ok) {
      throw new Error('请求失败 ' + response.status);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let currentEvent = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n');
      buffer = chunks.pop() || '';
      for (const raw of chunks) {
        const line = raw.replace(/\r$/, '');
        if (!line) continue;
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        let payload = null;
        try {
          payload = JSON.parse(dataStr);
        } catch (_) {
          payload = { text: dataStr };
        }
        if (currentEvent === 'delta' && handlers.onDelta) handlers.onDelta(payload);
        if (currentEvent === 'done' && handlers.onDone) handlers.onDone(payload);
        if (currentEvent === 'error' && handlers.onError) handlers.onError(payload);
      }
    }
  }

  async function fetchArtworkImageAsync(meta) {
    try {
      const resp = await fetch('/api/fetch-artwork-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: meta.artist || '',
          title: meta.title || meta.work || '',
          work: meta.work || meta.title || '',
          label: meta.label || meta.title || '',
        }),
      });
      const result = await resp.json();
      if (result.success && result.data && result.data.image) {
        return result.data.image;
      }
    } catch (err) {
      console.warn('Async artwork image failed:', err);
    }
    return null;
  }

  function applyArtworkImage(imageData) {
    if (!imageData) return;
    currentImage = imageData;
    clearThumbPlaceholder();
    artworkImage.src = imageData;
    artworkImage.style.display = 'block';
    artworkThumb.style.background = '';
    artworkThumb.style.display = '';
    artworkThumb.style.minHeight = '';
    if (imagineSection) imagineSection.classList.remove('is-disabled');
    if (sourceBanner && currentResult && currentResult._source === 'fallback') {
      sourceBanner.hidden = false;
      sourceBanner.textContent = '示例作品 · 联网配图仅供演示';
    } else if (sourceBanner && currentResult && currentResult._source === 'qwen-explore') {
      sourceBanner.hidden = true;
    }
  }

  // ---- API: analyze (stream) ----
  async function analyzeImage(imageData) {
    startLoadingStages([
      '正在观察画面…',
      '提炼三个值得看的细节…',
      '整理基因图谱与追问…',
    ], 2000);
    showPage(pageLoading);

    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData, stream: true }),
      });

      let donePayload = null;
      let fullPreview = '';
      await readSSE(resp, {
        onDelta: (p) => {
          fullPreview += (p && p.text) || '';
          showStreamPreview(fullPreview);
        },
        onDone: (p) => { donePayload = p; },
        onError: (p) => { throw new Error((p && p.error) || '识别失败'); },
      });

      if (!donePayload || !donePayload.success || !donePayload.data) {
        throw new Error((donePayload && donePayload.error) || '分析失败');
      }

      stopLoadingStages();
      exploreStack = [];
      currentResult = donePayload.data;
      currentImage = imageData;
      recordViewedWork(donePayload.data);
      renderResult(donePayload.data);
      showPage(pageResult);
    } catch (err) {
      console.error('Analyze error:', err);
      stopLoadingStages();
      loadingText.textContent = '分析出错了，请重试';
      if (loadingSub) loadingSub.textContent = err.message || '';
      setTimeout(() => showPage(pageHome), 1500);
    }
  }

  // ---- Render result ----
  function renderResult(data) {
    data = data || {};
    // Artwork info
    artTitle.textContent = data.title || '未知作品';
    artMeta.textContent = [data.artist || '未知创作者', data.year || '年代未知', data.style || '风格未知'].join(' · ');

    // Venue label
    if (currentVenue && exploreStack.length === 0) {
      const tag = currentVenue.type === 'museum' ? '展馆' : '抖音';
      artVenue.textContent = tag + ' · ' + currentVenue.value;
    } else if (exploreStack.length > 0) {
      artVenue.textContent = '基因探索 · 可返回上一件';
    } else {
      artVenue.textContent = '';
    }

    if (sourceBanner) {
      if (data._source === 'fallback') {
        sourceBanner.hidden = false;
        sourceBanner.textContent = currentImage
          ? '示例作品 · 联网配图仅供演示'
          : '示例作品解读';
      } else if (data._source === 'qwen-explore' && !currentImage) {
        sourceBanner.hidden = false;
        sourceBanner.textContent = '基因探索 · 暂未搜到配图';
      } else {
        sourceBanner.hidden = true;
      }
    }

    if (resultHeader) {
      resultHeader.classList.toggle('exploring', exploreStack.length > 0);
    }

    // Artwork thumb: real image or placeholder
    if (currentImage) {
      clearThumbPlaceholder();
      artworkImage.src = currentImage;
      artworkImage.style.display = 'block';
      artworkThumb.style.background = '';
      artworkThumb.style.display = '';
      artworkThumb.style.minHeight = '';
      artworkThumb.style.alignItems = '';
      artworkThumb.style.justifyContent = '';
    } else {
      showThumbPlaceholder();
    }

    if (imagineSection) {
      imagineSection.classList.toggle('is-disabled', !currentImage);
    }

    // Three details — editorial blocks with oversized numbers
    detailsList.innerHTML = '';
    const details = Array.isArray(data.details) ? data.details : [];
    details.forEach((d, i) => {
      d = d || {};
      const block = document.createElement('div');
      block.className = 'detail-block';
      block.style.transitionDelay = (i * 160) + 'ms';
      block.innerHTML =
        '<div class="detail-number">0' + (i + 1) + '</div>' +
        '<div class="detail-title">' + escapeHTML(d.title || '') + '</div>' +
        '<div class="detail-desc">' + escapeHTML(d.description || '') + '</div>' +
        '<div class="detail-takeaway">' + escapeHTML(d.takeaway || '') + '</div>';
      detailsList.appendChild(block);
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        detailsList.querySelectorAll('.detail-block').forEach(b => b.classList.add('visible'));
      });
    });

    renderGeneMap(data);

    // Related artists — text flow
    artistsFlow.innerHTML = '';
    (Array.isArray(data.relatedArtists) ? data.relatedArtists : []).forEach((name, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '·';
        artistsFlow.appendChild(sep);
      }
      const span = document.createElement('span');
      span.textContent = name;
      artistsFlow.appendChild(span);
    });

    // Hot questions
    hotQuestions.innerHTML = '';
    (Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions : []).forEach(q => {
      const btn = document.createElement('span');
      btn.className = 'hot-question';
      btn.textContent = q;
      btn.addEventListener('click', () => sendQuestion(q));
      hotQuestions.appendChild(btn);
    });

    // Clear chat (reset multi-turn)
    chatHistory.innerHTML = '';
    chatTurns = [];

    // Douyin creators — minimal rows
    creatorsList.innerHTML = '';
    (Array.isArray(data.douyinCreators) ? data.douyinCreators : []).forEach(c => {
      c = c || {};
      const row = document.createElement('div');
      row.className = 'creator-row';
      row.innerHTML =
        '<span class="creator-name">' + escapeHTML(c.name || '') + '</span>' +
        '<span class="creator-video">' + escapeHTML(c.videoTitle || '') + '</span>';
      creatorsList.appendChild(row);
    });
  }

  function clearThumbPlaceholder() {
    const placeholder = artworkThumb.querySelector('.thumb-placeholder');
    if (placeholder) placeholder.remove();
  }

  function showThumbPlaceholder() {
    clearThumbPlaceholder();
    artworkImage.src = '';
    artworkImage.style.display = 'none';
    artworkThumb.style.background = 'linear-gradient(160deg, #2a2622, #161412)';
    artworkThumb.style.display = 'flex';
    artworkThumb.style.alignItems = 'center';
    artworkThumb.style.justifyContent = 'center';
    artworkThumb.style.minHeight = '220px';
    artworkThumb.style.borderRadius = '2px';
    const placeholder = document.createElement('div');
    placeholder.className = 'thumb-placeholder';
    placeholder.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="18" height="18" rx="1"/>' +
      '<circle cx="8.5" cy="8.5" r="1.5"/>' +
      '<path d="M21 15l-5-5L5 21"/>' +
      '</svg>';
    artworkThumb.appendChild(placeholder);
  }

  function renderGeneMap(data) {
    if (!geneSection || !geneChain) return;
    const chain = data.influenceChain || {};
    const upstream = Array.isArray(chain.upstream) ? chain.upstream.filter(Boolean) : [];
    const downstream = Array.isArray(chain.downstream) ? chain.downstream.filter(Boolean) : [];

    if (!upstream.length && !downstream.length) {
      geneSection.hidden = true;
      geneChain.innerHTML = '';
      return;
    }

    geneSection.hidden = false;
    geneChain.innerHTML = '';

    upstream.forEach((node) => {
      geneChain.appendChild(createGeneNode(node, 'upstream'));
      geneChain.appendChild(createGeneArrow('影响了'));
    });

    const currentNode = {
      label: data.title || '当前作品',
      artist: data.artist || '',
      work: '',
      reason: '当前作品',
    };
    geneChain.appendChild(createGeneNode(currentNode, 'current'));

    downstream.forEach((node) => {
      geneChain.appendChild(createGeneArrow('影响了'));
      geneChain.appendChild(createGeneNode(node, 'downstream'));
    });
  }

  function createGeneArrow(text) {
    const arrow = document.createElement('div');
    arrow.className = 'gene-arrow';
    arrow.innerHTML =
      '<div class="gene-arrow-line"></div>' +
      '<div class="gene-arrow-text">' + escapeHTML(text) + '</div>';
    return arrow;
  }

  function createGeneNode(node, role) {
    node = node || {};
    const isCurrent = role === 'current';
    const el = document.createElement(isCurrent ? 'div' : 'button');
    el.className = 'gene-node' + (isCurrent ? ' current' : ' clickable');
    if (!isCurrent) el.type = 'button';

    const metaParts = [node.artist, node.work].filter(Boolean);
    el.innerHTML =
      '<div class="gene-node-label">' + escapeHTML(node.label || node.work || '未知节点') + '</div>' +
      (metaParts.length
        ? '<div class="gene-node-meta">' + escapeHTML(metaParts.join(' · ')) + '</div>'
        : '') +
      '<div class="gene-node-reason">' + escapeHTML(node.reason || (isCurrent ? '你正在看的这一件' : '')) + '</div>';

    if (!isCurrent) {
      el.addEventListener('click', () => exploreGeneNode(node));
    }
    return el;
  }

  async function exploreGeneNode(node) {
    if (!node || geneExploring || !currentResult) return;
    geneExploring = true;
    startLoadingStages([
      '沿着影响链检索…',
      '生成作品解读…',
      '整理三个细节…',
    ], 1800);
    showPage(pageLoading);

    try {
      const resp = await fetch('/api/explore-gene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          node: node,
          from: {
            title: currentResult.title || '',
            artist: currentResult.artist || '',
          },
        }),
      });

      let donePayload = null;
      let fullPreview = '';
      await readSSE(resp, {
        onDelta: (p) => {
          fullPreview += (p && p.text) || '';
          showStreamPreview(fullPreview);
        },
        onDone: (p) => { donePayload = p; },
        onError: (p) => { throw new Error((p && p.error) || '探索失败'); },
      });

      if (!donePayload || !donePayload.success || !donePayload.data) {
        throw new Error((donePayload && donePayload.error) || '探索失败');
      }

      stopLoadingStages();
      exploreStack.push({
        result: currentResult,
        image: currentImage,
      });
      currentResult = donePayload.data;
      currentImage = null;
      renderResult(donePayload.data);
      showPage(pageResult);

      // A1: 配图异步补上
      fetchArtworkImageAsync({
        artist: donePayload.data.artist || node.artist,
        title: donePayload.data.title || node.work || node.label,
        work: node.work || donePayload.data.title,
        label: node.label,
      }).then((img) => {
        if (img && currentResult === donePayload.data) applyArtworkImage(img);
      });
    } catch (err) {
      console.error('Explore gene error:', err);
      stopLoadingStages();
      alert('探索失败，请稍后重试：' + (err.message || ''));
      showPage(pageResult);
    } finally {
      geneExploring = false;
    }
  }

  function popExploreStack() {
    if (!exploreStack.length) return false;
    const prev = exploreStack.pop();
    currentResult = prev.result;
    currentImage = prev.image;
    renderResult(currentResult);
    showPage(pageResult);
    return true;
  }

  function resetExploreState() {
    exploreStack = [];
    geneExploring = false;
    if (resultHeader) resultHeader.classList.remove('exploring');
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Chat (stream) ----
  async function sendQuestion(question) {
    if (!question || !question.trim()) return;
    const q = question.trim();

    addChatMessage(q, 'user');
    chatTurns.push({ role: 'user', content: q });
    chatInput.value = '';

    const botEl = addChatMessage('…', 'bot');
    botEl.classList.add('streaming');
    let answer = '';

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          question: q,
          history: chatTurns.slice(0, -1),
          context: {
            title: currentResult?.title || '',
            artist: currentResult?.artist || '',
          },
        }),
      });

      await readSSE(resp, {
        onDelta: (p) => {
          answer += (p && p.text) || '';
          botEl.textContent = answer;
          chatHistory.scrollTop = chatHistory.scrollHeight;
        },
        onDone: (p) => {
          if (p && p.data && p.data.answer) answer = p.data.answer;
        },
        onError: (p) => {
          throw new Error((p && p.error) || '回答失败');
        },
      });

      if (!answer) answer = '抱歉，暂时无法回答这个问题。';
      botEl.textContent = answer;
      botEl.classList.remove('streaming');
      chatTurns.push({ role: 'assistant', content: answer });
    } catch (err) {
      botEl.classList.remove('streaming');
      botEl.textContent = '网络出了点问题，请稍后重试。';
    }
  }

  function addChatMessage(text, role) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg ' + role;
    msg.textContent = text;
    chatHistory.appendChild(msg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return msg;
  }

  // ---- Venue label builder ----
  function buildVenueLabel() {
    if (!currentVenue) return null;
    const today = new Date();
    const dateStr = today.getFullYear() + '年' + (today.getMonth() + 1) + '月' + today.getDate() + '日';
    if (currentVenue.type === 'museum') {
      return dateStr + ' · ' + currentVenue.value;
    } else {
      return dateStr + ' · 抖音 ' + currentVenue.value;
    }
  }

  // ---- Canvas overlay: venue text on generated card ----
  function overlayVenueText(imageUrl, venueLabel) {
    return new Promise((resolve) => {
      const img = new Image();
      // Do NOT set crossOrigin on data: URLs — it causes load failure
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          const barH = Math.round(img.width * 0.06);
          canvas.height = img.height + barH;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, img.width, img.height);

          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(0, img.height, canvas.width, barH);

          const fontSize = Math.max(12, Math.round(barH * 0.32));
          ctx.font = fontSize + 'px "Noto Serif SC", "PingFang SC", serif';
          ctx.fillStyle = '#c9a96e';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(venueLabel, canvas.width / 2, img.height + barH / 2);

          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          console.warn('Canvas overlay failed:', e);
          resolve(imageUrl);
        }
      };
      img.onerror = () => resolve(imageUrl);
      img.src = imageUrl;
    });
  }

  // ---- Canvas: static share card fallback ----
  function buildStaticShareCard(result) {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#c9a96e';
    ctx.font = '22px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('艺术灵瞳 · 看展笔记', canvas.width / 2, 100);

    ctx.fillStyle = '#f0ede8';
    ctx.font = 'bold 36px "Noto Serif SC", serif';
    ctx.fillText(String(result.title || '未知作品').slice(0, 16), canvas.width / 2, 180);

    ctx.fillStyle = '#a09888';
    ctx.font = '18px "Noto Serif SC", serif';
    ctx.fillText(
      [result.artist, result.year, result.style].filter(Boolean).join(' · ').slice(0, 36),
      canvas.width / 2,
      230
    );

    const details = Array.isArray(result.details) ? result.details.slice(0, 3) : [];
    let y = 320;
    details.forEach((d, i) => {
      ctx.fillStyle = '#c9a96e';
      ctx.font = '20px "Noto Serif SC", serif';
      ctx.textAlign = 'left';
      ctx.fillText('0' + (i + 1) + '  ' + String(d.title || '').slice(0, 18), 64, y);
      y += 36;
      ctx.fillStyle = '#a09888';
      ctx.font = '16px "Noto Serif SC", serif';
      const line = String(d.takeaway || d.description || '').slice(0, 28);
      ctx.fillText(line, 64, y);
      y += 70;
    });

    ctx.fillStyle = '#5c5650';
    ctx.font = '16px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('拍一件艺术品，AI给你讲门道', canvas.width / 2, canvas.height - 80);

    return canvas.toDataURL('image/png');
  }

  async function downloadAndMaybeShare(imageUrl, filename, shareTitle) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = imageUrl;
    link.click();
    if (navigator.share) {
      try {
        const blob = await (await fetch(imageUrl)).blob();
        const file = new File([blob], filename, { type: 'image/png' });
        navigator.share({ title: shareTitle, files: [file] });
      } catch (_) { /* cancelled */ }
    }
  }

  // ---- Share card ----
  shareBtn.addEventListener('click', async () => {
    if (!currentResult) return;

    const originalHTML = shareBtn.innerHTML;
    shareBtn.innerHTML = '⏳ AI正在绘制分享卡片...';
    shareBtn.disabled = true;

    try {
      const body = {
        title: currentResult.title,
        artist: currentResult.artist,
        year: currentResult.year,
        style: currentResult.style,
        details: currentResult.details,
      };

      let finalImageUrl = null;
      try {
        const resp = await fetch('/api/generate-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await resp.json();
        if (!result.success || !result.data?.image) {
          throw new Error(result.error || '生成失败');
        }
        finalImageUrl = result.data.image;
        const venueLabel = buildVenueLabel();
        if (venueLabel) {
          finalImageUrl = await overlayVenueText(finalImageUrl, venueLabel);
        }
      } catch (genErr) {
        console.warn('AI share card failed, using canvas fallback:', genErr);
        shareBtn.innerHTML = '改用本地卡片...';
        finalImageUrl = buildStaticShareCard(currentResult);
        const venueLabel = buildVenueLabel();
        if (venueLabel) {
          finalImageUrl = await overlayVenueText(finalImageUrl, venueLabel);
        }
      }

      await downloadAndMaybeShare(
        finalImageUrl,
        '看展笔记_' + safeFilename(currentResult.title) + '.png',
        '艺术灵瞳 · 看展笔记'
      );
    } catch (err) {
      console.error('Share card error:', err);
      alert('生成分享卡片失败，请重试: ' + err.message);
    } finally {
      shareBtn.innerHTML = originalHTML;
      shareBtn.disabled = false;
    }
  });

  // ---- Imagine: reimagine artwork in a different style ----
  let imagineStyle = null;

  imaginePresets.addEventListener('click', (e) => {
    const btn = e.target.closest('.imagine-preset');
    if (!btn) return;
    // Toggle active
    imaginePresets.querySelectorAll('.imagine-preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    imagineStyle = btn.dataset.style;
    imagineInput.value = '';
  });

  imagineInput.addEventListener('input', () => {
    if (imagineInput.value.trim()) {
      imaginePresets.querySelectorAll('.imagine-preset').forEach(b => b.classList.remove('active'));
      imagineStyle = null;
    }
  });

  async function triggerImagine(style) {
    if (!style || !currentImage) return;

    // Show loading, hide result
    imagineLoadingText.textContent = style + '正在创作中...';
    imagineLoading.style.display = 'block';
    imagineResult.style.display = 'none';
    imagineGo.disabled = true;
    imagineInput.disabled = true;

    try {
      const resp = await fetch('/api/imagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: currentImage, style: style }),
      });
      const result = await resp.json();
      if (!result.success || !result.data?.image) {
        throw new Error(result.error || '生成失败');
      }
      imagineResultImg.src = result.data.image;
      imagineResultLabel.textContent = '原作 · ' + style + '版';
      imagineResult.style.display = 'block';
    } catch (err) {
      console.error('Imagine error:', err);
      imagineResultLabel.textContent = '生成失败，请重试';
      imagineResult.style.display = 'block';
    } finally {
      imagineLoading.style.display = 'none';
      imagineGo.disabled = false;
      imagineInput.disabled = false;
    }
  }

  imagineGo.addEventListener('click', () => {
    const customStyle = imagineInput.value.trim();
    const style = customStyle || imagineStyle;
    if (style) triggerImagine(style);
  });

  imagineInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const customStyle = imagineInput.value.trim();
      const style = customStyle || imagineStyle;
      if (style) triggerImagine(style);
    }
  });

  // ---- Scene selection & modal ----
  function openVenueModal(type) {
    venueType = type;
    if (type === 'museum') {
      modalTitle.textContent = '你在哪个美术馆看展？';
      modalInput.placeholder = '输入美术馆名称…';
    } else {
      modalTitle.textContent = '博主 ID 是什么？';
      modalInput.placeholder = '输入博主 ID…';
    }
    modalInput.value = '';
    venueModal.classList.add('active');
    setTimeout(() => modalInput.focus(), 100);
  }

  function closeVenueModal() {
    venueModal.classList.remove('active');
  }

  function openImageSourceModal() {
    if (imageSourceModal) imageSourceModal.classList.add('active');
  }

  function closeImageSourceModal() {
    if (imageSourceModal) imageSourceModal.classList.remove('active');
  }

  function confirmVenue() {
    const value = modalInput.value.trim();
    if (value) {
      currentVenue = { type: venueType, value: value };
    } else {
      currentVenue = null;
    }
    closeVenueModal();
    openImageSourceModal();
  }

  modalConfirm.addEventListener('click', confirmVenue);
  modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmVenue();
    }
  });

  modalSkip.addEventListener('click', () => {
    currentVenue = null;
    closeVenueModal();
    openImageSourceModal();
  });

  // Close modal on overlay click
  venueModal.addEventListener('click', (e) => {
    if (e.target === venueModal) closeVenueModal();
  });

  if (imageSourceModal) {
    imageSourceModal.addEventListener('click', (e) => {
      if (e.target === imageSourceModal) closeImageSourceModal();
    });
  }
  if (pickCancel) {
    pickCancel.addEventListener('click', closeImageSourceModal);
  }
  if (pickCamera && fileInputCamera) {
    pickCamera.addEventListener('click', () => {
      closeImageSourceModal();
      fileInputCamera.click();
    });
  }
  if (pickGallery && fileInputGallery) {
    pickGallery.addEventListener('click', () => {
      closeImageSourceModal();
      fileInputGallery.click();
    });
  }

  sceneMuseum.addEventListener('click', () => openVenueModal('museum'));
  sceneDouyin.addEventListener('click', () => openVenueModal('douyin'));

  async function handlePickedFile(file) {
    if (!file) return;
    try {
      const imageData = await compressImage(file);
      analyzeImage(imageData);
    } catch (err) {
      alert('图片处理失败：' + (err.message || '请换一张图试试'));
    }
  }

  function bindFileInput(input) {
    if (!input) return;
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      await handlePickedFile(file);
      input.value = '';
    });
  }

  bindFileInput(fileInputGallery);
  bindFileInput(fileInputCamera);
  // Demo button
  demoBtn.addEventListener('click', async () => {
    currentVenue = null;
    resetExploreState();
    startLoadingStages(['加载示例作品…', '整理看点…'], 1600);
    showPage(pageLoading);

    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: '',
          excludeKeys: loadHistory().map(workKey),
        }),
      });
      const result = await resp.json();

      if (!result.success) throw new Error(result.error || '加载失败');

      stopLoadingStages();
      currentResult = result.data;
      currentImage = null;
      recordViewedWork(result.data);
      renderResult(result.data);
      showPage(pageResult);

      fetchArtworkImageAsync({
        artist: result.data.artist,
        title: result.data.title,
        work: result.data.title,
      }).then((img) => {
        if (img && currentResult === result.data) applyArtworkImage(img);
      });
    } catch (err) {
      console.error('Demo error:', err);
      stopLoadingStages();
      loadingText.textContent = '加载失败，请重试';
      setTimeout(() => showPage(pageHome), 1500);
    }
  });

  // Back button：有探索栈则返回上一件，否则回首页
  backBtn.addEventListener('click', () => {
    if (popExploreStack()) return;

    showPage(pageHome);
    currentResult = null;
    currentImage = null;
    currentVenue = null;
    resetExploreState();
    updatePersonaEntryPoints();
    // Reset imagine state
    imagineStyle = null;
    imagineResult.style.display = 'none';
    imagineResultImg.src = '';
    imagineInput.value = '';
    imaginePresets.querySelectorAll('.imagine-preset').forEach(b => b.classList.remove('active'));
    if (imagineSection) imagineSection.classList.remove('is-disabled');
  });

  // ---- Art personality ----
  function renderPersona(persona) {
    currentPersona = persona;
    saveCachedPersona(persona);
    if (personaZh) personaZh.textContent = persona.personaNameZh || '—';
    if (personaEn) personaEn.textContent = persona.personaNameEn || '';
    if (personaTagline) personaTagline.textContent = persona.tagline || '';
    if (personaInsight) personaInsight.textContent = persona.insight || '';
    if (personaWorksMeta) {
      personaWorksMeta.textContent = '基于你拍过的 ' + loadHistory().length + ' 件作品';
    }
    if (personaEvidence) {
      personaEvidence.innerHTML = '';
      (Array.isArray(persona.evidence) ? persona.evidence : []).forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        personaEvidence.appendChild(li);
      });
    }
    if (personaArtists) {
      personaArtists.innerHTML = '';
      (Array.isArray(persona.artists) ? persona.artists : []).forEach((a) => {
        a = a || {};
        const row = document.createElement('div');
        row.className = 'persona-artist-row';
        row.innerHTML =
          '<div class="name">' + escapeHTML(a.name || '') + '</div>' +
          '<div class="known">' + escapeHTML(a.knownFor || '') + '</div>' +
          '<div class="why">' + escapeHTML(a.why || '') + '</div>';
        personaArtists.appendChild(row);
      });
    }
    const hero = $('personaHero');
    if (hero) {
      hero.classList.remove('reveal');
      void hero.offsetWidth;
      hero.classList.add('reveal');
    }
    updatePersonaEntryPoints();
  }

  async function fetchPersonality(force) {
    const works = loadHistory();
    if (works.length < PERSONA_THRESHOLD) {
      alert('再拍 ' + (PERSONA_THRESHOLD - works.length) + ' 件作品即可解锁艺术人格');
      return;
    }
    if (!force && currentPersona) {
      renderPersona(currentPersona);
      showPage(pagePersona);
      return;
    }

    startLoadingStages([
      '梳理你的审美线索…',
      '提炼艺术人格…',
      '匹配当代艺术家…',
    ], 2000);
    showPage(pageLoading);

    try {
      const resp = await fetch('/api/personality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ works: works }),
      });
      const result = await resp.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || '分析失败');
      }
      stopLoadingStages();
      renderPersona(result.data);
      showPage(pagePersona);
    } catch (err) {
      console.error('Personality error:', err);
      stopLoadingStages();
      alert('人格分析失败：' + (err.message || '请稍后重试'));
      showPage(pageHome);
      updatePersonaEntryPoints();
    }
  }

  function openPersonaFlow() {
    if (currentPersona) {
      renderPersona(currentPersona);
      showPage(pagePersona);
      return;
    }
    fetchPersonality(false);
  }

  if (personaUnlockBtn) {
    personaUnlockBtn.addEventListener('click', () => fetchPersonality(true));
  }
  if (personaViewBtn) {
    personaViewBtn.addEventListener('click', openPersonaFlow);
  }
  if (personaResultCta) {
    personaResultCta.addEventListener('click', openPersonaFlow);
  }
  if (personaBackBtn) {
    personaBackBtn.addEventListener('click', () => {
      if (currentResult) {
        showPage(pageResult);
      } else {
        showPage(pageHome);
        updatePersonaEntryPoints();
      }
    });
  }
  if (personaRegenBtn) {
    personaRegenBtn.addEventListener('click', () => fetchPersonality(true));
  }
  if (personaShareBtn) {
    personaShareBtn.addEventListener('click', async () => {
      if (!currentPersona) return;
      const original = personaShareBtn.innerHTML;
      personaShareBtn.innerHTML = '⏳ AI正在绘制人格卡片...';
      personaShareBtn.disabled = true;
      try {
        const resp = await fetch('/api/generate-persona-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentPersona),
        });
        const result = await resp.json();
        if (!result.success || !result.data?.image) {
          throw new Error(result.error || '生成失败');
        }
        const imageUrl = result.data.image;
        await downloadAndMaybeShare(
          imageUrl,
          '艺术人格_' + safeFilename(currentPersona.personaNameZh || '我') + '.png',
          '我的艺术人格是' + (currentPersona.personaNameZh || '')
        );
      } catch (err) {
        console.error('Persona card error:', err);
        alert('生成人格卡片失败：' + err.message);
      } finally {
        personaShareBtn.innerHTML = original;
        personaShareBtn.disabled = false;
      }
    });
  }

  // Send chat
  sendBtn.addEventListener('click', () => sendQuestion(chatInput.value));
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendQuestion(chatInput.value);
    }
  });

  // ---- Home entrance animation ----
  function animateHomeEntrance() {
    const eyebrow = $('homeEyebrow');
    const logo = $('homeLogo');
    const subtitle = $('homeSubtitle');
    const cards = document.querySelector('.scene-cards');
    const dHint = $('demoHint');
    const personaHome = $('personaHome');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (eyebrow) eyebrow.classList.add('revealed');
        logo.classList.add('revealed');
        subtitle.classList.add('revealed');
        if (cards) cards.classList.add('revealed');
        if (dHint) dHint.classList.add('revealed');
        if (personaHome) personaHome.classList.add('revealed');
      });
    });
  }

  // ---- Init ----
  currentPersona = loadCachedPersona();
  showPage(pageHome);
  updatePersonaEntryPoints();
  animateHomeEntrance();
})();
