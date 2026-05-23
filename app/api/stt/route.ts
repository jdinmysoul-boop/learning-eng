import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key가 설정되지 않았습니다.' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: '오디오 파일이 없습니다.' }, { status: 400 });
    }

    // OpenAI Whisper API 규격에 맞게 폼데이터 재구성
    const openAiFormData = new FormData();
    openAiFormData.append('file', file, 'audio.wav');
    openAiFormData.append('model', 'whisper-1');
    openAiFormData.append('language', 'en'); // 영어 인식 고정

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: openAiFormData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI Error:', errorData);
      return NextResponse.json({ error: 'OpenAI API 처리 중 오류가 발생했습니다.' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ text: data.text });
  } catch (error: any) {
    console.error('STT Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}