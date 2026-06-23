package com.entrevistator.dto;

import java.util.List;

public record QuizSessionSubmitResponseDTO(
        int totalQuestions,
        int correctAnswers,
        List<QuizSessionAnswerResultDTO> results
) {
}
