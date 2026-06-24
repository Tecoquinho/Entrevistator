import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

type TopicAnalytics = {
  topic: string;
  percentage: number;
};

type ProgressAnalytics = {
  date: string;
  topic: string;
  accuracy: number;
};

type RunSummary = {
  runId: number;
  mode: string;
  startedAt: string | null;
  finishedAt: string | null;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  completed: boolean;
};

type AnalyticsSummary = {
  completionRate: number;
  totalSessions: number;
  completedSessions: number;
  lastSessionResult: RunSummary | null;
};

type DashboardData = {
  topics: TopicAnalytics[];
  gaps: TopicAnalytics[];
  progress: ProgressAnalytics[];
  summary: AnalyticsSummary | null;
  runs: RunSummary[];
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
  mode: string;
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

type ExportRunAnswer = {
  questionId: number;
  topic: string;
  selectedAnswer: string;
  correct: boolean;
  answeredAt: string | null;
};

type ExportRun = {
  runId: number;
  mode: string;
  startedAt: string | null;
  finishedAt: string | null;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  completed: boolean;
  answers: ExportRunAnswer[];
};

type ExportResults = {
  generatedAt: string;
  summary: AnalyticsSummary;
  recentRuns: ExportRun[];
  topicAccuracy: TopicAnalytics[];
  weakTopics: TopicAnalytics[];
};

type ImportResponse = {
  importedCount: number;
  updatedCount: number;
  ignoredCount: number;
  totalQuestions: number;
};

type Screen = "practice" | "stats" | "quiz";
type SessionMode = "mock" | "difficulty";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const topicLineColors = ["#60a5fa", "#fbbf24", "#34d399", "#a78bfa", "#f87171", "#22d3ee"];
const AUTO_ADVANCE_MS = 2000;

export default function App() {
  const [data, setData] = useState<DashboardData>({
    topics: [],
    gaps: [],
    progress: [],
    summary: null,
    runs: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeScreen, setActiveScreen] = useState<Screen>("practice");
  const [sessionMode, setSessionMode] = useState<SessionMode>("mock");
  const [session, setSession] = useState<QuizSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedAnswers, setSavedAnswers] = useState<Record<number, SessionAnswer>>({});
  const [currentFeedback, setCurrentFeedback] = useState<AnswerResponse | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [result, setResult] = useState<SessionSubmitResponse | null>(null);

  const [exportJson, setExportJson] = useState("");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    void loadAnalytics();
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
  const weakTopicNames = useMemo(() => new Set(data.gaps.map((gap) => gap.topic)), [data.gaps]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => resetToScreen("practice")}
              className="flex items-center gap-3 text-left transition-opacity hover:opacity-80"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
                E
              </span>
              <span>
                <span className="block text-sm font-medium uppercase tracking-[0.22em] text-slate-400">Entrevistator</span>
                <span className="block text-lg font-semibold text-white">Interview Prep Dashboard</span>
              </span>
            </button>

            <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 p-1">
              <NavButton
                active={activeScreen === "practice" || activeScreen === "quiz"}
                label="Practice"
                onClick={() => resetToScreen("practice")}
              />
              <NavButton
                active={activeScreen === "stats"}
                label="Stats"
                onClick={() => resetToScreen("stats")}
              />
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImportPanel((current) => !current)}
              className="rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Import Questions
            </button>
            <button
              type="button"
              onClick={() => void handleExportResults()}
              disabled={exportLoading}
              className="rounded-full border border-blue-400/30 bg-blue-500/15 px-3 py-1.5 text-sm font-medium text-blue-200 hover:bg-blue-500/25 disabled:cursor-wait"
            >
              {exportLoading ? "Exporting..." : "Export Results"}
            </button>
            <div className="rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300">
              {data.topics.length} tracked topics
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {showImportPanel ? renderImportPanel() : null}
        {exportJson ? renderExportPanel() : null}
        {activeScreen === "practice" ? renderPracticeScreen() : null}
        {activeScreen === "stats" ? renderStatsScreen() : null}
        {activeScreen === "quiz" ? renderQuizView() : null}
      </main>
    </div>
  );

  function renderPracticeScreen() {
    const lastSession = data.summary?.lastSessionResult ?? null;

    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
          <div className="flex flex-col gap-8">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">Practice hub</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Focus practice and generate better learning data
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Use short quiz runs, keep question quality evolving, and export structured results for deeper ChatGPT analysis.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.3fr,0.9fr]">
              <div className="rounded-2xl border border-blue-400/30 bg-blue-500/12 p-5">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500 text-lg font-semibold text-white">
                      Q
                    </span>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-white">Start Practice</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        Launch a new session with the selected mode. Incomplete runs stay stored, but only completed runs affect analytics.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ModeButton
                      active={sessionMode === "mock"}
                      label="Mock Interview"
                      onClick={() => setSessionMode("mock")}
                    />
                    <ModeButton
                      active={sessionMode === "difficulty"}
                      label="Increase Difficulty"
                      onClick={() => setSessionMode("difficulty")}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => void startSession(sessionMode)}
                    className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-white sm:w-auto"
                  >
                    Start Practice
                  </button>
                </div>
              </div>

              <section className="rounded-2xl border border-white/10 bg-slate-900 p-5">
                <h2 className="font-semibold text-white">Your Progress</h2>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <StatBlock value={formatPercent(data.summary?.completionRate ?? 0)} label="Completion rate" />
                  <StatBlock value={data.summary?.totalSessions ?? 0} label="Total sessions" />
                  <StatBlock value={data.summary?.completedSessions ?? 0} label="Completed runs" />
                  <StatBlock value={`${averageAccuracy}%`} label="Avg accuracy" />
                </div>
              </section>
            </div>
          </div>
        </section>

        {loading ? renderLoadingCard("Loading analytics...") : null}
        {error ? renderErrorCard("Could not load analytics", error) : null}

        {!loading && !error ? (
          <div className="grid gap-6 lg:grid-cols-[1.25fr,0.95fr]">
            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-white">Accuracy Over Time</h2>
                  <p className="text-sm text-slate-400">Completed runs only</p>
                </div>
                <span className="text-sm text-slate-400">{data.progress.length} points</span>
              </div>

              <div className="h-64 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-4">
                {renderProgressChart(chartData, topicsForChart)}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-white">Last Session Result</h2>
                <span className="text-sm text-slate-400">{lastSession ? formatModeLabel(lastSession.mode) : "No data"}</span>
              </div>

              {lastSession ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-slate-800/90 p-4">
                    <p className="text-sm text-slate-400">Finished</p>
                    <p className="mt-1 text-lg font-semibold text-white">{formatDateTime(lastSession.finishedAt)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoCard label="Score" value={`${lastSession.correctAnswers}/${lastSession.totalQuestions}`} />
                    <InfoCard label="Answered" value={`${lastSession.answeredQuestions}/${lastSession.totalQuestions}`} />
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-800/90 p-4">
                    <p className="text-sm text-slate-400">Run quality</p>
                    <p className={`mt-2 text-sm font-medium ${lastSession.completed ? "text-emerald-300" : "text-amber-300"}`}>
                      {lastSession.completed ? "Completed and included in analytics" : "Incomplete and excluded from analytics"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-800/80 px-4 py-8 text-center text-sm text-slate-400">
                  Complete your first session to see the latest result here.
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  function renderStatsScreen() {
    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">Stats</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Completed run analytics</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Topic metrics and charts ignore incomplete runs, while stored incomplete runs remain available for export and internal evaluation.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-300">
              {data.runs.length} completed runs
            </div>
          </div>
        </section>

        {loading ? renderLoadingCard("Loading analytics...") : null}
        {error ? renderErrorCard("Could not load analytics", error) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
              <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold text-white">Topic Accuracy</h2>
                  <span className="text-sm text-slate-400">{data.topics.length} topics</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.topics.map((topic, index) => (
                    <article
                      key={topic.topic}
                      className="flex min-h-[88px] items-center rounded-2xl border border-white/10 bg-slate-800/90 p-4 hover:bg-slate-800"
                    >
                      <div className="flex w-full items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: topicLineColors[index % topicLineColors.length] }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-white">{topic.topic}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
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

              <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-amber-400">&bull;</span>
                  <h2 className="font-semibold text-white">Weak Topics</h2>
                </div>

                {data.gaps.length > 0 ? (
                  <div className="space-y-3">
                    {data.gaps.map((gap, index) => (
                      <div
                        key={gap.topic}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-800/90 p-4"
                      >
                        <span
                          className="h-10 w-2 rounded-full"
                          style={{ backgroundColor: topicLineColors[index % topicLineColors.length] }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white">{gap.topic}</p>
                          <p className="text-xs text-slate-400">Current lowest accuracy</p>
                        </div>
                        <div className="w-16 text-right">
                          <p className="font-bold text-amber-300">{formatPercent(gap.percentage)}</p>
                          <p className="text-xs text-slate-500">accuracy</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-slate-800/80 px-4 py-6 text-center text-sm text-slate-400">
                    No weak topics yet.
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-white">Progress Chart</h2>
                  <p className="text-sm text-slate-400">Accuracy grouped by topic and date</p>
                </div>
                <span className="text-sm text-slate-400">{data.progress.length} points</span>
              </div>

              <div className="h-72 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-4">
                {renderProgressChart(chartData, topicsForChart)}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/20">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-semibold text-white">Recent Completed Runs</h2>
                <span className="text-sm text-slate-400">Stored for analytics</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-800/80 text-left text-xs text-slate-400">
                      <th className="px-4 py-3 font-medium">Finished</th>
                      <th className="px-4 py-3 font-medium">Mode</th>
                      <th className="px-4 py-3 text-right font-medium">Score</th>
                      <th className="px-4 py-3 text-right font-medium">Answered</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {data.runs.length > 0 ? (
                      data.runs.map((run) => (
                        <tr key={run.runId} className="border-b border-white/10 last:border-b-0">
                          <td className="px-4 py-4 text-slate-300">{formatDateTime(run.finishedAt)}</td>
                          <td className="px-4 py-4 text-white">{formatModeLabel(run.mode)}</td>
                          <td className="px-4 py-4 text-right">
                            <span className={`inline-flex rounded-lg px-2 py-1 text-sm font-medium ${getRunScoreClass(run.correctAnswers, run.totalQuestions)}`}>
                              {run.correctAnswers}/{run.totalQuestions}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-slate-300">
                            {run.answeredQuestions}/{run.totalQuestions}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">
                          No completed runs yet.
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
        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-3 shadow-2xl shadow-slate-950/20">
          <button
            type="button"
            onClick={() => resetToScreen("practice")}
            className="rounded-xl p-2 text-slate-300 hover:bg-slate-800"
          >
            &times;
          </button>

          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                style={{
                  width: session ? `${((currentIndex + (currentFeedback ? 1 : 0)) / session.questions.length) * 100}%` : "0%"
                }}
              />
            </div>
          </div>

          <span className="text-sm font-medium text-slate-300">{progressText}</span>
        </div>

        {sessionLoading ? renderLoadingCard("Loading session...") : null}
        {sessionError ? renderQuizError() : null}

        {!sessionLoading && !sessionError && currentQuestion && !result ? (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/85 shadow-2xl shadow-slate-950/20">
            <div className="px-6 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getDifficultyBadgeClass(currentQuestion.difficulty)}`}>
                  {capitalize(currentQuestion.difficulty)}
                </span>
                <span className="text-xs uppercase tracking-[0.16em] text-slate-400">{currentQuestion.topic}</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                  {formatModeLabel(session?.mode ?? sessionMode)}
                </span>
                {weakTopicNames.has(currentQuestion.topic) ? (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">Weak topic</span>
                ) : null}
              </div>
            </div>

            <div className="border-b border-white/10 p-6 pb-7">
              <h2 className="text-xl font-medium leading-relaxed text-white">{currentQuestion.questionText}</h2>
            </div>

            <div className="px-6 py-5">
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
                      className={`w-full rounded-2xl border-2 p-4 text-left font-medium shadow-sm ${
                        isCorrectSelection
                          ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-100"
                          : isIncorrectSelection
                            ? "border-red-500/70 bg-red-500/15 text-red-100"
                            : isChosen
                              ? "border-blue-500/70 bg-blue-500/15 text-blue-100"
                              : "border-white/10 bg-slate-800/90 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
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
                                  : "bg-slate-700 text-slate-300"
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
              <div
                className={`mx-6 mb-6 rounded-2xl border p-4 ${
                  currentFeedback.correct
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
              >
                <p className={`font-medium ${currentFeedback.correct ? "text-emerald-300" : "text-amber-300"}`}>
                  {currentFeedback.correct ? "Correct!" : "Not quite right"}
                </p>
                <p className="mt-1 text-sm text-slate-200">{currentFeedback.explanation}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {!sessionLoading && !sessionError && result ? (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/85 shadow-2xl shadow-slate-950/20">
            <div className="bg-gradient-to-br from-slate-800 to-slate-950 p-8 text-center text-white">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl">
                {result.correctAnswers >= Math.ceil(result.totalQuestions * 0.8) ? "✓" : result.correctAnswers >= Math.ceil(result.totalQuestions * 0.6) ? "•" : "!"}
              </div>
              <h2 className="text-2xl font-bold">Session Complete</h2>
              <p className="mt-2 text-slate-300">
                You answered {result.correctAnswers} out of {result.totalQuestions} questions correctly.
              </p>
            </div>

            <div className="border-b border-white/10 px-8 py-7 text-center">
              <div className="relative inline-flex items-center justify-center">
                <svg className="h-32 w-32 -rotate-90 transform">
                  <circle strokeWidth="12" stroke="#1e293b" fill="transparent" r="56" cx="64" cy="64" />
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
                <span className="absolute text-3xl font-bold text-white">
                  {getScorePercent(result.correctAnswers, result.totalQuestions)}%
                </span>
              </div>
              <p className="mt-4 text-slate-400">Accuracy</p>
            </div>

            <div className="px-6 pb-4 pt-5">
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-800/80 p-4 text-sm text-slate-300">
                <p><span className="font-medium text-white">{answeredCount}</span> answers were saved during the run.</p>
                <p>Completed sessions immediately update practice summaries, charts, and recent run analytics.</p>
              </div>
            </div>

            <div className="mx-4 mb-4 rounded-2xl bg-slate-800/80 p-6">
              <button
                type="button"
                onClick={() => resetToScreen("practice")}
                className="w-full rounded-2xl bg-slate-100 py-3 font-medium text-slate-900 hover:bg-white"
              >
                Done
              </button>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderImportPanel() {
    return (
      <section className="mb-6 rounded-3xl border border-white/10 bg-slate-900/85 p-5 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">Import Questions</h2>
              <p className="text-sm text-slate-400">
                Paste JSON or load a file. Existing questions are preserved unless the same ID is explicitly imported.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowImportPanel(false)}
              className="self-start rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Close
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-full border border-white/10 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
              Load JSON file
              <input type="file" accept=".json,application/json" className="hidden" onChange={handleImportFileChange} />
            </label>
            <button
              type="button"
              onClick={() => {
                setImportJson("");
                setImportMessage(null);
                setImportError(null);
              }}
              className="rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              Clear
            </button>
          </div>

          <textarea
            value={importJson}
            onChange={(event) => setImportJson(event.target.value)}
            className="min-h-64 w-full rounded-2xl border border-white/10 bg-slate-950/70 p-4 font-mono text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-400/40"
            placeholder='Paste an array of questions or {"questions":[...]}'
          />

          {importError ? <p className="text-sm text-red-300">{importError}</p> : null}
          {importMessage ? <p className="text-sm text-emerald-300">{importMessage}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleImportQuestions()}
              disabled={importLoading}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:cursor-wait"
            >
              {importLoading ? "Importing..." : "Import Questions"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderExportPanel() {
    return (
      <section className="mb-6 rounded-3xl border border-white/10 bg-slate-900/85 p-5 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">Export Results JSON</h2>
              <p className="text-sm text-slate-400">
                This payload is formatted for external analysis in ChatGPT, including recent runs, answers, topic accuracy, and weak topics.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void copyExportToClipboard()}
                className="rounded-full border border-white/10 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                Copy JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportJson("");
                  setExportMessage(null);
                }}
                className="rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>

          {exportMessage ? <p className="text-sm text-emerald-300">{exportMessage}</p> : null}

          <textarea
            readOnly
            value={exportJson}
            className="min-h-72 w-full rounded-2xl border border-white/10 bg-slate-950/70 p-4 font-mono text-sm text-slate-200 outline-none"
          />
        </div>
      </section>
    );
  }

  function renderLoadingCard(message: string) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/20">
        <p className="text-sm text-slate-300">{message}</p>
      </section>
    );
  }

  function renderErrorCard(title: string, message: string) {
    return (
      <section className="rounded-3xl border border-red-500/25 bg-red-500/10 p-6 shadow-2xl shadow-slate-950/20">
        <h2 className="text-lg font-semibold text-red-300">{title}</h2>
        <p className="mt-2 text-sm text-red-200">{message}</p>
      </section>
    );
  }

  function renderQuizError() {
    return (
      <section className="rounded-3xl border border-red-500/25 bg-red-500/10 p-6 shadow-2xl shadow-slate-950/20">
        <h2 className="text-lg font-semibold text-red-300">Could not start session</h2>
        <p className="mt-2 text-sm text-red-200">{sessionError}</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => void startSession(sessionMode)}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => resetToScreen("practice")}
            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Back
          </button>
        </div>
      </section>
    );
  }

  function renderProgressChart(rows: Array<Record<string, string | number>>, topics: string[]) {
    return (
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: -24, bottom: 8 }}>
          <CartesianGrid stroke="#334155" strokeDasharray="4 4" />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#94a3b8" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#94a3b8" }} tickFormatter={(value) => `${value}%`} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#020617",
              border: "1px solid #334155",
              borderRadius: "16px",
              color: "#e2e8f0"
            }}
            labelStyle={{ color: "#cbd5e1" }}
            formatter={(value: number) => formatPercent(value)}
          />
          {topics.map((topic, index) => (
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
    );
  }

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError(null);

      const [topics, gaps, progress, summary, runs] = await Promise.all([
        fetchJson<TopicAnalytics[]>("/analytics/topics"),
        fetchJson<TopicAnalytics[]>("/analytics/gaps"),
        fetchJson<ProgressAnalytics[]>("/analytics/progress"),
        fetchJson<AnalyticsSummary>("/analytics/summary"),
        fetchJson<RunSummary[]>("/analytics/runs")
      ]);

      setData({ topics, gaps, progress, summary, runs });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  async function startSession(mode: SessionMode) {
    try {
      setActiveScreen("quiz");
      setSessionLoading(true);
      setSessionError(null);
      setSession(null);
      setCurrentIndex(0);
      setSavedAnswers({});
      setCurrentFeedback(null);
      setSelectedOption(null);
      setResult(null);

      const nextSession = await fetchJson<QuizSession>(`/quiz/session?mode=${mode}`);
      setSession(nextSession);
      setSessionMode((nextSession.mode === "difficulty" ? "difficulty" : "mock"));
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
      await loadAnalytics();
    } catch (submitError) {
      setSessionError(submitError instanceof Error ? submitError.message : "Failed to finalize session.");
    }
  }

  async function handleExportResults() {
    try {
      setExportLoading(true);
      setExportMessage(null);
      const payload = await fetchJson<ExportResults>("/analytics/export");
      setExportJson(JSON.stringify(payload, null, 2));
      setExportMessage("JSON payload generated. You can copy and paste it into ChatGPT.");
    } catch (exportError) {
      setExportMessage(exportError instanceof Error ? exportError.message : "Failed to export results.");
    } finally {
      setExportLoading(false);
    }
  }

  async function copyExportToClipboard() {
    if (!exportJson) {
      return;
    }

    try {
      await navigator.clipboard.writeText(exportJson);
      setExportMessage("Export JSON copied to clipboard.");
    } catch {
      setExportMessage("Could not copy automatically. Select the JSON and copy it manually.");
    }
  }

  async function handleImportQuestions() {
    try {
      setImportLoading(true);
      setImportError(null);
      setImportMessage(null);

      const parsed = JSON.parse(importJson) as unknown;
      const payload = normalizeImportPayload(parsed);
      const response = await postJson<ImportResponse, { questions: unknown[] }>("/questions/import", payload);

      setImportMessage(
        `Import completed: ${response.importedCount} added, ${response.updatedCount} updated, ${response.ignoredCount} ignored. ${response.totalQuestions} total questions available.`
      );
      await loadAnalytics();
    } catch (importFailure) {
      setImportError(importFailure instanceof Error ? importFailure.message : "Failed to import questions.");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setImportJson(text);
      setImportError(null);
      setImportMessage(`Loaded file: ${file.name}`);
    } catch {
      setImportError("Failed to read the selected file.");
    } finally {
      event.target.value = "";
    }
  }

  function resetToScreen(screen: Exclude<Screen, "quiz">) {
    setActiveScreen(screen);
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

function NavButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-slate-100 text-slate-900" : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-slate-100 text-slate-900"
          : "border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

function StatBlock({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-800/90 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
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

function normalizeImportPayload(parsed: unknown): { questions: unknown[] } {
  if (Array.isArray(parsed)) {
    return { questions: parsed };
  }

  if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { questions?: unknown[] }).questions)) {
    return { questions: (parsed as { questions: unknown[] }).questions };
  }

  throw new Error("Import JSON must be an array of questions or an object with a questions array.");
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatModeLabel(mode: string) {
  return mode === "difficulty" ? "Increase Difficulty" : "Mock Interview";
}

function getDifficultyBadgeClass(difficulty: string) {
  if (difficulty === "easy") {
    return "bg-emerald-500/15 text-emerald-300";
  }
  if (difficulty === "medium") {
    return "bg-amber-500/15 text-amber-300";
  }
  return "bg-red-500/15 text-red-300";
}

function getTopicPercentClass(percentage: number) {
  if (percentage >= 80) {
    return "text-emerald-400";
  }
  if (percentage >= 60) {
    return "text-blue-400";
  }
  if (percentage >= 40) {
    return "text-amber-400";
  }
  return "text-red-400";
}

function getRunScoreClass(correctAnswers: number, totalQuestions: number) {
  const percent = getScorePercent(correctAnswers, totalQuestions);
  if (percent >= 80) {
    return "bg-emerald-500/15 text-emerald-300";
  }
  if (percent >= 60) {
    return "bg-blue-500/15 text-blue-300";
  }
  return "bg-red-500/15 text-red-300";
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

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not finished";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
