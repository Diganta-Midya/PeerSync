const User = require('../models/User');
const { generateAIQuiz } = require('../utils/geminiQuiz');
const { scoreQuiz } = require('../utils/quizBank');

// ── Skill level thresholds ────────────────────────────────────────────────────
const STRONG_THRESHOLD      = 65;   // score ≥ 65% → this is actually a strong subject
const WEAK_THRESHOLD        = 40;   // score < 40% on a "strong" subject → remove from strong

// ── Timer per question (seconds) ──────────────────────────────────────────────
const MENTOR_TIMER  = 8;    // Mentors get 8 seconds per question
const STUDENT_TIMER = 15;   // Students get 15 seconds per question

// ── Daily limit (ms) ─────────────────────────────────────────────────────────
const QUIZ_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Helper: check if user can take quiz today ─────────────────────────────────
function getQuizCooldown(user) {
  if (!user.lastQuizAt) return { canTake: true };

  const now     = Date.now();
  const lastAt  = new Date(user.lastQuizAt).getTime();
  const elapsed = now - lastAt;

  if (elapsed >= QUIZ_COOLDOWN_MS) {
    return { canTake: true };
  }

  const remaining = QUIZ_COOLDOWN_MS - elapsed;
  return {
    canTake: false,
    nextAvailableAt: new Date(lastAt + QUIZ_COOLDOWN_MS).toISOString(),
    remainingMs: remaining,
  };
}


// @desc  Check if user can take quiz, provide available subjects
// @route GET /api/quiz/status
const getQuizStatus = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user.onboardingComplete) {
    return res.status(400).json({ message: 'Complete onboarding first' });
  }

  const cooldown = getQuizCooldown(user);

  // If returning user and still in cooldown, return cooldown data
  if (user.quizCompleted && !cooldown.canTake) {
    return res.json({
      cooldown: true,
      nextAvailableAt: cooldown.nextAvailableAt,
      remainingMs: cooldown.remainingMs,
      skillScores: user.skillScores,
    });
  }

  // Not in cooldown: either first-time or returning.
  const ALL_SUBJECTS = [
    'Data Structures', 'Machine Learning', 'Web Development', 'Calculus',
    'Database Systems', 'Operating Systems', 'Computer Networks', 'Python',
    'Java', 'Statistics'
  ];

  const userSubjects = [...new Set([
    ...(user.subjectsNeeded || []),
    ...(user.subjectsStrong || []),
  ])];

  res.json({
    cooldown: false,
    availableSubjects: ALL_SUBJECTS,
    userSubjects,
    role: user.role || (user.isMentor ? 'mentor' : 'student'),
    alreadyCompleted: false, // We no longer show the old results phase by default if they can retake.
  });
};

// @desc  Generate a skill quiz for the logged-in user (AI-powered)
// @route POST /api/quiz/generate
// @body  { subjects?: string[] }  — optional array of subjects to quiz on
const getQuiz = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user.onboardingComplete) {
    return res.status(400).json({ message: 'Complete onboarding first' });
  }

  // ── Daily limit check ──────────────────────────────────────────────────
  const cooldown = getQuizCooldown(user);

  // First-time users bypass cooldown; returning users must wait 24h
  if (user.quizCompleted && !cooldown.canTake) {
    return res.json({
      cooldown: true,
      nextAvailableAt: cooldown.nextAvailableAt,
      remainingMs: cooldown.remainingMs,
      skillScores: user.skillScores,
    });
  }

  const ALL_SUBJECTS = [
    'Data Structures', 'Machine Learning', 'Web Development', 'Calculus',
    'Database Systems', 'Operating Systems', 'Computer Networks', 'Python',
    'Java', 'Statistics'
  ];

  // ── Determine which subjects to quiz on ────────────────────────────────
  const allUserSubjects = [...new Set([
    ...(user.subjectsNeeded || []),
    ...(user.subjectsStrong || []),
  ])];

  // If frontend sent specific subjects, validate them against master subjects list
  const requestedSubjects = req.body?.subjects;
  let quizSubjectsNeeded = [];
  let quizSubjectsStrong = [];

  if (Array.isArray(requestedSubjects) && requestedSubjects.length > 0) {
    // Only allow subjects that actually exist in the platform
    const validSubjects = requestedSubjects.filter(s => ALL_SUBJECTS.includes(s));
    if (validSubjects.length === 0) {
      return res.status(400).json({ message: 'Invalid subjects selected.' });
    }
    
    // Sort selected subjects into "needed" or "strong", defaulting to "needed" if new
    quizSubjectsNeeded = validSubjects.filter(s => !(user.subjectsStrong || []).includes(s));
    quizSubjectsStrong = validSubjects.filter(s => (user.subjectsStrong || []).includes(s));
  } else {
    quizSubjectsNeeded = user.subjectsNeeded || [];
    quizSubjectsStrong = user.subjectsStrong || [];
  }

  // ── Generate questions via Gemini AI (with static fallback) ────────────
  const { questions, source } = await generateAIQuiz(
    quizSubjectsNeeded,
    quizSubjectsStrong
  );

  if (questions.length === 0) {
    return res.status(400).json({
      message: 'No questions could be generated for the selected subjects.',
    });
  }

  // ── Store full questions (with answers) server-side for secure scoring ──
  await User.findByIdAndUpdate(req.user._id, { activeQuiz: questions });

  // ── Timer based on role ────────────────────────────────────────────────
  const timerPerQuestion = (user.role === 'mentor' || user.isMentor) ? MENTOR_TIMER : STUDENT_TIMER;

  // ── Strip correct answers before sending to frontend ───────────────────
  const safeQuestions = questions.map(({ correct, ...rest }) => rest);

  res.json({
    questions: safeQuestions,
    total: safeQuestions.length,
    timerPerQuestion,
    role: user.role || (user.isMentor ? 'mentor' : 'student'),
    source,
    isRetake: user.quizCompleted,
    availableSubjects: allUserSubjects,  // for the subject picker
  });
};


// @desc  Submit quiz answers, score them, update profile
// @route POST /api/quiz/submit
const submitQuiz = async (req, res) => {
  const { answers } = req.body;

  if (!Array.isArray(answers)) {
    return res.status(400).json({ message: 'answers array is required' });
  }

  // ── Retrieve the stored quiz with correct answers from DB ──────────────
  const user = await User.findById(req.user._id).select('+activeQuiz');

  if (!user.activeQuiz || user.activeQuiz.length === 0) {
    return res.status(400).json({ message: 'No active quiz found. Please generate a quiz first.' });
  }

  const storedQuestions = user.activeQuiz;

  // ── Score using the server-stored questions ────────────────────────────
  const results = scoreQuiz(storedQuestions, answers);

  // ── Build skill scores map ────────────────────────────────────────────
  const skillScores = {};
  for (const [subject, data] of Object.entries(results)) {
    skillScores[subject] = {
      score:    data.score,
      level:    data.level,
      correct:  data.correct,
      total:    data.total,
      testedAt: new Date(),
    };
  }

  // ── AI-driven profile update logic ────────────────────────────────────
  let updatedStrong = [...(user.subjectsStrong || [])];
  let updatedNeeded = [...(user.subjectsNeeded || [])];

  const promoted   = [];
  const demoted    = [];
  const confirmed  = [];

  for (const [subject, data] of Object.entries(results)) {
    const wasStrong = updatedStrong.includes(subject);
    const wasNeeded = updatedNeeded.includes(subject);

    if (data.score >= STRONG_THRESHOLD) {
      if (!updatedStrong.includes(subject)) {
        updatedStrong.push(subject);
        if (wasNeeded) promoted.push(subject);
        else confirmed.push(subject);
      }
      updatedNeeded = updatedNeeded.filter(s => s !== subject);

    } else if (data.score < WEAK_THRESHOLD) {
      if (wasStrong) {
        updatedStrong = updatedStrong.filter(s => s !== subject);
        demoted.push(subject);
        if (!updatedNeeded.includes(subject)) {
          updatedNeeded.push(subject);
        }
      }
    }
  }

  // ── Save everything back to DB ────────────────────────────────────────
  const updateData = {
    skillScores,
    quizCompleted: true,
    lastQuizAt: new Date(),       // ← record when the quiz was completed
    subjectsStrong: updatedStrong,
    subjectsNeeded: updatedNeeded,
    activeQuiz: [],               // clear the stored quiz
  };

  // If mentor, only show subjects with > 70% score as expertise
  if (user.role === 'mentor' || user.isMentor) {
    const EXPERTISE_THRESHOLD = 70;
    const verifiedExpertise = updatedStrong.filter(subject => {
      const subjectScore = skillScores[subject];
      return !subjectScore || subjectScore.score > EXPERTISE_THRESHOLD;
    });
    updateData['mentorProfile.subjectExpertise'] = verifiedExpertise;
  }

  await User.findByIdAndUpdate(req.user._id, updateData);

  // ── Response ──────────────────────────────────────────────────────────
  const overallAccuracy = Math.round(
    Object.values(results).reduce((sum, r) => sum + r.score, 0) / Object.values(results).length
  );

  res.json({
    success: true,
    results,
    profileUpdate: {
      promoted,
      demoted,
      confirmed,
      updatedStrong,
      updatedNeeded,
    },
    overallAccuracy,
    message: 'Skill profile updated! You can retake the assessment again in 24 hours.',
  });
};


// @desc  Reset quiz (allow retake) — now respects daily limit
// @route DELETE /api/quiz/reset
const resetQuiz = async (req, res) => {
  const user = await User.findById(req.user._id);

  // Check cooldown before allowing reset
  const cooldown = getQuizCooldown(user);
  if (user.quizCompleted && !cooldown.canTake) {
    return res.status(429).json({
      message: 'You can only retake the quiz once every 24 hours.',
      nextAvailableAt: cooldown.nextAvailableAt,
      remainingMs: cooldown.remainingMs,
    });
  }

  await User.findByIdAndUpdate(req.user._id, {
    quizCompleted: false,
    skillScores: {},
    activeQuiz: [],
    // NOTE: we do NOT reset lastQuizAt — the cooldown persists
  });
  res.json({ message: 'Quiz reset. You can retake the assessment.' });
};

module.exports = { getQuizStatus, getQuiz, submitQuiz, resetQuiz };
