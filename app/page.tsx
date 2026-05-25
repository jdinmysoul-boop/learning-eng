'use client';

import { useEffect, useRef, useState } from 'react';

interface Sentence {
  id: number;
  en: string;
  ko: string;
}

type Status = 'idle' | 'recording' | 'processing' | 'success' | 'fail';

export default function EnglishStudyApp() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [inputEn, setInputEn] = useState('');
  const [inputKo, setInputKo] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testQueue, setTestQueue] = useState<Sentence[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [isFinished, setIsFinished] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [firstTryCount, setFirstTryCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioOk = useRef<any>(null);
  const audioError = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('study_sentences');
    if (saved) setSentences(JSON.parse(saved));

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

  const saveSentences = (updated: Sentence[]) => {
    setSentences(updated);
    localStorage.setItem('study_sentences', JSON.stringify(updated));
  };

  const normalizeText = (text: string) =>
    text.replace(/[^\w\s]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const calculateSimilarity = (user: string, answer: string) => {
    const userWords = normalizeText(user).split(' ');
    const answerWords = normalizeText(answer).split(' ');
    let matched = 0;
    answerWords.forEach((w) => { if (userWords.includes(w)) matched++; });
    return matched / answerWords.length;
  };

  const handleAddSentence = () => {
    if (!inputEn.trim() || !inputKo.trim()) return;
    saveSentences([...sentences, { id: Date.now(), en: inputEn.trim(), ko: inputKo.trim() }]);
    setInputEn('');
    setInputKo('');
  };

  const handleDeleteSentence = (id: number) => {
    saveSentences(sentences.filter((s) => s.id !== id));
  };

  // ── TTS ──────────────────────────────────────────────────
const speakText = (text: string) => {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  utterance.pitch = 1;

  // ✅ 영어 원어민 음성 명시적 선택
  const voices = window.speechSynthesis.getVoices();
  const englishVoice =
    voices.find((v) => v.name === 'Samantha') ||           // iOS 기본 영어 음성
    voices.find((v) => v.name.includes('Google US English')) || // Chrome
    voices.find((v) => v.lang === 'en-US' && !v.localService === false) ||
    voices.find((v) => v.lang === 'en-US');                // 그 외 en-US

  if (englishVoice) utterance.voice = englishVoice;
  window.speechSynthesis.speak(utterance);
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
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Groq API error:', err);
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
      console.error(e);
      setStatus('fail');
      setRecognizedText('네트워크 오류가 발생했습니다.');
    }
  };

  // ── 정답 판정 ────────────────────────────────────────────
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
  // speakText 제거
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
  // ✅ 버튼 탭 이벤트 안에서 직접 호출 → iOS 제스처 컨텍스트 유지
  const current = testQueue[currentIndex];
  if (current) speakText(current.en);

  setRecognizedText('');
  setCurrentAttempt((prev) => prev + 1);
  startRecording();
};

  const startTest = () => {
    if (sentences.length === 0) { alert('문장을 추가하세요.'); return; }
    const shuffled = [...sentences].sort(() => Math.random() - 0.5);
    setTestQueue(shuffled.slice(0, 50));
    setCurrentIndex(0);
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setFirstTryCount(0);
    setIsFinished(false);
    setIsTesting(true);
  };

  const resetToMain = () => {
    window.speechSynthesis.cancel();
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
        <p className="text-xl mb-6">첫 시도 성공: <strong>{firstTryCount}</strong></p>
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
          <div className={`mb-6 text-xl font-bold break-words ${status === 'success' ? 'text-blue-600' : 'text-black'}`}>
            {recognizedText}
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
            <div className="mb-4">
              {currentAttempt >= 4 && (
                <>
                  <div className="text-sm text-gray-500">정답 (참고용)</div>
                  <div className="text-xl font-bold">{current.en}</div>
                </>
              )}
            </div>
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
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-2">새 문장 추가</h2>
        <input
          type="text"
          placeholder="영어 문장"
          value={inputEn}
          onChange={(e) => setInputEn(e.target.value)}
          className="w-full border p-3 rounded-xl mb-2 bg-white text-black"
        />
        <input
          type="text"
          placeholder="한글 뜻"
          value={inputKo}
          onChange={(e) => setInputKo(e.target.value)}
          className="w-full border p-3 rounded-xl mb-2 bg-white text-black"
        />
        <button onClick={handleAddSentence} className="bg-green-500 text-white px-4 py-3 rounded-xl w-full font-bold">
          저장하기
        </button>
      </div>
      <div className="mb-6">
        <div className="flex justify-between mb-3">
          <div className="font-bold text-lg">저장된 문장</div>
          <div className="text-sm text-gray-500">총 {sentences.length}개</div>
        </div>
        <div className="border rounded-2xl overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto">
            {sentences.length === 0 ? (
              <div className="p-6 text-center text-gray-400">저장된 문장이 없습니다.</div>
            ) : (
              sentences.map((sentence, index) => (
                <div key={sentence.id} className="border-b p-4">
                  <div className="flex justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-bold break-words">{index + 1}. {sentence.en}</div>
                      <div className="text-sm text-gray-500 mt-1 break-words">{sentence.ko}</div>
                    </div>
                    <button onClick={() => handleDeleteSentence(sentence.id)} className="text-red-500 text-sm">삭제</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <button onClick={startTest} className="bg-blue-500 text-white px-6 py-4 rounded-xl w-full font-bold">
        테스트 시작
      </button>
    </div>
  );
}