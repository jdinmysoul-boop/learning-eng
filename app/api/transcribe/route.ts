import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get('file') as File;

    if (!file) {
      return Response.json(
        {
          error: '파일 없음',
        },
        {
          status: 400,
        }
      );
    }

    const transcription =
      await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'en',
      });

    return Response.json({
      text: transcription.text,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: 'transcribe failed',
      },
      {
        status: 500,
      }
    );
  }
}