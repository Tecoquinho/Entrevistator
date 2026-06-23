package com.entrevistator.dto;

import java.util.List;

public record QuizSessionResponseDTO(
        Long runId,
        List<QuestionResponseDTO> questions
) {
}
