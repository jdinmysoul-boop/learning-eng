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

    // 전송된 오디오 바이너리를 Buffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // OpenAI Whisper API 규격에 완벽히 부합하도록 FormData 재구성
    const openAiFormData = new FormData();
    
    // 유저의 파일 원본 포맷(mp3 등)을 유지하기 위해 블롭 데이터를 기반으로 파일 객체 생성
    const audioFile = new File([buffer], 'audio.mp3', { type: 'audio/mp3' });
    openAiFormData.append('file', audioFile);
    openAiFormData.append('model', 'whisper-1');
    openAiFormData.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: openAiFormData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      return NextResponse.json({ error: errorData.error?.message || 'OpenAI 통신 실패' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ text: data.text });
  } catch (error: any) {
    console.error('STT Route Runtime Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}