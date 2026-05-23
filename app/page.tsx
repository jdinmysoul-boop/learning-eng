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

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  // ✅ 핵심: 클로저 문제 해결용 ref
  const isActiveRef = useRef(false);
  const audioOk = useRef<HTMLAudioElement | null>(null);
  const audioError = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('study_sentences');
    if (saved) setSentences(JSON.parse(saved));
    audioOk.current = new Audio('/sound_ok.mp3');
    audioError.current = new Audio('/sound_error.mp3');
    return () => { killRecognition(); };
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
    answerWords.forEach((word) => { if (userWords.includes(word)) matched++; });
    return matched / answerWords.length;
  };

  const handleAddSentence = () => {
    if (!inputEn.trim() || !inputKo.trim()) return;
    const updated = [...sentences, { id: Date.now(), en: inputEn.trim(), ko: inputKo.trim() }];
    saveSentences(updated);
    setInputEn('');
    setInputKo('');
  };

  const handleDeleteSentence = (id: number) => {
    saveSentences(sentences.filter((s) => s.id !== id));
  };

  // ✅ recognition 인스턴스만 정리, isActiveRef는 건드리지 않음
  const killRecognition = () => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
  };

  const checkAnswer = (transcript: string, currentSentence: Sentence, attempt: number) => {
    const similarity = calculateSimilarity(transcript, currentSentence.en);
    if (similarity >= 0.8) {
      setStatus('success');
      if (attempt === 1) setFirstTryCount((prev) => prev + 1);
      audioOk.current?.play().catch(() => {});
      setTimeout(() => { moveNext(); }, 1500);
    } else {
      setStatus('fail');
      audioError.current?.play().catch(() => {});
    }
  };

  const moveNext = () => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= testQueue.length) {
        setIsFinished(true);
        return prev;
      }
      return next;
    });
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
  };

  const resetToMain = () => {
    isActiveRef.current = false;
    killRecognition();
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setCurrentIndex(0);
    setIsTesting(false);
    setIsFinished(false);
    setIsRecording(false);
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

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('음성 인식을 지원하지 않는 브라우저입니다. Safari 또는 Chrome을 사용해주세요.');
      return;
    }

    // 이전 인스턴스 완전 제거
    killRecognition();

    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    setRecognizedText('');
    setStatus('listening');

    // ✅ 활성 상태를 ref로 표시 (클로저에서도 최신값 읽힘)
    isActiveRef.current = true;
    setIsRecording(true);

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript + ' ';
        }
      }
      if (final) finalTranscriptRef.current = final.trim();
      const display = (finalTranscriptRef.current + ' ' + interim).trim();
      transcriptRef.current = display;
      setRecognizedText(display);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      console.error('STT Error:', event.error);
      isActiveRef.current = false;
      setStatus('fail');
      setIsRecording(false);
      killRecognition();
    };

    // ✅ onend: isActiveRef.current로 판단 (클로저 문제 없음)
    recognition.onend = () => {
      if (!isActiveRef.current) {
        // 의도적으로 종료한 경우
        setIsRecording(false);
        return;
      }
      // iOS Safari가 강제로 끊은 경우 → 같은 인스턴스로 재시작
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // 재시작 실패 시 새 인스턴스로 재귀 호출
          recognitionRef.current = null;
          setTimeout(() => { startListening(); }, 100);
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error(e);
      isActiveRef.current = false;
      setStatus('fail');
      setIsRecording(false);
      recognitionRef.current = null;
    }
  };

  const submitSpeaking = () => {
    // ✅ 먼저 isActiveRef를 false로 → onend가 재시작하지 않음
    isActiveRef.current = false;
    killRecognition();
    setIsRecording(false);

    const transcript = transcriptRef.current;
    if (!transcript.trim()) {
      setStatus('fail');
      setRecognizedText('음성을 인식하지 못했습니다.');
      return;
    }

    // ✅ state 비동기 문제 회피: currentIndex/currentAttempt를 직접 읽지 않고 인자로 전달
    const currentIdx = currentIndex;
    const attempt = currentAttempt;
    const current = testQueue[currentIdx];
    if (!current) return;
    checkAnswer(transcript, current, attempt);
  };

  const handleRetry = () => {
    isActiveRef.current = false;
    killRecognition();
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    setRecognizedText('');
    setStatus('idle');
    setIsRecording(false);
    setCurrentAttempt((prev) => prev + 1);
  };

  // --- UI ---

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