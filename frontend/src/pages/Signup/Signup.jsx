import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Auth.css';

// ── Role config ───────────────────────────────────────────────────────────────
const ROLES = [
  {
    id:    'student',
    icon:  '📖',
    label: 'Register as Student',
    desc:  'Find mentors, get help with your subjects, and learn!',
    color: '#60a5fa',
  },
  {
    id:    'mentor',
    icon:  '🎓',
    label: 'Register as Mentor',
    desc:  'Share your expertise, help students, and build your profile!',
    color: '#4ade80',
  },
];

const USER_TYPES_BY_ROLE = {
  student: [
    {
      id:    'college_student',
      icon:  '🏛️',
      label: 'College Student',
      desc:  'Undergraduate or postgraduate student',
    },
    {
      id:    'school_student',
      icon:  '📚',
      label: 'School Student',
      desc:  'Class 6 to Class 12',
    },
  ],
  mentor: [
    {
      id:    'college_student',
      icon:  '🏛️',
      label: 'College Student',
      desc:  'Undergraduate or postgraduate student',
    },
    {
      id:    'professor',
      icon:  '🏫',
      label: 'Professor / Teacher',
      desc:  'Educator looking to guide learners',
    },
    {
      id:    'it_employee',
      icon:  '💼',
      label: 'IT Employee',
      desc:  'Working professional in the tech industry',
    },
  ],
};

// Flat lookup for labels/icons (used in step 3 badge)
const ALL_USER_TYPES = [
  ...USER_TYPES_BY_ROLE.student,
  ...USER_TYPES_BY_ROLE.mentor.filter(t => t.id !== 'college_student'),
];

const SCHOOL_GRADES = [
  'Class 6','Class 7','Class 8','Class 9',
  'Class 10','Class 11 (Science)','Class 11 (Commerce)','Class 11 (Arts)',
  'Class 12 (Science)','Class 12 (Commerce)','Class 12 (Arts)',
];

const Signup = () => {
  const [step,     setStep]     = useState(1);       // 1 = role (mentor/student), 2 = user type, 3 = details form
  const [role,     setRole]     = useState('');       // 'mentor' or 'student'
  const [userType, setUserType] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    institution: '',
    semester: '1',
    grade: '',
    marksType: '',
    marksValue: '',
    designation: '',
    yearsOfExp: '',
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { signup } = useAuth();
  const navigate   = useNavigate();

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    if (!form.name.trim())          return 'Full name is required';
    if (!form.email.trim())         return 'Email is required';
    if (form.password.length < 6)   return 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';

    if (form.marksValue !== '') {
      const v = Number(form.marksValue);
      if (isNaN(v) || v < 0)       return 'Please enter a valid marks value';
      if (form.marksType === 'sgpa'       && v > 10)  return 'SGPA must be between 0 and 10';
      if (form.marksType === 'percentage' && v > 100) return 'Percentage must be between 0 and 100';
    }
    return null;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const err = validate();
    if (err) return setError(err);

    setLoading(true);
    try {
      const payload = {
        name:        form.name.trim(),
        email:       form.email.trim(),
        password:    form.password,
        role,                                          // permanent role
        userType,
        institution: form.institution.trim(),
        // College student extras
        ...(userType === 'college_student' && {
          college:    form.institution.trim(),
          semester:   Number(form.semester),
          marksType:  form.marksType  || '',
          marksValue: form.marksValue !== '' ? Number(form.marksValue) : null,
        }),
        // School student extras
        ...(userType === 'school_student' && {
          grade:      form.grade,
          marksType:  form.marksType  || '',
          marksValue: form.marksValue !== '' ? Number(form.marksValue) : null,
        }),
        // IT Employee extras
        ...(userType === 'it_employee' && {
          institution: form.institution.trim(),
          designation: form.designation.trim(),
          yearsOfExp:  form.yearsOfExp,
        }),
      };

      await signup(
        payload.name, payload.email, payload.password,
        payload.college || '', payload.semester || 1,
        payload
      );
      navigate('/onboarding');
    } catch (err) {
      setError(err.response?.data?.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Marks helper label ────────────────────────────────────────────────────
  const marksLabel = form.marksType === 'sgpa' ? 'SGPA (0 – 10)' :
                     form.marksType === 'percentage' ? 'Percentage (0 – 100)' : '';
  const marksPlaceholder = form.marksType === 'sgpa' ? 'e.g. 8.5' :
                           form.marksType === 'percentage' ? 'e.g. 78' : '';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card signup-card fade-in">

        {/* ── Step 1: Mentor or Student ─────────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="auth-header">
              <h1>Join PeerSync</h1>
              <p>Choose how you want to participate</p>
            </div>

            <div className="role-grid">
              {ROLES.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={`role-card role-card--${r.id} ${role === r.id ? 'selected' : ''}`}
                  onClick={() => setRole(r.id)}
                >
                  <span className="role-icon">{r.icon}</span>
                  <div className="role-text-wrap">
                    <span className="role-label">{r.label}</span>
                    <span className="role-desc">{r.desc}</span>
                  </div>
                  {role === r.id && <span className="role-check">✓</span>}
                </button>
              ))}
            </div>

            <div className="role-lock-notice">
              🔒 This choice is <strong>permanent</strong> — you cannot switch roles later.
            </div>

            <button
              className="auth-submit"
              onClick={() => { setUserType(''); setStep(2); }}
              disabled={!role}
              style={{ marginTop: 16 }}
            >
              Continue →
            </button>

            <p className="auth-footer">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}

        {/* ── Step 2: User Type Picker ──────────────────────────────────── */}
        {step === 2 && (
          <>
            <div className="auth-header">
              <button className="back-btn" onClick={() => { setStep(1); setError(''); }}>
                ← Back
              </button>
              <div className={`role-selected-badge role-badge--${role}`}>
                {role === 'mentor' ? '🎓' : '📖'}{' '}
                {role === 'mentor' ? 'Registering as Mentor' : 'Registering as Student'}
              </div>
              <h1>Who are you?</h1>
              <p>Select your category to personalise your experience</p>
            </div>

            <div className="role-grid">
              {(USER_TYPES_BY_ROLE[role] || []).map(type => (
                <button
                  key={type.id}
                  type="button"
                  className={`role-card ${userType === type.id ? 'selected' : ''}`}
                  onClick={() => setUserType(type.id)}
                >
                  <span className="role-icon">{type.icon}</span>
                  <div className="role-text-wrap">
                    <span className="role-label">{type.label}</span>
                    <span className="role-desc">{type.desc}</span>
                  </div>
                  {userType === type.id && <span className="role-check">✓</span>}
                </button>
              ))}
            </div>

            <button
              className="auth-submit"
              onClick={() => setStep(3)}
              disabled={!userType}
              style={{ marginTop: 24 }}
            >
              Continue →
            </button>

            <p className="auth-footer">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}

        {/* ── Step 3: Details Form ──────────────────────────────────────── */}
        {step === 3 && (
          <>
            <div className="auth-header">
              <button className="back-btn" onClick={() => { setStep(2); setError(''); }}>
                ← Back
              </button>
              <div className={`role-selected-badge role-badge--${role}`}>
                {role === 'mentor' ? '🎓 Mentor' : '📖 Student'}{' · '}
                {ALL_USER_TYPES.find(t => t.id === userType)?.icon || (USER_TYPES_BY_ROLE[role]?.find(t => t.id === userType)?.icon)}{' '}
                {ALL_USER_TYPES.find(t => t.id === userType)?.label || (USER_TYPES_BY_ROLE[role]?.find(t => t.id === userType)?.label)}
              </div>
              <h1>Create Account</h1>
              <p>Start your {role === 'mentor' ? 'mentoring' : 'learning'} journey</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">

              {/* Common fields */}
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text" name="name" value={form.name}
                  onChange={handleChange} placeholder="Your full name" required
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email" name="email" value={form.email}
                  onChange={handleChange} placeholder="you@email.com" required
                />
              </div>

              {/* ── College Student ──────────────────────────────────────── */}
              {userType === 'college_student' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>College / University</label>
                      <input
                        type="text" name="institution" value={form.institution}
                        onChange={handleChange} placeholder="e.g. IIT Delhi"
                      />
                    </div>
                    <div className="form-group">
                      <label>Semester</label>
                      <select name="semester" value={form.semester} onChange={handleChange}>
                        {[1,2,3,4,5,6,7,8].map(s => (
                          <option key={s} value={s}>Semester {s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="marks-section">
                    <label className="marks-main-label">
                      Academic Performance <span className="optional-tag">optional</span>
                    </label>
                    <div className="marks-toggle">
                      <button
                        type="button"
                        className={`marks-btn ${form.marksType === 'sgpa' ? 'active' : ''}`}
                        onClick={() => setForm(p => ({ ...p, marksType: p.marksType === 'sgpa' ? '' : 'sgpa', marksValue: '' }))}
                      >
                        SGPA
                      </button>
                      <button
                        type="button"
                        className={`marks-btn ${form.marksType === 'percentage' ? 'active' : ''}`}
                        onClick={() => setForm(p => ({ ...p, marksType: p.marksType === 'percentage' ? '' : 'percentage', marksValue: '' }))}
                      >
                        Percentage %
                      </button>
                    </div>
                    {form.marksType && (
                      <div className="form-group" style={{ marginTop: 10 }}>
                        <label>{marksLabel}</label>
                        <input
                          type="number" name="marksValue" value={form.marksValue}
                          onChange={handleChange} placeholder={marksPlaceholder}
                          step={form.marksType === 'sgpa' ? '0.1' : '1'}
                          min="0" max={form.marksType === 'sgpa' ? '10' : '100'}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── School Student ───────────────────────────────────────── */}
              {userType === 'school_student' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>School Name</label>
                      <input
                        type="text" name="institution" value={form.institution}
                        onChange={handleChange} placeholder="e.g. DPS RK Puram"
                      />
                    </div>
                    <div className="form-group">
                      <label>Grade / Class</label>
                      <select name="grade" value={form.grade} onChange={handleChange}>
                        <option value="">Select class</option>
                        {SCHOOL_GRADES.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="marks-section">
                    <label className="marks-main-label">
                      Last Exam Marks <span className="optional-tag">optional</span>
                    </label>
                    <div className="marks-toggle">
                      <button
                        type="button"
                        className={`marks-btn ${form.marksType === 'percentage' ? 'active' : ''}`}
                        onClick={() => setForm(p => ({ ...p, marksType: p.marksType === 'percentage' ? '' : 'percentage', marksValue: '' }))}
                      >
                        Percentage %
                      </button>
                    </div>
                    {form.marksType === 'percentage' && (
                      <div className="form-group" style={{ marginTop: 10 }}>
                        <label>Percentage (0 – 100)</label>
                        <input
                          type="number" name="marksValue" value={form.marksValue}
                          onChange={handleChange} placeholder="e.g. 82"
                          min="0" max="100" step="1"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Professor ────────────────────────────────────────────── */}
              {userType === 'professor' && (
                <div className="form-group">
                  <label>Institution / Department</label>
                  <input
                    type="text" name="institution" value={form.institution}
                    onChange={handleChange} placeholder="e.g. IIT Bombay — Dept. of CS"
                  />
                </div>
              )}

              {/* ── IT Employee ───────────────────────────────────────────── */}
              {userType === 'it_employee' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Company / Organisation</label>
                      <input
                        type="text" name="institution" value={form.institution}
                        onChange={handleChange} placeholder="e.g. Google, TCS, Infosys"
                      />
                    </div>
                    <div className="form-group">
                      <label>Designation / Role</label>
                      <input
                        type="text" name="designation" value={form.designation}
                        onChange={handleChange} placeholder="e.g. Software Engineer"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Years of Experience</label>
                    <select name="yearsOfExp" value={form.yearsOfExp} onChange={handleChange}>
                      <option value="">Select experience</option>
                      <option value="0-1">0 – 1 year</option>
                      <option value="1-3">1 – 3 years</option>
                      <option value="3-5">3 – 5 years</option>
                      <option value="5-10">5 – 10 years</option>
                      <option value="10+">10+ years</option>
                    </select>
                  </div>
                </>
              )}

              {/* Passwords */}
              <div className="form-group">
                <label>Password</label>
                <div className="password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'} name="password" value={form.password}
                    onChange={handleChange} placeholder="At least 6 characters" required
                  />
                  <button type="button" className="eye-toggle" onClick={() => setShowPassword(p => !p)} tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <div className="password-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={form.confirmPassword}
                    onChange={handleChange} placeholder="Confirm your password" required
                  />
                  <button type="button" className="eye-toggle" onClick={() => setShowConfirmPassword(p => !p)} tabIndex={-1} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                    {showConfirmPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Creating account...' : `Get Started as ${role === 'mentor' ? 'Mentor' : 'Student'} 🚀`}
              </button>
            </form>

            <p className="auth-footer">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Signup;
