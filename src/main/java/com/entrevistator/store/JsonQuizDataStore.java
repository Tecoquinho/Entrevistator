package com.entrevistator.store;

import com.entrevistator.entity.Question;
import com.entrevistator.entity.QuizRun;
import com.entrevistator.entity.QuizRunAnswer;
import com.entrevistator.entity.UserAnswer;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.OptionalLong;

@Component
public class JsonQuizDataStore implements QuizDataStore {

    private static final Logger log = LoggerFactory.getLogger(JsonQuizDataStore.class);

    private final ObjectMapper objectMapper;
    private final Path questionsPath;
    private final Path answersPath;
    private final Path runsPath;

    public JsonQuizDataStore(
            ObjectMapper objectMapper,
            @Value("${quiz.store.questions-path}") String questionsPath,
            @Value("${quiz.store.answers-path}") String answersPath,
            @Value("${quiz.store.runs-path}") String runsPath
    ) {
        this.objectMapper = objectMapper;
        this.questionsPath = Path.of(questionsPath);
        this.answersPath = Path.of(answersPath);
        this.runsPath = Path.of(runsPath);
    }

    @Override
    public synchronized List<Question> getQuestions() {
        return readQuestions();
    }

    @Override
    public synchronized List<Question> saveQuestions(List<Question> questions) {
        List<Question> safeQuestions = questions == null ? List.of() : new ArrayList<>(questions);
        safeQuestions.sort(Comparator.comparing(Question::getId));
        writeJsonFile(questionsPath, safeQuestions);
        return safeQuestions;
    }

    @Override
    public synchronized UserAnswer saveUserAnswer(UserAnswer userAnswer) {
        List<UserAnswer> answers = readAnswers();
        if (userAnswer.getId() == null) {
            userAnswer.setId(nextAnswerId(answers));
        }
        answers.add(userAnswer);
        writeJsonFile(answersPath, answers);
        return userAnswer;
    }

    @Override
    public synchronized List<UserAnswer> getAnswers() {
        return readAnswers();
    }

    @Override
    public synchronized QuizRun saveRun(QuizRun quizRun) {
        List<QuizRun> runs = readRuns();

        if (quizRun.getId() == null) {
            quizRun.setId(nextRunId(runs));
        }

        normalizeRunAnswers(quizRun, runs);

        runs.removeIf(existingRun -> existingRun.getId().equals(quizRun.getId()));
        runs.add(quizRun);
        runs.sort(Comparator.comparing(QuizRun::getId));
        writeJsonFile(runsPath, runs);
        return quizRun;
    }

    @Override
    public synchronized List<QuizRun> getRuns() {
        return readRuns();
    }

    private List<Question> readQuestions() {
        try {
            if (!Files.exists(questionsPath)) {
                log.warn("Questions file not found at {}", questionsPath);
                return List.of();
            }

            try (InputStream inputStream = Files.newInputStream(questionsPath)) {
                JsonNode root = objectMapper.readTree(inputStream);
                if (root == null || !root.isArray()) {
                    log.error("Invalid questions.json format at {}: root node is not an array", questionsPath);
                    throw new IllegalStateException("Invalid questions.json format");
                }

                List<Question> questions = new ArrayList<>();
                long nextId = 1L;

                for (JsonNode node : root) {
                    Question question = toQuestion(node, nextId);
                    if (question == null) {
                        continue;
                    }
                    questions.add(question);
                    nextId = Math.max(nextId, question.getId() + 1);
                }

                return questions;
            }
        } catch (IOException exception) {
            log.error("Failed to parse questions.json at {}", questionsPath, exception);
            throw new IllegalStateException("Failed to read questions.json", exception);
        }
    }

    private List<UserAnswer> readAnswers() {
        JavaType answerListType = objectMapper.getTypeFactory()
                .constructCollectionType(List.class, UserAnswer.class);
        return readWritableJsonFile(answersPath, answerListType);
    }

    private List<QuizRun> readRuns() {
        JavaType runListType = objectMapper.getTypeFactory()
                .constructCollectionType(List.class, QuizRun.class);
        return readWritableJsonFile(runsPath, runListType);
    }

    private <T> List<T> readWritableJsonFile(Path path, JavaType javaType) {
        try {
            ensureWritableFile(path);
            try (InputStream inputStream = Files.newInputStream(path)) {
                return safeList(objectMapper.readValue(inputStream, javaType));
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read JSON file: " + path, exception);
        }
    }

    private void writeJsonFile(Path path, Object content) {
        try {
            ensureWritableFile(path);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), content);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to write JSON file: " + path, exception);
        }
    }

    private void ensureWritableFile(Path path) throws IOException {
        Path parent = path.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        if (!Files.exists(path)) {
            Files.writeString(path, "[]");
        }
    }

    private void normalizeRunAnswers(QuizRun quizRun, List<QuizRun> existingRuns) {
        if (quizRun.getAnswers() == null) {
            quizRun.setAnswers(new ArrayList<>());
            return;
        }

        long nextId = nextRunAnswerId(existingRuns);
        for (QuizRunAnswer answer : quizRun.getAnswers()) {
            if (answer.getId() == null) {
                answer.setId(nextId++);
            }
            answer.setRunId(quizRun.getId());
        }
    }

    private long nextAnswerId(List<UserAnswer> answers) {
        return answers.stream()
                .map(UserAnswer::getId)
                .filter(id -> id != null)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L) + 1;
    }

    private long nextRunId(List<QuizRun> runs) {
        return runs.stream()
                .map(QuizRun::getId)
                .filter(id -> id != null)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L) + 1;
    }

    private long nextRunAnswerId(List<QuizRun> runs) {
        OptionalLong maxId = runs.stream()
                .map(QuizRun::getAnswers)
                .filter(answers -> answers != null)
                .flatMap(List::stream)
                .map(QuizRunAnswer::getId)
                .filter(id -> id != null)
                .mapToLong(Long::longValue)
                .max();
        return maxId.orElse(0L) + 1;
    }

    private List<String> readOptions(JsonNode optionsNode) {
        if (optionsNode == null || !optionsNode.isArray()) {
            return List.of();
        }

        List<String> options = new ArrayList<>();
        for (JsonNode optionNode : optionsNode) {
            options.add(optionNode.asText());
        }
        return options;
    }

    private String readQuestionText(JsonNode node) {
        String questionText = readNullableText(node, "questionText");
        return questionText != null ? questionText : readNullableText(node, "question");
    }

    private String readNullableText(JsonNode node, String fieldName) {
        JsonNode valueNode = node.path(fieldName);
        return valueNode.isMissingNode() || valueNode.isNull() ? null : valueNode.asText();
    }

    private Question toQuestion(JsonNode node, long fallbackId) {
        Question question = new Question();
        question.setId(node.path("id").isIntegralNumber() ? node.path("id").asLong() : fallbackId);
        question.setTopic(readNullableText(node, "topic"));
        question.setDifficulty(readNullableText(node, "difficulty"));
        question.setQuestionText(readQuestionText(node));
        question.setOptions(readOptions(node.path("options")));
        question.setCorrectAnswer(readNullableText(node, "correctAnswer"));
        question.setExplanation(readNullableText(node, "explanation"));

        if (isBlank(question.getQuestionText())) {
            log.warn("Skipping invalid question entry {} because question/questionText is missing", question.getId());
            return null;
        }

        if (question.getOptions().isEmpty()) {
            log.warn("Skipping invalid question entry {} because options is empty", question.getId());
            return null;
        }

        return question;
    }

    private <T> List<T> safeList(List<T> items) {
        return items == null ? List.of() : new ArrayList<>(items);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
