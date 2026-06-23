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
const topicLineColors = ["#34d399", "#f97316", "#fbbf24", "#60a5fa", "#c084fc", "#22d3ee"];
const AUTO_ADVANCE_MS = 2000;
const chartGridColor = "#243244";
const chartAxisColor = "#94a3b8";

export default function App() {
  const [data, setData] = useState<DashboardData>({
    topics: [],
    gaps: [],
    progress: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [session, setSession] = useState<QuizSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
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
    let cancelled = false;

    async function loadSession() {
      try {
        setSessionLoading(true);
        setSessionError(null);

        const nextSession = await fetchJson<QuizSession>("/quiz/session");

        if (!cancelled) {
          setSession(nextSession);
          setCurrentIndex(0);
          setSavedAnswers({});
          setCurrentFeedback(null);
          setSelectedOption(null);
          setResult(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setSessionError(fetchError instanceof Error ? fetchError.message : "Failed to start quiz session.");
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    void loadSession();

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

  const weakTopicNames = useMemo(() => new Set(data.gaps.map((gap) => gap.topic)), [data.gaps]);

  return (
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel backdrop-blur sm:p-8">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-300">Entrevistator</p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  Quiz and analytics
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Answer questions, get instant feedback, and monitor topic accuracy over time.
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-slate-200">
                <span className="font-semibold">{data.topics.length}</span> tracked topics
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-5 shadow-panel sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-400">Quiz</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">Practice session</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-sm font-medium text-slate-200">
              {progressText}
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-500"
              style={{
                width: session ? `${((currentIndex + (currentFeedback ? 1 : 0)) / session.questions.length) * 100}%` : "0%"
              }}
            />
          </div>

          {sessionLoading ? (
            <p className="mt-6 text-sm text-slate-300">Loading session...</p>
          ) : null}

          {sessionError ? (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {sessionError}
            </div>
          ) : null}

          {!sessionLoading && !sessionError && currentQuestion && !result ? (
            <div className="mt-6">
              <div className="mb-5 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                <span>{currentQuestion.topic}</span>
                <span className="text-slate-600">&bull;</span>
                <span>{currentQuestion.difficulty}</span>
                {weakTopicNames.has(currentQuestion.topic) ? (
                  <>
                    <span className="text-slate-600">&bull;</span>
                    <span className="text-red-400">weak topic</span>
                  </>
                ) : null}
              </div>

              <h3 className="font-display text-2xl font-semibold leading-tight">{currentQuestion.questionText}</h3>

              <div className="mt-5 grid gap-3">
                {currentQuestion.options.map((option) => {
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
                      className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        isCorrectSelection
                          ? "border-green-500/60 bg-green-500/15 text-green-100"
                          : isIncorrectSelection
                            ? "border-red-500/60 bg-red-500/15 text-red-100"
                            : isChosen
                              ? "border-cyan-400 bg-cyan-400/10 text-slate-100"
                              : "border-slate-700 bg-slate-900/80 text-slate-200 hover:border-slate-500 hover:bg-slate-900"
                      } ${isAnswering || currentFeedback !== null ? "cursor-default" : ""}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {currentFeedback ? (
                <div
                  className={`mt-5 rounded-2xl border p-4 ${
                    currentFeedback.correct ? "border-green-500/40 bg-green-500/12" : "border-red-500/40 bg-red-500/12"
                  }`}
                >
                  <p className={`text-sm font-semibold ${currentFeedback.correct ? "text-green-300" : "text-red-300"}`}>
                    {currentFeedback.correct ? "Correct answer" : "Incorrect answer"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{currentFeedback.explanation}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">Next question in 2 seconds</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {!sessionLoading && !sessionError && result ? (
            <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-900/85 p-5">
              <p className="text-sm text-slate-400">Session complete</p>
              <h3 className="mt-1 font-display text-3xl font-bold">
                {result.correctAnswers} / {result.totalQuestions}
              </h3>
              <p className="mt-2 text-sm text-slate-300">Your answers were saved as you progressed. This step only finalized the run.</p>
            </div>
          ) : null}

          <div className="mt-5 text-xs uppercase tracking-[0.18em] text-slate-400">{answeredCount} answers saved</div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-8 shadow-panel">
            <p className="text-sm text-slate-300">Loading analytics...</p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-[28px] border border-red-500/30 bg-red-500/10 p-6 shadow-panel">
            <h2 className="font-display text-lg font-semibold text-red-300">Could not load analytics</h2>
            <p className="mt-2 text-sm text-red-200">{error}</p>
          </section>
        ) : null}

        {!loading && !error ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.topics.map((topic) => (
                <article
                  key={topic.topic}
                  className="rounded-[24px] border border-white/10 bg-slate-950/55 p-5 shadow-panel backdrop-blur"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-400">Topic</p>
                      <h2 className="mt-1 font-display text-xl font-semibold">{topic.topic}</h2>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getBadgeClasses(
                        topic.percentage
                      )}`}
                    >
                      {getStatusLabel(topic.percentage)}
                    </span>
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Accuracy</p>
                      <p className="mt-1 font-display text-3xl font-bold">{formatPercent(topic.percentage)}</p>
                    </div>
                    <div className="h-3 w-24 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${getBarClasses(topic.percentage)}`}
                        style={{ width: `${Math.min(Math.max(topic.percentage, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr,1.6fr]">
              <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
                <div>
                  <p className="text-sm text-slate-400">Weak topics</p>
                  <h2 className="mt-1 font-display text-2xl font-semibold">Current gaps</h2>
                </div>
                <div className="mt-5 space-y-3">
                  {data.gaps.length > 0 ? (
                    data.gaps.map((gap) => (
                      <div
                        key={gap.topic}
                        className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm"
                      >
                        <span className="font-medium text-slate-100">{gap.topic}</span>
                        <span className="font-semibold text-red-300">{formatPercent(gap.percentage)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-white/10 bg-slate-900/85 px-4 py-3 text-sm text-slate-300">
                      No weak topics yet.
                    </p>
                  )}
                </div>
              </article>

              <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-4 shadow-panel sm:p-6">
                <div className="mb-4">
                  <p className="text-sm text-slate-400">Progress</p>
                  <h2 className="mt-1 font-display text-2xl font-semibold">Accuracy over time</h2>
                </div>
                <div className="h-[320px] w-full">
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -24, bottom: 8 }}>
                      <CartesianGrid stroke={chartGridColor} strokeDasharray="4 4" />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: chartAxisColor }} />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 12, fill: chartAxisColor }}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020817",
                          border: "1px solid #1e293b",
                          borderRadius: "16px",
                          color: "#e2e8f0"
                        }}
                        labelStyle={{ color: "#cbd5e1" }}
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
              </article>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );

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

function getStatusLabel(percentage: number) {
  if (percentage > 70) {
    return "Strong";
  }
  if (percentage >= 50) {
    return "Watch";
  }
  return "Weak";
}

function getBadgeClasses(percentage: number) {
  if (percentage > 70) {
    return "bg-green-500/15 text-green-300";
  }
  if (percentage >= 50) {
    return "bg-yellow-500/15 text-yellow-300";
  }
  return "bg-red-500/15 text-red-300";
}

function getBarClasses(percentage: number) {
  if (percentage > 70) {
    return "bg-green-500";
  }
  if (percentage >= 50) {
    return "bg-yellow-500";
  }
  return "bg-red-500";
}
