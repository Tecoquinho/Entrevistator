package com.entrevistator.dto;

import java.util.List;

public record QuizSessionResponseDTO(
        Long runId,
        String mode,
        List<QuestionResponseDTO> questions
) {
}
