package com.entrevistator.service;

import com.entrevistator.dto.AnswerRequest;
import com.entrevistator.dto.AnswerResponse;
import com.entrevistator.dto.ProgressAnalyticsDTO;
import com.entrevistator.dto.QuestionResponseDTO;
import com.entrevistator.dto.QuizSessionAnswerResultDTO;
import com.entrevistator.dto.QuizSessionResponseDTO;
import com.entrevistator.dto.QuizSessionSubmitRequestDTO;
import com.entrevistator.dto.QuizSessionSubmitResponseDTO;
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

    public QuizSessionResponseDTO getQuizSession() {
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
            List<Question> sessionQuestions = buildSessionQuestions(allQuestions, recentAnswers, sessionSize);
            QuizRun quizRun = createQuizRun(sessionQuestions.size());

            List<QuestionResponseDTO> questions = sessionQuestions.stream()
                    .map(this::toQuestionResponseDTO)
                    .toList();

            return new QuizSessionResponseDTO(quizRun.getId(), questions);
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
                : evaluateAndSaveAnswer(getQuizRunForSubmission(request.runId()), request.questionId(), request.selectedAnswer());
        return new AnswerResponse(evaluatedAnswer.correct(), evaluatedAnswer.question().getExplanation());
    }

    public QuizSessionSubmitResponseDTO submitQuizSession(QuizSessionSubmitRequestDTO request) {
        QuizRun quizRun = getQuizRunForSubmission(request.runId());

        syncSubmittedAnswers(quizRun, request);

        List<QuizSessionAnswerResultDTO> results = quizRun.getAnswers().stream()
                .map(this::toSessionAnswerResult)
                .toList();

        int correctAnswers = (int) results.stream()
                .filter(QuizSessionAnswerResultDTO::correct)
                .count();

        finalizeQuizRun(quizRun, results.size(), correctAnswers);

        return new QuizSessionSubmitResponseDTO(results.size(), correctAnswers, results);
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
        return getAllRunAnswers().stream()
                .collect(Collectors.groupingBy(this::toProgressGroup))
                .entrySet().stream()
                .map(entry -> toProgressAnalytics(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(ProgressAnalyticsDTO::date)
                        .thenComparing(ProgressAnalyticsDTO::topic))
                .toList();
    }

    private List<Question> buildSessionQuestions(List<Question> allQuestions, List<UserAnswer> recentAnswers, int sessionSize) {
        Set<Long> selectedQuestionIds = new LinkedHashSet<>();
        List<Question> sessionQuestions = new ArrayList<>();

        addPrioritizedQuestions(sessionQuestions, selectedQuestionIds, allQuestions, recentAnswers, sessionSize);
        addRandomQuestions(sessionQuestions, selectedQuestionIds, allQuestions, sessionSize);

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
        EvaluatedAnswer evaluatedAnswer = evaluateAndSaveAnswer(questionId, selectedAnswer);
        upsertRunAnswer(quizRun, evaluatedAnswer, selectedAnswer);
        quizDataStore.saveRun(quizRun);
        return evaluatedAnswer;
    }

    private QuizRun createQuizRun(int totalQuestions) {
        QuizRun quizRun = new QuizRun();
        quizRun.setStartedAt(LocalDateTime.now());
        quizRun.setTotalQuestions(totalQuestions);
        quizRun.setCorrectAnswers(0);
        return quizDataStore.saveRun(quizRun);
    }

    private QuizRun getQuizRunForSubmission(Long runId) {
        QuizRun quizRun = quizDataStore.getRuns().stream()
                .filter(existingRun -> existingRun.getId().equals(runId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Quiz run not found"));

        if (quizRun.getFinishedAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quiz run is already finished");
        }

        return quizRun;
    }

    private void finalizeQuizRun(QuizRun quizRun, int totalQuestions, int correctAnswers) {
        quizRun.setFinishedAt(LocalDateTime.now());
        quizRun.setTotalQuestions(totalQuestions);
        quizRun.setCorrectAnswers(correctAnswers);
        quizDataStore.saveRun(quizRun);
    }

    private void assertRunLimitNotReached() {
        if (quizDataStore.getRuns().size() >= MAX_RUNS) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Maximum number of quiz runs reached");
        }
    }

    private List<TopicAnalyticsDTO> buildTopicAnalytics() {
        Map<String, List<QuizRunAnswer>> answersByTopic = getAllRunAnswers().stream()
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

    private List<QuizRunAnswer> getAllRunAnswers() {
        return quizDataStore.getRuns().stream()
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
