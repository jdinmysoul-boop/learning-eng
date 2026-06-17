'use client';

import { useEffect, useRef, useState } from 'react';

interface Sentence {
  id: number;
  en: string;
  ko: string;
}

type Status = 'idle' | 'recording' | 'processing' | 'success' | 'fail';

const SHEET_ID = '1tF8q2r8BxnK6V_x_KHfQlV81Q5FsL069NTTyj1SjtUQ';

export default function EnglishStudyApp() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testQueue, setTestQueue] = useState<Sentence[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [isFinished, setIsFinished] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [firstTryCount, setFirstTryCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioOk = useRef<any>(null);
  const audioError = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('study_sentences');
    if (saved) setSentences(JSON.parse(saved));

    const savedDate = localStorage.getItem('study_last_synced');
    if (savedDate) setLastSynced(savedDate);

    const createBeep = (frequency: number) => ({
      play: () => {
        try {
          const ctx = new AudioContext();
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          oscillator.frequency.value = frequency;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.3);
        } catch (e) {}
      }
    });

    audioOk.current = createBeep(880);
    audioError.current = createBeep(220);

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  }, []);

  // ── 텍스트 정규화 ────────────────────────────────────────
  const normalizeText = (text: string) =>
    text.replace(/[^\w\s]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // ── CSV 파싱 (쉼표 포함 문장 대응) ──────────────────────
  const parseCSVRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // ── Google Sheet 동기화 ──────────────────────────────────
  const syncFromSheet = async () => {
    setIsSyncing(true);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;
      const response = await fetch(url);
      const csv = await response.text();

      const rows = csv.trim().split('\n').slice(1);
      const parsed: Sentence[] = rows
        .map((row, index) => {
          const cols = parseCSVRow(row);
          const en = cols[0] ?? '';
          const ko = cols[1] ?? '';
          return { id: index + 1, en, ko };
        })
        .filter((s) => s.en && s.ko);

      if (parsed.length === 0) {
        alert('Sheet에서 문장을 찾을 수 없습니다. 헤더(en, ko)와 문장을 확인해주세요.');
        return;
      }

      setSentences(parsed);
      localStorage.setItem('study_sentences', JSON.stringify(parsed));

      const now = new Date().toLocaleString('ko-KR');
      setLastSynced(now);
      localStorage.setItem('study_last_synced', now);

      alert(`${parsed.length}개 문장을 가져왔습니다.`);
    } catch (e) {
      console.error(e);
      alert('동기화 실패. Sheet가 공개 설정인지 확인해주세요.');
    } finally {
      setIsSyncing(false);
    }
  };

  // ── TTS ──────────────────────────────────────────────────
  const speakText = async (text: string) => {
    try {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.NEXT_PUBLIC_GOOGLE_TTS_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: 'en-US',
              name: 'en-US-Wavenet-D',
              ssmlGender: 'MALE',
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: 0.9,
            },
          }),
        }
      );
      const data = await response.json();
      if (!data.audioContent) return;
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.play();
    } catch (e) {
      console.error('TTS error:', e);
    }
  };

  // ── 녹음 시작 ────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.start();
      setStatus('recording');
    } catch (e) {
      alert('마이크 접근 권한이 필요합니다.');
    }
  };

  // ── 녹음 중단 후 Groq API 전송 ──────────────────────────
  const stopAndSubmit = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return;
    setStatus('processing');
    mediaRecorder.onstop = async () => {
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      await sendToGroq(audioBlob);
    };
    mediaRecorder.stop();
  };

  // ── Groq Whisper API 호출 ────────────────────────────────
  const sendToGroq = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en');
      formData.append('response_format', 'json');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}` },
        body: formData,
      });

      if (!response.ok) {
        setStatus('fail');
        setRecognizedText('API 오류가 발생했습니다.');
        return;
      }

      const data = await response.json();
      const transcript = data.text?.trim() ?? '';

      if (!transcript) {
        setStatus('fail');
        setRecognizedText('음성을 인식하지 못했습니다.');
        return;
      }

      setRecognizedText(transcript);
      checkAnswer(transcript);
    } catch (e) {
      setStatus('fail');
      setRecognizedText('네트워크 오류가 발생했습니다.');
    }
  };

  // ── 정답 판정 ────────────────────────────────────────────
  const calculateSimilarity = (user: string, answer: string) => {
    const userWords = normalizeText(user).split(' ');
    const answerWords = normalizeText(answer).split(' ');
    let matched = 0;
    answerWords.forEach((w) => { if (userWords.includes(w)) matched++; });
    return matched / answerWords.length;
  };

  const checkAnswer = (transcript: string) => {
    const current = testQueue[currentIndex];
    if (!current) return;
    const exactMatch = normalizeText(transcript) === normalizeText(current.en);
    const similarityMatch = calculateSimilarity(transcript, current.en) >= 0.9;
    const isCorrect = exactMatch || similarityMatch;

    if (isCorrect) {
      setStatus('success');
      if (currentAttempt === 1) setFirstTryCount((prev) => prev + 1);
      audioOk.current?.play();
      setTimeout(() => { moveNext(); }, 1500);
    } else {
      setStatus('fail');
      audioError.current?.play();
    }
  };

  const moveNext = () => {
    const next = currentIndex + 1;
    if (next >= testQueue.length) { setIsFinished(true); return; }
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setCurrentIndex(next);
  };

  const handleRetry = () => {
    const current = testQueue[currentIndex];
    if (current) speakText(current.en);
    setRecognizedText('');
    setCurrentAttempt((prev) => prev + 1);
    startRecording();
  };

  // ── 정답 비교 하이라이트 ─────────────────────────────────
  const highlightDiff = (transcript: string, answer: string) => {
    const transcriptWords = transcript.trim().split(/\s+/);
    const answerNormalized = normalizeText(answer).split(' ');

    return transcriptWords.map((word, i) => {
      const normalizedWord = normalizeText(word);
      const isCorrect = answerNormalized[i] === normalizedWord;
      return (
        <span key={i} className={isCorrect ? 'text-blue-600' : 'text-red-500'}>
          {word}{' '}
        </span>
      );
    });
  };
// 이 함수를 추가하세요 (startTest 위에)
const shuffleArray = <T,>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
  const startTest = () => {
    if (sentences.length === 0) {
      alert('먼저 업데이트 버튼을 눌러 문장을 가져오세요.');
      return;
    }
    const shuffled = shuffleArray(sentences);
setTestQueue(shuffled.slice(0, 30));
    setCurrentIndex(0);
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setFirstTryCount(0);
    setIsFinished(false);
    setIsTesting(true);
  };

  const resetToMain = () => {
    mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setCurrentIndex(0);
    setIsTesting(false);
    setIsFinished(false);
  };

  // ── UI ───────────────────────────────────────────────────

  if (isFinished) {
    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-2xl shadow-lg text-black text-center">
        <h1 className="text-3xl font-bold mb-4">테스트 완료</h1>
        <p className="text-xl mb-6">첫 시도 성공: <strong>{firstTryCount}</strong> / {testQueue.length}</p>
        <button onClick={startTest} className="bg-blue-500 text-white px-6 py-3 rounded-xl w-full font-bold mb-3">다시 테스트</button>
        <button onClick={resetToMain} className="bg-gray-200 text-black px-6 py-3 rounded-xl w-full font-bold">메인으로 돌아가기</button>
      </div>
    );
  }

  if (isTesting) {
    const current = testQueue[currentIndex];
    if (!current) return null;
    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-2xl shadow-lg text-black text-center">
        <div className="mb-4 text-gray-500">{currentIndex + 1} / {testQueue.length}</div>
        <div className="bg-gray-100 p-6 rounded-xl text-2xl font-bold mb-8">{current.ko}</div>

        {recognizedText && (
  <div className="mb-2 text-xl font-bold break-words">
    {status === 'success'
      ? highlightDiff(recognizedText, current.en)
      : <span className="text-black">{recognizedText}</span>
    }
  </div>
)}
{status === 'success' && (
  <div className="mb-6 text-left bg-blue-50 p-3 rounded-xl">
    <div className="text-xs text-gray-500 mb-1">정답 문장</div>
    <div className="text-base text-gray-700">{current.en}</div>
  </div>
)}

        {status === 'idle' && (
          <button onClick={startRecording} className="bg-blue-500 text-white px-6 py-4 rounded-xl font-bold w-full">
            발음 시작
          </button>
        )}
        {status === 'recording' && (
          <button onClick={stopAndSubmit} className="bg-green-500 text-white px-6 py-4 rounded-xl font-bold w-full animate-pulse">
            제출하기 🎙️
          </button>
        )}
        {status === 'processing' && (
          <button disabled className="bg-gray-400 text-white px-6 py-4 rounded-xl font-bold w-full">
            인식 중...
          </button>
        )}
        {status === 'success' && (
          <div className="mt-6 text-blue-500 text-2xl font-bold">정답!</div>
        )}
        {status === 'fail' && (
          <div className="mt-6">
            {currentAttempt >= 4 && (
              <div className="mb-4">
                <div className="text-sm text-gray-500">정답 (참고용)</div>
                <div className="text-xl font-bold">{current.en}</div>
              </div>
            )}
            <button onClick={handleRetry} className="bg-red-500 text-white px-6 py-3 rounded-xl font-bold w-full">
              다시 시도하기
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-2xl shadow-lg text-black">
      <h1 className="text-3xl font-bold mb-6">영어 스피킹 학습</h1>
      <div className="bg-gray-50 border rounded-2xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <div className="font-bold text-lg">문장 목록</div>
          <div className="text-sm text-gray-500">총 {sentences.length}개</div>
        </div>
        {lastSynced && (
          <div className="text-xs text-gray-400 mb-3">마지막 업데이트: {lastSynced}</div>
        )}
        <button
          onClick={syncFromSheet}
          disabled={isSyncing}
          className="bg-green-500 text-white px-4 py-3 rounded-xl w-full font-bold disabled:bg-gray-300"
        >
          {isSyncing ? '가져오는 중...' : '📥 Google Sheet에서 업데이트'}
        </button>
      </div>
      <button
        onClick={startTest}
        className="bg-blue-500 text-white px-6 py-4 rounded-xl w-full font-bold"
      >
        테스트 시작
      </button>
    </div>
  );
}