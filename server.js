const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const fallback = require('./mock/fallback.json');

const PORT = config.server.port || 3000;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveStatic(res, urlPath) {
  const filePath = path.join(__dirname, "public", urlPath === "/" ? "index.html" : urlPath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB limit

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    req.on("data", (c) => {
      totalSize += c.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error("Request body too large (max 10MB)"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString().trim();
        if (!raw) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function callQwen(messages, systemPrompt) {
  const { apiKey, model, baseUrl } = config.qwen;
  const payload = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: 2048,
    temperature: 0.7,
  };
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Qwen API error ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

function parseJsonResponse(text) {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlock ? codeBlock[1].trim() : text.trim();
  return JSON.parse(jsonStr);
}

const RESULT_JSON_SCHEMA = "{\n  \"title\": \"...\",\n  \"artist\": \"...\",\n  \"year\": \"...\",\n  \"style\": \"...\",\n  \"details\": [\n    { \"title\": \"...\", \"description\": \"...\", \"takeaway\": \"...\" },\n    { \"title\": \"...\", \"description\": \"...\", \"takeaway\": \"...\" },\n    { \"title\": \"...\", \"description\": \"...\", \"takeaway\": \"...\" }\n  ],\n  \"relatedArtists\": [\"...\", \"...\", \"...\"],\n  \"suggestedQuestions\": [\"...\", \"...\", \"...\"],\n  \"douyinCreators\": [\n    { \"name\": \"@...\", \"videoTitle\": \"《...》\" },\n    { \"name\": \"@...\", \"videoTitle\": \"《...》\" },\n    { \"name\": \"@...\", \"videoTitle\": \"《...》\" }\n  ],\n  \"influenceChain\": {\n    \"upstream\": [\n      { \"id\": \"...\", \"label\": \"流派或作品名\", \"artist\": \"创作者\", \"work\": \"代表作（可选）\", \"reason\": \"约20字说明为何影响了当前作品\" }\n    ],\n    \"downstream\": [\n      { \"id\": \"...\", \"label\": \"流派或作品名\", \"artist\": \"创作者\", \"work\": \"代表作（可选）\", \"reason\": \"约20字说明当前作品如何影响了ta\" }\n    ]\n  }\n}";

const ANALYZE_PROMPT = "你是一位专业、有温度、口语化的AI艺术导师。你收到一件艺术作品的照片（可能是绘画、雕塑、装置、书法等任何形式），请完成以下任务：\n\n一、识别作品\n- 作品名称（中文优先）\n- 创作者姓名\n- 创作年代\n- 所属流派/风格/类型\n\n二、生成\"三个值得看的细节\"\n每个细节必须包含：\n1. 具体的视觉位置或特征描述（如\"画面右下角\"\"雕塑的底部纹理\"\"装置的左侧组件\"）\n2. 值得关注的原因（技法、历史背景、情感表达、创作意图）\n3. 一句话总结（用户看完能记住的关键点）\n\n输出规范：\n- 每个细节2-3句话，不要长篇大论\n- 语气像朋友聊天，避免\"该作品\"\"笔者认为\"等书面语\n- 使用口语化的引导，如\"你注意看……\"\"有意思的是……\"\"很多观众会忽略……\"\n\n三、额外输出\n- 同流派/同风格创作者推荐（2-3位）\n- 3个用户可能会追问的问题（作为热门追问建议）\n- 3位抖音博主推荐：根据作品内容生成相关抖音艺术博主的名称和视频标题，视频标题需紧扣作品内容、有吸引力\n\n四、艺术基因图谱（influenceChain）\n- upstream：1条「影响了这件作品」的来源（更早的流派/艺术家/代表作）\n- downstream：1条「这件作品影响了谁」的去向\n- 只选艺术史上较公认的影响关系；不确定时选更稳妥的一条，不要编造冷门冷知识\n- id 用简短英文蛇形命名；reason 约20字\n\n请严格按JSON格式输出，不要额外解释：\n" + RESULT_JSON_SCHEMA;

const EXPLORE_GENE_PROMPT = "你是一位专业、有温度、口语化的AI艺术导师。用户正在从一件作品的「艺术基因图谱」跳转到相关节点，继续探索。请把该节点当作当前解读对象，生成完整解读。\n\n要求：\n- 无图片，仅依据节点信息与艺术史常识\n- 输出结构与带图分析完全一致（含三个细节、同流派、追问、抖音博主、influenceChain）\n- influenceChain 仍各给 upstream / downstream 各 1 条，便于继续点选探索\n- 细节可侧重历史影响、风格特征、代表作视觉特征（即使无图也要写得像站在作品前讲解）\n- 语气口语化；影响关系选公认脉络，不确定则选稳妥选项\n\n请严格按JSON格式输出，不要额外解释：\n" + RESULT_JSON_SCHEMA;

const CHAT_PROMPT = "你是一位知识渊博且善谈的艺术导师。用户正在了解一件艺术品，会向你追问问题。你可能收到多轮对话历史，请承接上下文作答。\n\n当前作品信息：{title}，创作者{artist}。\n\n回答规范：\n- 直接回答用户的问题，不要重复作品基本信息\n- 可延伸至历史背景、创作者生平、市场拍卖、社会影响等\n- 语言口语化，像和看展的朋友聊天\n- 控制在200字以内，精炼有料";

const PERSONALITY_PROMPT = "你是一位犀利又温暖的艺术人格分析师。根据用户主动拍摄/浏览过的作品履历，提炼其审美偏好，并命名一个「艺术人格」。\n\n要求：\n- 人格名为半开放创造：中文名 2-4 字（好记、好晒），英文名一个词或复合词（如 Luminophile）\n- 可参考但不限于：光瘾者、质感控、叙事癖、留白派、色彩猎人、秩序控、情绪捕手、结构狂\n- insight：口语化一段话，点出共性审美母题，并自然引用履历中的具体作品作证据\n- evidence：2-3 条短句，每条对应履历中的作品\n- artists：推荐 3 位中国当代艺术家（真实存在），说明为何契合该人格；含 name、knownFor（代表方向）、why\n- 语气像朋友做性格测试揭晓，不要鸡汤空话\n\n严格输出 JSON，不要额外解释：\n{\n  \"personaNameZh\": \"光瘾者\",\n  \"personaNameEn\": \"Luminophile\",\n  \"tagline\": \"用光影制造情绪的人\",\n  \"insight\": \"...\",\n  \"evidence\": [\"...\", \"...\"],\n  \"artists\": [\n    { \"name\": \"...\", \"knownFor\": \"...\", \"why\": \"...\" },\n    { \"name\": \"...\", \"knownFor\": \"...\", \"why\": \"...\" },\n    { \"name\": \"...\", \"knownFor\": \"...\", \"why\": \"...\" }\n  ]\n}";

const PERSONALITY_FALLBACK = {
  personaNameZh: "光瘾者",
  personaNameEn: "Luminophile",
  tagline: "用光影制造情绪的人",
  insight: "你似乎对「用光影制造情绪」的作品特别敏感——履历里的作品都在用明暗与氛围说话。你的艺术人格是光瘾者（Luminophile）。",
  evidence: ["你被光影与氛围牵引，而非只看故事情节", "你偏好能「感觉到空气」的画面", "情绪往往从光线里先抵达你"],
  artists: [
    { name: "陈丹青", knownFor: "肖像与观看", why: "对观看本身的执念，与你对光影情绪的敏感同频" },
    { name: "刘小东", knownFor: "现场写生", why: "用现场光线抓住瞬间情绪，贴近你的审美本能" },
    { name: "杨福东", knownFor: "影像与氛围", why: "慢节奏光影叙事，适合光瘾者沉浸" },
  ],
  _source: "fallback",
};

function summarizeWorksForPrompt(works) {
  return (Array.isArray(works) ? works : []).slice(0, 8).map((w, i) => {
    const takes = Array.isArray(w.takeaways) ? w.takeaways.filter(Boolean).slice(0, 3).join("；") : "";
    return (i + 1) + ". 《" + (w.title || "未知") + "》" + (w.artist || "") +
      "｜" + (w.year || "") + "｜" + (w.style || "") +
      (takes ? "｜要点：" + takes : "");
  }).join("\n");
}

const SEARCH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_SEARCH_IMAGE_BYTES = 2.5 * 1024 * 1024;

function buildArtworkSearchQuery(node) {
  const artist = String(node?.artist || "").trim();
  const workOrLabel = String(node?.work || node?.label || "").trim();
  return [artist, workOrLabel].filter(Boolean).join(" ").trim();
}

async function downloadImageAsDataUrl(imageUrl) {
  const resp = await fetch(imageUrl, {
    headers: { "User-Agent": SEARCH_UA, Accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error("下载图片失败 " + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (!buf.length || buf.length > MAX_SEARCH_IMAGE_BYTES) {
    throw new Error("图片过大或为空");
  }
  const contentType = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  const mime = contentType.startsWith("image/") ? contentType : "image/jpeg";
  return "data:" + mime + ";base64," + buf.toString("base64");
}

async function searchImage360(query) {
  const url = "https://image.so.com/j?q=" + encodeURIComponent(query) + "&pn=1&sn=8";
  const resp = await fetch(url, {
    headers: { "User-Agent": SEARCH_UA, Accept: "application/json,text/plain,*/*" },
  });
  if (!resp.ok) throw new Error("360搜图失败 " + resp.status);
  const data = await resp.json();
  const list = Array.isArray(data.list) ? data.list : [];
  for (const item of list) {
    const thumb = item.thumb || item.img;
    if (!thumb || typeof thumb !== "string") continue;
    const httpsUrl = thumb.replace(/^http:\/\//i, "https://");
    try {
      return await downloadImageAsDataUrl(httpsUrl);
    } catch (err) {
      console.warn("360 thumb download failed:", err.message);
    }
  }
  throw new Error("360 未找到可用图片");
}

async function searchImageMet(query) {
  const searchUrl =
    "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=" +
    encodeURIComponent(query);
  const searchResp = await fetch(searchUrl, { headers: { "User-Agent": SEARCH_UA } });
  if (!searchResp.ok) throw new Error("Met 搜索失败 " + searchResp.status);
  const searchData = await searchResp.json();
  const ids = Array.isArray(searchData.objectIDs) ? searchData.objectIDs.slice(0, 5) : [];
  if (!ids.length) throw new Error("Met 无匹配结果");

  for (const id of ids) {
    try {
      const objResp = await fetch(
        "https://collectionapi.metmuseum.org/public/collection/v1/objects/" + id,
        { headers: { "User-Agent": SEARCH_UA } }
      );
      if (!objResp.ok) continue;
      const obj = await objResp.json();
      const imageUrl = obj.primaryImageSmall || obj.primaryImage;
      if (!imageUrl) continue;
      return await downloadImageAsDataUrl(imageUrl);
    } catch (err) {
      console.warn("Met object fetch failed:", err.message);
    }
  }
  throw new Error("Met 未找到可用图片");
}

/** 360 为主，Met 兜底；失败返回 null，不阻断探索 */
async function searchArtworkImage(query) {
  if (!query) return null;
  try {
    const img = await searchImage360(query);
    console.log("Artwork image from 360:", query);
    return img;
  } catch (err) {
    console.warn("360 search failed, try Met:", err.message);
  }
  try {
    const img = await searchImageMet(query);
    console.log("Artwork image from Met:", query);
    return img;
  } catch (err) {
    console.warn("Met search failed:", err.message);
  }
  return null;
}

// ---- Shared: Image generation via DashScope async API ----
async function generateImage(prompt, size) {
  const { apiKey, model, baseUrl } = config.qwenImage;

  // Submit async task
  const submitResp = await fetch(baseUrl + "/api/v1/services/aigc/text2image/image-synthesis", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({ model, input: { prompt }, parameters: { n: 1, size } }),
  });

  if (!submitResp.ok) {
    const errText = await submitResp.text();
    throw new Error("提交图片生成任务失败 " + submitResp.status + ": " + errText);
  }

  const submitData = await submitResp.json();
  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error("未获取到任务ID: " + JSON.stringify(submitData));

  // Poll for result (max 90s)
  let imageUrl = null;
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollResp = await fetch(baseUrl + "/api/v1/tasks/" + taskId, {
      headers: { "Authorization": "Bearer " + apiKey },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    const status = pollData.output?.task_status;
    if (status === "SUCCEEDED") {
      imageUrl = pollData.output?.results?.[0]?.url;
      break;
    }
    if (status === "FAILED") {
      throw new Error("图片生成失败: " + (pollData.output?.message || "未知错误"));
    }
  }

  if (!imageUrl) throw new Error("图片生成超时");

  // Download and convert to base64
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error("下载生成图片失败");
  const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
  return "data:image/png;base64," + imgBuffer.toString("base64");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Static files
    if (req.method === "GET" && !pathname.startsWith("/api/")) {
      serveStatic(res, pathname === "/" ? "/" : pathname);
      return;
    }

    // POST /api/analyze
    if (pathname === "/api/analyze" && req.method === "POST") {
      const body = await readBody(req);
      let result;
      let image = null;
      // 无图：Demo「加载示例作品」走兜底，并联网配图便于风格想象
      if (!body.image) {
        const exclude = new Set(Array.isArray(body.excludeKeys) ? body.excludeKeys : []);
        let pool = fallback.paintings.filter((p) => !exclude.has(p.id || (p.title + "|" + p.artist)));
        if (!pool.length) pool = fallback.paintings;
        const fb = pool[Math.floor(Math.random() * pool.length)];
        result = { ...fb, _source: "fallback" };
        image = await searchArtworkImage(
          buildArtworkSearchQuery({ artist: fb.artist, work: fb.title, label: fb.title })
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: result, image: image }));
        return;
      }
      try {
        const raw = await callQwen(
          [{ role: "user", content: [{ type: "image_url", image_url: { url: body.image } }, { type: "text", text: "请帮我分析这幅画，给出识别信息和三个必看细节。" }] }],
          ANALYZE_PROMPT
        );
        result = parseJsonResponse(raw);
        result._source = "qwen";
      } catch (err) {
        // 真实拍照失败不再静默换成别的名画，避免「图文不符」
        console.warn("Qwen API call failed:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "识别失败，请稍后重试" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: result }));
      return;
    }

    // POST /api/explore-gene — 点击基因图谱上下游，文字再探索 + 联网配图
    if (pathname === "/api/explore-gene" && req.method === "POST") {
      const body = await readBody(req);
      const node = body.node;
      if (!node || (!node.label && !node.artist && !node.work)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "缺少基因节点信息" }));
        return;
      }
      const fromTitle = body.from?.title || "未知作品";
      const fromArtist = body.from?.artist || "未知创作者";
      const nodeLabel = node.label || node.work || "相关艺术节点";
      const userMsg =
        "用户从《" + fromTitle + "》（" + fromArtist + "）的基因图谱点入以下节点，请生成完整解读：\n" +
        "- 标签/流派：" + (node.label || "") + "\n" +
        "- 创作者：" + (node.artist || "") + "\n" +
        "- 代表作：" + (node.work || "") + "\n" +
        "- 关联原因：" + (node.reason || "") + "\n" +
        "- 节点id：" + (node.id || "") + "\n\n" +
        "请以「" + nodeLabel + "」为核心对象输出 JSON。";
      const searchQuery = buildArtworkSearchQuery(node);

      let result;
      let image = null;
      try {
        const [raw, foundImage] = await Promise.all([
          callQwen([{ role: "user", content: userMsg }], EXPLORE_GENE_PROMPT),
          searchArtworkImage(searchQuery),
        ]);
        result = parseJsonResponse(raw);
        result._source = "qwen-explore";
        image = foundImage;
      } catch (err) {
        console.warn("Explore gene failed:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "探索失败，请稍后重试" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: result, image: image }));
      return;
    }

    // POST /api/personality — 根据履历生成艺术人格
    if (pathname === "/api/personality" && req.method === "POST") {
      const body = await readBody(req);
      const works = Array.isArray(body.works) ? body.works : [];
      if (works.length < 3) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "至少需要 3 件作品履历" }));
        return;
      }
      let persona;
      try {
        const userMsg = "以下是用户主动拍摄/浏览过的作品履历（共" + works.length + "件）：\n" +
          summarizeWorksForPrompt(works) +
          "\n\n请分析其审美偏好并输出艺术人格 JSON。";
        const raw = await callQwen([{ role: "user", content: userMsg }], PERSONALITY_PROMPT);
        persona = parseJsonResponse(raw);
        persona._source = "qwen";
      } catch (err) {
        console.warn("Personality API failed, using fallback:", err.message);
        persona = { ...PERSONALITY_FALLBACK };
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: persona }));
      return;
    }

    // POST /api/generate-persona-card — 艺术人格分享图（文生图）
    if (pathname === "/api/generate-persona-card" && req.method === "POST") {
      if (!globalThis.fetch) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Node.js 版本过低" }));
        return;
      }
      const body = await readBody(req);
      const zh = body.personaNameZh || "艺术探索者";
      const en = body.personaNameEn || "Artseeker";
      const tagline = body.tagline || "";
      const insight = body.insight || "";
      const artists = Array.isArray(body.artists) ? body.artists : [];
      const artistText = artists.slice(0, 3).map((a) => (a?.name || "") + (a?.knownFor ? "（" + a.knownFor + "）" : "")).filter(Boolean).join("、") || "当代艺术同行者";

      const prompt =
        "生成一张精致竖版社交媒体人格卡片，暗色美术馆氛围，暖金点缀，高雅克制。\n\n" +
        "主标题：艺术灵瞳 · 你的艺术人格\n" +
        "人格中文名：「" + zh + "」\n" +
        "英文名：" + en + "\n" +
        (tagline ? "副标题：" + tagline + "\n" : "") +
        "卡片中部用短句呈现洞察气质（不要堆字）：" + insight.slice(0, 80) + "\n" +
        "底部列出可能喜欢的中国当代艺术家：" + artistText + "\n" +
        "底部口号：拍一件艺术品，AI给你讲门道。\n" +
        "竖版构图，中文排版清晰，像一张可晒到朋友圈的身份卡，不要二维码，不要杂乱贴纸。";

      const base64 = await generateImage(prompt, "1024*1440");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { image: base64 } }));
      return;
    }

    // POST /api/chat
    if (pathname === "/api/chat" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.question) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "缺少问题" }));
        return;
      }
      const systemPrompt = CHAT_PROMPT
        .replace("{title}", body.context?.title || "未知作品")
        .replace("{artist}", body.context?.artist || "未知创作者");
      const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
      const messages = history
        .filter((h) => h && h.content)
        .map((h) => ({
          role: h.role === "assistant" || h.role === "bot" ? "assistant" : "user",
          content: String(h.content),
        }));
      messages.push({ role: "user", content: body.question });
      let answer;
      try {
        answer = await callQwen(messages, systemPrompt);
      } catch (err) {
        console.warn("Qwen chat failed:", err.message);
        answer = "抱歉，我暂时无法回答这个问题。请检查网络连接后重试。";
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { answer } }));
      return;
    }


    // POST /api/share 与 /api/generate-card（别名，前端使用后者）
    if ((pathname === "/api/share" || pathname === "/api/generate-card") && req.method === "POST") {
      if (!globalThis.fetch) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Node.js 版本过低，请使用 Node.js 18+ 或安装 node-fetch" }));
        return;
      }
      const body = await readBody(req);
      const { title, artist, year, style, details } = body;
      if (!title) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "缺少画作信息" }));
        return;
      }

      const safeDetails = Array.isArray(details) ? details : [];
      const detailsText = safeDetails.slice(0, 3)
        .map((d, i) => (i + 1) + ". " + (d?.title || "要点") + "：" + (d?.takeaway || ""))
        .join("\n") || "（看展要点待补充）";
      // venue 仅由前端 Canvas 叠加，避免与文生图 prompt 重复写入
      const prompt = "生成一张精致优雅的竖版社交媒体分享卡片，暖色调艺术风格。\n\n标题：\"艺术灵瞳 · 看展笔记\"\n\n画作信息：\n作品：" + title + "\n作者：" + (artist || "") + "\n年代：" + (year || "") + "\n风格：" + (style || "") + "\n\n卡片上展示以下三个要点：\n" + detailsText + "\n\n底部显示口号：拍一件艺术品，AI给你讲门道。注意：底部需预留约6%高度的纯色区域供后续叠加文字。竖版构图，中文排版，暖色系，高雅艺术感。";

      const base64 = await generateImage(prompt, "1024*1440");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        data: { image: base64 },
      }));
      return;
    }

    // POST /api/imagine — reimagine artwork in a different style
    if (pathname === "/api/imagine" && req.method === "POST") {
      if (!globalThis.fetch) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Node.js 版本过低" }));
        return;
      }
      const body = await readBody(req);
      const { image, style } = body;
      if (!image || !style) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "缺少图片或风格参数" }));
        return;
      }

      // 当前文生图模型无法直接吃图：先用视觉模型提炼原作构图/主体，再按风格重绘
      let visualBrief = "";
      try {
        visualBrief = await callQwen(
          [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image } },
              { type: "text", text: "用80字以内描述这幅作品的构图、主体物、主要色彩与氛围，不要猜测作品名或作者，只写可见画面。" },
            ],
          }],
          "你是严谨的视觉描述助手，只输出画面描述，不要标题或解释。"
        );
      } catch (err) {
        console.warn("Imagine vision brief failed:", err.message);
        visualBrief = "一件艺术作品，主体居中，层次分明";
      }

      const prompt = "根据以下原作画面描述，用「" + style + "」风格重新创作一幅完整独立的艺术作品。保持原作构图与主体，改用该风格的笔触、色彩与氛围。\n\n原作画面：" + visualBrief;

      const base64 = await generateImage(prompt, "1024*1024");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        data: { image: base64 },
      }));
      return;
    }

    // 未知 API：返回 JSON 404（避免把 HTML 首页当 JSON 解析）
    if (pathname.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Not Found" }));
      return;
    }

    // 其它未知路径回退首页（便于本地预览）
    serveStatic(res, "/");

  } catch (err) {
    console.error("Server error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log("🎨 艺术灵瞳已启动: http://localhost:" + PORT);
  console.log("📸 使用手机在同一网络下访问即可体验");
});



