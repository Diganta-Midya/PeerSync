import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './Quiz.css';

const LEVEL_CONFIG = {
  Expert:       { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', icon: '🏆' },
  Advanced:     { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  icon: '⚡' },
  Intermediate: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  icon: '📈' },
  Beginner:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '🌱' },
};

const SUBJECT_EMOJIS = {
  'Data Structures':  '🌳', 'Machine Learning': '🤖', 'Web Development': '🌐',
  'Calculus':         '∫',  'Database Systems':  '🗄️', 'Operating Systems': '⚙️',
  'Computer Networks':'🔌', 'Python':            '🐍', 'Java':             '☕',
  'Statistics':       '📊',
};

const Quiz = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase]         = useState('loading');   // loading|pick-subjects|intro|quiz|results|cooldown
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [questionTime, setQuestionTime] = useState(15);
  const [timeLeft, setTimeLeft]   = useState(15);
  const [results, setResults]     = useState(null);
  const [profileUpdate, setProfileUpdate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [quizRole, setQuizRole]   = useState('student');
  const [quizSource, setQuizSource] = useState('static');
  const [cooldownEnd, setCooldownEnd] = useState(null);    // Date ISO string
  const [countdown, setCountdown] = useState('');          // "5h 23m 12s"
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [generating, setGenerating] = useState(false);

  const timerRef = useRef(null);
  const cooldownRef = useRef(null);

  // ── Cooldown countdown ticker ──────────────────────────────────────────────
  useEffect(() => {
    if (!cooldownEnd) return;
    const tick = () => {
      const diff = new Date(cooldownEnd).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown('');
        setCooldownEnd(null);
        setPhase('loading');
        window.location.reload();   // auto-refresh when cooldown expires
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    cooldownRef.current = setInterval(tick, 1000);
    return () => clearInterval(cooldownRef.current);
  }, [cooldownEnd]);

  // ── Load Quiz Status ───────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/quiz/status')
      .then(res => {
        if (res.data.cooldown) {
          setCooldownEnd(res.data.nextAvailableAt);
          setResults(res.data.skillScores);
          setPhase('cooldown');
        } else if (res.data.alreadyCompleted) {
          // This allows viewing old scores if needed (currently disabled in backend default)
          setAlreadyDone(true);
          setResults(res.data.skillScores);
          setPhase('results');
        } else {
          // Ready to take a new quiz — ask which subjects
          const avail = res.data.availableSubjects || [];
          const userSubjs = res.data.userSubjects || [];
          setAvailableSubjects(avail);
          // Pre-select subjects the user already has (or none if they haven't picked any)
          setSelectedSubjects([...userSubjs]); 
          setQuizRole(res.data.role || 'student');
          setPhase('pick-subjects');
        }
      })
      .catch(err => {
        console.error('Quiz status error:', err.message);
        navigate('/dashboard');
      });
  }, []);

  // ── Generate quiz for selected subjects ────────────────────────────────────
  const generateForSubjects = async () => {
    if (selectedSubjects.length === 0) return;
    setGenerating(true);
    try {
      const res = await api.post('/quiz/generate', { subjects: selectedSubjects });
      if (res.data.cooldown) {
        setCooldownEnd(res.data.nextAvailableAt);
        setResults(res.data.skillScores);
        setPhase('cooldown');
        return;
      }
      const timer = res.data.timerPerQuestion || 10;
      setQuestions(res.data.questions);
      setAnswers(new Array(res.data.total).fill(-1));
      setQuestionTime(timer);
      setTimeLeft(timer);
      setQuizSource(res.data.source || 'static');
      setCurrentIdx(0);
      setSelected(null);
      setPhase('intro');
    } catch (err) {
      console.error('Generate error:', err.message);
      alert(err.response?.data?.message || 'Failed to generate quiz');
    } finally {
      setGenerating(false);
    }
  };

  const toggleSubject = (subj) => {
    setSelectedSubjects(prev =>
      prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]
    );
  };

  // ── Timer ──────────────────────────────────────────────────────────────────
  const advanceQuestion = useCallback(() => {
    clearInterval(timerRef.current);
    setAnimating(true);
    setTimeout(() => {
      const next = currentIdx + 1;
      if (next >= questions.length) {
        handleSubmit();
      } else {
        setCurrentIdx(next);
        setSelected(null);
        setTimeLeft(questionTime);
        setAnimating(false);
      }
    }, 350);
  }, [currentIdx, questions.length, answers, questionTime]);

  useEffect(() => {
    if (phase !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          advanceQuestion();
          return questionTime;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, currentIdx, advanceQuestion, questionTime]);

  // ── Select Answer ──────────────────────────────────────────────────────────
  const selectAnswer = (optIdx) => {
    if (selected !== null) return;
    setSelected(optIdx);
    const newAnswers = [...answers];
    newAnswers[currentIdx] = optIdx;
    setAnswers(newAnswers);

    // Auto-advance after brief delay
    setTimeout(() => advanceQuestion(), 800);
  };

  // ── Submit Quiz ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    clearInterval(timerRef.current);
    setSubmitting(true);
    setPhase('loading');

    try {
      const res = await api.post('/quiz/submit', { answers });
      setResults(res.data.results);
      setProfileUpdate(res.data.profileUpdate || null);

      updateUser({
        quizCompleted:  true,
        subjectsStrong: res.data.profileUpdate?.updatedStrong || [],
        subjectsNeeded: res.data.profileUpdate?.updatedNeeded || [],
      });

      setPhase('results');
    } catch (err) {
      console.error('Submit error:', err);
      navigate('/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const groupedResults = results
    ? Object.entries(results instanceof Map ? Object.fromEntries(results) : results)
    : [];

  const currentQ   = questions[currentIdx];
  const progress   = questions.length > 0 ? ((currentIdx) / questions.length) * 100 : 0;
  const timerPct   = (timeLeft / questionTime) * 100;

  // Timer thresholds scale with questionTime
  const urgentThreshold  = Math.ceil(questionTime * 0.3);  // 30% of total
  const warningThreshold = Math.ceil(questionTime * 0.5);  // 50% of total

  // ── PHASE: Loading ─────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div className="quiz-page">
      <div className="quiz-loading">
        <div className="quiz-spinner"></div>
        <p>{submitting ? '🧠 AI is analyzing your answers...' : generating ? '🤖 AI is crafting unique questions for you...' : 'Loading your assessment...'}</p>
      </div>
    </div>
  );

  // ── PHASE: Pick Subjects ───────────────────────────────────────────────────
  if (phase === 'pick-subjects') return (
    <div className="quiz-page">
      <div className="quiz-intro fade-in">
        <div className="qi-badge">
          {quizRole === 'mentor' ? '🎓 Mentor Assessment' : '📖 Student Assessment'}
        </div>
        <h1>Choose Your Subjects</h1>
        <p className="qi-subtitle">Select the subjects you want to be tested on today.</p>

        <div className="qi-subject-picker">
          {availableSubjects.map(subj => {
            const isSelected = selectedSubjects.includes(subj);
            return (
              <button
                key={subj}
                className={`qi-subject-btn ${isSelected ? 'active' : ''}`}
                onClick={() => toggleSubject(subj)}
              >
                <span>{SUBJECT_EMOJIS[subj] || '📚'}</span>
                {subj}
              </button>
            );
          })}
        </div>

        <button
          className="btn-start-quiz"
          disabled={selectedSubjects.length === 0 || generating}
          onClick={generateForSubjects}
          style={{ marginTop: 24 }}
        >
          {generating ? 'Generating...' : `Generate Quiz (${selectedSubjects.length} selected) →`}
        </button>
      </div>
    </div>
  );

  // ── PHASE: Cooldown (already taken today) ──────────────────────────────────
  if (phase === 'cooldown') return (
    <div className="quiz-page">
      <div className="quiz-intro fade-in">
        <div className="qi-cooldown-icon">⏳</div>
        <h1>Come back tomorrow!</h1>
        <p className="qi-subtitle">
          You've already taken the quiz today. You can retake it once every <strong>24 hours</strong> to update your skill profile.
        </p>

        {countdown && (
          <div className="qi-countdown">
            <span className="qi-countdown-label">Next attempt available in</span>
            <span className="qi-countdown-timer">{countdown}</span>
          </div>
        )}

        {/* Show existing scores if available */}
        {groupedResults.length > 0 && (
          <div className="qi-existing-scores">
            <h3>Your Current Skill Scores</h3>
            <div className="qi-score-pills">
              {groupedResults.map(([subject, data]) => {
                const score = data?.score ?? 0;
                const level = data?.level ?? 'Beginner';
                const cfg = LEVEL_CONFIG[level];
                return (
                  <div key={subject} className="qi-score-pill" style={{ borderColor: cfg.color + '44' }}>
                    <span>{SUBJECT_EMOJIS[subject] || '📚'}</span>
                    <span className="qi-sp-name">{subject}</span>
                    <span className="qi-sp-score" style={{ color: cfg.color }}>{score}%</span>
                    <span className="qi-sp-level" style={{ background: cfg.bg, color: cfg.color }}>{level}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button className="btn-start-quiz" onClick={() => navigate('/dashboard')} style={{ marginTop: 24 }}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  // ── PHASE: Intro ───────────────────────────────────────────────────────────
  if (phase === 'intro') return (
    <div className="quiz-page">
      <div className="quiz-intro fade-in">
        <div className="qi-badge">
          {quizRole === 'mentor' ? '🎓 Mentor Assessment' : '📖 Student Assessment'}
        </div>
        {quizSource === 'gemini' && (
          <div className="qi-ai-badge">✨ AI-Generated Questions — Every attempt is unique!</div>
        )}
        <h1>Let's verify your skills!</h1>
        <p className="qi-subtitle">
          Answer <strong>{questions.length} questions</strong> across{' '}
          <strong>{[...new Set(questions.map(q => q.subject))].length} subjects</strong> to build your verified skill profile.
          {quizRole === 'mentor'
            ? ' As a mentor, you have a stricter time limit to prove your expertise.'
            : ' This helps us match you with the right mentors.'}
        </p>

        <div className="qi-subjects">
          {[...new Set(questions.map(q => q.subject))].map(subj => (
            <div key={subj} className="qi-subject-pill">
              <span>{SUBJECT_EMOJIS[subj] || '📚'}</span>
              <span>{subj}</span>
            </div>
          ))}
        </div>

        <div className="qi-rules">
          <div className="qi-rule">
            ⏱️ <strong>{questionTime} seconds</strong> per question
            {quizRole === 'mentor' && <span className="qi-role-tag mentor">Mentor pace</span>}
            {quizRole === 'student' && <span className="qi-role-tag student">Student pace</span>}
          </div>
          <div className="qi-rule">🔀 Questions are <strong>randomized</strong> every attempt</div>
          <div className="qi-rule">🤖 AI judges your skill level: Beginner → Expert</div>
          <div className="qi-rule">✅ Results update your profile & improve matches</div>
        </div>

        <button className="btn-start-quiz" onClick={() => { setPhase('quiz'); setTimeLeft(questionTime); }}>
          🚀 Start Assessment
        </button>
      </div>
    </div>
  );

  // ── PHASE: Quiz ────────────────────────────────────────────────────────────
  if (phase === 'quiz' && currentQ) return (
    <div className="quiz-page">
      <div className={`quiz-container ${animating ? 'fade-out' : 'fade-in-fast'}`}>

        {/* Top bar */}
        <div className="qz-topbar">
          <div className="qz-progress-info">
            <span className="qz-subject-tag">
              {SUBJECT_EMOJIS[currentQ.subject] || '📚'} {currentQ.subject}
            </span>
            <span className="qz-count">{currentIdx + 1} / {questions.length}</span>
          </div>
          <div className="qz-progress-bar">
            <div className="qz-progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        {/* Timer ring */}
        <div className="qz-timer-wrap">
          <svg className="qz-timer-ring" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
            <circle
              cx="30" cy="30" r="26" fill="none"
              stroke={timeLeft <= urgentThreshold ? '#f87171' : timeLeft <= warningThreshold ? '#fbbf24' : '#4ade80'}
              strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 26}`}
              strokeDashoffset={`${2 * Math.PI * 26 * (1 - timerPct / 100)}`}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
              transform="rotate(-90 30 30)"
            />
          </svg>
          <span className={`qz-timer-num ${timeLeft <= urgentThreshold ? 'urgent' : ''}`}>{timeLeft}</span>
        </div>

        {/* Question */}
        <div className="qz-question">
          <div className="qz-level-badge" style={{ background: LEVEL_CONFIG[currentQ.level === 'advanced' ? 'Advanced' : currentQ.level === 'intermediate' ? 'Intermediate' : 'Beginner']?.bg || '' }}>
            {currentQ.level}
          </div>
          <h2>{currentQ.question}</h2>
        </div>

        {/* Options */}
        <div className="qz-options">
          {currentQ.options.map((opt, i) => {
            let cls = 'qz-option';
            if (selected !== null) {
              if (i === selected) cls += ' selected';
            }
            return (
              <button
                key={i}
                className={cls}
                onClick={() => selectAnswer(i)}
                disabled={selected !== null}
              >
                <span className="qz-opt-letter">{String.fromCharCode(65 + i)}</span>
                <span className="qz-opt-text">{opt}</span>
              </button>
            );
          })}
        </div>

        {/* Skip */}
        {selected === null && (
          <button className="qz-skip" onClick={advanceQuestion}>Skip →</button>
        )}
      </div>
    </div>
  );

  // ── PHASE: Results ─────────────────────────────────────────────────────────
  if (phase === 'results') {
    const overallScore = groupedResults.length > 0
      ? Math.round(groupedResults.reduce((sum, [, v]) => sum + (v?.score ?? 0), 0) / groupedResults.length)
      : 0;

    return (
      <div className="quiz-page">
        <div className="qr-container fade-in">
          <div className="qr-header">
            <div className="qr-trophy">{overallScore >= 75 ? '🏆' : overallScore >= 50 ? '⭐' : '📈'}</div>
            <h1>Your Skill Profile is Ready!</h1>
            <p>AI has analyzed your answers and built your verified skill certificate.</p>
            <div className="qr-overall">
              <span className="qr-overall-label">Overall Accuracy</span>
              <span className="qr-overall-score">{alreadyDone ? '—' : `${overallScore}%`}</span>
            </div>
          </div>

          <div className="qr-subjects">
            {groupedResults.map(([subject, data]) => {
              const score = data?.score ?? 0;
              const level = data?.level ?? 'Beginner';
              const cfg = LEVEL_CONFIG[level];
              return (
                <div key={subject} className="qr-subject-card" style={{ borderColor: cfg.color + '44' }}>
                  <div className="qrs-top">
                    <div className="qrs-icon">{SUBJECT_EMOJIS[subject] || '📚'}</div>
                    <div className="qrs-info">
                      <h3>{subject}</h3>
                      <div className="qrs-level-badge" style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.icon} {level}
                      </div>
                    </div>
                    <div className="qrs-score" style={{ color: cfg.color }}>{score}%</div>
                  </div>
                  {!alreadyDone && (
                    <div className="qrs-bar">
                      <div className="qrs-bar-fill" style={{ width: `${score}%`, background: cfg.color }}></div>
                    </div>
                  )}
                  {data?.correct !== undefined && (
                    <div className="qrs-meta">{data.correct}/{data.total} correct</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="qr-actions">
            {!alreadyDone && profileUpdate && (
              <div className="qr-profile-changes">
                <div className="qrpc-title">🤖 AI Profile Changes</div>

                {profileUpdate.promoted?.length > 0 && (
                  <div className="qrpc-group">
                    <span className="qrpc-label promoted">⬆️ Promoted to Strong</span>
                    <div className="qrpc-pills">
                      {profileUpdate.promoted.map(s => (
                        <span key={s} className="qrpc-pill promoted">{s}</span>
                      ))}
                    </div>
                    <p className="qrpc-note">You scored ≥65% on these — the AI moved them to your strong subjects!</p>
                  </div>
                )}

                {profileUpdate.demoted?.length > 0 && (
                  <div className="qrpc-group">
                    <span className="qrpc-label demoted">⬇️ Removed from Strong</span>
                    <div className="qrpc-pills">
                      {profileUpdate.demoted.map(s => (
                        <span key={s} className="qrpc-pill demoted">{s}</span>
                      ))}
                    </div>
                    <p className="qrpc-note">You scored {'<'}40% on these — added to subjects needing help.</p>
                  </div>
                )}

                {profileUpdate.promoted?.length === 0 && profileUpdate.demoted?.length === 0 && (
                  <div className="qrpc-no-change">✅ Your self-reported subjects matched your quiz performance.</div>
                )}
              </div>
            )}

            {!alreadyDone && (
              <div className="qr-note">
                ✅ Profile updated! You can retake this assessment in <strong>24 hours</strong> to update your scores.
              </div>
            )}
            {!user?.isMentor ? (
              <button className="btn-primary qr-btn" onClick={() => navigate('/find-mentor')}>
                🔍 Find My Best Mentors
              </button>
            ) : (
              <button className="btn-primary qr-btn" onClick={() => navigate('/mentor-dashboard')}>
                📊 Go to Mentor Hub
              </button>
            )}
            <button className="btn-secondary qr-btn" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
            {!alreadyDone && (
              <div className="qr-retake-note">
                🔄 You can retake the quiz tomorrow to improve your skill profile.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Quiz;
