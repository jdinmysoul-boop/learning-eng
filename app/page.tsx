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

export default function Home() {
  const [sentences, setSentences] = useState<
    Sentence[]
  >([]);

  const [inputEn, setInputEn] = useState('');
  const [inputKo, setInputKo] = useState('');

  const [isTesting, setIsTesting] =
    useState(false);

  const [testQueue, setTestQueue] = useState<
    Sentence[]
  >([]);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [recognizedText, setRecognizedText] =
    useState('');

  const [status, setStatus] =
    useState<Status>('idle');

  const [firstTryCount, setFirstTryCount] =
    useState(0);

  const [currentAttempt, setCurrentAttempt] =
    useState(1);

  const [isFinished, setIsFinished] =
    useState(false);

  const [isRecording, setIsRecording] =
    useState(false);

  const recognitionRef = useRef<any>(null);

  const audioOk = useRef<HTMLAudioElement | null>(
    null
  );

  const audioError = useRef<
    HTMLAudioElement | null
  >(null);

  useEffect(() => {
    const saved = localStorage.getItem(
      'study_sentences'
    );

    if (saved) {
      setSentences(JSON.parse(saved));
    }

    audioOk.current = new Audio('/sound_ok.mp3');

    audioError.current = new Audio(
      '/sound_error.mp3'
    );

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const saveSentences = (
    updated: Sentence[]
  ) => {
    setSentences(updated);

    localStorage.setItem(
      'study_sentences',
      JSON.stringify(updated)
    );
  };

  const normalizeText = (text: string) => {
    return text
      .replace(/[^\w\s]/gi, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleAddSentence = () => {
    if (!inputEn.trim() || !inputKo.trim()) {
      return;
    }

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

  const handleDeleteSentence = (
    id: number
  ) => {
    const updated = sentences.filter(
      (sentence) => sentence.id !== id
    );

    saveSentences(updated);
  };

  const startTest = () => {
    if (sentences.length === 0) {
      alert('문장을 추가하세요.');
      return;
    }

    const shuffled = [...sentences].sort(
      () => Math.random() - 0.5
    );

    const selected = shuffled.slice(0, 50);

    setTestQueue(selected);

    setCurrentIndex(0);

    setRecognizedText('');

    setStatus('idle');

    setFirstTryCount(0);

    setCurrentAttempt(1);

    setIsFinished(false);

    setIsTesting(true);
  };

  const moveNext = () => {
    setCurrentIndex((prev) => {
      const next = prev + 1;

      if (next >= testQueue.length) {
        setIsFinished(true);
        return prev;
      }

      setRecognizedText('');

      setStatus('idle');

      setCurrentAttempt(1);

      return next;
    });
  };

  const checkAnswer = (
    transcript: string
  ) => {
    const current = testQueue[currentIndex];

    if (!current) return;

    const user = normalizeText(transcript);

    const answer = normalizeText(current.en);

    const isCorrect = user === answer;

    if (isCorrect) {
      setStatus('success');

      if (currentAttempt === 1) {
        setFirstTryCount((prev) => prev + 1);
      }

      audioOk.current
        ?.play()
        .catch(() => {});

      setTimeout(() => {
        moveNext();
      }, 1500);
    } else {
      setStatus('fail');

      audioError.current
        ?.play()
        .catch(() => {});
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        '크롬 최신 브라우저를 사용해주세요.'
      );
      return;
    }

    // 이전 recognition 완전 제거
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult =
          null;

        recognitionRef.current.onend = null;

        recognitionRef.current.onerror =
          null;

        recognitionRef.current.abort();
      } catch {}
    }

    const recognition = new SpeechRecognition();

    recognitionRef.current = recognition;

    recognition.lang = 'en-US';

    recognition.continuous = false;

    recognition.interimResults = false;

    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    let finished = false;

    recognition.onstart = () => {
      setIsRecording(true);

      setStatus('listening');

      setRecognizedText('');
    };

    recognition.onresult = (event: any) => {
      finalTranscript =
        event.results[0][0].transcript;

      setRecognizedText(finalTranscript);
    };

    recognition.onerror = (event: any) => {
      if (finished) return;

      finished = true;

      setIsRecording(false);

      setStatus('fail');

      if (event.error === 'no-speech') {
        setRecognizedText(
          '음성이 감지되지 않았습니다.'
        );
      } else {
        setRecognizedText(
          `오류: ${event.error}`
        );
      }
    };

    recognition.onend = () => {
      if (finished) return;

      finished = true;

      setIsRecording(false);

      if (finalTranscript.trim()) {
        checkAnswer(finalTranscript);
      } else {
        setStatus('fail');

        setRecognizedText(
          '음성을 인식하지 못했습니다.'
        );
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.error(error);

      setIsRecording(false);

      setStatus('fail');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  };

  const handleRetry = () => {
    setRecognizedText('');

    setStatus('idle');

    setCurrentAttempt((prev) => prev + 1);
  };

  if (isFinished) {
    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-black text-center">
        <h1 className="text-3xl font-bold mb-4">
          테스트 완료
        </h1>

        <p className="text-xl mb-6">
          첫 시도 성공:
          <strong>
            {' '}
            {firstTryCount}
          </strong>
        </p>

        <button
          onClick={startTest}
          className="bg-blue-500 text-white px-6 py-3 rounded-lg w-full font-bold"
        >
          다시 테스트
        </button>

        <button
          onClick={() =>
            setIsTesting(false)
          }
          className="mt-4 underline text-gray-500"
        >
          메인으로 돌아가기
        </button>
      </div>
    );
  }

  if (isTesting) {
    const current =
      testQueue[currentIndex];

    if (!current) return null;

    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-black text-center">
        <div className="mb-4 text-gray-500">
          {currentIndex + 1} /{' '}
          {testQueue.length}
        </div>

        <div className="bg-gray-100 p-6 rounded-lg text-2xl font-bold mb-8">
          {current.ko}
        </div>

        {recognizedText && (
          <div
            className={`mb-6 text-xl font-bold break-words ${
              status === 'success'
                ? 'text-blue-600'
                : status === 'fail'
                ? 'text-red-500'
                : 'text-black'
            }`}
          >
            {recognizedText}
          </div>
        )}

        {!isRecording ? (
          <button
            onClick={startListening}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg font-bold w-full"
          >
            발음 시작
          </button>
        ) : (
          <button
            onClick={stopListening}
            className="bg-red-500 text-white px-6 py-3 rounded-lg font-bold w-full"
          >
            녹음 종료
          </button>
        )}

        {status === 'success' && (
          <div className="text-blue-500 text-2xl font-bold mt-6">
            정답!
          </div>
        )}

        {status === 'fail' && (
          <div className="mt-6">
            <div className="mb-4">
              <div className="text-sm text-gray-500">
                정답
              </div>

              <div className="text-xl font-bold">
                {current.en}
              </div>
            </div>

            <button
              onClick={handleRetry}
              className="bg-red-500 text-white px-6 py-3 rounded-lg font-bold w-full"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-black">
      <h1 className="text-3xl font-bold mb-6">
        영어 스피킹 학습
      </h1>

      <div className="mb-6">
        <h2 className="text-lg font-bold mb-2">
          새 문장 추가
        </h2>

        <input
          type="text"
          placeholder="영어 문장"
          value={inputEn}
          onChange={(e) =>
            setInputEn(e.target.value)
          }
          className="w-full border p-2 rounded mb-2"
        />

        <input
          type="text"
          placeholder="한글 뜻"
          value={inputKo}
          onChange={(e) =>
            setInputKo(e.target.value)
          }
          className="w-full border p-2 rounded mb-2"
        />

        <button
          onClick={handleAddSentence}
          className="bg-green-500 text-white px-4 py-2 rounded w-full"
        >
          저장하기
        </button>
      </div>

      <div className="mb-6">
        <div className="font-bold mb-2">
          저장된 문장
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {sentences.map((sentence) => (
            <div
              key={sentence.id}
              className="border rounded p-3 flex justify-between items-start gap-2"
            >
              <div>
                <div className="font-bold">
                  {sentence.en}
                </div>

                <div className="text-sm text-gray-500">
                  {sentence.ko}
                </div>
              </div>

              <button
                onClick={() =>
                  handleDeleteSentence(
                    sentence.id
                  )
                }
                className="bg-red-500 text-white px-3 py-1 rounded text-sm"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={startTest}
        className="bg-blue-500 text-white px-6 py-3 rounded-lg w-full font-bold"
      >
        테스트 시작
      </button>
    </div>
  );
}