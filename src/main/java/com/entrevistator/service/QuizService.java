package com.entrevistator.service;

import com.entrevistator.dto.AnalyticsSummaryDTO;
import com.entrevistator.dto.AnswerRequest;
import com.entrevistator.dto.AnswerResponse;
import com.entrevistator.dto.ExportResultsDTO;
import com.entrevistator.dto.ExportRunAnswerDTO;
import com.entrevistator.dto.ExportRunDTO;
import com.entrevistator.dto.ProgressAnalyticsDTO;
import com.entrevistator.dto.QuestionImportItemDTO;
import com.entrevistator.dto.QuestionImportRequestDTO;
import com.entrevistator.dto.QuestionImportResponseDTO;
import com.entrevistator.dto.QuestionResponseDTO;
import com.entrevistator.dto.QuizSessionAnswerResultDTO;
import com.entrevistator.dto.QuizSessionResponseDTO;
import com.entrevistator.dto.QuizSessionSubmitRequestDTO;
import com.entrevistator.dto.QuizSessionSubmitResponseDTO;
import com.entrevistator.dto.RunSummaryDTO;
import com.entrevistator.dto.TopicAnalyticsDTO;
import com.entrevistator.entity.Question;
import com.entrevistator.entity.QuizRun;
import com.entrevistator.entity.QuizRunAnswer;
import com.entrevistator.entity.UserAnswer;
import com.entrevistator.store.QuizDataStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Service
public class QuizService {

    private static final Logger log = LoggerFactory.getLogger(QuizService.class);

    private static final int SESSION_SIZE = 5;
    private static final long MAX_RUNS = 50;

    private final QuizDataStore quizDataStore;

    public QuizService(QuizDataStore quizDataStore) {
        this.quizDataStore = quizDataStore;
    }

    public QuestionResponseDTO getNextQuestion() {
        List<Question> allQuestions = quizDataStore.getQuestions();
        if (allQuestions.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No questions available");
        }

        List<UserAnswer> recentAnswers = getRecentAnswers();
        Long lastAnsweredQuestionId = recentAnswers.isEmpty() ? null : recentAnswers.getFirst().getQuestionId();

        Question question = findPrioritizedQuestion(allQuestions, recentAnswers, lastAnsweredQuestionId)
                .orElseGet(() -> getRandomQuestion(allQuestions, lastAnsweredQuestionId));

        return toQuestionResponseDTO(question);
    }

    public QuizSessionResponseDTO getQuizSession(String mode) {
        try {
            assertRunLimitNotReached();

            List<Question> allQuestions = quizDataStore.getQuestions();
            log.info("Building quiz session with {} questions loaded", allQuestions.size());
            if (allQuestions.isEmpty()) {
                log.warn("Quiz session requested but no questions are available");
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No questions available");
            }

            List<UserAnswer> recentAnswers = getRecentAnswers();
            int sessionSize = Math.min(SESSION_SIZE, allQuestions.size());
            String normalizedMode = normalizeMode(mode);
            List<Question> sessionQuestions = buildSessionQuestions(allQuestions, recentAnswers, sessionSize, normalizedMode);
            QuizRun quizRun = createQuizRun(sessionQuestions.size(), normalizedMode);

            List<QuestionResponseDTO> questions = sessionQuestions.stream()
                    .map(this::toQuestionResponseDTO)
                    .toList();

            return new QuizSessionResponseDTO(quizRun.getId(), normalizedMode, questions);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (IllegalStateException exception) {
            log.error("Failed to create quiz session because the questions source is invalid", exception);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to load questions");
        } catch (Exception exception) {
            log.error("Unexpected error while creating quiz session", exception);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create quiz session");
        }
    }

    public AnswerResponse validateAndSaveAnswer(AnswerRequest request) {
        EvaluatedAnswer evaluatedAnswer = request.runId() == null
                ? evaluateAndSaveAnswer(request.questionId(), request.selectedAnswer())
                : evaluateAndSaveAnswer(getQuizRunForAnswering(request.runId()), request.questionId(), request.selectedAnswer());
        return new AnswerResponse(evaluatedAnswer.correct(), evaluatedAnswer.question().getExplanation());
    }

    public QuizSessionSubmitResponseDTO submitQuizSession(QuizSessionSubmitRequestDTO request) {
        QuizRun quizRun = getQuizRunById(request.runId());
        if (!isRunCompleted(quizRun)) {
            syncSubmittedAnswers(quizRun, request);
            markRunCompleted(quizRun);
            quizDataStore.saveRun(quizRun);
        }

        List<QuizSessionAnswerResultDTO> results = quizRun.getAnswers().stream()
                .map(this::toSessionAnswerResult)
                .toList();
        return new QuizSessionSubmitResponseDTO(
                quizRun.getTotalQuestions() == null ? results.size() : quizRun.getTotalQuestions(),
                quizRun.getCorrectAnswers() == null ? 0 : quizRun.getCorrectAnswers(),
                results
        );
    }

    public List<TopicAnalyticsDTO> getTopicAnalytics() {
        return buildTopicAnalytics().stream()
                .sorted(Comparator.comparing(TopicAnalyticsDTO::topic))
                .toList();
    }

    public List<TopicAnalyticsDTO> getTopicGaps() {
        List<TopicAnalyticsDTO> analytics = buildTopicAnalytics();
        if (analytics.isEmpty()) {
            return List.of();
        }

        double lowestPercentage = analytics.stream()
                .mapToDouble(TopicAnalyticsDTO::percentage)
                .min()
                .orElse(0.0);

        return analytics.stream()
                .filter(topicAnalytics -> Double.compare(topicAnalytics.percentage(), lowestPercentage) == 0)
                .sorted(Comparator.comparing(TopicAnalyticsDTO::topic))
                .toList();
    }

    public List<ProgressAnalyticsDTO> getProgressAnalytics() {
        return getCompletedRunAnswers().stream()
                .collect(Collectors.groupingBy(this::toProgressGroup))
                .entrySet().stream()
                .map(entry -> toProgressAnalytics(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(ProgressAnalyticsDTO::date)
                        .thenComparing(ProgressAnalyticsDTO::topic))
                .toList();
    }

    public AnalyticsSummaryDTO getAnalyticsSummary() {
        List<QuizRun> allRuns = getStoredRuns();
        List<QuizRun> completedRuns = getCompletedRunsInternal(allRuns);
        long totalSessions = allRuns.size();
        long completedSessions = completedRuns.size();
        double completionRate = totalSessions == 0 ? 0.0 : (completedSessions * 100.0) / totalSessions;

        RunSummaryDTO lastSessionResult = completedRuns.stream()
                .max(Comparator.comparing(this::getRunFinishedAtSafe))
                .map(this::toRunSummary)
                .orElse(null);

        return new AnalyticsSummaryDTO(completionRate, totalSessions, completedSessions, lastSessionResult);
    }

    public List<RunSummaryDTO> getCompletedRuns() {
        return getCompletedRunsInternal(getStoredRuns()).stream()
                .sorted(Comparator.comparing(this::getRunFinishedAtSafe).reversed())
                .map(this::toRunSummary)
                .toList();
    }

    public ExportResultsDTO exportResults() {
        List<QuizRun> recentRuns = getStoredRuns().stream()
                .sorted(Comparator.comparing(this::getRunStartedAtSafe).reversed())
                .limit(10)
                .toList();

        return new ExportResultsDTO(
                LocalDateTime.now(),
                getAnalyticsSummary(),
                recentRuns.stream().map(this::toExportRun).toList(),
                getTopicAnalytics(),
                getTopicGaps()
        );
    }

    public QuestionImportResponseDTO importQuestions(QuestionImportRequestDTO request) {
        List<Question> existingQuestions = new ArrayList<>(quizDataStore.getQuestions());
        Map<Long, Question> questionsById = existingQuestions.stream()
                .collect(Collectors.toMap(Question::getId, question -> question, (left, right) -> right, LinkedHashMap::new));

        long nextId = existingQuestions.stream()
                .map(Question::getId)
                .filter(id -> id != null)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L) + 1;

        int importedCount = 0;
        int updatedCount = 0;
        int ignoredCount = 0;

        for (QuestionImportItemDTO item : request.questions()) {
            Question normalizedQuestion = normalizeImportedQuestion(item);
            if (normalizedQuestion == null) {
                ignoredCount++;
                continue;
            }

            Long importedId = normalizedQuestion.getId();
            boolean hasExplicitId = importedId != null;
            boolean updatesExisting = hasExplicitId && questionsById.containsKey(importedId);

            if (!hasExplicitId) {
                normalizedQuestion.setId(nextId++);
            } else if (!updatesExisting && importedId >= nextId) {
                nextId = importedId + 1;
            }

            questionsById.put(normalizedQuestion.getId(), normalizedQuestion);
            if (updatesExisting) {
                updatedCount++;
            } else {
                importedCount++;
            }
        }

        List<Question> mergedQuestions = questionsById.values().stream()
                .sorted(Comparator.comparing(Question::getId))
                .toList();
        quizDataStore.saveQuestions(mergedQuestions);

        return new QuestionImportResponseDTO(importedCount, updatedCount, ignoredCount, mergedQuestions.size());
    }

    private List<Question> buildSessionQuestions(List<Question> allQuestions, List<UserAnswer> recentAnswers, int sessionSize, String mode) {
        if ("difficulty".equals(mode)) {
            return buildDifficultySessionQuestions(allQuestions, recentAnswers, sessionSize);
        }

        return buildMockSessionQuestions(allQuestions, recentAnswers, sessionSize);
    }

    private List<Question> buildMockSessionQuestions(List<Question> allQuestions, List<UserAnswer> recentAnswers, int sessionSize) {
        Set<Long> selectedQuestionIds = new LinkedHashSet<>();
        List<Question> sessionQuestions = new ArrayList<>();

        addPrioritizedQuestions(sessionQuestions, selectedQuestionIds, allQuestions, recentAnswers, sessionSize);
        addRandomQuestions(sessionQuestions, selectedQuestionIds, allQuestions, sessionSize);

        return sessionQuestions;
    }

    private List<Question> buildDifficultySessionQuestions(List<Question> allQuestions, List<UserAnswer> recentAnswers, int sessionSize) {
        Set<Long> selectedQuestionIds = new LinkedHashSet<>();
        List<Question> sessionQuestions = new ArrayList<>();

        List<Question> prioritized = allQuestions.stream()
                .collect(Collectors.toCollection(ArrayList::new));
        Collections.shuffle(prioritized);
        prioritized.sort(Comparator.comparingInt(this::getDifficultyWeight).reversed());

        addPrioritizedQuestions(sessionQuestions, selectedQuestionIds, prioritized, recentAnswers, sessionSize);

        for (Question question : prioritized) {
            if (sessionQuestions.size() >= sessionSize) {
                break;
            }

            if (selectedQuestionIds.add(question.getId())) {
                sessionQuestions.add(question);
            }
        }

        return sessionQuestions;
    }

    private void addPrioritizedQuestions(
            List<Question> sessionQuestions,
            Set<Long> selectedQuestionIds,
            List<Question> allQuestions,
            List<UserAnswer> recentAnswers,
            int sessionSize
    ) {
        Set<Long> incorrectQuestionIds = recentAnswers.stream()
                .filter(answer -> Boolean.FALSE.equals(answer.getIsCorrect()))
                .map(UserAnswer::getQuestionId)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        if (incorrectQuestionIds.isEmpty()) {
            return;
        }

        List<Question> prioritizedQuestions = allQuestions.stream()
                .filter(question -> incorrectQuestionIds.contains(question.getId()))
                .collect(Collectors.toCollection(ArrayList::new));

        Collections.shuffle(prioritizedQuestions);

        for (Question question : prioritizedQuestions) {
            if (sessionQuestions.size() >= sessionSize) {
                return;
            }

            if (selectedQuestionIds.add(question.getId())) {
                sessionQuestions.add(question);
            }
        }
    }

    private void addRandomQuestions(
            List<Question> sessionQuestions,
            Set<Long> selectedQuestionIds,
            List<Question> allQuestions,
            int sessionSize
    ) {
        List<Question> randomCandidates = allQuestions.stream()
                .filter(question -> !selectedQuestionIds.contains(question.getId()))
                .collect(Collectors.toCollection(ArrayList::new));

        Collections.shuffle(randomCandidates);

        for (Question question : randomCandidates) {
            if (sessionQuestions.size() >= sessionSize) {
                return;
            }

            if (selectedQuestionIds.add(question.getId())) {
                sessionQuestions.add(question);
            }
        }
    }

    private Optional<Question> findPrioritizedQuestion(
            List<Question> allQuestions,
            List<UserAnswer> recentAnswers,
            Long lastAnsweredQuestionId
    ) {
        Set<Long> incorrectQuestionIds = recentAnswers.stream()
                .filter(answer -> Boolean.FALSE.equals(answer.getIsCorrect()))
                .map(UserAnswer::getQuestionId)
                .filter(questionId -> !questionId.equals(lastAnsweredQuestionId))
                .collect(Collectors.toSet());

        if (incorrectQuestionIds.isEmpty()) {
            return Optional.empty();
        }

        List<Question> prioritizedQuestions = allQuestions.stream()
                .filter(question -> incorrectQuestionIds.contains(question.getId()))
                .toList();
        if (prioritizedQuestions.isEmpty()) {
            return Optional.empty();
        }

        return Optional.of(prioritizedQuestions.get(ThreadLocalRandom.current().nextInt(prioritizedQuestions.size())));
    }

    private Question getRandomQuestion(List<Question> allQuestions, Long excludedQuestionId) {
        if (allQuestions.size() == 1) {
            return allQuestions.getFirst();
        }

        for (int attempts = 0; attempts < 5; attempts++) {
            Question question = getRandomQuestion(allQuestions);
            if (!question.getId().equals(excludedQuestionId)) {
                return question;
            }
        }

        return allQuestions.stream()
                .filter(question -> !question.getId().equals(excludedQuestionId))
                .findAny()
                .orElseGet(() -> getRandomQuestion(allQuestions));
    }

    private Question getRandomQuestion(List<Question> allQuestions) {
        int randomIndex = ThreadLocalRandom.current().nextInt(allQuestions.size());
        return allQuestions.get(randomIndex);
    }

    private QuestionResponseDTO toQuestionResponseDTO(Question question) {
        return new QuestionResponseDTO(
                question.getId(),
                question.getTopic(),
                question.getDifficulty(),
                question.getQuestionText(),
                question.getOptions()
        );
    }

    private QuizSessionAnswerResultDTO toSessionAnswerResult(EvaluatedAnswer evaluatedAnswer) {
        return new QuizSessionAnswerResultDTO(
                evaluatedAnswer.question().getId(),
                evaluatedAnswer.correct(),
                evaluatedAnswer.question().getExplanation()
        );
    }

    private QuizSessionAnswerResultDTO toSessionAnswerResult(QuizRunAnswer runAnswer) {
        Question question = getQuestionById(runAnswer.getQuestionId());
        return new QuizSessionAnswerResultDTO(
                runAnswer.getQuestionId(),
                Boolean.TRUE.equals(runAnswer.getIsCorrect()),
                question.getExplanation()
        );
    }

    private EvaluatedAnswer evaluateAndSaveAnswer(Long questionId, String selectedAnswer) {
        Question question = getQuestionById(questionId);

        boolean isCorrect = question.getCorrectAnswer().equals(selectedAnswer);

        UserAnswer userAnswer = new UserAnswer();
        userAnswer.setQuestionId(question.getId());
        userAnswer.setSelectedAnswer(selectedAnswer);
        userAnswer.setIsCorrect(isCorrect);
        userAnswer.setAnsweredAt(LocalDateTime.now());
        quizDataStore.saveUserAnswer(userAnswer);

        return new EvaluatedAnswer(question, isCorrect);
    }

    private EvaluatedAnswer evaluateAndSaveAnswer(QuizRun quizRun, Long questionId, String selectedAnswer) {
        if (isRunCompleted(quizRun)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quiz run is already finished");
        }

        EvaluatedAnswer evaluatedAnswer = evaluateAndSaveAnswer(questionId, selectedAnswer);
        upsertRunAnswer(quizRun, evaluatedAnswer, selectedAnswer);
        refreshRunStats(quizRun);
        quizDataStore.saveRun(quizRun);
        return evaluatedAnswer;
    }

    private QuizRun createQuizRun(int totalQuestions, String mode) {
        QuizRun quizRun = new QuizRun();
        quizRun.setStartedAt(LocalDateTime.now());
        quizRun.setTotalQuestions(totalQuestions);
        quizRun.setAnsweredQuestions(0);
        quizRun.setCorrectAnswers(0);
        quizRun.setCompleted(false);
        quizRun.setMode(mode);
        return quizDataStore.saveRun(quizRun);
    }

    private QuizRun getQuizRunById(Long runId) {
        QuizRun quizRun = quizDataStore.getRuns().stream()
                .filter(existingRun -> existingRun.getId().equals(runId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Quiz run not found"));
        refreshRunStats(quizRun);
        return quizRun;
    }

    private QuizRun getQuizRunForAnswering(Long runId) {
        QuizRun quizRun = getQuizRunById(runId);
        if (isRunCompleted(quizRun)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quiz run is already finished");
        }
        return quizRun;
    }

    private void markRunCompleted(QuizRun quizRun) {
        refreshRunStats(quizRun);
        quizRun.setCompleted(true);
        if (quizRun.getFinishedAt() == null) {
            quizRun.setFinishedAt(LocalDateTime.now());
        }
    }

    private void assertRunLimitNotReached() {
        if (quizDataStore.getRuns().size() >= MAX_RUNS) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Maximum number of quiz runs reached");
        }
    }

    private List<TopicAnalyticsDTO> buildTopicAnalytics() {
        Map<String, List<QuizRunAnswer>> answersByTopic = getCompletedRunAnswers().stream()
                .collect(Collectors.groupingBy(QuizRunAnswer::getTopic));

        return answersByTopic.entrySet().stream()
                .map(entry -> toTopicAnalytics(entry.getKey(), entry.getValue()))
                .toList();
    }

    private TopicAnalyticsDTO toTopicAnalytics(String topic, List<QuizRunAnswer> answers) {
        long correctAnswers = answers.stream()
                .filter(answer -> Boolean.TRUE.equals(answer.getIsCorrect()))
                .count();

        double percentage = answers.isEmpty() ? 0.0 : (correctAnswers * 100.0) / answers.size();
        return new TopicAnalyticsDTO(topic, percentage);
    }

    private ProgressGroupKey toProgressGroup(QuizRunAnswer answer) {
        return new ProgressGroupKey(answer.getAnsweredAt().toLocalDate(), answer.getTopic());
    }

    private ProgressAnalyticsDTO toProgressAnalytics(ProgressGroupKey key, List<QuizRunAnswer> answers) {
        long correctAnswers = answers.stream()
                .filter(answer -> Boolean.TRUE.equals(answer.getIsCorrect()))
                .count();

        double accuracy = answers.isEmpty() ? 0.0 : (correctAnswers * 100.0) / answers.size();
        return new ProgressAnalyticsDTO(key.date(), key.topic(), accuracy);
    }

    private List<UserAnswer> getRecentAnswers() {
        return quizDataStore.getAnswers().stream()
                .sorted(Comparator.comparing(UserAnswer::getAnsweredAt).reversed()
                        .thenComparing(answer -> answer.getId() == null ? 0L : answer.getId(), Comparator.reverseOrder()))
                .limit(10)
                .toList();
    }

    private List<QuizRunAnswer> getCompletedRunAnswers() {
        return getCompletedRunsInternal(getStoredRuns()).stream()
                .map(QuizRun::getAnswers)
                .filter(answers -> answers != null)
                .flatMap(List::stream)
                .toList();
    }

    private QuizRunAnswer createRunAnswer(Long runId, EvaluatedAnswer evaluatedAnswer, String selectedAnswer) {
        QuizRunAnswer quizRunAnswer = new QuizRunAnswer();
        quizRunAnswer.setRunId(runId);
        quizRunAnswer.setQuestionId(evaluatedAnswer.question().getId());
        quizRunAnswer.setSelectedAnswer(selectedAnswer);
        quizRunAnswer.setIsCorrect(evaluatedAnswer.correct());
        quizRunAnswer.setTopic(evaluatedAnswer.question().getTopic());
        quizRunAnswer.setAnsweredAt(LocalDateTime.now());
        return quizRunAnswer;
    }

    private void upsertRunAnswer(QuizRun quizRun, EvaluatedAnswer evaluatedAnswer, String selectedAnswer) {
        QuizRunAnswer existingAnswer = quizRun.getAnswers().stream()
                .filter(answer -> answer.getQuestionId().equals(evaluatedAnswer.question().getId()))
                .findFirst()
                .orElse(null);

        if (existingAnswer != null) {
            existingAnswer.setSelectedAnswer(selectedAnswer);
            existingAnswer.setIsCorrect(evaluatedAnswer.correct());
            existingAnswer.setTopic(evaluatedAnswer.question().getTopic());
            existingAnswer.setAnsweredAt(LocalDateTime.now());
            return;
        }

        quizRun.getAnswers().add(createRunAnswer(quizRun.getId(), evaluatedAnswer, selectedAnswer));
    }

    private void syncSubmittedAnswers(QuizRun quizRun, QuizSessionSubmitRequestDTO request) {
        for (var answer : request.answers()) {
            evaluateAndSaveAnswer(quizRun, answer.questionId(), answer.selectedAnswer());
        }
    }

    private List<QuizRun> getStoredRuns() {
        List<QuizRun> runs = quizDataStore.getRuns().stream()
                .peek(this::refreshRunStats)
                .toList();
        return new ArrayList<>(runs);
    }

    private List<QuizRun> getCompletedRunsInternal(List<QuizRun> runs) {
        return runs.stream()
                .filter(this::isRunCompleted)
                .toList();
    }

    private void refreshRunStats(QuizRun quizRun) {
        List<QuizRunAnswer> answers = quizRun.getAnswers() == null ? List.of() : quizRun.getAnswers();
        int answeredQuestions = answers.size();
        int correctAnswers = (int) answers.stream()
                .filter(answer -> Boolean.TRUE.equals(answer.getIsCorrect()))
                .count();

        quizRun.setAnsweredQuestions(answeredQuestions);
        quizRun.setCorrectAnswers(correctAnswers);

        int totalQuestions = quizRun.getTotalQuestions() == null ? answeredQuestions : quizRun.getTotalQuestions();
        quizRun.setTotalQuestions(totalQuestions);

        boolean completed = totalQuestions > 0 && answeredQuestions >= totalQuestions;
        if (completed) {
            quizRun.setCompleted(true);
            if (quizRun.getFinishedAt() == null) {
                quizRun.setFinishedAt(answers.stream()
                        .map(QuizRunAnswer::getAnsweredAt)
                        .filter(answeredAt -> answeredAt != null)
                        .max(LocalDateTime::compareTo)
                        .orElse(LocalDateTime.now()));
            }
        } else if (!Boolean.TRUE.equals(quizRun.getCompleted())) {
            quizRun.setCompleted(false);
        }
    }

    private boolean isRunCompleted(QuizRun quizRun) {
        return Boolean.TRUE.equals(quizRun.getCompleted())
                || (quizRun.getCompleted() == null && quizRun.getFinishedAt() != null);
    }

    private LocalDateTime getRunFinishedAtSafe(QuizRun quizRun) {
        return quizRun.getFinishedAt() != null ? quizRun.getFinishedAt() : getRunStartedAtSafe(quizRun);
    }

    private LocalDateTime getRunStartedAtSafe(QuizRun quizRun) {
        return quizRun.getStartedAt() != null ? quizRun.getStartedAt() : LocalDateTime.MIN;
    }

    private RunSummaryDTO toRunSummary(QuizRun quizRun) {
        return new RunSummaryDTO(
                quizRun.getId(),
                quizRun.getMode() == null ? "mock" : quizRun.getMode(),
                quizRun.getStartedAt(),
                quizRun.getFinishedAt(),
                quizRun.getTotalQuestions() == null ? 0 : quizRun.getTotalQuestions(),
                quizRun.getAnsweredQuestions() == null ? 0 : quizRun.getAnsweredQuestions(),
                quizRun.getCorrectAnswers() == null ? 0 : quizRun.getCorrectAnswers(),
                isRunCompleted(quizRun)
        );
    }

    private ExportRunDTO toExportRun(QuizRun quizRun) {
        List<ExportRunAnswerDTO> answers = (quizRun.getAnswers() == null ? List.<QuizRunAnswer>of() : quizRun.getAnswers()).stream()
                .sorted(Comparator.comparing(QuizRunAnswer::getAnsweredAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(answer -> new ExportRunAnswerDTO(
                        answer.getQuestionId(),
                        answer.getTopic(),
                        answer.getSelectedAnswer(),
                        Boolean.TRUE.equals(answer.getIsCorrect()),
                        answer.getAnsweredAt()
                ))
                .toList();

        return new ExportRunDTO(
                quizRun.getId(),
                quizRun.getMode() == null ? "mock" : quizRun.getMode(),
                quizRun.getStartedAt(),
                quizRun.getFinishedAt(),
                quizRun.getTotalQuestions() == null ? 0 : quizRun.getTotalQuestions(),
                quizRun.getAnsweredQuestions() == null ? 0 : quizRun.getAnsweredQuestions(),
                quizRun.getCorrectAnswers() == null ? 0 : quizRun.getCorrectAnswers(),
                isRunCompleted(quizRun),
                answers
        );
    }

    private Question normalizeImportedQuestion(QuestionImportItemDTO item) {
        if (item == null) {
            return null;
        }

        String questionText = firstNonBlank(item.questionText(), item.question());
        List<String> options = item.options() == null ? List.of() : item.options().stream()
                .filter(option -> option != null && !option.isBlank())
                .map(String::trim)
                .toList();

        if (isBlank(questionText)
                || isBlank(item.topic())
                || options.size() < 2
                || isBlank(item.correctAnswer())
                || isBlank(item.explanation())
                || options.stream().noneMatch(option -> option.equals(item.correctAnswer()))) {
            return null;
        }

        Question question = new Question();
        question.setId(item.id());
        question.setTopic(item.topic().trim());
        question.setDifficulty(isBlank(item.difficulty()) ? "medium" : item.difficulty().trim());
        question.setQuestionText(questionText.trim());
        question.setOptions(options);
        question.setCorrectAnswer(item.correctAnswer().trim());
        question.setExplanation(item.explanation().trim());
        return question;
    }

    private String normalizeMode(String mode) {
        return "difficulty".equalsIgnoreCase(mode) ? "difficulty" : "mock";
    }

    private int getDifficultyWeight(Question question) {
        if (question.getDifficulty() == null) {
            return 1;
        }

        return switch (question.getDifficulty().toLowerCase()) {
            case "hard" -> 3;
            case "medium" -> 2;
            default -> 1;
        };
    }

    private String firstNonBlank(String primary, String fallback) {
        return !isBlank(primary) ? primary : fallback;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private Question getQuestionById(Long questionId) {
        return quizDataStore.getQuestions().stream()
                .filter(existingQuestion -> existingQuestion.getId().equals(questionId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));
    }

    private record EvaluatedAnswer(Question question, boolean correct) {
    }

    private record ProgressGroupKey(LocalDate date, String topic) {
    }
}
