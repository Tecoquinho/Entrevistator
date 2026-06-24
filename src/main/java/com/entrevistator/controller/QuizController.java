package com.entrevistator.controller;

import com.entrevistator.dto.AnswerRequest;
import com.entrevistator.dto.AnswerResponse;
import com.entrevistator.dto.QuestionImportRequestDTO;
import com.entrevistator.dto.QuestionImportResponseDTO;
import com.entrevistator.dto.QuizSessionResponseDTO;
import com.entrevistator.dto.QuizSessionSubmitRequestDTO;
import com.entrevistator.dto.QuizSessionSubmitResponseDTO;
import com.entrevistator.dto.QuestionResponseDTO;
import com.entrevistator.service.QuizService;
import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class QuizController {

    private final QuizService quizService;

    public QuizController(QuizService quizService) {
        this.quizService = quizService;
    }

    @GetMapping("/questions/next")
    public QuestionResponseDTO getNextQuestion() {
        return quizService.getNextQuestion();
    }

    @GetMapping("/quiz/session")
    public QuizSessionResponseDTO getQuizSession(@RequestParam(defaultValue = "mock") String mode) {
        return quizService.getQuizSession(mode);
    }

    @PostMapping("/quiz/session/submit")
    public QuizSessionSubmitResponseDTO submitQuizSession(@Valid @RequestBody QuizSessionSubmitRequestDTO request) {
        return quizService.submitQuizSession(request);
    }

    @PostMapping("/answers")
    public AnswerResponse submitAnswer(@Valid @RequestBody AnswerRequest request) {
        return quizService.validateAndSaveAnswer(request);
    }

    @PostMapping("/questions/import")
    public QuestionImportResponseDTO importQuestions(@Valid @RequestBody QuestionImportRequestDTO request) {
        return quizService.importQuestions(request);
    }
}
