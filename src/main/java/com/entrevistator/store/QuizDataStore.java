package com.entrevistator.store;

import com.entrevistator.entity.Question;
import com.entrevistator.entity.QuizRun;
import com.entrevistator.entity.UserAnswer;

import java.util.List;

public interface QuizDataStore {

    List<Question> getQuestions();

    List<Question> saveQuestions(List<Question> questions);

    UserAnswer saveUserAnswer(UserAnswer userAnswer);

    List<UserAnswer> getAnswers();

    QuizRun saveRun(QuizRun quizRun);

    List<QuizRun> getRuns();
}
