// 캡처 이미지(여러 장)를 받아 Gemini(무료 키)로 정리해서 claude_notes 표에 저장.
// POST { images: [{ mediaType, dataBase64 }, ...] }  (images는 1~10장)
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-flash-lite-latest";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY가 설정되어 있지 않아요. Supabase 비밀값에 추가해 주세요." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const images: { mediaType: string; dataBase64: string }[] = body.images || [];
    if (images.length === 0 || images.length > 10) {
      return new Response(JSON.stringify({ error: "이미지는 1~10장만 보낼 수 있어요." }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const parts: any[] = images.map((img) => ({
      inline_data: { mime_type: img.mediaType, data: img.dataBase64 },
    }));
    parts.push({
      text:
        "이 캡처(들)는 클로드(Claude) 또는 AI 활용법에 관한 인스타그램/블로그 글이야. " +
        "내용을 공부 노트용으로 정리해서 아래 JSON 형식으로만 답해. 설명이나 다른 글자, 코드블록 표시 없이 JSON만 출력해.\n" +
        '{"title":"짧은 제목","summary":"한 문장 요약","points":["핵심 포인트1","핵심 포인트2","..."],"tags":["태그1","태그2"]}\n' +
        "points는 3~6개, tags는 1~4개(한글 짧은 단어)로 만들어. 캡처 여러 장이면 하나의 글로 보고 통째로 정리해.",
    });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: "Gemini API 호출 실패", detail: errText }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ error: "정리 결과를 읽지 못했어요.", raw }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(match[0]);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: inserted, error } = await supabase
      .from("claude_notes")
      .insert([
        {
          title: parsed.title || "(제목 없음)",
          summary: parsed.summary || "",
          points: parsed.points || [],
          tags: parsed.tags || [],
          source_type: "capture",
        },
      ])
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: "저장 실패", detail: error.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ note: inserted }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
