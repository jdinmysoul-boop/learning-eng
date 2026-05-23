'use client';

import { useEffect, useRef, useState } from 'react';

interface Sentence {
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

    audioOk.current.oncanplaythrough = () => {
      console.log('OK SOUND READY');
    };

    audioError.current.oncanplaythrough = () => {
      console.log('ERROR SOUND READY');
    };

    audioOk.current.onerror = (e) => {
      console.error('OK SOUND ERROR', e);
    };

    audioError.current.onerror = (e) => {
      console.error('ERROR SOUND ERROR', e);
    };
  }, []);

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
        en: inputEn.trim(),
        ko: inputKo.trim(),
      },
    ];

    setSentences(updated);

    localStorage.setItem(
      'study_sentences',
      JSON.stringify(updated)
    );

    setInputEn('');
    setInputKo('');
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

  const checkAnswer = (transcript: string) => {
    const current = testQueue[currentIndex];

    if (!current) return;

    const user = normalizeText(transcript);

    const answer = normalizeText(current.en);

    console.log('USER:', user);
    console.log('ANSWER:', answer);

    const isCorrect = user === answer;

    if (isCorrect) {
      setStatus('success');

      if (currentAttempt === 1) {
        setFirstTryCount((prev) => prev + 1);
      }

      audioOk.current
        ?.play()
        .catch((e) => console.error(e));

      setTimeout(() => {
        moveNext();
      }, 1500);
    } else {
      setStatus('fail');

      audioError.current
        ?.play()
        .catch((e) => console.error(e));
    }
  };

  const toggleListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        '이 브라우저는 음성 인식을 지원하지 않습니다.\n크롬 최신버전을 사용해주세요.'
      );
      return;
    }

    // 녹음 중이면 종료
    if (
      isRecording &&
      recognitionRef.current
    ) {
      console.log('MANUAL STOP');

      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error(e);
      }

      setIsRecording(false);

      return;
    }

    // 이전 인스턴스 정리
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    const recognition = new SpeechRecognition();

    recognitionRef.current = recognition;

    recognition.lang = 'en-US';

    recognition.continuous = true;

    recognition.interimResults = true;

    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => {
      console.log('LISTEN START');

      setStatus('listening');

      setRecognizedText('');

      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      console.log('RESULT EVENT');

      let transcript = '';

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        transcript +=
          event.results[i][0].transcript;
      }

      console.log('TRANSCRIPT:', transcript);

      finalTranscript = transcript;

      setRecognizedText(transcript);
    };

    recognition.onerror = (event: any) => {
      console.log('ERROR EVENT', event);

      setStatus('fail');

      setIsRecording(false);

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
      console.log('LISTEN END');

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

      setStatus('fail');

      setIsRecording(false);
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
          onClick={() => {
            setIsTesting(false);
          }}
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

        <button
          onClick={toggleListening}
          className={`px-6 py-3 rounded-lg font-bold w-full text-white transition ${
            isRecording
              ? 'bg-red-500'
              : 'bg-blue-500'
          }`}
        >
          {isRecording
            ? '녹음 종료'
            : '발음 시작'}
        </button>

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
        현재 저장된 문장:{' '}
        <strong>
          {sentences.length}
        </strong>
        개
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