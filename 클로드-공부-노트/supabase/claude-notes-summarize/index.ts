// 캡처 이미지(여러 장)를 받아서:
// 1) Gemini로 핵심 키워드들을 뽑고
// 2) 키워드마다 Gemini(웹 검색 기능 켠 채로)가 검색해서 더 깊이 정리해
// 3) 키워드 하나당 노트 하나씩 claude_notes 표에 저장.
// POST { images: [{ mediaType, dataBase64 }, ...] }  (images는 1~10장)
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const EXTRACT_MODEL = "gemini-flash-lite-latest"; // 캡처 읽기(이미지 입력), 검색은 안 씀
const RESEARCH_MODEL = "gemini-flash-latest"; // 웹 검색 기능(google_search)이 되는 모델
const MAX_TOPICS = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function extractJson(raw: string): any | null {
  // 객체({...}) 또는 배열([...]) 둘 다 받아줌
  const objMatch = raw.match(/\{[\s\S]*\}/);
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  // 더 먼저(바깥쪽) 나오는 쪽을 고름
  const objIdx = objMatch ? raw.indexOf(objMatch[0]) : -1;
  const arrIdx = arrMatch ? raw.indexOf(arrMatch[0]) : -1;
  const candidates: string[] = [];
  if (objIdx !== -1 && (arrIdx === -1 || objIdx <= arrIdx)) candidates.push(objMatch![0]);
  if (arrIdx !== -1) candidates.push(arrMatch![0]);
  if (objIdx !== -1 && !candidates.includes(objMatch![0])) candidates.push(objMatch![0]);

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // 다음 후보 시도
    }
  }
  return null;
}

async function callGemini(model: string, parts: any[], useSearch: boolean) {
  const body: any = {
    contents: [{ role: "user", parts }],
  };
  if (useSearch) {
    body.tools = [{ google_search: {} }];
  } else {
    body.generationConfig = { responseMimeType: "application/json" };
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (!GEMINI_API_KEY) {
    return json({ error: "GEMINI_API_KEY가 설정되어 있지 않아요. Supabase 비밀값에 추가해 주세요." }, 500);
  }

  try {
    const body = await req.json();
    const images: { mediaType: string; dataBase64: string }[] = body.images || [];
    if (images.length === 0 || images.length > 10) {
      return json({ error: "이미지는 1~10장만 보낼 수 있어요." }, 400);
    }

    const imageParts = images.map((img) => ({
      inline_data: { mime_type: img.mediaType, data: img.dataBase64 },
    }));

    // 1단계: 캡처에서 핵심 키워드들을 뽑기
    const extractParts = [
      ...imageParts,
      {
        text:
          "이 캡처(들)는 클로드(Claude) 또는 AI 활용법에 관한 인스타그램/블로그 글이야. " +
          "이 안에서 따로따로 공부할 만한 핵심 키워드(도구 이름, 기능 이름, 개념 등)를 뽑아줘. " +
          "예를 들어 '클로드 Skills 중 Remotion, Playwright 소개' 같은 글이면 키워드는 'Remotion', 'Playwright' 둘이야. " +
          "뚜렷이 나눌 키워드가 없고 하나의 팁/개념이면 키워드 1개만 뽑아. " +
          `키워드는 최대 ${MAX_TOPICS}개까지만. 아래 JSON 형식으로만 답해. 설명 없이 JSON만 출력해.\n` +
          '{"topics":[{"keyword":"키워드","context":"이 캡처에서 이 키워드에 대해 뭐라고 했는지 간단히"}]}',
      },
    ];

    const extractRes = await callGemini(EXTRACT_MODEL, extractParts, false);
    if (!extractRes.ok) {
      const errText = await extractRes.text();
      return json({ error: "캡처 읽기 실패", detail: errText }, 502);
    }
    const extractData = await extractRes.json();
    const extractRaw = extractData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const extractParsed = extractJson(extractRaw);
    const rawTopics = Array.isArray(extractParsed) ? extractParsed : extractParsed?.topics || [];
    const topics: { keyword: string; context: string }[] = rawTopics.slice(0, MAX_TOPICS);

    if (topics.length === 0) {
      return json({ error: "캡처에서 정리할 내용을 찾지 못했어요.", raw: extractRaw }, 502);
    }

    // 2단계: 키워드마다 웹 검색해서 깊이 있게 정리
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const notes: any[] = [];
    const failures: { keyword: string; detail: string }[] = [];

    for (const topic of topics) {
      const keyword = (topic.keyword || "").trim();
      if (!keyword) continue;
      const context = topic.context || "";

      const researchParts = [
        {
          text:
            `너는 공부 노트를 만들어 주는 도우미야. "${keyword}"에 대해 웹 검색으로 찾아보고 공부용으로 정리해줘. ` +
            `참고로 사용자가 본 캡처에는 이렇게 나와 있었어: "${context}"\n` +
            "이 내용을 참고하되, 검색한 최신 정보로 보충해서 '이게 뭔지', '왜 쓰는지', '핵심 사용법/포인트'를 정리해. " +
            "답은 설명 없이 아래 JSON 형식으로만 출력해(코드블록 표시 없이).\n" +
            '{"title":"짧은 제목","summary":"한 문장 요약","points":["핵심 포인트1","핵심 포인트2","..."],"tags":["태그1","태그2"]}\n' +
            "points는 4~7개, tags는 1~4개(한글 짧은 단어, 키워드 자체도 하나 포함)로 만들어.",
        },
      ];

      let researchRes = await callGemini(RESEARCH_MODEL, researchParts, true);
      let usedSearch = researchRes.ok;
      if (!researchRes.ok && (researchRes.status === 503 || researchRes.status === 404 || researchRes.status === 429)) {
        // 검색 기능이 막히면(무료 등급 한도 등) 검색 없이 한 번 더 시도(그래도 없는 것보단 나음)
        researchRes = await callGemini(EXTRACT_MODEL, researchParts, false);
        usedSearch = false;
      }

      if (!researchRes.ok) {
        failures.push({ keyword, detail: await researchRes.text() });
        continue;
      }

      const researchData = await researchRes.json();
      const researchRaw = researchData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = extractJson(researchRaw);
      if (!parsed) {
        failures.push({ keyword, detail: "정리 결과를 읽지 못함" });
        continue;
      }

      const tags = Array.from(new Set([...(parsed.tags || []), keyword]));
      const { data: inserted, error } = await supabase
        .from("claude_notes")
        .insert([
          {
            title: parsed.title || keyword,
            summary: parsed.summary || "",
            points: parsed.points || [],
            tags,
            source_type: usedSearch ? "capture-researched" : "capture-researched-nosearch",
          },
        ])
        .select()
        .single();

      if (error) {
        failures.push({ keyword, detail: error.message });
        continue;
      }
      notes.push(inserted);
    }

    if (notes.length === 0) {
      return json({ error: "키워드는 찾았지만 정리/저장에 모두 실패했어요.", failures }, 502);
    }

    return json({ notes, failures });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
