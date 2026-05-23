'use client';

import { useEffect, useRef, useState } from 'react';

interface Sentence {
  id: number;
  en: string;
  ko: string;
}

type Status =
  | 'idle'
  | 'listening'
  | 'success'
  | 'fail';

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
  const audioOk = useRef<HTMLAudioElement | null>(null);
  const audioError = useRef<HTMLAudioElement | null>(null);

  // 컴포넌트 마운트 시 오디오 초기화 및 브라우저 단 1회 SpeechRecognition 인스턴스 생성
  useEffect(() => {
    const saved = localStorage.getItem('study_sentences');
    if (saved) {
      setSentences(JSON.parse(saved));
    }

    audioOk.current = new Audio('/sound_ok.mp3');
    audioError.current = new Audio('/sound_error.mp3');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, []);

  const saveSentences = (updated: Sentence[]) => {
    setSentences(updated);
    localStorage.setItem('study_sentences', JSON.stringify(updated));
  };

  const normalizeText = (text: string) => {
    return text
      .replace(/[^\w\s]/gi, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  };

  const calculateSimilarity = (user: string, answer: string) => {
    const userWords = normalizeText(user).split(' ');
    const answerWords = normalizeText(answer).split(' ');

    let matched = 0;
    answerWords.forEach((word) => {
      if (userWords.includes(word)) {
        matched++;
      }
    });

    return matched / answerWords.length;
  };

  const handleAddSentence = () => {
    if (!inputEn.trim() || !inputKo.trim()) return;

    const updated = [
      ...sentences,
      {
        id: Date.now(),
        en: inputEn.trim(),
        ko: inputKo.trim(),
      },
    ];

    saveSentences(updated);
    setInputEn('');
    setInputKo('');
  };

  const handleDeleteSentence = (id: number) => {
    const updated = sentences.filter((sentence) => sentence.id !== id);
    saveSentences(updated);
  };

  const startTest = () => {
    if (sentences.length === 0) {
      alert('문장을 추가하세요.');
      return;
    }

    const shuffled = [...sentences].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 50);

    setTestQueue(selected);
    setCurrentIndex(0);
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setFirstTryCount(0);
    setIsFinished(false);
    setIsTesting(true);
  };

  const moveNext = () => {
    const next = currentIndex + 1;

    if (next >= testQueue.length) {
      setIsFinished(true);
      return;
    }

    transcriptRef.current = '';
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setCurrentIndex(next);
  };

  const resetToMain = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }

    transcriptRef.current = '';
    setRecognizedText('');
    setStatus('idle');
    setCurrentAttempt(1);
    setCurrentIndex(0);
    setIsTesting(false);
    setIsFinished(false);
    setIsRecording(false);
  };

  const checkAnswer = (transcript: string) => {
    const current = testQueue[currentIndex];
    if (!current) return;

    const similarity = calculateSimilarity(transcript, current.en);
    const isCorrect = similarity >= 0.8;

    if (isCorrect) {
      setStatus('success');
      if (currentAttempt === 1) {
        setFirstTryCount((prev) => prev + 1);
      }

      if (audioOk.current) {
        audioOk.current.currentTime = 0;
        audioOk.current.play().catch(() => {});
      }

      setTimeout(() => {
        moveNext();
      }, 1500);
    } else {
      setStatus('fail');
      if (audioError.current) {
        audioError.current.currentTime = 0;
        audioError.current.play().catch(() => {});
      }
    }
  };

  const startListening = () => {
    if (!recognitionRef.current) {
      alert('음성 인식 API를 사용할 수 없는 브라우저이거나 초기화되지 않았습니다.');
      return;
    }

    if (isRecording) return;

    transcriptRef.current = '';
    setRecognizedText('');
    setStatus('listening');
    setIsRecording(true);

    const recognition = recognitionRef.current;

    // 기존 바인딩된 이벤트 핸들러 초기화 및 재등록
    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + ' ';
      }
      transcript = transcript.trim();
      transcriptRef.current = transcript;
      setRecognizedText(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      if (event.error !== 'aborted') {
        setStatus('fail');
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition service disconnected');
      setIsRecording(false);
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('Start error:', error);
      // 이미 구동 중인 에러 발생 시 강제 중지 후 재구동 처리
      try {
        recognition.abort();
        setTimeout(() => recognition.start(), 100);
      } catch (e) {}
    }
  };

  const submitSpeaking = () => {
    setIsRecording(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    const transcript = transcriptRef.current;

    if (!transcript.trim()) {
      setStatus('fail');
      setRecognizedText('음성을 인식하지 못했습니다.');
      return;
    }

    checkAnswer(transcript);
  };

  const handleRetry = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }
    transcriptRef.current = '';
    setRecognizedText('');
    setStatus('idle');
    setIsRecording(false);
    setCurrentAttempt((prev) => prev + 1);
  };

  if (isFinished) {
    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-2xl shadow-lg text-black text-center">
        <h1 className="text-3xl font-bold mb-4">테스트 완료</h1>
        <p className="text-xl mb-6">
          첫 시도 성공: <strong>{firstTryCount}</strong>
        </p>
        <button
          onClick={startTest}
          className="bg-blue-500 text-white px-6 py-3 rounded-xl w-full font-bold mb-3"
        >
          다시 테스트
        </button>
        <button
          onClick={resetToMain}
          className="bg-gray-200 text-black px-6 py-3 rounded-xl w-full font-bold"
        >
          메인으로 돌아가기
        </button>
      </div>
    );
  }

  if (isTesting) {
    const current = testQueue[currentIndex];
    if (!current) return null;

    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-2xl shadow-lg text-black text-center">
        <div className="mb-4 text-gray-500">
          {currentIndex + 1} / {testQueue.length}
        </div>

        <div className="bg-gray-100 p-6 rounded-xl text-2xl font-bold mb-8">
          {current.ko}
        </div>

        {recognizedText && (
          <div
            className={`mb-6 text-xl font-bold break-words ${
              status === 'success'
                ? 'text-blue-600'
                : status === 'fail'
                ? 'text-gray-400'
                : 'text-black'
            }`}
          >
            {recognizedText}
          </div>
        )}

        {status === 'idle' && (
          <button
            onClick={startListening}
            className="bg-blue-500 text-white px-6 py-4 rounded-xl font-bold w-full"
          >
            발음 시작
          </button>
        )}

        {status === 'listening' && (
          <button
            onClick={submitSpeaking}
            className="bg-green-500 text-white px-6 py-4 rounded-xl font-bold w-full animate-pulse"
          >
            제출하기
          </button>
        )}

        {status === 'success' && (
          <div className="mt-6 text-blue-500 text-2xl font-bold">정답!</div>
        )}

        {status === 'fail' && (
          <div className="mt-6">
            <div className="mb-4">
              <div className="text-sm text-gray-500">정답 (참고용)</div>
              <div className="text-xl font-bold">{current.en}</div>
            </div>
            <button
              onClick={handleRetry}
              className="bg-red-500 text-white px-6 py-3 rounded-xl font-bold w-full"
            >
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
        <button
          onClick={handleAddSentence}
          className="bg-green-500 text-white px-4 py-3 rounded-xl w-full font-bold"
        >
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
                      <div className="font-bold break-words">
                        {index + 1}. {sentence.en}
                      </div>
                      <div className="text-sm text-gray-500 mt-1 break-words">{sentence.ko}</div>
                    </div>
                    <button onClick={() => handleDeleteSentence(sentence.id)} className="text-red-500 text-sm">
                      삭제
                    </button>
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