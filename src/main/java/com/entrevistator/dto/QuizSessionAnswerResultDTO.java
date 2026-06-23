package com.entrevistator.dto;

public record QuizSessionAnswerResultDTO(
        Long questionId,
        boolean correct,
        String explanation
) {
}
