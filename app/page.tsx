'use client';

import { useState, useEffect, useRef } from 'react';

interface Sentence {
  en: string;
  ko: string;
}

export default function EnglishStudyApp() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [inputEn, setInputEn] = useState('');
  const [inputKo, setInputKo] = useState('');

  const [isTesting, setIsTesting] = useState(false);
  const [testQueue, setTestQueue] = useState<Sentence[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [status, setStatus] = useState<'idle' | 'listening' | 'success' | 'fail'>('idle');
  
  const [firstTryCount, setFirstTryCount] = useState(0);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [isFinished, setIsFinished] = useState(false);

  const audioOk = useRef<HTMLAudioElement | null>(null);
  const audioError = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('study_sentences');
    if (saved) setSentences(JSON.parse(saved));

    audioOk.current = new Audio('/sound_ok.mp3');
    audioError.current = new Audio('/sound_error.mp3');
  }, []);

  const handleAddSentence = () => {
    if (!inputEn.trim() || !inputKo.trim()) return;
    const newSentences = [...sentences, { en: inputEn, ko: inputKo }];
    setSentences(newSentences);
    localStorage.setItem('study_sentences', JSON.stringify(newSentences));
    setInputEn('');
    setInputKo('');
  };

  const normalizeText = (text: string) => {
    return text.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  };

  const startTest = () => {
    if (sentences.length === 0) {
      alert('저장된 문장이 없습니다.');
      return;
    }
    const shuffled = [...sentences].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 50);

    setTestQueue(selected);
    setCurrentIndex(0);
    setFirstTryCount(0);
    setCurrentAttempt(1);
    setIsFinished(false);
    setStatus('idle');
    setRecognizedText('');
    setIsTesting(true);
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('이 브라우저에서는 음성 인식을 지원하지 않습니다. 모바일 사파리 또는 크롬을 이용해주세요.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus('listening');
      setRecognizedText('');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setRecognizedText(transcript);
      checkAnswer(transcript);
    };

    recognition.onerror = (event: any) => {
      setStatus('idle');
      if (event.error === 'no-speech') {
        alert('목소리가 감지되지 않았습니다. 다시 버튼을 누르고 발음해주세요.');
      } else {
        alert('음성 인식 오류: ' + event.error);
      }
    };

    recognition.onend = () => {
      setStatus((prev) => {
        if (prev === 'listening') return 'idle';
        return prev;
      });
    };

    recognition.start();
  };

  const checkAnswer = (transcript: string) => {
    const currentSentence = testQueue[currentIndex];
    const isCorrect = normalizeText(transcript) === normalizeText(currentSentence.en);

    if (isCorrect) {
      setStatus('success');
      audioOk.current?.play().catch(() => {});
      
      if (currentAttempt === 1) {
        setFirstTryCount(prev => prev + 1);
      }

      setTimeout(() => {
        if (currentIndex + 1 < testQueue.length) {
          setCurrentIndex(prev => prev + 1);
          setCurrentAttempt(1);
          setRecognizedText('');
          setStatus('idle');
        } else {
          setIsFinished(true);
        }
      }, 2000);

    } else {
      setStatus('fail');
      audioError.current?.play().catch(() => {});
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    setRecognizedText('');
    setCurrentAttempt(prev => prev + 1);
  };

  if (isFinished) {
    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-center text-gray-900">
        <h2 className="text-2xl font-bold mb-4">테스트 완료!</h2>
        <p className="text-lg mb-6">
          총 {testQueue.length}문장 중 첫 시도에 <strong>{firstTryCount}</strong>개를 맞췄습니다.
        </p>
        <button 
          onClick={startTest}
          className="bg-blue-500 text-white px-6 py-3 rounded-lg font-bold w-full"
        >
          새로운 50문장 랜덤 테스트 시작
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
    return (
      <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-center text-gray-900">
        <div className="text-gray-500 mb-2">
          진행 상황: {currentIndex + 1} / {testQueue.length}
        </div>
        
        <div className="text-xl font-bold mb-8 p-4 bg-gray-100 rounded text-gray-900">
          {testQueue[currentIndex].ko}
        </div>

        {recognizedText && (
          <div className={`text-2xl font-bold mb-8 ${status === 'success' ? 'text-blue-600' : status === 'fail' ? 'text-gray-400' : 'text-gray-900'}`}>
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
            정답입니다! 다음 문장으로 넘어갑니다...
          </div>
        )}

        {status === 'fail' && (
          <button 
            onClick={handleRetry}
            className="bg-red-500 text-white px-6 py-3 rounded-lg font-bold w-full mt-4"
          >
            다시 시도하기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-xl shadow-md text-gray-900">
      <h1 className="text-2xl font-bold mb-6">영어 스피킹 학습</h1>
      
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-2">새 문장 추가</h2>
        <input 
          type="text" 
          placeholder="영어 문장" 
          value={inputEn}
          onChange={(e) => setInputEn(e.target.value)}
          className="w-full border p-2 rounded mb-2 text-gray-900 bg-white placeholder-gray-400"
        />
        <input 
          type="text" 
          placeholder="한글 뜻" 
          value={inputKo}
          onChange={(e) => setInputKo(e.target.value)}
          className="w-full border p-2 rounded mb-2 text-gray-900 bg-white placeholder-gray-400"
        />
        <button 
          onClick={handleAddSentence}
          className="bg-green-500 text-white px-4 py-2 rounded w-full font-bold"
        >
          저장하기
        </button>
      </div>

      <div className="mb-6">
        <p className="mb-2">현재 저장된 문장: {sentences.length}개</p>
        <button 
          onClick={startTest}
          className="bg-blue-500 text-white px-4 py-3 rounded w-full font-bold text-lg"
        >
          테스트 시작 (최대 50문제)
        </button>
      </div>
    </div>
  );
}