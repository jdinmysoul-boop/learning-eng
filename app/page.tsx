'use client';

import { useEffect, useRef, useState } from 'react';

interface Sentence {
  id: number;
  en: string;
  ko: string;
}

type Status = 'idle' | 'listening' | 'success' | 'fail';

export default function EnglishStudyApp() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [inputEn, setInputEn] = useState('');
  const [inputKo, setInputKo] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testQueue, setTestQueue] = useState<Sentence[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [firstTryCount, setFirstTryCount] = useState(0);

  const isActiveRef = useRef(false);       // 녹음 의도 여부
  const transcriptRef = useRef('');        // 누적 인식 텍스트
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<any>(null);
  const audioOk = useRef<HTMLAudioElement | null>(null);
  const audioError = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('study_sentences');
    if (saved) setSentences(JSON.parse(saved));
    audioOk.current = new Audio('/sound_ok.mp3');
    audioError.current = new Audio('/sound_error.mp3');
    return () => { stopRecognition(); };
  }, []);

  // ── 인식 인스턴스 완전 제거 ──────────────────────────────
  const destroyRecognition = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;   // ← 먼저 null로 만들어 onend 재진입 차단
      try { rec.onstart = null; rec.onresult = null; rec.onerror = null; rec.onend = null; rec.abort(); } catch (e) {}
    }
  };

  // ── 의도적 종료 (제출 / 재시도 / 리셋) ─────────────────
  const stopRecognition = () => {
    isActiveRef.current = false;
    destroyRecognition();
    setIsRecording(false);
  };

  // ── 새 인스턴스 생성 및 시작 (iOS Safari: 매번 new) ────
  const createAndStart = () => {
    destroyRecognition();   // 혹시 남아있는 이전 인스턴스 제거

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    recognitionRef.current = rec;

    rec.lang = 'en-US';
    rec.continuous = false;        // iOS Safari: true 미지원
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsRecording(true);
    };

    rec.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript + ' ';
      }
      text = text.trim();
      transcriptRef.current = text;
      setRecognizedText(text);
    };

    rec.onerror = (event: any) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      console.error('STT error:', event.error);
      // 심각한 에러만 중단, 나머지는 onend에서 재시작
    };

    rec.onend = () => {
      // ✅ isActiveRef가 true면 → 사용자가 아직 말하는 중이므로 재시작
      // ✅ isActiveRef가 false면 → 의도적 종료이므로 그냥 종료
      if (!isActiveRef.current) {
        setIsRecording(false);
        return;
      }
      // iOS Safari는 continuous=false라 onend가 수시로 발생
      // → 200ms 후 새 인스턴스로 재시작
      restartTimerRef.current = setTimeout(() => {
        if (isActiveRef.current) {
          createAndStart();
        }
      }, 200);
    };

    try {
      rec.start();
    } catch (e) {
      console.error('start error:', e);
      if (isActiveRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (isActiveRef.current) createAndStart();
        }, 300);
      }
    }
  };

  // ── 녹음 시작 (버튼) ────────────────────────────────────
  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('음성 인식을 지원하지 않는 브라우저입니다. Safari 또는 Chrome을 사용해주세요.');
      return;
    }

    transcriptRef.current = '';
    setRecognizedText('');
    setStatus('listening');
    isActiveRef.current = true;   // ← 의도적 시작 표시
    createAndStart();
  };

  // ── 제출 (버튼) ─────────────────────────────────────────
  const submitSpeaking = () => {
    stopRecognition();   // isActiveRef=false → onend에서 재시작 안 함

    const transcript = transcriptRef.current;
    if (!transcript.trim()) {
      setStatus('fail');
      setRecognizedText('음성을 인식하지 못했습니다.');
      return;
    }
    checkAnswer(transcript);
  };

  // ── 재시도 (버튼) ────────────────────────────────────────
  const handleRetry = () => {
  stopRecognition();
  transcriptRef.current = '';
  setRecognizedText('');
  setStatus('listening');
  setCurrentAttempt((prev) => prev + 1);
  isActiveRef.current = true;
  createAndStart();
};

  // ── 정답 판정 ────────────────────────────────────────────
  const normalizeText = (text: string) =>
    text.replace(/[^\w\s]/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();

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
    const isCorrect = calculateSimilarity(transcript, current.en) >= 0.8;
    if (isCorrect) {
      setStatus('success');
      if (currentAttempt === 1) setFirstTryCount((prev) => prev + 1);
      audioOk.current?.play().catch(() => {});
      setTimeout(() => { moveNext(); }, 1500);
    } else {
      setStatus('fail');
      audioError.current?.play().catch(() => {});
    }
  };

  const moveNext = () => {
    const next = currentIndex + 1;
    if (next >= testQueue.length) { setIsFinished(true); return; }
    transcriptRef.current = '';
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setCurrentIndex(next);
  };

  const saveSentences = (updated: Sentence[]) => {
    setSentences(updated);
    localStorage.setItem('study_sentences', JSON.stringify(updated));
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
    stopRecognition();
    transcriptRef.current = '';
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
          <button onClick={startListening} className="bg-blue-500 text-white px-6 py-4 rounded-xl font-bold w-full">
            발음 시작
          </button>
        )}
        {status === 'listening' && (
          <button onClick={submitSpeaking} className="bg-green-500 text-white px-6 py-4 rounded-xl font-bold w-full animate-pulse">
            제출하기
          </button>
        )}
        {status === 'success' && <div className="mt-6 text-blue-500 text-2xl font-bold">정답!</div>}
        {status === 'fail' && (
          <div className="mt-6">
            <div className="mb-4">
              <div className="text-sm text-gray-500">정답 (참고용)</div>
              <div className="text-xl font-bold">{current.en}</div>
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
        <input type="text" placeholder="영어 문장" value={inputEn} onChange={(e) => setInputEn(e.target.value)} className="w-full border p-3 rounded-xl mb-2 bg-white text-black" />
        <input type="text" placeholder="한글 뜻" value={inputKo} onChange={(e) => setInputKo(e.target.value)} className="w-full border p-3 rounded-xl mb-2 bg-white text-black" />
        <button onClick={handleAddSentence} className="bg-green-500 text-white px-4 py-3 rounded-xl w-full font-bold">저장하기</button>
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
      <button onClick={startTest} className="bg-blue-500 text-white px-6 py-4 rounded-xl w-full font-bold">테스트 시작</button>
    </div>
  );
}