'use client';

import { useEffect, useRef, useState } from 'react';

interface Sentence {
  en: string;
  ko: string;
}

type Status =
  | 'idle'
  | 'recording'
  | 'processing'
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

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(null);

  const chunksRef = useRef<Blob[]>([]);

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

    const isCorrect = user === answer;

    if (isCorrect) {
      setStatus('success');

      if (currentAttempt === 1) {
        setFirstTryCount((prev) => prev + 1);
      }

      audioOk.current?.play().catch(() => {});

      setTimeout(() => {
        moveNext();
      }, 1500);
    } else {
      setStatus('fail');

      audioError.current?.play().catch(() => {});
    }
  };

  const startRecording = async () => {
    try {
      setRecognizedText('');

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const mediaRecorder = new MediaRecorder(
        stream
      );

      mediaRecorderRef.current = mediaRecorder;

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          setStatus('processing');

          const audioBlob = new Blob(
            chunksRef.current,
            {
              type: 'audio/webm',
            }
          );

          const formData = new FormData();

          formData.append(
            'file',
            audioBlob,
            'recording.webm'
          );

          const res = await fetch(
            '/api/transcribe',
            {
              method: 'POST',
              body: formData,
            }
          );

          const data = await res.json();

          console.log(data);

          const transcript = data.text || '';

          setRecognizedText(transcript);

          checkAnswer(transcript);
        } catch (error) {
          console.error(error);

          setStatus('fail');

          setRecognizedText(
            '음성 분석 실패'
          );
        }
      };

      mediaRecorder.start();

      setStatus('recording');

      // 3초 녹음
      setTimeout(() => {
        mediaRecorder.stop();

        stream
          .getTracks()
          .forEach((track) => track.stop());
      }, 3000);
    } catch (error) {
      console.error(error);

      alert('마이크 권한이 필요합니다.');
    }
  };

  const handleRetry = () => {
    setRecognizedText('');

    setStatus('idle');

    setCurrentAttempt((prev) => prev + 1);
  };

  if (isFinished) {
    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-center">
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
      </div>
    );
  }

  if (isTesting) {
    const current =
      testQueue[currentIndex];

    if (!current) return null;

    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-center">
        <div className="mb-4 text-gray-500">
          {currentIndex + 1} /{' '}
          {testQueue.length}
        </div>

        <div className="bg-gray-100 p-6 rounded-lg text-2xl font-bold mb-8">
          {current.ko}
        </div>

        {recognizedText && (
          <div
            className={`mb-6 text-xl font-bold ${
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
            onClick={startRecording}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg font-bold w-full"
          >
            발음 시작
          </button>
        )}

        {status === 'recording' && (
          <div className="text-red-500 text-2xl font-bold animate-pulse">
            녹음 중...
          </div>
        )}

        {status === 'processing' && (
          <div className="text-blue-500 text-2xl font-bold animate-pulse">
            분석 중...
          </div>
        )}

        {status === 'success' && (
          <div className="text-blue-500 text-2xl font-bold">
            정답!
          </div>
        )}

        {status === 'fail' && (
          <div>
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
    <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md">
      <h1 className="text-3xl font-bold mb-6">
        영어 스피킹 학습
      </h1>

      <div className="mb-6">
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
        저장 문장: {sentences.length}개
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