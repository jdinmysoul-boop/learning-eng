'use client';

import { useState, useEffect, useRef } from 'react';

interface Sentence {
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

  const [firstTryCount, setFirstTryCount] = useState(0);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [isFinished, setIsFinished] = useState(false);

  const audioOk = useRef<HTMLAudioElement | null>(null);
  const audioError = useRef<HTMLAudioElement | null>(null);

  const recognitionRef = useRef<any>(null);

  // 결과가 실제로 왔는지 추적
  const resultReceivedRef = useRef(false);

  // 컴포넌트 unmount 대응
  const mountedRef = useRef(true);

  useEffect(() => {
    const saved = localStorage.getItem('study_sentences');

    if (saved) {
      setSentences(JSON.parse(saved));
    }

    audioOk.current = new Audio('/sound_ok.mp3');
    audioError.current = new Audio('/sound_error.mp3');

    return () => {
      mountedRef.current = false;

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, []);

  const normalizeText = (text: string) => {
    return text
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleAddSentence = () => {
    if (!inputEn.trim() || !inputKo.trim()) {
      return;
    }

    const newSentences = [
      ...sentences,
      {
        en: inputEn.trim(),
        ko: inputKo.trim(),
      },
    ];

    setSentences(newSentences);

    localStorage.setItem(
      'study_sentences',
      JSON.stringify(newSentences)
    );

    setInputEn('');
    setInputKo('');
  };

  const startTest = () => {
    if (sentences.length === 0) {
      alert('저장된 문장이 없습니다.');
      return;
    }

    const shuffled = [...sentences].sort(
      () => Math.random() - 0.5
    );

    const selected = shuffled.slice(0, 50);

    setTestQueue(selected);

    setCurrentIndex(0);
    setFirstTryCount(0);
    setCurrentAttempt(1);

    setRecognizedText('');
    setStatus('idle');

    setIsFinished(false);
    setIsTesting(true);
  };

  const moveToNextQuestion = () => {
    setCurrentIndex((prev) => {
      const nextIndex = prev + 1;

      if (nextIndex >= testQueue.length) {
        setIsFinished(true);
        return prev;
      }

      setStatus('idle');
      setRecognizedText('');
      setCurrentAttempt(1);

      return nextIndex;
    });
  };

  const checkAnswer = (transcript: string) => {
    const currentSentence = testQueue[currentIndex];

    if (!currentSentence) return;

    const normalizedTranscript =
      normalizeText(transcript);

    const normalizedAnswer =
      normalizeText(currentSentence.en);

    const isCorrect =
      normalizedTranscript === normalizedAnswer;

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
        if (!mountedRef.current) return;

        moveToNextQuestion();
      }, 2000);
    } else {
      setStatus('fail');

      if (audioError.current) {
        audioError.current.currentTime = 0;

        audioError.current.play().catch(() => {});
      }
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        '이 브라우저는 음성 인식을 지원하지 않습니다.\n크롬 또는 모바일 사파리를 사용해주세요.'
      );
      return;
    }

    // 기존 recognition 종료
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }

    const recognition = new SpeechRecognition();

    recognitionRef.current = recognition;

    resultReceivedRef.current = false;

    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      console.log('speech start');

      setStatus('listening');
      setRecognizedText('');
    };

    recognition.onresult = (event: any) => {
      console.log('speech result', event);

      resultReceivedRef.current = true;

      try {
        const transcript =
          event.results?.[0]?.[0]?.transcript || '';

        if (!transcript) {
          setStatus('fail');
          setRecognizedText(
            '인식된 텍스트가 없습니다.'
          );
          return;
        }

        setRecognizedText(transcript);

        // Safari 대응
        setTimeout(() => {
          checkAnswer(transcript);
        }, 100);
      } catch (error) {
        console.error(error);

        setStatus('fail');
        setRecognizedText(
          '음성 처리 중 오류가 발생했습니다.'
        );
      }
    };

    recognition.onnomatch = () => {
      console.log('speech no match');

      if (resultReceivedRef.current) return;

      setStatus('fail');

      setRecognizedText(
        '발음을 인식하지 못했습니다.'
      );
    };

    recognition.onerror = (event: any) => {
      console.log('speech error', event.error);

      // 이미 결과 받았으면 무시
      if (resultReceivedRef.current) {
        return;
      }

      setStatus('fail');

      switch (event.error) {
        case 'no-speech':
          setRecognizedText(
            '목소리가 감지되지 않았습니다.'
          );
          break;

        case 'audio-capture':
          setRecognizedText(
            '마이크를 찾을 수 없습니다.'
          );
          break;

        case 'not-allowed':
          setRecognizedText(
            '마이크 권한이 거부되었습니다.'
          );
          break;

        case 'network':
          setRecognizedText(
            '네트워크 오류가 발생했습니다.'
          );
          break;

        default:
          setRecognizedText(
            `오류 발생: ${event.error}`
          );
      }
    };

    recognition.onend = () => {
      console.log('speech end');

      // 결과를 이미 받은 경우 종료만 처리
      if (resultReceivedRef.current) {
        return;
      }

      // listening 상태인데 결과가 없다면 fail 처리
      setStatus((prev) => {
        if (prev === 'listening') {
          setRecognizedText(
            '음성이 감지되지 않았습니다.'
          );

          return 'fail';
        }

        return prev;
      });
    };

    try {
      recognition.start();
    } catch (error) {
      console.error(error);

      setStatus('fail');

      setRecognizedText(
        '마이크 시작 중 오류가 발생했습니다.'
      );
    }
  };

  const handleRetry = () => {
    setRecognizedText('');
    setStatus('idle');

    setCurrentAttempt((prev) => prev + 1);
  };

  if (isFinished) {
    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-center text-gray-900">
        <h2 className="text-2xl font-bold mb-4">
          테스트 완료!
        </h2>

        <p className="text-lg mb-6">
          총 {testQueue.length}문장 중 첫 시도에{' '}
          <strong>{firstTryCount}</strong>개를
          맞췄습니다.
        </p>

        <button
          onClick={startTest}
          className="bg-blue-500 text-white px-6 py-3 rounded-lg font-bold w-full"
        >
          새로운 랜덤 테스트 시작
        </button>

        <button
          onClick={() => setIsTesting(false)}
          className="mt-4 text-gray-500 underline"
        >
          메인으로 돌아가기
        </button>
      </div>
    );
  }

  if (isTesting) {
    const currentSentence =
      testQueue[currentIndex];

    if (!currentSentence) {
      return null;
    }

    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-center text-gray-900">
        <div className="text-gray-500 mb-2">
          진행 상황: {currentIndex + 1} /{' '}
          {testQueue.length}
        </div>

        <div className="text-xl font-bold mb-8 p-4 bg-gray-100 rounded">
          {currentSentence.ko}
        </div>

        {recognizedText && (
          <div
            className={`text-2xl font-bold mb-8 break-words ${
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

        {status === 'idle' && (
          <button
            onClick={startListening}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg font-bold w-full"
          >
            발음하기 (마이크 켜기)
          </button>
        )}

        {status === 'listening' && (
          <div className="text-red-500 font-bold animate-pulse">
            듣고 있습니다...
          </div>
        )}

        {status === 'success' && (
          <div className="text-blue-500 font-bold">
            정답입니다! 다음 문제로
            넘어갑니다...
          </div>
        )}

        {status === 'fail' && (
          <div>
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">
                정답
              </div>

              <div className="font-bold text-lg">
                {currentSentence.en}
              </div>
            </div>

            <button
              onClick={handleRetry}
              className="bg-red-500 text-white px-6 py-3 rounded-lg font-bold w-full"
            >
              다시 시도하기
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-gray-900">
      <h1 className="text-2xl font-bold mb-6">
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
          className="bg-green-500 text-white px-4 py-2 rounded w-full font-bold"
        >
          저장하기
        </button>
      </div>

      <div className="mb-6">
        <p className="mb-2">
          현재 저장된 문장: {sentences.length}개
        </p>

        <button
          onClick={startTest}
          className="bg-blue-500 text-white px-4 py-3 rounded w-full font-bold text-lg"
        >
          테스트 시작 (최대 50문제)
        </button>
      </div>

      {sentences.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-2">
            저장된 문장
          </h2>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {sentences.map((sentence, index) => (
              <div
                key={index}
                className="border rounded p-3"
              >
                <div className="font-semibold">
                  {sentence.en}
                </div>

                <div className="text-sm text-gray-500">
                  {sentence.ko}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}