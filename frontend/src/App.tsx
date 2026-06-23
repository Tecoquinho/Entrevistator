import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useEffect, useMemo, useState } from "react";

type TopicAnalytics = {
  topic: string;
  percentage: number;
};

type ProgressAnalytics = {
  date: string;
  topic: string;
  accuracy: number;
};

type DashboardData = {
  topics: TopicAnalytics[];
  gaps: TopicAnalytics[];
  progress: ProgressAnalytics[];
};

type Question = {
  id: number;
  topic: string;
  difficulty: string;
  questionText: string;
  options: string[];
};

type QuizSession = {
  runId: number;
  questions: Question[];
};

type AnswerResponse = {
  correct: boolean;
  explanation: string;
};

type SessionAnswer = {
  questionId: number;
  selectedAnswer: string;
};

type SessionSubmitResponse = {
  totalQuestions: number;
  correctAnswers: number;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const topicLineColors = ["#2563eb", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4"];
const AUTO_ADVANCE_MS = 2000;

export default function App() {
  const [data, setData] = useState<DashboardData>({
    topics: [],
    gaps: [],
    progress: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"dashboard" | "quiz">("dashboard");
  const [session, setSession] = useState<QuizSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedAnswers, setSavedAnswers] = useState<Record<number, SessionAnswer>>({});
  const [currentFeedback, setCurrentFeedback] = useState<AnswerResponse | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [result, setResult] = useState<SessionSubmitResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError(null);

        const [topics, gaps, progress] = await Promise.all([
          fetchJson<TopicAnalytics[]>("/analytics/topics"),
          fetchJson<TopicAnalytics[]>("/analytics/gaps"),
          fetchJson<ProgressAnalytics[]>("/analytics/progress")
        ]);

        if (!cancelled) {
          setData({ topics, gaps, progress });
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentFeedback || !session) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (currentIndex >= session.questions.length - 1) {
        void finalizeSession();
        return;
      }

      setCurrentIndex((previousIndex) => previousIndex + 1);
      setCurrentFeedback(null);
      setSelectedOption(null);
    }, AUTO_ADVANCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentFeedback, currentIndex, session]);

  const currentQuestion = session?.questions[currentIndex] ?? null;
  const chartData = buildChartData(data.progress);
  const topicsForChart = Array.from(new Set(data.progress.map((entry) => entry.topic)));
  const answeredCount = Object.keys(savedAnswers).length;
  const progressText = session ? `${Math.min(currentIndex + 1, session.questions.length)} / ${session.questions.length}` : "0 / 0";
  const averageAccuracy = data.topics.length > 0
    ? Math.round(data.topics.reduce((sum, topic) => sum + topic.percentage, 0) / data.topics.length)
    : 0;
  const recentProgress = [...data.progress].slice(-5).reverse();
  const weakTopicNames = useMemo(() => new Set(data.gaps.map((gap) => gap.topic)), [data.gaps]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={resetToDashboard}
            className="flex items-center gap-3 text-left transition-opacity hover:opacity-80"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
              E
            </span>
            <span>
              <span className="block text-sm font-medium uppercase tracking-[0.22em] text-slate-400">Entrevistator</span>
              <span className="block text-lg font-semibold">Interview Prep Dashboard</span>
            </span>
          </button>

          <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
            {data.topics.length} tracked topics
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {view === "dashboard" ? renderDashboard() : renderQuizView()}
      </main>
    </div>
  );

  function renderDashboard() {
    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">Practice hub</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Train, review weak spots, and track consistency
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                This layout follows the reference in `layout examples/layout 1`: a clean study dashboard with a focused quiz flow,
                quick actions, and lightweight analytics.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => void startSession()}
                className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 text-left transition hover:border-blue-400 hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500 text-lg text-white">Q</span>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">Start practice session</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Open a new quiz session and answer the next batch of interview questions with instant feedback.
                    </p>
                  </div>
                  <span className="text-slate-400">›</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => document.getElementById("weak-topics")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 text-left transition hover:border-amber-400 hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-lg text-white">!</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">Review weak topics</h2>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Focus</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Jump to the lowest-performing topics first and decide what to revisit before the next session.
                    </p>
                  </div>
                  <span className="text-slate-400">›</span>
                </div>
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-slate-500">Loading analytics...</p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-700">Could not load analytics</h2>
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </section>
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-1">
                <section id="weak-topics" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-amber-500">●</span>
                    <h2 className="font-semibold text-slate-900">Weak Topics</h2>
                  </div>

                  {data.gaps.length > 0 ? (
                    <div className="space-y-3">
                      {data.gaps.map((gap, index) => (
                        <div
                          key={gap.topic}
                          className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 transition hover:bg-slate-100"
                        >
                          <span
                            className="h-10 w-2 rounded-full"
                            style={{ backgroundColor: topicLineColors[index % topicLineColors.length] }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900">{gap.topic}</p>
                            <p className="text-xs text-slate-500">Priority review topic</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-amber-600">{formatPercent(gap.percentage)}</p>
                            <p className="text-xs text-slate-400">accuracy</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      No weak topics yet.
                    </div>
                  )}
                </section>

                <section className="rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white shadow-sm">
                  <h2 className="font-semibold">Your Progress</h2>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <StatBlock value={data.topics.length} label="Topics" />
                    <StatBlock value={data.progress.length} label="History rows" />
                    <StatBlock value={`${averageAccuracy}%`} label="Avg accuracy" />
                    <StatBlock value={data.gaps.length} label="Weak areas" />
                  </div>
                </section>
              </div>

              <div className="space-y-6 lg:col-span-2">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-900">Accuracy over time</h2>
                      <p className="text-sm text-slate-500">Tracked progress across saved runs</p>
                    </div>
                    <span className="text-sm text-slate-500">{data.progress.length} points</span>
                  </div>

                  <div className="h-56">
                    <ResponsiveContainer>
                      <LineChart data={chartData} margin={{ top: 8, right: 12, left: -24, bottom: 8 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#64748b" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(value) => `${value}%`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "16px",
                            color: "#0f172a"
                          }}
                          formatter={(value: number) => formatPercent(value)}
                        />
                        {topicsForChart.map((topic, index) => (
                          <Line
                            key={topic}
                            type="monotone"
                            dataKey={topic}
                            name={topic}
                            stroke={topicLineColors[index % topicLineColors.length]}
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-4 font-semibold text-slate-900">Topics</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data.topics.map((topic, index) => (
                      <article key={topic.topic} className="rounded-2xl bg-slate-50 p-4 transition hover:bg-slate-100">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: topicLineColors[index % topicLineColors.length] }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">{topic.topic}</p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(Math.max(topic.percentage, 0), 100)}%`,
                                    backgroundColor: topicLineColors[index % topicLineColors.length]
                                  }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${getTopicPercentClass(topic.percentage)}`}>
                                {formatPercent(topic.percentage)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Recent Progress</h2>
                <span className="text-sm text-slate-500">Last 5 records</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Topic</th>
                      <th className="pb-2 font-medium text-right">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {recentProgress.length > 0 ? (
                      recentProgress.map((entry) => (
                        <tr key={`${entry.date}-${entry.topic}`} className="border-b border-slate-50">
                          <td className="py-3 text-slate-600">{formatDateLabel(entry.date)}</td>
                          <td className="py-3 text-slate-900">{entry.topic}</td>
                          <td className="py-3 text-right">
                            <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-medium ${getResultChipClass(entry.accuracy)}`}>
                              {formatPercent(entry.accuracy)}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-slate-500">
                          No progress records yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    );
  }

  function renderQuizView() {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={resetToDashboard}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
          >
            ×
          </button>

          <div className="mx-4 flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                style={{
                  width: session ? `${((currentIndex + (currentFeedback ? 1 : 0)) / session.questions.length) * 100}%` : "0%"
                }}
              />
            </div>
          </div>

          <span className="text-sm font-medium text-slate-500">{progressText}</span>
        </div>

        {sessionLoading ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-slate-500">Loading session...</p>
          </section>
        ) : null}

        {sessionError ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-700">Could not start session</h2>
            <p className="mt-2 text-sm text-red-600">{sessionError}</p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => void startSession()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={resetToDashboard}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Back
              </button>
            </div>
          </section>
        ) : null}

        {!sessionLoading && !sessionError && currentQuestion && !result ? (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="px-6 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getDifficultyBadgeClass(currentQuestion.difficulty)}`}>
                  {capitalize(currentQuestion.difficulty)}
                </span>
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">{currentQuestion.topic}</span>
                {weakTopicNames.has(currentQuestion.topic) ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Weak topic</span>
                ) : null}
              </div>
            </div>

            <div className="p-6">
              <h2 className="text-xl font-medium leading-relaxed text-slate-900">{currentQuestion.questionText}</h2>
            </div>

            <div className="px-6 pb-2">
              <div className="space-y-2">
                {currentQuestion.options.map((option, index) => {
                  const isChosen = selectedOption === option;
                  const showFeedback = currentFeedback !== null;
                  const isCorrectSelection = showFeedback && isChosen && currentFeedback.correct;
                  const isIncorrectSelection = showFeedback && isChosen && !currentFeedback.correct;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => void handleSelectAnswer(option)}
                      disabled={isAnswering || currentFeedback !== null}
                      className={`w-full rounded-2xl border-2 p-4 text-left font-medium transition-all ${
                        isCorrectSelection
                          ? "border-emerald-500 bg-emerald-100 text-emerald-800"
                          : isIncorrectSelection
                            ? "border-red-500 bg-red-100 text-red-800"
                            : isChosen
                              ? "border-blue-500 bg-blue-50 text-blue-800"
                              : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                            isCorrectSelection
                              ? "bg-emerald-500 text-white"
                              : isIncorrectSelection
                                ? "bg-red-500 text-white"
                                : isChosen
                                  ? "bg-blue-500 text-white"
                                  : "bg-white text-slate-500"
                          }`}
                        >
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="text-sm">{option}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {currentFeedback ? (
              <div className={`mx-6 mb-4 rounded-2xl p-4 ${currentFeedback.correct ? "bg-emerald-50" : "bg-amber-50"}`}>
                <p className={`font-medium ${currentFeedback.correct ? "text-emerald-800" : "text-amber-800"}`}>
                  {currentFeedback.correct ? "Correct!" : "Not quite right"}
                </p>
                <p className="mt-1 text-sm text-slate-600">{currentFeedback.explanation}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {!sessionLoading && !sessionError && result ? (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 text-center text-white">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl">
                {result.correctAnswers >= Math.ceil(result.totalQuestions * 0.8) ? "✓" : result.correctAnswers >= Math.ceil(result.totalQuestions * 0.6) ? "•" : "!"}
              </div>
              <h2 className="text-2xl font-bold">Session Complete</h2>
              <p className="mt-2 text-slate-300">
                You answered {result.correctAnswers} out of {result.totalQuestions} questions correctly.
              </p>
            </div>

            <div className="border-b border-slate-100 p-8 text-center">
              <div className="relative inline-flex items-center justify-center">
                <svg className="h-32 w-32 -rotate-90 transform">
                  <circle strokeWidth="12" stroke="#e2e8f0" fill="transparent" r="56" cx="64" cy="64" />
                  <circle
                    strokeWidth="12"
                    strokeLinecap="round"
                    stroke={getScoreColor(result.correctAnswers, result.totalQuestions)}
                    fill="transparent"
                    r="56"
                    cx="64"
                    cy="64"
                    strokeDasharray={`${getScorePercent(result.correctAnswers, result.totalQuestions) * 3.52} 352`}
                  />
                </svg>
                <span className="absolute text-3xl font-bold text-slate-900">
                  {getScorePercent(result.correctAnswers, result.totalQuestions)}%
                </span>
              </div>
              <p className="mt-4 text-slate-500">Accuracy</p>
            </div>

            <div className="p-6">
              <div className="space-y-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p><span className="font-medium text-slate-900">{answeredCount}</span> answers were saved during the run.</p>
                <p>The analytics panels on the dashboard have already been refreshed with the latest session data.</p>
              </div>
            </div>

            <div className="mx-4 mb-4 rounded-2xl bg-slate-50 p-6">
              <button
                type="button"
                onClick={resetToDashboard}
                className="w-full rounded-2xl bg-slate-900 py-3 font-medium text-white transition hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  async function startSession() {
    try {
      setView("quiz");
      setSessionLoading(true);
      setSessionError(null);
      setSession(null);
      setCurrentIndex(0);
      setSavedAnswers({});
      setCurrentFeedback(null);
      setSelectedOption(null);
      setResult(null);

      const nextSession = await fetchJson<QuizSession>("/quiz/session");
      setSession(nextSession);
    } catch (fetchError) {
      setSessionError(fetchError instanceof Error ? fetchError.message : "Failed to start quiz session.");
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleSelectAnswer(option: string) {
    if (!session || !currentQuestion || currentFeedback || isAnswering) {
      return;
    }

    try {
      setIsAnswering(true);
      setSelectedOption(option);

      const feedback = await postJson<AnswerResponse, { runId: number; questionId: number; selectedAnswer: string }>(
        "/answers",
        {
          runId: session.runId,
          questionId: currentQuestion.id,
          selectedAnswer: option
        }
      );

      setSavedAnswers((previous) => ({
        ...previous,
        [currentQuestion.id]: {
          questionId: currentQuestion.id,
          selectedAnswer: option
        }
      }));
      setCurrentFeedback(feedback);
    } catch (submitError) {
      setSessionError(submitError instanceof Error ? submitError.message : "Failed to save answer.");
      setSelectedOption(null);
    } finally {
      setIsAnswering(false);
    }
  }

  async function finalizeSession() {
    if (!session) {
      return;
    }

    try {
      const answers = Object.values(savedAnswers);
      const response = await postJson<SessionSubmitResponse, { runId: number; answers: SessionAnswer[] }>(
        "/quiz/session/submit",
        {
          runId: session.runId,
          answers
        }
      );

      setResult(response);
      setCurrentFeedback(null);
      setSelectedOption(null);
      await refreshAnalytics();
    } catch (submitError) {
      setSessionError(submitError instanceof Error ? submitError.message : "Failed to finalize session.");
    }
  }

  async function refreshAnalytics() {
    try {
      const [topics, gaps, progress] = await Promise.all([
        fetchJson<TopicAnalytics[]>("/analytics/topics"),
        fetchJson<TopicAnalytics[]>("/analytics/gaps"),
        fetchJson<ProgressAnalytics[]>("/analytics/progress")
      ]);
      setData({ topics, gaps, progress });
    } catch {
      // Keep the quiz flow responsive even if analytics refresh fails.
    }
  }

  function resetToDashboard() {
    setView("dashboard");
    setSession(null);
    setSessionLoading(false);
    setSessionError(null);
    setCurrentIndex(0);
    setSavedAnswers({});
    setCurrentFeedback(null);
    setSelectedOption(null);
    setResult(null);
  }
}

function StatBlock({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${path} with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function postJson<TResponse, TRequest>(path: string, body: TRequest): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${path} with status ${response.status}.`);
  }

  return (await response.json()) as TResponse;
}

function buildChartData(progress: ProgressAnalytics[]) {
  const rows = new Map<string, Record<string, string | number>>();

  progress.forEach((entry) => {
    const row = rows.get(entry.date) ?? { date: entry.date };
    row[entry.topic] = Number(entry.accuracy.toFixed(2));
    rows.set(entry.date, row);
  });

  return Array.from(rows.values());
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function getDifficultyBadgeClass(difficulty: string) {
  if (difficulty === "easy") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (difficulty === "medium") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-red-100 text-red-700";
}

function getTopicPercentClass(percentage: number) {
  if (percentage >= 80) {
    return "text-emerald-600";
  }
  if (percentage >= 60) {
    return "text-blue-600";
  }
  if (percentage >= 40) {
    return "text-amber-600";
  }
  return "text-red-500";
}

function getResultChipClass(percentage: number) {
  if (percentage >= 80) {
    return "bg-emerald-50 text-emerald-600";
  }
  if (percentage >= 60) {
    return "bg-blue-50 text-blue-600";
  }
  return "bg-red-50 text-red-500";
}

function getScorePercent(correctAnswers: number, totalQuestions: number) {
  if (totalQuestions === 0) {
    return 0;
  }
  return Math.round((correctAnswers / totalQuestions) * 100);
}

function getScoreColor(correctAnswers: number, totalQuestions: number) {
  const percent = getScorePercent(correctAnswers, totalQuestions);
  if (percent >= 80) {
    return "#10b981";
  }
  if (percent >= 60) {
    return "#3b82f6";
  }
  return "#f59e0b";
}

function formatDateLabel(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
